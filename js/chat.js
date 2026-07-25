// js/chat.js
const INITIAL_MESSAGES_COUNT = 0;
const MESSAGES_PAGE_SIZE = 20;

let oldestMessageTimestamp = null;
let isLoadingOlderMessages = false;
let noMoreOlderMessages = false;

document.addEventListener('paste', async (event) => {
    const clipboardData = event.clipboardData || event.originalEvent.clipboardData;
    if (!clipboardData) return;
    const items = clipboardData.items;
    let handledLegacy = false;
    let sawFileItemButEmpty = false;

    for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
            const file = items[i].getAsFile();
            if (file && file.size > 0 && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
                queueFiles.push(file);
                updateFilePreview();
                handledLegacy = true;
            } else if (file) {
                sawFileItemButEmpty = true;
            }
        }
    }

    if (handledLegacy) return;

    if (navigator.clipboard && navigator.clipboard.read) {
        try {
            const clipboardItems = await navigator.clipboard.read();
            let handledModern = false;
            for (const clipboardItem of clipboardItems) {
                for (const type of clipboardItem.types) {
                    if (type.startsWith('image/') || type.startsWith('video/')) {
                        const blob = await clipboardItem.getType(type);
                        if (blob && blob.size > 0) {
                            const extension = type.split('/')[1] || 'dat';
                            const file = new File([blob], `pegado_${Date.now()}.${extension}`, { type });
                            queueFiles.push(file);
                            updateFilePreview();
                            handledModern = true;
                        }
                    }
                }
            }
            if (!handledModern && sawFileItemButEmpty) {
                alert('El portapapeles contiene un video/imagen, pero llegó vacío (0 bytes).');
            }
        } catch (err) {
            alert('No se pudo leer el portapapeles: ' + (err && err.message ? err.message : err));
        }
    } else if (sawFileItemButEmpty) {
        alert('El archivo llegó vacío y este navegador no soporta el método de respaldo.');
    }
});

function sanitizeFileName(rawName) {
    const dotIndex = rawName.lastIndexOf('.');
    const ext = dotIndex > -1 ? rawName.slice(dotIndex) : '';
    const base = dotIndex > -1 ? rawName.slice(0, dotIndex) : rawName;
    const cleanBase = base
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
    return cleanBase + ext;
}

function updateFilePreview() {
    if (!previewContainer) return;
    previewContainer.innerHTML = '';
    if (queueFiles.length > 0) {
        previewContainer.style.display = 'flex';
        queueFiles.forEach((file, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'preview-item';
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-remove';
            removeBtn.textContent = '×';
            removeBtn.onclick = (e) => {
                e.preventDefault();
                queueFiles.splice(index, 1);
                updateFilePreview();
            };
            itemDiv.appendChild(removeBtn);
            if (file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                itemDiv.appendChild(img);
            } else if (file.type.startsWith('video/')) {
                const video = document.createElement('video');
                video.src = URL.createObjectURL(file);
                video.muted = true;
                itemDiv.appendChild(video);
            } else {
                const icon = document.createElement('div');
                icon.className = 'file-icon';
                icon.textContent = '📁';
                itemDiv.appendChild(icon);
            }
            previewContainer.appendChild(itemDiv);
        });
    } else {
        previewContainer.style.display = 'none';
    }
}

if (fileInput) {
    fileInput.addEventListener('change', () => {
        queueFiles = queueFiles.concat(Array.from(fileInput.files));
        updateFilePreview();
    });
}

// --- REACTIONS ---
let currentUserId = null;

async function refreshCurrentUserId() {
    try {
        const { data, error } = await supabaseClient.auth.getUser();
        if (error) throw error;
        currentUserId = data && data.user ? data.user.id : null;
    } catch (err) {
        currentUserId = null;
    }
}

// Quick-access bar shown at the top of the picker
const REACTION_QUICK = ['👍','❤️','😂','😮','😢','🙏','🔥','🎉','👀','💯'];

