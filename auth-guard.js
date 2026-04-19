/**
 * Exige sessão (token) para páginas do app. Sem token válido → auth.html?view=login.
 * Não corre em páginas de autenticação nem em file:// (desenvolvimento local).
 */
(function () {
    'use strict';
    if (window.location.protocol === 'file:') return;

    var path = window.location.pathname || '';
    var href = window.location.href || '';

    var onAuthPage =
        path.indexOf('/login') !== -1 ||
        path.indexOf('/register') !== -1 ||
        /auth\.html(\?|$|#)/i.test(href) ||
        /\/auth\.html$/i.test(path);

    if (onAuthPage) return;

    var token = '';
    try {
        token = String(localStorage.getItem('token') || '').trim();
    } catch (e) {
        token = '';
    }

    // Rejeita vazio, espaços ou valor residual curto (não é sessão real)
    if (!token || token.length < 12) {
        window.location.replace('auth.html?view=login');
        return;
    }
})();
