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

// --- CONTROL DE PESTAÑAS (Invitado / Mi cuenta / Registro) ---
function showLockError(msg) {
    if (!lockError) return;
    lockError.textContent = msg;
    lockError.style.display = 'block';
}

function clearLockError() {
    if (lockError) lockError.style.display = 'none';
}

function setLockMode(mode) {
    if (lockTabGuest) lockTabGuest.classList.toggle('active', mode === 'guest');
    if (lockTabAccount) lockTabAccount.classList.toggle('active', mode === 'account');
    if (lockForm) lockForm.style.display = mode === 'guest' ? 'flex' : 'none';
    if (accountForm) accountForm.style.display = mode === 'account' ? 'flex' : 'none';
    if (registerForm) registerForm.style.display = 'none';
    clearLockError();
}

if (lockTabGuest) lockTabGuest.addEventListener('click', () => setLockMode('guest'));
if (lockTabAccount) lockTabAccount.addEventListener('click', () => setLockMode('account'));

if (showRegisterLink) {
    showRegisterLink.addEventListener('click', () => {
        if (accountForm) accountForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'flex';
        clearLockError();
    });
}

if (showLoginLink) {
    showLoginLink.addEventListener('click', () => {
        if (registerForm) registerForm.style.display = 'none';
        if (accountForm) accountForm.style.display = 'flex';
        clearLockError();
    });
}

// Se llama al terminar CUALQUIER login exitoso (invitado, cuenta o registro)
function finishLogin() {
    hideLockScreen();

    if (typeof refreshCurrentUserId === 'function') {
        refreshCurrentUserId();
    }
    if (typeof loadInitialMessages === 'function') {
        loadInitialMessages();
    }
    if (typeof applyGuestRestrictions === 'function') {
        applyGuestRestrictions();
    }
}

// MODO INVITADO: contraseña compartida (la cuenta CHAT_LOGIN_EMAIL de siempre).
// Deja ver el chat pero NO escribir (ver applyGuestRestrictions en chat.js).
async function attemptGuestLogin() {
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
        showLockError('Contraseña incorrecta.');
        lockPasswordInput.value = '';
        lockPasswordInput.focus();
        return;
    }

    isGuest = true;
    myUsername = null;
    finishLogin();
}

// MODO CUENTA: login personal (usuario+contraseña) → puede chatear
async function attemptAccountLogin() {
    if (!accountUsernameInput || !accountPasswordInput) return;

    const username = accountUsernameInput.value.trim();
    const password = accountPasswordInput.value;
    if (!username || !password) return;

    if (accountLoginBtn) accountLoginBtn.disabled = true;

    try {
        await loginAccount(username, password);
        isGuest = false;
        myUsername = username;
        finishLogin();
    } catch (err) {
        showLockError(err.message);
    } finally {
        if (accountLoginBtn) accountLoginBtn.disabled = false;
    }
}

// REGISTRO: crea la cuenta personal y entra directo (ya puede chatear)
async function attemptRegister() {
    if (!registerUsernameInput || !registerPasswordInput) return;

    const username = registerUsernameInput.value.trim();
    const password = registerPasswordInput.value;
    if (!username || !password) return;

    if (registerBtn) registerBtn.disabled = true;

    try {
        await registerAccount(username, password);
        isGuest = false;
        myUsername = username;
        finishLogin();
    } catch (err) {
        showLockError(err.message);
    } finally {
        if (registerBtn) registerBtn.disabled = false;
    }
}

if (lockSubmitBtn) lockSubmitBtn.addEventListener('click', attemptGuestLogin);
if (accountLoginBtn) accountLoginBtn.addEventListener('click', attemptAccountLogin);
if (registerBtn) registerBtn.addEventListener('click', attemptRegister);

if (lockPasswordInput) {
    lockPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            attemptGuestLogin();
        }
    });
}

if (accountPasswordInput) {
    accountPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            attemptAccountLogin();
        }
    });
}

if (registerPasswordInput) {
    registerPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            attemptRegister();
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