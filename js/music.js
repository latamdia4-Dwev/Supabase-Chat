// js/music.js
// Dos modos de búsqueda:
// 1) Radio en vivo, vía Radio Browser (gratis, sin API key). Docs: https://api.radio-browser.info
// 2) Canciones (vista previa de 30s), vía iTunes Search API de Apple (gratis,
//    sin API key, sin registro). Solo da un fragmento de 30 segundos por
//    canción — es lo máximo que se puede reproducir de música con derechos de
//    autor sin una licencia real (Spotify, Apple Music, etc.).

const RADIO_API = 'https://de1.api.radio-browser.info/json/stations/search';
const ITUNES_API = 'https://itunes.apple.com/search';

let isPlaying = false;
let isMuted = false;
let lastVolume = 0.8;
let currentMusicMode = 'radio'; // 'radio' o 'songs'

// Lista de resultados actualmente cargados (radios o canciones) y el índice
// que se está reproduciendo, para poder saltar con ⏮ / ⏭.
let currentResultsList = [];
let currentResultIndex = -1;

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
function setMusicMode(mode) {
    currentMusicMode = mode;
    if (radioResults) radioResults.innerHTML = '';
    if (musicInput) musicInput.value = '';

    if (tabRadio) tabRadio.classList.toggle('active', mode === 'radio');
    if (tabSongs) tabSongs.classList.toggle('active', mode === 'songs');
    if (tabUploads) tabUploads.classList.toggle('active', mode === 'uploads');

    // El buscador (radio/canciones) y el botón de subir (mi música) son
    // mutuamente excluyentes: cada pestaña usa uno de los dos.
    if (musicSearchRow) musicSearchRow.style.display = mode === 'uploads' ? 'none' : 'flex';
    if (musicUploadRow) musicUploadRow.style.display = mode === 'uploads' ? 'flex' : 'none';

    if (mode === 'radio') {
        if (musicInput) musicInput.placeholder = 'Buscar estación de radio (ej. rock, jazz, noticias)...';
        if (musicHint) musicHint.textContent = '';
    } else if (mode === 'songs') {
        if (musicInput) musicInput.placeholder = 'Buscar canción o artista...';
        if (musicHint) musicHint.textContent = 'Solo vista previa de 30 segundos por canción (límite de derechos de autor).';
    } else {
        if (musicHint) musicHint.textContent = 'Sube tus propios archivos de audio y reprodúcelos aquí. Visibles para todos en el chat.';
        loadUploadedTracks();
    }
}

if (tabRadio) tabRadio.addEventListener('click', () => setMusicMode('radio'));
if (tabSongs) tabSongs.addEventListener('click', () => setMusicMode('songs'));
if (tabUploads) tabUploads.addEventListener('click', () => setMusicMode('uploads'));

// --- MI MÚSICA: ARCHIVOS DE AUDIO SUBIDOS POR TI (Supabase Storage) ---
// Requiere un bucket público llamado "music-uploads" en Supabase Storage
// (Storage → New bucket → nombre "music-uploads", marcar "Public bucket").
// No usa ninguna tabla nueva: la lista de canciones sale directo del propio
// bucket con supabaseClient.storage.from(...).list(), igual que ya se hace
// con "chat-images" para fotos y videos del chat.
const MUSIC_UPLOADS_BUCKET = 'music-uploads';

// Quita el prefijo "<timestamp>_" que se le agrega al nombre real del
// archivo al subirlo, para mostrar algo legible en la lista.
function cleanUploadedFileName(rawName) {
    return rawName.replace(/^\d+_/, '');
}

