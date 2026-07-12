// js/chat.js (Módulo de Mensajería, Storage y Cola de Vista Previa Completo)

// DIBUJAR Y ELIMINAR MINIATURAS EN LA COLA PRE-ENVÍO
function updateFilePreview() {
    if (!previewContainer) return;

    previewContainer.innerHTML = '';

    if (queueFiles.length > 0) {
        previewContainer.style.display = 'flex';

        queueFiles.forEach((file, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'preview-item';

            // Botón para quitar el archivo específico de la cola
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-remove';
            removeBtn.textContent = '×';
            removeBtn.onclick = (e) => {
                e.preventDefault();
                queueFiles.splice(index, 1);
                updateFilePreview();
            };
            itemDiv.appendChild(removeBtn);

            // Generar miniatura según tipo de archivo
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
fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files);
    queueFiles = queueFiles.concat(files);
    updateFilePreview();
});

// RENDERIZAR MENSAJES EN EL HISTORIAL (Con soporte de Video e Inyección de Hora)
function renderMessage(msg) {
    if (!messagesContainer) return;

    const isMe = msg.sender_id === mySessionId;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isMe ? 'sent' : 'received'}`;
    msgDiv.id = `msg-${msg.id}`;

    // 1. Texto del mensaje
    if (msg.text) {
        const textPara = document.createElement('p');
        textPara.style.margin = '0';
        textPara.textContent = msg.text;
        msgDiv.appendChild(textPara);
    }

    // 2. Archivos Multimedia (Imágenes y Videos)
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

    // 3. Estampa de Tiempo (Hora del mensaje)
    const dateObj = msg.created_at ? new Date(msg.created_at) : new Date();
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');

    const timeSpan = document.createElement('span');
    timeSpan.className = 'msg-time';
    timeSpan.textContent = `${hours}:${minutes}`;
    msgDiv.appendChild(timeSpan);

    // 4. Botón de borrado para el Modo Administrador
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '×';
    deleteBtn.onclick = () => deleteMessage(msg.id);
    msgDiv.appendChild(deleteBtn);

    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// CARGAR HISTORIAL DESDE LA TABLA SUPABASE
async function loadInitialMessages() {
    try {
        const { data, error } = await supabaseClient
            .from('messages')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) throw error;

        messagesContainer.innerHTML = '';
        if (data) data.forEach(msg => renderMessage(msg));
    } catch (error) {
        console.error("Error al cargar mensajes:", error);
    }
}

// ELIMINAR MENSAJE FÍSICO
async function deleteMessage(id) {
    if (!isAdmin) return;
    if (!confirm('¿Deseas eliminar este mensaje de forma permanente?')) return;

    try {
        const { error } = await supabaseClient
            .from('messages')
            .delete()
            .eq('id', id);
        if (error) throw error;
    } catch (error) {
        console.error(error);
        alert('Error al intentar eliminar el registro.');
    }
}

// ESCUCHA REALTIME ACTIVA DE LA BASE DE DATOS
supabaseClient
    .channel('schema-db-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        renderMessage(payload.new);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
        const deletedId = payload.old.id;
        const el = document.getElementById(`msg-${deletedId}`);
        if (el) el.remove();
    })
    .subscribe();

// AUTO-REDIMENSIÓN DEL ÁREA DE TEXTO
msgInput.addEventListener('input', () => {
    msgInput.style.height = 'auto';
    msgInput.style.height = (msgInput.scrollHeight) + 'px';
});

// ENVIAR MENSAJE CON LOGICA DE SUBIDA MULTIMEDIA A STORAGE
async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text && queueFiles.length === 0) return;

    try {
        if (queueFiles.length === 0) {
            // Envío normal de texto
            const { error } = await supabaseClient
                .from('messages')
                .insert([{ text: text, sender_id: mySessionId }]);
            if (error) throw error;
        } else {
            // Envío en bloque si hay archivos en la cola de subida
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

        // Limpieza de estados e interfaz tras completar el envío exitoso
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
sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Inicializar al cargar el archivo
loadInitialMessages();