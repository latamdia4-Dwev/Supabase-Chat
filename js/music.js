// 🎵 Archivo: js/music.js (Módulo del Reproductor conectado a tu propia API)

// ⚠️ REEMPLAZA ESTA URL POR LA QUE TE DA VERCEL AL DESPLEGAR
const MI_API_URL = "https://tu-proyecto.vercel.app/api/search";

searchMusicBtn.addEventListener('click', async () => {
    const query = musicInput.value.trim();
    if (!query) return;

    // DETECTOR DE ENLACES DIRECTOS: Si el usuario pega una URL directa, la reproduce al instante
    if (query.startsWith('http://') || query.includes('xn--41a.ws')) {
        if (query.includes('?h=')) {
            audioPlayer.src = query;
            audioPlayer.play();
            currentTrackTitle.textContent = "Reproduciendo enlace directo...";
            return;
        } else if (query.includes('/search/')) {
            // Si pega el enlace de búsqueda completo, extraemos solo el texto final para la API
            const parts = query.split('/search/');
            if (parts[1]) {
                musicInput.value = parts[1].replace(/-/g, ' ');
                searchMusicBtn.click();
                return;
            }
        }
    }

    currentTrackTitle.textContent = "Buscando pista mediante API...";

    try {
        // Hacemos la petición a nuestra API Serverless pasándole la búsqueda limpia
        const response = await fetch(`${MI_API_URL}?q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data.success && data.audioUrl) {
            // Asignamos el flujo de audio directamente al reproductor HTML5
            audioPlayer.src = data.audioUrl;
            audioPlayer.play();
            currentTrackTitle.textContent = `▶️ ${query}`;
        } else {
            currentTrackTitle.textContent = "❌ Pista no encontrada";
            alert(data.error || "No se pudo encontrar la canción.");
        }
    } catch (err) {
        console.error("[Music API Error]:", err);
        currentTrackTitle.textContent = "❌ Error en el servidor API";
        alert("Hubo un fallo al conectar con tu API de Vercel. Asegúrate de haber colocado la URL correcta.");
    }
});