const REACTION_CATEGORIES = [
    { label: '😀 Caras', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','😵','🤯','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'] },
    { label: '👋 Gestos', emojis: ['👍','👎','👏','🙌','🤲','🤝','🙏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👋','🤚','🖐️','✋','🖖','💪','🦵','🦶','👂','👃','👁️','👀','👅','💋'] },
    { label: '❤️ Corazones', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','❤️‍🔥','❤️‍🩹'] },
    { label: '🎉 Celebración', emojis: ['🎉','🎊','🎈','🎁','🎂','🍰','🥂','🍾','🏆','🥇','🎯','🎮','🎪','🎭','🎨','🎬','🎤','🎧','🎵','🎶','🎸','🥁','🎷','🎺','🎻','🪗'] },
    { label: '🔥 Símbolos', emojis: ['🔥','✨','💫','⭐','🌟','💥','❄️','🌈','☀️','🌙','⚡','🌊','💦','🍀','🌸','🌺','🌻','🌹','💐','🍁','🍂','🍃','🌿','💯','✅','❌','⚠️','🚨','💡','🔑','🔒','🔓','🎯','💎','👑'] },
    { label: '🐶 Animales', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦆','🦉','🦇','🐺','🐴','🦄','🐝','🦋','🐞','🐢','🐍','🦎','🐙','🦑','🐬','🐳'] },
    { label: '🍕 Comida', emojis: ['🍕','🍔','🌮','🌯','🍜','🍝','🍣','🍱','🍛','🍲','🥘','🍗','🍖','🥩','🥓','🌭','🥚','🍳','🧇','🥞','🍞','🥐','🥗','🍎','🍊','🍋','🍇','🍓','🍒','☕','🍵','🧋','🍺','🍻','🥃','🍷','🥂','🍾'] }
];

let openReactionPickerId = null;
let reactionPickerSearchTerm = '';
const messageReactionsCache = {};

function addReactionToCache(messageId, emoji, userId) {
    if (!messageReactionsCache[messageId]) messageReactionsCache[messageId] = {};
    if (!messageReactionsCache[messageId][emoji]) messageReactionsCache[messageId][emoji] = [];
    if (!messageReactionsCache[messageId][emoji].includes(userId)) {
        messageReactionsCache[messageId][emoji].push(userId);
    }
}

function removeReactionFromCache(messageId, emoji, userId) {
    if (!messageReactionsCache[messageId] || !messageReactionsCache[messageId][emoji]) return;
    messageReactionsCache[messageId][emoji] = messageReactionsCache[messageId][emoji].filter(id => id !== userId);
    if (messageReactionsCache[messageId][emoji].length === 0) {
        delete messageReactionsCache[messageId][emoji];
    }
}

async function loadReactionsForMessages(messageIds) {
    if (!messageIds || messageIds.length === 0) return;
    try {
        const { data, error } = await supabaseClient
            .from('message_reactions')
            .select('message_id, user_id, emoji')
            .in('message_id', messageIds);
        if (error) throw error;
        (data || []).forEach(r => addReactionToCache(r.message_id, r.emoji, r.user_id));
        messageIds.forEach(id => {
            const msgDiv = document.getElementById(`msg-${id}`);
            if (msgDiv) renderReactions(msgDiv, id, messageReactionsCache[id] || {});
        });
    } catch (err) {
        console.error('Error al cargar reacciones:', err);
    }
}

function closeReactionPicker() {
    const existing = document.querySelector('.reaction-picker-full');
    if (existing) existing.remove();
    openReactionPickerId = null;
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.reaction-picker-full') && !e.target.closest('.btn-react')) {
        closeReactionPicker();
    }
});

function openReactionPicker(msgId, anchorBtn) {
    closeReactionPicker();
    openReactionPickerId = msgId;

    // --- PICKER CONTAINER ---
    const picker = document.createElement('div');
    picker.className = 'reaction-picker-full';
    picker.style.cssText = `
        position:fixed;width:300px;max-height:340px;
        background:var(--bg-preview, #161616);border:1px solid #333;
        border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,0.6);
        z-index:10002;display:flex;flex-direction:column;overflow:hidden;
    `;

    // Quick-access row
    const quickRow = document.createElement('div');
    quickRow.style.cssText = 'display:flex;gap:4px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.07);flex-wrap:wrap;';
    REACTION_QUICK.forEach(emoji => {
        const btn = document.createElement('span');
        btn.textContent = emoji;
        btn.style.cssText = 'font-size:1.3em;cursor:pointer;padding:3px;border-radius:6px;transition:transform 0.1s;';
        btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.3)');
        btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');
        btn.onclick = (e) => { e.stopPropagation(); toggleReaction(msgId, emoji); };
        quickRow.appendChild(btn);
    });
    picker.appendChild(quickRow);

    // Search input
    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = 'padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.07);';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 Buscar emoji...';
    searchInput.style.cssText = `
        width:100%;box-sizing:border-box;padding:7px 12px;border-radius:20px;
        border:1px solid #333;background:#1a1a1a;color:#fff;font-size:0.85em;outline:none;
    `;
    searchWrap.appendChild(searchInput);
    picker.appendChild(searchWrap);

    // Scrollable body: categories + grids
    const body = document.createElement('div');
    body.style.cssText = 'overflow-y:auto;flex:1;padding:6px 6px 10px 6px;';

    function renderBody(filter) {
        body.innerHTML = '';
        const term = (filter || '').toLowerCase();

        REACTION_CATEGORIES.forEach(cat => {
            const filtered = term
                ? cat.emojis.filter(e => e.includes(term) || cat.label.toLowerCase().includes(term))
                : cat.emojis;
            if (filtered.length === 0) return;

            const catLabel = document.createElement('div');
            catLabel.textContent = cat.label;
            catLabel.style.cssText = 'font-size:0.7em;color:#888;padding:6px 4px 3px 4px;font-weight:bold;';
            body.appendChild(catLabel);

            const grid = document.createElement('div');
            grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px;';
            filtered.forEach(emoji => {
                const btn = document.createElement('span');
                btn.textContent = emoji;
                btn.style.cssText = 'font-size:1.25em;cursor:pointer;padding:4px;border-radius:6px;transition:background 0.1s;';
                btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(62,207,142,0.18)');
                btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
                btn.onclick = (e) => { e.stopPropagation(); toggleReaction(msgId, emoji); };
                grid.appendChild(btn);
            });
            body.appendChild(grid);
        });

        if (body.innerHTML === '') {
            body.innerHTML = '<div style="color:#888;font-size:0.82em;text-align:center;padding:16px;">Sin resultados</div>';
        }
    }

    renderBody('');
    searchInput.addEventListener('input', () => renderBody(searchInput.value.trim()));
    searchInput.addEventListener('click', e => e.stopPropagation());

    picker.appendChild(body);
    document.body.appendChild(picker);

    // Position: prefer above the anchor, fallback below, keep inside viewport
    const rect = anchorBtn.getBoundingClientRect();
    const pw = 300, ph = 340;
    let left = Math.min(rect.left, window.innerWidth - pw - 8);
    left = Math.max(8, left);
    let top = rect.top - ph - 6;
    if (top < 8) top = rect.bottom + 6;
    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;

    setTimeout(() => searchInput.focus(), 50);
}

