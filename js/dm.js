// js/dm.js
// Mensajes privados 1 a 1 + chat propio ("Notas personales").
// El chat propio usa una conversación donde user_a === user_b === currentUserId.
// Requiere que la constraint UNIQUE de conversations permita eso, o que uses
// maybeSingle() sin restricción de unicidad en ese caso.

let currentConversationId = null;
let currentOtherUser = null; // { id, username }
let dmChannel = null;
// true cuando un admin real está viendo una conversación de OTRAS 2 personas
// (ninguno de los 2 es él) — cambia cómo se pintan las burbujas (por
// username en vez de "yo/otro") y habilita editar/ocultar ajenos.
let adminViewingOthers = false;
let adminViewingProfilesMap = {}; // { userId: username } de la conversación abierta como admin

function showDmListView() {
    if (dmListView) dmListView.style.display = 'flex';
    if (dmChatView) dmChatView.style.display = 'none';
    if (dmBackBtn) dmBackBtn.style.display = 'none';
    if (dmTitle) dmTitle.textContent = 'Mensajes privados';
    unsubscribeDmChannel();
    currentConversationId = null;
    currentOtherUser = null;
    adminViewingOthers = false;
    loadMyConversations();
    ensureDmAdminButton();
}

// Botón "🛠️ Todas las conversaciones" — solo aparece si isAdmin (cosmético)
// Y myIsRealAdmin (real, verificado por RLS). Sin ambos, ni se muestra ni
// funcionaría: la consulta de loadAllConversationsAdmin() simplemente no
// devolvería nada por las políticas de la base de datos.
function ensureDmAdminButton() {
    let btn = document.getElementById('dmAdminAllBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'dmAdminAllBtn';
        btn.textContent = '🛠️ Todas las conversaciones (Admin)';
        btn.className = 'dm-admin-all-btn';
        btn.addEventListener('click', loadAllConversationsAdmin);
        if (dmListView) dmListView.insertBefore(btn, dmListView.firstChild);
    }
    btn.style.display = (isAdmin && myIsRealAdmin) ? 'block' : 'none';
}

function openConversationView() {
    if (!currentOtherUser) return;
    if (dmListView) dmListView.style.display = 'none';
    if (dmChatView) dmChatView.style.display = 'flex';
    if (dmBackBtn) dmBackBtn.style.display = 'inline-block';

    if (dmTitle) {
        if (adminViewingOthers) {
            dmTitle.textContent = `🛠️ ${currentOtherUser.username}`;
        } else {
            dmTitle.textContent = currentOtherUser.id === currentUserId
                ? '📝 Notas personales'
                : currentOtherUser.username;
        }
    }
    if (dmMessages) dmMessages.innerHTML = '';
    loadDmMessages();
    subscribeDmChannel();
}

function closeDmPanel() {
    if (dmPanel) dmPanel.style.display = 'none';
    if (typeof showDimControls === 'function') showDimControls('hidden-by-dm');
    unsubscribeDmChannel();
}

if (dmToggle) {
    dmToggle.addEventListener('click', () => {
        if (isGuest) { alert('Inicia sesión con tu cuenta para usar mensajes privados.'); return; }
        if (dmPanel) dmPanel.style.display = 'flex';
        if (typeof hideDimControls === 'function') hideDimControls('hidden-by-dm');
        showDmListView();
    });
}

if (dmCloseBtn) dmCloseBtn.addEventListener('click', closeDmPanel);
if (dmBackBtn) dmBackBtn.addEventListener('click', showDmListView);

function buildDmUserItem(username, label, onClick) {
    const item = document.createElement('div');
    item.className = 'dm-user-item';

    const avatar = document.createElement('div');
    avatar.className = 'dm-user-avatar';
    avatar.textContent = (label || username || '?').charAt(0).toUpperCase();

    const name = document.createElement('span');
    name.className = 'dm-user-name';
    name.textContent = label || username || 'Usuario';

    item.appendChild(avatar);
    item.appendChild(name);
    item.onclick = onClick;
    return item;
}

