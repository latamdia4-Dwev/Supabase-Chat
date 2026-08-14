// js/whatsnew.js
// Panel "Novedades": explica en lenguaje simple (sin tecnicismos) todo lo
// que el chat sabe hacer hoy, para cualquier persona que lo use. Se abre
// con el botón flotante ℹ️ (arriba a la izquierda). Si se agregan más
// funciones al chat en el futuro, basta con sumar entradas al arreglo
// WHATS_NEW_SECTIONS de abajo.

const WHATS_NEW_SECTIONS = [
    {
        title: '💬 Chatear',
        items: [
            'Manda mensajes de texto normales, con emojis 😀, stickers 🧩 o GIFs 🎞️.',
            'Envía fotos y videos: puedes elegirlos con el botón ➕ o simplemente pegarlos (Ctrl+V) desde el portapapeles.',
            'Toca una foto para verla en grande, con zoom (rueda del mouse) y arrastrando para moverla.',
            'Reacciona a cualquier mensaje con un emoji, tocando el ícono 😊.',
            'El chat carga los mensajes más antiguos automáticamente cuando subes hasta arriba del todo.',
        ],
    },
    {
        title: '🔒 Entrar al chat',
        items: [
            'Modo Invitado: solo con una contraseña compartida, puedes ver el chat pero no escribir.',
            'Mi cuenta: creas tu propio usuario y contraseña para poder chatear, reaccionar y usar mensajes privados.',
            'Por seguridad, la sesión no se guarda: si cierras o recargas la página, hay que volver a iniciar sesión.',
        ],
    },
    {
        title: '💌 Mensajes privados',
        items: [
            'Con tu cuenta personal, puedes escribirle en privado a cualquier otra persona del chat.',
            'También tienes tu propio espacio de "Notas personales", solo para ti.',
        ],
    },
    {
        title: '🎵 Radio y música',
        items: [
            'Radio en vivo: busca y escucha miles de estaciones de radio de internet, gratis.',
            'Música compartida: escucha canciones que otras personas del chat subieron y marcaron como públicas.',
            'Mi música: sube tus propias canciones (privadas por defecto, o compártelas si quieres).',
            'Guarda canciones para escucharlas sin internet: toca 📥 en cualquier canción (tuya o compartida) y quedará disponible offline.',
            'Controles de reproducción completos: play/pausa, siguiente/anterior, aleatorio, repetir, volumen y una barra para saltar a cualquier momento de la canción.',
        ],
    },
    {
        title: '🎮 Juegos',
        items: [
            'Varios juegos para jugar sin salir del chat: ajedrez, damas, sudoku, sopa de letras, solitario y más.',
            'Incluye juegos para 2 personas en el mismo dispositivo, como Tic-Tac-Toe y Conecta 4.',
        ],
    },
    {
        title: '🌙 A tu gusto',
        items: [
            'Cambia entre modo oscuro y modo claro con un toque.',
            'Baja el brillo de toda la pantalla con el control 🌙 (útil de noche), con nivel ajustable.',
        ],
    },
];

function buildWhatsNewContent() {
    if (!whatsNewBody) return;
    whatsNewBody.innerHTML = '';

    WHATS_NEW_SECTIONS.forEach(section => {
        const wrap = document.createElement('div');
        wrap.className = 'whatsnew-section';

        const title = document.createElement('div');
        title.className = 'whatsnew-section-title';
        title.textContent = section.title;
        wrap.appendChild(title);

        const list = document.createElement('ul');
        list.className = 'whatsnew-list';
        section.items.forEach(text => {
            const li = document.createElement('li');
            li.textContent = text;
            list.appendChild(li);
        });
        wrap.appendChild(list);

        whatsNewBody.appendChild(wrap);
    });
}

const whatsNewToggleBtn = document.getElementById('whatsNewToggleBtn');
const whatsNewOverlay = document.getElementById('whatsNewOverlay');
const whatsNewCloseBtn = document.getElementById('whatsNewCloseBtn');
const whatsNewBody = document.getElementById('whatsNewBody');

function openWhatsNew() {
    if (!whatsNewOverlay) return;
    if (!whatsNewOverlay.dataset.built) {
        buildWhatsNewContent();
        whatsNewOverlay.dataset.built = '1';
    }
    whatsNewOverlay.classList.add('open');
}

function closeWhatsNew() {
    if (whatsNewOverlay) whatsNewOverlay.classList.remove('open');
}

if (whatsNewToggleBtn) whatsNewToggleBtn.addEventListener('click', openWhatsNew);
if (whatsNewCloseBtn) whatsNewCloseBtn.addEventListener('click', closeWhatsNew);

// Cerrar al hacer clic fuera del cuadro (sobre el fondo oscuro).
if (whatsNewOverlay) {
    whatsNewOverlay.addEventListener('click', (e) => {
        if (e.target === whatsNewOverlay) closeWhatsNew();
    });
}

// Cerrar con ESC, solo si el panel está abierto.
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && whatsNewOverlay && whatsNewOverlay.classList.contains('open')) {
        closeWhatsNew();
    }
});
