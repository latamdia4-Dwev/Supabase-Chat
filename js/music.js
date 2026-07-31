// js/music.js
// Modos de música:
// 1) Radio en vivo, vía Radio Browser (gratis, sin API key). Docs: https://api.radio-browser.info
// 2) Música compartida: canciones que cualquier usuario marcó como públicas
//    (🌐) en "Mi música", visibles para todo el chat.
// 3) Mi música: tus propias canciones subidas (privadas por defecto).

const RADIO_API = 'https://de1.api.radio-browser.info/json/stations/search';

let isPlaying = false;
let isMuted = false;
let lastVolume = 0.8;
let currentMusicMode = 'radio'; // 'radio' | 'shared' | 'uploads'

// Lista de resultados actualmente cargados (radios o canciones) y el índice
// que se está reproduciendo, para poder saltar con ⏮ / ⏭.
let currentResultsList = [];
let currentResultIndex = -1;

// Identificador único de lo que se está reproduciendo AHORA MISMO (file_name
// de una canción, o url_resolved de una estación) — se usa para resaltar esa
// fila en la lista con una marca visual ("▶ Reproduciendo").
let currentPlayingKey = null;

// Selección múltiple para compartir/dejar de compartir varias canciones a la
// vez (solo aplica a tus propias canciones, sin importar en qué pestaña
// estés: "Mi música" o "Música compartida").
let selectedTrackIds = new Set();

// --- TÍTULO DEL REPRODUCTOR CON TEXTO CORRIDO (marquee) SI NO CABE ---
// Solo anima cuando el texto es más largo que el espacio disponible; los
// títulos cortos se quedan quietos.
function setCurrentTrackTitle(text) {
    if (!currentTrackTitle || !currentTrackTitleInner) return;
    currentTrackTitleInner.textContent = text || '';

    // Quita la animación antes de medir, para medir el ancho real del texto
    currentTrackTitle.classList.remove('marquee');
    // Fuerza reflow para poder reiniciar la animación limpia si vuelve a aplicar
    void currentTrackTitleInner.offsetWidth;

    const overflows = currentTrackTitleInner.scrollWidth > currentTrackTitle.clientWidth;
    if (overflows) {
        currentTrackTitle.classList.add('marquee');
    }
}

// Recorre las filas de la lista actualmente visible y marca cuál coincide
// con currentPlayingKey (data-track-key en canciones, data-station-key en
// estaciones de radio).
function updatePlayingHighlight() {
    document.querySelectorAll('.radio-item').forEach(item => {
        const key = item.dataset.trackKey || item.dataset.stationKey;
        item.classList.toggle('playing', !!key && key === currentPlayingKey);
    });
}

// --- ALEATORIO Y REPETIR ---
// repeatMode: 'off' (se detiene al llegar al final) -> 'all' (vuelve al
// inicio de la lista) -> 'one' (repite la misma pista) -> 'off' ...
let isShuffle = false;
let repeatMode = 'off';

function updateShuffleRepeatUI() {
    if (shuffleBtn) shuffleBtn.classList.toggle('active', isShuffle);
    if (repeatBtn) {
        repeatBtn.classList.toggle('active', repeatMode !== 'off');
        repeatBtn.textContent = repeatMode === 'one' ? '🔂' : '🔁';
        repeatBtn.title = repeatMode === 'off' ? 'Repetir (desactivado)'
            : repeatMode === 'all' ? 'Repetir toda la lista'
            : 'Repetir esta pista';
    }
}

if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
        isShuffle = !isShuffle;
        updateShuffleRepeatUI();
    });
}

if (repeatBtn) {
    repeatBtn.addEventListener('click', () => {
        repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
        updateShuffleRepeatUI();
    });
}

updateShuffleRepeatUI();

// Se dispara cuando termina la pista actual (canción, radio no aplica porque
// es un stream continuo sin "fin", pero no estorba dejarlo genérico).
function handleTrackEnded() {
    if (!audioPlayer || currentResultsList.length === 0 || currentResultIndex === -1) return;

    if (repeatMode === 'one') {
        audioPlayer.currentTime = 0;
        audioPlayer.play();
        return;
    }

    if (isShuffle) {
        if (currentResultsList.length === 1) {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
            return;
        }
        let randomIndex;
        do {
            randomIndex = Math.floor(Math.random() * currentResultsList.length);
        } while (randomIndex === currentResultIndex);
        playByIndex(randomIndex);
        return;
    }

    const isLastTrack = currentResultIndex >= currentResultsList.length - 1;
    if (isLastTrack && repeatMode === 'off') {
        isPlaying = false;
        if (playPauseBtn) playPauseBtn.textContent = '▶';
        return; // termina la lista, no sigue
    }

    playByIndex(currentResultIndex + 1); // playByIndex ya hace el salto circular
}

if (audioPlayer) {
    audioPlayer.addEventListener('ended', handleTrackEnded);
}

// --- BARRA DE PROGRESO (tiempo actual, duración, saltar al segundo exacto) ---
// isSeeking evita que timeupdate pelee con el arrastre manual del usuario
// mientras tiene el slider agarrado.
let isSeeking = false;

