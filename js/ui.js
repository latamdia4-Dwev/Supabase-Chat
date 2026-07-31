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
//
// isAdmin (cosmético, contraseña en passwords.js) solo controla ocultar/
// mostrar botones en el chat general. Las funciones SENSIBLES (ver DMs de
// otros, resetear contraseñas) exigen ADEMÁS myIsRealAdmin === true, que
// viene de la base de datos (profiles.is_admin) y no se puede falsificar
// desde la consola del navegador — sin eso, las consultas simplemente no
// devuelven datos por las políticas RLS, sin importar qué diga isAdmin.
function applyAdminModeUI() {
    const showSuperAdmin = isAdmin && myIsRealAdmin;

    if (chatContainer) chatContainer.classList.toggle('super-admin-mode', showSuperAdmin);

    if (adminResetPwBtn) adminResetPwBtn.style.display = showSuperAdmin ? 'inline-flex' : 'none';

    const dmAdminBtn = document.getElementById('dmAdminAllBtn');
    if (dmAdminBtn) dmAdminBtn.style.display = showSuperAdmin ? 'block' : 'none';

    // Si el admin (cosmético) está activo pero la cuenta NO es admin real,
    // que quede claro por qué no ve nada nuevo — solo la primera vez que
    // activa, para no ser repetitivo.
    if (isAdmin && !myIsRealAdmin && !window._warnedNoRealAdmin) {
        window._warnedNoRealAdmin = true;
        setTimeout(() => alert('Modo Administrador (visual) activado. Para ver DMs de otros usuarios o resetear contraseñas, tu cuenta necesita profiles.is_admin = true en la base de datos (ver ADMIN_SETUP.sql).'), 300);
    }

    // Recarga el chat general para traer también los mensajes ocultos
    // cuando se activa, y para volver a ocultarlos al desactivar.
    if (typeof loadInitialMessages === 'function') loadInitialMessages();
}

// --- MODAL: RESETEAR CONTRASEÑA DE OTRO USUARIO (solo super-admin) ---
function buildAdminPasswordModal() {
    if (document.getElementById('adminPasswordPanel')) return;

    const modal = document.createElement('div');
    modal.id = 'adminPasswordPanel';
    modal.style.cssText = `
        display:none;position:absolute;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.97);z-index:600;justify-content:center;
        align-items:center;border-radius:12px;
    `;

    modal.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px;
                    padding:28px 24px;width:88%;max-width:320px;box-sizing:border-box;">
            <div style="font-size:2em;">🔑</div>
            <p style="color:#fff;font-weight:bold;margin:0;">Resetear contraseña de usuario</p>
            <p style="color:#aaa;font-size:0.75em;margin:0;text-align:center;">
                No se puede ver la contraseña actual (está cifrada), pero puedes
                asignarle una nueva.
            </p>

            <input id="adminPwUsernameInput" type="text" placeholder="Usuario objetivo"
                style="width:100%;box-sizing:border-box;padding:11px 14px;border-radius:20px;
                       border:1px solid #333;background:#1a1a1a;color:#fff;font-size:0.9em;
                       outline:none;text-align:center;">
            <input id="adminPwNewPasswordInput" type="password" placeholder="Nueva contraseña (mín. 6)"
                style="width:100%;box-sizing:border-box;padding:11px 14px;border-radius:20px;
                       border:1px solid #333;background:#1a1a1a;color:#fff;font-size:0.9em;
                       outline:none;text-align:center;">

            <p id="adminPwError" style="color:#f55;font-size:0.8em;margin:0;display:none;text-align:center;"></p>
            <p id="adminPwSuccess" style="color:#3ecf8e;font-size:0.8em;margin:0;display:none;text-align:center;"></p>

            <button id="adminPwSaveBtn"
                style="width:100%;box-sizing:border-box;background:#3ecf8e;color:#fff;border:none;
                       border-radius:20px;padding:11px;font-weight:bold;cursor:pointer;margin-top:4px;">
                Resetear contraseña
            </button>
            <button id="adminPwCloseBtn"
                style="width:100%;box-sizing:border-box;background:transparent;color:#aaa;border:1px solid #333;
                       border-radius:20px;padding:11px;cursor:pointer;">
                Cancelar
            </button>
        </div>
    `;

    if (chatContainer) chatContainer.appendChild(modal);

    document.getElementById('adminPwCloseBtn').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    document.getElementById('adminPwSaveBtn').addEventListener('click', async () => {
        const username = document.getElementById('adminPwUsernameInput').value.trim();
        const newPassword = document.getElementById('adminPwNewPasswordInput').value;
        const errEl = document.getElementById('adminPwError');
        const okEl = document.getElementById('adminPwSuccess');
        const saveBtn = document.getElementById('adminPwSaveBtn');

        if (errEl) errEl.style.display = 'none';
        if (okEl) okEl.style.display = 'none';

        if (!username || !newPassword) {
            if (errEl) { errEl.textContent = 'Completa ambos campos.'; errEl.style.display = 'block'; }
            return;
        }

        saveBtn.disabled = true;
        try {
            await adminResetPassword(username, newPassword);
            if (okEl) { okEl.textContent = `✓ Contraseña de "${username}" actualizada.`; okEl.style.display = 'block'; }
            document.getElementById('adminPwNewPasswordInput').value = '';
        } catch (err) {
            if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
        } finally {
            saveBtn.disabled = false;
        }
    });
}

if (adminResetPwBtn) {
    adminResetPwBtn.addEventListener('click', () => {
        buildAdminPasswordModal();
        document.getElementById('adminPasswordPanel').style.display = 'flex';
    });
}

adminToggle.addEventListener('click', () => {
    if (!isAdmin) {
        const password = prompt("Introduce la clave de Administrador:");
        if (password === ADMIN_PASSWORD) {
            isAdmin = true;
            chatContainer.classList.add('admin-mode');
            adminToggle.textContent = "🔓";
            if (typeof applyGuestRestrictions === 'function') applyGuestRestrictions();
            applyAdminModeUI();
            alert("Modo Administrador activado.");
        } else if (password !== null) {
            alert("Contraseña incorrecta.");
        }
    } else {
        isAdmin = false;
        chatContainer.classList.remove('admin-mode');
        adminToggle.textContent = "🔑";
        if (typeof applyGuestRestrictions === 'function') applyGuestRestrictions();
        applyAdminModeUI();
        alert("Modo Administrador desactivado.");
    }
});

// LÓGICA DE DETECCIÓN DE ZOOM E INTERACTIVIDAD MODAL (LIGHTBOX)

// Helpers genéricos para ocultar el control flotante de brillo mientras hay
// un panel a pantalla completa abierto (Juegos, Mensajes Privados, Lightbox),
// para que en móvil no tape el botón ✕ de esos paneles. Cada llamador usa su
// propia clase (p.ej. 'hidden-by-game') para no pisarse entre sí: el control
// solo vuelve a mostrarse cuando NINGÚN panel lo está ocultando.
function hideDimControls(reasonClass) {
    const dimControls = document.querySelector('.floating-dim-controls');
    if (dimControls) dimControls.classList.add(reasonClass);
}

function showDimControls(reasonClass) {
    const dimControls = document.querySelector('.floating-dim-controls');
    if (dimControls) dimControls.classList.remove(reasonClass);
}

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