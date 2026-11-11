// js/options.js
// Página de Opciones (botón ⚙️ del header): volumen, colores, tamaño del
// texto de los mensajes, álbumes ocultos y restablecer. Todo se guarda en el
// navegador (localStorage), sin tocar la base de datos.
// Se carga después de ui.js y antes de music.js (music.js lee chatOptions).

const OPTIONS_STORAGE_KEY = 'chatOptions';
const LAST_VOLUME_STORAGE_KEY = 'radioVolume'; // último volumen usado en el reproductor
const DEFAULT_VOLUME_PERCENT = 10;
const DEFAULT_FONT_SIZE_PX = 16;
const DEFAULT_PAGE_BG = '#000000'; // valor inline original de <html> en index.html

// cssVar: variable que se sobrescribe; textVar: color de texto que se ajusta
// solo (blanco/negro) según el brillo del color elegido para mantener la lectura.
const COLOR_OPTIONS = [
    { key: 'accent',   label: 'Color de acento',      cssVar: '--accent' },
    { key: 'sent',     label: 'Mensajes enviados',    cssVar: '--bg-msg-sent',     textVar: '--bubble-text-sent' },
    { key: 'received', label: 'Mensajes recibidos',   cssVar: '--bg-msg-received', textVar: '--bubble-text-received' },
    { key: 'chatBg',   label: 'Fondo del chat',       cssVar: '--bg-messages' },
    { key: 'header',   label: 'Encabezado',           cssVar: '--bg-header',       textVar: '--text-header' },
    { key: 'pageBg',   label: 'Fondo de la página',   cssVar: '--bg-body' }
];

function getDefaultChatOptions() {
    const colors = {};
    COLOR_OPTIONS.forEach(c => { colors[c.key] = null; }); // null = valor del tema
    return {
        volume: DEFAULT_VOLUME_PERCENT,
        rememberVolume: false,
        fontSize: DEFAULT_FONT_SIZE_PX,
        colors
    };
}

function loadChatOptions() {
    const options = getDefaultChatOptions();
    try {
        const saved = JSON.parse(localStorage.getItem(OPTIONS_STORAGE_KEY) || 'null');
        if (saved && typeof saved === 'object') {
            if (Number.isFinite(saved.volume)) options.volume = Math.min(100, Math.max(0, saved.volume));
            options.rememberVolume = saved.rememberVolume === true;
            if (Number.isFinite(saved.fontSize)) options.fontSize = Math.min(28, Math.max(10, saved.fontSize));
            if (saved.colors && typeof saved.colors === 'object') {
                COLOR_OPTIONS.forEach(c => {
                    if (/^#[0-9a-f]{6}$/i.test(saved.colors[c.key])) options.colors[c.key] = saved.colors[c.key];
                });
            }
        }
    } catch (err) {
        console.warn('No se pudieron leer las opciones guardadas:', err);
    }
    return options;
}

let chatOptions = loadChatOptions();

function saveChatOptions() {
    try {
        localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(chatOptions));
    } catch (err) {
        console.warn('No se pudieron guardar las opciones:', err);
    }
}

// Volumen con el que arranca el reproductor (0 a 1): el último usado si la
// casilla "recordar" está activa y hay uno guardado; si no, el de las opciones.
function getInitialVolume() {
    if (chatOptions.rememberVolume) {
        try {
            const last = parseFloat(localStorage.getItem(LAST_VOLUME_STORAGE_KEY));
            if (Number.isFinite(last)) return Math.min(1, Math.max(0, last));
        } catch (err) { /* sin localStorage: se usa el de las opciones */ }
    }
    return chatOptions.volume / 100;
}

