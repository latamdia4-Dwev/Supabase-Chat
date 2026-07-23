// js/media-picker.js
// Panel de Emojis / Stickers / GIFs para componer mensajes.
//
// - Emojis: se insertan como texto en msgInput (no generan un mensaje aparte).
// - Stickers: emojis grandes renderizados como imagen (vía twemoji, CDN
//   pública y gratuita) que se envían de inmediato como mensaje de imagen.
// - GIFs: búsqueda en la API pública de Giphy (necesita GIPHY_API_KEY en
//   config.js) y se envían como mensaje de imagen usando la URL del GIF
//   directamente, sin pasar por Supabase Storage.
//
// Requiere que ya existan (declarados en config.js): emojiToggle, mediaPanel,
// tabEmoji, tabSticker, tabGif, gifSearchRow, gifInput, searchGifBtn,
// mediaGrid, msgInput, GIPHY_API_KEY. Requiere sendQuickImageMessage()
// (definida en chat.js), así que este archivo debe cargarse después de él.

const GIPHY_SEARCH_URL = 'https://api.giphy.com/v1/gifs/search';
const GIPHY_TRENDING_URL = 'https://api.giphy.com/v1/gifs/trending';

// Set compacto de emojis de uso común (sin categorías, para mantenerlo simple)
const COMMON_EMOJIS = [
    '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
    '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
    '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
    '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔',
    '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🥵', '🥶', '😵',
    '🤯', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯',
    '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭',
    '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡',
    '😠', '🤬', '👍', '👎', '👏', '🙌', '🙏', '💪', '👋', '🤝',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💯',
    '🔥', '✨', '🎉', '🎂', '🎁', '☕', '🍕', '🍺', '⚽', '🚀'
];

// Emojis usados como "stickers" (versión grande, renderizada como imagen)
const STICKER_EMOJIS = ['😂', '❤️', '👍', '🎉', '😢', '😮', '🔥', '💯', '🙏', '😍', '🥳', '👏'];

function twemojiUrl(emoji) {
    const codePoints = [...emoji]
        .map(char => char.codePointAt(0).toString(16))
        .join('-');
    return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codePoints}.png`;
}

let mediaMode = 'emoji';

// Inserta texto en la posición actual del cursor de un <textarea>/<input>
function insertTextAtCursor(input, text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const cursor = start + text.length;
    input.selectionStart = input.selectionEnd = cursor;
    input.dispatchEvent(new Event('input')); // dispara el auto-resize ya definido en chat.js
    input.focus();
}

function closeMediaPanel() {
    if (mediaPanel) mediaPanel.classList.remove('open');
}

// --- PESTAÑA EMOJIS ---
function renderEmojiGrid() {
    if (!mediaGrid) return;
    mediaGrid.innerHTML = '';
    COMMON_EMOJIS.forEach(emoji => {
        const span = document.createElement('span');
        span.className = 'emoji-item';
        span.textContent = emoji;
        span.onclick = () => insertTextAtCursor(msgInput, emoji);
        mediaGrid.appendChild(span);
    });
}

// --- PESTAÑA STICKERS ---
function renderStickerGrid() {
    if (!mediaGrid) return;
    mediaGrid.innerHTML = '';
    STICKER_EMOJIS.forEach(emoji => {
        const img = document.createElement('img');
        img.className = 'sticker-item';
        img.src = twemojiUrl(emoji);
        img.alt = emoji;
        img.onclick = () => {
            sendQuickImageMessage(twemojiUrl(emoji));
            closeMediaPanel();
        };
        mediaGrid.appendChild(img);
    });
}

// --- PESTAÑA GIFS (Giphy) ---
async function renderGifGrid(query) {
    if (!mediaGrid) return;
    mediaGrid.innerHTML = '<div class="media-status">🔎 Buscando GIFs...</div>';

    try {
        const url = query
            ? `${GIPHY_SEARCH_URL}?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=pg-13`
            : `${GIPHY_TRENDING_URL}?api_key=${GIPHY_API_KEY}&limit=24&rating=pg-13`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        renderGifResults(data.data);
    } catch (err) {
        console.error('Error buscando GIFs:', err);
        mediaGrid.innerHTML = '<div class="media-status">⚠️ Error al buscar. Revisa tu GIPHY_API_KEY en config.js.</div>';
    }
}

function renderGifResults(gifs) {
    mediaGrid.innerHTML = '';

    const validGifs = (gifs || []).filter(g => g.images && g.images.fixed_width_small && g.images.original);

    if (validGifs.length === 0) {
        mediaGrid.innerHTML = '<div class="media-status">Sin resultados para esa búsqueda.</div>';
        return;
    }

    validGifs.forEach(gif => {
        const img = document.createElement('img');
        img.className = 'gif-item';
        img.src = gif.images.fixed_width_small.url;
        img.alt = gif.title || 'GIF';
        img.onclick = () => {
            sendQuickImageMessage(gif.images.original.url);
            closeMediaPanel();
        };
        mediaGrid.appendChild(img);
    });
}

// --- CAMBIO DE PESTAÑA ---
function setMediaMode(mode) {
    mediaMode = mode;

    if (tabEmoji) tabEmoji.classList.toggle('active', mode === 'emoji');
    if (tabSticker) tabSticker.classList.toggle('active', mode === 'sticker');
    if (tabGif) tabGif.classList.toggle('active', mode === 'gif');
    if (gifSearchRow) gifSearchRow.style.display = mode === 'gif' ? 'flex' : 'none';

    if (mode === 'emoji') renderEmojiGrid();
    else if (mode === 'sticker') renderStickerGrid();
    else if (mode === 'gif') renderGifGrid(gifInput ? gifInput.value.trim() : undefined);
}

if (emojiToggle && mediaPanel) {
    emojiToggle.addEventListener('click', () => {
        mediaPanel.classList.toggle('open');
        if (mediaPanel.classList.contains('open')) setMediaMode(mediaMode);
    });
}

if (tabEmoji) tabEmoji.addEventListener('click', () => setMediaMode('emoji'));
if (tabSticker) tabSticker.addEventListener('click', () => setMediaMode('sticker'));
if (tabGif) tabGif.addEventListener('click', () => setMediaMode('gif'));

if (searchGifBtn) {
    searchGifBtn.addEventListener('click', () => {
        renderGifGrid(gifInput.value.trim() || undefined);
    });
}

if (gifInput) {
    gifInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            renderGifGrid(gifInput.value.trim() || undefined);
        }
    });
}
