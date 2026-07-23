// js/chat.js (Módulo de Mensajería, Storage y Cola de Vista Previa Completo)
// NOTA: previewContainer, fileInput, msgInput, messagesContainer, sendBtn, form,
// mySessionId, queueFiles, isAdmin y supabaseClient YA están declarados en config.js
// (que se carga antes que este archivo). NO se redeclaran aquí para evitar
// "Identifier has already been declared" (SyntaxError que aborta todo el script).

// --- PAGINACIÓN DEL HISTORIAL (carga perezosa hacia atrás) ---
// Cuántos mensajes se muestran automáticamente al entrar al chat.
// Ponlo en 0 para que no se muestre ningún mensaje hasta que se pulse
// "Cargar mensajes anteriores".
const INITIAL_MESSAGES_COUNT = 0;

// Cuántos mensajes se cargan cada vez que se pulsa "Cargar mensajes anteriores".
const MESSAGES_PAGE_SIZE = 20;

let oldestMessageTimestamp = null;
let isLoadingOlderMessages = false;
let noMoreOlderMessages = false;

// SOPORTE PARA PEGAR (PASTE) DESDE EL PORTAPAPELES
document.addEventListener('paste', async (event) => {
    const clipboardData = event.clipboardData || event.originalEvent.clipboardData;
    if (!clipboardData) return;
    const items = clipboardData.items;
    let handledLegacy = false;
    let sawFileItemButEmpty = false;

    // Método clásico (funciona bien para imágenes y videos pequeños)
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

    // Respaldo con la API moderna del portapapeles: el método clásico de
    // arriba a veces entrega el archivo vacío/incompleto cuando es grande
    // (típico en videos de captura de pantalla). Si eso pasó, lo intentamos
    // de nuevo con navigator.clipboard.read(), que maneja mejor binarios grandes.
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
                alert('El portapapeles contiene un video/imagen, pero llegó vacío (0 bytes) tanto por el método clásico como por el moderno. Es probable que sea un límite del navegador con archivos grandes copiados por esta herramienta.');
            }
        } catch (err) {
            alert('No se pudo leer el portapapeles con la API moderna. Error: ' + (err && err.message ? err.message : err));
        }
    } else if (sawFileItemButEmpty) {
        alert('El portapapeles contiene un archivo, pero llegó vacío (0 bytes), y este navegador no soporta el método de respaldo (navigator.clipboard.read). Intenta con Chrome de escritorio actualizado.');
    }
});

// DIBUJAR Y ELIMINAR MINIATURAS EN LA COLA PRE-ENVÍO
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
                video.autoplay = false;
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

// Escuchar la selección de múltiples archivos
if (fileInput) {
    fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files);
        queueFiles = queueFiles.concat(files);
        updateFilePreview();
    });
}

// --- REACCIONES CON EMOJI (tabla message_reactions + auth.uid()) ---
// Usa la tabla "message_reactions" (message_id, user_id, emoji) en vez de una
// columna jsonb en "messages". La identidad de quién reaccionó es el usuario
// real autenticado en Supabase (auth.uid()), NO el mySessionId aleatorio que
// se usa para "sender_id" de los mensajes de este chat.
//
// currentUserId se llena con refreshCurrentUserId() al cargar el chat y
// después de cada login exitoso (ver lock.js).
let currentUserId = null;