async function searchUsers(query) {
    if (!dmResults) return;
    if (!query) { dmResults.innerHTML = ''; return; }
    dmResults.innerHTML = '<div class="dm-empty">🔎 Buscando...</div>';
    try {
        const { data, error } = await supabaseClient
            .from('profiles').select('id, username')
            .ilike('username', `%${query}%`)
            // Include self so user can open their own notes by searching their name
            .limit(10);
        if (error) throw error;
        if (!data || data.length === 0) {
            dmResults.innerHTML = '<div class="dm-empty">Sin resultados.</div>';
            return;
        }
        dmResults.innerHTML = '';
        data.forEach(profile => {
            const isSelf = profile.id === currentUserId;
            const label = isSelf ? `${profile.username} (tú · Notas)` : profile.username;
            const item = buildDmUserItem(profile.username, label, async () => {
                try { await openConversationWith(profile.id, profile.username); }
                catch (err) { console.error(err); alert('No se pudo abrir la conversación.'); }
            });
            dmResults.appendChild(item);
        });
    } catch (err) {
        console.error(err);
        dmResults.innerHTML = '<div class="dm-empty">Error al buscar.</div>';
    }
}

if (dmSearchBtn) {
    dmSearchBtn.addEventListener('click', () => searchUsers(dmSearchInput.value.trim()));
}
if (dmSearchInput) {
    dmSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); searchUsers(dmSearchInput.value.trim()); }
    });
}

// Opens or creates a conversation. Self-chat: user_a === user_b === currentUserId.
async function openConversationWith(otherId, otherUsername) {
    const isSelf = otherId === currentUserId;
    let a, b;
    if (isSelf) {
        a = currentUserId;
        b = currentUserId;
    } else {
        [a, b] = [currentUserId, otherId].sort();
    }

    // For self-chat we match both columns to currentUserId
    let query = supabaseClient.from('conversations').select('id');
    if (isSelf) {
        query = query.eq('user_a', a).eq('user_b', b);
    } else {
        query = query.eq('user_a', a).eq('user_b', b);
    }
    const { data: existing, error: selError } = await query.maybeSingle();
    if (selError) throw selError;

    let conversation = existing;
    if (!conversation) {
        const { data: created, error: insError } = await supabaseClient
            .from('conversations')
            .insert([{ user_a: a, user_b: b }])
            .select().single();
        if (insError) throw insError;
        conversation = created;
    }

    currentConversationId = conversation.id;
    currentOtherUser = { id: otherId, username: otherUsername };
    adminViewingOthers = false;
    openConversationView();
}

// Lista TODAS las conversaciones del sistema, sin importar quién participa.
// Solo devuelve datos si tu cuenta tiene profiles.is_admin = true en la base
// de datos — la política RLS de 'conversations' es la que realmente decide
// esto, no esta función ni la variable isAdmin del navegador.
async function loadAllConversationsAdmin() {
    if (!dmConversations) return;
    dmConversations.innerHTML = '<div class="dm-empty">Cargando todas las conversaciones...</div>';

    try {
        const { data: convos, error } = await supabaseClient
            .from('conversations')
            .select('id, user_a, user_b, created_at')
            .order('created_at', { ascending: false });
        if (error) throw error;

        if (!convos || convos.length === 0) {
            dmConversations.innerHTML = '<div class="dm-empty">No hay conversaciones (o tu cuenta no tiene is_admin=true en profiles — ver ADMIN_SETUP.sql).</div>';
            return;
        }

        const allIds = [...new Set(convos.flatMap(c => [c.user_a, c.user_b]))];
        const { data: profiles, error: profError } = await supabaseClient
            .from('profiles').select('id, username').in('id', allIds);
        if (profError) throw profError;

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p.username; });

        dmConversations.innerHTML = '';
        convos.forEach(c => {
            const nameA = profileMap[c.user_a] || '¿?';
            const nameB = profileMap[c.user_b] || '¿?';
            const isSelfChat = c.user_a === c.user_b;
            const label = isSelfChat ? `📝 Notas de ${nameA}` : `${nameA} ↔ ${nameB}`;

            const item = buildDmUserItem('', label, () => {
                adminViewingOthers = true;
                adminViewingProfilesMap = { [c.user_a]: nameA, [c.user_b]: nameB };
                currentConversationId = c.id;
                currentOtherUser = { id: isSelfChat ? c.user_a : null, username: label };
                openConversationView();
            });
            dmConversations.appendChild(item);
        });
    } catch (err) {
        console.error(err);
        dmConversations.innerHTML = '<div class="dm-empty">Error al cargar todas las conversaciones.</div>';
    }
}

