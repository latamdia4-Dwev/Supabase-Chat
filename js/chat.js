// js/chat.js
const INITIAL_MESSAGES_COUNT = 0;
const MESSAGES_PAGE_SIZE = 20;

let oldestMessageTimestamp = null;
let isLoadingOlderMessages = false;
let noMoreOlderMessages = false;

// Los archivos pegados van a la cola de los mensajes privados si hay una
// conversación abierta; si no, a la cola del chat general.
function queueFileForActiveTarget(file) {
    if (typeof isDmConversationOpen === 'function' && isDmConversationOpen()) {
        dmQueueFiles.push(file);
        updateDmFilePreview();
    } else {
        queueFiles.push(file);
        updateFilePreview();
    }
}

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
                queueFileForActiveTarget(file);
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
                            queueFileForActiveTarget(file);
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
    renderFileQueuePreview(previewContainer, queueFiles, updateFilePreview);
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
                btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(var(--accent-rgb,62,207,142),0.18)');
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

    const showingDeleted = isAdmin && myIsRealAdmin;
    if (msg.hidden && !showingDeleted) return;

    // sender_id is ephemeral (changes each page load); also match by username
    // so messages from previous sessions appear on the right side.
    const isMe = msg.sender_id === mySessionId ||
        (!isGuest && myUsername && msg.username === myUsername);
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isMe ? 'sent' : 'received'}` + (msg.hidden ? ' msg-deleted' : '');
    msgDiv.id = `msg-${msg.id}`;

    // Show sender name on every message so participants know who wrote what
    const displayName = msg.username || 'Anónimo';
    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'display:block;font-size:0.72em;font-weight:bold;color:var(--accent,#3ecf8e);margin-bottom:3px;opacity:0.9;';
    nameSpan.textContent = isMe ? `${displayName} (tú)` : displayName;
    if (msg.hidden) {
        const delBadge = document.createElement('span');
        delBadge.textContent = ' 🗑️ Eliminado (solo visible para admin)';
        delBadge.style.cssText = 'color:#ff4d4d;font-weight:normal;';
        nameSpan.appendChild(delBadge);
    }
    msgDiv.appendChild(nameSpan);

    if (msg.text) {
        appendMessageText(msgDiv, msg.text, msg.hidden);
    }

    // Si fue editado, muestra el texto original tachado arriba del actual
    if (msg.edited_at && msg.original_text) {
        const editedNote = document.createElement('p');
        editedNote.style.cssText = 'margin:2px 0 0 0;font-size:0.72em;opacity:0.65;';
        editedNote.innerHTML = `✏️ editado · original: <span style="text-decoration:line-through;">${msg.original_text.replace(/</g, '&lt;')}</span>`;
        msgDiv.appendChild(editedNote);
    }

    appendMessageMedia(msgDiv, msg.image_url);

    const dateObj = msg.created_at ? new Date(msg.created_at) : new Date();
    const timeSpan = document.createElement('span');
    timeSpan.className = 'msg-time';
    timeSpan.textContent = `${String(dateObj.getHours()).padStart(2,'0')}:${String(dateObj.getMinutes()).padStart(2,'0')}`;
    msgDiv.appendChild(timeSpan);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = msg.hidden ? 'Restaurar mensaje' : 'Ocultar mensaje';
    deleteBtn.onclick = () => msg.hidden ? restoreMessage(msg.id) : deleteMessage(msg.id);
    msgDiv.appendChild(deleteBtn);

    // Botón de editar: solo visible en modo super-admin (isAdmin cosmético +
    // is_admin real en la base de datos)
    if (isAdmin && myIsRealAdmin) {
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-edit';
        editBtn.textContent = '✏️';
        editBtn.title = 'Editar mensaje';
        editBtn.onclick = () => editMessage(msg.id, msg.text || '');
        msgDiv.appendChild(editBtn);
    }

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
        const showingDeleted = isAdmin && myIsRealAdmin;
        if (INITIAL_MESSAGES_COUNT > 0) {
            let query = supabaseClient.from('messages').select('*');
            if (!showingDeleted) query = query.eq('hidden', false);
            const { data, error } = await query
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
        const showingDeleted = isAdmin && myIsRealAdmin;
        let query = supabaseClient.from('messages').select('*');
        if (!showingDeleted) query = query.eq('hidden', false);
        const { data, error } = await query
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
        if (isAdmin && myIsRealAdmin) loadInitialMessages(); // refresca para mostrarlo tachado
    } catch (error) {
        console.error(error);
        alert('Error al ocultar el mensaje.');
    }
}

// Solo visible/usable en modo super-admin (ver btn-delete con title "Restaurar")
async function restoreMessage(id) {
    if (!(isAdmin && myIsRealAdmin)) return;
    try {
        const { error } = await supabaseClient.from('messages').update({ hidden: false }).eq('id', id);
        if (error) throw error;
        loadInitialMessages();
    } catch (error) {
        console.error(error);
        alert('Error al restaurar el mensaje.');
    }
}

// Edita el texto de un mensaje, guardando el original la PRIMERA vez que se
// edita (para no perder el historial si se edita más de una vez). Solo
// disponible en modo super-admin (isAdmin cosmético + is_admin real en BD).
async function editMessage(id, currentText) {
    if (!(isAdmin && myIsRealAdmin)) return;
    const newText = prompt('Editar mensaje:', currentText);
    if (newText === null || newText === currentText) return;

    try {
        // Trae el mensaje actual para saber si ya tenía un original_text guardado
        const { data: existing, error: fetchErr } = await supabaseClient
            .from('messages')
            .select('original_text, text')
            .eq('id', id)
            .single();
        if (fetchErr) throw fetchErr;

        const updatePayload = {
            text: newText,
            edited_at: new Date().toISOString(),
            original_text: existing.original_text || existing.text
        };

        const { error } = await supabaseClient.from('messages').update(updatePayload).eq('id', id);
        if (error) throw error;
        loadInitialMessages();
    } catch (error) {
        console.error(error);
        alert('Error al editar el mensaje.');
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
        const showingDeleted = isAdmin && myIsRealAdmin;
        if (payload.new.hidden && !showingDeleted) {
            const el = document.getElementById(`msg-${payload.new.id}`);
            if (el) el.remove();
            pendingMessagesWhileHidden = pendingMessagesWhileHidden.filter(m => m.id !== payload.new.id);
            return;
        }
        // Editado, restaurado, u ocultado-pero-admin-lo-sigue-viendo: re-dibuja
        const el = document.getElementById(`msg-${payload.new.id}`);
        if (el) el.remove();
        renderMessage(payload.new);
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
    const text = normalizeMessageText(msgInput.value);
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
                // Imágenes y videos del chat viven en Cloudflare R2: el Worker
                // valida sesión, tamaño y cuota, y devuelve la URL pública.
                const uploaded = await uploadToR2('chat', file);

                const { data: insertData, error: insertError } = await supabaseClient
                    .from('messages')
                    .insert([{
                        text: i === 0 ? text : '',
                        image_url: uploaded.url,
                        sender_id: mySessionId,
                        username: myUsername || 'Anónimo'
                    }])
                    .select();
                if (insertError) throw insertError;
                if (insertData && insertData[0]) renderMessage(insertData[0]);
            }
        }

        form.reset();
        clearDraftBackup();
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

// --- AUTO-SEND AL CERRAR ---
// Si queda texto escrito sin enviar y la pestaña se cierra (o se navega fuera),
// se envía con fetch keepalive, que el navegador completa aunque la página muera.
// Se usa un token en memoria porque getSession() es asíncrono y no es fiable en pagehide.
let cachedAccessToken = null;
supabaseClient.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session ? session.access_token : null;
});

// ── RESPALDO DEL BORRADOR (servidor + localStorage) ──
// pagehide no se dispara si se apaga el equipo o el navegador muere, y al cerrar
// sesión el token se borra antes. Además localStorage puede borrarse al apagar
// (modo incógnito, "borrar datos al cerrar") o no existir en otro equipo, así que el
// respaldo principal vive en la base de datos (tabla pending_drafts, ver
// sql/pending_drafts.sql, una fila por usuario con RLS). localStorage queda como
// respaldo secundario si la tabla aún no existe o no hay red. El texto pendiente se
// envía automáticamente en el siguiente inicio de sesión (recoverPendingDraft).
const PENDING_DRAFT_KEY = 'pendingChatDraft';
const DRAFT_SERVER_SYNC_DELAY_MS = 3000;
let draftBackupTimer = null;
let draftServerTimer = null;
let serverDraftExists = false;
let cachedUserId = null;

supabaseClient.auth.onAuthStateChange((_event, session) => {
    cachedUserId = session && session.user ? session.user.id : null;
});

function canSendDraft() {
    return !(isGuest && !isAdmin);
}

async function deleteServerDraft() {
    if (!serverDraftExists || !cachedUserId) return;
    serverDraftExists = false;
    try {
        const { error } = await supabaseClient.from('pending_drafts').delete().eq('user_id', cachedUserId);
        if (error) throw error;
    } catch (err) {
        console.warn('No se pudo borrar el borrador del servidor:', err);
    }
}

async function syncDraftToServer() {
    clearTimeout(draftServerTimer);
    if (!msgInput || !cachedUserId || !canSendDraft() || queueFiles.length > 0) return;
    const text = normalizeMessageText(msgInput.value);
    if (!text) { await deleteServerDraft(); return; }
    try {
        const { error } = await supabaseClient.from('pending_drafts').upsert({
            user_id: cachedUserId,
            text,
            username: myUsername || null,
            updated_at: new Date().toISOString()
        });
        if (error) throw error;
        serverDraftExists = true;
    } catch (err) {
        console.warn('No se pudo respaldar el borrador en el servidor (¿falta sql/pending_drafts.sql?):', err);
    }
}

function clearDraftBackup() {
    clearTimeout(draftBackupTimer);
    clearTimeout(draftServerTimer);
    try { localStorage.removeItem(PENDING_DRAFT_KEY); } catch (err) { /* sin localStorage */ }
    return deleteServerDraft();
}

function saveDraftBackup() {
    clearTimeout(draftBackupTimer);
    if (!msgInput || !canSendDraft() || queueFiles.length > 0) return;
    const text = normalizeMessageText(msgInput.value);
    if (!text) { clearDraftBackup(); return; }
    try {
        localStorage.setItem(PENDING_DRAFT_KEY, JSON.stringify({ text, username: myUsername || null, savedAt: Date.now() }));
    } catch (err) { /* sin localStorage o cuota llena */ }
}

if (msgInput) {
    msgInput.addEventListener('input', () => {
        clearTimeout(draftBackupTimer);
        draftBackupTimer = setTimeout(saveDraftBackup, 400);
        // Al servidor con una pausa corta: a lo más se pierden los últimos segundos escritos
        clearTimeout(draftServerTimer);
        draftServerTimer = setTimeout(syncDraftToServer, DRAFT_SERVER_SYNC_DELAY_MS);
    });
}
// En móviles y al apagar/suspender, visibilitychange suele dispararse aunque pagehide no
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        saveDraftBackup();
        syncDraftToServer();
    }
});

// Envía el texto pendiente con la sesión aún válida (se usa justo antes de cerrar sesión).
// Si falla, el respaldo (servidor y localStorage) queda para el siguiente inicio de sesión.
async function sendDraftBeforeLogout() {
    if (isSending || !msgInput || !canSendDraft() || queueFiles.length > 0) return;
    const text = normalizeMessageText(msgInput.value);
    if (!text) return;
    saveDraftBackup();
    await syncDraftToServer();
    try {
        const { error } = await supabaseClient
            .from('messages')
            .insert([{ text, sender_id: mySessionId, username: myUsername || 'Anónimo' }]);
        if (error) throw error;
        msgInput.value = '';
        await clearDraftBackup(); // espera el borrado en el servidor antes de cerrar sesión
    } catch (err) {
        console.error('No se pudo enviar el borrador antes de cerrar sesión:', err);
    }
}

// Envía el borrador respaldado de una sesión anterior (apagado, cierre de sesión fallido, etc.).
// Primero lo reclama borrando la fila del servidor (delete ... returning), así dos
// dispositivos no lo envían dos veces; si el envío falla, se vuelve a guardar.
let isRecoveringDraft = false;
async function recoverPendingDraft() {
    if (isRecoveringDraft || !canSendDraft()) return;
    isRecoveringDraft = true;
    let draft = null;
    try {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        const userId = sessionData && sessionData.session ? sessionData.session.user.id : null;

        if (userId) {
            try {
                const { data, error } = await supabaseClient
                    .from('pending_drafts').delete().eq('user_id', userId).select();
                if (error) throw error;
                if (data && data[0] && data[0].text) draft = { text: data[0].text, username: data[0].username };
            } catch (err) {
                console.warn('No se pudo leer el borrador del servidor:', err);
            }
        }
        if (!draft) {
            try {
                const local = JSON.parse(localStorage.getItem(PENDING_DRAFT_KEY) || 'null');
                if (local && local.text) draft = local;
            } catch (err) { /* sin localStorage */ }
        }
        if (!draft) return;

        const sender = myUsername || draft.username || 'Anónimo';
        try {
            const { error } = await supabaseClient
                .from('messages')
                .insert([{ text: draft.text, sender_id: mySessionId, username: sender }]);
            if (error) throw error;
            try { localStorage.removeItem(PENDING_DRAFT_KEY); } catch (err) { /* sin localStorage */ }
            if (msgInput && normalizeMessageText(msgInput.value) === draft.text) msgInput.value = '';
        } catch (err) {
            console.error('No se pudo enviar el borrador pendiente; se conserva para reintentar:', err);
            if (userId) {
                supabaseClient.from('pending_drafts')
                    .upsert({ user_id: userId, text: draft.text, username: draft.username || null })
                    .then(() => { serverDraftExists = true; });
            }
        }
    } finally {
        isRecoveringDraft = false;
    }
}

function flushDraftOnClose() {
    if (isSending || !msgInput || !cachedAccessToken) return;
    if (isGuest && !isAdmin) return;
    if (queueFiles.length > 0) return; // los archivos no se pueden subir al cerrar
    const text = normalizeMessageText(msgInput.value);
    if (!text) return;

    try {
        fetch(`${SUPABASE_URL}/rest/v1/messages`, {
            method: 'POST',
            keepalive: true,
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${cachedAccessToken}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ text, sender_id: mySessionId, username: myUsername || 'Anónimo' })
        });
        msgInput.value = ''; // evita reenvío si la página vuelve del bfcache
        try { localStorage.removeItem(PENDING_DRAFT_KEY); } catch (e) { /* sin localStorage */ }
        if (serverDraftExists && cachedUserId) {
            fetch(`${SUPABASE_URL}/rest/v1/pending_drafts?user_id=eq.${cachedUserId}`, {
                method: 'DELETE',
                keepalive: true,
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${cachedAccessToken}` }
            });
        }
    } catch (err) {
        console.error('Auto-envío al cerrar falló:', err);
    }
}
window.addEventListener('pagehide', flushDraftOnClose);

refreshCurrentUserId();
loadInitialMessages();
