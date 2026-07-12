// js/ui.js

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
        if (password === "admin123") {
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

lightboxClose.addEventListener('click', () => {
    lightboxModal.style.display = 'none';
});