// js/music.js
// Buscador y reproductor de estaciones de radio en vivo, usando la API pública
// y gratuita de Radio Browser (no requiere API key ni registro).
// Docs: https://api.radio-browser.info

const RADIO_API = 'https://de1.api.radio-browser.info/json/stations/search';

let isPlaying = false;
let isMuted = false;
let lastVolume = 0.8;

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

    validStations.forEach(station => {
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

        item.onclick = () => playRadioStation(station);
        radioResults.appendChild(item);
    });
}

function playRadioStation(station) {
    if (!audioPlayer) return;
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
}

// Botón de búsqueda
if (searchMusicBtn) {
    searchMusicBtn.addEventListener('click', () => {
        const query = musicInput.value.trim();
        if (query) searchRadioStations(query);
    });
}

// Enter en el campo de búsqueda
if (musicInput) {
    musicInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = musicInput.value.trim();
            if (query) searchRadioStations(query);
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
