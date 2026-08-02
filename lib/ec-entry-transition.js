/**
 * Transição de entrada: EC ROUTINE (typewriter) → fade suave para o dashboard.
 * @see lib/ec-entry-transition.css
 */
(function (global) {
    'use strict';

    var MS_PER_CHAR = 78;
    var PAUSE_AFTER_SPACE_MS = 220;
    var PAUSE_END_MS = 280;
    var HOLD_MS = 520;
    var EXIT_MS = 850;
    var REDUCED_MS = 450;

    var DEFAULT_BRAND = 'EC ROUTINE';

    function prefersReducedMotion() {
        try {
            return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch (e) {
            return false;
        }
    }

    function wait(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function getScreen() {
        return document.getElementById('ecEntryScreen');
    }

    /**
     * Duração total da transição para um texto (usado pelo dashboard.js).
     * @param {string} [text]
     * @returns {number}
     */
    function computeTotalMs(text) {
        text = String(text || DEFAULT_BRAND);
        var writeMs = 0;
        for (var i = 0; i < text.length; i++) {
            writeMs += MS_PER_CHAR;
            if (text.charAt(i) === ' ') writeMs += PAUSE_AFTER_SPACE_MS;
        }
        return writeMs + PAUSE_END_MS + HOLD_MS + EXIT_MS;
    }

    var TOTAL_MS = computeTotalMs(DEFAULT_BRAND);

    var PAGE_GRADUAL_EXIT_MS = 420;
    var PAGE_GRADUAL_ENTER_MS = 620;
    var PAGE_TRANSITION_KEY = 'ec_page_transition';
    var PAGE_TRANSITION_CREATE = 'create';

    function setPageTransitionFlag() {
        try {
            sessionStorage.setItem(PAGE_TRANSITION_KEY, PAGE_TRANSITION_CREATE);
        } catch (_) {}
    }

    function consumePageTransitionFlag() {
        try {
            var pending = sessionStorage.getItem(PAGE_TRANSITION_KEY) === PAGE_TRANSITION_CREATE;
            if (pending) sessionStorage.removeItem(PAGE_TRANSITION_KEY);
            return pending;
        } catch (_) {
            return false;
        }
    }

    function cleanupPageTransitionClasses() {
        try {
            document.documentElement.classList.remove(
                'ec-page-enter-pending',
                'ec-page-enter-reveal',
                'ec-page-exit-active'
            );
        } catch (_) {}
        try {
            document.body.style.overflow = '';
        } catch (_) {}
    }

    /**
     * Some a página atual aos poucos e navega para create.html (ou href).
     * @param {{ href?: string }} options
     * @returns {Promise<void>}
     */
    function runPageExit(options) {
        options = options || {};
        var href = options.href || 'create.html';

        if (prefersReducedMotion()) {
            setPageTransitionFlag();
            global.location.href = href;
            return Promise.resolve();
        }

        try {
            document.body.style.overflow = 'hidden';
        } catch (_) {}
        try {
            document.documentElement.classList.add('ec-page-exit-active');
        } catch (_) {}
        void document.documentElement.offsetWidth;

        return wait(PAGE_GRADUAL_EXIT_MS).then(function () {
            setPageTransitionFlag();
            global.location.href = href;
        });
    }

    /**
     * Revela a página de destino aos poucos após runPageExit (create.html).
     * @returns {Promise<void>}
     */
    function runPageEnter() {
        var pending = consumePageTransitionFlag();

        if (!pending) {
            cleanupPageTransitionClasses();
            return Promise.resolve();
        }

        if (prefersReducedMotion()) {
            cleanupPageTransitionClasses();
            return Promise.resolve();
        }

        return Promise.resolve()
            .then(function () {
                void document.documentElement.offsetWidth;
                try {
                    document.documentElement.classList.remove('ec-page-enter-pending');
                    document.documentElement.classList.add('ec-page-enter-reveal');
                } catch (_) {}
                return wait(PAGE_GRADUAL_ENTER_MS);
            })
            .then(function () {
                cleanupPageTransitionClasses();
            })
            .catch(function () {
                cleanupPageTransitionClasses();
            });
    }

    function prepareWordmark(screen, text) {
        var ghost = screen.querySelector('.ec-entry-wordmark__ghost');
        var textEl = screen.querySelector('.ec-entry-wordmark__text');
        if (ghost) ghost.textContent = text;
        if (textEl) {
            textEl.textContent = '';
            textEl.classList.remove('typewriter-active', 'typewriter-done');
        }
        var h1 = screen.querySelector('.ec-entry-wordmark');
        if (h1) h1.setAttribute('aria-label', text);
    }

    /**
     * @param {HTMLElement} element
     * @param {string} fullText
     * @returns {Promise<void>}
     */
    function runTypewriter(element, fullText) {
        return new Promise(function (resolve) {
            if (!element) {
                resolve();
                return;
            }
            fullText = String(fullText || '');
            element.textContent = '';
            element.classList.add('typewriter-active');
            element.classList.remove('typewriter-done');
            var i = 0;

            function tick() {
                if (i >= fullText.length) {
                    element.classList.remove('typewriter-active');
                    element.classList.add('typewriter-done');
                    return wait(PAUSE_END_MS).then(resolve);
                }
                element.textContent += fullText.charAt(i);
                var ch = fullText.charAt(i);
                i += 1;
                var delay = MS_PER_CHAR + (ch === ' ' ? PAUSE_AFTER_SPACE_MS : 0);
                setTimeout(tick, delay);
            }

            tick();
        });
    }

    function resetScreen(screen) {
        screen.classList.remove('is-phase-active', 'is-phase-exit', 'is-reduced');
        screen.style.opacity = '';
        var textEl = screen.querySelector('.ec-entry-wordmark__text');
        if (textEl) textEl.classList.remove('typewriter-active', 'typewriter-done');
    }

    function finish(screen) {
        if (!screen) return;
        try {
            document.body.style.overflow = '';
        } catch (_) {}
        try {
            global.document.documentElement.classList.remove('ec-entry-boot');
        } catch (_) {}
        resetScreen(screen);
        screen.classList.add('is-hidden');
        screen.setAttribute('aria-hidden', 'true');
    }

    function beginExitPhase(screen) {
        if (!screen) return Promise.resolve();
        screen.classList.add('is-phase-exit');
        return wait(EXIT_MS);
    }

    /**
     * Typewriter + pausa; para antes do fade-out (handoff para onboarding diário).
     * @param {{ brandText?: string }} options
     * @returns {Promise<{ screen: HTMLElement, brandText: string }|null>}
     */
    function runUntilHold(options) {
        options = options || {};
        var screen = getScreen();
        if (!screen) return Promise.resolve(null);

        if (prefersReducedMotion()) {
            var brandReduced = options.brandText || DEFAULT_BRAND;
            prepareWordmark(screen, brandReduced);
            var textReduced = screen.querySelector('.ec-entry-wordmark__text');
            if (textReduced) {
                textReduced.textContent = brandReduced;
                textReduced.classList.add('typewriter-done');
            }
            try {
                document.body.style.overflow = 'hidden';
            } catch (_) {}
            resetScreen(screen);
            screen.classList.remove('is-hidden');
            screen.classList.add('is-reduced', 'is-phase-active');
            screen.setAttribute('aria-hidden', 'false');
            return wait(Math.round(HOLD_MS * 0.65)).then(function () {
                return { screen: screen, brandText: brandReduced };
            });
        }

        var brandText = options.brandText || DEFAULT_BRAND;
        prepareWordmark(screen, brandText);
        var textEl = screen.querySelector('.ec-entry-wordmark__text');

        try {
            document.body.style.overflow = 'hidden';
        } catch (_) {}
        resetScreen(screen);
        screen.classList.remove('is-hidden');
        screen.setAttribute('aria-hidden', 'false');

        return Promise.resolve()
            .then(function () {
                void screen.offsetWidth;
                screen.classList.add('is-phase-active');
                return runTypewriter(textEl, brandText);
            })
            .then(function () {
                return wait(HOLD_MS);
            })
            .then(function () {
                return { screen: screen, brandText: brandText };
            })
            .catch(function () {
                return { screen: screen, brandText: brandText };
            });
    }

    function runReduced(screen, options) {
        options = options || {};
        var brandText = options.brandText || DEFAULT_BRAND;
        prepareWordmark(screen, brandText);
        var textEl = screen.querySelector('.ec-entry-wordmark__text');
        if (textEl) {
            textEl.textContent = brandText;
            textEl.classList.add('typewriter-done');
        }
        try {
            document.body.style.overflow = 'hidden';
        } catch (_) {}
        screen.classList.remove('is-hidden');
        screen.classList.add('is-reduced', 'is-phase-active');
        screen.setAttribute('aria-hidden', 'false');
        return wait(Math.round(REDUCED_MS * 0.45))
            .then(function () {
                screen.classList.add('is-phase-exit');
                return wait(Math.round(REDUCED_MS * 0.55));
            })
            .then(function () {
                finish(screen);
                if (typeof options.onComplete === 'function') options.onComplete();
            });
    }

    /**
     * @param {{ brandText?: string, onComplete?: function }} options
     * @returns {Promise<void>}
     */
    function run(options) {
        options = options || {};
        var screen = getScreen();
        if (!screen) return Promise.resolve();

        if (prefersReducedMotion()) {
            return runReduced(screen, options);
        }

        var brandText = options.brandText || DEFAULT_BRAND;
        prepareWordmark(screen, brandText);
        var textEl = screen.querySelector('.ec-entry-wordmark__text');

        try {
            document.body.style.overflow = 'hidden';
        } catch (_) {}
        resetScreen(screen);
        screen.classList.remove('is-hidden');
        screen.setAttribute('aria-hidden', 'false');

        return Promise.resolve()
            .then(function () {
                void screen.offsetWidth;
                screen.classList.add('is-phase-active');
                return runTypewriter(textEl, brandText);
            })
            .then(function () {
                return wait(HOLD_MS);
            })
            .then(function () {
                return beginExitPhase(screen);
            })
            .then(function () {
                finish(screen);
                if (typeof options.onComplete === 'function') options.onComplete();
            })
            .catch(function () {
                finish(screen);
            });
    }

    function forceHide() {
        var screen = getScreen();
        if (screen) finish(screen);
        try {
            document.body.style.overflow = '';
            document.documentElement.classList.remove('ec-entry-pending', 'ec-entry-boot');
        } catch (_) {}
    }

    global.EcEntryTransition = {
        run: run,
        runUntilHold: runUntilHold,
        beginExitPhase: beginExitPhase,
        runPageExit: runPageExit,
        runPageEnter: runPageEnter,
        forceHide: forceHide,
        finish: finish,
        computeTotalMs: computeTotalMs,
        TOTAL_MS: TOTAL_MS,
        PHASE_MS: {
            hold: HOLD_MS,
            exit: EXIT_MS,
            reduced: REDUCED_MS,
            pageGradualExit: PAGE_GRADUAL_EXIT_MS,
            pageGradualEnter: PAGE_GRADUAL_ENTER_MS
        }
    };
})(typeof window !== 'undefined' ? window : this);
