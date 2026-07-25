// js/lock.js
let savedMessagesFragment = null;

function showLockScreen() {
    if (!lockOverlay) return;
    if (chatContainer) chatContainer.classList.add('locked');
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
    if (messagesContainer && savedMessagesFragment) {
        messagesContainer.appendChild(savedMessagesFragment);
        savedMessagesFragment = null;
    }
    if (typeof flushPendingMessages === 'function') flushPendingMessages();
    if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

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
    // Prefetch usernames when switching to account tab (fire and forget)
    if (mode === 'account') fetchUsernamesPublic();
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

// --- USERNAME DROPDOWN ---
// Injects a button next to the username input that opens a floating list
// of all registered usernames fetched from the profiles table.
// Cached username list — populated once per session via the REST endpoint
// using the anon key directly, bypassing RLS (profiles are not sensitive,
// usernames are public by design in a chat app). This avoids the
// "Sin usuarios registrados" bug caused by RLS blocking the anon Supabase
// client before the user is authenticated.
let _cachedUsernames = null;

async function fetchUsernamesPublic() {
    if (_cachedUsernames) return _cachedUsernames;
    try {
        // Direct REST fetch with anon key — works regardless of RLS auth state.
        // If the profiles table has a policy like:
        //   FOR SELECT USING (true)   ← allow all reads
        // this will return data. If RLS is stricter, the array will be empty
        // but won't throw. Run this SQL to enable public username listing:
        //   CREATE POLICY "usernames publicos" ON profiles FOR SELECT USING (true);
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?select=username&order=username.asc`,
            {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        if (!res.ok) {
            console.warn('fetchUsernamesPublic HTTP', res.status, await res.text());
            return [];
        }
        const data = await res.json();
        _cachedUsernames = Array.isArray(data) ? data.map(p => p.username).filter(Boolean) : [];
        return _cachedUsernames;
    } catch (err) {
        console.error('Error fetching usernames:', err);
        return [];
    }
}

function buildUsernameDropdown() {
    if (document.getElementById('usernameDropdownBtn')) return;
    if (!accountUsernameInput) return;

    const btn = document.createElement('button');
    btn.id = 'usernameDropdownBtn';
    btn.type = 'button';
    btn.textContent = '▾';
    btn.title = 'Ver usuarios registrados';
    btn.style.cssText = `
        background:#3ecf8e;color:#fff;border:none;border-radius:50%;
        width:36px;height:36px;font-size:1em;cursor:pointer;flex-shrink:0;
        display:flex;align-items:center;justify-content:center;
    `;

    const list = document.createElement('div');
    list.id = 'usernameDropdownList';
    list.style.cssText = `
        display:none;position:absolute;left:0;right:0;top:100%;
        background:#1a1a1a;border:1px solid #333;border-radius:12px;
        max-height:160px;overflow-y:auto;z-index:700;margin-top:4px;
        box-shadow:0 4px 16px rgba(0,0,0,0.5);
    `;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;width:100%;display:flex;gap:8px;align-items:center;';
    accountUsernameInput.parentNode.insertBefore(wrapper, accountUsernameInput);
    wrapper.appendChild(accountUsernameInput);
    wrapper.appendChild(btn);
    wrapper.appendChild(list);

    btn.addEventListener('click', async () => {
        if (list.style.display === 'block') { list.style.display = 'none'; return; }
        list.innerHTML = '<div style="padding:10px;color:#aaa;font-size:0.82em;text-align:center;">Cargando...</div>';
        list.style.display = 'block';
        const usernames = await fetchUsernamesPublic();
        renderUsernameList(list, usernames);
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) list.style.display = 'none';
    });
}

function renderUsernameList(list, usernames) {
    list.innerHTML = '';
    if (!usernames || usernames.length === 0) {
        list.innerHTML = '<div style="padding:10px;color:#aaa;font-size:0.82em;text-align:center;">Sin usuarios registrados</div>';
        return;
    }
    usernames.forEach(username => {
        const opt = document.createElement('div');
        opt.textContent = username;
        opt.style.cssText = `
            padding:10px 14px;cursor:pointer;color:#fff;font-size:0.88em;
            border-bottom:1px solid rgba(255,255,255,0.05);
        `;
        opt.addEventListener('mouseenter', () => opt.style.background = 'rgba(62,207,142,0.15)');
        opt.addEventListener('mouseleave', () => opt.style.background = 'transparent');
        opt.addEventListener('click', () => {
            if (accountUsernameInput) accountUsernameInput.value = username;
            if (accountPasswordInput) accountPasswordInput.focus();
            list.style.display = 'none';
        });
        list.appendChild(opt);
    });
}

// Invalidate cache when a new account is registered so the new user appears
function invalidateUsernameCache() { _cachedUsernames = null; }

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUsernameDropdown);
} else {
    buildUsernameDropdown();
}

// --- PROFILE MODAL (change username / password) ---
function buildProfileModal() {
    if (document.getElementById('profileModal')) return;

    const modal = document.createElement('div');
    modal.id = 'profileModal';
    modal.style.cssText = `
        display:none;position:absolute;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.97);z-index:600;justify-content:center;
        align-items:center;border-radius:12px;
    `;

    modal.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px;
                    padding:28px 24px;width:88%;max-width:320px;box-sizing:border-box;">
            <div style="font-size:2em;">👤</div>
            <p style="color:#fff;font-weight:bold;margin:0;">Mi perfil</p>
            <p id="profileCurrentLabel" style="color:#3ecf8e;font-size:0.82em;margin:0 0 6px 0;"></p>

            <p style="color:#aaa;font-size:0.75em;margin:0;width:100%;text-align:left;">
                Nuevo usuario <span style="opacity:0.6;">(dejar vacío para no cambiar)</span>
            </p>
            <input id="profileUsernameInput" type="text" placeholder="Nuevo nombre de usuario"
                style="width:100%;box-sizing:border-box;padding:11px 14px;border-radius:20px;
                       border:1px solid #333;background:#1a1a1a;color:#fff;font-size:0.9em;
                       outline:none;text-align:center;">

            <p style="color:#aaa;font-size:0.75em;margin:4px 0 0 0;width:100%;text-align:left;">
                Nueva contraseña <span style="opacity:0.6;">(dejar vacío para no cambiar)</span>
            </p>
            <input id="profilePasswordInput" type="password" placeholder="Nueva contraseña"
                style="width:100%;box-sizing:border-box;padding:11px 14px;border-radius:20px;
                       border:1px solid #333;background:#1a1a1a;color:#fff;font-size:0.9em;
                       outline:none;text-align:center;">

            <p id="profileError" style="color:#f55;font-size:0.8em;margin:0;display:none;text-align:center;"></p>
            <p id="profileSuccess" style="color:#3ecf8e;font-size:0.8em;margin:0;display:none;text-align:center;"></p>

            <button id="profileSaveBtn"
                style="width:100%;box-sizing:border-box;background:#3ecf8e;color:#fff;border:none;
                       border-radius:20px;padding:11px;font-weight:bold;cursor:pointer;margin-top:4px;">
                Guardar cambios
            </button>
            <button id="profileCloseBtn"
                style="width:100%;box-sizing:border-box;background:transparent;color:#aaa;border:1px solid #333;
                       border-radius:20px;padding:11px;cursor:pointer;">
                Cancelar
            </button>
        </div>
    `;

    if (chatContainer) chatContainer.appendChild(modal);

    document.getElementById('profileCloseBtn').addEventListener('click', closeProfileModal);
    document.getElementById('profileSaveBtn').addEventListener('click', saveProfileChanges);
}

function openProfileModal() {
    buildProfileModal();
    const modal = document.getElementById('profileModal');
    if (!modal) return;
    const label = document.getElementById('profileCurrentLabel');
    if (label) label.textContent = `Usuario actual: ${myUsername || '—'}`;
    const err = document.getElementById('profileError');
    const ok = document.getElementById('profileSuccess');
    if (err) err.style.display = 'none';
    if (ok) ok.style.display = 'none';
    const u = document.getElementById('profileUsernameInput');
    const p = document.getElementById('profilePasswordInput');
    if (u) u.value = '';
    if (p) p.value = '';
    modal.style.display = 'flex';
}

function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.style.display = 'none';
}