function formatTime(seconds) {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Radio en vivo tiene duration = Infinity (o NaN antes de cargar): ahí no
// existe un "segundo exacto" al que saltar, así que se oculta la barra.
function updateProgressVisibility() {
    if (!musicProgressBar || !audioPlayer) return;
    const hasFiniteDuration = isFinite(audioPlayer.duration) && audioPlayer.duration > 0;
    musicProgressBar.style.display = hasFiniteDuration ? 'flex' : 'none';
}

if (audioPlayer) {
    audioPlayer.addEventListener('loadedmetadata', () => {
        updateProgressVisibility();
        if (progressSlider) progressSlider.max = Math.floor(audioPlayer.duration) || 0;
        if (progressDuration) progressDuration.textContent = formatTime(audioPlayer.duration);
    });

    audioPlayer.addEventListener('timeupdate', () => {
        if (isSeeking) return;
        updateProgressVisibility();
        if (progressSlider) progressSlider.value = Math.floor(audioPlayer.currentTime) || 0;
        if (progressCurrentTime) progressCurrentTime.textContent = formatTime(audioPlayer.currentTime);
    });
}

if (progressSlider) {
    progressSlider.addEventListener('input', () => {
        isSeeking = true;
        if (progressCurrentTime) progressCurrentTime.textContent = formatTime(progressSlider.value);
    });

    progressSlider.addEventListener('change', () => {
        if (audioPlayer) audioPlayer.currentTime = Number(progressSlider.value);
        isSeeking = false;
    });
}

// --- MEDIA SESSION API ---
// Conecta los controles nativos del sistema/navegador (la ventanita de medios
// que muestra Windows/Chrome con play, pausa, siguiente y anterior) con
// nuestro propio reproductor. Sin esto, esos botones del sistema no hacen
// nada porque no saben qué función de nuestro código deben llamar.
if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => {
        if (audioPlayer && audioPlayer.src) {
            audioPlayer.play();
            isPlaying = true;
            if (playPauseBtn) playPauseBtn.textContent = '⏸';
        }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
        if (audioPlayer) {
            audioPlayer.pause();
            isPlaying = false;
            if (playPauseBtn) playPauseBtn.textContent = '▶';
        }
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (currentResultIndex !== -1) playByIndex(currentResultIndex - 1);
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (currentResultIndex !== -1) playByIndex(currentResultIndex + 1);
    });
}

function updateMediaSessionMetadata(title, subtitle, artworkUrl) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'Reproduciendo',
        artist: subtitle || '',
        album: 'Supabase Chat Pro',
        artwork: artworkUrl ? [{ src: artworkUrl, sizes: '96x96', type: 'image/png' }] : []
    });
}

// --- CAMBIO DE PESTAÑA (Radio / Canciones / Mi música) ---
// --- CAMBIO DE PESTAÑA (Radio / Canciones / Mi música) ---
function setMusicMode(mode) {
    currentMusicMode = mode;
    if (radioResults) radioResults.innerHTML = '';
    if (musicInput) musicInput.value = '';
    selectedTrackIds.clear();
    updateBulkActionBar();

    if (tabRadio) tabRadio.classList.toggle('active', mode === 'radio');
    if (tabShared) tabShared.classList.toggle('active', mode === 'shared');
    if (tabUploads) tabUploads.classList.toggle('active', mode === 'uploads');

    // El buscador solo tiene sentido para radio; Música compartida y Mi
    // música muestran su lista directamente (como ya hacía "uploads").
    if (musicSearchRow) musicSearchRow.style.display = mode === 'radio' ? 'flex' : 'none';
    if (musicUploadRow) musicUploadRow.style.display = mode === 'uploads' ? 'flex' : 'none';

    if (mode === 'radio') {
        if (musicInput) musicInput.placeholder = 'Buscar estación de radio (ej. rock, jazz, noticias)...';
        if (musicHint) musicHint.textContent = '';
    } else if (mode === 'shared') {
        if (musicHint) musicHint.textContent = 'Canciones que otros usuarios compartieron públicamente 🌐.';
        loadSharedTracks();
    } else {
        if (musicHint) musicHint.textContent = 'Tus canciones son privadas por defecto. Activa 🌐 para compartirlas con el chat.';
        loadUploadedTracks();
    }
}

if (tabRadio) tabRadio.addEventListener('click', () => setMusicMode('radio'));
if (tabShared) tabShared.addEventListener('click', () => setMusicMode('shared'));
if (tabUploads) tabUploads.addEventListener('click', () => setMusicMode('uploads'));

// --- MI MÚSICA ---
// Usa la tabla music_tracks para metadatos (visibilidad) y el bucket
// PRIVADO music-uploads. URLs firmadas (createSignedUrl, 1h) para acceso
// seguro: canciones privadas solo las reproduce su dueño; públicas las ven
// todos los usuarios autenticados (RLS en music_tracks lo controla).
const MUSIC_UPLOADS_BUCKET = 'music-uploads';
const SIGNED_URL_EXPIRY = 3600;

function sanitizeFileName(rawName) {
    const dotIndex = rawName.lastIndexOf('.');
    const ext = dotIndex > -1 ? rawName.slice(dotIndex) : '';
    const base = dotIndex > -1 ? rawName.slice(0, dotIndex) : rawName;
    const cleanBase = base
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
    return cleanBase + ext;
}