async function loadUploadedTracks() {
    if (!radioResults) return;
    radioResults.innerHTML = '<div class="radio-status">🔎 Cargando tu música...</div>';

    try {
        const { data, error } = await supabaseClient
            .storage
            .from(MUSIC_UPLOADS_BUCKET)
            .list('', { sortBy: { column: 'created_at', order: 'desc' } });
        if (error) throw error;

        // Storage a veces incluye una entrada de "carpeta vacía" (.emptyFolderPlaceholder)
        const audioFiles = (data || []).filter(f => f.name && !f.name.startsWith('.'));
        renderUploadedTracks(audioFiles);
    } catch (err) {
        console.error('Error al listar música subida:', err);
        radioResults.innerHTML = '<div class="radio-status">⚠️ No se pudo cargar tu música. Revisa que exista el bucket público "music-uploads" en Supabase Storage.</div>';
    }
}

function renderUploadedTracks(files) {
    radioResults.innerHTML = '';

    if (files.length === 0) {
        radioResults.innerHTML = '<div class="radio-status">Todavía no subiste ninguna canción. Usa el botón ⬆️ de arriba.</div>';
        currentResultsList = [];
        return;
    }

    const tracks = files.map(file => {
        const { data: urlData } = supabaseClient.storage
            .from(MUSIC_UPLOADS_BUCKET)
            .getPublicUrl(file.name);
        return {
            name: file.name,
            displayName: cleanUploadedFileName(file.name),
            url: urlData.publicUrl
        };
    });

    currentResultsList = tracks;

    tracks.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'radio-item';

        const icon = document.createElement('span');
        icon.className = 'radio-icon uploaded-icon';
        icon.textContent = '🎵';

        const info = document.createElement('div');
        info.className = 'radio-info';

        const name = document.createElement('span');
        name.className = 'radio-name';
        name.textContent = track.displayName;
        info.appendChild(name);

        const playIcon = document.createElement('span');
        playIcon.className = 'radio-play-icon';
        playIcon.textContent = '▶';

        item.appendChild(icon);
        item.appendChild(info);
        item.appendChild(playIcon);

        item.onclick = () => playUploadedTrack(track, index);
        radioResults.appendChild(item);
    });
}

function playUploadedTrack(track, index = -1) {
    if (!audioPlayer) return;
    if (index >= 0) currentResultIndex = index;
    audioPlayer.src = track.url;
    audioPlayer.play()
        .then(() => {
            isPlaying = true;
            if (playPauseBtn) playPauseBtn.textContent = '⏸';
        })
        .catch(err => {
            console.error('Error al reproducir el archivo subido:', err);
            if (currentTrackTitle) currentTrackTitle.textContent = 'No se pudo reproducir este archivo';
        });

    if (currentTrackTitle) currentTrackTitle.textContent = track.displayName || 'Reproduciendo...';
    updateMediaSessionMetadata(track.displayName, 'Subido al chat', null);

    if (musicPlayerBar) musicPlayerBar.style.display = 'flex';
    if (musicPanel) musicPanel.classList.remove('open');
}

// Selección de archivo(s) para subir
if (uploadMusicInput) {
    uploadMusicInput.addEventListener('change', async () => {
        const files = Array.from(uploadMusicInput.files || []);
        if (files.length === 0) return;

        radioResults.innerHTML = '<div class="radio-status">⬆️ Subiendo...</div>';

        try {
            for (const file of files) {
                const fileName = `${Date.now()}_${file.name}`;
                const { error } = await supabaseClient.storage
                    .from(MUSIC_UPLOADS_BUCKET)
                    .upload(fileName, file);
                if (error) throw error;
            }
            await loadUploadedTracks();
        } catch (err) {
            console.error('Error al subir música:', err);
            alert(`No se pudo subir el archivo: ${err.message}`);
            loadUploadedTracks();
        } finally {
            uploadMusicInput.value = '';
        }
    });
}

function runSearch(query) {
    if (currentMusicMode === 'radio') {
        searchRadioStations(query);
    } else {
        searchItunesSongs(query);
    }
}