async function saveProfileChanges() {
    const newUsername = (document.getElementById('profileUsernameInput')?.value || '').trim();
    const newPassword = (document.getElementById('profilePasswordInput')?.value || '');
    const errEl = document.getElementById('profileError');
    const okEl = document.getElementById('profileSuccess');
    const saveBtn = document.getElementById('profileSaveBtn');

    if (errEl) errEl.style.display = 'none';
    if (okEl) okEl.style.display = 'none';

    if (!newUsername && !newPassword) {
        if (errEl) { errEl.textContent = 'Escribe al menos un campo para actualizar.'; errEl.style.display = 'block'; }
        return;
    }
    if (newUsername && newUsername.length < 3) {
        if (errEl) { errEl.textContent = 'El usuario debe tener al menos 3 caracteres.'; errEl.style.display = 'block'; }
        return;
    }
    if (newPassword && newPassword.length < 6) {
        if (errEl) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; errEl.style.display = 'block'; }
        return;
    }

    if (saveBtn) saveBtn.disabled = true;

    try {
        // Change password via Supabase Auth
        if (newPassword) {
            const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
            if (error) throw new Error(`Contraseña: ${error.message}`);
        }

        // Change username in profiles table
        if (newUsername && newUsername !== myUsername) {
            const { error } = await supabaseClient
                .from('profiles')
                .update({ username: newUsername })
                .eq('id', currentUserId);
            if (error) {
                if (error.code === '23505') throw new Error('Ese nombre de usuario ya está en uso.');
                throw new Error(`Usuario: ${error.message}`);
            }
            myUsername = newUsername;
            updateProfileBadge();
        }

        if (okEl) { okEl.textContent = '✓ Cambios guardados correctamente.'; okEl.style.display = 'block'; }
        const label = document.getElementById('profileCurrentLabel');
        if (label) label.textContent = `Usuario actual: ${myUsername || '—'}`;
    } catch (err) {
        if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

// --- PROFILE BADGE (shows logged-in username in header with profile button) ---
function buildProfileBadge() {
    if (document.getElementById('profileBadge')) return;

    const badge = document.createElement('button');
    badge.id = 'profileBadge';
    badge.style.cssText = `
        display:none;background:rgba(62,207,142,0.15);color:#3ecf8e;border:1px solid #3ecf8e;
        border-radius:20px;padding:4px 10px;font-size:0.75em;font-weight:bold;cursor:pointer;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px;
    `;
    badge.title = 'Mi perfil / Cambiar datos';
    badge.addEventListener('click', openProfileModal);

    // Insert badge into header-actions
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) headerActions.insertBefore(badge, headerActions.firstChild);
}