async function getSignedUrl(fileName) {
    const { data, error } = await supabaseClient.storage
        .from(MUSIC_UPLOADS_BUCKET)
        .createSignedUrl(fileName, SIGNED_URL_EXPIRY);
    if (error) throw error;
    return data.signedUrl;
}

async function loadUploadedTracks() {
    if (!radioResults || !currentUserId) return;
    radioResults.innerHTML = '<div class="radio-status">\u{1F50E} Cargando tu música...</div>';
    try {
        const { data, error } = await supabaseClient
            .from('music_tracks')
            .select('*')
            .eq('user_id', currentUserId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        updateAlbumSuggestions(data || []);
        if (!data || data.length === 0) {
            radioResults.innerHTML = '<div class="radio-status">Todavía no subiste ninguna canción. Usa el botón ⬆️ de arriba.</div>';
            currentResultsList = [];
            return;
        }
        renderTracksGrouped(data);
    } catch (err) {
        console.error('Error al cargar música:', err);
        radioResults.innerHTML = '<div class="radio-status">⚠️ Error al cargar. Revisa la tabla music_tracks y el bucket music-uploads.</div>';
    }
}

// Música compartida: todas las canciones que CUALQUIER usuario marcó como
// públicas (🌐), sin importar quién las subió. La RLS de music_tracks ya
// permite ver filas con is_public = true a cualquier usuario autenticado;
// aquí se filtra explícitamente para no traer de paso las privadas propias
// (que si viven mezcladas se ven en la pestaña "Mi música").
async function loadSharedTracks() {
    if (!radioResults) return;
    radioResults.innerHTML = '<div class="radio-status">\u{1F50E} Cargando música compartida...</div>';
    try {
        const { data, error } = await supabaseClient
            .from('music_tracks')
            .select('*')
            .eq('is_public', true)
            .order('created_at', { ascending: false });
        if (error) throw error;
        if (!data || data.length === 0) {
            radioResults.innerHTML = '<div class="radio-status">Todavía nadie compartió música públicamente. Sube una canción y márcala con 🌐 en "Mi música".</div>';
            currentResultsList = [];
            return;
        }
        renderTracksGrouped(data);
    } catch (err) {
        console.error('Error al cargar música compartida:', err);
        radioResults.innerHTML = '<div class="radio-status">⚠️ Error al cargar la música compartida.</div>';
    }
}

// Refresca el <datalist> de sugerencias de álbum con los nombres que ya usó
// este usuario, para poder reutilizar el mismo nombre al subir más canciones.
function updateAlbumSuggestions(tracks) {
    if (!albumSuggestions) return;
    const names = [...new Set(
        (tracks || []).map(t => (t.album || '').trim()).filter(Boolean)
    )];
    albumSuggestions.innerHTML = names.map(n => `<option value="${n.replace(/"/g, '&quot;')}"></option>`).join('');
}

const NO_ALBUM_KEY = '\u0000__sin_album__'; // clave interna, nunca choca con un nombre real de álbum

// Agrupa las canciones por álbum (las sin álbum quedan en un grupo aparte al
// final) y dibuja cada grupo con su propio encabezado: nombre, cantidad de
// canciones, y — solo si el grupo tiene canciones tuyas — un botón para
// compartir/ocultar el álbum COMPLETO de una sola vez.
function renderTracksGrouped(tracks) {
    radioResults.innerHTML = '';
    selectedTrackIds.clear();
    updateBulkActionBar();

    if (!tracks || tracks.length === 0) {
        radioResults.innerHTML = '<div class="radio-status">Sin canciones disponibles.</div>';
        currentResultsList = [];
        return;
    }
    currentResultsList = tracks;

    const groups = new Map(); // albumName (o NO_ALBUM_KEY) -> tracks[]
    tracks.forEach(t => {
        const key = (t.album && t.album.trim()) ? t.album.trim() : NO_ALBUM_KEY;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(t);
    });

    // Álbumes con nombre primero (alfabético), "Sin álbum" siempre al final
    const sortedKeys = [...groups.keys()].sort((a, b) => {
        if (a === NO_ALBUM_KEY) return 1;
        if (b === NO_ALBUM_KEY) return -1;
        return a.localeCompare(b);
    });

    sortedKeys.forEach(albumKey => {
        const groupTracks = groups.get(albumKey);
        const isNoAlbum = albumKey === NO_ALBUM_KEY;
        const ownTracksInGroup = groupTracks.filter(t => t.user_id === currentUserId);

        const header = document.createElement('div');
        header.className = 'album-header';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'album-header-title';
        titleSpan.textContent = `${isNoAlbum ? '📁 Sin álbum' : '💿 ' + albumKey} (${groupTracks.length})`;
        header.appendChild(titleSpan);

        // Solo se puede compartir/ocultar el álbum completo si tienes AL
        // MENOS una canción propia en ese grupo (no se puede tocar la
        // visibilidad de canciones de otros usuarios).
        if (ownTracksInGroup.length > 0) {
            const allPublic = ownTracksInGroup.every(t => t.is_public);
            const albumToggleBtn = document.createElement('button');
            albumToggleBtn.className = 'album-toggle-btn';
            albumToggleBtn.textContent = allPublic ? '🔒 Ocultar álbum' : '🌐 Compartir álbum';
            albumToggleBtn.title = allPublic
                ? 'Hacer privadas todas tus canciones de este álbum'
                : 'Hacer públicas todas tus canciones de este álbum';
            albumToggleBtn.onclick = (e) => {
                e.stopPropagation();
                toggleAlbumSharing(isNoAlbum ? null : albumKey, !allPublic, ownTracksInGroup);
            };
            header.appendChild(albumToggleBtn);
        }

        radioResults.appendChild(header);

        groupTracks.forEach((track) => {
            const globalIndex = currentResultsList.indexOf(track);
            radioResults.appendChild(renderTrackItem(track, globalIndex));
        });
    });

    updatePlayingHighlight();
}

// Activa el marquee en un elemento .radio-name si su texto desborda el contenedor.
// Se llama después de insertar el item en el DOM (necesita layout calculado).
function activateMarqueeIfOverflows(nameEl) {
    if (!nameEl) return;
    // Necesita estar en el DOM para medir; si no, no hace nada.
    requestAnimationFrame(() => {
        if (nameEl.scrollWidth > nameEl.clientWidth) {
            const overflow = nameEl.scrollWidth - nameEl.clientWidth;
            nameEl.style.setProperty('--marquee-offset', `-${overflow + 8}px`);
            nameEl.classList.add('marquee-active');
        }
    });
}

// Mueve una canción propia a un álbum diferente (o a "Sin álbum" si queda vacío).
async function editTrackAlbum(track) {
    const currentAlbum = track.album || '';
    // Build a list of existing album names for the prompt suggestion
    const existing = [...new Set(
        (currentResultsList || []).map(t => (t.album || '').trim()).filter(Boolean)
    )].filter(a => a !== currentAlbum);

    const hint = existing.length > 0
        ? `\nÁlbumes existentes: ${existing.join(', ')}`
        : '';
    const newAlbum = prompt(
        `Álbum para "${track.display_name}":\n(Deja vacío para quitar del álbum)${hint}`,
        currentAlbum
    );
    if (newAlbum === null || newAlbum.trim() === currentAlbum) return;

    const albumValue = newAlbum.trim() || null;
    try {
        const { error } = await supabaseClient
            .from('music_tracks')
            .update({ album: albumValue })
            .eq('id', track.id);
        if (error) throw error;
        track.album = albumValue;
        // Reload current tab to reflect grouping change
        if (currentMusicMode === 'shared') loadSharedTracks();
        else loadUploadedTracks();
    } catch (err) {
        alert('No se pudo mover la canción: ' + err.message);
    }
}

// Cambia is_public para TODAS tus canciones de un álbum de un solo golpe.
// albumName === null representa el grupo "Sin álbum" (columna album IS NULL).
async function toggleAlbumSharing(albumName, makePublic, ownTracksInGroup) {
    try {
        let query = supabaseClient
            .from('music_tracks')
            .update({ is_public: makePublic })
            .eq('user_id', currentUserId);
        query = albumName === null ? query.is('album', null) : query.eq('album', albumName);

        const { error } = await query;
        if (error) throw error;

        // Reflejar el cambio en memoria antes de recargar, por si acaso
        ownTracksInGroup.forEach(t => { t.is_public = makePublic; });

        // Recarga la pestaña actual para reflejar el cambio en pantalla
        if (currentMusicMode === 'shared') loadSharedTracks();
        else loadUploadedTracks();
    } catch (err) {
        console.error('Error al compartir/ocultar álbum:', err);
        alert('No se pudo actualizar el álbum: ' + err.message);
    }
}

// Dibuja una sola fila de canción (usado tanto en "Mi música" como en
// "Música compartida", con o sin álbum).
function renderTrackItem(track, index) {
    const isMine = track.user_id === currentUserId;
    const item = document.createElement('div');
    item.className = 'radio-item';
    item.style.position = 'relative';
    item.dataset.trackKey = track.file_name;

    // Checkbox de selección múltiple: solo en tus propias canciones
    if (isMine) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'track-select-checkbox';
        checkbox.checked = selectedTrackIds.has(track.id);
        checkbox.onclick = (e) => e.stopPropagation();
        checkbox.onchange = () => {
            if (checkbox.checked) selectedTrackIds.add(track.id);
            else selectedTrackIds.delete(track.id);
            updateBulkActionBar();
        };
        item.appendChild(checkbox);
    }

    const visIcon = document.createElement('span');
    visIcon.className = 'radio-icon uploaded-icon';
    visIcon.textContent = track.is_public ? '\u{1F310}' : '\u{1F512}';
    visIcon.title = track.is_public ? 'Pública (visible para todos)' : 'Privada (solo tú)';

    const info = document.createElement('div');
    info.className = 'radio-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'radio-name';
    nameEl.textContent = track.display_name;
    info.appendChild(nameEl);

    if (!isMine) {
        const owner = document.createElement('span');
        owner.className = 'radio-meta';
        owner.textContent = '\u{1F310} compartida';
        info.appendChild(owner);
    }

    const right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';

    if (isMine) {
        const toggleBtn = document.createElement('button');
        toggleBtn.title = track.is_public ? 'Hacer privada' : 'Hacer pública';
        toggleBtn.textContent = track.is_public ? '\u{1F512}' : '\u{1F310}';
        toggleBtn.style.cssText = 'background:rgba(62,207,142,0.15);border:1px solid #3ecf8e;border-radius:12px;padding:2px 7px;font-size:0.8em;cursor:pointer;color:#3ecf8e;';
        toggleBtn.onclick = async (e) => {
            e.stopPropagation();
            const newPublic = !track.is_public;
            try {
                const { error } = await supabaseClient
                    .from('music_tracks').update({ is_public: newPublic }).eq('id', track.id);
                if (error) throw error;
                track.is_public = newPublic;
                toggleBtn.textContent = newPublic ? '\u{1F512}' : '\u{1F310}';
                toggleBtn.title = newPublic ? 'Hacer privada' : 'Hacer pública';
                visIcon.textContent = newPublic ? '\u{1F310}' : '\u{1F512}';
                visIcon.title = newPublic ? 'Pública (visible para todos)' : 'Privada (solo tú)';
            } catch (err) {
                alert('No se pudo cambiar la visibilidad: ' + err.message);
            }
        };
        right.appendChild(toggleBtn);

        // Button to move track to a different album
        const albumBtn = document.createElement('button');
        albumBtn.title = 'Mover a otro álbum';
        albumBtn.textContent = '💿';
        albumBtn.style.cssText = 'background:rgba(255,255,255,0.07);border:1px solid #555;border-radius:12px;padding:2px 7px;font-size:0.8em;cursor:pointer;color:#ccc;';
        albumBtn.onclick = (e) => { e.stopPropagation(); editTrackAlbum(track); };
        right.appendChild(albumBtn);

        const delBtn = document.createElement('button');
        delBtn.title = 'Eliminar canción';
        delBtn.textContent = '\u{1F5D1}\uFE0F';
        delBtn.style.cssText = 'background:rgba(255,77,77,0.1);border:1px solid #ff4d4d;border-radius:12px;padding:2px 7px;font-size:0.8em;cursor:pointer;color:#ff4d4d;';
        delBtn.onclick = async (e) => {
            e.stopPropagation();
            if (!confirm('¿Eliminar "' + track.display_name + '"?')) return;
            try {
                await supabaseClient.storage.from(MUSIC_UPLOADS_BUCKET).remove([track.file_name]);
                const { error } = await supabaseClient.from('music_tracks').delete().eq('id', track.id);
                if (error) throw error;
                selectedTrackIds.delete(track.id);
                item.remove();
                const idx = currentResultsList.findIndex(t => t.id === track.id);
                if (idx !== -1) currentResultsList.splice(idx, 1);
                updateBulkActionBar();
            } catch (err) {
                alert('No se pudo eliminar: ' + err.message);
            }
        };
        right.appendChild(delBtn);
    }

    const playIcon = document.createElement('span');
    playIcon.className = 'radio-play-icon';
    playIcon.textContent = '\u25B6';
    right.appendChild(playIcon);

    item.appendChild(visIcon);
    item.appendChild(info);
    item.appendChild(right);
    item.onclick = () => playUploadedTrack(track, index);

    // Activate marquee after the item is inserted into the DOM
    requestAnimationFrame(() => activateMarqueeIfOverflows(nameEl));

    return item;
}