async function loadMyConversations() {
    if (!dmConversations || !currentUserId) return;
    dmConversations.innerHTML = '<div class="dm-empty">Cargando...</div>';
    try {
        const { data: convos, error } = await supabaseClient
            .from('conversations').select('id, user_a, user_b, created_at')
            .or(`user_a.eq.${currentUserId},user_b.eq.${currentUserId}`)
            .order('created_at', { ascending: false });
        if (error) throw error;

        if (!convos || convos.length === 0) {
            dmConversations.innerHTML = '<div class="dm-empty">Aún no tienes conversaciones.</div>';
            return;
        }

        const otherIds = [...new Set(
            convos.map(c => c.user_a === currentUserId ? c.user_b : c.user_a)
        )];

        const { data: profiles, error: profError } = await supabaseClient
            .from('profiles').select('id, username').in('id', otherIds);
        if (profError) throw profError;

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p.username; });

        dmConversations.innerHTML = '';

        // Pin self-chat at the top as "Notas personales"
        const selfConvo = convos.find(c => c.user_a === c.user_b);
        if (selfConvo) {
            const item = buildDmUserItem('', '📝 Notas personales', () => {
                currentConversationId = selfConvo.id;
                currentOtherUser = { id: currentUserId, username: myUsername };
                adminViewingOthers = false;
                openConversationView();
            });
            dmConversations.appendChild(item);
        }

        convos.forEach(c => {
            if (c.user_a === c.user_b) return; // already rendered above
            const otherId = c.user_a === currentUserId ? c.user_b : c.user_a;
            const otherName = profileMap[otherId] || 'Usuario';
            const item = buildDmUserItem(otherName, otherName, () => {
                currentConversationId = c.id;
                currentOtherUser = { id: otherId, username: otherName };
                adminViewingOthers = false;
                openConversationView();
            });
            dmConversations.appendChild(item);
        });
    } catch (err) {
        console.error(err);
        dmConversations.innerHTML = '<div class="dm-empty">Error al cargar conversaciones.</div>';
    }
}

