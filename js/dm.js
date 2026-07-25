// js/dm.js
// Mensajes privados 1 a 1 + chat propio ("Notas personales").
// El chat propio usa una conversación donde user_a === user_b === currentUserId.
// Requiere que la constraint UNIQUE de conversations permita eso, o que uses
// maybeSingle() sin restricción de unicidad en ese caso.

let currentConversationId = null;
let currentOtherUser = null; // { id, username }
let dmChannel = null;

function showDmListView() {
    if (dmListView) dmListView.style.display = 'flex';
    if (dmChatView) dmChatView.style.display = 'none';
    if (dmBackBtn) dmBackBtn.style.display = 'none';
    if (dmTitle) dmTitle.textContent = 'Mensajes privados';
    unsubscribeDmChannel();
    currentConversationId = null;
    currentOtherUser = null;
    loadMyConversations();
}

function openConversationView() {
    if (!currentOtherUser) return;
    if (dmListView) dmListView.style.display = 'none';
    if (dmChatView) dmChatView.style.display = 'flex';
    if (dmBackBtn) dmBackBtn.style.display = 'inline-block';
    // Show "Notas personales" label for self-chat
    if (dmTitle) {
        dmTitle.textContent = currentOtherUser.id === currentUserId
            ? '📝 Notas personales'
            : currentOtherUser.username;
    }
    if (dmMessages) dmMessages.innerHTML = '';
    loadDmMessages();
    subscribeDmChannel();
}

function closeDmPanel() {
    if (dmPanel) dmPanel.style.display = 'none';
    unsubscribeDmChannel();
}

if (dmToggle) {
    dmToggle.addEventListener('click', () => {
        if (isGuest) { alert('Inicia sesión con tu cuenta para usar mensajes privados.'); return; }
        if (dmPanel) dmPanel.style.display = 'flex';
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
    openConversationView();
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
    const isMe = msg.sender_id === currentUserId;
    const div = document.createElement('div');
    div.className = `message ${isMe ? 'sent' : 'received'}`;

    if (msg.text) {
        const p = document.createElement('p');
        p.style.margin = '0';
        p.style.whiteSpace = 'pre-wrap';
        p.textContent = msg.text;
        div.appendChild(p);
    }
    if (msg.image_url) {
        const img = document.createElement('img');
        img.src = msg.image_url;
        div.appendChild(img);
    }

    const dateObj = msg.created_at ? new Date(msg.created_at) : new Date();
    const timeSpan = document.createElement('span');
    timeSpan.className = 'msg-time';
    timeSpan.textContent = `${String(dateObj.getHours()).padStart(2,'0')}:${String(dateObj.getMinutes()).padStart(2,'0')}`;
    div.appendChild(timeSpan);

    dmMessages.appendChild(div);
}

async function loadDmMessages() {
    if (!dmMessages || !currentConversationId) return;
    try {
        const { data, error } = await supabaseClient
            .from('private_messages').select('*')
            .eq('conversation_id', currentConversationId)
            .order('created_at', { ascending: true }).limit(200);
        if (error) throw error;
        (data || []).forEach(renderDmMessage);
        dmMessages.scrollTop = dmMessages.scrollHeight;
    } catch (err) {
        console.error(err);
        dmMessages.innerHTML = '<div class="dm-empty">Error al cargar la conversación.</div>';
    }
}

function subscribeDmChannel() {
    unsubscribeDmChannel();
    if (!currentConversationId) return;

    // Track locally-sent message IDs to avoid double-render in normal 1:1 chats.
    // For self-chat (sender === receiver) we MUST render via Realtime only —
    // sendDmMessage() does NOT render locally, so every INSERT must be shown.
    const locallyRenderedIds = new Set();

    // Expose setter so sendDmMessage can register IDs it rendered locally
    subscribeDmChannel._registerLocal = (id) => locallyRenderedIds.add(id);

    dmChannel = supabaseClient
        .channel(`dm-${currentConversationId}`)
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'private_messages',
            filter: `conversation_id=eq.${currentConversationId}`
        }, payload => {
            // Skip only if we pre-rendered this message id locally (non-self chats)
            if (locallyRenderedIds.has(payload.new.id)) return;
            renderDmMessage(payload.new);
            if (dmMessages) dmMessages.scrollTop = dmMessages.scrollHeight;
        })
        .subscribe();
}

function unsubscribeDmChannel() {
    if (dmChannel) { supabaseClient.removeChannel(dmChannel); dmChannel = null; }
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