// --- BARRA DE ACCIÓN MASIVA (compartir/ocultar varias canciones a la vez) ---
// Se construye una sola vez y se muestra/oculta según haya algo seleccionado.
function ensureBulkActionBar() {
    let bar = document.getElementById('bulkShareBar');
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = 'bulkShareBar';
    bar.className = 'bulk-share-bar';
    bar.innerHTML = `
        <span id="bulkShareCount" class="bulk-share-count"></span>
        <button id="bulkSharePublicBtn" type="button">🌐 Compartir</button>
        <button id="bulkSharePrivateBtn" type="button">🔒 Ocultar</button>
        <button id="bulkShareCancelBtn" type="button">Cancelar</button>
    `;
    if (musicPanel) musicPanel.appendChild(bar);

    document.getElementById('bulkSharePublicBtn').addEventListener('click', () => bulkSetPublic(true));
    document.getElementById('bulkSharePrivateBtn').addEventListener('click', () => bulkSetPublic(false));
    document.getElementById('bulkShareCancelBtn').addEventListener('click', () => {
        selectedTrackIds.clear();
        document.querySelectorAll('.track-select-checkbox').forEach(cb => { cb.checked = false; });
        updateBulkActionBar();
    });

    return bar;
}

function updateBulkActionBar() {
    const bar = ensureBulkActionBar();
    const count = selectedTrackIds.size;
    bar.style.display = count > 0 ? 'flex' : 'none';
    const countEl = document.getElementById('bulkShareCount');
    if (countEl) countEl.textContent = `${count} seleccionada${count === 1 ? '' : 's'}`;
}

