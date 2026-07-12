// api/search.js
export default async function handler(req, res) {
    // Habilitar CORS para que tu GitHub Pages pueda consultar esta API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Manejar peticiones OPTIONS (Preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Obtener el término de búsqueda (ej: ?q=the-kill-nate-vikers)
    const { q } = req.query;
    if (!q) {
        return res.status(400).json({ error: 'Falta el parámetro de búsqueda "q"' });
    }

    try {
        // Formateamos la query como lo hace la web (/search/nombre-cancion)
        const formattedQuery = encodeURIComponent(q.toLowerCase().trim().replace(/\s+/g, '-'));
        const targetUrl = `https://muzpab.xn--41a.ws/search/${formattedQuery}`;

        // Hacemos la petición simulando un navegador real para despistar bloqueos sencillos
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: `Error al conectar con el servidor de música: ${response.statusText}` });
        }

        const htmlText = await response.text();

        // Expresión regular para buscar el patrón 'data-id="EL_ID_DE_LA_CANCION"' en el HTML
        // Esto evita tener que usar librerías pesadas de scraping en la función serverless
        const match = htmlText.match(/data-id="([^"]+)"/);

        if (match && match[1]) {
            const trackId = match[1];
            // Devolvemos la URL directa del archivo de audio ya lista para reproducir
            return res.status(200).json({
                success: true,
                audioUrl: `https://muzcdn.xn--41a.ws/?h=${trackId}`
            });
        } else {
            return res.status(404).json({ success: false, error: 'No se encontraron pistas de audio para esta búsqueda.' });
        }

    } catch (error) {
        return res.status(500).json({ error: `Error interno de la API: ${error.message}` });
    }
}