# Changelog — Supabase Chat Pro

Todos los cambios notables del proyecto se registran aquí, del más reciente
al más antiguo. Formato libre, en español, pensado para que cualquiera
(no solo quien programó) entienda qué cambió y por qué.

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