async function bulkSetPublic(makePublic) {
    if (selectedTrackIds.size === 0) return;
    try {
        const { error } = await supabaseClient
            .from('music_tracks')
            .update({ is_public: makePublic })
            .in('id', [...selectedTrackIds]);
        if (error) throw error;

        selectedTrackIds.clear();
        if (currentMusicMode === 'shared') loadSharedTracks();
        else loadUploadedTracks();
    } catch (err) {
        console.error('Error al actualizar en lote:', err);
        alert('No se pudo actualizar: ' + err.message);
    }
}

async function playUploadedTrack(track, index = -1) {
    if (!audioPlayer) return;
    if (index >= 0) currentResultIndex = index;
    try {
        const signedUrl = await getSignedUrl(track.file_name);
        audioPlayer.src = signedUrl;
        audioPlayer.play()
            .then(() => { isPlaying = true; if (playPauseBtn) playPauseBtn.textContent = '⏸'; })
            .catch(err => {
                console.error('Error al reproducir:', err);
                setCurrentTrackTitle('No se pudo reproducir este archivo');
            });
        currentPlayingKey = track.file_name;
        updatePlayingHighlight();
        setCurrentTrackTitle(track.display_name || 'Reproduciendo...');
        updateMediaSessionMetadata(track.display_name, track.is_public ? '\u{1F310} Pública' : '\u{1F512} Privada', null);
        if (musicPlayerBar) musicPlayerBar.style.display = 'flex';
    } catch (err) {
        console.error('Error al obtener URL firmada:', err);

        // El archivo ya no existe en el bucket (huérfano por el bug de nombres
        // duplicados, o borrado manualmente desde Storage), aunque la fila en
        // music_tracks siga ahí. En vez de dejar el error genérico repitiéndose
        // cada vez que se toca esa canción, se ofrece limpiar la fila rota.
        const notFound = err && err.message && /not.?found/i.test(err.message);
        if (notFound && track.id) {
            const wantsDelete = confirm(
                `"${track.display_name}" ya no existe en el almacenamiento (posiblemente por un choque de nombres al subir varias a la vez). ¿Quitarla de tu lista?`
            );
            if (wantsDelete) {
                try {
                    await supabaseClient.from('music_tracks').delete().eq('id', track.id);
                    loadUploadedTracks();
                } catch (delErr) {
                    console.error('Error al limpiar la fila huérfana:', delErr);
                }
                return;
            }
        }

        alert('No se pudo acceder al archivo: ' + err.message);
    }
}

