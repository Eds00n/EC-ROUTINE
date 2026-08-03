(function () {
    'use strict';

    function normalizeApiBase(s) {
        var u = String(s || '').trim();
        if (!u) return '';
        u = u.replace(/\/$/, '');
        if (/\/api$/i.test(u)) return u;
        return u + '/api';
    }

    function defaultApiBase() {
        var w = typeof window === 'undefined' ? null : window;
        if (!w || !w.location || !w.location.origin) return '/api';
        return w.location.origin.replace(/\/$/, '') + '/api';
    }

    var w = typeof window === 'undefined' ? null : window;
    if (!w || !w.location) return;

    var meta = typeof document !== 'undefined' ? document.querySelector('meta[name="ec-api-base"]') : null;
    var fromMeta = meta && meta.getAttribute('content');
    var trimmed = fromMeta && String(fromMeta).trim();
    w.__EC_API_BASE__ = trimmed ? normalizeApiBase(trimmed) : defaultApiBase();
})();
