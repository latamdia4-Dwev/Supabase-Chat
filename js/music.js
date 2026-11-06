// js/music.js
// Modos de música:
// 1) Radio en vivo, vía Radio Browser (gratis, sin API key). Docs: https://api.radio-browser.info
// 2) Música compartida: canciones que cualquier usuario marcó como públicas
//    (🌐) en "Mi música", visibles para todo el chat.
// 3) Mi música: tus propias canciones subidas (privadas por defecto).

// ── TOAST NOTIFICATIONS ────────────────────────────────────────────────────
// Non-blocking flash messages that auto-dismiss. Max 3 visible at once;
// older ones are removed when the limit is exceeded.
const TOAST_MAX   = 3;
const TOAST_MS    = 3800; // auto-dismiss after this many ms
let   _toastWrap  = null;

function getToastWrap() {
    if (_toastWrap) return _toastWrap;
    _toastWrap = document.createElement('div');
    _toastWrap.id = 'musicToastWrap';
    _toastWrap.style.cssText = [
        'position:fixed',
        'bottom:80px',
        'left:50%',
        'transform:translateX(-50%)',
        'z-index:19999',
        'display:flex',
        'flex-direction:column',
        'align-items:center',
        'gap:6px',
        'pointer-events:none',
        'width:320px',
        'max-width:92vw',
    ].join(';');
    document.body.appendChild(_toastWrap);
    return _toastWrap;
}

function showToast(msg, type) {
    // type: 'error' | 'ok' | 'info' | 'warn'
    const wrap = getToastWrap();

    // Trim oldest if at limit
    while (wrap.children.length >= TOAST_MAX) wrap.removeChild(wrap.firstChild);

    const toast = document.createElement('div');
    const colors = {
        error: { bg: 'rgba(40,0,0,0.92)', border: '#ff4d4d', icon: '⚠️' },
        ok:    { bg: 'rgba(0,30,20,0.92)', border: '#3ecf8e', icon: '✅' },
        warn:  { bg: 'rgba(40,25,0,0.92)', border: '#f59e0b', icon: '⚡' },
        info:  { bg: 'rgba(15,15,25,0.92)', border: '#666',   icon: 'ℹ️' },
    };
    const c = colors[type] || colors.info;
    toast.style.cssText = [
        'background:' + c.bg,
        'border:1px solid ' + c.border,
        'border-radius:10px',
        'padding:9px 14px',
        'font-size:0.82em',
        'color:#e8e8e8',
        'line-height:1.4',
        'pointer-events:auto',
        'cursor:pointer',
        'max-width:100%',
        'box-sizing:border-box',
        'box-shadow:0 4px 18px rgba(0,0,0,0.55)',
        'animation:toastIn 0.2s ease',
        'word-break:break-word',
    ].join(';');
    toast.innerHTML = '<span style="margin-right:6px">' + c.icon + '</span>' + msg;

    let timer = setTimeout(() => dismissToast(toast), TOAST_MS);
    toast.onclick = () => { clearTimeout(timer); dismissToast(toast); };
    wrap.appendChild(toast);
}

function dismissToast(toast) {
    toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    toast.style.opacity    = '0';
    toast.style.transform  = 'translateY(6px)';
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 260);
}

const RADIO_API = 'https://de1.api.radio-browser.info/json/stations/search';

// ══════════════════════════════════════════════════════════════════════
// OFFLINE AUDIO CACHE — IndexedDB
// Stores audio files as Blobs keyed by track.id so they survive across
// sessions and play back without internet. Only "Mi musica" tracks are
// cached (signed-URL based); radio streams are live-only by nature.
// ══════════════════════════════════════════════════════════════════════
const AUDIO_CACHE_DB  = 'audioCacheDB';
const AUDIO_CACHE_VER = 1;
const AUDIO_STORE     = 'blobs';

let _audioCacheDb = null;

function openAudioCacheDB() {
    if (_audioCacheDb) return Promise.resolve(_audioCacheDb);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(AUDIO_CACHE_DB, AUDIO_CACHE_VER);
        req.onupgradeneeded = (e) => { e.target.result.createObjectStore(AUDIO_STORE); };
        req.onsuccess  = (e) => { _audioCacheDb = e.target.result; resolve(_audioCacheDb); };
        req.onerror    = () => reject(req.error);
    });
}

async function cacheGet(trackId) {
    const db = await openAudioCacheDB();
    return new Promise((resolve) => {
        const req = db.transaction(AUDIO_STORE, 'readonly').objectStore(AUDIO_STORE).get(trackId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror   = () => resolve(null);
    });
}

async function cachePut(trackId, blob) {
    const db = await openAudioCacheDB();
    return new Promise((resolve, reject) => {
        const req = db.transaction(AUDIO_STORE, 'readwrite').objectStore(AUDIO_STORE).put(blob, trackId);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
    });
}

async function cacheDelete(trackId) {
    const db = await openAudioCacheDB();
    return new Promise((resolve) => {
        const tx = db.transaction(AUDIO_STORE, 'readwrite');
        tx.objectStore(AUDIO_STORE).delete(trackId);
        tx.oncomplete = resolve;
    });
}

async function cacheGetAllKeys() {
    const db = await openAudioCacheDB();
    return new Promise((resolve) => {
        const req = db.transaction(AUDIO_STORE, 'readonly').objectStore(AUDIO_STORE).getAllKeys();
        req.onsuccess = () => {
            const map = {};
            (req.result || []).forEach(k => { map[k] = true; });
            resolve(map);
        };
        req.onerror = () => resolve({});
    });
}

async function cacheGetTotalSize() {
    const db = await openAudioCacheDB();
    return new Promise((resolve) => {
        const req = db.transaction(AUDIO_STORE, 'readonly').objectStore(AUDIO_STORE).getAll();
        req.onsuccess = () => {
            const total = (req.result || []).reduce((sum, b) => sum + (b.size || 0), 0);
            resolve(total);
        };
        req.onerror = () => resolve(0);
    });
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

let _cachedTrackIds = {};

async function refreshCachedIds() {
    _cachedTrackIds = await cacheGetAllKeys();
}

// ── METADATA DE CANCIONES OFFLINE (localStorage) ──────────────────────────
// El caché de IndexedDB solo guarda el audio (blob) por track.id. Para poder
// mostrar la LISTA de "Mi música" sin conexión (nombre, álbum, etc.) también
// guardamos una copia liviana de los metadatos en localStorage cada vez que
// se descarga una canción.
const OFFLINE_META_KEY = 'offlineTracksMeta';

function getOfflineTracksMeta() {
    try {
        return JSON.parse(localStorage.getItem(OFFLINE_META_KEY) || '{}');
    } catch (e) {
        return {};
    }
}

function saveOfflineTrackMeta(track) {
    const meta = getOfflineTracksMeta();
    meta[track.id] = {
        id: track.id,
        file_name: track.file_name,
        display_name: track.display_name,
        album: track.album || null,
        is_public: !!track.is_public,
        user_id: track.user_id,
        created_at: track.created_at || null,
    };
    localStorage.setItem(OFFLINE_META_KEY, JSON.stringify(meta));
}

function removeOfflineTrackMeta(trackId) {
    const meta = getOfflineTracksMeta();
    delete meta[trackId];
    localStorage.setItem(OFFLINE_META_KEY, JSON.stringify(meta));
}

// true cuando el navegador reporta no tener conexión. OJO: esto solo detecta
// si el adaptador de red está prendido/apagado — si estás "conectado" a una
// red que en realidad no tiene salida a internet, navigator.onLine sigue
// devolviendo true. Por eso NO nos apoyamos solo en esto (ver withTimeout).
function isOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function looksLikeNetworkError(err) {
    if (!err) return false;
    if (err.__isTimeout) return true; // marcado por withTimeout()
    if (err instanceof TypeError) return true; // fetch() fallido = TypeError en casi todos los navegadores
    const msg = (err.message || String(err) || '').toLowerCase();
    return msg.includes('failed to fetch') || msg.includes('networkerror') ||
        msg.includes('load failed') || msg.includes('network request failed') ||
        msg.includes('err_internet_disconnected') || msg.includes('err_network') ||
        msg.includes('err_connection') || msg.includes('timed out') ||
        msg.includes('timeout') || msg.includes('offline') ||
        isOffline();
}

// Corre una promesa con un límite de tiempo. Si no hay internet real (aunque
// el adaptador diga que sí hay red), fetch/Supabase pueden quedarse
// "colgados" esperando resolver DNS en vez de fallar rápido — sin esto, la
// pantalla se quedaba en "Cargando..." para siempre y nunca llegaba a
// mostrar el aviso ni el fallback offline.
function withTimeout(promise, ms = 6000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const err = new Error('timeout');
            err.__isTimeout = true;
            reject(err);
        }, ms);
        promise.then(
            (val) => { clearTimeout(timer); resolve(val); },
            (err) => { clearTimeout(timer); reject(err); }
        );
    });
}