// ── COLORES Y TEXTO ────────────────────────────────────────────────────
function hexToRgbTriplet(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function readableTextColor(hex) {
    const [r, g, b] = hexToRgbTriplet(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111111' : '#ffffff';
}

function rgbStringToHex(rgb) {
    const m = (rgb || '').match(/\d+/g);
    if (!m || m.length < 3) return '#000000';
    return '#' + m.slice(0, 3).map(v => parseInt(v, 10).toString(16).padStart(2, '0')).join('');
}

function applyChatOptions() {
    const rootStyle = document.documentElement.style;

    COLOR_OPTIONS.forEach(c => {
        const value = chatOptions.colors[c.key];
        if (value) {
            rootStyle.setProperty(c.cssVar, value);
            if (c.textVar) rootStyle.setProperty(c.textVar, readableTextColor(value));
            if (c.key === 'accent') rootStyle.setProperty('--accent-rgb', hexToRgbTriplet(value).join(', '));
        } else {
            rootStyle.removeProperty(c.cssVar);
            if (c.textVar) rootStyle.removeProperty(c.textVar);
            if (c.key === 'accent') rootStyle.removeProperty('--accent-rgb');
        }
    });

    // <html> trae un fondo inline (index.html); se sincroniza con el de la página
    rootStyle.backgroundColor = chatOptions.colors.pageBg || DEFAULT_PAGE_BG;
    rootStyle.setProperty('--msg-font-size', `${chatOptions.fontSize}px`);
}

// ── PANEL ──────────────────────────────────────────────────────────────
const optionsBody = document.getElementById('optionsBody');
const optionsCloseBtn = document.getElementById('optionsCloseBtn');
const optionsUi = {}; // referencias a los controles, para refrescarlos

function buildOptionsRow(labelText) {
    const row = document.createElement('div');
    row.className = 'options-row';
    const label = document.createElement('span');
    label.textContent = labelText;
    row.appendChild(label);
    return row;
}

function buildOptionsTitle(text) {
    const title = document.createElement('div');
    title.className = 'options-section-title';
    title.textContent = text;
    return title;
}

function buildOptionsPanel() {
    if (!optionsBody) return;
    optionsBody.innerHTML = '';

    // Volumen
    optionsBody.appendChild(buildOptionsTitle('🔊 Volumen'));
    const volRow = buildOptionsRow('Volumen inicial');
    const volSlider = document.createElement('input');
    volSlider.type = 'range';
    volSlider.min = '0';
    volSlider.max = '100';
    const volValue = document.createElement('span');
    volValue.className = 'options-value';
    volSlider.addEventListener('input', () => {
        chatOptions.volume = parseInt(volSlider.value, 10);
        volValue.textContent = `${chatOptions.volume}`;
        saveChatOptions();
        // También cambia el volumen del reproductor al instante
        if (typeof applyPlayerVolume === 'function') applyPlayerVolume(chatOptions.volume);
    });
    volRow.appendChild(volSlider);
    volRow.appendChild(volValue);
    optionsBody.appendChild(volRow);
    optionsUi.volSlider = volSlider;
    optionsUi.volValue = volValue;

    const rememberRow = buildOptionsRow('Recordar el último volumen usado');
    const rememberCb = document.createElement('input');
    rememberCb.type = 'checkbox';
    rememberCb.addEventListener('change', () => {
        chatOptions.rememberVolume = rememberCb.checked;
        saveChatOptions();
        // Al activarla, se guarda el volumen actual como "último usado"
        if (rememberCb.checked && typeof persistCurrentPlayerVolume === 'function') persistCurrentPlayerVolume();
    });
    rememberRow.appendChild(rememberCb);
    optionsBody.appendChild(rememberRow);
    optionsUi.rememberCb = rememberCb;

    // Colores
    optionsBody.appendChild(buildOptionsTitle('🎨 Colores'));
    optionsUi.colorInputs = {};
    COLOR_OPTIONS.forEach(c => {
        const row = buildOptionsRow(c.label);
        const input = document.createElement('input');
        input.type = 'color';
        input.addEventListener('input', () => {
            chatOptions.colors[c.key] = input.value;
            saveChatOptions();
            applyChatOptions();
        });
        row.appendChild(input);
        optionsBody.appendChild(row);
        optionsUi.colorInputs[c.key] = input;
    });
    const resetColorsBtn = document.createElement('button');
    resetColorsBtn.type = 'button';
    resetColorsBtn.className = 'options-btn';
    resetColorsBtn.textContent = '↺ Restablecer colores';
    resetColorsBtn.addEventListener('click', () => {
        COLOR_OPTIONS.forEach(c => { chatOptions.colors[c.key] = null; });
        saveChatOptions();
        applyChatOptions();
        refreshOptionsUi();
    });
    optionsBody.appendChild(resetColorsBtn);

    // Texto
    optionsBody.appendChild(buildOptionsTitle('🔤 Texto'));
    const fontRow = buildOptionsRow('Tamaño del texto de los mensajes');
    const fontSlider = document.createElement('input');
    fontSlider.type = 'range';
    fontSlider.min = '12';
    fontSlider.max = '24';
    fontSlider.step = '1';
    const fontValue = document.createElement('span');
    fontValue.className = 'options-value';
    fontSlider.addEventListener('input', () => {
        chatOptions.fontSize = parseInt(fontSlider.value, 10);
        fontValue.textContent = `${chatOptions.fontSize}px`;
        saveChatOptions();
        applyChatOptions();
    });
    fontRow.appendChild(fontSlider);
    fontRow.appendChild(fontValue);
    optionsBody.appendChild(fontRow);
    optionsUi.fontSlider = fontSlider;
    optionsUi.fontValue = fontValue;

    // Álbumes ocultos
    optionsBody.appendChild(buildOptionsTitle('🙈 Álbumes ocultos'));
    const hiddenInfo = document.createElement('div');
    hiddenInfo.className = 'options-hint';
    optionsBody.appendChild(hiddenInfo);
    const showAllBtn = document.createElement('button');
    showAllBtn.type = 'button';
    showAllBtn.className = 'options-btn';
    showAllBtn.textContent = '👁 Mostrar todos';
    showAllBtn.addEventListener('click', () => {
        if (typeof showAllHiddenAlbums === 'function') showAllHiddenAlbums();
        refreshOptionsUi();
    });
    optionsBody.appendChild(showAllBtn);
    optionsUi.hiddenInfo = hiddenInfo;
    optionsUi.showAllBtn = showAllBtn;

    // Restablecer todo
    optionsBody.appendChild(buildOptionsTitle('♻️ Restablecer'));
    const resetAllBtn = document.createElement('button');
    resetAllBtn.type = 'button';
    resetAllBtn.className = 'options-btn danger';
    resetAllBtn.textContent = 'Restablecer todas las opciones';
    resetAllBtn.addEventListener('click', resetAllOptions);
    optionsBody.appendChild(resetAllBtn);
    const resetHint = document.createElement('div');
    resetHint.className = 'options-hint';
    resetHint.textContent = 'Los cambios solo se guardan en este navegador.';
    optionsBody.appendChild(resetHint);
}

// Sincroniza los controles con el estado actual (se llama al abrir el panel)
function refreshOptionsUi() {
    if (!optionsUi.volSlider) return;
    optionsUi.volSlider.value = chatOptions.volume;
    optionsUi.volValue.textContent = `${chatOptions.volume}`;
    optionsUi.rememberCb.checked = chatOptions.rememberVolume;
    optionsUi.fontSlider.value = chatOptions.fontSize;
    optionsUi.fontValue.textContent = `${chatOptions.fontSize}px`;

    // Sin color personalizado, el selector muestra el color real del tema actual
    const probe = getComputedStyle(document.documentElement);
    COLOR_OPTIONS.forEach(c => {
        const custom = chatOptions.colors[c.key];
        let hex = custom;
        if (!hex) {
            const raw = probe.getPropertyValue(c.cssVar).trim();
            hex = /^#[0-9a-f]{6}$/i.test(raw) ? raw
                : /^#[0-9a-f]{3}$/i.test(raw) ? '#' + raw.slice(1).split('').map(ch => ch + ch).join('')
                : rgbStringToHex(raw);
        }
        optionsUi.colorInputs[c.key].value = hex;
    });

    const hiddenCount = typeof getHiddenAlbums === 'function' ? getHiddenAlbums().length : 0;
    optionsUi.hiddenInfo.textContent = hiddenCount > 0
        ? `${hiddenCount} álbum(es) oculto(s) para este usuario en este navegador.`
        : 'No hay álbumes ocultos.';
    optionsUi.showAllBtn.disabled = hiddenCount === 0;
}

function resetAllOptions() {
    if (!confirm('¿Restablecer todas las opciones a su valor original?')) return;
    chatOptions = getDefaultChatOptions();
    try { localStorage.removeItem(OPTIONS_STORAGE_KEY); } catch (err) { /* sin localStorage */ }
    try { localStorage.removeItem(LAST_VOLUME_STORAGE_KEY); } catch (err) { /* sin localStorage */ }
    applyChatOptions();
    if (typeof applyPlayerVolume === 'function') applyPlayerVolume(chatOptions.volume);
    refreshOptionsUi();
}

function openOptionsPanel() {
    if (!optionsPanel) return;
    if (typeof closeOtherPanels === 'function') closeOtherPanels('options');
    if (!optionsUi.volSlider) buildOptionsPanel();
    refreshOptionsUi();
    optionsPanel.classList.add('open');
    if (typeof hideDimControls === 'function') hideDimControls('hidden-by-options');
}

function closeOptionsPanel() {
    if (!optionsPanel || !optionsPanel.classList.contains('open')) return;
    optionsPanel.classList.remove('open');
    if (typeof showDimControls === 'function') showDimControls('hidden-by-options');
}

if (optionsToggle) {
    optionsToggle.addEventListener('click', () => {
        if (optionsPanel && optionsPanel.classList.contains('open')) closeOptionsPanel();
        else openOptionsPanel();
    });
}
if (optionsCloseBtn) optionsCloseBtn.addEventListener('click', closeOptionsPanel);

// Aplica colores y tamaño de texto guardados al cargar la página
// (los selectores sin color propio se resincronizan con el tema al abrir el panel).
applyChatOptions();
