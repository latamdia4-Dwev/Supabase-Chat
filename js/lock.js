// js/lock.js
// Pantalla de bloqueo básica para evitar miradas curiosas.
// ADVERTENCIA: protección solo visual del lado del cliente, no es seguridad real
// (la contraseña vive en config.js y cualquiera puede verla con "Ver código fuente").

function showLockScreen() {
    if (!lockOverlay) return;
    lockOverlay.style.display = 'flex';
    if (lockError) lockError.style.display = 'none';
    if (lockPasswordInput) {
        lockPasswordInput.value = '';
        // Pequeño retraso para asegurar que el overlay ya es visible antes de enfocar
        setTimeout(() => lockPasswordInput.focus(), 50);
    }
}

function hideLockScreen() {
    if (!lockOverlay) return;
    lockOverlay.style.display = 'none';
}

function checkLockPassword() {
    if (!lockPasswordInput) return;
    const entered = lockPasswordInput.value;

    if (entered === CHAT_ACCESS_PASSWORD) {
        hideLockScreen();
    } else {
        if (lockError) lockError.style.display = 'block';
        lockPasswordInput.value = '';
        lockPasswordInput.focus();
    }
}

if (lockSubmitBtn) {
    lockSubmitBtn.addEventListener('click', checkLockPassword);
}

if (lockPasswordInput) {
    lockPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            checkLockPassword();
        }
    });
}

// Botón para ocultar el chat manualmente (vuelve a pedir contraseña para verlo)
if (hideChatBtn) {
    hideChatBtn.addEventListener('click', () => {
        showLockScreen();
    });
}

// El overlay ya arranca visible por defecto en el HTML (style="display: flex;"),
// así que el chat queda bloqueado desde el primer momento en que carga la página.