async function cacheTrack(track, iconEl) {
    if (iconEl) { iconEl.textContent = '\u23F3'; iconEl.title = 'Descargando...'; }
    try {
        const signedUrl = await getSignedUrl(track.file_name);
        const resp = await fetch(signedUrl);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const blob = await resp.blob();
        await cachePut(track.id, blob);
        saveOfflineTrackMeta(track);
        _cachedTrackIds[track.id] = true;
        if (iconEl) { iconEl.textContent = '\u2705'; iconEl.title = 'Disponible offline — clic para quitar'; }
        showToast('Canción disponible offline', 'ok');
    } catch (err) {
        console.error('Error al cachear:', err);
        if (iconEl) { iconEl.textContent = '\uD83D\uDCE5'; iconEl.title = 'Guardar para offline'; }
        showToast('No se pudo descargar: ' + err.message, 'error');
    }
}

async function uncacheTrack(trackId, iconEl) {
    await cacheDelete(trackId);
    delete _cachedTrackIds[trackId];
    removeOfflineTrackMeta(trackId);
    if (iconEl) { iconEl.textContent = '\uD83D\uDCE5'; iconEl.title = 'Guardar para offline'; }
}

// Reads from cache or fetches signed URL, always returning an object-URL for playback.
// Caches the blob automatically after first download.
async function getPlaybackUrl(track) {
    const cached = await cacheGet(track.id);
    if (cached) {
        _cachedTrackIds[track.id] = true;
        return { url: URL.createObjectURL(cached), fromCache: true };
    }
    const signedUrl = await getSignedUrl(track.file_name);
    // Background cache after download starts (fire and forget)
    fetch(signedUrl).then(r => r.ok ? r.blob() : null).then(blob => {
        if (blob) cachePut(track.id, blob).then(() => { _cachedTrackIds[track.id] = true; saveOfflineTrackMeta(track); updateCacheIconForTrack(track.id); });
    }).catch(() => {});
    return { url: signedUrl, fromCache: false };
}

// Updates the cache icon on an already-rendered row without re-rendering
function updateCacheIconForTrack(trackId) {
    const el = document.querySelector(`.radio-item[data-track-id="${trackId}"] .track-cache-btn`);
    if (!el) return;
    el.textContent = '\u2705';
    el.title = 'Disponible offline — clic para quitar';
}



// Elementos nuevos del panel (no declarados en config.js): la fila del
// álbum (ahora separada del botón de subir, junto a la búsqueda) y el
// botón ✕ para cerrar el panel a pantalla completa.

const musicPanelCloseBtn = document.getElementById('musicPanelCloseBtn');

let isPlaying = false;
let isMuted = false;
let lastVolume = 0.8;
let currentMusicMode = 'uploads'; // 'radio' | 'shared' | 'uploads'

// Lista de resultados actualmente cargados (radios o canciones) y el índice
// que se está reproduciendo, para poder saltar con ⏮ / ⏭.
let currentResultsList = [];
let currentResultIndex = -1;

// Identificador único de lo que se está reproduciendo AHORA MISMO (file_name
// de una canción, o url_resolved de una estación) — se usa para resaltar esa
// fila en la lista con una marca visual ("▶ Reproduciendo").
let currentPlayingKey = null;

// Selección múltiple para compartir/dejar de compartir varias canciones a la
// vez (solo aplica a tus propias canciones, sin importar en qué pestaña
// estés: "Mi música" o "Música compartida").
let selectedTrackIds = new Set();

// Álbumes actualmente colapsados (por nombre, o NO_ALBUM_KEY para "Sin
// álbum"). Se mantiene mientras el chat sigue abierto, para que un álbum de
// 60+ canciones no obligue a scrollear entre todos los demás cada vez que
// se cambia de pestaña o se busca algo.
let collapsedAlbums = new Set();

// --- TÍTULO DEL REPRODUCTOR CON TEXTO CORRIDO (marquee) SI NO CABE ---
// Solo anima cuando el texto es más largo que el espacio disponible; los
// títulos cortos se quedan quietos.
function setCurrentTrackTitle(text) {
    if (!currentTrackTitle || !currentTrackTitleInner) return;
    currentTrackTitleInner.textContent = text || '';

    // Quita la animación antes de medir, para medir el ancho real del texto
    currentTrackTitle.classList.remove('marquee');
    // Fuerza reflow para poder reiniciar la animación limpia si vuelve a aplicar
    void currentTrackTitleInner.offsetWidth;

    const overflows = currentTrackTitleInner.scrollWidth > currentTrackTitle.clientWidth;
    if (overflows) {
        currentTrackTitle.classList.add('marquee');
    }
}

// Recorre las filas de la lista actualmente visible y marca cuál coincide
// con currentPlayingKey (data-track-key en canciones, data-station-key en
// estaciones de radio).
function updatePlayingHighlight() {
    document.querySelectorAll('.radio-item').forEach(item => {
        const key = item.dataset.trackKey || item.dataset.stationKey;
        item.classList.toggle('playing', !!key && key === currentPlayingKey);
    });
}

// --- ALEATORIO Y REPETIR ---
// repeatMode: 'off' (se detiene al llegar al final) -> 'all' (vuelve al
// inicio de la lista) -> 'one' (repite la misma pista) -> 'off' ...
let isShuffle = false;
let repeatMode = 'off';

function updateShuffleRepeatUI() {
    if (shuffleBtn) shuffleBtn.classList.toggle('active', isShuffle);
    if (repeatBtn) {
        repeatBtn.classList.toggle('active', repeatMode !== 'off');
        repeatBtn.textContent = repeatMode === 'one' ? '🔂' : '🔁';
        repeatBtn.title = repeatMode === 'off' ? 'Repetir (desactivado)'
            : repeatMode === 'all' ? 'Repetir toda la lista'
            : 'Repetir esta pista';
    }
}

if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
        isShuffle = !isShuffle;
        updateShuffleRepeatUI();
    });
}

if (repeatBtn) {
    repeatBtn.addEventListener('click', () => {
        repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
        updateShuffleRepeatUI();
    });
}

updateShuffleRepeatUI();

// Se dispara cuando termina la pista actual (canción, radio no aplica porque
// es un stream continuo sin "fin", pero no estorba dejarlo genérico).
function handleTrackEnded() {
    if (!audioPlayer || currentResultsList.length === 0 || currentResultIndex === -1) return;

    if (repeatMode === 'one') {
        audioPlayer.currentTime = 0;
        audioPlayer.play();
        return;
    }

    if (isShuffle) {
        if (currentResultsList.length === 1) {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
            return;
        }
        let randomIndex;
        do {
            randomIndex = Math.floor(Math.random() * currentResultsList.length);
        } while (randomIndex === currentResultIndex);
        playByIndex(randomIndex);
        return;
    }

    const isLastTrack = currentResultIndex >= currentResultsList.length - 1;
    if (isLastTrack && repeatMode === 'off') {
        isPlaying = false;
        if (playPauseBtn) playPauseBtn.textContent = '▶';
        return; // termina la lista, no sigue
    }

    playByIndex(currentResultIndex + 1); // playByIndex ya hace el salto circular
}

if (audioPlayer) {
    audioPlayer.addEventListener('ended', handleTrackEnded);
}

// --- BARRA DE PROGRESO (tiempo actual, duración, saltar al segundo exacto) ---
// isSeeking evita que timeupdate pelee con el arrastre manual del usuario
// mientras tiene el slider agarrado.
let isSeeking = false;

function formatTime(seconds) {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Radio en vivo tiene duration = Infinity (o NaN antes de cargar): ahí no
// existe un "segundo exacto" al que saltar, así que se oculta la barra.
function updateProgressVisibility() {
    if (!musicProgressBar || !audioPlayer) return;
    const hasFiniteDuration = isFinite(audioPlayer.duration) && audioPlayer.duration > 0;
    const wasVisible = musicProgressBar.style.display === 'flex';
    const nowVisible = hasFiniteDuration;
    musicProgressBar.style.display = nowVisible ? 'flex' : 'none';
    if (wasVisible !== nowVisible && typeof repositionMusicPanel === 'function') repositionMusicPanel();
}

if (audioPlayer) {
    audioPlayer.addEventListener('loadedmetadata', () => {
        updateProgressVisibility();
        if (progressSlider) progressSlider.max = Math.floor(audioPlayer.duration) || 0;
        if (progressDuration) progressDuration.textContent = formatTime(audioPlayer.duration);
    });

    audioPlayer.addEventListener('timeupdate', () => {
        if (isSeeking) return;
        updateProgressVisibility();
        if (progressSlider) progressSlider.value = Math.floor(audioPlayer.currentTime) || 0;
        if (progressCurrentTime) progressCurrentTime.textContent = formatTime(audioPlayer.currentTime);
    });
}

if (progressSlider) {
    progressSlider.addEventListener('input', () => {
        isSeeking = true;
        if (progressCurrentTime) progressCurrentTime.textContent = formatTime(progressSlider.value);
    });

    progressSlider.addEventListener('change', () => {
        if (audioPlayer) audioPlayer.currentTime = Number(progressSlider.value);
        isSeeking = false;
    });
}

// --- MEDIA SESSION API ---
if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => {
        if (audioPlayer && audioPlayer.src) {
            audioPlayer.play();
            isPlaying = true;
            if (playPauseBtn) playPauseBtn.textContent = '⏸';
        }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
        if (audioPlayer) {
            audioPlayer.pause();
            isPlaying = false;
            if (playPauseBtn) playPauseBtn.textContent = '▶';
        }
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (currentResultIndex !== -1) playByIndex(currentResultIndex - 1);
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (currentResultIndex !== -1) playByIndex(currentResultIndex + 1);
    });
}