function updateProfileBadge() {
    buildProfileBadge();
    const badge = document.getElementById('profileBadge');
    if (!badge) return;
    if (myUsername && !isGuest) {
        badge.textContent = `@${myUsername}`;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

// Build profile badge on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildProfileBadge);
} else {
    buildProfileBadge();
}

// --- LOGIN FLOW ---
function finishLogin() {
    hideLockScreen();
    if (typeof refreshCurrentUserId === 'function') refreshCurrentUserId();
    if (typeof loadInitialMessages === 'function') loadInitialMessages();
    if (typeof applyGuestRestrictions === 'function') applyGuestRestrictions();
    updateProfileBadge();
}

async function attemptGuestLogin() {
    if (!lockPasswordInput) return;
    const password = lockPasswordInput.value;
    if (!password) return;
    if (lockSubmitBtn) lockSubmitBtn.disabled = true;
    const { error } = await supabaseClient.auth.signInWithPassword({
        email: CHAT_LOGIN_EMAIL,
        password
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
        invalidateUsernameCache(); // new user should appear in dropdown next time
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
        if (e.key === 'Enter') { e.preventDefault(); attemptGuestLogin(); }
    });
}
if (accountPasswordInput) {
    accountPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); attemptAccountLogin(); }
    });
}
if (registerPasswordInput) {
    registerPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); attemptRegister(); }
    });
}

if (hideChatBtn) {
    hideChatBtn.addEventListener('click', async () => {
        myUsername = null;
        isGuest = true;
        updateProfileBadge();
        showLockScreen();
        await supabaseClient.auth.signOut();
    });
}
