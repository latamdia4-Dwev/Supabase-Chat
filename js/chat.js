// js/chat.js

// DIBUJAR Y ELIMINAR MINIATURAS EN LA COLA PRE-ENVÍO
function updateFilePreview() {
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

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        queueFiles = queueFiles.concat(Array.from(fileInput.files));
        fileInput.value = "";
        updateFilePreview();
    }
});

document.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    let added = false;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) {
                queueFiles.push(file);
                added = true;
            }
        }
    }
    if (added) updateFilePreview();
});

msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event('submit'));
    } else if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey)) {
        setTimeout(() => {
            msgInput.style.height = 'auto';
            msgInput.style.height = msgInput.scrollHeight + 'px';
        }, 10);
    }
});

// CONSULTAS CRUD HISTÓRICAS DE SUPABASE
async function loadInitialMessages() {
    try {
        const { data, error } = await supabaseClient
            .from('messages')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) throw error;
        messagesContainer.innerHTML = '';
        if (data && data.length > 0) {
            data.forEach(msg => {
                if (msg.deleted !== true) renderMessage(msg);
            });
        } else {
            messagesContainer.innerHTML = '<div style="text-align:center;color:#888;font-size:0.9em;padding:10px;">No hay mensajes.</div>';
        }
    } catch (error) {
        console.error(error);
        messagesContainer.innerHTML = `<div class="log-error"><strong>Error:</strong><br>${error.message}</div>`;
    }
}

// CANAL ACTIVO DEL TIEMPO REAL SÍNCRONO (ESCUCHA GLOBAL)
supabaseClient
    .channel('schema-db-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
        if (payload.table === 'messages') {
            if (payload.eventType === 'INSERT' && !payload.new.deleted) {
                renderMessage(payload.new);
            } else if (payload.eventType === 'UPDATE') {
                if (payload.new.deleted) {
                    const existingMsgNode = document.getElementById(`msg-${payload.new.id}`);
                    if (existingMsgNode) existingMsgNode.remove();
                }
            }
        }
    })
    .subscribe();

function renderMessage(data) {
    const msgId = data.id || `temp-${Date.now()}`;
    if (document.getElementById(`msg-${msgId}`)) return;

    const msgDiv = document.createElement('div');
    msgDiv.id = `msg-${msgId}`;
    msgDiv.className = `msg ${data.sender_id === mySessionId ? 'mine' : ''}`;

    if (data.text) {
        const textSpan = document.createElement('span');
        textSpan.textContent = data.text;
        msgDiv.appendChild(textSpan);
    }

    if (data.image_url) {
        const url = data.image_url;
        const isVideo = url.match(/\.(mp4|webm|ogg|mov)/i) || url.includes('video_');

        if (isVideo) {
            const video = document.createElement('video');
            video.src = url;
            video.controls = true;
            msgDiv.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.src = url;
            img.onclick = () => openLightbox(url);
            img.onerror = function () {
                const link = document.createElement('a');
                link.href = url;
                link.target = '_blank';
                link.className = 'file-attachment';
                link.innerHTML = `📁 Descargar Archivo adjunto`;
                msgDiv.replaceChild(link, img);
            };
            msgDiv.appendChild(img);
        }
    }

    const msgMeta = document.createElement('div');
    msgMeta.className = 'msg-meta';
    const timeString = data.created_at
        ? new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const timeSpan = document.createElement('span');
    timeSpan.textContent = timeString;
    msgMeta.appendChild(timeSpan);

    if (data.id) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete';
        deleteBtn.textContent = '🗑️';
        deleteBtn.onclick = () => deleteMessageLogically(data.id);
        msgMeta.appendChild(deleteBtn);
    }

    msgDiv.appendChild(msgMeta);
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function deleteMessageLogically(msgId) {
    if (!confirm("¿Ocultar este mensaje del chat?")) return;
    try {
        const { error } = await supabaseClient
            .from('messages')
            .update({ deleted: true })
            .eq('id', msgId);
        if (error) throw error;
    } catch (error) {
        alert(`Error al borrar: ${error.message}`);
    }
}

// ENVÍO DE DATOS Y GESTIÓN MULTI-SUBIDA A STORAGE BUCKET
form.addEventListener('submit', async (e) => {
    if (e) e.preventDefault();
    const text = msgInput.value.trim();
    if (!text && queueFiles.length === 0) return;

    sendBtn.disabled = true;

    try {
        if (queueFiles.length === 0) {
            const { error } = await supabaseClient
                .from('messages')
                .insert([{ text: text, sender_id: mySessionId }]);
            if (error) throw error;
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

                const { error: insertError } = await supabaseClient
                    .from('messages')
                    .insert([{ text: currentText, image_url: imageUrl, sender_id: mySessionId }]);

                if (insertError) throw insertError;
            }
        }

        form.reset();
        queueFiles = [];
        updateFilePreview();
        msgInput.style.height = '20px';
    } catch (error) {
        console.error(error);
        alert(`Fallo al enviar: ${error.message}`);
    } finally {
        sendBtn.disabled = false;
    }
});

loadInitialMessages();