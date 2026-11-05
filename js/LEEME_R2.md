# Migración de audio y video a Cloudflare R2

Supabase sigue haciendo login, chat, mensajes y la lista de canciones.
Solo los **archivos** (mp3 y videos/imágenes del chat) pasan a R2.
Todo se hace desde los paneles web, sin instalar nada.

## 1. Cloudflare — crear el bucket
1. Entra a dash.cloudflare.com → **R2 Object Storage** → **Create bucket**.
2. Nombre: `chat-media` (cualquiera). **No actives** acceso público: el Worker
   controla quién ve qué.
   (Cloudflare puede pedir una tarjeta para activar R2; no cobra mientras
   estés dentro de los 10 GB gratis.)

## 2. Cloudflare — crear el Worker
1. **Workers & Pages** → **Create** → **Create Worker** → nombre `chat-media` → **Deploy**.
2. **Edit code** → borra todo, pega el contenido de `cloudflare-worker/worker.js` → **Deploy**.
3. **Settings → Bindings → Add → R2 bucket**: variable `BUCKET`, bucket `chat-media`.
4. **Settings → Variables and Secrets → Add**:
   | Nombre | Tipo | Valor |
   |---|---|---|
   | `SUPABASE_URL` | Texto | `https://xftmgzrkqhuzoymvkoqp.supabase.co` |
   | `SUPABASE_ANON_KEY` | Texto | la anon key de `config.js` |
   | `SUPABASE_SERVICE_KEY` | **Secret** | Supabase → Project Settings → API → `service_role` |
   | `SIGNING_SECRET` | **Secret** | un texto largo aleatorio (30+ caracteres) |
   | `ALLOWED_ORIGIN` | Texto | tu sitio, ej. `https://TU-USUARIO.github.io` (sin `/` final) |
   | `GUEST_EMAIL` | Texto (opcional) | `chat@tuapp.com` |
5. **Settings → Triggers → Cron Triggers → Add**: `0 * * * *` (cada hora).
   Es lo que borra de verdad lo que cumplió 24 h en la papelera.
6. Copia la URL del Worker (`https://chat-media.xxxx.workers.dev`).

> La clave `service_role` es muy poderosa: va **solo** como Secret del Worker,
> nunca en `config.js` ni en GitHub.

## 3. Supabase
SQL Editor → pega y corre `R2_MIGRATION.sql`.

## 4. Tu código
1. En `js/config.js`, reemplaza `MEDIA_API_URL` por la URL del Worker.
2. Sube a GitHub: `index.html`, `js/config.js`, `js/media-api.js` (nuevo),
   `js/chat.js`, `js/music.js`.

## 5. Probar
- Sube una canción → debe sonar y adelantar/retroceder.
- Sube la misma canción con otra cuenta → no debe duplicar el archivo.
- Envía una imagen y un video por el chat.
- En R2 → tu bucket deben aparecer carpetas `music/` y `chat/`.

## Límites (editables arriba en `worker.js`, constante `LIMITS`)
- Canción: 40 MB · 500 MB por usuario en total.
- Imagen del chat: 10 MB · video: 50 MB · 300 MB por usuario en total.
- R2 gratis: 10 GB totales.

## Qué pasa con lo anterior
- Canciones y chats viejos siguen apuntando a Supabase: se reproducen cuando
  Supabase te devuelva el acceso. Las nuevas ya van a R2.
- Para mover las viejas necesitas que Supabase levante la restricción.