function renderReactions(msgDiv, msgId, reactions) {
    let container = msgDiv.querySelector('.message-reactions');
    if (!container) {
        container = document.createElement('div');
        container.className = 'message-reactions';
        const timeSpan = msgDiv.querySelector('.msg-time');
        if (timeSpan) msgDiv.insertBefore(container, timeSpan);
        else msgDiv.appendChild(container);
    }
    container.innerHTML = '';
    Object.entries(reactions || {})
        .filter(([, users]) => users && users.length > 0)
        .forEach(([emoji, users]) => {
            const pill = document.createElement('span');
            pill.className = 'reaction-pill' + (currentUserId && users.includes(currentUserId) ? ' mine' : '');
            pill.textContent = `${emoji} ${users.length}`;
            pill.title = 'Pulsa para quitar/agregar tu reacción';
            pill.onclick = () => toggleReaction(msgId, emoji);
            container.appendChild(pill);
        });
}

async function toggleReaction(msgId, emoji) {
    closeReactionPicker();
    if (isGuest && !isAdmin) { alert('Inicia sesión con tu cuenta para reaccionar.'); return; }
    if (!currentUserId) { alert('No se pudo identificar tu sesión. Intenta recargar.'); return; }
    try {
        const { data: existing, error: selError } = await supabaseClient
            .from('message_reactions').select('id')
            .eq('message_id', msgId).eq('user_id', currentUserId).eq('emoji', emoji).maybeSingle();
        if (selError) throw selError;
        if (existing) {
            const { error } = await supabaseClient.from('message_reactions').delete().eq('id', existing.id);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient.from('message_reactions')
                .insert([{ message_id: msgId, user_id: currentUserId, emoji }]);
            if (error) throw error;
        }
    } catch (err) {
        console.error('Error al reaccionar:', err);
        alert('No se pudo guardar tu reacción.');
    }
}