// Upload: guarda el archivo en el bucket privado + fila en music_tracks
if (uploadMusicInput) {
    uploadMusicInput.addEventListener('change', async () => {
        const files = Array.from(uploadMusicInput.files || []);
        if (files.length === 0) return;
        if (!currentUserId) { alert('Debes iniciar sesión para subir música.'); return; }
        radioResults.innerHTML = '<div class="radio-status">⬆️ Subiendo...</div>';

        const failed = [];
        const skippedDuplicates = [];
        const albumValue = albumInput && albumInput.value.trim() ? albumInput.value.trim() : null;

        // Trae de una vez los nombres que este usuario ya tiene subidos, para
        // no repetir la misma consulta en cada archivo del lote.
        let existingNames = new Set();
        try {
            const { data: existing, error: existingErr } = await supabaseClient
                .from('music_tracks')
                .select('display_name')
                .eq('user_id', currentUserId);
            if (existingErr) throw existingErr;
            existingNames = new Set(
                (existing || []).map(t => t.display_name.trim().toLowerCase())
            );
        } catch (err) {
            console.error('No se pudo verificar canciones existentes:', err);
            // Si esto falla, se sigue igual sin bloquear la subida por completo.
        }

        for (const file of files) {
            try {
                const displayName = file.name.replace(/\.[^/.]+$/, '');
                const normalizedName = displayName.trim().toLowerCase();

                // Evita subir la misma canción dos veces (comparando por
                // nombre, insensible a mayúsculas/espacios). Si ya la tienes,
                // se salta en vez de duplicarla en la lista.
                if (existingNames.has(normalizedName)) {
                    skippedDuplicates.push(file.name);
                    continue;
                }

                // Sufijo aleatorio además del timestamp: subir varios archivos
                // muy rápido puede repetir Date.now() en el mismo milisegundo,
                // lo que chocaba nombres de archivo en el bucket y dejaba filas
                // en music_tracks apuntando a un archivo ya sobrescrito/borrado
                // ("Object not found" al intentar reproducir).
                const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const fileName = `${currentUserId}/${uniqueSuffix}_${sanitizeFileName(file.name)}`;

                const { error: upErr } = await supabaseClient.storage
                    .from(MUSIC_UPLOADS_BUCKET)
                    .upload(fileName, file, { upsert: false });
                if (upErr) throw upErr;

                const { error: dbErr } = await supabaseClient
                    .from('music_tracks')
                    .insert([{ user_id: currentUserId, file_name: fileName, display_name: displayName, is_public: false, album: albumValue }]);
                if (dbErr) throw dbErr;

                // Registra el nombre para detectar duplicados dentro del
                // mismo lote (ej. seleccionaste el mismo archivo dos veces).
                existingNames.add(normalizedName);
            } catch (err) {
                console.error(`Error al subir "${file.name}":`, err);
                failed.push(file.name);
                // No se corta el lote: sigue con el resto de los archivos.
            }
        }

        const messages = [];
        if (skippedDuplicates.length > 0) {
            messages.push(`Ya tenías ${skippedDuplicates.length} de estas canciones, no se volvieron a subir:\n${skippedDuplicates.join('\n')}`);
        }
        if (failed.length > 0) {
            messages.push(`No se pudieron subir ${failed.length} archivo(s):\n${failed.join('\n')}`);
        }
        if (messages.length > 0) alert(messages.join('\n\n'));

        await loadUploadedTracks();
        uploadMusicInput.value = '';
    });
}