// --- BÚSQUEDA DE RADIOS ---
async function searchRadioStations(query) {
    if (!radioResults) return;
    radioResults.innerHTML = '<div class="radio-status">🔎 Buscando estaciones...</div>';

    try {
        const url = `${RADIO_API}?name=${encodeURIComponent(query)}&limit=15&hidebroken=true&order=clickcount&reverse=true`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const stations = await res.json();
        renderRadioResults(stations);
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
    });
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
            if (currentTrackTitle) currentTrackTitle.textContent = 'No se pudo reproducir esta estación';
        });

    if (currentTrackTitle) currentTrackTitle.textContent = station.name || 'Reproduciendo...';
    updateMediaSessionMetadata(station.name, station.country, station.favicon);

    // Mostrar la barra de reproducción persistente y cerrar el buscador
    if (musicPlayerBar) musicPlayerBar.style.display = 'flex';
    if (musicPanel) musicPanel.classList.remove('open');
}

// --- BÚSQUEDA DE CANCIONES (vista previa 30s, iTunes Search API) ---
async function searchItunesSongs(query) {
    if (!radioResults) return;
    radioResults.innerHTML = '<div class="radio-status">🔎 Buscando canciones...</div>';

    try {
        const url = `${ITUNES_API}?term=${encodeURIComponent(query)}&media=music&entity=song&limit=15`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        renderSongResults(data.results);
    } catch (err) {
        console.error('Error buscando canciones:', err);
        radioResults.innerHTML = '<div class="radio-status">⚠️ Error al buscar. Intenta de nuevo.</div>';
    }
}

function renderSongResults(songs) {
    radioResults.innerHTML = '';

    const validSongs = (songs || []).filter(s => s.previewUrl);

    if (validSongs.length === 0) {
        radioResults.innerHTML = '<div class="radio-status">Sin resultados para esa búsqueda.</div>';
        return;
    }

    currentResultsList = validSongs;

    validSongs.forEach((song, index) => {
        const item = document.createElement('div');
        item.className = 'radio-item';

        const icon = document.createElement('img');
        icon.className = 'radio-icon';
        icon.src = song.artworkUrl60 || song.artworkUrl100 || '';
        icon.alt = '';
        icon.onerror = () => { icon.style.visibility = 'hidden'; };

        const info = document.createElement('div');
        info.className = 'radio-info';

        const name = document.createElement('span');
        name.className = 'radio-name';
        name.textContent = song.trackName || 'Canción sin nombre';

        const meta = document.createElement('span');
        meta.className = 'radio-meta';
        meta.textContent = [song.artistName, song.collectionName].filter(Boolean).join(' · ');

        info.appendChild(name);
        info.appendChild(meta);

        const playIcon = document.createElement('span');
        playIcon.className = 'radio-play-icon';
        playIcon.textContent = '▶';

        item.appendChild(icon);
        item.appendChild(info);
        item.appendChild(playIcon);

        item.onclick = () => playSongPreview(song, index);
        radioResults.appendChild(item);
    });
}

function playSongPreview(song, index = -1) {
    if (!audioPlayer) return;
    if (index >= 0) currentResultIndex = index;
    audioPlayer.src = song.previewUrl;
    audioPlayer.play()
        .then(() => {
            isPlaying = true;
            if (playPauseBtn) playPauseBtn.textContent = '⏸';
        })
        .catch(err => {
            console.error('Error al reproducir la vista previa:', err);
            if (currentTrackTitle) currentTrackTitle.textContent = 'No se pudo reproducir esta canción';
        });

    const label = [song.trackName, song.artistName].filter(Boolean).join(' — ');
    if (currentTrackTitle) currentTrackTitle.textContent = `${label} (vista previa 30s)`;
    updateMediaSessionMetadata(song.trackName, song.artistName, song.artworkUrl100 || song.artworkUrl60);

    if (musicPlayerBar) musicPlayerBar.style.display = 'flex';
    if (musicPanel) musicPanel.classList.remove('open');
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
    } else if (currentMusicMode === 'songs') {
        playSongPreview(item, safeIndex);
    } else {
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
    });
}

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
