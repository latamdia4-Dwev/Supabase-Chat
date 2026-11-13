# Changelog — Supabase Chat Pro

Todos los cambios notables del proyecto se registran aquí, del más reciente
al más antiguo. Formato libre, en español, pensado para que cualquiera
(no solo quien programó) entienda qué cambió y por qué.

## 2026-11-12 — v2.5.1

### 🐛 Envío del mensaje pendiente al cerrar sesión o apagar el equipo
- Causa: al cerrar sesión el token en memoria se borraba antes del envío, y al apagar el equipo `pagehide` nunca se dispara.
- Cerrar sesión (🙈): ahora envía el texto pendiente (`sendDraftBeforeLogout`) antes de `signOut()`.
- Respaldo en `localStorage` (`pendingChatDraft`) mientras se escribe y en `visibilitychange`; si no llegó a enviarse (apagado, cierre brusco, fallo de red), se envía en el siguiente inicio de sesión del mismo usuario (`recoverPendingDraft`, llamado desde `finishLogin`). Se limpia al enviar normalmente o al vaciar el campo.
- Limitación: con el equipo apagado no se puede enviar nada; el mensaje sale al volver a iniciar sesión.
- localStorage no es fiable si el navegador lo borra al cerrarse: el respaldo principal pasa a la base de datos (tabla `pending_drafts`, una fila por usuario con RLS; ver `sql/pending_drafts.sql`, ejecutar una vez en Supabase). Se sincroniza 3 s después de dejar de escribir y al pasar la pestaña a segundo plano, así que a lo más se pierden los últimos segundos escritos. Al iniciar sesión se reclama la fila con `delete ... returning` para que dos dispositivos no lo envíen dos veces; si el envío falla, se vuelve a guardar. localStorage queda como respaldo secundario si la tabla no existe o no hay red.

### 🔗 Enlaces clicables en el chat y en mensajes privados
- Los enlaces `http(s)://` y `www.` en los mensajes se vuelven clicables y abren en una pestaña nueva (`rel="noopener noreferrer"`). Se construyen con nodos DOM (sin `innerHTML`) y solo se aceptan esos esquemas. Se quita la puntuación final ("mira https://a.com.") y funcionan también dentro de los bloques monoespaciados.

## 2026-11-11 — v2.5.0

### ⚙️ Página de Opciones (botón ⚙️ del header)
- **Volumen**: el volumen inicial ahora es 10 por defecto. Al mover ese control también cambia el volumen del reproductor al instante. Casilla opcional para recordar el último volumen usado (desactivada por defecto).
- **Colores**: color de acento, mensajes enviados y recibidos, fondo del chat, encabezado y fondo de la página, con botón para restablecerlos. Para que el acento funcione, el verde fijo `#3ecf8e` del CSS y de los JS pasó a la variable `--accent` (con `--accent-rgb` para las transparencias).
- **Texto**: tamaño del texto de los mensajes (variable `--msg-font-size`).
- **Álbumes ocultos**: botón para mostrar todos de una vez.
- **Restablecer**: vuelve todas las opciones a su valor original.
- **Guardado**: todo en el navegador (`localStorage`, clave `chatOptions`), sin tocar la base de datos.

### 📋 Textos pegados
- Antes se recortaban los espacios del inicio y se perdía la estructura. Ahora solo se quitan las líneas vacías al inicio y los espacios al final (`normalizeMessageText` en `js/msg-utils.js`).
- Si el texto trae sangrías, tabulaciones o columnas, se muestra en bloque monoespaciado con scroll horizontal (`.msg-pre`). Aplica al chat, a los mensajes privados y al envío automático al cerrar la pestaña.

### 🙈 Álbumes ocultos
- Cada álbum tiene un botón 🙈 para ocultarlo ("Sin álbum" no se oculta).
- Los ocultos pasan a la sección plegable "🙈 Álbumes ocultos (n)" al final, después de "Sin álbum"; ahí cada uno tiene 👁 para volver a mostrarlo.
- La lista se guarda por usuario (`hiddenAlbums:<id>`), solo en ese navegador; no viaja a otros dispositivos.

### 🧭 Menú personalizable (⚙️ > Menú)
- Cada botón del header (⚙️ 💬 🎮 🎵 ☀️ 🙈) se puede mover al header, al lateral izquierdo (pegado al chat, debajo de ℹ️) o al derecho (borde de la ventana, debajo del control de brillo), de forma individual o todos a la vez. El control de brillo 🌙 puede ir arriba a la derecha o a la izquierda.
- En ventanas angostas, sin espacio a los lados, los botones vuelven al header automáticamente. Con el chat bloqueado, los botones de los laterales se ocultan.
- Se guarda en `chatOptions.menu` y se restablece con "Restablecer todas las opciones".

### 🧭 Paneles
- **Un solo panel a la vez**: abrir 💬, 🎮, 🎵 o ⚙️ cierra el que estaba abierto, y 💬 también cierra su panel si ya está abierto. En pantalla ancha y alta (≥ 960 px de ancho y > 700 px de alto), donde la música es panel lateral, no se cierra nada.
- **Header siempre visible**: mensajes privados, juegos y opciones empiezan debajo del header y de la barra de reproducción (variable `--panel-top`, calculada con `ResizeObserver`).

### 💬 Imágenes y videos en mensajes privados
- Botón ➕, vista previa de los archivos en cola, envío con `uploadToR2('chat', …)` y pegado (Ctrl+V) igual que en el chat general. Los videos se muestran con reproductor y las imágenes se abren con zoom.
- Los archivos ya enviados salen de la cola, así un reintento tras un fallo no duplica mensajes.

## 2026-11-08 — v2.4.1

### 🎧 Reubicación Ergonómica del Conversor y Precarga Inteligente de Música (Buffer ±3 canciones)
- **Limpieza de la cabecera del chat**: Se eliminó el botón invasivo de la barra superior (`chat-header`), evitando el solapamiento del badge `@Marko` sobre el título "Supabase Chat Pro" y devolviendo el espaciado original a los iconos.
- **Botón integrado en Panel de Música**: Se ubicó el botón `🎵 Bajar de YouTube` en el panel lateral de música ("Mi música"), justo al lado de `⬆️ Subir archivo`, para que esté accesible exactamente donde el usuario organiza y reproduce sus pistas.
- **Precarga inteligente en caché (Buffer ±3 pistas)**:
  - Al reproducir cualquier canción (ej. pista 10), el sistema descarga y almacena automáticamente en segundo plano (IndexedDB) las 3 canciones anteriores (7, 8, 9) y las 3 canciones posteriores (11, 12, 13).
  - Al presionar siguiente/anterior, la reproducción es instantánea y funciona incluso si se interrumpe la conexión a internet.

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