function updateMediaSessionMetadata(title, subtitle, artworkUrl) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'Reproduciendo',
        artist: subtitle || '',
        album: 'Supabase Chat Pro',
        artwork: artworkUrl ? [{ src: artworkUrl, sizes: '96x96', type: 'image/png' }] : []
    });
}

// --- CAMBIO DE PESTAÑA (Radio / Canciones / Mi música) ---
let musicSearchFilter = '';

function setMusicMode(mode) {
    currentMusicMode = mode;
    if (radioResults) radioResults.innerHTML = '';
    if (musicInput) musicInput.value = '';
    musicSearchFilter = '';
    selectedTrackIds.clear();
    updateBulkActionBar();
    setSelectionMode(false);
    trashViewOn = false;
    const trashBtn = ensureTrashToggleBtn();
    trashBtn.classList.remove('active');
    trashBtn.textContent = '🗑️ Papelera';
    trashBtn.style.display = mode === 'uploads' ? 'block' : 'none';

    if (tabRadio) tabRadio.classList.toggle('active', mode === 'radio');
    if (tabShared) tabShared.classList.toggle('active', mode === 'shared');
    if (tabUploads) tabUploads.classList.toggle('active', mode === 'uploads');

    if (musicSearchRow) musicSearchRow.style.display = 'flex';

    if (musicUploadRow) musicUploadRow.style.display = mode === 'uploads' ? 'flex' : 'none';

    const uploadHint = ensureUploadFormatHint();
    if (uploadHint) uploadHint.style.display = mode === 'uploads' ? 'block' : 'none';

    if (mode === 'radio') {
        if (musicInput) musicInput.placeholder = 'Buscar estación de radio (ej. rock, jazz, noticias)...';
        if (musicHint) musicHint.textContent = '';
    } else if (mode === 'shared') {
        if (musicInput) musicInput.placeholder = '🔎 Buscar canción por nombre...';
        if (musicHint) musicHint.textContent = 'Canciones que otros usuarios compartieron públicamente 🌐.';
        loadSharedTracks();
    } else {
        if (musicInput) musicInput.placeholder = '🔎 Buscar canción por nombre...';
        if (musicHint) musicHint.textContent = 'Tus canciones son privadas por defecto. Activa 🌐 para compartirlas con el chat.';
        loadUploadedTracks();
    }
}

function ensureUploadFormatHint() {
    let wrap = document.getElementById('uploadFormatHint');
    if (wrap) return wrap;
    if (!musicUploadRow || !musicUploadRow.parentNode) return null;

    wrap = document.createElement('div');
    wrap.id = 'uploadFormatHint';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'upload-format-toggle';
    toggle.textContent = 'ℹ️ ¿Qué formatos acepta?';

    const detail = document.createElement('p');
    detail.className = 'music-hint upload-format-detail';
    detail.style.textAlign = 'left';
    detail.textContent = 'Acepta MP3, WAV, OGG, M4A/AAC y FLAC (lo que tu navegador pueda reproducir). Si un archivo no sube: ya tienes una canción con ese mismo nombre (se omite para no duplicar), el archivo pesa más de 40 MB o superaste tu espacio de música (500 MB), o no es un archivo de audio válido — revisa el mensaje de error que aparece tras subir.';

    toggle.addEventListener('click', () => {
        const open = detail.classList.toggle('open');
        toggle.classList.toggle('open', open);
    });

    wrap.appendChild(toggle);
    wrap.appendChild(detail);
    musicUploadRow.parentNode.insertBefore(wrap, musicUploadRow.nextSibling);
    return wrap;
}

// --- MODO SELECCIÓN (checkboxes ocultos por defecto) ---
let selectionModeOn = false;

function ensureSelectionToggleBtn() {
    let btn = document.getElementById('selectionModeBtn');
    if (btn) return btn;
    btn = document.createElement('button');
    btn.id = 'selectionModeBtn';
    btn.type = 'button';
    btn.className = 'selection-mode-toggle';
    btn.addEventListener('click', () => setSelectionMode(!selectionModeOn));
    if (musicHint && musicHint.parentNode) {
        musicHint.parentNode.insertBefore(btn, musicHint.nextSibling);
    }
    return btn;
}

// --- PAPELERA (canciones tuyas que eran el último ejemplar; esperan 24 h) ---
let trashViewOn = false;

function ensureTrashToggleBtn() {
    let btn = document.getElementById('trashToggleBtn');
    if (btn) return btn;
    btn = document.createElement('button');
    btn.id = 'trashToggleBtn';
    btn.type = 'button';
    btn.className = 'selection-mode-toggle';
    btn.textContent = '🗑️ Papelera';
    btn.addEventListener('click', () => {
        trashViewOn = !trashViewOn;
        btn.classList.toggle('active', trashViewOn);
        btn.textContent = trashViewOn ? '⬅ Volver a mis canciones' : '🗑️ Papelera';
        const selBtn = ensureSelectionToggleBtn();
        if (trashViewOn) {
            setSelectionMode(false);
            selBtn.style.display = 'none';
            loadTrashTracks();
        } else {
            selBtn.style.display = currentMusicMode === 'radio' ? 'none' : 'block';
            loadUploadedTracks();
        }
    });
    const selectionBtn = ensureSelectionToggleBtn();
    if (selectionBtn && selectionBtn.parentNode) {
        selectionBtn.parentNode.insertBefore(btn, selectionBtn.nextSibling);
    }
    return btn;
}

async function loadTrashTracks() {
    if (!radioResults || !currentUserId) return;
    radioResults.innerHTML = '<div class="radio-status">\u{1F50E} Cargando papelera...</div>';
    currentResultsList = [];
    try {
        const { data, error } = await withTimeout(
            supabaseClient
                .from('music_tracks')
                .select('*')
                .eq('user_id', currentUserId)
                .not('deleted_at', 'is', null)
                .order('deleted_at', { ascending: false })
        );
        if (error) throw error;

        if (!data || data.length === 0) {
            radioResults.innerHTML = '<div class="radio-status">La papelera está vacía.</div>';
            return;
        }
        radioResults.innerHTML = '';
        data.forEach(track => radioResults.appendChild(renderTrashItem(track)));
    } catch (err) {
        console.error('Error al cargar la papelera:', err);
        radioResults.innerHTML = '<div class="radio-status">⚠️ Error al cargar la papelera.</div>';
    }
}

function renderTrashItem(track) {
    const item = document.createElement('div');
    item.className = 'radio-item';

    const icon = document.createElement('span');
    icon.className = 'radio-icon uploaded-icon';
    icon.textContent = '🗑️';
    item.appendChild(icon);

    const info = document.createElement('div');
    info.className = 'radio-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'radio-name';
    nameEl.textContent = track.display_name;
    info.appendChild(nameEl);

    const meta = document.createElement('span');
    meta.className = 'radio-meta';
    if (track.purge_at) {
        const hoursLeft = Math.max(0, Math.ceil((new Date(track.purge_at) - Date.now()) / 3600000));
        meta.textContent = hoursLeft > 0
            ? `Se borra definitivamente en ~${hoursLeft} h`
            : 'A punto de borrarse definitivamente';
    }
    info.appendChild(meta);
    item.appendChild(info);

    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'track-quick-btn';
    restoreBtn.title = 'Recuperar canción';
    restoreBtn.textContent = '↺';
    restoreBtn.style.opacity = '1'; // siempre visible aquí, no solo al pasar el mouse
    restoreBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
            const { error } = await supabaseClient
                .from('music_tracks')
                .update({ deleted_at: null, purge_at: null })
                .eq('id', track.id);
            if (error) throw error;
            loadTrashTracks();
        } catch (err) { showToast('No se pudo recuperar: ' + err.message, 'error'); }
    };
    item.appendChild(restoreBtn);

    return item;
}

function setSelectionMode(on) {
    selectionModeOn = on;
    const btn = ensureSelectionToggleBtn();
    btn.classList.toggle('active', on);
    btn.textContent = on ? '✕ Cancelar selección' : '☑️ Seleccionar varias';
    btn.style.display = currentMusicMode === 'radio' ? 'none' : 'block';
    if (radioResults) radioResults.classList.toggle('selection-mode', on);
    if (!on) {
        selectedTrackIds.clear();
        updateBulkActionBar();
    }
}

if (tabRadio) tabRadio.addEventListener('click', () => setMusicMode('radio'));
if (tabShared) tabShared.addEventListener('click', () => setMusicMode('shared'));
if (tabUploads) tabUploads.addEventListener('click', () => setMusicMode('uploads'));

// --- MI MÚSICA ---
const MUSIC_UPLOADS_BUCKET = 'music-uploads';
const SIGNED_URL_EXPIRY = 3600;

function sanitizeFileName(rawName) {
    const dotIndex = rawName.lastIndexOf('.');
    const ext = dotIndex > -1 ? rawName.slice(dotIndex) : '';
    const base = dotIndex > -1 ? rawName.slice(0, dotIndex) : rawName;
    const cleanBase = base
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
    return cleanBase + ext;
}