function runSearch(query) {
    if (currentMusicMode === 'radio') {
        searchRadioStations(query);
    }
}

// --- BÚSQUEDA DE RADIOS ---
async function searchRadioStations(query) {
    if (!radioResults) return;
    radioResults.innerHTML = '<div class="radio-status">🔎 Buscando estaciones...</div>';

    try {
        // Busca por nombre Y por género/tag a la vez (ej. "rock" encuentra
        // tanto estaciones llamadas "Rock FM" como estaciones etiquetadas
        // como género rock), y sube el límite por consulta de 15 a 30 para
        // traer más resultados en total.
        const [byNameRes, byTagRes] = await Promise.all([
            fetch(`${RADIO_API}?name=${encodeURIComponent(query)}&limit=30&hidebroken=true&order=clickcount&reverse=true`),
            fetch(`${RADIO_API}?tag=${encodeURIComponent(query)}&limit=30&hidebroken=true&order=clickcount&reverse=true`)
        ]);

        const byName = byNameRes.ok ? await byNameRes.json() : [];
        const byTag = byTagRes.ok ? await byTagRes.json() : [];

        // Combina ambas búsquedas sin repetir la misma estación dos veces.
        const seen = new Set();
        const merged = [...byName, ...byTag].filter(station => {
            const key = station.stationuuid || station.url_resolved;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        renderRadioResults(merged);
    } catch (err) {
        console.error('Error buscando estaciones de radio:', err);
        radioResults.innerHTML = '<div class="radio-status">⚠️ Error al buscar. Intenta de nuevo.</div>';
    }
}

function renderRadioResults(stations) {
    radioResults.innerHTML = '';

    const validStations = (stations || []).filter(s => s.url_resolved);

    if (validStations.length === 0) {
        radioResults.innerHTML = '<div class="radio-status">Sin resultados para esa búsqueda.</div>';
        return;
    }

    currentResultsList = validStations;

    validStations.forEach((station, index) => {
        const item = document.createElement('div');
        item.className = 'radio-item';
        item.dataset.stationKey = station.url_resolved;

        const icon = document.createElement('img');
        icon.className = 'radio-icon';
        icon.src = station.favicon || '';
        icon.alt = '';
        icon.onerror = () => { icon.style.visibility = 'hidden'; };

        const info = document.createElement('div');
        info.className = 'radio-info';

        const name = document.createElement('span');
        name.className = 'radio-name';
        name.textContent = station.name || 'Estación sin nombre';

        const meta = document.createElement('span');
        meta.className = 'radio-meta';
        meta.textContent = [station.country, station.bitrate ? `${station.bitrate}kbps` : null]
            .filter(Boolean)
            .join(' · ');

        info.appendChild(name);
        info.appendChild(meta);

        const playIcon = document.createElement('span');
        playIcon.className = 'radio-play-icon';
        playIcon.textContent = '▶';

        item.appendChild(icon);
        item.appendChild(info);
        item.appendChild(playIcon);

        item.onclick = () => playRadioStation(station, index);
        radioResults.appendChild(item);
        requestAnimationFrame(() => activateMarqueeIfOverflows(name));
    });

    updatePlayingHighlight();
}

function playRadioStation(station, index = -1) {
    if (!audioPlayer) return;
    if (index >= 0) currentResultIndex = index;
    audioPlayer.src = station.url_resolved;
    audioPlayer.play()
        .then(() => {
            isPlaying = true;
            if (playPauseBtn) playPauseBtn.textContent = '⏸';
        })
        .catch(err => {
            console.error('Error al reproducir la estación:', err);
            setCurrentTrackTitle('No se pudo reproducir esta estación');
        });

    currentPlayingKey = station.url_resolved;
    updatePlayingHighlight();
    setCurrentTrackTitle(station.name || 'Reproduciendo...');
    updateMediaSessionMetadata(station.name, station.country, station.favicon);

    // Mostrar la barra de reproducción persistente (el panel se queda abierto)
    if (musicPlayerBar) musicPlayerBar.style.display = 'flex';
}

// Botón de búsqueda
if (searchMusicBtn) {
    searchMusicBtn.addEventListener('click', () => {
        const query = musicInput.value.trim();
        if (query) runSearch(query);
    });
}

// Enter en el campo de búsqueda
if (musicInput) {
    musicInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = musicInput.value.trim();
            if (query) runSearch(query);
        }
    });
}

