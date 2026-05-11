/**
 * Perfil no header + modal (tema, números dos dias, edição, logout).
 * Usado em páginas que não carregam dashboard.js (ex.: routine-detail).
 */
(function () {
    'use strict';

    var EC_ROUTINE_THEME_KEY = 'ecRoutineTheme';
    var EC_ROUTINE_DAY_NUMBERS_KEY = 'ecRoutineShowDayNumbers';
    var API_URL =
        (typeof window !== 'undefined' && window.__EC_API_BASE__) ||
        'https://ec-routine-api.onrender.com/api';
    var MAX_UPLOAD_FILE_SIZE = 20 * 1024 * 1024;

    function getApiBaseUrl() {
        if (typeof API_URL !== 'string') return '';
        return API_URL.replace(/\/api\/?$/, '') || '';
    }

    async function ecApiRequest(endpoint, options) {
        var token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        var headers = Object.assign(
            { 'Content-Type': 'application/json' },
            (options && options.headers) || {}
        );
        if (token) headers.Authorization = 'Bearer ' + token;
        var response = await fetch(API_URL + endpoint, Object.assign({}, options || {}, { headers: headers }));
        var contentType = response.headers.get('content-type');
        var data;
        if (contentType && contentType.indexOf('application/json') !== -1) {
            data = await response.json();
        } else {
            var text = await response.text();
            throw new Error(text || 'Erro na requisição');
        }
        if (!response.ok) throw new Error((data && data.error) || 'Erro na requisição');
        return data;
    }

    function getEcRoutineShowDayNumbers() {
        try {
            var v = localStorage.getItem(EC_ROUTINE_DAY_NUMBERS_KEY);
            return v !== '0' && v !== 'false';
        } catch (e) {
            return true;
        }
    }

    function syncUserProfileDayNumbersToggle() {
        var btn = document.getElementById('userProfileDayNumbersToggle');
        if (!btn) return;
        var show = getEcRoutineShowDayNumbers();
        btn.setAttribute('aria-checked', show ? 'true' : 'false');
        btn.setAttribute(
            'aria-label',
            show
                ? 'Números dos dias visíveis. Clicar para ocultar.'
                : 'Números dos dias ocultos. Clicar para mostrar.'
        );
        btn.title = show ? 'Ocultar números dos dias' : 'Mostrar números dos dias';
        var host = document.getElementById('userProfileDayNumbersToggleIconHost');
        if (host) {
            var iconName = show ? 'calendar-days' : 'eye-off';
            host.innerHTML =
                '<i data-lucide="' +
                iconName +
                '" class="user-profile-theme-toggle__lucide" aria-hidden="true"></i>';
            var lucideLib = typeof lucide !== 'undefined' ? lucide : typeof Lucide !== 'undefined' ? Lucide : null;
            if (lucideLib && lucideLib.createIcons) lucideLib.createIcons();
        }
    }

    function setEcRoutineShowDayNumbers(show) {
        try {
            localStorage.setItem(EC_ROUTINE_DAY_NUMBERS_KEY, show ? '1' : '0');
        } catch (e) {}
        var root = document.documentElement;
        if (show) root.removeAttribute('data-ec-day-numbers');
        else root.setAttribute('data-ec-day-numbers', 'off');
        syncUserProfileDayNumbersToggle();
    }

    function closeUserProfileSettingsMenu() {
        var menu = document.getElementById('userProfileSettingsMenu');
        var btn = document.getElementById('userProfileSettingsBtn');
        if (menu) menu.classList.add('hidden');
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    function getEcRoutineTheme() {
        try {
            return localStorage.getItem(EC_ROUTINE_THEME_KEY) === 'dark' ? 'dark' : 'light';
        } catch (e) {
            return 'light';
        }
    }

    function applyEcRoutineTheme(theme) {
        var root = document.documentElement;
        if (theme === 'dark') root.setAttribute('data-theme', 'dark');
        else root.removeAttribute('data-theme');
        try {
            localStorage.setItem(EC_ROUTINE_THEME_KEY, theme);
        } catch (e) {}
        syncEcRoutineThemeToggle();
    }

    function applyEcRoutineThemeFromStorage() {
        var root = document.documentElement;
        try {
            if (localStorage.getItem(EC_ROUTINE_THEME_KEY) === 'dark') root.setAttribute('data-theme', 'dark');
            else root.removeAttribute('data-theme');
        } catch (e) {
            root.removeAttribute('data-theme');
        }
        syncEcRoutineThemeToggle();
    }

    function syncEcRoutineThemeToggle() {
        var btn = document.getElementById('userProfileThemeToggle');
        if (!btn) return;
        var dark = getEcRoutineTheme() === 'dark';
        btn.setAttribute('aria-checked', dark ? 'true' : 'false');
        btn.setAttribute(
            'aria-label',
            dark ? 'Tema escuro ativo. Clicar para tema claro.' : 'Tema claro ativo. Clicar para tema escuro.'
        );
        btn.title = dark ? 'Tema escuro' : 'Tema claro';
        var host = document.getElementById('userProfileThemeToggleIconHost');
        if (host) {
            var iconName = dark ? 'moon' : 'sun';
            host.innerHTML =
                '<i data-lucide="' +
                iconName +
                '" class="user-profile-theme-toggle__lucide" aria-hidden="true"></i>';
            var lucideLib = typeof lucide !== 'undefined' ? lucide : typeof Lucide !== 'undefined' ? Lucide : null;
            if (lucideLib && lucideLib.createIcons) lucideLib.createIcons();
        }
    }

    function getAttachmentFullUrl(url) {
        if (!url || typeof url !== 'string') return '';
        if (url.indexOf('http') === 0 || url.indexOf('data:') === 0) return url;
        return getApiBaseUrl() + (url.indexOf('/') === 0 ? '' : '/') + url;
    }

    function getAvatarImageUrl(raw) {
        if (!raw || typeof raw !== 'string') return '';
        var u = raw.trim();
        if (!u) return '';
        var low = u.toLowerCase();
        if (low.indexOf('/api/profile') !== -1) return '';
        if (low.indexOf('/api/verify') !== -1) return '';
        if (low.indexOf('/api/login') !== -1) return '';
        if (low.indexOf('/api/register') !== -1) return '';
        if (low.indexOf('/api/routines') !== -1) return '';
        if (low.indexOf('/api/') !== -1 && low.indexOf('/api/attachments/') === -1) return '';
        var isAbsolute = low.indexOf('http://') === 0 || low.indexOf('https://') === 0 || low.indexOf('data:') === 0;
        var hasAttachmentPath =
            low.indexOf('/api/attachments/') !== -1 ||
            low.indexOf('/attachments/') !== -1 ||
            low.indexOf('attachments/') === 0;
        var looksLikeImageFile = /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(u);
        if (!isAbsolute && !hasAttachmentPath && !looksLikeImageFile) return '';
        return getAttachmentFullUrl(u);
    }

    var _avatarObjectUrlBySlot = { header: null, modal: null };

    function revokeAvatarObjectUrl(slot) {
        var prev = _avatarObjectUrlBySlot[slot];
        if (prev) {
            try {
                URL.revokeObjectURL(prev);
            } catch (e) {}
            _avatarObjectUrlBySlot[slot] = null;
        }
    }

    function avatarUrlRequiresAuthFetch(fullUrl) {
        if (!fullUrl || typeof fullUrl !== 'string') return false;
        if (fullUrl.indexOf('data:') === 0) return false;
        try {
            var path = fullUrl.indexOf('://') !== -1 ? new URL(fullUrl).pathname : fullUrl;
            return path.indexOf('/api/attachments/') !== -1;
        } catch (e) {
            return fullUrl.indexOf('/api/attachments/') !== -1;
        }
    }

    function applyAvatarPicture(slot, picture) {
        var ids =
            slot === 'header'
                ? { img: 'headerUserAvatarImg', fall: 'headerUserAvatarFall' }
                : { img: 'profileModalAvatar', fall: 'profileModalAvatarFall' };
        var img = document.getElementById(ids.img);
        var fall = document.getElementById(ids.fall);
        if (!img || !fall) return;
        revokeAvatarObjectUrl(slot);
        var full = getAvatarImageUrl(picture);
        if (!picture || !full) {
            img.classList.add('hidden');
            fall.classList.remove('hidden');
            img.removeAttribute('src');
            return;
        }
        function showFallback() {
            img.classList.add('hidden');
            fall.classList.remove('hidden');
            img.removeAttribute('src');
        }
        function showImg() {
            img.classList.remove('hidden');
            fall.classList.add('hidden');
        }
        if (!avatarUrlRequiresAuthFetch(full)) {
            img.onerror = function () {
                showFallback();
                img.removeAttribute('src');
            };
            img.onload = function () {
                showImg();
            };
            img.src = full;
            return;
        }
        var tok = localStorage.getItem('token');
        if (!tok) {
            showFallback();
            return;
        }
        img.onload = null;
        img.onerror = null;
        var avatarFetchOpts = { headers: { Authorization: 'Bearer ' + tok } };
        fetch(full, avatarFetchOpts)
            .then(function (res) {
                if (!res.ok) throw new Error('avatar');
                return res.blob();
            })
            .then(function (blob) {
                if (!blob || blob.size === 0) throw new Error('empty');
                var ou = URL.createObjectURL(blob);
                _avatarObjectUrlBySlot[slot] = ou;
                img.onerror = function () {
                    revokeAvatarObjectUrl(slot);
                    showFallback();
                    img.removeAttribute('src');
                };
                img.onload = function () {
                    showImg();
                };
                img.src = ou;
            })
            .catch(function () {
                showFallback();
            });
    }

    function showToast(message, durationMs) {
        var container = document.getElementById('notificationContainer');
        if (!container) return;
        var el = document.createElement('div');
        el.className = 'saved-toast';
        el.setAttribute('role', 'status');
        el.textContent = message;
        container.appendChild(el);
        setTimeout(function () {
            el.classList.add('saved-toast-out');
            setTimeout(function () {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, 300);
        }, durationMs || 3500);
    }

    var _profileState = { open: false, edit: false, last: null, loadGeneration: 0 };

    function formatProfileAgeFromBirth(iso) {
        if (!iso) return '—';
        try {
            var p = String(iso).trim().split('-');
            if (p.length < 3) return '—';
            var y = parseInt(p[0], 10);
            var m = parseInt(p[1], 10) - 1;
            var d = parseInt(p[2], 10);
            if (!isFinite(y) || !isFinite(m) || !isFinite(d)) return '—';
            var birth = new Date(y, m, d);
            if (isNaN(birth.getTime())) return '—';
            var today = new Date();
            var age = today.getFullYear() - birth.getFullYear();
            var md = today.getMonth() - birth.getMonth();
            if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age--;
            if (age < 0 || age > 130) return '—';
            return String(age);
        } catch (e) {
            return '—';
        }
    }

    function setProfileStatValue(el, rawNum) {
        if (!el) return;
        var n = rawNum != null && rawNum !== '' ? Number(rawNum) : 0;
        if (isNaN(n)) n = 0;
        if (n === 0) {
            el.textContent = 'Comece agora';
            el.classList.add('user-profile-stat-value--zero');
        } else {
            el.textContent = String(Math.round(n));
            el.classList.remove('user-profile-stat-value--zero');
        }
    }

    function sexualityLabel(code) {
        var m = {
            '': 'Prefiro não informar',
            homem: 'Masculino',
            mulher: 'Feminino',
            outro: 'Outro',
            nao_binario: 'Não-binário'
        };
        return m[code] || (code ? String(code) : '—');
    }

    function setHeaderAvatar(picture) {
        applyAvatarPicture('header', picture);
    }

    function setModalAvatar(picture) {
        applyAvatarPicture('modal', picture);
    }

    function openUserProfileModal() {
        var modal = document.getElementById('userProfileModal');
        var trig = document.getElementById('headerProfileTrigger');
        if (!modal) return;
        closeUserProfileSettingsMenu();
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        if (trig) trig.setAttribute('aria-expanded', 'true');
        _profileState.open = true;
        document.body.style.overflow = 'hidden';
        syncEcRoutineThemeToggle();
        syncUserProfileDayNumbersToggle();
        loadUserProfileIntoModal();
    }

    function closeUserProfileModal() {
        var modal = document.getElementById('userProfileModal');
        var trig = document.getElementById('headerProfileTrigger');
        if (!modal) return;
        closeUserProfileSettingsMenu();
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        if (trig) trig.setAttribute('aria-expanded', 'false');
        _profileState.open = false;
        _profileState.edit = false;
        setProfileModalMode(false);
        document.body.style.overflow = '';
    }

    function setProfileModalMode(edit) {
        _profileState.edit = !!edit;
        var v = document.getElementById('userProfileViewMode');
        var e = document.getElementById('userProfileEditMode');
        if (v) v.classList.toggle('hidden', !!edit);
        if (e) e.classList.toggle('hidden', !edit);
    }

    function syncProfileAdminButton(user) {
        var show = !!(user && user.isAdmin === true);
        ['profileBtnAdmin', 'headerAdminBtn'].forEach(function (id) {
            var btn = document.getElementById(id);
            if (!btn) return;
            if (show) {
                btn.classList.remove('hidden');
                btn.removeAttribute('hidden');
                btn.setAttribute('aria-hidden', 'false');
            } else {
                btn.classList.add('hidden');
                btn.setAttribute('hidden', 'hidden');
                btn.setAttribute('aria-hidden', 'true');
            }
        });
    }

    function applyProfileModalData(data, prevUserSnap) {
        var du = data.user;
        var raw = du || {};
        var u = Object.assign({}, raw);
        var prev = prevUserSnap || null;
        if (prev && prev.isAdmin === true && du && !Object.prototype.hasOwnProperty.call(du, 'isAdmin')) {
            u.isAdmin = true;
            du.isAdmin = true;
        }
        var s = data.stats || {};
        var displayName = (u.name && String(u.name).trim()) || '—';
        var em = document.getElementById('profileModalEmail');
        if (em) em.textContent = u.email || '';
        var ht = document.getElementById('userProfileModalTitle');
        if (ht) ht.textContent = displayName;
        var vn = document.getElementById('profileViewName');
        if (vn) vn.textContent = displayName;
        var vs = document.getElementById('profileViewSexuality');
        if (vs) vs.textContent = sexualityLabel(u.sexuality);
        var va = document.getElementById('profileViewAge');
        if (va) va.textContent = formatProfileAgeFromBirth(u.birthDate);
        setProfileStatValue(document.getElementById('profileStatTasks'), s.tasksTotal);
        setProfileStatValue(document.getElementById('profileStatRoutines'), s.routinesCount);
        setProfileStatValue(document.getElementById('profileStatSeqActive'), s.activeSequences);
        setProfileStatValue(document.getElementById('profileStatSeqMax'), s.maxStreak);
        setModalAvatar(u.picture);
        var en = document.getElementById('profileEditName');
        if (en) en.value = u.name || '';
        var es = document.getElementById('profileEditSexuality');
        if (es) es.value = u.sexuality || '';
        var eb = document.getElementById('profileEditBirth');
        if (eb) eb.value = u.birthDate || '';
        syncProfileAdminButton(u);
        try {
            var modal = document.getElementById('userProfileModal');
            if (modal && !modal.classList.contains('hidden')) {
                var lucideLib = typeof lucide !== 'undefined' ? lucide : typeof Lucide !== 'undefined' ? Lucide : null;
                if (lucideLib && lucideLib.createIcons) lucideLib.createIcons({ attrs: { 'stroke-width': 1.75 } });
            }
        } catch (e) {}
    }

    async function loadUserProfileIntoModal() {
        var token = localStorage.getItem('token');
        if (!token) return Promise.resolve();
        var gen = ++_profileState.loadGeneration;
        var prevUserSnap =
            _profileState.last && _profileState.last.user ? Object.assign({}, _profileState.last.user) : null;
        try {
            var data = await ecApiRequest('/profile');
            if (gen !== _profileState.loadGeneration) return;
            _profileState.last = data;
            applyProfileModalData(data, prevUserSnap);
        } catch (err) {
            try {
                var alt = await ecApiRequest('/verify');
                if (gen !== _profileState.loadGeneration) return;
                if (alt && alt.user) {
                    var prev = (_profileState.last && _profileState.last.stats) || {};
                    var merged = {
                        user: alt.user,
                        stats: {
                            tasksTotal: prev.tasksTotal != null ? prev.tasksTotal : 0,
                            routinesCount: prev.routinesCount != null ? prev.routinesCount : 0,
                            activeSequences: prev.activeSequences != null ? prev.activeSequences : 0,
                            maxStreak: prev.maxStreak != null ? prev.maxStreak : 0
                        }
                    };
                    _profileState.last = merged;
                    applyProfileModalData(merged, prevUserSnap);
                    return;
                }
            } catch (e2) {}
            if (gen !== _profileState.loadGeneration) return;
            showToast(String((err && err.message) || 'Não foi possível carregar o perfil'), 5000);
        }
    }

    async function hydrateEcRoutineHeaderProfile() {
        var nameEl = document.getElementById('username');
        var token = localStorage.getItem('token');
        if (!token) {
            setHeaderAvatar('');
            syncProfileAdminButton(null);
            if (nameEl) {
                var n = localStorage.getItem('userName');
                if (n) nameEl.textContent = String(n).toUpperCase();
            }
            return;
        }
        try {
            var data = await ecApiRequest('/verify');
            if (data && data.user) {
                if (data.user.name && nameEl) nameEl.textContent = String(data.user.name).toUpperCase();
                try {
                    localStorage.setItem('userName', data.user.name);
                } catch (e) {}
                setHeaderAvatar(data.user.picture);
                syncProfileAdminButton(data.user);
            }
        } catch (e) {
            setHeaderAvatar('');
            if (nameEl) {
                var n2 = localStorage.getItem('userName');
                if (n2) nameEl.textContent = String(n2).toUpperCase();
            }
        }
    }

    function setupUserProfileModal() {
        var trig = document.getElementById('headerProfileTrigger');
        var modal = document.getElementById('userProfileModal');
        var overlay = document.getElementById('userProfileOverlay');
        var themeToggle = document.getElementById('userProfileThemeToggle');
        var settingsBtn = document.getElementById('userProfileSettingsBtn');
        var settingsMenu = document.getElementById('userProfileSettingsMenu');
        var panel = document.getElementById('userProfilePanel');
        var dayNumbersToggle = document.getElementById('userProfileDayNumbersToggle');
        var closeBtn = document.getElementById('userProfileClose');
        var btnEdit = document.getElementById('profileBtnEdit');
        var btnAdmin = document.getElementById('profileBtnAdmin');
        var btnHeaderAdmin = document.getElementById('headerAdminBtn');
        var btnPhoto = document.getElementById('profileBtnPhoto');
        var btnSave = document.getElementById('profileBtnSave');
        var btnCancel = document.getElementById('profileBtnCancelEdit');
        var inputPhoto = document.getElementById('profilePhotoInput');

        if (trig && modal) {
            trig.addEventListener('click', function () {
                openUserProfileModal();
            });
            trig.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    openUserProfileModal();
                }
            });
        }
        if (overlay) overlay.addEventListener('click', closeUserProfileModal);
        if (closeBtn) closeBtn.addEventListener('click', closeUserProfileModal);
        if (settingsBtn && settingsMenu) {
            settingsBtn.addEventListener('click', function (ev) {
                ev.stopPropagation();
                settingsMenu.classList.toggle('hidden');
                settingsBtn.setAttribute(
                    'aria-expanded',
                    settingsMenu.classList.contains('hidden') ? 'false' : 'true'
                );
            });
        }
        if (panel && settingsMenu && settingsBtn) {
            panel.addEventListener('click', function (ev) {
                if (settingsMenu.classList.contains('hidden')) return;
                if (settingsBtn.contains(ev.target) || settingsMenu.contains(ev.target)) return;
                closeUserProfileSettingsMenu();
            });
        }
        if (themeToggle) {
            themeToggle.addEventListener('click', function (ev) {
                ev.stopPropagation();
                applyEcRoutineTheme(getEcRoutineTheme() === 'dark' ? 'light' : 'dark');
            });
        }
        if (dayNumbersToggle) {
            dayNumbersToggle.addEventListener('click', function (ev) {
                ev.stopPropagation();
                setEcRoutineShowDayNumbers(!getEcRoutineShowDayNumbers());
            });
        }
        syncEcRoutineThemeToggle();
        syncUserProfileDayNumbersToggle();
        if (btnEdit) {
            btnEdit.addEventListener('click', async function () {
                await loadUserProfileIntoModal();
                setProfileModalMode(true);
            });
        }
        function goAdminPanel() {
            window.location.href = getApiBaseUrl() + '/admin';
        }
        if (btnAdmin) {
            btnAdmin.addEventListener('click', goAdminPanel);
        }
        if (btnHeaderAdmin) {
            btnHeaderAdmin.addEventListener('click', goAdminPanel);
        }
        if (btnCancel) btnCancel.addEventListener('click', function () {
            setProfileModalMode(false);
        });
        if (btnSave) {
            btnSave.addEventListener('click', async function () {
                var tok = localStorage.getItem('token');
                if (!tok) return;
                try {
                    var body = {
                        name:
                            (document.getElementById('profileEditName') &&
                                document.getElementById('profileEditName').value.trim()) ||
                            '',
                        sexuality:
                            (document.getElementById('profileEditSexuality') &&
                                document.getElementById('profileEditSexuality').value) ||
                            '',
                        birthDate:
                            (document.getElementById('profileEditBirth') &&
                                document.getElementById('profileEditBirth').value) ||
                            ''
                    };
                    var out = await ecApiRequest('/profile', { method: 'PUT', body: JSON.stringify(body) });
                    if (out.user) {
                        if (!_profileState.last) _profileState.last = {};
                        _profileState.last.user = Object.assign({}, _profileState.last.user || {}, out.user);
                        var nameEl = document.getElementById('username');
                        if (nameEl && out.user.name) nameEl.textContent = out.user.name.toUpperCase();
                        try {
                            localStorage.setItem('userName', out.user.name);
                        } catch (e) {}
                        setHeaderAvatar(out.user.picture);
                    }
                    showToast('Perfil atualizado', 3000);
                    await loadUserProfileIntoModal();
                    setProfileModalMode(false);
                } catch (err) {
                    showToast(String((err && err.message) || 'Erro ao guardar'), 5000);
                }
            });
        }
        var btnLogout = document.getElementById('profileBtnLogout');
        if (btnLogout) {
            btnLogout.addEventListener('click', function () {
                try {
                    localStorage.removeItem('token');
                    localStorage.removeItem('userName');
                    localStorage.removeItem('userId');
                    localStorage.removeItem('ecRoutineSyncQueue');
                } catch (e) {}
                try {
                    window._syncQueue = [];
                } catch (e2) {}
                window.location.replace('auth.html?view=login');
            });
        }
        if (btnPhoto && inputPhoto) {
            btnPhoto.addEventListener('click', function () {
                inputPhoto.click();
            });
            inputPhoto.addEventListener('change', async function () {
                var f = inputPhoto.files && inputPhoto.files[0];
                inputPhoto.value = '';
                if (!f) return;
                if (f.size > MAX_UPLOAD_FILE_SIZE) {
                    showToast('Imagem demasiado grande (máx. 20 MB)', 5000);
                    return;
                }
                var tok2 = localStorage.getItem('token');
                if (!tok2) return;
                try {
                    var fd = new FormData();
                    fd.append('file', f);
                    var base = getApiBaseUrl();
                    var res = await fetch(base + '/api/uploads', {
                        method: 'POST',
                        headers: { Authorization: 'Bearer ' + tok2 },
                        body: fd
                    });
                    var j = await res.json().catch(function () {
                        return {};
                    });
                    if (!res.ok) throw new Error(j.error || 'Falha no upload');
                    var urlPath = typeof j.url === 'string' ? j.url.trim() : '';
                    if (!urlPath || urlPath.indexOf('/api/attachments/') === -1) {
                        throw new Error(
                            (j && j.error) || 'O servidor não devolveu o endereço do ficheiro. Tente outra vez.'
                        );
                    }
                    var out2 = await ecApiRequest('/profile', {
                        method: 'PUT',
                        body: JSON.stringify({ picture: urlPath })
                    });
                    if (out2.user) {
                        if (!_profileState.last) _profileState.last = {};
                        _profileState.last.user = Object.assign({}, _profileState.last.user || {}, out2.user);
                        setHeaderAvatar(out2.user.picture);
                        setModalAvatar(out2.user.picture);
                    }
                    showToast('Foto atualizada', 3000);
                } catch (err) {
                    showToast(String((err && err.message) || 'Erro ao enviar foto'), 5000);
                }
            });
        }

        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' && _profileState.open) closeUserProfileModal();
        });
    }

    function bootEcRoutineProfileUI() {
        applyEcRoutineThemeFromStorage();
        var show = getEcRoutineShowDayNumbers();
        var root = document.documentElement;
        if (show) root.removeAttribute('data-ec-day-numbers');
        else root.setAttribute('data-ec-day-numbers', 'off');
        setupUserProfileModal();
        try {
            var L = typeof lucide !== 'undefined' ? lucide : typeof Lucide !== 'undefined' ? Lucide : null;
            if (L && L.createIcons) L.createIcons({ attrs: { 'stroke-width': 1.75 } });
        } catch (e) {}
        hydrateEcRoutineHeaderProfile();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootEcRoutineProfileUI);
    } else {
        bootEcRoutineProfileUI();
    }
})();