// Hash del CONTENIDO del archivo (no del nombre): así dos personas que
// suben el mismo mp3 con nombres distintos se detectan como la misma
// canción, y archivos distintos con el mismo nombre no chocan.
async function computeFileHash(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function getSignedUrl(fileName) {
    // Canciones nuevas (Cloudflare R2): URL temporal firmada por el Worker.
    if (isR2MusicKey(fileName)) return withTimeout(getR2SignedUrl(fileName), 10000);
    // Canciones viejas (Supabase Storage): camino anterior.
    const { data, error } = await withTimeout(
        supabaseClient.storage
            .from(MUSIC_UPLOADS_BUCKET)
            .createSignedUrl(fileName, SIGNED_URL_EXPIRY)
    );
    if (error) throw error;
    return data.signedUrl;
}

async function loadUploadedTracks() {
    if (!radioResults || !currentUserId) return;
    radioResults.innerHTML = '<div class="radio-status">\u{1F50E} Cargando tu música...</div>';

    // Refresh in-memory cache map first — se necesita tanto si hay red como si no.
    await refreshCachedIds();

    try {
        const { data, error } = await withTimeout(
            supabaseClient
                .from('music_tracks')
                .select('*')
                .eq('user_id', currentUserId)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
        );
        if (error) throw error;

        if (!data || data.length === 0) {
            radioResults.innerHTML = '<div class="radio-status">Todavía no subiste ninguna canción. Usa el botón ⬆️ de arriba.</div>';
            currentResultsList = [];
            return;
        }

        const filtered = filterTracksBySearch(data);
        if (filtered.length === 0) {
            radioResults.innerHTML = '<div class="radio-status">Sin resultados para esa búsqueda.</div>';
            currentResultsList = [];
            return;
        }
        renderTracksGrouped(filtered);
        updateCacheInfoBar();
    } catch (err) {
        console.error('Error al cargar música:', err);

        // Sin conexión (o el servidor no responde): en vez de un error seco,
        // mostramos lo que sí tenemos guardado localmente para escuchar offline.
        if (looksLikeNetworkError(err)) {
            renderOfflineTracksFallback('uploads');
            return;
        }
        radioResults.innerHTML = '<div class="radio-status">⚠️ Error al cargar. Revisa la tabla music_tracks y el bucket music-uploads.</div>';
    }
}

// Dibuja la lista usando solo lo que hay guardado offline (localStorage +
// IndexedDB), para cuando no hay conexión y Supabase no responde. Se usa
// tanto en "Mi música" (mode 'uploads': solo tus propias canciones
// cacheadas) como en "Música compartida" (mode 'shared': canciones públicas
// de cualquier usuario que hayas descargado para offline), para que la
// lista nunca desaparezca al perder la conexión — siempre queda al menos
// lo que ya está precargado.
function renderOfflineTracksFallback(mode) {
    const meta = getOfflineTracksMeta();
    const cached = mode === 'shared'
        ? Object.values(meta).filter(t => t.is_public)
        : Object.values(meta).filter(t => !currentUserId || t.user_id === currentUserId);

    const emptyMsg = mode === 'shared'
        ? '\uD83D\uDCF6 Sin conexión y no has guardado música compartida offline todavía.'
        : '\uD83D\uDCF6 Sin conexión y no hay canciones guardadas offline todavía.';
    const noticeMsg = mode === 'shared'
        ? '\uD83D\uDCF6 Sin conexión — mostrando solo música compartida guardada offline'
        : '\uD83D\uDCF6 Sin conexión — mostrando solo canciones guardadas offline';

    if (cached.length === 0) {
        radioResults.innerHTML = `<div class="radio-status">${emptyMsg}</div>`;
        currentResultsList = [];
        updateCacheInfoBar();
        return;
    }

    const filtered = filterTracksBySearch(cached);
    if (filtered.length === 0) {
        radioResults.innerHTML = '<div class="radio-status">Sin resultados para esa búsqueda (modo offline).</div>';
        currentResultsList = [];
        return;
    }

    renderTracksGrouped(filtered);
    updateCacheInfoBar();

    // Aviso arriba de la lista indicando que se está en modo offline
    const notice = document.createElement('div');
    notice.className = 'radio-status';
    notice.style.cssText = 'padding:6px 10px;opacity:0.8;';
    notice.textContent = noticeMsg;
    radioResults.insertBefore(notice, radioResults.firstChild);
}

// Shows a small info strip at the bottom of the panel: total cached size + clear-all button.
async function updateCacheInfoBar() {
    let bar = document.getElementById('cacheInfoBar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'cacheInfoBar';
        bar.className = 'cache-info-bar';
        if (musicPanel) musicPanel.appendChild(bar);
    }

    const totalBytes = await cacheGetTotalSize();
    const cachedCount = Object.keys(_cachedTrackIds).length;

    if (cachedCount === 0) {
        bar.innerHTML = '<span>\uD83D\uDCBE Sin canciones en caché offline</span>';
        return;
    }

    bar.innerHTML = '';

    const label = document.createElement('span');
    label.style.flex = '1';
    label.textContent = cachedCount + ' cancion' + (cachedCount !== 1 ? 'es' : '') +
        ' en caché · ' + formatBytes(totalBytes);
    bar.appendChild(label);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'cache-clear-btn';
    clearBtn.textContent = '\uD83D\uDDD1\uFE0F Limpiar caché';
    clearBtn.onclick = async () => {
        if (!confirm('\u00BFEliminar todas las canciones guardadas offline?')) return;
        const db = await openAudioCacheDB();
        await new Promise(resolve => {
            const tx = db.transaction(AUDIO_STORE, 'readwrite');
            tx.objectStore(AUDIO_STORE).clear();
            tx.oncomplete = resolve;
        });
        _cachedTrackIds = {};
        showToast('Caché offline limpiada', 'ok');
        // Re-render so icons update
        if (currentMusicMode === 'uploads') loadUploadedTracks();
    };
    bar.appendChild(clearBtn);
}

async function loadSharedTracks() {
    if (!radioResults) return;
    radioResults.innerHTML = '<div class="radio-status">\u{1F50E} Cargando música compartida...</div>';

    // Refresh in-memory cache map first — se necesita tanto si hay red como si no.
    await refreshCachedIds();

    try {
        const { data, error } = await withTimeout(
            supabaseClient
                .from('music_tracks')
                .select('*')
                .eq('is_public', true)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
        );
        if (error) throw error;
        if (!data || data.length === 0) {
            radioResults.innerHTML = '<div class="radio-status">Todavía nadie compartió música públicamente. Sube una canción y márcala con 🌐 en "Mi música".</div>';
            currentResultsList = [];
            return;
        }
        const filtered = filterTracksBySearch(data);
        if (filtered.length === 0) {
            radioResults.innerHTML = '<div class="radio-status">Sin resultados para esa búsqueda.</div>';
            currentResultsList = [];
            return;
        }
        renderTracksGrouped(filtered);
        updateCacheInfoBar();
    } catch (err) {
        console.error('Error al cargar música compartida:', err);

        // Igual que en "Mi música": sin conexión, mostramos lo que ya se
        // haya descargado para offline en vez de un mensaje seco.
        if (looksLikeNetworkError(err)) {
            renderOfflineTracksFallback('shared');
            return;
        }
        radioResults.innerHTML = '<div class="radio-status">⚠️ Error al cargar la música compartida.</div>';
    }
}

function filterTracksBySearch(tracks) {
    if (!musicSearchFilter) return tracks;
    const term = musicSearchFilter;
    return (tracks || []).filter(t =>
        (t.display_name || '').toLowerCase().includes(term) ||
        (t.album || '').toLowerCase().includes(term)
    );
}

function updateAlbumSuggestions(tracks) {
    if (!albumSuggestions) return;
    const names = [...new Set(
        (tracks || []).map(t => (t.album || '').trim()).filter(Boolean)
    )];
    albumSuggestions.innerHTML = names.map(n => `<option value="${n.replace(/"/g, '&quot;')}"></option>`).join('');
}

const NO_ALBUM_KEY = '\u0000__sin_album__';

function renderTracksGrouped(tracks) {
    radioResults.innerHTML = '';
    selectedTrackIds.clear();
    updateBulkActionBar();

    if (!tracks || tracks.length === 0) {
        radioResults.innerHTML = '<div class="radio-status">Sin canciones disponibles.</div>';
        currentResultsList = [];
        return;
    }
    currentResultsList = tracks;

    const groups = new Map();
    tracks.forEach(t => {
        const key = (t.album && t.album.trim()) ? t.album.trim() : NO_ALBUM_KEY;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(t);
    });

    const sortedKeys = [...groups.keys()].sort((a, b) => {
        if (a === NO_ALBUM_KEY) return 1;
        if (b === NO_ALBUM_KEY) return -1;
        return a.localeCompare(b);
    });

    sortedKeys.forEach(k => {
        if (!collapsedAlbums.has(k)) collapsedAlbums.add(k);
    });

    sortedKeys.forEach(albumKey => {
        const groupTracks = groups.get(albumKey);
        const isNoAlbum = albumKey === NO_ALBUM_KEY;
        const ownTracksInGroup = groupTracks.filter(t => t.user_id === currentUserId);
        const isCollapsed = collapsedAlbums.has(albumKey);

        const groupWrap = document.createElement('div');
        groupWrap.className = 'album-group';

        const header = document.createElement('div');
        header.className = 'album-header';

        const arrow = document.createElement('span');
        arrow.className = 'album-toggle-arrow';
        arrow.textContent = isCollapsed ? '▸' : '▾';
        header.appendChild(arrow);

        const titleSpan = document.createElement('span');
        titleSpan.className = 'album-header-title';
        titleSpan.textContent = `${isNoAlbum ? '📁 Sin álbum' : '💿 ' + albumKey} (${groupTracks.length})`;
        header.appendChild(titleSpan);

        if (ownTracksInGroup.length > 0) {
            const selectAll = document.createElement('input');
            selectAll.type = 'checkbox';
            selectAll.className = 'album-select-all';
            selectAll.title = 'Seleccionar todas de este álbum';
            selectAll.onclick = (e) => e.stopPropagation();
            selectAll.onchange = () => {
                ownTracksInGroup.forEach(t => {
                    if (selectAll.checked) selectedTrackIds.add(t.id);
                    else selectedTrackIds.delete(t.id);
                    const cb = radioResults.querySelector(`[data-track-id="${t.id}"]`);
                    if (cb) cb.checked = selectAll.checked;
                });
                updateBulkActionBar();
            };
            header.appendChild(selectAll);
        }

        if (ownTracksInGroup.length > 0) {
            const allPublic = ownTracksInGroup.every(t => t.is_public);
            const badge = document.createElement('button');
            badge.className = `album-vis-badge ${allPublic ? 'public' : 'private'}`;
            badge.textContent = allPublic ? '🌐 Pública' : '🔒 Privada';
            badge.title = allPublic ? 'Hacer privado este álbum' : 'Compartir álbum públicamente';
            badge.onclick = (e) => {
                e.stopPropagation();
                toggleAlbumSharing(isNoAlbum ? null : albumKey, !allPublic, ownTracksInGroup);
            };
            header.appendChild(badge);
        }

        const tracksWrap = document.createElement('div');
        tracksWrap.className = 'album-tracks' + (isCollapsed ? ' collapsed' : '');

        header.addEventListener('click', () => {
            const collapsed = tracksWrap.classList.toggle('collapsed');
            if (collapsed) collapsedAlbums.add(albumKey);
            else collapsedAlbums.delete(albumKey);
            arrow.textContent = collapsed ? '▸' : '▾';
        });

        groupTracks.forEach((track) => {
            const globalIndex = currentResultsList.indexOf(track);
            tracksWrap.appendChild(renderTrackItem(track, globalIndex));
        });

        groupWrap.appendChild(header);
        groupWrap.appendChild(tracksWrap);
        radioResults.appendChild(groupWrap);
    });

    updatePlayingHighlight();
}

function activateMarqueeIfOverflows(nameEl) {
    if (!nameEl) return;
    requestAnimationFrame(() => {
        if (nameEl.scrollWidth > nameEl.clientWidth) {
            const overflow = nameEl.scrollWidth - nameEl.clientWidth;
            nameEl.style.setProperty('--marquee-offset', `-${overflow + 8}px`);
            nameEl.classList.add('marquee-active');
        }
    });
}

function openAlbumPicker(trackIds, currentAlbum) {
    const existingAlbums = [...new Set(
        (currentResultsList || []).map(t => (t.album || '').trim()).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    const modal = document.createElement('div');
    modal.className = 'album-picker-modal';

    const box = document.createElement('div');
    box.className = 'album-picker-box';

    const title = document.createElement('p');
    title.className = 'album-picker-title';
    title.textContent = trackIds.length > 1
        ? `Mover ${trackIds.length} canciones a…`
        : 'Mover canción a álbum';
    box.appendChild(title);

    if (trackIds.length === 1 && currentAlbum) {
        const sub = document.createElement('p');
        sub.className = 'album-picker-subtitle';
        sub.textContent = `Álbum actual: ${currentAlbum}`;
        box.appendChild(sub);
    }

    const list = document.createElement('div');
    list.className = 'album-picker-list';

    const noAlbumOpt = document.createElement('button');
    noAlbumOpt.className = 'album-picker-option' + (!currentAlbum ? ' current' : '');
    noAlbumOpt.innerHTML = '<span>📁</span><span>Sin álbum</span>';
    noAlbumOpt.onclick = () => applyAlbumMove(trackIds, null, modal);
    list.appendChild(noAlbumOpt);

    existingAlbums.forEach(name => {
        const opt = document.createElement('button');
        opt.className = 'album-picker-option' + (name === currentAlbum ? ' current' : '');
        opt.innerHTML = `<span>💿</span><span>${name}</span>`;
        opt.onclick = () => applyAlbumMove(trackIds, name, modal);
        list.appendChild(opt);
    });

    box.appendChild(list);

    const newRow = document.createElement('div');
    newRow.className = 'album-picker-new-row';
    const newInput = document.createElement('input');
    newInput.className = 'album-picker-new-input';
    newInput.placeholder = 'Nuevo álbum…';
    const newBtn = document.createElement('button');
    newBtn.className = 'album-picker-new-btn';
    newBtn.textContent = '+ Crear';
    newBtn.onclick = () => {
        const name = newInput.value.trim();
        if (!name) return;
        applyAlbumMove(trackIds, name, modal);
    };
    newInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') newBtn.click(); });
    newRow.appendChild(newInput);
    newRow.appendChild(newBtn);
    box.appendChild(newRow);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'album-picker-cancel';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.onclick = () => modal.remove();
    box.appendChild(cancelBtn);

    modal.appendChild(box);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
    setTimeout(() => newInput.focus(), 80);
}

async function applyAlbumMove(trackIds, albumValue, modal) {
    modal.remove();
    try {
        const { error } = await supabaseClient
            .from('music_tracks')
            .update({ album: albumValue })
            .in('id', trackIds);
        if (error) throw error;
        (currentResultsList || []).forEach(t => {
            if (trackIds.includes(t.id)) t.album = albumValue;
        });
        selectedTrackIds.clear();
        if (currentMusicMode === 'shared') loadSharedTracks();
        else loadUploadedTracks();
    } catch (err) {
        showToast('No se pudo mover: ' + err.message, 'error');
    }
}

async function toggleAlbumSharing(albumName, makePublic, ownTracksInGroup) {
    try {
        let query = supabaseClient
            .from('music_tracks')
            .update({ is_public: makePublic })
            .eq('user_id', currentUserId);
        query = albumName === null ? query.is('album', null) : query.eq('album', albumName);

        const { error } = await query;
        if (error) throw error;

        ownTracksInGroup.forEach(t => { t.is_public = makePublic; });

        if (currentMusicMode === 'shared') loadSharedTracks();
        else loadUploadedTracks();
    } catch (err) {
        console.error('Error al compartir/ocultar álbum:', err);
        showToast('No se pudo actualizar el álbum: ' + err.message, 'error');
    }
}

// Botón de descarga/quitar para offline — usado tanto en tus propias
// canciones ("Mi música") como en las de otros ("Música compartida"), para
// que cualquier canción se pueda precargar y sobrevivir sin conexión.
function createCacheButton(track) {
    const cacheBtn = document.createElement('button');
    cacheBtn.type = 'button';
    cacheBtn.className = 'track-quick-btn track-cache-btn';
    const isCached = !!_cachedTrackIds[track.id];
    cacheBtn.textContent = isCached ? '\u2705' : '\uD83D\uDCE5';
    cacheBtn.title = isCached ? 'Disponible offline \u2014 clic para quitar' : 'Guardar para offline';
    cacheBtn.onclick = async (e) => {
        e.stopPropagation();
        if (_cachedTrackIds[track.id]) {
            await uncacheTrack(track.id, cacheBtn);
            showToast('Quitada del almacenamiento offline', 'info');
        } else {
            await cacheTrack(track, cacheBtn);
        }
    };
    return cacheBtn;
}

function renderTrackItem(track, index) {
    const isMine = track.user_id === currentUserId;
    const item = document.createElement('div');
    item.className = 'radio-item';
    item.dataset.trackKey = track.file_name;
    item.dataset.trackId = track.id; // used by updateCacheIconForTrack

    if (isMine) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'track-select-checkbox';
        checkbox.dataset.trackId = track.id;
        checkbox.checked = selectedTrackIds.has(track.id);
        checkbox.onclick = (e) => e.stopPropagation();
        checkbox.onchange = () => {
            if (checkbox.checked) selectedTrackIds.add(track.id);
            else selectedTrackIds.delete(track.id);
            updateBulkActionBar();
        };
        item.appendChild(checkbox);
    }

    const visIcon = document.createElement('span');
    visIcon.className = 'radio-icon uploaded-icon';
    visIcon.textContent = track.is_public ? '🌐' : '🔒';
    visIcon.title = track.is_public ? 'Pública' : 'Privada';
    item.appendChild(visIcon);

    const info = document.createElement('div');
    info.className = 'radio-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'radio-name';
    nameEl.textContent = track.display_name;
    info.appendChild(nameEl);

    if (!isMine) {
        const meta = document.createElement('span');
        meta.className = 'radio-meta';
        meta.textContent = '🌐 compartida';
        info.appendChild(meta);
    } else if (track.album) {
        const meta = document.createElement('span');
        meta.className = 'radio-meta';
        meta.textContent = `💿 ${track.album}`;
        info.appendChild(meta);
    }

    item.appendChild(info);

    if (isMine) {
        const actions = document.createElement('div');
        actions.className = 'track-quick-actions';

        const visBtn = document.createElement('button');
        visBtn.type = 'button';
        visBtn.className = 'track-quick-btn';
        visBtn.title = track.is_public ? 'Hacer privada' : 'Hacer pública';
        visBtn.textContent = track.is_public ? '🔒' : '🌐';
        visBtn.onclick = async (e) => {
            e.stopPropagation();
            const newPublic = !track.is_public;
            try {
                const { error } = await supabaseClient
                    .from('music_tracks').update({ is_public: newPublic }).eq('id', track.id);
                if (error) throw error;
                track.is_public = newPublic;
                const fresh = renderTrackItem(track, index);
                item.replaceWith(fresh);
            } catch (err) { showToast('Error: ' + err.message, 'error'); }
        };

        const albumBtn = document.createElement('button');
        albumBtn.type = 'button';
        albumBtn.className = 'track-quick-btn';
        albumBtn.title = 'Mover a álbum…';
        albumBtn.textContent = '💿';
        albumBtn.onclick = (e) => { e.stopPropagation(); openAlbumPicker([track.id], track.album); };

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'track-quick-btn danger';
        delBtn.title = 'Eliminar canción';
        delBtn.textContent = '🗑️';
        delBtn.onclick = async (e) => {
            e.stopPropagation();
            if (!confirm(`¿Eliminar "${track.display_name}"?`)) return;
            try {
                // ¿Algún OTRO usuario activo sigue usando este mismo archivo
                // (mismo contenido)? Si sí, el archivo NO se toca: solo se
                // quita tu propia entrada de la lista.
                let otherRefs = 0;
                if (track.file_hash) {
                    const { data: refCount, error: countErr } = await supabaseClient
                        .rpc('count_other_active_refs', { p_hash: track.file_hash, p_exclude_id: track.id });
                    if (countErr) throw countErr;
                    otherRefs = refCount || 0;
                }

                if (track.file_hash && otherRefs > 0) {
                    const { error } = await supabaseClient.from('music_tracks').delete().eq('id', track.id);
                    if (error) throw error;
                } else {
                    // Eras la última persona con esta canción: no se borra al
                    // instante, va a la papelera 24 horas por si te arrepientes
                    // (botón "🗑️ Papelera"). Después se borra para siempre
                    // (lo hace el cron del Worker de Cloudflare).
                    const purgeAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                    const { error } = await supabaseClient
                        .from('music_tracks')
                        .update({ deleted_at: new Date().toISOString(), purge_at: purgeAt })
                        .eq('id', track.id);
                    if (error) throw error;
                    showToast('Nadie más tiene esta canción: se movió a la papelera. Puedes recuperarla durante 24 horas desde "🗑️ Papelera".', 'info');
                }
                await cacheDelete(track.id).catch(() => {});
                delete _cachedTrackIds[track.id];
                selectedTrackIds.delete(track.id);
                item.remove();
                const idx = currentResultsList.findIndex(t => t.id === track.id);
                if (idx !== -1) currentResultsList.splice(idx, 1);
                updateBulkActionBar();
            } catch (err) { showToast('No se pudo eliminar: ' + err.message, 'error'); }
        };

        actions.appendChild(visBtn);
        actions.appendChild(albumBtn);
        actions.appendChild(delBtn);
        actions.appendChild(createCacheButton(track));
        item.appendChild(actions);
    } else {
        // Canciones de otras personas en "Música compartida": no hay edición
        // ni borrado (no son tuyas), pero sí se pueden precargar para
        // offline igual que en "Mi música".
        const actions = document.createElement('div');
        actions.className = 'track-quick-actions';
        actions.appendChild(createCacheButton(track));
        item.appendChild(actions);
    }

    const playIcon = document.createElement('span');
    playIcon.className = 'radio-play-icon';
    playIcon.textContent = '▶';
    item.appendChild(playIcon);

    item.onclick = () => playUploadedTrack(track, index);

    requestAnimationFrame(() => activateMarqueeIfOverflows(nameEl));
    return item;
}

function ensureBulkActionBar() {
    let bar = document.getElementById('bulkShareBar');
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = 'bulkShareBar';
    bar.className = 'bulk-share-bar';
    bar.innerHTML = `
        <span id="bulkShareCount" class="bulk-share-count"></span>
        <button id="bulkSharePublicBtn" type="button">🌐 Públicas</button>
        <button id="bulkSharePrivateBtn" type="button">🔒 Privadas</button>
        <button id="bulkMoveAlbumBtn" type="button">💿 Álbum</button>
        <button id="bulkShareCancelBtn" type="button">✕</button>
    `;
    if (musicPanel) musicPanel.appendChild(bar);

    document.getElementById('bulkSharePublicBtn').addEventListener('click', () => bulkSetPublic(true));
    document.getElementById('bulkSharePrivateBtn').addEventListener('click', () => bulkSetPublic(false));
    document.getElementById('bulkMoveAlbumBtn').addEventListener('click', () => {
        if (selectedTrackIds.size === 0) return;
        openAlbumPicker([...selectedTrackIds], null);
    });
    document.getElementById('bulkShareCancelBtn').addEventListener('click', () => {
        selectedTrackIds.clear();
        document.querySelectorAll('.track-select-checkbox,.album-select-all').forEach(cb => { cb.checked = false; });
        updateBulkActionBar();
    });

    return bar;
}

function updateBulkActionBar() {
    const bar = ensureBulkActionBar();
    const count = selectedTrackIds.size;
    bar.style.display = count > 0 ? 'flex' : 'none';
    const countEl = document.getElementById('bulkShareCount');
    if (countEl) countEl.textContent = `${count} seleccionada${count === 1 ? '' : 's'}`;
}

async function bulkSetPublic(makePublic) {
    if (selectedTrackIds.size === 0) return;
    try {
        const { error } = await supabaseClient
            .from('music_tracks')
            .update({ is_public: makePublic })
            .in('id', [...selectedTrackIds]);
        if (error) throw error;

        selectedTrackIds.clear();
        if (currentMusicMode === 'shared') loadSharedTracks();
        else loadUploadedTracks();
    } catch (err) {
        console.error('Error al actualizar en lote:', err);
        showToast('No se pudo actualizar: ' + err.message, 'error');
    }
}

// Revoked object-URL from the previous blob playback (if any) to free memory.
let _lastBlobUrl = null;

async function playUploadedTrack(track, index = -1) {
    if (!audioPlayer) return;
    if (index >= 0) currentResultIndex = index;

    setCurrentTrackTitle('Cargando... ' + (track.display_name || ''));

    try {
        const { url, fromCache } = await getPlaybackUrl(track);

        if (_lastBlobUrl) { URL.revokeObjectURL(_lastBlobUrl); _lastBlobUrl = null; }
        if (url.startsWith('blob:')) _lastBlobUrl = url;

        audioPlayer.src = url;
        audioPlayer.play()
            .then(() => { isPlaying = true; if (playPauseBtn) playPauseBtn.textContent = '\u23F8'; })
            .catch(err => { console.error('Error al reproducir:', err); setCurrentTrackTitle('No se pudo reproducir este archivo'); });

        currentPlayingKey = track.file_name;
        updatePlayingHighlight();
        // Show disk icon in title when playing from local cache
        setCurrentTrackTitle((track.display_name || 'Reproduciendo...') + (fromCache ? ' \uD83D\uDCBE' : ''));
        updateMediaSessionMetadata(track.display_name, track.is_public ? '\uD83C\uDF10 P\u00FAblica' : '\uD83D\uDD12 Privada', null);
        if (musicPlayerBar) musicPlayerBar.style.display = 'flex';
        if (typeof repositionMusicPanel === 'function') repositionMusicPanel();

    } catch (err) {
        console.error('Error al reproducir:', err);

        // If network failed, try local cache as emergency fallback
        const cached = await cacheGet(track.id).catch(() => null);
        if (cached) {
            if (_lastBlobUrl) { URL.revokeObjectURL(_lastBlobUrl); _lastBlobUrl = null; }
            _lastBlobUrl = URL.createObjectURL(cached);
            audioPlayer.src = _lastBlobUrl;
            audioPlayer.play().then(() => { isPlaying = true; if (playPauseBtn) playPauseBtn.textContent = '\u23F8'; }).catch(() => {});
            setCurrentTrackTitle((track.display_name || '') + ' \uD83D\uDCBE (sin conexi\u00F3n)');
            currentPlayingKey = track.file_name;
            updatePlayingHighlight();
            if (musicPlayerBar) musicPlayerBar.style.display = 'flex';
            return;
        }

        const notFound = err && err.message && /not.?found/i.test(err.message);
        if (notFound && track.id) {
            const wantsDelete = confirm('"' + track.display_name + '" ya no existe en el almacenamiento. \u00BFQuitarla de tu lista?');
            if (wantsDelete) {
                try { await supabaseClient.from('music_tracks').delete().eq('id', track.id); loadUploadedTracks(); }
                catch (delErr) { console.error('Error al limpiar la fila hu\u00E9rfana:', delErr); }
                return;
            }
        }
        showToast('No se pudo acceder al archivo: ' + err.message, 'error');
    }
}


function askAlbumForUpload(fileCount) {
    return new Promise((resolve) => {
        const existingAlbums = [...new Set(
            (currentResultsList || []).map(t => (t.album || '').trim()).filter(Boolean)
        )].sort((a, b) => a.localeCompare(b));

        const modal = document.createElement('div');
        modal.className = 'album-picker-modal';

        const box = document.createElement('div');
        box.className = 'album-picker-box';

        const title = document.createElement('p');
        title.className = 'album-picker-title';
        title.textContent = `¿A qué álbum van ${fileCount > 1 ? `estas ${fileCount} canciones` : 'esta canción'}?`;
        box.appendChild(title);

        const list = document.createElement('div');
        list.className = 'album-picker-list';

        const noAlbumOpt = document.createElement('button');
        noAlbumOpt.className = 'album-picker-option';
        noAlbumOpt.innerHTML = '<span>📁</span><span>Sin álbum</span>';
        noAlbumOpt.onclick = () => { modal.remove(); resolve(null); };
        list.appendChild(noAlbumOpt);

        existingAlbums.forEach(name => {
            const opt = document.createElement('button');
            opt.className = 'album-picker-option';
            opt.innerHTML = `<span>💿</span><span>${name}</span>`;
            opt.onclick = () => { modal.remove(); resolve(name); };
            list.appendChild(opt);
        });

        box.appendChild(list);

        const newRow = document.createElement('div');
        newRow.className = 'album-picker-new-row';
        const newInput = document.createElement('input');
        newInput.className = 'album-picker-new-input';
        newInput.placeholder = 'Nuevo álbum…';
        const newBtn = document.createElement('button');
        newBtn.className = 'album-picker-new-btn';
        newBtn.textContent = '+ Crear';
        newBtn.onclick = () => {
            const name = newInput.value.trim();
            if (!name) return;
            modal.remove();
            resolve(name);
        };
        newInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') newBtn.click(); });
        newRow.appendChild(newInput);
        newRow.appendChild(newBtn);
        box.appendChild(newRow);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'album-picker-cancel';
        cancelBtn.textContent = 'Cancelar subida';
        cancelBtn.onclick = () => { modal.remove(); resolve(false); };
        box.appendChild(cancelBtn);

        modal.appendChild(box);
        document.body.appendChild(modal);
        setTimeout(() => newInput.focus(), 80);
    });
}

if (uploadMusicInput) {
    uploadMusicInput.addEventListener('change', async () => {
        const files = Array.from(uploadMusicInput.files || []);
        if (files.length === 0) return;
        if (!currentUserId) { showToast('Debes iniciar sesión para subir música.', 'warn'); return; }

        const albumChoice = await askAlbumForUpload(files.length);
        if (albumChoice === false) {
            uploadMusicInput.value = '';
            return;
        }
        const albumValue = albumChoice || null;

        radioResults.innerHTML = '<div class="radio-status">⬆️ Subiendo...</div>';

        const failed = [];
        const skippedDuplicates = [];

        let existingNames = new Set();
        try {
            const { data: existing, error: existingErr } = await supabaseClient
                .from('music_tracks')
                .select('display_name')
                .eq('user_id', currentUserId);
            if (existingErr) throw existingErr;
            existingNames = new Set(
                (existing || []).map(t => t.display_name.trim().toLowerCase())
            );
        } catch (err) {
            console.error('No se pudo verificar canciones existentes:', err);
        }

        let linkedShared = 0; // canciones que ya tenía otro usuario: solo se enlazaron

        for (const file of files) {
            try {
                const displayName = file.name.replace(/\.[^/.]+$/, '');
                const normalizedName = displayName.trim().toLowerCase();

                if (existingNames.has(normalizedName)) {
                    skippedDuplicates.push(file.name);
                    continue;
                }

                // Hash del contenido: si OTRO usuario ya subió exactamente esta
                // canción (aunque con otro nombre), no se vuelve a guardar el
                // archivo: se reutiliza el mismo y solo se crea TU fila
                // (tu nombre, tu álbum, privada por defecto).
                const fileHash = await computeFileHash(file);
                let fileName;

                const { data: sharedFileName, error: hashErr } = await supabaseClient
                    .rpc('find_active_track_by_hash', { p_hash: fileHash });
                if (hashErr) console.error('No se pudo verificar duplicados por contenido:', hashErr);

                if (sharedFileName) {
                    fileName = sharedFileName;
                    linkedShared++;
                } else {
                    // Archivo nuevo: el Worker lo guarda en Cloudflare R2 con
                    // un nombre único y devuelve la clave ("music/<usuario>/...").
                    const uploaded = await uploadToR2('music', file);
                    fileName = uploaded.key;
                }

                const { error: dbErr } = await supabaseClient
                    .from('music_tracks')
                    .insert([{
                        user_id: currentUserId, file_name: fileName, file_hash: fileHash,
                        display_name: displayName, is_public: false, album: albumValue
                    }]);
                if (dbErr) throw dbErr;

                existingNames.add(normalizedName);
            } catch (err) {
                console.error(`Error al subir "${file.name}":`, err);
                const reason = (err && err.message) ? err.message : 'error desconocido';
                failed.push(`${file.name} — ${reason}`);
            }
        }

        const messages = [];
        if (linkedShared > 0) {
            showToast(`${linkedShared} canción(es) ya existían subidas por otro usuario: se agregaron a tu lista sin duplicar el archivo.`, 'ok');
        }
        if (skippedDuplicates.length > 0) {
            messages.push(`Ya tenías ${skippedDuplicates.length} de estas canciones, no se volvieron a subir:\n${skippedDuplicates.join('\n')}`);
        }
        if (failed.length > 0) {
            messages.push(`No se pudieron subir ${failed.length} archivo(s):\n${failed.join('\n')}`);
        }
        messages.forEach(m => showToast(m, m.includes('No se pudo') ? 'error' : 'warn'));

        await loadUploadedTracks();
        uploadMusicInput.value = '';
    });
}


function runSearch(query) {
    if (currentMusicMode === 'radio') {
        searchRadioStations(query);
    } else {
        musicSearchFilter = (query || '').trim().toLowerCase();
        if (currentMusicMode === 'shared') loadSharedTracks();
        else loadUploadedTracks();
    }
}

async function searchRadioStations(query) {
    if (!radioResults) return;
    radioResults.innerHTML = '<div class="radio-status">🔎 Buscando estaciones...</div>';

    try {
        const [byNameRes, byTagRes] = await Promise.all([
            fetch(`${RADIO_API}?name=${encodeURIComponent(query)}&limit=30&hidebroken=true&order=clickcount&reverse=true`),
            fetch(`${RADIO_API}?tag=${encodeURIComponent(query)}&limit=30&hidebroken=true&order=clickcount&reverse=true`)
        ]);

        const byName = byNameRes.ok ? await byNameRes.json() : [];
        const byTag = byTagRes.ok ? await byTagRes.json() : [];

        const seen = new Set();
        const merged = [...byName, ...byTag].filter(station => {
            const key = station.stationuuid || station.url_resolved;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        renderRadioResults(merged);
    } catch (err) {
        console.error('Error buscando estaciones de radio:', err);
        radioResults.innerHTML = '<div class="radio-status">⚠️ Error al buscar. Intenta de nuevo.</div>';
    }
}

function renderRadioResults(stations) {
    radioResults.innerHTML = '';

    const validStations = (stations || []).filter(s => s.url_resolved);

    if (validStations.length === 0) {
        radioResults.innerHTML = '<div class="radio-status">Sin resultados para esa búsqueda.</div>';
        return;
    }

    currentResultsList = validStations;

    validStations.forEach((station, index) => {
        const item = document.createElement('div');
        item.className = 'radio-item';
        item.dataset.stationKey = station.url_resolved;

        const icon = document.createElement('img');
        icon.className = 'radio-icon';
        icon.src = station.favicon || '';
        icon.alt = '';
        icon.onerror = () => { icon.style.visibility = 'hidden'; };

        const info = document.createElement('div');
        info.className = 'radio-info';

        const name = document.createElement('span');
        name.className = 'radio-name';
        name.textContent = station.name || 'Estación sin nombre';

        const meta = document.createElement('span');
        meta.className = 'radio-meta';
        meta.textContent = [station.country, station.bitrate ? `${station.bitrate}kbps` : null]
            .filter(Boolean)
            .join(' · ');

        info.appendChild(name);
        info.appendChild(meta);

        const playIcon = document.createElement('span');
        playIcon.className = 'radio-play-icon';
        playIcon.textContent = '▶';

        item.appendChild(icon);
        item.appendChild(info);
        item.appendChild(playIcon);

        item.onclick = () => playRadioStation(station, index);
        radioResults.appendChild(item);
        requestAnimationFrame(() => activateMarqueeIfOverflows(name));
    });

    updatePlayingHighlight();
}

function playRadioStation(station, index = -1) {
    if (!audioPlayer) return;
    if (index >= 0) currentResultIndex = index;
    audioPlayer.src = station.url_resolved;
    audioPlayer.play()
        .then(() => {
            isPlaying = true;
            if (playPauseBtn) playPauseBtn.textContent = '⏸';
        })
        .catch(err => {
            console.error('Error al reproducir la estación:', err);
            setCurrentTrackTitle('No se pudo reproducir esta estación');
        });

    currentPlayingKey = station.url_resolved;
    updatePlayingHighlight();
    setCurrentTrackTitle(station.name || 'Reproduciendo...');
    updateMediaSessionMetadata(station.name, station.country, station.favicon);

    if (musicPlayerBar) musicPlayerBar.style.display = 'flex';
    repositionMusicPanel();
}

if (searchMusicBtn) {
    searchMusicBtn.addEventListener('click', () => {
        const query = musicInput.value.trim();
        if (currentMusicMode === 'radio') {
            if (query) runSearch(query);
        } else {
            runSearch(query);
        }
    });
}

if (musicInput) {
    musicInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = musicInput.value.trim();
            if (currentMusicMode === 'radio') {
                if (query) runSearch(query);
            } else {
                runSearch(query);
            }
        }
    });

    musicInput.addEventListener('input', () => {
        if (currentMusicMode === 'radio') return;
        runSearch(musicInput.value);
    });
}

if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
        if (!audioPlayer || !audioPlayer.src) return;
        if (isPlaying) {
            audioPlayer.pause();
            isPlaying = false;
            playPauseBtn.textContent = '▶';
        } else {
            audioPlayer.play();
            isPlaying = true;
            playPauseBtn.textContent = '⏸';
        }
    });
}