// Play / Pausa manual
if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
        if (!audioPlayer || !audioPlayer.src) return;
        if (isPlaying) {
            audioPlayer.pause();
            isPlaying = false;
            playPauseBtn.textContent = '▶';
        } else {
            audioPlayer.play();
            isPlaying = true;
            playPauseBtn.textContent = '⏸';
        }
    });
}

// --- SIGUIENTE / ANTERIOR dentro de la última lista de resultados buscada ---
function playByIndex(index) {
    if (!currentResultsList || currentResultsList.length === 0) return;

    // Salto circular: del último vuelve al primero, y viceversa
    const total = currentResultsList.length;
    const safeIndex = ((index % total) + total) % total;
    const item = currentResultsList[safeIndex];

    if (currentMusicMode === 'radio') {
        playRadioStation(item, safeIndex);
    } else {
        // 'shared' y 'uploads' comparten la misma forma de track (music_tracks)
        playUploadedTrack(item, safeIndex);
    }
}

if (nextTrackBtn) {
    nextTrackBtn.addEventListener('click', () => {
        if (currentResultIndex === -1) return;
        playByIndex(currentResultIndex + 1);
    });
}

if (prevTrackBtn) {
    prevTrackBtn.addEventListener('click', () => {
        if (currentResultIndex === -1) return;
        playByIndex(currentResultIndex - 1);
    });
}

// Abrir / cerrar panel de radio
if (musicToggle && musicPanel) {
    musicToggle.addEventListener('click', () => {
        musicPanel.classList.toggle('open');
        if (musicPanel.classList.contains('open')) updateMusicPanelLayout();
    });
}

// Si hay suficiente espacio a la derecha del chat, el panel se convierte en
// una ventana propia fija ahí (mucho más grande, más fácil de administrar).
// Si no hay espacio (pantallas angostas/móvil), se queda como desplegable
// dentro del chat, como siempre.
const MUSIC_SIDE_PANEL_MIN_WINDOW_WIDTH = 1100;

function updateMusicPanelLayout() {
    if (!musicPanel || !chatContainer) return;

    const rect = chatContainer.getBoundingClientRect();
    const availableWidth = window.innerWidth - rect.right - 24;
    const enoughRoom = window.innerWidth >= MUSIC_SIDE_PANEL_MIN_WINDOW_WIDTH && availableWidth >= 280;

    musicPanel.classList.toggle('side-panel', enoughRoom);

    if (enoughRoom) {
        const panelWidth = Math.min(420, availableWidth);
        musicPanel.style.top = `${rect.top}px`;
        musicPanel.style.left = `${rect.right + 14}px`;
        musicPanel.style.height = `${rect.height}px`;
        musicPanel.style.width = `${panelWidth}px`;
    } else {
        musicPanel.style.top = '';
        musicPanel.style.left = '';
        musicPanel.style.height = '';
        musicPanel.style.width = '';
    }
}

// Recalcula si se redimensiona la ventana mientras el panel sigue abierto
// (ej. maximizar/restaurar la ventana del navegador)
window.addEventListener('resize', () => {
    if (musicPanel && musicPanel.classList.contains('open')) updateMusicPanelLayout();
});

// Cierra el panel si se hace clic en cualquier otro lugar de la página
// (fuera del panel y fuera del botón 🎵 que lo abre), igual que ya pasa
// con el selector de reacciones y debería pasar acá.
document.addEventListener('click', (e) => {
    if (!musicPanel || !musicPanel.classList.contains('open')) return;
    if (e.target.closest('#musicPanel') || e.target.closest('#musicToggle')) return;
    musicPanel.classList.remove('open');
});

// --- CONTROL DE VOLUMEN ---
function updateVolumeIcon(volume, muted) {
    if (!muteBtn) return;
    if (muted || volume === 0) {
        muteBtn.textContent = '🔇';
    } else if (volume < 0.5) {
        muteBtn.textContent = '🔉';
    } else {
        muteBtn.textContent = '🔊';
    }
}

// Volumen inicial (recuerda la última preferencia guardada)
if (audioPlayer) {
    const savedVolume = localStorage.getItem('radioVolume');
    lastVolume = savedVolume !== null ? parseFloat(savedVolume) : 0.8;
    audioPlayer.volume = lastVolume;
    if (volumeSlider) volumeSlider.value = Math.round(lastVolume * 100);
    updateVolumeIcon(lastVolume, false);
}

if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
        const value = parseInt(volumeSlider.value, 10) / 100;
        if (audioPlayer) audioPlayer.volume = value;
        isMuted = value === 0;
        if (value > 0) lastVolume = value;
        localStorage.setItem('radioVolume', value);
        updateVolumeIcon(value, isMuted);
    });
}

if (muteBtn) {
    muteBtn.addEventListener('click', () => {
        if (!audioPlayer) return;
        if (isMuted) {
            audioPlayer.volume = lastVolume;
            if (volumeSlider) volumeSlider.value = Math.round(lastVolume * 100);
            isMuted = false;
        } else {
            lastVolume = audioPlayer.volume > 0 ? audioPlayer.volume : lastVolume;
            audioPlayer.volume = 0;
            if (volumeSlider) volumeSlider.value = 0;
            isMuted = true;
        }
        updateVolumeIcon(audioPlayer.volume, isMuted);
    });
}