supabaseClient
    .channel('schema-db-changes-reactions')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, payload => {
        const { message_id, emoji, user_id } = payload.new;
        addReactionToCache(message_id, emoji, user_id);
        const msgDiv = document.getElementById(`msg-${message_id}`);
        if (msgDiv) renderReactions(msgDiv, message_id, messageReactionsCache[message_id] || {});
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, payload => {
        const { message_id, emoji, user_id } = payload.old;
        removeReactionFromCache(message_id, emoji, user_id);
        const msgDiv = document.getElementById(`msg-${message_id}`);
        if (msgDiv) renderReactions(msgDiv, message_id, messageReactionsCache[message_id] || {});
    })
    .subscribe();

// --- RENDER MESSAGE ---
function renderMessage(msg, prepend = false) {
    if (!messagesContainer) return;
    if (msg.hidden) return;

    // sender_id is ephemeral (changes each page load); also match by username
    // so messages from previous sessions appear on the right side.
    const isMe = msg.sender_id === mySessionId ||
        (!isGuest && myUsername && msg.username === myUsername);
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isMe ? 'sent' : 'received'}`;
    msgDiv.id = `msg-${msg.id}`;

    // Show sender name on every message so participants know who wrote what
    const displayName = msg.username || 'Anónimo';
    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'display:block;font-size:0.72em;font-weight:bold;color:#3ecf8e;margin-bottom:3px;opacity:0.9;';
    nameSpan.textContent = isMe ? `${displayName} (tú)` : displayName;
    msgDiv.appendChild(nameSpan);

    if (msg.text) {
        const textPara = document.createElement('p');
        textPara.style.margin = '0';
        textPara.style.whiteSpace = 'pre-wrap';
        textPara.textContent = msg.text;
        msgDiv.appendChild(textPara);
    }

    if (msg.image_url) {
        const isVideo = msg.image_url.match(/\.(mp4|webm|ogg|mov)$/i) || msg.image_url.includes('video_');
        if (isVideo) {
            const video = document.createElement('video');
            video.src = msg.image_url;
            video.controls = true;
            video.preload = 'metadata';
            msgDiv.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.src = msg.image_url;
            img.onclick = () => openLightbox(msg.image_url);
            msgDiv.appendChild(img);
        }
    }

    const dateObj = msg.created_at ? new Date(msg.created_at) : new Date();
    const timeSpan = document.createElement('span');
    timeSpan.className = 'msg-time';
    timeSpan.textContent = `${String(dateObj.getHours()).padStart(2,'0')}:${String(dateObj.getMinutes()).padStart(2,'0')}`;
    msgDiv.appendChild(timeSpan);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '×';
    deleteBtn.onclick = () => deleteMessage(msg.id);
    msgDiv.appendChild(deleteBtn);

    const reactBtn = document.createElement('button');
    reactBtn.className = 'btn-react';
    reactBtn.textContent = '😊';
    reactBtn.title = 'Reaccionar';
    reactBtn.onclick = (e) => {
        e.stopPropagation();
        openReactionPickerId === msg.id ? closeReactionPicker() : openReactionPicker(msg.id, reactBtn);
    };
    msgDiv.appendChild(reactBtn);

    renderReactions(msgDiv, msg.id, messageReactionsCache[msg.id] || {});

    if (prepend) {
        messagesContainer.insertBefore(msgDiv, messagesContainer.firstChild);
    } else {
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

async function loadInitialMessages() {
    try {
        messagesContainer.innerHTML = '';
        if (INITIAL_MESSAGES_COUNT > 0) {
            const { data, error } = await supabaseClient
                .from('messages').select('*').eq('hidden', false)
                .order('created_at', { ascending: false }).limit(INITIAL_MESSAGES_COUNT);
            if (error) throw error;
            if (data && data.length > 0) {
                const ordered = data.slice().reverse();
                ordered.forEach(msg => renderMessage(msg));
                loadReactionsForMessages(ordered.map(m => m.id));
                oldestMessageTimestamp = ordered[0].created_at;
                noMoreOlderMessages = data.length < INITIAL_MESSAGES_COUNT;
            } else {
                noMoreOlderMessages = true;
            }
        } else {
            oldestMessageTimestamp = new Date().toISOString();
            noMoreOlderMessages = false;
        }
        updateLoadMoreBar();
    } catch (error) {
        console.error('Error al cargar mensajes:', error);
    }
}

async function loadOlderMessages() {
    if (isLoadingOlderMessages || noMoreOlderMessages || !oldestMessageTimestamp || !messagesContainer) return;
    isLoadingOlderMessages = true;
    if (loadMoreBar) { loadMoreBar.textContent = 'Cargando...'; loadMoreBar.disabled = true; }
    try {
        const { data, error } = await supabaseClient
            .from('messages').select('*').eq('hidden', false)
            .lt('created_at', oldestMessageTimestamp)
            .order('created_at', { ascending: false }).limit(MESSAGES_PAGE_SIZE);
        if (error) throw error;
        if (!data || data.length === 0) { noMoreOlderMessages = true; return; }
        const previousScrollHeight = messagesContainer.scrollHeight;
        data.forEach(msg => renderMessage(msg, true));
        loadReactionsForMessages(data.map(m => m.id));
        oldestMessageTimestamp = data[data.length - 1].created_at;
        if (data.length < MESSAGES_PAGE_SIZE) noMoreOlderMessages = true;
        messagesContainer.scrollTop = messagesContainer.scrollHeight - previousScrollHeight;
    } catch (error) {
        console.error('Error al cargar mensajes anteriores:', error);
    } finally {
        isLoadingOlderMessages = false;
        if (loadMoreBar) loadMoreBar.disabled = false;
        updateLoadMoreBar();
    }
}

function updateLoadMoreBar() {
    if (!loadMoreBar) return;
    if (noMoreOlderMessages) {
        loadMoreBar.style.display = 'none';
    } else {
        loadMoreBar.style.display = 'block';
        loadMoreBar.textContent = 'Cargar mensajes anteriores ↑';
    }
}

if (loadMoreBar) loadMoreBar.addEventListener('click', loadOlderMessages);

if (messagesContainer) {
    messagesContainer.addEventListener('scroll', () => {
        if (messagesContainer.scrollTop < 40) loadOlderMessages();
        closeReactionPicker();
    });
}

async function deleteMessage(id) {
    if (!isAdmin) return;
    if (!confirm('¿Deseas ocultar este mensaje?')) return;
    try {
        const { error } = await supabaseClient.from('messages').update({ hidden: true }).eq('id', id);
        if (error) throw error;
    } catch (error) {
        console.error(error);
        alert('Error al ocultar el mensaje.');
    }
}

let pendingMessagesWhileHidden = [];

function isChatCurrentlyHidden() {
    return !!(lockOverlay && lockOverlay.style.display !== 'none');
}

function flushPendingMessages() {
    pendingMessagesWhileHidden.forEach(msg => renderMessage(msg));
    pendingMessagesWhileHidden = [];
}

supabaseClient
    .channel('schema-db-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        if (document.getElementById(`msg-${payload.new.id}`)) return;
        if (isChatCurrentlyHidden()) {
            pendingMessagesWhileHidden.push(payload.new);
        } else {
            renderMessage(payload.new);
        }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
        const el = document.getElementById(`msg-${payload.old.id}`);
        if (el) el.remove();
        pendingMessagesWhileHidden = pendingMessagesWhileHidden.filter(m => m.id !== payload.old.id);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
        if (payload.new.hidden) {
            const el = document.getElementById(`msg-${payload.new.id}`);
            if (el) el.remove();
            pendingMessagesWhileHidden = pendingMessagesWhileHidden.filter(m => m.id !== payload.new.id);
        }
    })
    .subscribe();

function applyGuestRestrictions() {
    if (!msgInput || !sendBtn) return;
    const effectiveGuest = isGuest && !isAdmin;
    if (effectiveGuest) {
        msgInput.placeholder = 'Solo lectura (invitado) 🔒';
        msgInput.disabled = true;
        sendBtn.disabled = true;
        if (guestLoginBtn) guestLoginBtn.style.display = 'flex';
    } else {
        msgInput.placeholder = 'Escribe un mensaje...';
        msgInput.disabled = false;
        sendBtn.disabled = false;
        if (guestLoginBtn) guestLoginBtn.style.display = 'none';
    }
    if (dmToggle) dmToggle.style.display = isGuest ? 'none' : 'inline-block';
}

if (guestLoginBtn) {
    guestLoginBtn.addEventListener('click', () => {
        if (typeof showLockScreen === 'function') showLockScreen();
        if (typeof setLockMode === 'function') setLockMode('account');
    });
}

if (msgInput) {
    msgInput.addEventListener('input', () => {
        msgInput.style.height = 'auto';
        msgInput.style.height = msgInput.scrollHeight + 'px';
    });
}

let isSending = false;

async function sendMessage() {
    if (isGuest && !isAdmin) { alert('Inicia sesión con tu cuenta para chatear.'); return; }
    if (isSending) return;
    const text = msgInput.value.trim();
    if (!text && queueFiles.length === 0) return;

    isSending = true;
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '…'; }
    if (msgInput) msgInput.disabled = true;

    try {
        if (queueFiles.length === 0) {
            const { data, error } = await supabaseClient
                .from('messages')
                .insert([{ text, sender_id: mySessionId, username: myUsername || 'Anónimo' }])
                .select();
            if (error) throw error;
            if (data && data[0]) renderMessage(data[0]);
        } else {
            for (let i = 0; i < queueFiles.length; i++) {
                const file = queueFiles[i];
                const isVid = file.type.startsWith('video/');
                const fileName = `${Date.now()}_${isVid ? 'video_' : 'file_'}${sanitizeFileName(file.name || 'archivo')}`;

                const { error: uploadError } = await supabaseClient.storage
                    .from('chat-images').upload(fileName, file);
                if (uploadError) throw uploadError;

                const { data: urlData } = supabaseClient.storage
                    .from('chat-images').getPublicUrl(fileName);

                const { data: insertData, error: insertError } = await supabaseClient
                    .from('messages')
                    .insert([{
                        text: i === 0 ? text : '',
                        image_url: urlData.publicUrl,
                        sender_id: mySessionId,
                        username: myUsername || 'Anónimo'
                    }])
                    .select();
                if (insertError) throw insertError;
                if (insertData && insertData[0]) renderMessage(insertData[0]);
            }
        }

        form.reset();
        queueFiles = [];
        updateFilePreview();
        msgInput.style.height = 'auto';
    } catch (error) {
        console.error(error);
        alert(`Fallo al enviar: ${error.message}`);
    } finally {
        isSending = false;
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Enviar'; }
        if (msgInput) { msgInput.disabled = false; msgInput.focus(); }
    }
}

async function sendQuickImageMessage(imageUrl) {
    if (isGuest && !isAdmin) { alert('Inicia sesión con tu cuenta para chatear.'); return; }
    try {
        const { data, error } = await supabaseClient
            .from('messages')
            .insert([{ text: '', image_url: imageUrl, sender_id: mySessionId, username: myUsername || 'Anónimo' }])
            .select();
        if (error) throw error;
        if (data && data[0]) renderMessage(data[0]);
    } catch (error) {
        console.error('Error al enviar sticker/GIF:', error);
        alert(`No se pudo enviar: ${error.message}`);
    }
}

if (sendBtn) sendBtn.addEventListener('click', sendMessage);
if (msgInput) {
    msgInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isSending) sendMessage();
        }
    });
}

refreshCurrentUserId();
loadInitialMessages();