function playByIndex(index) {
    if (!currentResultsList || currentResultsList.length === 0) return;

    const total = currentResultsList.length;
    const safeIndex = ((index % total) + total) % total;
    const item = currentResultsList[safeIndex];

    if (currentMusicMode === 'radio') {
        playRadioStation(item, safeIndex);
    } else {
        playUploadedTrack(item, safeIndex);
    }
}

if (nextTrackBtn) {
    nextTrackBtn.addEventListener('click', () => {
        if (currentResultIndex === -1) return;
        playByIndex(currentResultIndex + 1);
    });
}

if (prevTrackBtn) {
    prevTrackBtn.addEventListener('click', () => {
        if (currentResultIndex === -1) return;
        playByIndex(currentResultIndex - 1);
    });
}

function openMusicPanel() {
    if (!musicPanel) return;
    musicPanel.classList.add('open');
    if (chatContainer) chatContainer.classList.add('music-panel-open');
    if (musicPlayerBar) musicPlayerBar.classList.add('raised-above-panels');
    if (musicProgressBar) musicProgressBar.classList.add('raised-above-panels');
    syncSidebarModeOnResize();
    repositionMusicPanel();
    if (!musicPanel.dataset.opened) {
        setMusicMode('uploads');
        musicPanel.dataset.opened = '1';
    } else if (!currentResultsList || currentResultsList.length === 0) {
        // Reabriendo el panel después de que la última carga falló (p. ej. se
        // salió sin conexión) — reintenta en la pestaña donde estaba en vez
        // de quedarse con la lista vacía/el error viejo en pantalla.
        setMusicMode(currentMusicMode);
    }
    if (typeof hideDimControls === 'function') hideDimControls('hidden-by-music');
}

