// js/ui.js

// BAJAR BRILLO RÁPIDO DE TODA LA PÁGINA: reduce el brillo de toda la ventana
// con un clic (sin pedir contraseña), con nivel ajustable — como el filtro
// de brillo de una extensión de estilos, no un ocultamiento que tapa todo.
// El contenido sigue siendo legible, solo se ve más apagado/discreto. No
// reemplaza al candado (🙈), que sí cierra sesión de verdad.
function applyDimBrightness(value) {
    document.documentElement.style.setProperty('--dim-brightness', value / 100);
}

if (dimIntensitySlider) {
    const savedIntensity = localStorage.getItem('dimIntensity');
    const initialIntensity = savedIntensity !== null ? parseInt(savedIntensity, 10) : 45;
    dimIntensitySlider.value = initialIntensity;
    applyDimBrightness(initialIntensity);

    dimIntensitySlider.addEventListener('input', () => {
        applyDimBrightness(dimIntensitySlider.value);
        localStorage.setItem('dimIntensity', dimIntensitySlider.value);
    });
}

if (dimToggleBtn) {
    dimToggleBtn.addEventListener('click', () => {
        const isDimmed = document.documentElement.classList.toggle('brightness-dimmed');
        dimToggleBtn.textContent = isDimmed ? '☀️' : '🌙';
    });
}

// CONTROL DE TEMA CLARO Y OSCURO (Predeterminado oscuro)
if (!localStorage.getItem('theme')) {
    localStorage.setItem('theme', 'dark');
}
const currentTheme = localStorage.getItem('theme');
if (currentTheme === 'dark') {
    document.documentElement.classList.add('dark-mode');
    themeToggle.textContent = '☀️';
} else {
    document.documentElement.classList.remove('dark-mode');
    themeToggle.textContent = '🌙';
}

themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.classList.contains('dark-mode');
    if (isDark) {
        document.documentElement.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
        themeToggle.textContent = '🌙';
    } else {
        document.documentElement.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
        themeToggle.textContent = '☀️';
    }
});

// CONTROL DE LOGIN DE ADMINISTRADOR
adminToggle.addEventListener('click', () => {
    if (!isAdmin) {
        const password = prompt("Introduce la clave de Administrador:");
        if (password === ADMIN_PASSWORD) {
            isAdmin = true;
            chatContainer.classList.add('admin-mode');
            adminToggle.textContent = "🔓";
            alert("Modo Administrador activado.");
        } else if (password !== null) {
            alert("Contraseña incorrecta.");
        }
    } else {
        isAdmin = false;
        chatContainer.classList.remove('admin-mode');
        adminToggle.textContent = "🔑";
        alert("Modo Administrador desactivado.");
    }
});

// LÓGICA DE DETECCIÓN DE ZOOM E INTERACTIVIDAD MODAL (LIGHTBOX)
function openLightbox(url) {
    lightboxImg.src = url;
    zoomScale = 1;
    translateX = 0;
    translateY = 0;
    updateLightboxTransform();
    lightboxModal.style.display = 'flex';

    // Oculta el control flotante de brillo mientras el visor está abierto,
    // para que nunca tape el botón de cerrar (antes ambos usaban el mismo
    // z-index y el control de brillo, al estar después en el HTML, ganaba).
    const dimControls = document.querySelector('.floating-dim-controls');
    if (dimControls) dimControls.classList.add('hidden-by-lightbox');
}

function closeLightbox() {
    lightboxModal.style.display = 'none';
    isDragging = false;

    const dimControls = document.querySelector('.floating-dim-controls');
    if (dimControls) dimControls.classList.remove('hidden-by-lightbox');
}

function updateLightboxTransform() {
    lightboxImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoomScale})`;
}

lightboxModal.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    zoomScale = Math.min(Math.max(0.5, zoomScale + delta), 5);
    updateLightboxTransform();
}, { passive: false });

lightboxImg.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateLightboxTransform();
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

lightboxClose.addEventListener('click', closeLightbox);

// Cerrar al hacer clic FUERA de la foto (el fondo oscuro del modal).
// Se comprueba que el clic sea directamente sobre el fondo (e.target ===
// lightboxModal) y no sobre la imagen ni sobre el botón de cerrar, para no
// interferir con el arrastre/zoom de la imagen.
lightboxModal.addEventListener('click', (e) => {
    if (e.target === lightboxModal) {
        closeLightbox();
    }
});

// Cerrar con la tecla ESC, solo si el lightbox está abierto actualmente.
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightboxModal.style.display === 'flex') {
        closeLightbox();
    }
});