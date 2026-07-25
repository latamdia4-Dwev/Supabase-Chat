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

// Emojis organizados por categoría para el panel del chat
const EMOJI_CATEGORIES = [
    { label: '😀 Caras', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','😵','🤯','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'] },
    { label: '👋 Gestos', emojis: ['👍','👎','👏','🙌','🤲','🤝','🙏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👋','🤚','🖐️','✋','🖖','💪','🦵','🦶','👂','👃','👁️','👀','👅','💋'] },
    { label: '❤️ Corazones', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','❤️‍🔥','❤️‍🩹'] },
    { label: '🎉 Celebración', emojis: ['🎉','🎊','🎈','🎁','🎂','🍰','🥂','🍾','🏆','🥇','🎯','🎮','🎪','🎭','🎨','🎬','🎤','🎧','🎵','🎶','🎸','🥁','🎷','🎺','🎻','🪗'] },
    { label: '🔥 Símbolos', emojis: ['🔥','✨','💫','⭐','🌟','💥','❄️','🌈','☀️','🌙','⚡','🌊','💦','🍀','🌸','🌺','🌻','🌹','💐','🍁','🍂','🍃','🌿','💯','✅','❌','⚠️','🚨','💡','🔑','🔒','🔓','🎯','💎','👑'] },
    { label: '🐶 Animales', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦆','🦉','🦇','🐺','🐴','🦄','🐝','🦋','🐞','🐢','🐍','🦎','🐙','🦑','🐬','🐳'] },
    { label: '🍕 Comida', emojis: ['🍕','🍔','🌮','🌯','🍜','🍝','🍣','🍱','🍛','🍲','🥘','🍗','🍖','🥩','🥓','🌭','🥚','🍳','🧇','🥞','🍞','🥐','🥗','🍎','🍊','🍋','🍇','🍓','🍒','☕','🍵','🧋','🍺','🍻','🥃','🍷','🥂','🍾'] },
    { label: '🚀 Varios', emojis: ['🚀','🛸','🌍','🌏','🌎','🗺️','🧭','⛺','🏠','🏰','🏯','🗼','🗽','🏟️','🎠','🎡','🎢','💈','🎪','🚂','🚃','🚄','🚅','✈️','🚀','🛶','⛵','🚗','🚕','🚙','🏎️','🚓','🚑','🚒','⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥊','🎽','🛹','🛷','⛸️','🥅','⛳','🎣','🤿','🎯','🎲','🎮','🕹️','🧩'] }
];

// Flat list for backward compat (used nowhere new, kept for safety)
const COMMON_EMOJIS = EMOJI_CATEGORIES.flatMap(c => c.emojis);

// Emojis usados como "stickers" (versión grande, renderizada como imagen)
const STICKER_EMOJIS = ['😂', '❤️', '👍', '🎉', '😢', '😮', '🔥', '💯', '🙏', '😍', '🥳', '👏'];

function twemojiUrl(emoji) {
    const codePoints = [...emoji]
        .map(char => char.codePointAt(0).toString(16))
        .join('-');
    return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codePoints}.png`;
}

let mediaMode = 'emoji';
let emojiSearchTerm = '';

function insertTextAtCursor(input, text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const cursor = start + text.length;
    input.selectionStart = input.selectionEnd = cursor;
    input.dispatchEvent(new Event('input'));
    input.focus();
}

function closeMediaPanel() {
    if (mediaPanel) mediaPanel.classList.remove('open');
}

// Builds or rebuilds a search input above the emoji grid
function ensureEmojiSearch() {
    if (document.getElementById('emojiSearchInput')) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:6px 10px 0 10px;flex-shrink:0;';
    const input = document.createElement('input');
    input.id = 'emojiSearchInput';
    input.type = 'text';
    input.placeholder = '🔍 Buscar emoji...';
    input.style.cssText = `
        width:100%;box-sizing:border-box;padding:7px 12px;border-radius:20px;
        border:1px solid #333;background:var(--bg-input,#1a1a1a);
        color:var(--text-input,#fff);font-size:0.82em;outline:none;
    `;
    input.addEventListener('input', () => {
        emojiSearchTerm = input.value.trim().toLowerCase();
        renderEmojiGrid();
    });
    wrap.appendChild(input);
    // Insert before mediaGrid
    if (mediaGrid && mediaGrid.parentNode) {
        mediaGrid.parentNode.insertBefore(wrap, mediaGrid);
    }
}

// --- PESTAÑA EMOJIS (categorías + búsqueda) ---
function renderEmojiGrid() {
    if (!mediaGrid) return;
    mediaGrid.innerHTML = '';
    mediaGrid.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:6px 10px;overflow-y:auto;flex:1;min-height:0;';

    const term = emojiSearchTerm;

    EMOJI_CATEGORIES.forEach(cat => {
        const filtered = term
            ? cat.emojis.filter(e => e.includes(term) || cat.label.toLowerCase().includes(term))
            : cat.emojis;
        if (filtered.length === 0) return;

        // Category label
        const label = document.createElement('div');
        label.textContent = cat.label;
        label.style.cssText = 'font-size:0.68em;color:#888;font-weight:bold;padding:4px 2px 2px 2px;flex-shrink:0;';
        mediaGrid.appendChild(label);

        // Emoji row
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px;';
        filtered.forEach(emoji => {
            const span = document.createElement('span');
            span.className = 'emoji-item';
            span.textContent = emoji;
            span.style.fontSize = '1.3em';
            span.onclick = () => insertTextAtCursor(msgInput, emoji);
            row.appendChild(span);
        });
        mediaGrid.appendChild(row);
    });

    if (mediaGrid.innerHTML === '') {
        mediaGrid.innerHTML = '<div style="color:#888;font-size:0.82em;text-align:center;padding:16px;">Sin resultados</div>';
    }
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

    if (mode === 'emoji') { ensureEmojiSearch(); renderEmojiGrid(); }
    else if (mode === 'sticker') renderStickerGrid();
    else if (mode === 'gif') renderGifGrid(gifInput ? gifInput.value.trim() : undefined);
}

if (emojiToggle && mediaPanel) {
    emojiToggle.addEventListener('click', () => {
        mediaPanel.classList.toggle('open');
        if (mediaPanel.classList.contains('open')) {
            setMediaMode(mediaMode);
            // Focus search if emoji tab is active
            if (mediaMode === 'emoji') {
                setTimeout(() => {
                    const s = document.getElementById('emojiSearchInput');
                    if (s) s.focus();
                }, 80);
            }
        }
    });
}

// Cierra el panel si se hace clic en cualquier otro lugar de la página
// (fuera del panel y fuera del botón 😀 que lo abre).
document.addEventListener('click', (e) => {
    if (!mediaPanel || !mediaPanel.classList.contains('open')) return;
    if (e.target.closest('#mediaPanel') || e.target.closest('#emojiToggle')) return;
    closeMediaPanel();
});

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
