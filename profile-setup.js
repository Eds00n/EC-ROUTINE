(function () {
    'use strict';

    var API_BASE =
        (typeof window !== 'undefined' && window.__EC_API_BASE__) ||
        'https://ec-routine-api.onrender.com/api';
    var MAX_UPLOAD = 20 * 1024 * 1024;
    var DASHBOARD_CARDS_URL = 'dashboard.html?view=cards';

    function getApiBaseUrl() {
        return String(API_BASE || '').replace(/\/api\/?$/, '') || '';
    }

    function showErr(msg) {
        var el = document.getElementById('psFormError');
        if (el) el.textContent = msg || '';
    }

    function showErrPhoto(msg) {
        var el = document.getElementById('psFormErrorPhoto');
        if (el) el.textContent = msg || '';
    }

    function showPhotoStepAfterSave() {
        var stepEdit = document.getElementById('psStepEdit');
        var stepPhoto = document.getElementById('psStepPhoto');
        var title = document.querySelector('#psMain .auth-card-title');
        var lead = document.getElementById('psCardLead');
        if (title) title.textContent = 'Foto de perfil';
        if (lead) {
            lead.textContent = 'Opcional: envie uma imagem ou avance para a grelha de rotinas.';
            lead.classList.remove('hidden');
        }
        if (stepEdit) stepEdit.classList.add('hidden');
        if (stepPhoto) stepPhoto.classList.remove('hidden');
        showErr('');
        showErrPhoto('');
        try {
            document.getElementById('psBtnPhoto').focus();
        } catch (e) {}
    }

    function readSkip(uid) {
        try {
            return uid && localStorage.getItem('ec_profile_onboarding_skip_' + uid) === '1';
        } catch (e) {
            return false;
        }
    }

    function profileComplete(user) {
        var bd = user && user.birthDate;
        return !!(bd && String(bd).length >= 10);
    }

    async function fetchApi(path, opts) {
        var token = localStorage.getItem('token');
        var headers = Object.assign({ 'Content-Type': 'application/json' }, (opts && opts.headers) || {});
        if (token) headers.Authorization = 'Bearer ' + token;
        var res = await fetch(API_BASE + path, Object.assign({}, opts || {}, { headers: headers }));
        var text = await res.text();
        var t = String(text || '').trim();
        var isHtml = t.charAt(0) === '<' || t.indexOf('<!DOCTYPE') !== -1;
        var data = {};
        if (!isHtml && t) {
            try {
                data = JSON.parse(t);
            } catch (e) {}
        }
        return { ok: res.ok, status: res.status, data: data, isHtml: isHtml };
    }

    async function putProfile(bodyObj) {
        return await fetchApi('/profile', {
            method: 'PUT',
            body: JSON.stringify(bodyObj)
        });
    }

    function profileSaveErrorMessage(out) {
        var st = out && out.status;
        var d = out && out.data && out.data.error;
        if (st === 404) {
            if (d) {
                return String(d);
            }
            return 'O servidor devolveu 404 em /api/profile (rota em falta ou URL da API errada). Confirme o deploy na Render com GET e PUT /api/profile, ou o URL em api-base / meta ec-api-base.';
        }
        if (st === 401 || st === 403) {
            return 'Sessão inválida ou expirada. Volte ao login.';
        }
        return d || ('Não foi possível guardar' + (st ? ' (' + st + ').' : '.'));
    }

    function goDashboard() {
        window.location.replace(DASHBOARD_CARDS_URL);
    }

    function goAuth() {
        try {
            localStorage.removeItem('token');
            localStorage.removeItem('userName');
            localStorage.removeItem('userId');
        } catch (e) {}
        window.location.replace('auth.html?view=login');
    }

    function showOfflinePanel() {
        var loading = document.getElementById('psLoading');
        var offline = document.getElementById('psOffline');
        if (loading) loading.classList.add('hidden');
        if (offline) offline.classList.remove('hidden');
        var b1 = document.getElementById('psBtnOfflineDash');
        var b2 = document.getElementById('psBtnOfflineAuth');
        if (b1)
            b1.onclick = function () {
                goDashboard();
            };
        if (b2)
            b2.onclick = function () {
                goAuth();
            };
    }

    document.addEventListener('DOMContentLoaded', async function () {
        var token = localStorage.getItem('token');
        if (!token) {
            goAuth();
            return;
        }

        var uid = localStorage.getItem('userId');
        if (readSkip(uid)) {
            goDashboard();
            return;
        }

        var loading = document.getElementById('psLoading');
        var main = document.getElementById('psMain');

        var user = null;

        /* Só /verify: evita GET /api/profile (404 no consola se a API ainda não tiver essa rota). */
        try {
            var vr = await fetchApi('/verify', { method: 'GET' });
            if (vr.ok && vr.data && vr.data.user) {
                user = vr.data.user;
            } else if (vr.status === 401 || vr.status === 403) {
                goAuth();
                return;
            } else {
                showOfflinePanel();
                return;
            }
        } catch (e) {
            showOfflinePanel();
            return;
        }

        if (!user) {
            showOfflinePanel();
            return;
        }

        if (profileComplete(user)) {
            goDashboard();
            return;
        }

        if (loading) loading.classList.add('hidden');
        if (main) main.classList.remove('hidden');

        var n = document.getElementById('psName');
        var s = document.getElementById('psSexuality');
        var b = document.getElementById('psBirth');
        if (n) n.value = user.name || '';
        if (s) s.value = user.sexuality || '';
        if (b) b.value = user.birthDate || '';

        var btnPhoto = document.getElementById('psBtnPhoto');
        var inputPhoto = document.getElementById('psPhotoInput');
        if (btnPhoto && inputPhoto) {
            btnPhoto.addEventListener('click', function () {
                inputPhoto.click();
            });
            inputPhoto.addEventListener('change', async function () {
                var f = inputPhoto.files && inputPhoto.files[0];
                inputPhoto.value = '';
                if (!f) return;
                if (f.size > MAX_UPLOAD) {
                    showErrPhoto('Imagem demasiado grande (máx. 20 MB).');
                    return;
                }
                showErrPhoto('');
                try {
                    var fd = new FormData();
                    fd.append('file', f);
                    var res = await fetch(getApiBaseUrl() + '/api/uploads', {
                        method: 'POST',
                        headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
                        body: fd
                    });
                    var j = await res.json().catch(function () {
                        return {};
                    });
                    if (!res.ok) throw new Error(j.error || 'Falha no upload');
                    var putPic = await putProfile({ picture: j.url || '' });
                    if (!putPic.ok) {
                        showErrPhoto(profileSaveErrorMessage(putPic));
                        return;
                    }
                    showErrPhoto('');
                    goDashboard();
                } catch (err) {
                    showErrPhoto(String((err && err.message) || 'Erro ao enviar foto'));
                }
            });
        }

        var btnGoDash = document.getElementById('psBtnGoDash');
        if (btnGoDash) {
            btnGoDash.addEventListener('click', function () {
                goDashboard();
            });
        }

        document.getElementById('psBtnSave').addEventListener('click', async function () {
            var name = (document.getElementById('psName').value || '').trim();
            var birth = (document.getElementById('psBirth').value || '').trim();
            var sex = (document.getElementById('psSexuality').value || '').trim();
            showErr('');
            if (!name) {
                showErr('Indique o nome.');
                return;
            }
            if (!birth) {
                showErr('Indique a data de nascimento.');
                return;
            }
            try {
                var out = await putProfile({ name: name, sexuality: sex, birthDate: birth });
                if (!out.ok) {
                    var hint =
                        out.status === 404
                            ? ' Pode usar «Agora não» para entrar na app e tentar depois do deploy.'
                            : ' Pode usar «Agora não» para ir à grelha de rotinas e tentar mais tarde.';
                    showErr(profileSaveErrorMessage(out) + hint);
                    return;
                }
                localStorage.setItem('userName', name);
                showPhotoStepAfterSave();
            } catch (err) {
                showErr(String((err && err.message) || 'Erro de rede ao guardar.'));
            }
        });

        document.getElementById('psBtnLater').addEventListener('click', function () {
            try {
                if (uid) localStorage.setItem('ec_profile_onboarding_skip_' + uid, '1');
            } catch (e2) {}
            goDashboard();
        });
    });
})();