// Si la conexión vuelve mientras el panel de música está abierto, recarga
// automáticamente la pestaña actual para reemplazar el modo offline por los
// datos reales (y viceversa: avisa si se pierde la conexión).
window.addEventListener('online', () => {
    if (musicPanel && musicPanel.classList.contains('open')) {
        showToast('Conexión recuperada', 'ok');
        setMusicMode(currentMusicMode);
    }
});
window.addEventListener('offline', () => {
    if (musicPanel && musicPanel.classList.contains('open')) {
        showToast('Sin conexión — modo offline', 'warn');
    }
});

function closeMusicPanel() {
    if (!musicPanel) return;
    musicPanel.classList.remove('open');
    if (chatContainer) chatContainer.classList.remove('music-sidebar-open');
    if (chatContainer) chatContainer.classList.remove('music-panel-open');
    musicPanel.style.top = '';
    musicPanel.style.height = '';
    if (musicPlayerBar) musicPlayerBar.classList.remove('raised-above-panels');
    if (musicProgressBar) musicProgressBar.classList.remove('raised-above-panels');
    if (typeof showDimControls === 'function') showDimControls('hidden-by-music');
}

function syncSidebarModeOnResize() {
    if (chatContainer && musicPanel && musicPanel.classList.contains('open')) {
        chatContainer.classList.toggle('music-sidebar-open', window.innerWidth >= 960);
    }
    repositionMusicPanel();
}
window.addEventListener('resize', syncSidebarModeOnResize);

