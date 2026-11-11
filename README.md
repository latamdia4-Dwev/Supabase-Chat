# Supabase Chat Pro

Chat con Supabase (auth, mensajes, mensajes privados), Cloudflare R2 (imágenes, videos y música), radio/música, juegos y página de Opciones (⚙️).

## Estructura de `js/`
- `config.js`: Supabase, URL del Worker de R2 y referencias al DOM.
- `ui.js`: tema, brillo, admin, lightbox, gestor de paneles (`closeOtherPanels`) y `--panel-top`.
- `options.js`: página de Opciones (volumen, colores, texto) guardada en `localStorage`.
- `msg-utils.js`: normalización de texto pegado, render de texto/medios y cola de archivos.
- `chat.js`, `dm.js`: chat general y mensajes privados.
- `music.js`: radio, música, álbumes (incluye álbumes ocultos) y reproductor.
- `games.js`, `lock.js`, `auth.js`, `media-api.js`, `media-picker.js`, `whatsnew.js`, `passwords.js`.

Ver `CHANGELOG.md` para el historial de cambios.
