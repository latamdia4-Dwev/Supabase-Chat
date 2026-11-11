// js/msg-utils.js
// Utilidades compartidas por el chat general y los mensajes privados:
// normalización de texto pegado, render de texto/medios y vista previa de
// archivos en cola. Se carga antes de chat.js y dm.js.

// Solo se quitan las líneas vacías del inicio y los espacios del final.
// Los espacios/tabulaciones al inicio de la primera línea con contenido se
// conservan, porque forman parte de la estructura del texto pegado.
function normalizeMessageText(raw) {
    if (typeof raw !== 'string') return '';
    return raw
        .replace(/\r\n?/g, '\n')
        .replace(/^(?:[ \t]*\n)+/, '')
        .replace(/\s+$/, '');
}

// true si el texto trae sangrías, tabulaciones o columnas alineadas con
// espacios; en ese caso se muestra en bloque monoespaciado.
function isStructuredText(text) {
    if (!text) return false;
    return /\t/.test(text) || /^[ ]+\S/m.test(text) || /\S {2,}\S/.test(text);
}

// Agrega el texto de un mensaje al contenedor y devuelve el elemento creado.
function appendMessageText(container, text, isHidden) {
    const el = document.createElement(isStructuredText(text) ? 'pre' : 'p');
    if (el.tagName === 'PRE') {
        el.className = 'msg-pre';
    } else {
        el.style.margin = '0';
        el.style.whiteSpace = 'pre-wrap';
    }
    if (isHidden) {
        el.style.textDecoration = 'line-through';
        el.style.opacity = '0.6';
    }
    el.textContent = text;
    container.appendChild(el);
    return el;
}

function isVideoUrl(url) {
    return !!url && (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url) || url.includes('video_'));
}

// Videos con reproductor; imágenes que se abren con el zoom (lightbox).
function appendMessageMedia(container, url) {
    if (!url) return;
    if (isVideoUrl(url)) {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.preload = 'metadata';
        container.appendChild(video);
    } else {
        const img = document.createElement('img');
        img.src = url;
        img.onclick = () => openLightbox(url);
        container.appendChild(img);
    }
}

// Dibuja las miniaturas de una cola de archivos. 'queue' se modifica en su
// lugar al quitar un elemento y se invoca 'onChange' para volver a dibujar.
function renderFileQueuePreview(container, queue, onChange) {
    if (!container) return;
    container.innerHTML = '';
    if (queue.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    queue.forEach((file, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'preview-item';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove';
        removeBtn.type = 'button';
        removeBtn.textContent = '×';
        removeBtn.onclick = (e) => {
            e.preventDefault();
            queue.splice(index, 1);
            onChange();
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
        container.appendChild(itemDiv);
    });
}
