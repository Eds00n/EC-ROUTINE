(function (global) {
    'use strict';

    var DEFAULT_MIN_MS = 180;
    var NAV_BUSY_KEY = 'ec_nav_busy';
    var overlayEl = null;
    var showStartedAt = 0;
    var hideTimer = null;
    var pendingHide = null;

    function setNavBusyForNavigation() {
        try {
            sessionStorage.setItem(NAV_BUSY_KEY, '1');
        } catch (_) {}
        try {
            document.documentElement.classList.add('ec-busy-pending');
        } catch (_) {}
    }

    function consumeNavBusyFlag() {
        try {
            sessionStorage.removeItem(NAV_BUSY_KEY);
        } catch (_) {}
        try {
            document.documentElement.classList.remove('ec-busy-pending');
        } catch (_) {}
    }

    function isNavBusyPending() {
        try {
            if (sessionStorage.getItem(NAV_BUSY_KEY) === '1') return true;
        } catch (_) {}
        try {
            return document.documentElement.classList.contains('ec-busy-pending');
        } catch (_) {
            return false;
        }
    }

    function bootstrapNavBusyIfPending() {
        if (!isNavBusyPending()) return Promise.resolve();
        return showEcBusyOverlay({ minMs: 420 });
    }

    function prefersReducedMotion() {
        try {
            return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch (e) {
            return false;
        }
    }

    function ensureOverlay() {
        if (overlayEl) return overlayEl;
        overlayEl = document.getElementById('ecBusyOverlay');
        if (overlayEl) return overlayEl;

        overlayEl = document.createElement('div');
        overlayEl.id = 'ecBusyOverlay';
        overlayEl.setAttribute('aria-hidden', 'true');
        overlayEl.setAttribute('aria-live', 'polite');
        overlayEl.innerHTML =
            '<div class="ec-busy-overlay__inner">' +
            '<div class="ec-busy-overlay__spinner" aria-hidden="true"></div>' +
            '<span class="ec-busy-overlay__label">Carregando</span>' +
            '</div>';
        document.body.appendChild(overlayEl);
        return overlayEl;
    }

    function showEcBusyOverlay(options) {
        options = options || {};
        var minMs = typeof options.minMs === 'number' ? options.minMs : DEFAULT_MIN_MS;
        if (prefersReducedMotion()) minMs = 0;

        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
        pendingHide = null;

        var el = ensureOverlay();
        showStartedAt = Date.now();
        el.classList.add('is-active');
        el.setAttribute('aria-hidden', 'false');
        el._ecBusyMinMs = minMs;
        return Promise.resolve();
    }

    function hideEcBusyOverlay() {
        var el = ensureOverlay();
        var minMs = typeof el._ecBusyMinMs === 'number' ? el._ecBusyMinMs : DEFAULT_MIN_MS;
        var elapsed = Date.now() - showStartedAt;
        var waitMs = Math.max(0, minMs - elapsed);

        return new Promise(function (resolve) {
            function finish() {
                el.classList.remove('is-active');
                el.setAttribute('aria-hidden', 'true');
                hideTimer = null;
                pendingHide = null;
                consumeNavBusyFlag();
                resolve();
            }

            if (!el.classList.contains('is-active')) {
                consumeNavBusyFlag();
                resolve();
                return;
            }

            if (waitMs <= 0) {
                finish();
                return;
            }

            hideTimer = setTimeout(finish, waitMs);
            pendingHide = finish;
        });
    }

    global.showEcBusyOverlay = showEcBusyOverlay;
    global.hideEcBusyOverlay = hideEcBusyOverlay;
    global.setNavBusyForNavigation = setNavBusyForNavigation;
    global.bootstrapNavBusyIfPending = bootstrapNavBusyIfPending;

    if (typeof document !== 'undefined' && isNavBusyPending()) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                bootstrapNavBusyIfPending();
            });
        } else {
            bootstrapNavBusyIfPending();
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