function repositionMusicPanel() {
    if (chatContainer && musicPlayerBar) {
        const barHeight = musicPlayerBar.style.display !== 'none' ? musicPlayerBar.offsetHeight : 0;
        chatContainer.style.setProperty('--progress-bar-sticky-top', `${barHeight}px`);
    }

    if (!musicPanel || !chatContainer) return;
    if (chatContainer.classList.contains('music-sidebar-open')) {
        musicPanel.style.top = '';
        musicPanel.style.height = '';
        return;
    }
    let offset = 0;
    const chatHeaderEl = chatContainer.querySelector('.chat-header');
    if (chatHeaderEl) offset += chatHeaderEl.offsetHeight;
    if (musicPlayerBar && musicPlayerBar.style.display !== 'none') {
        offset += musicPlayerBar.offsetHeight;
    }
    if (musicProgressBar && musicProgressBar.style.display !== 'none') {
        offset += musicProgressBar.offsetHeight;
    }
    musicPanel.style.top = `${offset}px`;
    musicPanel.style.height = `calc(100% - ${offset}px)`;
}

if (musicToggle && musicPanel) {
    musicToggle.addEventListener('click', () => {
        if (musicPanel.classList.contains('open')) closeMusicPanel();
        else openMusicPanel();
    });
}

if (musicPanelCloseBtn) {
    musicPanelCloseBtn.addEventListener('click', closeMusicPanel);
}

