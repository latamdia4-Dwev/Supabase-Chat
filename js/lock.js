// js/lock.js
// Bloqueo REAL del chat usando Supabase Auth + Row Level Security (RLS).
//
// A diferencia de una contraseña quemada en el JS, esto sí es seguro contra
// F12/consola: sin haber iniciado sesión con una cuenta válida, la base de
// datos rechaza cualquier consulta (SELECT/INSERT/DELETE) sin importar qué
// se intente hacer desde el navegador. Esto REQUIERE que ya hayas configurado
// Auth + las políticas de RLS en tu proyecto de Supabase (ver instrucciones
// que te compartí aparte). Sin esas políticas activas en Supabase, esta
// pantalla sigue siendo solo cosmética.

// Aquí se guardan los nodos reales del historial mientras el chat está
// oculto/bloqueado. Se usa un DocumentFragment (no texto/HTML) para poder
// sacarlos por completo del documento visible (privacidad real, no solo
// visibility:hidden) sin destruirlos ni reconstruirlos desde texto — así los
// botones (como el de ocultar mensaje) conservan sus eventos de JavaScript
// intactos al restaurarlos.
let savedMessagesFragment = null;

function showLockScreen() {
    if (!lockOverlay) return;

    // Refuerzo: oculta de verdad el resto del chat (ver CSS .locked), no solo
    // el overlay visual, para dificultar los trucos de "quitar el overlay
    // desde consola".
    if (chatContainer) chatContainer.classList.add('locked');

    // Mover (no copiar/serializar) los mensajes actuales a un fragmento
    // desconectado del documento.
    if (messagesContainer && messagesContainer.hasChildNodes()) {
        savedMessagesFragment = document.createDocumentFragment();
        while (messagesContainer.firstChild) {
            savedMessagesFragment.appendChild(messagesContainer.firstChild);
        }
    }

    lockOverlay.style.display = 'flex';
    if (lockError) lockError.style.display = 'none';
    if (lockPasswordInput) {
        lockPasswordInput.value = '';
        setTimeout(() => lockPasswordInput.focus(), 50);
    }
}

function hideLockScreen() {
    if (!lockOverlay) return;
    lockOverlay.style.display = 'none';
    if (chatContainer) chatContainer.classList.remove('locked');

    // Reinsertar los mismos nodos guardados (con sus eventos intactos)
    if (messagesContainer && savedMessagesFragment) {
        messagesContainer.appendChild(savedMessagesFragment);
        savedMessagesFragment = null;
    }

    // Mostrar los mensajes que llegaron por Realtime mientras estaba oculto
    if (typeof flushPendingMessages === 'function') {
        flushPendingMessages();
    }

    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

async function attemptLogin() {
    if (!lockPasswordInput) return;

    const password = lockPasswordInput.value;
    if (!password) return;

    if (lockSubmitBtn) lockSubmitBtn.disabled = true;

    const { error } = await supabaseClient.auth.signInWithPassword({
        email: CHAT_LOGIN_EMAIL,
        password: password
    });

    if (lockSubmitBtn) lockSubmitBtn.disabled = false;

    if (error) {
        if (lockError) {
            lockError.textContent = 'Contraseña incorrecta.';
            lockError.style.display = 'block';
        }
        lockPasswordInput.value = '';
        lockPasswordInput.focus();
        return;
    }

    hideLockScreen();

    // Refresca el auth.uid() en caché (usado para saber quién reaccionó a
    // cada mensaje) ahora que ya hay una sesión válida.
    if (typeof refreshCurrentUserId === 'function') {
        refreshCurrentUserId();
    }

    // Vuelve a intentar cargar el historial ahora que ya hay una sesión válida
    if (typeof loadInitialMessages === 'function') {
        loadInitialMessages();
    }
}

if (lockSubmitBtn) {
    lockSubmitBtn.addEventListener('click', attemptLogin);
}

if (lockPasswordInput) {
    lockPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            attemptLogin();
        }
    });
}

// Ocultar el chat = cerrar sesión de verdad (no solo tapar la pantalla).
// Así, aunque alguien manipule el JS o el DOM desde la consola, Supabase
// rechazará cualquier consulta a la base de datos porque ya no existe una
// sesión válida asociada a ese navegador.
if (hideChatBtn) {
    hideChatBtn.addEventListener('click', async () => {
        showLockScreen();
        await supabaseClient.auth.signOut();
    });
}

// NOTA: no se restaura ninguna sesión previa al cargar la página a propósito.
// Con persistSession:false en config.js, nunca queda una sesión guardada de
// todos modos, así que el candado siempre arranca visible y siempre exige
// volver a escribir la contraseña (al recargar, cerrar la pestaña, o al
// ocultar el chat manualmente con el botón 🙈).