// Opens self-chat directly from a "Notas" shortcut button injected in the DM header
function injectSelfChatShortcut() {
    if (document.getElementById('selfChatBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'selfChatBtn';
    btn.textContent = '📝';
    btn.title = 'Mis notas personales';
    btn.style.cssText = `
        background:none;border:none;color:#3ecf8e;font-size:1.2em;cursor:pointer;
        flex-shrink:0;padding:0 4px;
    `;
    btn.addEventListener('click', async () => {
        if (!currentUserId) return;
        try {
            await openConversationWith(currentUserId, myUsername || 'Yo');
        } catch (err) {
            console.error(err);
        }
    });
    // Insert after back button in dm-header
    const dmHeader = document.querySelector('.dm-header');
    if (dmHeader) dmHeader.appendChild(btn);
}

function renderDmMessage(msg) {
    if (!dmMessages) return;

    // Si está oculto y no somos admin real viéndolo, no se muestra (igual
    // que el chat general).
    if (msg.hidden && !(isAdmin && myIsRealAdmin)) return;

    const isMe = !adminViewingOthers && msg.sender_id === currentUserId;
    const div = document.createElement('div');
    div.className = `message ${isMe ? 'sent' : 'received'}` + (msg.hidden ? ' msg-deleted' : '');
    div.dataset.msgId = msg.id;

    // Viendo una conversación ajena como admin: identificar quién mandó cada
    // mensaje por su username, ya que ninguno de los 2 es "yo".
    if (adminViewingOthers) {
        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'display:block;font-size:0.72em;font-weight:bold;color:#3ecf8e;margin-bottom:3px;opacity:0.9;';
        nameSpan.textContent = adminViewingProfilesMap[msg.sender_id] || 'Usuario';
        if (msg.hidden) {
            const delBadge = document.createElement('span');
            delBadge.textContent = ' 🗑️ Eliminado';
            delBadge.style.cssText = 'color:#ff4d4d;font-weight:normal;';
            nameSpan.appendChild(delBadge);
        }
        div.appendChild(nameSpan);
    }

    if (msg.text) {
        const p = document.createElement('p');
        p.style.margin = '0';
        p.style.whiteSpace = 'pre-wrap';
        if (msg.hidden) { p.style.textDecoration = 'line-through'; p.style.opacity = '0.6'; }
        p.textContent = msg.text;
        div.appendChild(p);
    }
    if (msg.image_url) {
        const img = document.createElement('img');
        img.src = msg.image_url;
        div.appendChild(img);
    }

    if (msg.edited_at && msg.original_text) {
        const editedNote = document.createElement('p');
        editedNote.style.cssText = 'margin:2px 0 0 0;font-size:0.72em;opacity:0.65;';
        editedNote.innerHTML = `✏️ editado · original: <span style="text-decoration:line-through;">${msg.original_text.replace(/</g, '&lt;')}</span>`;
        div.appendChild(editedNote);
    }

    const dateObj = msg.created_at ? new Date(msg.created_at) : new Date();
    const timeSpan = document.createElement('span');
    timeSpan.className = 'msg-time';
    timeSpan.textContent = `${String(dateObj.getHours()).padStart(2,'0')}:${String(dateObj.getMinutes()).padStart(2,'0')}`;
    div.appendChild(timeSpan);

    // Editar/ocultar: solo en modo super-admin (isAdmin cosmético + admin real)
    if (isAdmin && myIsRealAdmin) {
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-edit';
        editBtn.textContent = '✏️';
        editBtn.title = 'Editar mensaje';
        editBtn.onclick = () => editDmMessage(msg.id, msg.text || '');
        div.appendChild(editBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-delete';
        delBtn.textContent = msg.hidden ? '↺' : '×';
        delBtn.title = msg.hidden ? 'Restaurar mensaje' : 'Ocultar mensaje';
        delBtn.onclick = () => toggleHideDmMessage(msg.id, !msg.hidden);
        div.appendChild(delBtn);
    }

    dmMessages.appendChild(div);
}

// Edita un mensaje privado, guardando el original la primera vez (solo admin real)
async function editDmMessage(id, currentText) {
    if (!(isAdmin && myIsRealAdmin)) return;
    const newText = prompt('Editar mensaje:', currentText);
    if (newText === null || newText === currentText) return;

    try {
        const { data: existing, error: fetchErr } = await supabaseClient
            .from('private_messages')
            .select('original_text, text')
            .eq('id', id)
            .single();
        if (fetchErr) throw fetchErr;

        const { error } = await supabaseClient
            .from('private_messages')
            .update({
                text: newText,
                edited_at: new Date().toISOString(),
                original_text: existing.original_text || existing.text
            })
            .eq('id', id);
        if (error) throw error;

        rerenderDmMessage(id);
    } catch (err) {
        console.error(err);
        alert('Error al editar el mensaje.');
    }
}

// Oculta/restaura un mensaje privado (solo admin real)
async function toggleHideDmMessage(id, hidden) {
    if (!(isAdmin && myIsRealAdmin)) return;
    try {
        const { error } = await supabaseClient
            .from('private_messages')
            .update({ hidden })
            .eq('id', id);
        if (error) throw error;
        rerenderDmMessage(id);
    } catch (err) {
        console.error(err);
        alert('Error al actualizar el mensaje.');
    }
}

// Vuelve a traer un único mensaje y lo redibuja en su lugar
async function rerenderDmMessage(id) {
    try {
        const { data, error } = await supabaseClient
            .from('private_messages').select('*').eq('id', id).single();
        if (error) throw error;
        const el = dmMessages ? dmMessages.querySelector(`[data-msg-id="${id}"]`) : null;
        if (el) el.remove();
        renderDmMessage(data);
    } catch (err) {
        console.error('Error al refrescar el mensaje:', err);
    }
}

async function loadDmMessages() {
    if (!dmMessages || !currentConversationId) return;
    try {
        const { data, error } = await supabaseClient
            .from('private_messages').select('*')
            .eq('conversation_id', currentConversationId)
            .order('created_at', { ascending: true }).limit(200);
        if (error) throw error;
        (data || []).forEach(msg => {
            dmRenderedIds.add(msg.id);
            if (msg.id > dmLastKnownId) dmLastKnownId = msg.id;
            renderDmMessage(msg);
        });
        dmMessages.scrollTop = dmMessages.scrollHeight;
    } catch (err) {
        console.error(err);
        dmMessages.innerHTML = '<div class="dm-empty">Error al cargar la conversación.</div>';
    }
}

// IDs already rendered so we never show a message twice regardless of
// whether it arrived via Realtime or the polling fallback.
const dmRenderedIds = new Set();
let dmPollInterval = null;
let dmLastKnownId = 0;

function subscribeDmChannel() {
    unsubscribeDmChannel();
    if (!currentConversationId) return;

    const convId = currentConversationId;
    dmLastKnownId = 0; // reset so poll fetches from current state

    // ── Realtime (best-effort) ──────────────────────────────────────────
    // Listen without a server-side filter and discard unrelated events
    // client-side. This avoids a Supabase bug where filtered channels
    // silently miss events when sender_id === receiver_id (self-chat).
    dmChannel = supabaseClient
        .channel(`dm-conv-${convId}-${Date.now()}`)
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'private_messages'
        }, payload => {
            const msg = payload.new;
            if (msg.conversation_id !== convId) return;
            if (dmRenderedIds.has(msg.id)) return;
            dmRenderedIds.add(msg.id);
            if (msg.id > dmLastKnownId) dmLastKnownId = msg.id;
            renderDmMessage(msg);
            if (dmMessages) dmMessages.scrollTop = dmMessages.scrollHeight;
        })
        .subscribe((status) => {
            // If Realtime subscription fails or is not enabled for the table,
            // fall back to polling every 2 seconds.
            if (status === 'SUBSCRIBED') {
                console.log('[DM] Realtime activo para conversación', convId);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.warn('[DM] Realtime no disponible, activando polling');
                startDmPolling(convId);
            }
        });

    // ── Polling fallback (always active as safety net) ──────────────────
    // Runs every 2 s and fetches only messages newer than the last known id.
    // When Realtime works, the poll finds nothing new and is a no-op.
    startDmPolling(convId);
}

function startDmPolling(convId) {
    stopDmPolling();
    dmPollInterval = setInterval(async () => {
        if (currentConversationId !== convId) { stopDmPolling(); return; }
        try {
            let query = supabaseClient
                .from('private_messages')
                .select('*')
                .eq('conversation_id', convId)
                .order('id', { ascending: true })
                .limit(20);

            // Only fetch messages newer than what we already have
            if (dmLastKnownId > 0) query = query.gt('id', dmLastKnownId);

            const { data, error } = await query;
            if (error) throw error;
            (data || []).forEach(msg => {
                if (dmRenderedIds.has(msg.id)) return;
                dmRenderedIds.add(msg.id);
                if (msg.id > dmLastKnownId) dmLastKnownId = msg.id;
                renderDmMessage(msg);
                if (dmMessages) dmMessages.scrollTop = dmMessages.scrollHeight;
            });
        } catch (err) {
            console.error('[DM] Poll error:', err);
        }
    }, 2000);
}

function stopDmPolling() {
    if (dmPollInterval) { clearInterval(dmPollInterval); dmPollInterval = null; }
}

function unsubscribeDmChannel() {
    stopDmPolling();
    if (dmChannel) { supabaseClient.removeChannel(dmChannel); dmChannel = null; }
    dmRenderedIds.clear();
    dmLastKnownId = 0;
}

async function sendDmMessage() {
    if (!dmMsgInput || !currentConversationId) return;
    const text = dmMsgInput.value.trim();
    if (!text) return;
    if (dmSendBtn) dmSendBtn.disabled = true;
    try {
        const { error } = await supabaseClient
            .from('private_messages')
            .insert([{ conversation_id: currentConversationId, sender_id: currentUserId, text }]);
        if (error) throw error;
        dmMsgInput.value = '';
        dmMsgInput.style.height = 'auto';
    } catch (err) {
        console.error(err);
        alert('No se pudo enviar el mensaje.');
    } finally {
        if (dmSendBtn) dmSendBtn.disabled = false;
        if (dmMsgInput) dmMsgInput.focus();
    }
}

if (dmSendBtn) dmSendBtn.addEventListener('click', sendDmMessage);
if (dmMsgInput) {
    dmMsgInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDmMessage(); }
    });
    dmMsgInput.addEventListener('input', () => {
        dmMsgInput.style.height = 'auto';
        dmMsgInput.style.height = `${dmMsgInput.scrollHeight}px`;
    });
}

// Inject the 📝 shortcut button once the DM panel is in the DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSelfChatShortcut);
} else {
    injectSelfChatShortcut();
}
