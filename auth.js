(function () {
    'use strict';

    var API_BASE =
        (typeof window !== 'undefined' && window.__EC_API_BASE__) ||
        'https://ec-routine-api.onrender.com/api';
    var MIN_PASSWORD = 8;

    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    var loginPanel = document.getElementById('loginPanel');
    var registerPanel = document.getElementById('registerPanel');
    var heroTitle = document.getElementById('authHeroTitle');
    var heroText = document.getElementById('authHeroText');

    var loginHero = {
        title: 'Entre na sua conta',
        text: 'Organize rotinas, acompanhe o progresso e mantenha o foco no que importa.'
    };
    var registerHero = {
        title: 'Crie sua conta',
        text: 'Apenas leve alguns segundos para começar a treinar sua memória visual e atenção.'
    };

    function lucideRefresh() {
        var lib = typeof lucide !== 'undefined' ? lucide : null;
        if (lib && lib.createIcons) lib.createIcons();
    }

    function isRegisterUrl() {
        if (window.location.pathname.indexOf('/register') !== -1) return true;
        var v = new URLSearchParams(window.location.search).get('view');
        return v === 'register';
    }

    function showLoginView() {
        loginPanel.classList.remove('auth-panel--hidden');
        registerPanel.classList.add('auth-panel--hidden');
        loginPanel.setAttribute('aria-hidden', 'false');
        registerPanel.setAttribute('aria-hidden', 'true');
        heroTitle.textContent = loginHero.title;
        heroText.textContent = loginHero.text;
        document.title = 'EC ROUTINE — Entrar';
        if (window.history && window.history.replaceState) {
            window.history.replaceState({}, '', 'auth.html?view=login');
        }
        lucideRefresh();
    }

    function showRegisterView() {
        registerPanel.classList.remove('auth-panel--hidden');
        loginPanel.classList.add('auth-panel--hidden');
        registerPanel.setAttribute('aria-hidden', 'false');
        loginPanel.setAttribute('aria-hidden', 'true');
        heroTitle.textContent = registerHero.title;
        heroText.textContent = registerHero.text;
        document.title = 'EC ROUTINE — Cadastro';
        if (window.history && window.history.replaceState) {
            window.history.replaceState({}, '', 'auth.html?view=register');
        }
        lucideRefresh();
    }

    function clearText(el) {
        if (el) el.textContent = '';
    }

    function validateEmail(value) {
        return EMAIL_RE.test(String(value || '').trim());
    }

    /** Evita tratar HTML (502, página de erro) como JSON; devolve { ok, data, isHtml }. */
    async function readApiJson(res) {
        var text = await res.text();
        var t = String(text || '').trim();
        if (t.charAt(0) === '<' || t.indexOf('<!DOCTYPE') !== -1) {
            return { ok: res.ok, data: {}, isHtml: true, status: res.status };
        }
        var data = {};
        if (t) {
            try {
                data = JSON.parse(t);
            } catch (e) {}
        }
        return { ok: res.ok, data: data, isHtml: false, status: res.status };
    }

    function setLoginLoading(loading) {
        var btn = document.getElementById('loginSubmit');
        if (!btn) return;
        btn.disabled = !!loading;
        btn.classList.toggle('auth-btn--loading', !!loading);
        btn.setAttribute('aria-busy', loading ? 'true' : 'false');
        var l = btn.querySelector('.auth-btn-loading');
        if (l) l.setAttribute('aria-hidden', loading ? 'false' : 'true');
    }

    function setRegisterLoading(loading) {
        var btn = document.getElementById('registerSubmit');
        if (!btn) return;
        btn.disabled = !!loading;
        btn.classList.toggle('auth-btn--loading', !!loading);
        btn.setAttribute('aria-busy', loading ? 'true' : 'false');
        var l = btn.querySelector('.auth-btn-loading');
        if (l) l.setAttribute('aria-hidden', loading ? 'false' : 'true');
    }

    function persistSession(data) {
        if (data.token) localStorage.setItem('token', data.token);
        if (data.user) {
            if (data.user.name) localStorage.setItem('userName', data.user.name);
            if (data.user.id) localStorage.setItem('userId', data.user.id);
        }
    }

    function readLocalRoutinesForSync() {
        try {
            var raw = localStorage.getItem('localRoutines');
            var parsed = JSON.parse(raw || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function buildRoutinePayload(localRoutine) {
        if (!localRoutine || !localRoutine.title) return null;
        return {
            title: String(localRoutine.title || '').trim(),
            description: localRoutine.description || '',
            tasks: Array.isArray(localRoutine.tasks) ? localRoutine.tasks : [],
            schedule: localRoutine.schedule || {},
            planType: localRoutine.planType || 'daily',
            objectives: localRoutine.objectives || '',
            reasons: localRoutine.reasons || '',
            bulletType: localRoutine.bulletType || 'task',
            context: localRoutine.context || ''
        };
    }

    async function syncLocalRoutinesToServer() {
        var token = localStorage.getItem('token');
        if (!token) return;

        var localRoutines = readLocalRoutinesForSync();
        if (!localRoutines.length) return;

        var syncKey = 'ec_local_sync_done_' + (localStorage.getItem('userId') || 'unknown');
        try {
            if (localStorage.getItem(syncKey) === '1') return;
        } catch (e) {}

        try {
            var existingRes = await fetch(API_BASE + '/routines', {
                headers: { Authorization: 'Bearer ' + token }
            });
            if (!existingRes.ok) return;
            var existingList = await existingRes.json().catch(function () { return []; });
            if (!Array.isArray(existingList)) existingList = [];

            var existingFingerprints = new Set(
                existingList.map(function (r) {
                    return [String(r.title || '').trim().toLowerCase(), String(r.planType || 'daily'), String(r.createdAt || '')].join('|');
                })
            );

            for (var i = 0; i < localRoutines.length; i++) {
                var routine = localRoutines[i];
                var payload = buildRoutinePayload(routine);
                if (!payload || !payload.title) continue;

                var fp = [payload.title.toLowerCase(), String(payload.planType || 'daily'), String(routine.createdAt || '')].join('|');
                if (existingFingerprints.has(fp)) continue;

                var createRes = await fetch(API_BASE + '/routines', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + token
                    },
                    body: JSON.stringify(payload)
                });
                if (createRes.ok) existingFingerprints.add(fp);
            }

            localStorage.removeItem('localRoutines');
            localStorage.setItem(syncKey, '1');
        } catch (e) {
            // Se falhar, mantém localRoutines para tentar novamente no próximo login.
        }
    }

    function redirectDashboard() {
        window.location.href = 'dashboard.html';
    }

    function clearEntryTransitionFlags() {
        try {
            sessionStorage.removeItem('ec_force_daily_onboarding');
            sessionStorage.removeItem('ec_post_login_welcome');
            sessionStorage.removeItem('ec_show_login_boot_loader');
            sessionStorage.removeItem('ec_entry_transition_mode');
            sessionStorage.removeItem('ec_adm_quick_login');
        } catch (e) {}
    }

    function setEntryTransitionFlags(mode, options) {
        var opts = options || {};
        try {
            sessionStorage.setItem('ec_entry_transition_mode', String(mode || 'login'));
            if (opts.showBootLoader) sessionStorage.setItem('ec_show_login_boot_loader', '1');
            else sessionStorage.removeItem('ec_show_login_boot_loader');
            if (opts.forceDaily) sessionStorage.setItem('ec_force_daily_onboarding', '1');
            else sessionStorage.removeItem('ec_force_daily_onboarding');
            if (opts.postLoginWelcome) sessionStorage.setItem('ec_post_login_welcome', '1');
            else sessionStorage.removeItem('ec_post_login_welcome');
        } catch (e) {}
    }

    /** Data de nascimento em falta → página dedicada antes do dashboard. */
    function userNeedsProfileSetup(user) {
        if (!user) return false;
        var bd = user.birthDate;
        if (bd && String(bd).length >= 10) return false;
        var uid = String(user.id || localStorage.getItem('userId') || '');
        try {
            if (uid && localStorage.getItem('ec_profile_onboarding_skip_' + uid) === '1') return false;
        } catch (e) {}
        return true;
    }

    function redirectToProfileSetupFromLogin() {
        clearEntryTransitionFlags();
    setEntryTransitionFlags('login', { showBootLoader: false, forceDaily: true, postLoginWelcome: false });
        window.location.href = 'profile-setup.html';
    }

    function redirectToProfileSetupFromRegister() {
        clearEntryTransitionFlags();
        // Cadastro: se estiver vazio, dashboard mostra boas-vindas; caso contrário, diária.
        setEntryTransitionFlags('register', { showBootLoader: true, forceDaily: true, postLoginWelcome: true });
        window.location.href = 'profile-setup.html';
    }

    /**
     * Login (utilizador que ja tem conta):
     * mostra EC ROUTINE e depois apresentação diária antes do dashboard.
     */
    function redirectAfterLogin() {
        clearEntryTransitionFlags();
    setEntryTransitionFlags('login', { showBootLoader: false, forceDaily: true, postLoginWelcome: false });
        redirectDashboard();
    }

    /**
     * Cadastro (primeiro acesso):
     * ativa boas-vindas de primeiro uso, que pode levar para criar a primeira rotina.
     */
    function redirectAfterRegister() {
        clearEntryTransitionFlags();
        // Cadastro: se estiver vazio, dashboard mostra boas-vindas; caso contrário, diária.
        setEntryTransitionFlags('register', { showBootLoader: true, forceDaily: true, postLoginWelcome: true });
        redirectDashboard();
    }

    async function performLoginWithCredentials(email, password) {
        setLoginLoading(true);
        try {
            var res = await fetch(API_BASE + '/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, password: password })
            });
            var parsed = await readApiJson(res);
            if (parsed.isHtml) {
                document.getElementById('loginFormError').textContent =
                    'O serviço não respondeu como esperado. Tente novamente dentro de momentos.';
                return;
            }
            if (!parsed.ok) {
                var loginErr = (parsed.data && parsed.data.error) || 'Não foi possível entrar.';
                if (parsed.status === 401 && /incorretos/i.test(String(loginErr))) {
                    loginErr +=
                        ' Verifique a palavra-passe (o preenchimento automático do browser pode estar errado). ' +
                        'Se criou a conta em outro sítio (ex.: online vs. no seu PC), use o mesmo sítio e a mesma palavra-passe.';
                }
                document.getElementById('loginFormError').textContent = loginErr;
                return;
            }
            persistSession(parsed.data);
            // Não bloquear a transição visual do login.
            Promise.resolve()
                .then(syncLocalRoutinesToServer)
                .catch(function () {});
            var loginUser = parsed.data && parsed.data.user;
            if (userNeedsProfileSetup(loginUser)) {
                redirectToProfileSetupFromLogin();
                return;
            }
            redirectAfterLogin();
        } catch (err) {
            document.getElementById('loginFormError').textContent = 'Erro de rede. Tente novamente.';
        } finally {
            setLoginLoading(false);
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        clearText(document.getElementById('loginEmailError'));
        clearText(document.getElementById('loginPasswordError'));
        clearText(document.getElementById('loginFormError'));

        var email = (document.getElementById('loginEmail').value || '').trim().toLowerCase();
        var password = document.getElementById('loginPassword').value || '';

        var ok = true;
        if (!email) {
            document.getElementById('loginEmailError').textContent = 'Informe o e-mail.';
            ok = false;
        } else if (!validateEmail(email)) {
            document.getElementById('loginEmailError').textContent =
                'Use o endereço de e-mail completo (ex.: nome@gmail.com), não o seu nome.';
            ok = false;
        }
        if (!password) {
            document.getElementById('loginPasswordError').textContent = 'Informe a senha.';
            ok = false;
        }
        if (!ok) return;
        await performLoginWithCredentials(email, password);
    }

    async function handleRegister(e) {
        e.preventDefault();
        ['regNameError', 'regEmailError', 'regPasswordError', 'regPasswordConfirmError', 'regTermsError', 'registerFormError'].forEach(function (id) {
            clearText(document.getElementById(id));
        });

        var name = (document.getElementById('regName').value || '').trim();
        var email = (document.getElementById('regEmail').value || '').trim().toLowerCase();
        var password = document.getElementById('regPassword').value || '';
        var confirm = document.getElementById('regPasswordConfirm').value || '';
        var terms = document.getElementById('regTerms').checked;

        var ok = true;
        if (!name) {
            document.getElementById('regNameError').textContent = 'Informe o nome completo.';
            ok = false;
        }
        if (!email) {
            document.getElementById('regEmailError').textContent = 'Informe o e-mail.';
            ok = false;
        } else if (!validateEmail(email)) {
            document.getElementById('regEmailError').textContent = 'E-mail inválido.';
            ok = false;
        }
        if (!password) {
            document.getElementById('regPasswordError').textContent = 'Informe a senha.';
            ok = false;
        } else if (password.length < MIN_PASSWORD) {
            document.getElementById('regPasswordError').textContent = 'A senha deve ter pelo menos ' + MIN_PASSWORD + ' caracteres.';
            ok = false;
        }
        if (password !== confirm) {
            document.getElementById('regPasswordConfirmError').textContent = 'As senhas não coincidem.';
            ok = false;
        }
        if (!terms) {
            document.getElementById('regTermsError').textContent = 'Você precisa aceitar os Termos & Condições.';
            ok = false;
        }
        if (!ok) return;

        setRegisterLoading(true);
        try {
            var res = await fetch(API_BASE + '/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, email: email, password: password })
            });
            var parsed = await readApiJson(res);
            if (parsed.isHtml) {
                document.getElementById('registerFormError').textContent =
                    'O serviço não respondeu como esperado. Tente novamente dentro de momentos.';
                return;
            }
            if (!parsed.ok) {
                var regErr = (parsed.data && parsed.data.error) || 'Não foi possível cadastrar.';
                if (String(regErr).toLowerCase().indexOf('já cadastrado') !== -1) {
                    regErr += ' Use «Entrar» com o mesmo e-mail e a palavra-passe desta conta.';
                }
                document.getElementById('registerFormError').textContent = regErr;
                return;
            }
            persistSession(parsed.data);
            // Cadastro também não deve esperar sincronização para transicionar.
            Promise.resolve()
                .then(syncLocalRoutinesToServer)
                .catch(function () {});
            var regUser = parsed.data && parsed.data.user;
            if (userNeedsProfileSetup(regUser)) {
                redirectToProfileSetupFromRegister();
                return;
            }
            redirectAfterRegister();
        } catch (err) {
            document.getElementById('registerFormError').textContent = 'Erro de rede. Tente novamente.';
        } finally {
            setRegisterLoading(false);
        }
    }

    function setupPasswordToggles() {
        document.querySelectorAll('.auth-toggle-password').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-target');
                var input = document.getElementById(id);
                if (!input) return;
                var show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
                var icon = btn.querySelector('i');
                if (icon) {
                    icon.setAttribute('data-lucide', show ? 'eye-off' : 'eye');
                    lucideRefresh();
                }
            });
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        lucideRefresh();
        setupPasswordToggles();

        document.getElementById('loginForm').addEventListener('submit', handleLogin);
        document.getElementById('registerForm').addEventListener('submit', handleRegister);

        document.getElementById('goRegister').addEventListener('click', function () {
            showRegisterView();
        });
        document.getElementById('goLogin').addEventListener('click', function () {
            showLoginView();
        });

        try {
            if (localStorage.getItem('token')) {
                (async function () {
                    try {
                        var tok = localStorage.getItem('token');
                        var res = await fetch(API_BASE + '/profile', {
                            headers: { Authorization: 'Bearer ' + tok }
                        });
                        var data = await res.json().catch(function () {
                            return {};
                        });
                        if (res.ok && data.user && userNeedsProfileSetup(data.user)) {
                            window.location.replace('profile-setup.html');
                            return;
                        }
                    } catch (e0) {}
                    try {
                        clearEntryTransitionFlags();
                        setEntryTransitionFlags('login', { showBootLoader: false, forceDaily: true, postLoginWelcome: false });
                    } catch (e1) {}
                    window.location.replace('dashboard.html');
                })();
                return;
            }
        } catch (e) {}

        var view = new URLSearchParams(window.location.search).get('view');
        if (view === 'login') {
            showLoginView();
        } else if (view === 'register' || isRegisterUrl()) {
            showRegisterView();
        } else {
            showLoginView();
        }
    });
})();
