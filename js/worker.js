// ============================================================
// Supabase Chat Pro — Worker de medios (Cloudflare R2)
// Pegar completo en: Workers & Pages → tu Worker → Edit code
// ============================================================
//
// Qué hace:
//   POST /upload/music   (login) sube audio a R2
//   POST /upload/chat    (login) sube imagen/video del chat a R2
//   POST /sign           (login) devuelve URL temporal para reproducir una
//                        canción (solo si RLS de Supabase te deja verla)
//   GET  /file/<key>     reproduce con URL firmada (soporta Range = poder
//                        adelantar/retroceder en el audio)
//   GET  /pub/<key>      archivos del chat (públicos, igual que antes)
//   cron (cada hora)     borra de verdad las canciones que cumplieron las
//                        24h en la papelera y nadie más usa (archivo + fila)
//
// Variables/secretos que debes crear en Settings → Variables and Secrets:
//   SUPABASE_URL          (texto)   https://xftmgzrkqhuzoymvkoqp.supabase.co
//   SUPABASE_ANON_KEY     (texto)   la misma anon key de config.js
//   SUPABASE_SERVICE_KEY  (SECRET)  service_role key (NUNCA en el navegador)
//   SIGNING_SECRET        (SECRET)  cualquier texto largo y aleatorio
//   ALLOWED_ORIGIN        (texto)   https://TU-USUARIO.github.io  (tu sitio,
//                                   sin barra final; varios separados por coma)
//   GUEST_EMAIL           (texto, opcional) chat@tuapp.com — impide subir
//                                   archivos a la sesión compartida de invitado
// Binding R2: Settings → Bindings → R2 bucket → nombre de variable: BUCKET

// ---------- Límites (ajustables) ----------
const MB = 1024 * 1024;
const LIMITS = {
    musicMaxFile: 40 * MB,       // por canción
    musicUserQuota: 500 * MB,    // por usuario, total de música
    chatImageMaxFile: 10 * MB,
    chatVideoMaxFile: 50 * MB,
    chatUserQuota: 300 * MB      // por usuario, total de imágenes/videos del chat
};
const SIGN_TTL_SECONDS = 3600;

const AUDIO_TYPES = {
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
    m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/ogg',
    weba: 'audio/webm'
};

// ---------- Utilidades ----------
function corsHeaders(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim()).filter(Boolean);
    const ok = allowed.includes('*') || allowed.includes(origin);
    const h = {
        'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-File-Name',
        'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
        'Access-Control-Max-Age': '86400'
    };
    if (ok) h['Access-Control-Allow-Origin'] = allowed.includes('*') ? '*' : origin;
    return h;
}

function json(data, status, request, env) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) }
    });
}

function sanitizeName(raw) {
    const name = (raw || 'archivo').trim();
    const dot = name.lastIndexOf('.');
    const ext = dot > -1 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : '';
    const base = (dot > -1 ? name.slice(0, dot) : name)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 80);
    return (base || 'archivo') + ext;
}

function extOf(name) {
    const dot = name.lastIndexOf('.');
    return dot > -1 ? name.slice(dot + 1).toLowerCase() : '';
}

function encodeKeyPath(key) {
    return key.split('/').map(encodeURIComponent).join('/');
}

function safeKey(key, prefix) {
    return typeof key === 'string' && key.startsWith(prefix) && !key.includes('..') && key.length < 400;
}

// Valida el token de Supabase del usuario (devuelve el usuario o null)
async function getUser(request, env) {
    const auth = request.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return null;
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY }
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user && user.id ? user : null;
}

async function usedBytes(env, prefix) {
    let total = 0;
    let cursor;
    do {
        const list = await env.BUCKET.list({ prefix, cursor, limit: 1000 });
        for (const obj of list.objects) total += obj.size;
        cursor = list.truncated ? list.cursor : undefined;
    } while (cursor);
    return total;
}

