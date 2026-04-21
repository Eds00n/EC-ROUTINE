(function () {
    'use strict';

    var API_BASE =
        (typeof window !== 'undefined' && window.__EC_API_BASE__) ||
        'https://ec-routine-api.onrender.com/api';

    function el(id) {
        return document.getElementById(id);
    }

    function show(elm, on) {
        if (!elm) return;
        elm.classList.toggle('hidden', !on);
    }

    async function fetchAdminSummary() {
        var token = '';
        try {
            token = String(localStorage.getItem('token') || '').trim();
        } catch (e) {
            token = '';
        }
        if (!token) {
            window.location.replace('auth.html?view=login');
            return;
        }
        var res = await fetch(API_BASE + '/admin/summary', {
            headers: { Authorization: 'Bearer ' + token }
        });
        var data = {};
        try {
            data = await res.json();
        } catch (e) {
            data = {};
        }
        return { ok: res.ok, status: res.status, data: data };
    }

    function renderSummary(data) {
        var gen = el('adminGeneratedAt');
        if (gen && data.generatedAt) {
            try {
                gen.textContent = 'Dados: ' + new Date(data.generatedAt).toLocaleString('pt-BR');
            } catch (e) {
                gen.textContent = '';
            }
        }
        var map = [
            ['statUsers', data.usersCount],
            ['statRoutines', data.routinesCount],
            ['statUsers7d', data.usersCreatedLast7Days],
            ['statRoutines7d', data.routinesUpdatedLast7Days],
            ['statAttachments', data.attachmentsCount]
        ];
        map.forEach(function (pair) {
            var node = el(pair[0]);
            if (node) node.textContent = pair[1] != null ? String(pair[1]) : '—';
        });
        show(el('adminStats'), true);
    }

    async function load() {
        show(el('adminError'), false);
        show(el('adminDeniedHint'), false);
        show(el('adminStats'), false);
        try {
            var out = await fetchAdminSummary();
            if (out.status === 401 || out.status === 403) {
                var errEl = el('adminError');
                if (errEl) {
                    errEl.textContent =
                        out.data && out.data.error
                            ? String(out.data.error)
                            : out.status === 403
                              ? 'Acesso negado (não é administrador).'
                              : 'Sessão inválida.';
                    show(errEl, true);
                }
                if (out.status === 403) show(el('adminDeniedHint'), true);
                return;
            }
            if (!out.ok) {
                var e2 = el('adminError');
                if (e2) {
                    e2.textContent = (out.data && out.data.error) || 'Erro ao carregar estatísticas.';
                    show(e2, true);
                }
                return;
            }
            renderSummary(out.data || {});
        } catch (err) {
            var e3 = el('adminError');
            if (e3) {
                e3.textContent = 'Erro de rede. Tente novamente.';
                show(e3, true);
            }
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        var btn = el('adminBtnRefresh');
        if (btn) btn.addEventListener('click', load);
        load();
    });
})();
