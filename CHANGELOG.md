# Changelog — Supabase Chat Pro

Todos los cambios notables del proyecto se registran aquí, del más reciente
al más antiguo. Formato libre, en español, pensado para que cualquiera
(no solo quien programó) entienda qué cambió y por qué.

## 2026-11-08 — v2.4.0

### 🔗 Integración Single Sign-On (SSO) y Navegación Compartida con el Conversor de YouTube a MP3
- **Botón directo al Conversor con sesión iniciada**: Se agregó el botón `🎵 Conversor` en la barra superior del chat (`chat-header`). Al hacer clic, transfiere de forma segura las credenciales de sesión activa (`access_token` y `refresh_token`) hacia `https://supabase-chat-convierte-audio.onrender.com/`, permitiendo que el usuario ingrese al conversor con su misma cuenta sin tener que volver a iniciar sesión.
- **Auto-login por URL hash**: Si el usuario entra al chat redirigido desde el conversor con tokens en el hash (`#access_token=...&refresh_token=...`), la aplicación restaura la sesión de Supabase Auth automáticamente, carga el nombre de usuario de la tabla `profiles`, oculta la pantalla de bloqueo e ingresa de inmediato, limpiando la barra de direcciones para proteger los tokens.
- **Auto-restauración de sesión persistente**: Al recargar la página, comprueba si existe una sesión previa en Supabase Auth y accede directamente al chat sin bloquear al usuario.
- **Enlace rápido en pantalla de bloqueo**: Enlace directo `🎵 Ir al Conversor de YouTube a MP3` en la pantalla de bienvenida/login.

## 2026-11-05

### ☁️ Audio y video ahora se guardan en Cloudflare R2
- **Las canciones nuevas y las imágenes/videos del chat ya no usan el
  almacenamiento de Supabase** (que se llenó). Ahora se guardan en
  Cloudflare R2, con más espacio gratis. Supabase sigue encargándose del
  login, los mensajes, los mensajes privados y la lista de canciones.
- **Límites nuevos para cuidar el espacio:** canción hasta 40 MB (500 MB
  por persona en total); imagen hasta 10 MB y video hasta 50 MB (300 MB por
  persona en total). Si te pasas, la app te avisa con un mensaje claro.
- Las canciones que ya estaban subidas antes siguen funcionando mientras
  Supabase las tenga disponible.

### 🎵 Canciones repetidas ya no se duplican
- **Si subes una canción que otra persona ya subió** (aunque tenga otro
  nombre), no se guarda otra copia: se agrega directamente a tu lista, con
  tu propio nombre y álbum, y sigue siendo privada hasta que tú la compartas.
  Así el espacio rinde mucho más.

### 🗑️ Papelera de 24 horas en "Mi música"
- **Borrar una canción ahora es más seguro.** Si otra persona todavía la
  tiene, solo se quita de tu lista. Si eras la última persona que la tenía,
  va a una **🗑️ Papelera** (botón nuevo junto a "Seleccionar varias") donde
  puedes **recuperarla con ↺ durante 24 horas**; pasado ese tiempo se borra
  para siempre y se libera el espacio.

## 2026-08-13

### 🎵 Música offline
- **Música compartida ahora se puede descargar para offline.** Antes, el
  botón 📥 (guardar para escuchar sin internet) solo aparecía en tus
  propias canciones ("Mi música"). Ahora también aparece en las canciones
  de otras personas dentro de "Música compartida".
- **La lista ya no desaparece sin conexión.** Si se corta el internet
  estando en "Música compartida", antes se mostraba solo un mensaje de
  error. Ahora, igual que en "Mi música", se sigue viendo la lista de lo
  que ya se descargó para offline.

### ℹ️ Panel "Novedades"
- Nuevo botón **ℹ️** que abre un panel explicando, sin tecnicismos, todo lo
  que el chat sabe hacer (chatear, radio y música, mensajes privados,
  juegos, personalización, etc.). Pensado para cualquier usuario nuevo.
- El botón es flotante y se posiciona automáticamente pegado al borde
  izquierdo de la caja del chat, a la altura del header (junto a la
  llave 🔑) — se recalcula solo si se cambia el tamaño de la ventana.
- El contenido del panel vive en `js/whatsnew.js` (arreglo
  `WHATS_NEW_SECTIONS`): para agregar una función nueva a la lista, basta
  con sumar una línea ahí.

### 🔊 Volumen del reproductor
- **Arreglado:** en ventanas de poca altura (donde el control de volumen
  aparece colapsado y hay que tocar 🔊 para desplegarlo), el primer toque
  muteaba el audio al mismo tiempo que desplegaba el slider. Ahora el
  primer toque solo despliega el control; silenciar/reactivar queda para
  un segundo toque, con el slider ya visible.

---

## Cómo se actualiza este changelog

Cada vez que se haga un cambio en el proyecto (arreglo, función nueva,
ajuste visual, etc.), se agrega una entrada nueva arriba de todo, bajo la
fecha correspondiente (se crea una fecha nueva si cambió el día), con una
descripción breve en el mismo estilo que las de arriba: qué cambió, en
qué parte de la app se nota, y por qué (si no es obvio). No hace falta
detalle técnico de código — esto es para que cualquiera pueda leerlo y
entender qué pasó.