if (typeof repositionMusicPanel === 'function') repositionMusicPanel();

function updateVolumeIcon(volume, muted) {
    if (!muteBtn) return;
    if (muted || volume === 0) {
        muteBtn.textContent = '🔇';
    } else if (volume < 0.5) {
        muteBtn.textContent = '🔉';
    } else {
        muteBtn.textContent = '🔊';
    }
}

if (audioPlayer) {
    const savedVolume = localStorage.getItem('radioVolume');
    lastVolume = savedVolume !== null ? parseFloat(savedVolume) : 0.8;
    audioPlayer.volume = lastVolume;
    if (volumeSlider) volumeSlider.value = Math.round(lastVolume * 100);
    updateVolumeIcon(lastVolume, false);
}

if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
        const value = parseInt(volumeSlider.value, 10) / 100;
        if (audioPlayer) audioPlayer.volume = value;
        isMuted = value === 0;
        if (value > 0) lastVolume = value;
        localStorage.setItem('radioVolume', value);
        updateVolumeIcon(value, isMuted);
    });
}

// En ventanas bajas (@media max-height: 700px, ver styles.css), el slider
// de volumen arranca colapsado para ahorrar espacio, y este mismo botón
// 🔊/🔇 lo despliega. Antes, el primer toque mostraba el slider PERO
// también muteaba de una vez — molesto si solo querías subir/bajar el
// volumen. Ahora: si el slider está colapsado, el primer toque solo lo
// despliega (sin mutear); silenciar/reactivar queda para un toque
// posterior, con el slider ya visible. En ventanas normales (donde el
// slider siempre está visible) el botón sigue muteando de inmediato.
const shortWindowQuery = window.matchMedia('(max-height: 700px)');

if (muteBtn) {
    muteBtn.addEventListener('click', () => {
        if (!audioPlayer) return;

        const volumeControlEl = muteBtn.closest('.volume-control');
        const isCollapsed = shortWindowQuery.matches &&
            volumeControlEl && !volumeControlEl.classList.contains('volume-expanded');

        if (isCollapsed) {
            volumeControlEl.classList.add('volume-expanded');
            return;
        }

        if (isMuted) {
            audioPlayer.volume = lastVolume;
            if (volumeSlider) volumeSlider.value = Math.round(lastVolume * 100);
            isMuted = false;
        } else {
            lastVolume = audioPlayer.volume > 0 ? audioPlayer.volume : lastVolume;
            audioPlayer.volume = 0;
            if (volumeSlider) volumeSlider.value = 0;
            isMuted = true;
        }
        updateVolumeIcon(audioPlayer.volume, isMuted);
    });
}

document.addEventListener('click', (e) => {
    if (e.target.closest('.volume-control')) return;
    const expanded = document.querySelector('.volume-control.volume-expanded');
    if (expanded) expanded.classList.remove('volume-expanded');
});