async function refreshCurrentUserId() {
    try {
        const { data, error } = await supabaseClient.auth.getUser();
        if (error) throw error;
        currentUserId = data && data.user ? data.user.id : null;
    } catch (err) {
        console.error('No se pudo obtener el usuario autenticado para reacciones:', err);
        currentUserId = null;
    }
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
let openReactionPickerId = null;

// Caché en memoria: { [messageId]: { [emoji]: [user_id, user_id, ...] } }
// Se llena al cargar mensajes y se mantiene al día con Realtime.
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

// Trae de Supabase las reacciones existentes de un lote de mensajes (por
// ejemplo, justo después de renderizar una tanda del historial) y las pinta.
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

// Cierra y quita del DOM cualquier selector de emojis abierto
function closeReactionPicker() {
    const existing = document.querySelector('.reaction-picker');
    if (existing) existing.remove();
    openReactionPickerId = null;
}

// Clic en cualquier otra parte de la página cierra el selector abierto
document.addEventListener('click', (e) => {
    if (!e.target.closest('.reaction-picker') && !e.target.closest('.btn-react')) {
        closeReactionPicker();
    }
});

// Abre el selector de emojis flotando encima del botón 😊 del mensaje
function openReactionPicker(msgId, anchorBtn) {
    closeReactionPicker();

    const picker = document.createElement('div');
    picker.className = 'reaction-picker';

    REACTION_EMOJIS.forEach(emoji => {
        const span = document.createElement('span');
        span.textContent = emoji;
        span.onclick = (e) => {
            e.stopPropagation();
            toggleReaction(msgId, emoji);
        };
        picker.appendChild(span);
    });

    anchorBtn.parentElement.appendChild(picker);
    openReactionPickerId = msgId;
}

// Dibuja (o redibuja) las píldoras de reacciones de un mensaje ya en el DOM
function renderReactions(msgDiv, msgId, reactions) {
    let container = msgDiv.querySelector('.message-reactions');
    if (!container) {
        container = document.createElement('div');
        container.className = 'message-reactions';
        const timeSpan = msgDiv.querySelector('.msg-time');
        if (timeSpan) {
            msgDiv.insertBefore(container, timeSpan);
        } else {
            msgDiv.appendChild(container);
        }
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

// Agrega o quita la reacción del usuario autenticado a un mensaje: inserta o
// borra la fila correspondiente en "message_reactions". El repintado real
// llega por Realtime (ver el canal más abajo), no aquí directamente — así
// todas las pestañas/dispositivos quedan sincronizados de la misma forma.
async function toggleReaction(msgId, emoji) {
    closeReactionPicker();

    if (!currentUserId) {
        alert('No se pudo identificar tu sesión para reaccionar. Intenta recargar el chat.');
        return;
    }

    try {
        const { data: existing, error: selError } = await supabaseClient
            .from('message_reactions')
            .select('id')
            .eq('message_id', msgId)
            .eq('user_id', currentUserId)
            .eq('emoji', emoji)
            .maybeSingle();
        if (selError) throw selError;

        if (existing) {
            const { error: delError } = await supabaseClient
                .from('message_reactions')
                .delete()
                .eq('id', existing.id);
            if (delError) throw delError;
        } else {
            const { error: insError } = await supabaseClient
                .from('message_reactions')
                .insert([{ message_id: msgId, user_id: currentUserId, emoji: emoji }]);
            if (insError) throw insError;
        }
    } catch (err) {
        console.error('Error al reaccionar:', err);
        alert('No se pudo guardar tu reacción (revisa que tu cuenta tenga permiso).');
    }
}

// ESCUCHA REALTIME DE LA TABLA message_reactions (canal separado del de
// "messages" de más abajo, para mantener el código de cada tabla aislado)
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

// RENDERIZAR MENSAJES EN EL HISTORIAL (Con soporte de Video e Inyección de Hora)
// prepend=true inserta el mensaje al inicio (usado al cargar mensajes anteriores)
function renderMessage(msg, prepend = false) {
    if (!messagesContainer) return;
    if (msg.hidden) return; // No mostrar mensajes ocultados por el administrador

    const isMe = msg.sender_id === mySessionId;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isMe ? 'sent' : 'received'}`;
    msgDiv.id = `msg-${msg.id}`;

    if (msg.text) {
        const textPara = document.createElement('p');
        textPara.style.margin = '0';
        textPara.textContent = msg.text;
        msgDiv.appendChild(textPara);
    }

    if (msg.image_url) {
        const isVideo = msg.image_url.match(/\.(mp4|webm|ogg|mov)$/i) || msg.image_url.includes('video_');
        if (isVideo) {
            const video = document.createElement('video');
            video.src = msg.image_url;
            video.controls = true;
            video.preload = "metadata";
            msgDiv.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.src = msg.image_url;
            img.onclick = () => openLightbox(msg.image_url);
            msgDiv.appendChild(img);
        }
    }

    const dateObj = msg.created_at ? new Date(msg.created_at) : new Date();
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');

    const timeSpan = document.createElement('span');
    timeSpan.className = 'msg-time';
    timeSpan.textContent = `${hours}:${minutes}`;
    msgDiv.appendChild(timeSpan);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '×';
    deleteBtn.onclick = () => deleteMessage(msg.id);
    msgDiv.appendChild(deleteBtn);

    // BOTÓN PARA REACCIONAR (abre el selector de emojis tipo Slack/WhatsApp)
    const reactBtn = document.createElement('button');
    reactBtn.className = 'btn-react';
    reactBtn.textContent = '😊';
    reactBtn.title = 'Reaccionar';
    reactBtn.onclick = (e) => {
        e.stopPropagation();
        if (openReactionPickerId === msg.id) {
            closeReactionPicker();
        } else {
            openReactionPicker(msg.id, reactBtn);
        }
    };
    msgDiv.appendChild(reactBtn);

    // Pinta las reacciones que ya estén en caché para este mensaje (si el
    // lote de mensajes recién se cargó, loadReactionsForMessages las trae
    // después y vuelve a llamar a renderReactions).
    renderReactions(msgDiv, msg.id, messageReactionsCache[msg.id] || {});

    if (prepend) {
        messagesContainer.insertBefore(msgDiv, messagesContainer.firstChild);
    } else {
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// CARGAR MENSAJES AL ABRIR EL CHAT (respeta INITIAL_MESSAGES_COUNT)
async function loadInitialMessages() {
    try {
        messagesContainer.innerHTML = '';

        if (INITIAL_MESSAGES_COUNT > 0) {
            const { data, error } = await supabaseClient
                .from('messages')
                .select('*')
                .eq('hidden', false)
                .order('created_at', { ascending: false })
                .limit(INITIAL_MESSAGES_COUNT);

            if (error) throw error;

            if (data && data.length > 0) {
                const ordered = data.slice().reverse(); // de más antiguo a más reciente
                ordered.forEach(msg => renderMessage(msg));
                loadReactionsForMessages(ordered.map(msg => msg.id));
                oldestMessageTimestamp = ordered[0].created_at;
                noMoreOlderMessages = data.length < INITIAL_MESSAGES_COUNT;
            } else {
                noMoreOlderMessages = true;
            }
        } else {
            // No se muestra nada al entrar. Usamos la hora actual como punto de
            // partida, así "Cargar mensajes anteriores" trae los mensajes más
            // recientes existentes la primera vez que se presiona.
            oldestMessageTimestamp = new Date().toISOString();
            noMoreOlderMessages = false;
        }

        updateLoadMoreBar();
    } catch (error) {
        console.error("Error al cargar mensajes:", error);
    }
}

// CARGAR MENSAJES ANTERIORES (al hacer clic en la barra "Cargar mensajes anteriores"
// o, como atajo adicional, al deslizar hasta el tope del historial si es que hay scroll)
async function loadOlderMessages() {
    if (isLoadingOlderMessages || noMoreOlderMessages || !oldestMessageTimestamp || !messagesContainer) return;
    isLoadingOlderMessages = true;

    if (loadMoreBar) {
        loadMoreBar.textContent = 'Cargando...';
        loadMoreBar.disabled = true;
    }

    try {
        const { data, error } = await supabaseClient
            .from('messages')
            .select('*')
            .eq('hidden', false)
            .lt('created_at', oldestMessageTimestamp)
            .order('created_at', { ascending: false })
            .limit(MESSAGES_PAGE_SIZE);

        if (error) throw error;

        if (!data || data.length === 0) {
            noMoreOlderMessages = true;
            return;
        }

        // Guardamos la altura previa para mantener la posición visual del scroll
        const previousScrollHeight = messagesContainer.scrollHeight;

        // IMPORTANTE: NO se invierte el array aquí. `data` ya viene en orden
        // descendente (más reciente primero). Como renderMessage(msg, true)
        // inserta cada uno como nuevo primer hijo (insertBefore firstChild),
        // recorrer `data` en su orden original (descendente) hace que terminen
        // apilados correctamente de más viejo (arriba) a más reciente (abajo).
        // Si se invertía antes con .reverse(), se producía una doble inversión
        // que desordenaba la conversación.
        data.forEach(msg => renderMessage(msg, true));
        loadReactionsForMessages(data.map(msg => msg.id));

        // El mensaje más viejo del lote es el ÚLTIMO elemento de `data`
        // (por venir en orden descendente), no el primero.
        oldestMessageTimestamp = data[data.length - 1].created_at;
        if (data.length < MESSAGES_PAGE_SIZE) noMoreOlderMessages = true;

        const newScrollHeight = messagesContainer.scrollHeight;
        messagesContainer.scrollTop = newScrollHeight - previousScrollHeight;
    } catch (error) {
        console.error("Error al cargar mensajes anteriores:", error);
    } finally {
        isLoadingOlderMessages = false;
        if (loadMoreBar) loadMoreBar.disabled = false;
        updateLoadMoreBar();
    }
}

// Muestra u oculta la barra "Cargar mensajes anteriores" según si queda historial
function updateLoadMoreBar() {
    if (!loadMoreBar) return;
    if (noMoreOlderMessages) {
        loadMoreBar.style.display = 'none';
    } else {
        loadMoreBar.style.display = 'block';
        loadMoreBar.textContent = 'Cargar mensajes anteriores ↑';
    }
}

if (loadMoreBar) {
    loadMoreBar.addEventListener('click', loadOlderMessages);
}

// Atajo adicional: si el historial sí llega a ser más alto que el área visible,
// deslizar hasta arriba también dispara la carga (además del botón de la barra).
if (messagesContainer) {
    messagesContainer.addEventListener('scroll', () => {
        if (messagesContainer.scrollTop < 40) {
            loadOlderMessages();
        }
    });
}

// OCULTAR MENSAJE (no lo borra de la base de datos, solo lo marca como oculto
// para que deje de mostrarse en la vista de todos)
async function deleteMessage(id) {
    if (!isAdmin) return;
    if (!confirm('¿Deseas ocultar este mensaje de la vista?')) return;

    try {
        const { error } = await supabaseClient
            .from('messages')
            .update({ hidden: true })
            .eq('id', id);
        if (error) throw error;
    } catch (error) {
        console.error(error);
        alert('Error al intentar ocultar el mensaje.');
    }
}

// Mensajes que llegan por Realtime mientras el chat está oculto (candado activo);
// se muestran recién cuando se desbloquea, para no filtrar contenido en pantalla.
let pendingMessagesWhileHidden = [];

function isChatCurrentlyHidden() {
    return !!(lockOverlay && lockOverlay.style.display !== 'none');
}

function flushPendingMessages() {
    pendingMessagesWhileHidden.forEach(msg => renderMessage(msg));
    pendingMessagesWhileHidden = [];
}

// ESCUCHA REALTIME ACTIVA DE LA BASE DE DATOS
supabaseClient
    .channel('schema-db-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        // Si ya se renderizó localmente al enviarlo (ver sendMessage), no lo
        // dupliques cuando Realtime lo entregue de vuelta.
        if (document.getElementById(`msg-${payload.new.id}`)) return;

        if (isChatCurrentlyHidden()) {
            pendingMessagesWhileHidden.push(payload.new);
        } else {
            renderMessage(payload.new);
        }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
        const deletedId = payload.old.id;
        const el = document.getElementById(`msg-${deletedId}`);
        if (el) el.remove();
        // Si el mensaje eliminado estaba en la cola de pendientes (llegó y se borró
        // mientras el chat estaba oculto), también se descarta de ahí.
        pendingMessagesWhileHidden = pendingMessagesWhileHidden.filter(m => m.id !== deletedId);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
        // Cuando un mensaje se marca como oculto (hidden: true), se quita de
        // la vista de todos al instante, sin recargar nada.
        // (Las reacciones ya NO viven en esta tabla — se manejan aparte con
        // su propio canal Realtime sobre "message_reactions", más arriba.)
        if (payload.new.hidden) {
            const el = document.getElementById(`msg-${payload.new.id}`);
            if (el) el.remove();
            pendingMessagesWhileHidden = pendingMessagesWhileHidden.filter(m => m.id !== payload.new.id);
        }
    })
    .subscribe();

// AUTO-REDIMENSIÓN DEL ÁREA DE TEXTO
if (msgInput) {
    msgInput.addEventListener('input', () => {
        msgInput.style.height = 'auto';
        msgInput.style.height = (msgInput.scrollHeight) + 'px';
    });
}

// ENVIAR MENSAJE CON LOGICA DE SUBIDA MULTIMEDIA A STORAGE
async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text && queueFiles.length === 0) return;

    try {
        if (queueFiles.length === 0) {
            const { data, error } = await supabaseClient
                .from('messages')
                .insert([{ text: text, sender_id: mySessionId }])
                .select();
            if (error) throw error;
            if (data && data[0]) renderMessage(data[0]);
        } else {
            for (let i = 0; i < queueFiles.length; i++) {
                const file = queueFiles[i];
                const isVid = file.type.startsWith('video/');
                const fileName = `${Date.now()}_${isVid ? 'video_' : 'file_'}${file.name || 'archivo'}`;

                const { data: uploadData, error: uploadError } = await supabaseClient.storage
                    .from('chat-images')
                    .upload(fileName, file);

                if (uploadError) throw uploadError;

                const { data: urlData } = supabaseClient.storage
                    .from('chat-images')
                    .getPublicUrl(fileName);

                const imageUrl = urlData.publicUrl;
                const currentText = (i === 0) ? text : '';

                const { data: insertData, error: insertError } = await supabaseClient
                    .from('messages')
                    .insert([{ text: currentText, image_url: imageUrl, sender_id: mySessionId }])
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
        alert(`Fallo al enviar el mensaje: ${error.message}`);
    }
}

// Vinculación de gatillos de envío
if (sendBtn) sendBtn.addEventListener('click', sendMessage);
if (msgInput) {
    msgInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

// Inicializar al cargar el archivo
refreshCurrentUserId();
loadInitialMessages();