// ---------- Firma HMAC de URLs temporales ----------
async function hmacKey(env, usage) {
    return crypto.subtle.importKey(
        'raw', new TextEncoder().encode(env.SIGNING_SECRET),
        { name: 'HMAC', hash: 'SHA-256' }, false, usage
    );
}
function toB64Url(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(str) {
    const s = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
}
async function signKey(env, key, exp) {
    const sig = await crypto.subtle.sign('HMAC', await hmacKey(env, ['sign']), new TextEncoder().encode(`${key}.${exp}`));
    return toB64Url(sig);
}
async function verifySig(env, key, exp, sig) {
    try {
        return await crypto.subtle.verify(
            'HMAC', await hmacKey(env, ['verify']), fromB64Url(sig), new TextEncoder().encode(`${key}.${exp}`)
        );
    } catch (e) { return false; }
}

// ---------- Servir un objeto de R2 (con soporte de Range) ----------
async function serveObject(request, env, key, cacheControl) {
    const object = await env.BUCKET.get(key, { range: request.headers });
    if (!object) return new Response('No encontrado', { status: 404, headers: corsHeaders(request, env) });

    const headers = new Headers(corsHeaders(request, env));
    object.writeHttpMetadata(headers);
    headers.set('ETag', object.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', cacheControl);

    let status = 200;
    if (object.range && request.headers.get('Range')) {
        const r = object.range;
        let start, end;
        if (r.suffix !== undefined) { start = object.size - r.suffix; end = object.size - 1; }
        else {
            start = r.offset || 0;
            end = r.length !== undefined ? start + r.length - 1 : object.size - 1;
        }
        headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
        status = 206;
    }
    return new Response(object.body, { status, headers });
}

// ---------- Subidas ----------
async function handleUpload(request, env, kind) {
    const user = await getUser(request, env);
    if (!user) return json({ error: 'Sesión inválida. Inicia sesión de nuevo.' }, 401, request, env);
    if (env.GUEST_EMAIL && user.email === env.GUEST_EMAIL) {
        return json({ error: 'El modo invitado no puede subir archivos.' }, 403, request, env);
    }

    const rawName = decodeURIComponent(request.headers.get('X-File-Name') || 'archivo');
    const safeName = sanitizeName(rawName);
    const size = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (!size) return json({ error: 'Archivo vacío o sin tamaño.' }, 411, request, env);

    let contentType = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    let key, maxFile, quota, prefix;

    if (kind === 'music') {
        if (!contentType.startsWith('audio/')) contentType = AUDIO_TYPES[extOf(safeName)] || '';
        if (!contentType) return json({ error: 'Formato de audio no soportado.' }, 415, request, env);
        maxFile = LIMITS.musicMaxFile;
        quota = LIMITS.musicUserQuota;
        prefix = `music/${user.id}/`;
        key = `${prefix}${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeName}`;
    } else if (kind === 'chat') {
        const isVideo = contentType.startsWith('video/');
        const isImage = contentType.startsWith('image/');
        if (!isVideo && !isImage) return json({ error: 'Solo se permiten imágenes o videos.' }, 415, request, env);
        maxFile = isVideo ? LIMITS.chatVideoMaxFile : LIMITS.chatImageMaxFile;
        quota = LIMITS.chatUserQuota;
        prefix = `chat/${user.id}/`;
        // "video_" en el nombre: chat.js lo usa para decidir si mostrar <video>
        key = `${prefix}${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${isVideo ? 'video_' : 'file_'}${safeName}`;
    } else {
        return json({ error: 'Ruta no válida.' }, 404, request, env);
    }

    if (size > maxFile) {
        return json({ error: `El archivo pesa ${(size / MB).toFixed(1)} MB; el máximo es ${Math.round(maxFile / MB)} MB.` }, 413, request, env);
    }
    const used = await usedBytes(env, prefix);
    if (used + size > quota) {
        return json({ error: `Superarías tu espacio (${Math.round(quota / MB)} MB). Borra algo primero.` }, 413, request, env);
    }

    await env.BUCKET.put(key, request.body, {
        httpMetadata: { contentType },
        customMetadata: { uploader: user.id }
    });

    const result = { key };
    if (kind === 'chat') result.url = `${new URL(request.url).origin}/pub/${encodeKeyPath(key)}`;
    return json(result, 200, request, env);
}

// ---------- URL temporal para reproducir una canción ----------
async function handleSign(request, env) {
    const user = await getUser(request, env);
    if (!user) return json({ error: 'Sesión inválida.' }, 401, request, env);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'JSON inválido.' }, 400, request, env); }
    const key = body && body.key;
    if (!safeKey(key, 'music/')) return json({ error: 'Clave inválida.' }, 400, request, env);

    // Se consulta music_tracks CON el token del usuario: las políticas RLS de
    // Supabase deciden si puede ver esa canción (suya o pública).
    const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/music_tracks?select=id&deleted_at=is.null&limit=1&file_name=eq.${encodeURIComponent(key)}`,
        { headers: { Authorization: request.headers.get('Authorization'), apikey: env.SUPABASE_ANON_KEY } }
    );
    const rows = res.ok ? await res.json() : [];
    if (!rows.length) return json({ error: 'No tienes acceso a esta canción.' }, 403, request, env);

    const exp = Math.floor(Date.now() / 1000) + SIGN_TTL_SECONDS;
    const sig = await signKey(env, key, exp);
    const url = `${new URL(request.url).origin}/file/${encodeKeyPath(key)}?exp=${exp}&sig=${sig}`;
    return json({ url, expiresIn: SIGN_TTL_SECONDS }, 200, request, env);
}

// ---------- Purga de la papelera (cron) ----------
async function sbAdmin(env, path, options = {}) {
    return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
}

async function purgeExpired(env) {
    const nowIso = new Date().toISOString();
    const res = await sbAdmin(env,
        `music_tracks?select=id,file_name&deleted_at=not.is.null&purge_at=lte.${encodeURIComponent(nowIso)}&limit=200`);
    if (!res.ok) { console.error('purge: no se pudo leer la papelera', res.status); return; }
    const rows = await res.json();

    for (const row of rows) {
        // ¿Alguna OTRA fila (activa, o en papelera pero aún sin vencer) usa el
        // mismo archivo? Entonces solo se borra esta fila, el archivo se queda.
        const orFilter = encodeURIComponent(`(deleted_at.is.null,purge_at.gt.${nowIso})`);
        const refRes = await sbAdmin(env,
            `music_tracks?select=id&limit=1&id=neq.${row.id}&file_name=eq.${encodeURIComponent(row.file_name)}&or=${orFilter}`);
        const refs = refRes.ok ? await refRes.json() : [{}]; // ante la duda, no borrar archivo
        const stillUsed = refs.length > 0;

        if (!stillUsed && row.file_name.startsWith('music/')) {
            await env.BUCKET.delete(row.file_name);
        }
        await sbAdmin(env, `music_tracks?id=eq.${row.id}`, { method: 'DELETE' });
    }
}

// ---------- Entrada ----------
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(request, env) });
        }

        try {
            if (request.method === 'POST' && path === '/upload/music') return await handleUpload(request, env, 'music');
            if (request.method === 'POST' && path === '/upload/chat') return await handleUpload(request, env, 'chat');
            if (request.method === 'POST' && path === '/sign') return await handleSign(request, env);

            if (request.method === 'GET' && path.startsWith('/file/')) {
                const key = decodeURIComponent(path.slice('/file/'.length));
                const exp = parseInt(url.searchParams.get('exp') || '0', 10);
                const sig = url.searchParams.get('sig') || '';
                if (!safeKey(key, 'music/') || !exp || exp < Date.now() / 1000 || !(await verifySig(env, key, exp, sig))) {
                    return new Response('Enlace vencido o inválido', { status: 403, headers: corsHeaders(request, env) });
                }
                return await serveObject(request, env, key, 'private, max-age=3000');
            }

            if (request.method === 'GET' && path.startsWith('/pub/')) {
                const key = decodeURIComponent(path.slice('/pub/'.length));
                if (!safeKey(key, 'chat/')) return new Response('No encontrado', { status: 404, headers: corsHeaders(request, env) });
                return await serveObject(request, env, key, 'public, max-age=31536000, immutable');
            }

            return new Response('Supabase Chat Pro — Media Worker', { status: 200 });
        } catch (err) {
            console.error(err);
            return json({ error: 'Error interno del servidor.' }, 500, request, env);
        }
    },

    async scheduled(event, env, ctx) {
        ctx.waitUntil(purgeExpired(env));
    }
};
