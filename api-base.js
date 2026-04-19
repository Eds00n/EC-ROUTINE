(function () {
    'use strict';
    /** Fallback se não existir meta `ec-api-base` (ver DEPLOY.md). */
    var DEFAULT_PROD = 'https://ec-routine-api.onrender.com/api';

    function normalizeApiBase(s) {
        var u = String(s || '').trim();
        if (!u) return '';
        u = u.replace(/\/$/, '');
        if (/\/api$/i.test(u)) return u;
        return u + '/api';
    }

    var w = typeof window === 'undefined' ? null : window;
    if (!w || !w.location) return;

    var host = String(w.location.hostname || '').toLowerCase();
    var localHost = host === 'localhost' || host === '127.0.0.1';
    var port = String(w.location.port || '');

    if (localHost && port === '3000') {
        w.__EC_API_BASE__ = w.location.origin.replace(/\/$/, '') + '/api';
        return;
    }

    var meta = typeof document !== 'undefined' ? document.querySelector('meta[name="ec-api-base"]') : null;
    var fromMeta = meta && meta.getAttribute('content');
    var trimmed = fromMeta && String(fromMeta).trim();
    var resolved = trimmed ? normalizeApiBase(trimmed) : normalizeApiBase(DEFAULT_PROD);
    w.__EC_API_BASE__ = resolved || normalizeApiBase(DEFAULT_PROD);
})();
