// Configuração da API (api-base.js define window.__EC_API_BASE__ em localhost:3000 com node server.js)
const API_URL =
    (typeof window !== 'undefined' && window.__EC_API_BASE__) ||
    'https://ec-routine-api.onrender.com/api';

const DASHBOARD_AFTER_CREATE = 'dashboard.html?view=cards';

function showRoutineToast(message, durationMs) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'saved-toast';
    el.setAttribute('role', 'status');
    el.textContent = message;
    container.appendChild(el);
    const ms = typeof durationMs === 'number' ? durationMs : 3200;
    setTimeout(() => {
        el.classList.add('saved-toast-out');
        setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 300);
    }, ms);
}

function goToDashboardAfterToast(delayMs) {
    const d = typeof delayMs === 'number' ? delayMs : 2000;
    setTimeout(() => {
        window.location.replace(DASHBOARD_AFTER_CREATE);
    }, d);
}

// Array para armazenar tarefas temporárias
let initialTasks = [];
let editingRoutineSnapshot = null;

// Estado do wizard (1 a 4)
let currentStep = 1;

// Categorias de rotina com ícones Lucide (kebab-case)
const ROUTINE_CATEGORIES = [
    { id: 'musculacao', name: 'Musculação', icon: 'dumbbell' },
    { id: 'alimentacao', name: 'Alimentação', icon: 'salad' },
    { id: 'suplementacao', name: 'Suplementação', icon: 'pill' },
    { id: 'estudos', name: 'Estudos', icon: 'book-open' },
    { id: 'trabalho', name: 'Trabalho', icon: 'briefcase' },
    { id: 'meditacao', name: 'Meditação', icon: 'brain' },
    { id: 'sono', name: 'Sono', icon: 'moon' },
    { id: 'cardio', name: 'Cardio', icon: 'activity' },
    { id: 'leitura', name: 'Leitura', icon: 'book-marked' },
    { id: 'organizacao', name: 'Organização', icon: 'clipboard-list' },
    { id: 'saude', name: 'Saúde', icon: 'heart' },
    { id: 'rotina_matinal', name: 'Rotina Matinal', icon: 'sunrise' },
    { id: 'rotina_noturna', name: 'Rotina Noturna', icon: 'moon' },
    { id: 'hidratacao', name: 'Hidratação', icon: 'droplets' },
    { id: 'lazer', name: 'Lazer', icon: 'gamepad-2' }
];

// Garantir que goToNextStep existe no window assim que o script carrega (para o onclick no HTML)
var WIZARD_SLIDE_MS = 260;
var _wizardSlideBusy = false;

var PLAN_TYPE_EXIT_MS = 300;
var PLAN_TYPE_ENTER_MS = 350;
var _planTypeTransitionBusy = false;

var _lastStep4RevealPlanType = null;

function prefersReducedMotionPlanType() {
    try {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
        return false;
    }
}

function prepareWizardStepDisplay(step) {
    document.querySelectorAll('.create-step').forEach(function (el) {
        var isVisible = el.getAttribute('data-step') === String(step);
        el.classList.toggle('is-current', isVisible);
        el.style.display = isVisible ? getWizardStepDisplay(step) : 'none';
        el.classList.remove('transition-slide', 'is-next-container', 'is-previous-container');
        if (el.id === 'wizardStep4') el.classList.toggle('wizard-step-4-visible', isVisible);
    });
}

function waitForElementTransition(el, propertyName, timeoutMs) {
    return new Promise(function (resolve) {
        if (!el) {
            resolve();
            return;
        }
        var done = false;
        function finish() {
            if (done) return;
            done = true;
            el.removeEventListener('transitionend', onEnd);
            resolve();
        }
        function onEnd(e) {
            if (e.target === el && e.propertyName === propertyName) finish();
        }
        el.addEventListener('transitionend', onEnd);
        setTimeout(finish, timeoutMs);
    });
}

function runPlanTypeForwardExit() {
    return new Promise(function (resolve) {
        if (_planTypeTransitionBusy) {
            resolve();
            return;
        }
        _planTypeTransitionBusy = true;

        var root = document.documentElement;
        var main = document.querySelector('.main-content');
        var figmaApp = document.getElementById('planTypeFigmaApp');
        var wizard = document.querySelector('.create-section.create-wizard');

        if (!main || !figmaApp || !wizard) {
            _planTypeTransitionBusy = false;
            if (typeof hideStep4CreateLoading === 'function') {
                hideStep4CreateLoading();
            } else if (typeof hideEcBusyOverlay === 'function') {
                hideEcBusyOverlay().catch(function () {});
            }
            resolve();
            return;
        }

        if (typeof setStep4CreateLoadingMessage === 'function') {
            setStep4CreateLoadingMessage('Carregando próximo passo…', 'Aguarde um instante');
        }
        if (typeof showStep4CreateLoading === 'function') {
            showStep4CreateLoading('Carregando próximo passo…', 'Aguarde um instante', { overTransition: true });
        }

        function finishForward(done) {
            if (typeof done === 'function') done();
        }

        function finishInstant() {
            root.classList.remove(
                'is-plan-type-dissolve-active',
                'is-plan-type-dissolve-header-visible',
                'is-plan-type-dissolve-exit',
                'is-plan-type-dissolve-enter'
            );
            prepareWizardStepDisplay(2);
            wizard.hidden = false;
            var cleanup = typeof finalizePlanTypeConfirmCleanup === 'function'
                ? finalizePlanTypeConfirmCleanup()
                : Promise.resolve();
            cleanup.then(function () {
                runWizardStepHooks(2);
                _planTypeTransitionBusy = false;
                if (typeof hideStep4CreateLoading === 'function') {
                    hideStep4CreateLoading();
                }
                finishForward(resolve);
            });
        }

        function finishForwardEnter() {
            wizard.classList.remove('is-dissolve-enter', 'is-active');
            main.classList.remove('is-plan-type-dissolve');
            root.classList.remove(
                'create-wizard-step1-active',
                'is-plan-type-dissolve-active',
                'is-plan-type-dissolve-enter',
                'is-plan-type-dissolve-header-visible'
            );
            document.body.style.overflow = '';
            runWizardStepHooks(2);
            _planTypeTransitionBusy = false;
            if (typeof hideStep4CreateLoading === 'function') {
                hideStep4CreateLoading();
            }
            finishForward(resolve);
        }

        if (prefersReducedMotionPlanType()) {
            finishInstant();
            return;
        }

        root.classList.add('is-plan-type-dissolve-active', 'is-plan-type-dissolve-exit');
        main.classList.add('is-plan-type-dissolve');
        figmaApp.classList.add('is-dissolve-exit');

        void main.offsetWidth;

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                figmaApp.classList.add('is-active');
            });
        });

        waitForElementTransition(figmaApp, 'opacity', PLAN_TYPE_EXIT_MS + 80).then(function () {
            var cleanup = typeof finalizePlanTypeConfirmCleanup === 'function'
                ? finalizePlanTypeConfirmCleanup()
                : Promise.resolve();
            cleanup.then(function () {
                figmaApp.classList.remove('is-dissolve-exit', 'is-active');
                figmaApp.hidden = true;

                root.classList.remove('create-wizard-step1-active', 'is-plan-type-dissolve-exit');
                root.classList.add('is-plan-type-dissolve-enter', 'is-plan-type-dissolve-header-visible');
                prepareWizardStepDisplay(2);
                wizard.hidden = false;
                wizard.classList.add('is-dissolve-enter');

                void main.offsetWidth;

                requestAnimationFrame(function () {
                    requestAnimationFrame(function () {
                        wizard.classList.add('is-active');
                    });
                });

                waitForElementTransition(wizard, 'opacity', PLAN_TYPE_ENTER_MS + 80).then(finishForwardEnter);
            });
        });
    });
}

function runPlanTypeBackwardEnter() {
    return new Promise(function (resolve) {
        if (_planTypeTransitionBusy) {
            resolve();
            return;
        }
        _planTypeTransitionBusy = true;

        var root = document.documentElement;
        var main = document.querySelector('.main-content');
        var figmaApp = document.getElementById('planTypeFigmaApp');
        var wizard = document.querySelector('.create-section.create-wizard');
        var tarefaScreen = document.getElementById('planTypeTarefaScreen');

        if (!main || !figmaApp || !wizard) {
            _planTypeTransitionBusy = false;
            if (typeof hideStep4CreateLoading === 'function') {
                hideStep4CreateLoading();
            }
            resolve();
            return;
        }

        if (typeof showStep4CreateLoading === 'function') {
            showStep4CreateLoading('Voltando…', 'Aguarde um instante', { overTransition: true });
        }

        function finishInstant() {
            root.classList.remove(
                'is-plan-type-dissolve-active',
                'is-plan-type-dissolve-header-visible',
                'is-plan-type-dissolve-exit',
                'is-plan-type-dissolve-enter'
            );
            prepareWizardStepDisplay(1);
            wizard.hidden = true;
            syncPlanTypeFigmaVisibility(1);
            updateStep1SubmitState();
            _planTypeTransitionBusy = false;
            if (typeof hideStep4CreateLoading === 'function') {
                hideStep4CreateLoading();
            }
            resolve();
        }

        function prepareFigmaForReturn() {
            figmaApp.hidden = false;

            if (tarefaScreen) {
                tarefaScreen.hidden = true;
                tarefaScreen.setAttribute('aria-hidden', 'true');
            }
            if (typeof resetPlanTypeColTextVisibility === 'function') {
                resetPlanTypeColTextVisibility();
            }
            figmaApp.classList.remove(
                'is-col-open',
                'is-col-opening',
                'is-col-closing',
                'is-col-shade-overlay',
                'is-dissolve-exit',
                'is-dissolve-return',
                'is-active'
            );
        }

        function finishBackwardEnter() {
            wizard.classList.remove('is-dissolve-leave', 'is-active');
            wizard.hidden = true;
            figmaApp.classList.remove('is-dissolve-return', 'is-active');
            main.classList.remove('is-plan-type-dissolve');
            root.classList.remove(
                'is-plan-type-dissolve-active',
                'is-plan-type-dissolve-enter',
                'is-plan-type-dissolve-header-visible'
            );
            prepareWizardStepDisplay(1);
            syncPlanTypeFigmaVisibility(1);
            updateStep1SubmitState();
            _planTypeTransitionBusy = false;
            if (typeof hideStep4CreateLoading === 'function') {
                hideStep4CreateLoading();
            }
            resolve();
        }

        if (prefersReducedMotionPlanType()) {
            finishInstant();
            return;
        }

        root.classList.add('is-plan-type-dissolve-active', 'is-plan-type-dissolve-exit');
        root.classList.remove('is-plan-type-dissolve-header-visible', 'create-wizard-step1-active');
        main.classList.add('is-plan-type-dissolve');
        wizard.classList.add('is-dissolve-leave', 'is-active');

        void main.offsetWidth;

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                wizard.classList.remove('is-active');
            });
        });

        waitForElementTransition(wizard, 'opacity', PLAN_TYPE_EXIT_MS + 80).then(function () {
            wizard.classList.remove('is-dissolve-leave', 'is-active');

            prepareFigmaForReturn();
            root.classList.remove('is-plan-type-dissolve-exit');
            root.classList.add('is-plan-type-dissolve-enter', 'create-wizard-step1-active');
            figmaApp.classList.add('is-dissolve-return');

            void main.offsetWidth;

            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    figmaApp.classList.add('is-active');
                    document.body.style.overflow = 'hidden';
                });
            });

            waitForElementTransition(figmaApp, 'opacity', PLAN_TYPE_ENTER_MS + 80).then(finishBackwardEnter);
        });
    });
}

function resetWizardScrollPosition() {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    var main = document.querySelector('.main-content');
    if (main) main.scrollTop = 0;
}

function syncPlanTypeFigmaVisibility(step) {
    var isStep1 = step === 1;
    var isPremiumWizard = step >= 2 && step <= 4;
    var section = document.querySelector('.create-section.create-wizard');
    if (section) section.hidden = isStep1;
    document.documentElement.classList.toggle('create-wizard-premium-active', isPremiumWizard);
    document.documentElement.classList.toggle('create-wizard-step2-active', step === 2);
    if (typeof setPlanTypeFigmaVisible === 'function') {
        setPlanTypeFigmaVisible(isStep1);
    } else {
        document.documentElement.classList.toggle('create-wizard-step1-active', isStep1);
        if (!isStep1) document.body.style.overflow = '';
    }
    if (isPremiumWizard) resetWizardScrollPosition();
}

function getWizardStepDisplay(step) {
    return step === 4 ? 'grid' : 'block';
}

function runWizardStepHooks(step, options) {
    options = options || {};
    syncPlanTypeFigmaVisibility(step);
    if (step === 1) updateStep1SubmitState();
    if (step === 2) {
        updateStep2SubmitState();
        initStep2PremiumIcons();
        if (!_categoriesRendered) {
            var deferCategoryRender = function () {
                ensureCategoriesRendered();
            };
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(deferCategoryRender, { timeout: 600 });
            } else {
                requestAnimationFrame(deferCategoryRender);
            }
        }
    }
    if (step === 3) {
        updateStep3Button();
        initLucideIcons(document.getElementById('wizardStep3'));
    }
    if (step === 4 && !options.skipStep4Fields) updateStep4Fields();
    if (step !== 4 && typeof closeStep4Picker === 'function') closeStep4Picker();
}

function showWizardStepInstant(step) {
    document.querySelectorAll('.create-step').forEach(function (el) {
        var isVisible = el.getAttribute('data-step') === String(step);
        el.classList.toggle('is-current', isVisible);
        el.style.display = isVisible ? getWizardStepDisplay(step) : 'none';
        el.classList.remove('transition-slide', 'is-next-container', 'is-previous-container');
        if (el.id === 'wizardStep4') el.classList.toggle('wizard-step-4-visible', isVisible);
    });
    runWizardStepHooks(step);
}

function animateWizardSlide(fromStep, toStep, forward) {
  return new Promise(function (resolve) {
    var slides = document.getElementById('createWizardSlides');
    var fromEl = slides && slides.querySelector('.create-step[data-step="' + fromStep + '"]');
    var toEl = slides && slides.querySelector('.create-step[data-step="' + toStep + '"]');
    if (!slides || !fromEl || !toEl) {
      showWizardStepInstant(toStep);
      resolve();
      return;
    }
    if (_wizardSlideBusy) {
      resolve();
      return;
    }
    _wizardSlideBusy = true;

    if (toStep === 4 && typeof updateStep4Fields === 'function') {
        updateStep4Fields();
    }

    var toDisplay = getWizardStepDisplay(toStep);
    var fromDisplay = getWizardStepDisplay(fromStep);
    fromEl.style.display = fromDisplay;
    toEl.style.display = toDisplay;

    slides.style.minHeight = Math.max(fromEl.offsetHeight, toEl.offsetHeight) + 'px';
    slides.classList.add('is-changing');
    slides.classList.toggle('to-left', !forward);

    fromEl.classList.add('transition-slide');
    toEl.classList.add('transition-slide', 'is-next-container');

    void slides.offsetWidth;

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toEl.classList.remove('is-next-container');
        fromEl.classList.add('is-previous-container');
      });
    });

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      try {
        toEl.removeEventListener('transitionend', onTransitionEnd);
      } catch (_) {}
      slides.classList.remove('is-changing', 'to-left');
      fromEl.classList.remove('transition-slide', 'is-previous-container');
      fromEl.style.display = 'none';
      fromEl.classList.remove('is-current');
      toEl.classList.remove('transition-slide');
      toEl.classList.add('is-current');
      toEl.style.display = toDisplay;
      if (toEl.id === 'wizardStep4') toEl.classList.add('wizard-step-4-visible');
      if (fromEl.id === 'wizardStep4') fromEl.classList.remove('wizard-step-4-visible');
      slides.style.minHeight = '';
      _wizardSlideBusy = false;
      runWizardStepHooks(toStep, { skipStep4Fields: toStep === 4 });
      resolve();
    }

    function onTransitionEnd(e) {
      if (e && e.propertyName === 'transform' && (e.target === toEl || e.target === fromEl)) finish();
    }
    toEl.addEventListener('transitionend', onTransitionEnd);
    setTimeout(finish, WIZARD_SLIDE_MS + 100);
  });
}

function findVoltarButton(fromStep, toStep) {
    var stepEl = document.querySelector('.create-step[data-step="' + fromStep + '"]');
    if (stepEl) {
        var inStep = stepEl.querySelector('.btn-voltar[data-goto="' + toStep + '"]');
        if (inStep) return inStep;
    }
    return document.querySelector('.btn-voltar[data-goto="' + toStep + '"]');
}

function runWizardSlideTransition(fromStep, toStep, triggerBtn, options) {
    options = options || {};
    var title = options.title || (toStep > fromStep ? 'Continuando…' : 'Voltando…');
    var direction = toStep > fromStep ? 'forward' : 'back';
    if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.setAttribute('aria-busy', 'true');
    }
    if (typeof showStep4CreateLoading === 'function') {
        showStep4CreateLoading(title, 'Aguarde um instante', { overTransition: true });
    }
    currentStep = toStep;
    window.__wizardStep = toStep;
    var transition = showWizardStep(toStep, { direction: direction, fromStep: fromStep });
    var finish = function () {
        if (typeof hideStep4CreateLoading === 'function') {
            hideStep4CreateLoading();
        }
        if (triggerBtn) {
            triggerBtn.removeAttribute('aria-busy');
            if (fromStep === 2 && toStep === 3 && typeof updateStep2SubmitState === 'function') {
                updateStep2SubmitState();
            } else {
                triggerBtn.disabled = false;
            }
        }
        updateWizardProgress(toStep);
        if (toStep === 4 && typeof syncEstudosCreateUi === 'function') {
            syncEstudosCreateUi();
        }
    };
    if (transition && typeof transition.then === 'function') {
        return transition.then(finish);
    }
    finish();
    return Promise.resolve();
}

function runWizardForwardTransition(fromStep, triggerBtnId) {
    return runWizardSlideTransition(fromStep, fromStep + 1, triggerBtnId ? document.getElementById(triggerBtnId) : null, {
        title: 'Continuando…'
    });
}

function runWizardBackwardTransition(fromStep, toStep, triggerBtn) {
    if (fromStep === 4 && typeof closeStep4Picker === 'function') {
        closeStep4Picker();
    }
    return runWizardSlideTransition(fromStep, toStep, triggerBtn || findVoltarButton(fromStep, toStep), {
        title: 'Voltando…'
    });
}

function goToNextStep(fromStep) {
    if (fromStep === 1) {
        const selected = document.querySelector('input[name="planType"]:checked');
        if (!selected) {
            alert('Selecione o tipo da tarefa.');
            return;
        }
        currentStep = 2;
        window.__wizardStep = currentStep;
        runPlanTypeForwardExit().then(function () {
            updateWizardProgress(currentStep);
        });
        return;
    }
    if (fromStep === 2) {
        const titleEl = document.getElementById('routineTitle');
        const title = titleEl ? titleEl.value.trim() : '';
        if (!title) {
            alert('Por favor, preencha o nome da tarefa.');
            return;
        }
        const bulletSelected = document.querySelector('input[name="bulletType"]:checked');
        if (!bulletSelected) {
            alert('Selecione o nível de importância.');
            return;
        }
    }
    var nextStep = fromStep + 1;
    if (fromStep === 2 || fromStep === 3) {
        var btnId = fromStep === 2 ? 'btnContinuarStep2' : 'btnContinuarStep3';
        return runWizardForwardTransition(fromStep, btnId);
    }
    currentStep = nextStep;
    window.__wizardStep = currentStep;
    showWizardStep(currentStep, { direction: 'forward', fromStep: fromStep });
    updateWizardProgress(currentStep);
}
window.goToNextStep = goToNextStep;

function goToStep(step, options) {
    options = options || {};
    const s = parseInt(step, 10);
    if (s < 1 || s > 4) return;
    const prev = currentStep;
    if (s === prev) return;
    if (s === 1 && prev === 2) {
        var backBtn21 = options.triggerBtn || findVoltarButton(prev, s);
        if (backBtn21) {
            backBtn21.disabled = true;
            backBtn21.setAttribute('aria-busy', 'true');
        }
        currentStep = 1;
        window.__wizardStep = 1;
        return runPlanTypeBackwardEnter().then(function () {
            if (backBtn21) {
                backBtn21.removeAttribute('aria-busy');
                backBtn21.disabled = false;
            }
            updateWizardProgress(1);
        });
    }
    if (s < prev) {
        return runWizardBackwardTransition(prev, s, options.triggerBtn || findVoltarButton(prev, s));
    }
    currentStep = s;
    window.__wizardStep = s;
    showWizardStep(currentStep, { direction: 'forward', fromStep: prev });
    updateWizardProgress(currentStep);
    if (s === 4) syncEstudosCreateUi();
}
window.goToStep = goToStep;

// Carregar dados do usuário
document.addEventListener('DOMContentLoaded', () => {
    var busyBootstrap =
        typeof bootstrapNavBusyIfPending === 'function'
            ? bootstrapNavBusyIfPending()
            : Promise.resolve();

    busyBootstrap
        .then(function () {
            if (typeof window.EcEntryTransition !== 'undefined' && window.EcEntryTransition.runPageEnter) {
                return window.EcEntryTransition.runPageEnter();
            }
        })
        .then(function () {
            if (typeof hideEcBusyOverlay === 'function') {
                return hideEcBusyOverlay();
            }
        })
        .catch(function () {
            if (typeof hideEcBusyOverlay === 'function') {
                return hideEcBusyOverlay();
            }
        });

    if (typeof window.__wizardStep === 'number') currentStep = window.__wizardStep;

    // Botão "Criar Rotina": registrar primeiro para não ser afetado por erros posteriores
    const btnCreateRoutine = document.getElementById('btnCreateRoutine');
    const wizardProgressEl = document.getElementById('wizardProgress');
    initCreateRoutineConfirmModal();

    if (btnCreateRoutine) {
        btnCreateRoutine.addEventListener('click', (e) => {
            if (e && e.preventDefault) e.preventDefault();
            if (e && e.stopPropagation) e.stopPropagation();
            handleCreateRoutine(e);
        }, true);
        if (wizardProgressEl) {
            btnCreateRoutine.addEventListener('mouseenter', () => wizardProgressEl.classList.add('wizard-progress--create-hover'));
            btnCreateRoutine.addEventListener('mouseleave', () => wizardProgressEl.classList.remove('wizard-progress--create-hover'));
        }
    }

    // Delegar cliques nos botões Continuar (fase de captura)
    document.addEventListener('click', (e) => {
        const id = e.target && e.target.id;
        if (id === 'btnContinuarStep2') { e.preventDefault(); e.stopPropagation(); goToNextStep(2); return; }
        if (id === 'btnContinuarStep3') { e.preventDefault(); e.stopPropagation(); goToNextStep(3); return; }
    }, true);
    // Delegar cliques nos botões Voltar (fase de captura) para funcionar mesmo se algo falhar depois
    document.addEventListener('click', (e) => {
        const el = e.target && e.target.closest && e.target.closest('.btn-voltar');
        if (!el) return;
        const goto = parseInt(el.getAttribute('data-goto'), 10);
        if (goto >= 1 && goto <= 4) {
            e.preventDefault();
            e.stopPropagation();
            goToStep(goto, { triggerBtn: el });
        }
    }, true);

    // Também ligar diretamente nos botões (redundante mas garante)
    const btn2 = document.getElementById('btnContinuarStep2');
    const btn3 = document.getElementById('btnContinuarStep3');
    if (btn2) btn2.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); goToNextStep(2); });
    if (btn3) btn3.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); goToNextStep(3); });

    // Garantir que tem dados de desenvolvimento
    if (!localStorage.getItem('userName')) {
        localStorage.setItem('userName', 'DESENVOLVEDOR');
        localStorage.setItem('userId', 'dev-' + Date.now());
    }
    
    const userName = localStorage.getItem('userName') || 'DESENVOLVEDOR';
    const usernameElement = document.getElementById('username');
    if (usernameElement) usernameElement.textContent = userName.toUpperCase();

    // Verificar se é edição ou fluxo dedicado de estudos
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    if (isStudyCreateModeFromUrl()) {
        window.__ecStudyCreateMode = true;
        applyCategoryToForm({ id: 'estudos', name: 'Estudos', icon: 'book-open' });
        var planDaily = document.getElementById('planTypeDaily');
        if (planDaily) planDaily.checked = true;
        currentStep = 2;
        window.__wizardStep = 2;
    }
    if (editId) {
        loadRoutineForEdit(editId);
    }

    // Configurar formulário (submit: nos passos 1–3 avança; no passo 4 cria a rotina)
    const createForm = document.getElementById('createForm');
    if (createForm) {
        createForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (typeof window.__wizardStep === 'number') currentStep = window.__wizardStep;
            const step4El = document.getElementById('wizardStep4');
            if (step4El && step4El.style.display !== 'none') currentStep = 4;
            if (currentStep < 4) {
                goToNextStep(currentStep);
            }
            // Passo 4: apenas o clique em "Criar Rotina" dispara a criação
        });
    }

    // Configurar adição de tarefas
    setupTaskInput();

    // Categorias: pré-render no passo 1 para não sumirem ao entrar no passo 2
    preloadCategoriesSoon();

    // Figma picker (passo 1) antes de exibir o wizard
    if (typeof initPlanTypeFigma === 'function') {
        initPlanTypeFigma({
            onConfirm: function () {
                updateStep1SubmitState();
                currentStep = 2;
                window.__wizardStep = 2;
                return runPlanTypeForwardExit().then(function () {
                    updateWizardProgress(2);
                });
            },
            onBack: function () {
                if (window._ecNavigatingFromCreate) return;
                window._ecNavigatingFromCreate = true;

                var href = 'dashboard.html?view=cards';

                if (typeof showEcBusyOverlay === 'function') {
                    showEcBusyOverlay({ minMs: 220 });
                }
                if (typeof setNavBusyForNavigation === 'function') {
                    setNavBusyForNavigation();
                } else {
                    try {
                        sessionStorage.setItem('ec_nav_busy', '1');
                        document.documentElement.classList.add('ec-busy-pending');
                    } catch (e) {}
                }

                if (prefersReducedMotionPlanType()) {
                    window.location.replace(href);
                    return;
                }

                try {
                    document.documentElement.classList.add('ec-page-exit-active');
                } catch (e) {}
                var ms = (typeof EcEntryTransition !== 'undefined' && EcEntryTransition.PHASE_MS)
                    ? EcEntryTransition.PHASE_MS.pageGradualExit
                    : 420;
                setTimeout(function () {
                    window.location.replace(href);
                }, ms);
            }
        });
    }

    // Wizard: mostrar apenas o passo atual (sem animação no primeiro paint)
    showWizardStep(currentStep, { instant: true });
    updateWizardProgress(currentStep);
    syncPlanTypeFigmaVisibility(currentStep);

    // Passo 2: habilitar Continuar só com nome + nível de importância
    setupStep2Listeners();

    // Passo 3: botão Pular/Continuar e auto-resize dos textareas
    setupStep3Details();

    // Passo 4: listeners (horário, preview, mensal)
    setupStep4Listeners();

    syncEstudosCreateUi();

});

function triggerStep4PanelReveal(el) {
    if (!el || el.style.display === 'none') return;
    var revealTarget = el.querySelector('.step4-weekdays-body, .monthly-type-options') || el;
    revealTarget.classList.remove('step4-panel--reveal');
    void revealTarget.offsetWidth;
    revealTarget.classList.add('step4-panel--reveal');
}

function goBackFromWeekdayChips() {
    var planType = (document.querySelector('input[name="planType"]:checked') || {}).value || 'daily';
    if (planType !== 'daily') return;
    var specific = document.getElementById('dailyDayTypeSpecific');
    if (specific) specific.checked = false;
    document.querySelectorAll('input[name="weekDay"]').forEach(function (cb) {
        cb.checked = false;
    });
    updateStep4Fields();
}

function setupStep2Listeners() {
    const titleEl = document.getElementById('routineTitle');
    if (titleEl) titleEl.addEventListener('input', updateStep2SubmitState);
    document.querySelectorAll('input[name="bulletType"]').forEach(radio => {
        radio.addEventListener('change', updateStep2SubmitState);
    });
}

function showWizardStep(step, options) {
    options = options || {};
    var fromStep = options.fromStep != null ? options.fromStep : currentStep;
    if (
        options.instant ||
        !document.getElementById('createWizardSlides') ||
        step === fromStep ||
        (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    ) {
        showWizardStepInstant(step);
        return Promise.resolve();
    }
    var forward = options.direction ? options.direction === 'forward' : step > fromStep;
    return animateWizardSlide(fromStep, step, forward);
}
window.showWizardStep = showWizardStep;

function updateStep1SubmitState() {
    /* Passo 1 confirmado via picker Figma (#planTypeFigmaApp) */
}

function updateStep2SubmitState() {
    const titleEl = document.getElementById('routineTitle');
    const title = titleEl ? titleEl.value.trim() : '';
    const bulletSelected = document.querySelector('input[name="bulletType"]:checked');
    const btn2 = document.getElementById('btnContinuarStep2');
    if (btn2) {
        const canProceed = !!title && !!bulletSelected;
        btn2.disabled = !canProceed;
    }
}

function updateWizardProgress(step) {
    const circles = document.querySelectorAll('.wizard-progress-dots .circle');
    circles.forEach((circle, i) => {
        circle.classList.toggle('done', i + 1 < step);
    });
}

function updateStep3Button() {
    const desc = (document.getElementById('routineDescription') && document.getElementById('routineDescription').value.trim()) || '';
    const obj = (document.getElementById('routineObjectives') && document.getElementById('routineObjectives').value.trim()) || '';
    const reasons = (document.getElementById('routineReasons') && document.getElementById('routineReasons').value.trim()) || '';
    const btn = document.getElementById('btnContinuarStep3');
    if (btn) btn.textContent = (desc || obj || reasons) ? 'Continuar' : 'Pular';
}

function setupStep3Details() {
    const ids = ['routineDescription', 'routineObjectives', 'routineReasons'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
            updateStep3Button();
            if (el.hasAttribute('data-autogrow')) {
                el.style.height = 'auto';
                const minH = 56;
                const maxH = 200;
                el.style.height = Math.min(Math.max(el.scrollHeight, minH), maxH) + 'px';
            }
        });
    });

    var btnShowMore = document.getElementById('btnShowMoreDetails');
    var detailsMore = document.getElementById('detailsMore');
    var detailsMoreContent = document.getElementById('detailsMoreContent');
    var btnShowMoreText = btnShowMore && btnShowMore.querySelector('.btn-show-more-text');
    if (btnShowMore && detailsMore && detailsMoreContent) {
        btnShowMore.addEventListener('click', function () {
            var isExpanded = !detailsMoreContent.hidden;
            detailsMoreContent.hidden = isExpanded;
            detailsMore.classList.toggle('expanded', !isExpanded);
            btnShowMore.setAttribute('aria-expanded', !isExpanded);
            if (btnShowMoreText) btnShowMoreText.textContent = isExpanded ? 'Mostrar mais' : 'Mostrar menos';
            if (!isExpanded) initLucideIcons(detailsMoreContent);
        });
    }
}

// Dia da semana: 0=Dom, 1=Seg, ..., 6=Sáb (para schedule.weekDays e preview)
const WEEKDAY_NAMES_LONG = { 0: 'domingo', 1: 'segunda', 2: 'terça', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sábado' };
const MONTHLY_PATTERN_WEEK_ORD = { '1': '1ª', '2': '2ª', '3': '3ª', '4': '4ª', last: 'ÚLTIMA' };
const MONTHLY_PATTERN_DAY_PREVIEW = {
    0: 'DOMINGO',
    1: 'SEGUNDA-FEIRA',
    2: 'TERÇA-FEIRA',
    3: 'QUARTA-FEIRA',
    4: 'QUINTA-FEIRA',
    5: 'SEXTA-FEIRA',
    6: 'SÁBADO'
};
var _monthlyPatternPickerBound = false;

function syncMonthlyPatternCardsFromSelects() {
    var wSel = document.getElementById('monthlyWeekOfMonth');
    var dSel = document.getElementById('monthlyDayOfWeek');
    var weekVal = wSel ? wSel.value : '';
    var dayVal = dSel ? dSel.value : '';
    document.querySelectorAll('.monthly-pattern-week-btn').forEach(function (btn) {
        var selected = btn.getAttribute('data-value') === weekVal && weekVal !== '';
        btn.classList.toggle('is-selected', selected);
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    document.querySelectorAll('.monthly-pattern-day-btn').forEach(function (btn) {
        var selected = btn.getAttribute('data-value') === dayVal && dayVal !== '';
        btn.classList.toggle('is-selected', selected);
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    var confirmBtn = document.getElementById('monthlyPatternConfirm');
    if (confirmBtn) confirmBtn.disabled = !(weekVal && dayVal !== '');
}

function updateMonthlyPatternPreview() {
    var previewEl = document.getElementById('monthlyPatternPreviewText');
    if (!previewEl) return;
    var wSel = document.getElementById('monthlyWeekOfMonth');
    var dSel = document.getElementById('monthlyDayOfWeek');
    var weekVal = wSel ? wSel.value : '';
    var dayVal = dSel ? dSel.value : '';
    if (!weekVal || dayVal === '') {
        previewEl.textContent = 'Selecione a semana e o dia para ver a pré-visualização.';
        return;
    }
    var ord = MONTHLY_PATTERN_WEEK_ORD[weekVal] || weekVal;
    var dayName = MONTHLY_PATTERN_DAY_PREVIEW[parseInt(dayVal, 10)] || '';
    previewEl.innerHTML = 'Sua rotina ocorrerá na <strong>' + escapeHtml(ord + ' ' + dayName) + '</strong> de todos os meses.';
}

function refreshMonthlyPatternUIPicker() {
    syncMonthlyPatternCardsFromSelects();
    updateMonthlyPatternPreview();
}

function confirmMonthlyWeekPattern() {
    var wSel = document.getElementById('monthlyWeekOfMonth');
    var dSel = document.getElementById('monthlyDayOfWeek');
    if (!wSel || !wSel.value || !dSel || dSel.value === '') return;
    updateSchedulePreview();
    closeStep4Picker();
    updateStep4SubmitState();
}

function initMonthlyWeekPatternPicker() {
    if (_monthlyPatternPickerBound) {
        refreshMonthlyPatternUIPicker();
        return;
    }
    _monthlyPatternPickerBound = true;
    document.querySelectorAll('.monthly-pattern-week-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var wSel = document.getElementById('monthlyWeekOfMonth');
            if (!wSel) return;
            wSel.value = btn.getAttribute('data-value') || '';
            wSel.dispatchEvent(new Event('change', { bubbles: true }));
            refreshMonthlyPatternUIPicker();
        });
    });
    document.querySelectorAll('.monthly-pattern-day-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var dSel = document.getElementById('monthlyDayOfWeek');
            if (!dSel) return;
            dSel.value = btn.getAttribute('data-value') || '';
            dSel.dispatchEvent(new Event('change', { bubbles: true }));
            refreshMonthlyPatternUIPicker();
        });
    });
    var confirmBtn = document.getElementById('monthlyPatternConfirm');
    if (confirmBtn) confirmBtn.addEventListener('click', confirmMonthlyWeekPattern);
    refreshMonthlyPatternUIPicker();
}
const WEEKDAY_ABBREV = { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' };

function formatWeekDaysForPreview(weekDays) {
    if (!weekDays || weekDays.length === 0) return '';
    const sorted = [...weekDays].sort((a, b) => a - b);
    const set = new Set(sorted);
    if (set.size === 2 && set.has(0) && set.has(6)) return 'Final de semana';
    const isConsecutive = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
    if (isConsecutive && sorted.length >= 2) {
        const first = WEEKDAY_ABBREV[sorted[0]];
        const last = WEEKDAY_ABBREV[sorted[sorted.length - 1]];
        return first && last ? `${first} a ${last}` : sorted.map(d => WEEKDAY_ABBREV[d]).filter(Boolean).join(', ');
    }
    if (sorted.length === 1) return WEEKDAY_ABBREV[sorted[0]] || '';
    const parts = sorted.map(d => WEEKDAY_ABBREV[d]).filter(Boolean);
    return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1] : parts[0] || '';
}

function formatWeekDaysForStep4Display(weekDays) {
    if (!weekDays || weekDays.length === 0) return '';
    if (weekDays.length === 7) return 'Todos os dias';
    const sorted = [...weekDays].sort((a, b) => a - b);
    const set = new Set(sorted);
    if (set.size === 2 && set.has(0) && set.has(6)) return 'final de semana';
    const isConsecutive = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
    const dayName = (d) => WEEKDAY_NAMES_LONG[d] || '';
    if (isConsecutive && sorted.length >= 2) {
        const first = dayName(sorted[0]);
        const last = dayName(sorted[sorted.length - 1]);
        return first && last ? `${first} a ${last}` : sorted.map(dayName).filter(Boolean).join(', ');
    }
    if (sorted.length === 1) return dayName(sorted[0]);
    const parts = sorted.map(dayName).filter(Boolean);
    return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1] : parts[0] || '';
}

function updateWeekdaysChoiceDisplay() {
    const displayEl = document.getElementById('weekdaysChoiceValueDisplay');
    if (!displayEl) return;
    const planType = (document.querySelector('input[name="planType"]:checked') || {}).value || 'daily';
    const dailyDayTypeAll = document.getElementById('dailyDayTypeAll');
    let text = '';
    if (planType === 'daily' && dailyDayTypeAll && dailyDayTypeAll.checked) {
        text = 'Todos os dias';
    } else {
        const schedule = getScheduleFromStep4();
        if (schedule.weekDays && schedule.weekDays.length) {
            text = formatWeekDaysForStep4Display(schedule.weekDays);
        }
    }
    displayEl.textContent = text;
}

function formatMonthlyChoiceForDisplay(schedule) {
    if (!schedule || schedule.monthlyType === 'dayOfMonth') {
        if (schedule && schedule.dayOfMonth) return 'Dia ' + schedule.dayOfMonth;
        return '';
    }
    if (schedule.monthlyType === 'weekOfMonth' && schedule.weekOfMonth != null && schedule.dayOfWeek != null) {
        var ord = schedule.weekOfMonth === 'last' ? 'Última' : (MONTHLY_PATTERN_WEEK_ORD[String(schedule.weekOfMonth)] || schedule.weekOfMonth + 'ª');
        var dayName = WEEKDAY_ABBREV[schedule.dayOfWeek] || MONTHLY_PATTERN_DAY_PREVIEW[schedule.dayOfWeek] || '';
        return ord + ' ' + dayName;
    }
    return '';
}

function updateMonthlyChoiceDisplay() {
    var displayEl = document.getElementById('monthlyChoiceValueDisplay');
    if (!displayEl) return;
    var planType = (document.querySelector('input[name="planType"]:checked') || {}).value || 'daily';
    if (planType !== 'monthly') {
        displayEl.textContent = '';
        return;
    }
    displayEl.textContent = formatMonthlyChoiceForDisplay(getScheduleFromStep4());
}

function getScheduleFromStep4() {
    const planType = (document.querySelector('input[name="planType"]:checked') || {}).value || 'daily';
    const timeEl = document.getElementById('routineTime');
    const timeChoiceAny = document.querySelector('input[name="timeChoice"][value="any"]');
    const schedule = {};
    const useTime = timeEl && !(timeChoiceAny && timeChoiceAny.checked);
    if (useTime && timeEl.value) schedule.time = timeEl.value;

    if (planType === 'daily') {
        const dailyDayTypeAll = document.getElementById('dailyDayTypeAll');
        const dailyDayTypeSpecific = document.getElementById('dailyDayTypeSpecific');
        if (dailyDayTypeSpecific && dailyDayTypeSpecific.checked) {
            const checked = Array.from(document.querySelectorAll('input[name="weekDay"]:checked')).map(c => parseInt(c.value, 10));
            if (checked.length) schedule.weekDays = checked.sort((a, b) => a - b);
        }
        // "Todos os dias" (all): não envia weekDays = todos os dias
    }
    if (planType === 'weekly') {
        const checked = Array.from(document.querySelectorAll('input[name="weekDay"]:checked')).map(c => parseInt(c.value, 10));
        if (checked.length) schedule.weekDays = checked.sort((a, b) => a - b);
    }
    if (planType === 'monthly') {
        const mt = document.querySelector('input[name="monthlyType"]:checked');
        if (mt && mt.value === 'dayOfMonth') {
            const v = (document.getElementById('monthlyDayOfMonth') || {}).value;
            if (v) {
                schedule.monthlyType = 'dayOfMonth';
                schedule.dayOfMonth = parseInt(v, 10);
            }
        } else if (mt && mt.value === 'weekOfMonth') {
            const w = (document.getElementById('monthlyWeekOfMonth') || {}).value;
            const d = (document.getElementById('monthlyDayOfWeek') || {}).value;
            if (w && d) {
                schedule.monthlyType = 'weekOfMonth';
                schedule.weekOfMonth = w === 'last' ? 'last' : parseInt(w, 10);
                schedule.dayOfWeek = parseInt(d, 10);
            }
        }
    }
    return schedule;
}

const MONTH_NAMES_SHORT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const WEEKDAY_HEADERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function renderMonthlyDayCalendar(container, onDaySelect) {
    if (!container) return;
    const selectEl = document.getElementById('monthlyDayOfMonth');
    const current = new Date();
    const year = current.getFullYear();
    const month = current.getMonth();
    const monthName = MONTH_NAMES_SHORT[month];
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const selectedDay = selectEl && selectEl.value ? parseInt(selectEl.value, 10) : null;

    let daysHTML = '';
    for (let i = 0; i < firstDay; i++) {
        daysHTML += '<span class="monthly-day-cell monthly-day-cell--empty"></span>';
    }
    for (let d = 1; d <= lastDate; d++) {
        const selected = selectedDay === d ? ' selected' : '';
        daysHTML += `<button type="button" class="monthly-day-cell${selected}" data-day="${d}">${d}</button>`;
    }

    const weekdaysHTML = WEEKDAY_HEADERS.map(h => `<span class="monthly-calendar-weekday">${h}</span>`).join('');

    container.innerHTML = `
        <div class="monthly-calendar-header">${monthName}</div>
        <div class="monthly-calendar-weekdays">${weekdaysHTML}</div>
        <div class="monthly-calendar-grid">${daysHTML}</div>
    `;

    container.querySelectorAll('.monthly-day-cell[data-day]').forEach(cell => {
        cell.addEventListener('click', () => {
            const day = cell.getAttribute('data-day');
            if (!day) return;
            if (selectEl) selectEl.value = day;
            container.querySelectorAll('.monthly-day-cell').forEach(c => c.classList.remove('selected'));
            cell.classList.add('selected');
            updateSchedulePreview();
            updateStep4SubmitState();
            if (typeof onDaySelect === 'function') onDaySelect();
        });
    });
}

var STEP4_PICKER_HINT_KEYS = {
    time: 'ecRoutineStep4Hint_time',
    studyMeta: 'ecRoutineStep4Hint_studyMeta',
    studyStart: 'ecRoutineStep4Hint_studyStart',
    monthDay: 'ecRoutineStep4Hint_monthDay',
    monthWeek: 'ecRoutineStep4Hint_monthWeek'
};
var STEP4_PICKER_TITLES = {
    time: 'Horário fixo',
    studyMeta: 'Meta diária de estudo',
    studyStart: 'Horário de início',
    monthDay: 'Dia fixo no mês',
    monthWeek: 'Padrão semanal'
};
var STEP4_PICKER_SUBTITLES = {
    studyMeta: 'Escolha quanto tempo estudar por dia',
    studyStart: 'Quando você costuma começar a estudar'
};
var STEP4_PICKER_INTROS = {
    time: {
        icon: 'clock',
        exampleIcon: 'clock',
        title: 'Horário fixo',
        desc: 'Defina um horário específico em que a rotina acontece todos os dias.',
        example: '07:30 → Todos os dias às 7h30',
        tags: [
            { icon: 'dumbbell', label: 'Treinos matinais' },
            { icon: 'heart-pulse', label: 'Medicação' },
            { icon: 'users', label: 'Reuniões' },
            { icon: 'book-open', label: 'Rotinas de estudo' }
        ],
        tip: 'Dica: Ideal para hábitos que precisam de horário definido.'
    },
    studyMeta: {
        icon: 'timer',
        exampleIcon: 'timer',
        title: 'Meta diária de estudo',
        desc: 'Defina quanto tempo você quer estudar por dia para concluir a rotina automaticamente.',
        example: '1:30 → 1 hora e 30 minutos de estudo por dia',
        tags: [
            { icon: 'book-open', label: 'Estudos diários' },
            { icon: 'target', label: 'Metas de foco' },
            { icon: 'clock', label: 'Tempo dedicado' },
            { icon: 'trending-up', label: 'Consistência' }
        ],
        tip: 'Dica: Escolha uma meta realista para manter o hábito.'
    },
    studyStart: {
        icon: 'clock',
        exampleIcon: 'clock',
        title: 'Horário de início',
        desc: 'Defina quando você costuma começar a estudar todos os dias.',
        example: '08:00 → Início diário às 8h',
        tags: [
            { icon: 'book-open', label: 'Estudos matinais' },
            { icon: 'sunrise', label: 'Rotina ao acordar' },
            { icon: 'calendar-clock', label: 'Horário fixo' },
            { icon: 'target', label: 'Foco diário' }
        ],
        tip: 'Dica: Escolha um horário em que você consegue manter consistência.'
    },
    monthDay: {
        icon: 'repeat',
        exampleIcon: 'calendar',
        title: 'Dia fixo no mês',
        desc: 'A rotina será repetida automaticamente na mesma data todos os meses.',
        example: '15 → Todo dia 15 do mês',
        tags: [
            { icon: 'credit-card', label: 'Pagamentos' },
            { icon: 'target', label: 'Metas mensais' },
            { icon: 'trending-up', label: 'Revisões e relatórios' },
            { icon: 'banknote', label: 'Planejamento financeiro' }
        ],
        tip: 'Dica: Ideal para compromissos e tarefas que acontecem sempre na mesma data.'
    },
    monthWeek: {
        icon: 'calendar-days',
        exampleIcon: 'calendar-days',
        title: 'Padrão semanal',
        desc: 'Escolha em qual semana do mês e em qual dia da semana a rotina acontece.',
        example: '2ª segunda → Toda 2ª segunda-feira do mês',
        tags: [
            { icon: 'users', label: 'Reuniões mensais' },
            { icon: 'credit-card', label: 'Pagamento de contas' },
            { icon: 'circle-check', label: 'Check-ins semanais' },
            { icon: 'target', label: 'Revisão de metas' }
        ],
        tip: 'Dica: Ideal quando a data muda de mês a mês, mas segue um padrão fixo.'
    }
};
var _step4PickerOpenType = null;
var _step4PickerPhase = null;
var _step4PickerRestore = { mount: null, parent: null };

function isStep4Active() {
    var step4 = document.getElementById('wizardStep4');
    return !!(step4 && step4.classList.contains('is-current'));
}

function getStep4PickerMount(type) {
    if (type === 'time') {
        return { mount: document.getElementById('timePickerMount'), parent: document.getElementById('timePickerWrapper') };
    }
    if (type === 'studyMeta') {
        return { mount: document.getElementById('studyGoalMetaPickerMount'), parent: document.getElementById('studyGoalMetaPickerWrapper') };
    }
    if (type === 'studyStart') {
        return { mount: document.getElementById('studyGoalStartPickerMount'), parent: document.getElementById('studyGoalStartPickerWrapper') };
    }
    if (type === 'monthDay') {
        return { mount: document.getElementById('monthlyDayFixedMount'), parent: document.getElementById('monthlyDayFixed') };
    }
    if (type === 'monthWeek') {
        return { mount: document.getElementById('monthlyWeekPatternMount'), parent: document.getElementById('monthlyWeekPattern') };
    }
    return null;
}

function markStep4PickerIntroSeen(type) {
    if (!type || !STEP4_PICKER_HINT_KEYS[type]) return;
    try { localStorage.setItem(STEP4_PICKER_HINT_KEYS[type], '1'); } catch (e) {}
}

function shouldShowStep4PickerIntro(type) {
    try { return localStorage.getItem(STEP4_PICKER_HINT_KEYS[type]) !== '1'; } catch (e) { return true; }
}

function renderStep4PickerIntro(type) {
    var data = STEP4_PICKER_INTROS[type];
    if (!data) return;
    var titleEl = document.getElementById('step4PickerModalIntroTitle');
    var descEl = document.getElementById('step4PickerModalIntroDesc');
    var exampleVal = document.getElementById('step4PickerModalExampleValue');
    var tipEl = document.getElementById('step4PickerModalIntroTip');
    var iconHost = document.getElementById('step4PickerModalIntroIconHost');
    var exampleIconHost = document.getElementById('step4PickerModalExampleIconHost');
    var tagsEl = document.getElementById('step4PickerModalTags');
    if (titleEl) titleEl.textContent = data.title;
    if (descEl) descEl.textContent = data.desc;
    if (exampleVal) exampleVal.textContent = data.example;
    if (tipEl) tipEl.textContent = data.tip;
    if (iconHost) iconHost.innerHTML = '<i data-lucide="' + escapeHtml(data.icon) + '"></i>';
    if (exampleIconHost) exampleIconHost.innerHTML = '<i data-lucide="' + escapeHtml(data.exampleIcon) + '"></i>';
    if (tagsEl) {
        tagsEl.innerHTML = data.tags.map(function (t) {
            return '<span class="step4-picker-modal__tag"><i data-lucide="' + escapeHtml(t.icon) + '" aria-hidden="true"></i><span>' + escapeHtml(t.label) + '</span></span>';
        }).join('');
    }
    initLucideIcons(document.getElementById('step4PickerModalIntro'));
}

function setStep4PickerModalPhase(phase) {
    var modal = document.getElementById('step4PickerModal');
    var intro = document.getElementById('step4PickerModalIntro');
    var picker = document.getElementById('step4PickerModalPicker');
    _step4PickerPhase = phase || null;
    if (modal) {
        modal.classList.toggle('step4-picker-modal--intro', phase === 'intro');
        modal.classList.toggle('step4-picker-modal--picker', phase === 'picker');
    }
    if (intro) intro.classList.toggle('hidden', phase !== 'intro');
    if (picker) picker.classList.toggle('hidden', phase !== 'picker');
    if (phase === 'intro' && modal) {
        modal.setAttribute('aria-labelledby', 'step4PickerModalIntroTitle');
    } else if (phase === 'picker' && modal) {
        var pickerType = _step4PickerOpenType;
        if (pickerType === 'time') {
            modal.setAttribute('aria-labelledby', 'timePickerWheelTitle');
        } else {
            modal.setAttribute('aria-labelledby', 'step4PickerModalTitle');
        }
    }
}

function showStep4PickerIntroPhase(type) {
    setStep4PickerModalPhase('intro');
    renderStep4PickerIntro(type);
}

function showStep4PickerPickerPhase(type) {
    var body = document.getElementById('step4PickerModalBody');
    var info = getStep4PickerMount(type);
    var modal = document.getElementById('step4PickerModal');
    if (!body || !info || !info.mount || !info.parent) return;
    _step4PickerRestore = info;
    var titleEl = document.getElementById('step4PickerModalTitle');
    if (titleEl) titleEl.textContent = STEP4_PICKER_TITLES[type] || '';
    var subtitleEl = document.getElementById('step4PickerModalSubtitle');
    if (subtitleEl) {
        var sub = STEP4_PICKER_SUBTITLES[type] || '';
        subtitleEl.textContent = sub;
        if (sub) {
            subtitleEl.removeAttribute('hidden');
        } else {
            subtitleEl.setAttribute('hidden', '');
        }
    }
    if (modal) {
        modal.classList.toggle('step4-picker-modal--monthWeek', type === 'monthWeek');
        modal.classList.toggle('step4-picker-modal--time', type === 'time');
        modal.classList.toggle('step4-picker-modal--studyMeta', type === 'studyMeta');
        modal.classList.toggle('step4-picker-modal--studyStart', type === 'studyStart');
    }
    body.appendChild(info.mount);
    setStep4PickerModalPhase('picker');
    if (type === 'time') {
        initTimePickerWheel();
        openTimePickerWheel();
    } else if (type === 'studyMeta') {
        snapshotStudyMetaPickerState();
        initStudyGoalMetaPicker();
        syncStudyGoalMetaPickerConfirmState();
    } else if (type === 'studyStart') {
        initStudyGoalStartPicker();
        syncStudyStartDraftFromWheels();
        syncStudyGoalStartPickerUI();
        snapshotStudyStartPickerState();
        syncStudyGoalStartPickerConfirmState();
    } else if (type === 'monthDay') {
        var cal = document.getElementById('monthlyDayCalendar');
        if (cal) renderMonthlyDayCalendar(cal, closeStep4Picker);
    } else if (type === 'monthWeek') {
        initMonthlyWeekPatternPicker();
    }
    initLucideIcons(document.getElementById('step4PickerModal'));
}

function hideStep4InlinePickers() {
    var tw = document.getElementById('timePickerWrapper');
    var smw = document.getElementById('studyGoalMetaPickerWrapper');
    var ssw = document.getElementById('studyGoalStartPickerWrapper');
    var df = document.getElementById('monthlyDayFixed');
    var wp = document.getElementById('monthlyWeekPattern');
    if (tw) tw.style.display = 'none';
    if (smw) smw.style.display = 'none';
    if (ssw) ssw.style.display = 'none';
    if (df) df.style.display = 'none';
    if (wp) wp.style.display = 'none';
}

function syncStep4StudyMetaPickerVisibility(showPicker) {
    if (isStep4Active()) {
        hideStep4InlinePickers();
        if (showPicker) openStep4Picker('studyMeta');
        else if (_step4PickerOpenType === 'studyMeta') closeStep4Picker();
        return;
    }
    var wrapper = document.getElementById('studyGoalMetaPickerWrapper');
    if (wrapper) wrapper.style.display = showPicker ? 'block' : 'none';
    if (showPicker) initStudyGoalMetaPicker();
}

function syncStep4StudyStartPickerVisibility(showPicker) {
    if (isStep4Active()) {
        hideStep4InlinePickers();
        if (showPicker) openStep4Picker('studyStart');
        else if (_step4PickerOpenType === 'studyStart') closeStep4Picker();
        return;
    }
    var wrapper = document.getElementById('studyGoalStartPickerWrapper');
    if (wrapper) wrapper.style.display = showPicker ? 'block' : 'none';
    if (showPicker) initStudyGoalStartPicker();
}

function openStep4Picker(type, forcePicker) {
    if (!isStep4Active()) return;
    closeStep4Picker();
    var modal = document.getElementById('step4PickerModal');
    var info = getStep4PickerMount(type);
    if (!modal || !info || !info.mount || !info.parent) return;
    _step4PickerOpenType = type;
    _step4PickerRestore = info;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('step4-picker-modal-open');
    if (!forcePicker && shouldShowStep4PickerIntro(type)) {
        showStep4PickerIntroPhase(type);
    } else {
        showStep4PickerPickerPhase(type);
    }
}

function closeStep4Picker() {
    if (_step4PickerOpenType && _step4PickerPhase === 'picker') {
        markStep4PickerIntroSeen(_step4PickerOpenType);
    }
    var closingType = _step4PickerOpenType;
    var modal = document.getElementById('step4PickerModal');
    if (_step4PickerRestore && _step4PickerRestore.mount && _step4PickerRestore.parent) {
        _step4PickerRestore.parent.appendChild(_step4PickerRestore.mount);
    }
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        modal.classList.remove('step4-picker-modal--intro', 'step4-picker-modal--picker', 'step4-picker-modal--monthWeek', 'step4-picker-modal--time', 'step4-picker-modal--studyMeta', 'step4-picker-modal--studyStart');
    }
    setStep4PickerModalPhase(null);
    document.documentElement.classList.remove('step4-picker-modal-open');
    closeTimePickerPanel();
    _step4PickerOpenType = null;
    _step4PickerRestore = { mount: null, parent: null };
    if (closingType === 'studyMeta') {
        updateStudyGoalMetaDisplay();
        updateSchedulePreview();
        updateStep4SubmitState();
    }
    if (closingType === 'studyStart') {
        updateStudyGoalStartDisplay();
        updateSchedulePreview();
        updateStep4SubmitState();
    }
}

function advanceStep4PickerToSelection() {
    if (!_step4PickerOpenType || _step4PickerPhase !== 'intro') return;
    var continueBtn = document.getElementById('step4PickerModalContinue');
    runStep4PickerLoadingAction('Continuando…', 'Aguarde um instante', continueBtn, function () {
        var type = _step4PickerOpenType;
        markStep4PickerIntroSeen(type);
        showStep4PickerPickerPhase(type);
    }, null, 160);
}

function maybeCloseStep4MonthWeekPicker() {
    refreshMonthlyPatternUIPicker();
}

function abandonIncompleteStudyGoalSelection(type) {
    if (type === 'studyStart') {
        /* Draft sozinho (ex.: 08:00 default) não conta — só Continuar grava o horário. */
        if (isStudyStartTimeCommitted()) return;
        var startRadio = document.querySelector('input[name="studyGoalType"][value="startTime"]');
        if (startRadio) startRadio.checked = false;
        _studyStartDraftHour = '';
        _studyStartDraftMinute = '';
        _studyStartCommitted = false;
        clearStudyStartScheduleForMetaMode();
        updateStudyGoalStartDisplay();
    } else if (type === 'studyMeta') {
        if (getStudyGoalMetaMinutes() > 0) return;
        var metaRadio = document.querySelector('input[name="studyGoalType"][value="time"]');
        if (metaRadio) metaRadio.checked = false;
        _studyMetaDraftHour = '00';
        _studyMetaDraftMinute = '00';
        updateStudyGoalMetaDisplay();
    }
    updateSchedulePreview();
    updateStep4SubmitState();
}

function maybeOpenIncompleteStep4Picker() {
    if (!isStep4Active() || _step4PickerOpenType) return;
    if (isEstudosCreateFlow()) {
        var studyMetaSelected = document.querySelector('input[name="studyGoalType"][value="time"]:checked');
        var studyStartSelected = document.querySelector('input[name="studyGoalType"][value="startTime"]:checked');
        if (studyMetaSelected && getStudyGoalMetaMinutes() <= 0) {
            openStep4Picker('studyMeta', true);
        } else if (studyStartSelected && !isStudyStartTimeCommitted()) {
            openStep4Picker('studyStart', true);
        }
        return;
    }
    var timeChoiceFixed = document.querySelector('input[name="timeChoice"][value="fixed"]');
    if (timeChoiceFixed && timeChoiceFixed.checked) {
        var timeInput = document.getElementById('routineTime');
        if (!timeInput || !timeInput.value) {
            openStep4Picker('time');
            return;
        }
    }
    var planType = (document.querySelector('input[name="planType"]:checked') || {}).value || 'daily';
    if (planType !== 'monthly') return;
    var mt = document.querySelector('input[name="monthlyType"]:checked');
    if (mt && mt.value === 'dayOfMonth') {
        var sel = document.getElementById('monthlyDayOfMonth');
        if (!sel || !sel.value) {
            openStep4Picker('monthDay');
            return;
        }
    }
    if (mt && mt.value === 'weekOfMonth') {
        var w = document.getElementById('monthlyWeekOfMonth');
        var d = document.getElementById('monthlyDayOfWeek');
        if (!w || !w.value || !d || d.value === '') {
            openStep4Picker('monthWeek');
        }
    }
}

function requestCloseStep4Picker() {
    var closingType = _step4PickerOpenType;
    if (closingType === 'studyMeta' && _step4PickerPhase === 'picker') {
        if (!window.confirm('Tem certeza que deseja desfazer? As alterações serão perdidas.')) {
            return;
        }
        if (studyMetaPickerHasChanges()) {
            restoreStudyMetaPickerSnapshot();
            updateStudyGoalMetaDisplay();
            updateSchedulePreview();
            updateStep4SubmitState();
        }
    } else if (closingType === 'studyStart' && _step4PickerPhase === 'picker') {
        if (!window.confirm('Tem certeza que deseja desfazer? As alterações serão perdidas.')) {
            return;
        }
        if (studyStartPickerHasChanges()) {
            restoreStudyStartPickerSnapshot();
            updateStudyGoalStartDisplay();
            updateSchedulePreview();
            updateStep4SubmitState();
        }
    }
    closeStep4Picker();
    if (closingType === 'studyMeta' || closingType === 'studyStart') {
        abandonIncompleteStudyGoalSelection(closingType);
    }
}

function initStep4PickerModal() {
    var overlay = document.getElementById('step4PickerModalOverlay');
    var closeBtn = document.getElementById('step4PickerModalClose');
    var continueBtn = document.getElementById('step4PickerModalContinue');
    var studyMetaConfirm = document.getElementById('studyGoalMetaConfirm');
    var studyStartConfirm = document.getElementById('studyGoalStartConfirm');
    if (overlay) overlay.addEventListener('click', requestCloseStep4Picker);
    if (closeBtn) closeBtn.addEventListener('click', requestCloseStep4Picker);
    if (continueBtn) continueBtn.addEventListener('click', advanceStep4PickerToSelection);
    if (studyMetaConfirm) studyMetaConfirm.addEventListener('click', confirmStudyGoalMetaPicker);
    if (studyStartConfirm) studyStartConfirm.addEventListener('click', confirmStudyGoalStartPicker);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && _step4PickerOpenType) requestCloseStep4Picker();
    });
}

function syncStep4TimePickerVisibility(showPicker) {
    var timePickerWrapper = document.getElementById('timePickerWrapper');
    if (isStep4Active()) {
        hideStep4InlinePickers();
        if (showPicker) openStep4Picker('time');
        else closeStep4Picker();
        return;
    }
    if (timePickerWrapper) timePickerWrapper.style.display = showPicker ? 'block' : 'none';
    if (showPicker) openTimePickerPanel();
    else closeTimePickerPanel();
}

function syncStep4MonthlyPickerVisibility(mt) {
    var dayFixed = document.getElementById('monthlyDayFixed');
    var weekPattern = document.getElementById('monthlyWeekPattern');
    if (isStep4Active()) {
        hideStep4InlinePickers();
        if (mt && mt.value === 'dayOfMonth') openStep4Picker('monthDay');
        else if (mt && mt.value === 'weekOfMonth') openStep4Picker('monthWeek');
        else closeStep4Picker();
        return;
    }
    if (dayFixed) dayFixed.style.display = (mt && mt.value === 'dayOfMonth') ? 'flex' : 'none';
    if (weekPattern) weekPattern.style.display = (mt && mt.value === 'weekOfMonth') ? 'flex' : 'none';
    var calendarEl = document.getElementById('monthlyDayCalendar');
    if (calendarEl && mt && mt.value === 'dayOfMonth') renderMonthlyDayCalendar(calendarEl);
}

function syncStep4SecondColumnHeading(planType) {
    var title = document.getElementById('step4WeekdaysColTitle');
    var subtitle = document.getElementById('step4WeekdaysColSubtitle');
    if (!title || !subtitle) return;
    if (planType === 'weekly') {
        title.textContent = 'Dias da semana';
        subtitle.textContent = 'Selecione os dias da semana';
    } else {
        title.textContent = 'Em quais dias?';
        subtitle.textContent = 'Escolha se a rotina é todos os dias ou em dias específicos';
    }
}

function updateStep4Fields() {
    const planType = (document.querySelector('input[name="planType"]:checked') || {}).value || 'daily';
    const step4El = document.getElementById('wizardStep4');
    const premiumStep4Plans = ['daily', 'weekly', 'monthly', 'task'];
    const isPremiumStep4 = premiumStep4Plans.indexOf(planType) !== -1;
    if (step4El) {
        step4El.classList.toggle('create-step-4--premium', isPremiumStep4);
        step4El.classList.remove(
            'create-step-4--plan-daily',
            'create-step-4--plan-weekly',
            'create-step-4--plan-monthly',
            'create-step-4--plan-task'
        );
        if (isPremiumStep4) step4El.classList.add('create-step-4--plan-' + planType);
    }
    syncStep4SecondColumnHeading(planType);
    const bulletType = (document.querySelector('input[name="bulletType"]:checked') || {}).value || 'task';

    const timeHint = document.getElementById('timeHint');
    if (timeHint) {
        if (bulletType === 'reminder' || bulletType === 'task') timeHint.textContent = 'Opcional';
        else if (bulletType === 'important') timeHint.textContent = 'Recomendado';
        else timeHint.textContent = 'Obrigatório para compromissos';
    }

    const timeChoiceFixed = document.querySelector('input[name="timeChoice"][value="fixed"]');
    const timePickerWrapper = document.getElementById('timePickerWrapper');
    const timeInput = document.getElementById('routineTime');
    const showPicker = timeChoiceFixed && timeChoiceFixed.checked;
    if (isStep4Active()) {
        hideStep4InlinePickers();
    } else if (timePickerWrapper) {
        timePickerWrapper.style.display = showPicker ? 'block' : 'none';
    }
    if (!showPicker && timeInput) timeInput.value = '';
    updateTimePickerDisplay();
    if (showPicker && timeInput && timeInput.value) {
        const hourSelect = document.getElementById('timePickerHour');
        const minuteSelect = document.getElementById('timePickerMinute');
        const [h, m] = timeInput.value.split(':');
        if (hourSelect) hourSelect.value = h || '';
        if (minuteSelect) minuteSelect.value = m || '';
    }

    const weekdaysGroup = document.getElementById('step4WeekdaysGroup');
    const dailyDaysWrap = document.getElementById('step4DailyDaysWrap');
    const weekdaysCheckboxesWrap = document.getElementById('weekdaysCheckboxesWrap');
    const dailyDayTypeSpecific = document.getElementById('dailyDayTypeSpecific');
    if (weekdaysGroup) {
        if (planType === 'daily' || planType === 'weekly') {
            weekdaysGroup.style.removeProperty('display');
        } else {
            weekdaysGroup.style.setProperty('display', 'none', 'important');
        }
        if (dailyDaysWrap) dailyDaysWrap.style.display = planType === 'daily' ? 'block' : 'none';
        const isDailySpecific = planType === 'daily' && dailyDayTypeSpecific && dailyDayTypeSpecific.checked;
        const showWeekdayChips = planType === 'weekly' || isDailySpecific;
        const chipsActive = isPremiumStep4 && showWeekdayChips;
        weekdaysGroup.classList.toggle('is-chips-active', chipsActive);
        if (weekdaysCheckboxesWrap) {
            if (isPremiumStep4 && (planType === 'daily' || planType === 'weekly')) {
                weekdaysCheckboxesWrap.style.display = '';
            } else {
                weekdaysCheckboxesWrap.style.display = showWeekdayChips ? 'block' : 'none';
            }
        }
    }
    const monthlyGroup = document.getElementById('step4MonthlyGroup');
    if (monthlyGroup) {
        if (planType === 'monthly') {
            monthlyGroup.style.removeProperty('display');
        } else {
            monthlyGroup.style.setProperty('display', 'none', 'important');
        }
    }

    if (_lastStep4RevealPlanType !== planType) {
        _lastStep4RevealPlanType = planType;
        if (monthlyGroup && planType === 'monthly') triggerStep4PanelReveal(monthlyGroup);
        if (weekdaysGroup && (planType === 'daily' || planType === 'weekly')) triggerStep4PanelReveal(weekdaysGroup);
    }

    const mt = document.querySelector('input[name="monthlyType"]:checked');
    const dayFixed = document.getElementById('monthlyDayFixed');
    const weekPattern = document.getElementById('monthlyWeekPattern');
    if (isStep4Active()) {
        hideStep4InlinePickers();
    } else {
        if (dayFixed) dayFixed.style.display = (mt && mt.value === 'dayOfMonth') ? 'flex' : 'none';
        if (weekPattern) weekPattern.style.display = (mt && mt.value === 'weekOfMonth') ? 'flex' : 'none';
        const calendarEl = document.getElementById('monthlyDayCalendar');
        if (calendarEl && (mt && mt.value === 'dayOfMonth')) renderMonthlyDayCalendar(calendarEl);
    }

    updateSchedulePreview();
    updateStep4SubmitState();
    maybeOpenIncompleteStep4Picker();
    initLucideIcons(step4El);
}

function formatTimeForPreview(t) {
    if (!t) return '';
    const parts = String(t).split(':');
    return (parts[0] || '00') + ':' + (parts[1] || '00');
}

function formatStudyGoalPreview() {
    var typeEl = document.querySelector('input[name="studyGoalType"]:checked');
    if (typeEl && typeEl.value === 'startTime') {
        if (!isStudyStartTimeCommitted()) return '';
        var startTime = getStudyStartTimeValue();
        if (!startTime) return '';
        return 'início às ' + formatTimeForPreview(startTime);
    }
    var goal = resolveStudyGoalForSave();
    if (!goal) return '';
    if (goal.target < 60) return goal.target + ' min de estudo por dia';
    var hours = goal.target / 60;
    return (hours % 1 === 0 ? hours : hours.toFixed(1).replace('.0', '')) + ' h de estudo por dia';
}

function getSchedulePreviewText(options) {
    options = options || {};
    const timeChoiceChecked = document.querySelector('input[name="timeChoice"]:checked');
    const planType = (document.querySelector('input[name="planType"]:checked') || {}).value || 'daily';
    const schedule = getScheduleFromStep4();
    if (options.timeOverride) schedule.time = options.timeOverride;
    const dailyDayTypeSpecific = document.getElementById('dailyDayTypeSpecific');
    const dailyNoDayType = planType === 'daily' && !document.querySelector('input[name="dailyDayType"]:checked');
    const dailySpecificNoDays = planType === 'daily' && dailyDayTypeSpecific && dailyDayTypeSpecific.checked && (!schedule.weekDays || schedule.weekDays.length === 0);
    const weeklyNoDays = planType === 'weekly' && (!schedule.weekDays || schedule.weekDays.length === 0);
    const monthlyIncomplete = planType === 'monthly' && (
        !schedule.monthlyType ||
        (schedule.monthlyType === 'dayOfMonth' && !schedule.dayOfMonth) ||
        (schedule.monthlyType === 'weekOfMonth' && (schedule.weekOfMonth == null || schedule.weekOfMonth === '' || schedule.dayOfWeek == null || schedule.dayOfWeek === ''))
    );
    const nothingSelected = isEstudosCreateFlow()
        ? (planType === 'daily' && (dailyNoDayType || dailySpecificNoDays))
        : (planType === 'task'
            ? !timeChoiceChecked
            : (!timeChoiceChecked || dailyNoDayType || dailySpecificNoDays || weeklyNoDays || monthlyIncomplete));
    if (nothingSelected) return '';
    let text = '';
    const studyGoalPreview = isEstudosCreateFlow() ? formatStudyGoalPreview() : '';
    const timeStr = schedule.time ? formatTimeForPreview(schedule.time) : '';
    if (planType === 'task') {
        if (schedule.time) {
            text = `Tarefa rápida — horário sugerido às ${timeStr}.`;
        } else {
            text = 'Tarefa rápida — execute quando quiser, sem horário fixo.';
        }
    } else if (planType === 'daily') {
        if (schedule.weekDays && schedule.weekDays.length === 7) {
            if (schedule.time) {
                text = `Essa rotina acontecerá todos os dias às ${timeStr}.`;
            } else {
                text = 'Essa rotina acontecerá todos os dias, sem horário fixo.';
            }
        } else if (schedule.weekDays && schedule.weekDays.length) {
            const days = formatWeekDaysForPreview(schedule.weekDays);
            const isRange = days.indexOf(' a ') !== -1;
            const isWeekend = days === 'Final de semana';
            const dayPart = isWeekend ? 'no ' + days : (isRange ? 'de ' + days : 'às ' + days);
            if (schedule.time) {
                text = `Essa rotina acontecerá ${dayPart} às ${timeStr}.`;
            } else {
                text = `Essa rotina acontecerá ${dayPart}, sem horário fixo.`;
            }
        } else if (schedule.time) {
            text = `Essa rotina acontecerá todos os dias às ${timeStr}.`;
        } else {
            text = 'Essa rotina acontecerá todos os dias, sem horário fixo.';
        }
    } else if (planType === 'weekly' && schedule.weekDays && schedule.weekDays.length) {
        const days = formatWeekDaysForPreview(schedule.weekDays);
        if (!days) return '';
        const isRange = days.indexOf(' a ') !== -1;
        const isWeekend = days === 'Final de semana';
        const dayPart = isWeekend ? 'no ' + days : (isRange ? 'de ' + days : 'aos ' + days);
        if (schedule.time) {
            text = `Toda semana, ${dayPart} às ${timeStr}.`;
        } else {
            text = `Toda semana, ${dayPart}, sem horário fixo.`;
        }
    } else if (planType === 'monthly') {
        if (schedule.monthlyType === 'dayOfMonth' && schedule.dayOfMonth) {
            if (schedule.time) {
                text = `Todo mês, no dia ${schedule.dayOfMonth} às ${timeStr}.`;
            } else {
                text = `Todo mês, no dia ${schedule.dayOfMonth}, sem horário fixo.`;
            }
        } else if (schedule.monthlyType === 'weekOfMonth' && schedule.weekOfMonth != null && schedule.dayOfWeek != null) {
            const ord = schedule.weekOfMonth === 'last' ? 'última' : `${schedule.weekOfMonth}ª`;
            const dayName = schedule.dayOfWeek >= 1 && schedule.dayOfWeek <= 5
                ? WEEKDAY_NAMES_LONG[schedule.dayOfWeek] + '-feira'
                : (WEEKDAY_NAMES_LONG[schedule.dayOfWeek] || '');
            if (schedule.time) {
                text = `Toda ${ord} ${dayName} do mês às ${timeStr}.`;
            } else {
                text = `Toda ${ord} ${dayName} do mês, sem horário fixo.`;
            }
        }
    }
    if (studyGoalPreview) {
        var startTimeMode = isEstudosCreateFlow()
            && (document.querySelector('input[name="studyGoalType"]:checked') || {}).value === 'startTime';
        if (startTimeMode) {
            if (!text) text = 'Estudo com ' + studyGoalPreview + '.';
        } else if (text) {
            text = text.replace(/\.$/, '') + ' — meta: ' + studyGoalPreview + '.';
        } else {
            text = 'Meta diária: ' + studyGoalPreview + '.';
        }
    }
    return text;
}

function updateSchedulePreview() {
    const step4El = document.getElementById('wizardStep4');
    const isPremium = step4El && step4El.classList.contains('create-step-4--premium');
    if (!isPremium) {
        const el = document.getElementById('schedulePreview');
        if (el) {
            const text = getSchedulePreviewText();
            el.textContent = text || 'Selecione as opções acima para ver como ficará sua rotina.';
        }
    }
    updateWeekdaysChoiceDisplay();
    updateMonthlyChoiceDisplay();
}

var _createRoutineConfirmResolve = null;
var _createRoutineConfirmPromise = null;
var _createRoutineConfirmModalInited = false;

function closeCreateRoutineConfirmModal(confirmed) {
    var modal = document.getElementById('createRoutineConfirmModal');
    var card = document.getElementById('createRoutineConfirmCard');
    if (!modal) {
        if (_createRoutineConfirmResolve) {
            _createRoutineConfirmResolve(!!confirmed);
            _createRoutineConfirmResolve = null;
            _createRoutineConfirmPromise = null;
        }
        return;
    }
    if (modal.classList.contains('hidden') || modal.classList.contains('is-closing')) return;

    function finishClose() {
        if (modal.dataset.confirmClosing === '1') return;
        modal.dataset.confirmClosing = '1';
        modal.classList.remove('is-closing', 'is-open', 'is-settled');
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        document.documentElement.classList.remove('step4-create-confirm-open');
        delete modal.dataset.confirmClosing;
        if (_createRoutineConfirmResolve) {
            _createRoutineConfirmResolve(!!confirmed);
            _createRoutineConfirmResolve = null;
            _createRoutineConfirmPromise = null;
        }
    }

    modal.classList.remove('is-open', 'is-settled');
    modal.classList.add('is-closing');

    if (card) {
        var done = false;
        function onAnimEnd(e) {
            if (done || e.target !== card) return;
            if (e.animationName !== 'calendar-day-detail-shrink') return;
            done = true;
            card.removeEventListener('animationend', onAnimEnd);
            finishClose();
        }
        card.addEventListener('animationend', onAnimEnd);
    }
    window.setTimeout(finishClose, 380);
}

function setCreateRoutineButtonLoading(isLoading) {
    var btn = document.getElementById('btnCreateRoutine');
    if (!btn) return;
    btn.classList.toggle('is-loading', !!isLoading);
}

function getCreateRoutineLoadingCopy() {
    var isEdit = !!new URLSearchParams(window.location.search).get('edit');
    var planTypeEl = document.querySelector('input[name="planType"]:checked');
    var planType = planTypeEl ? planTypeEl.value : 'daily';
    if (isEdit) {
        return {
            prepareTitle: 'Preparando alterações…',
            createTitle: 'Salvando alterações…',
            subtitle: 'Aguarde um instante'
        };
    }
    if (planType === 'task') {
        return {
            prepareTitle: 'Preparando sua tarefa…',
            createTitle: 'Criando sua tarefa…',
            subtitle: 'Aguarde um instante'
        };
    }
    return {
        prepareTitle: 'Preparando sua rotina…',
        createTitle: 'Criando sua rotina…',
        subtitle: 'Aguarde um instante'
    };
}

function waitForCreateRoutineConfirm(routineName, scheduleText) {
    var modal = document.getElementById('createRoutineConfirmModal');
    var card = document.getElementById('createRoutineConfirmCard');
    if (!modal) return Promise.resolve(true);
    if (_createRoutineConfirmPromise) {
        var nameElPending = document.getElementById('createRoutineConfirmName');
        var scheduleElPending = document.getElementById('createRoutineConfirmSchedule');
        if (nameElPending) nameElPending.textContent = routineName || 'Sem título';
        if (scheduleElPending) scheduleElPending.textContent = scheduleText;
        return _createRoutineConfirmPromise;
    }
    var nameEl = document.getElementById('createRoutineConfirmName');
    var scheduleEl = document.getElementById('createRoutineConfirmSchedule');
    var titleEl = document.getElementById('createRoutineConfirmTitle');
    var submitLabel = document.getElementById('createRoutineConfirmSubmitLabel');
    var isEdit = !!new URLSearchParams(window.location.search).get('edit');
    if (nameEl) nameEl.textContent = routineName || 'Sem título';
    if (scheduleEl) scheduleEl.textContent = scheduleText;
    if (titleEl) titleEl.textContent = isEdit ? 'Confirmar alterações' : 'Confirmar rotina';
    if (submitLabel) {
        var planTypeEl = document.querySelector('input[name="planType"]:checked');
        var planType = planTypeEl ? planTypeEl.value : 'daily';
        if (isEdit) {
            submitLabel.textContent = 'Salvar alterações';
        } else if (planType === 'task') {
            submitLabel.textContent = 'Criar tarefa';
        } else {
            submitLabel.textContent = 'Criar rotina';
        }
    }
    if (typeof hideStep4CreateLoading === 'function') {
        hideStep4CreateLoading();
    }
    modal.classList.remove('is-closing', 'is-open', 'is-settled', 'hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('step4-create-confirm-open');
    initLucideIcons(modal);
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            modal.classList.add('is-open');
            if (!card) {
                modal.classList.add('is-settled');
                return;
            }
            function onGrowEnd(e) {
                if (e.target !== card || e.animationName !== 'calendar-day-detail-grow') return;
                card.removeEventListener('animationend', onGrowEnd);
                modal.classList.add('is-settled');
            }
            card.addEventListener('animationend', onGrowEnd);
            window.setTimeout(function () {
                if (!modal.classList.contains('is-settled') && modal.classList.contains('is-open')) {
                    modal.classList.add('is-settled');
                }
            }, 420);
        });
    });
    _createRoutineConfirmPromise = new Promise(function (resolve) {
        _createRoutineConfirmResolve = resolve;
    });
    return _createRoutineConfirmPromise;
}

function initCreateRoutineConfirmModal() {
    if (_createRoutineConfirmModalInited) return;
    _createRoutineConfirmModalInited = true;
    var modal = document.getElementById('createRoutineConfirmModal');
    if (!modal) return;
    modal.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('#createRoutineConfirmOverlay')) {
            closeCreateRoutineConfirmModal(false);
            return;
        }
        if (t.closest('#createRoutineConfirmCancel')) {
            e.preventDefault();
            closeCreateRoutineConfirmModal(false);
            return;
        }
        if (t.closest('#createRoutineConfirmSubmit')) {
            e.preventDefault();
            closeCreateRoutineConfirmModal(true);
        }
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && _createRoutineConfirmResolve) closeCreateRoutineConfirmModal(false);
    });
}

function updateTimePickerDisplay() {
    const timeInput = document.getElementById('routineTime');
    const valueEl = document.getElementById('timePickerValue');
    const displayEl = document.getElementById('timeChoiceValueDisplay');
    const displayBig = document.getElementById('timePickerDisplayBig');
    const str = timeInput ? timeInput.value : '';
    if (valueEl) valueEl.textContent = str;
    if (displayEl) displayEl.textContent = str;
    if (displayBig) {
        if (str) {
            const parts = str.split(':');
            displayBig.textContent = (parts[0] || '--') + ' : ' + (parts[1] || '--');
        } else {
            displayBig.textContent = '-- : --';
        }
    }
}

var TIME_PICKER_WHEEL_ITEM_H = 48;
var _timePickerWheelBound = false;
var _timePickerDraftHour = '';
var _timePickerDraftMinute = '';
var _wheelMetricsCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
var _timePickerWheelScrollRaf = 0;
var _studyMetaWheelScrollRaf = 0;
var _studyStartWheelScrollRaf = 0;

function populateTimePickerSelectOptions() {
    const hourSelect = document.getElementById('timePickerHour');
    const minuteSelect = document.getElementById('timePickerMinute');
    if (!hourSelect || !minuteSelect) return;
    if (hourSelect.dataset.built === '1') return;
    hourSelect.innerHTML = '<option value="">—</option>' + Array.from({ length: 24 }, (_, i) => {
        const v = String(i).padStart(2, '0');
        return `<option value="${v}">${v}</option>`;
    }).join('');
    minuteSelect.innerHTML = '<option value="">—</option>' + Array.from({ length: 60 }, (_, i) => {
        const v = String(i).padStart(2, '0');
        return `<option value="${v}">${v}</option>`;
    }).join('');
    hourSelect.dataset.built = '1';
    minuteSelect.dataset.built = '1';
}

function buildTimePickerWheelList(listEl, count) {
    if (!listEl || listEl.dataset.built === '1') return;
    listEl.innerHTML = Array.from({ length: count }, (_, i) => {
        const v = String(i).padStart(2, '0');
        return `<li class="time-picker-wheel__item" data-value="${v}">${v}</li>`;
    }).join('');
    listEl.dataset.built = '1';
}

function invalidateTimePickerWheelMetrics(listEl) {
    if (_wheelMetricsCache && listEl) _wheelMetricsCache.delete(listEl);
}

function getTimePickerWheelMetrics(listEl) {
    if (!listEl) {
        return { itemH: TIME_PICKER_WHEEL_ITEM_H, padTop: TIME_PICKER_WHEEL_ITEM_H, viewH: TIME_PICKER_WHEEL_ITEM_H * 3 };
    }
    if (_wheelMetricsCache) {
        var cached = _wheelMetricsCache.get(listEl);
        if (cached && cached.viewH === listEl.clientHeight && cached.scrollH === listEl.scrollHeight) {
            return cached;
        }
    }
    var item = listEl.querySelector('.time-picker-wheel__item');
    var itemH = item ? item.offsetHeight : TIME_PICKER_WHEEL_ITEM_H;
    var padTop = parseFloat(getComputedStyle(listEl).paddingTop) || itemH;
    var viewH = listEl.clientHeight || itemH * 3;
    var m = { itemH: itemH, padTop: padTop, viewH: viewH, scrollH: listEl.scrollHeight };
    if (_wheelMetricsCache) _wheelMetricsCache.set(listEl, m);
    return m;
}

function getTimePickerWheelIndex(listEl) {
    if (!listEl) return 0;
    var count = listEl.children ? listEl.children.length : 0;
    if (!count) return 0;
    var m = getTimePickerWheelMetrics(listEl);
    var center = listEl.scrollTop + m.viewH / 2;
    var idx = Math.round((center - m.padTop - m.itemH / 2) / m.itemH);
    return Math.max(0, Math.min(count - 1, idx));
}

function scrollTimePickerWheelToIndex(listEl, index, smooth) {
    if (!listEl) return;
    var count = listEl.children ? listEl.children.length : 0;
    if (!count) return;
    index = Math.max(0, Math.min(count - 1, index));
    var m = getTimePickerWheelMetrics(listEl);
    var top = m.padTop + index * m.itemH + m.itemH / 2 - m.viewH / 2;
    /* Instantâneo — smooth nativo deixa o relógio pesado */
    listEl.scrollTop = Math.max(0, top);
}

function setWheelActiveIndex(listEl, idx) {
    if (!listEl) return;
    var items = listEl.children;
    if (!items || !items.length) return;
    var prev = listEl._ecActiveIdx;
    if (prev === idx) return;
    if (prev != null && items[prev]) items[prev].classList.remove('is-active');
    if (items[idx]) items[idx].classList.add('is-active');
    listEl._ecActiveIdx = idx;
}

function syncTimePickerWheelActiveItems() {
    document.querySelectorAll('.time-picker-wheel__list').forEach(function (listEl) {
        setWheelActiveIndex(listEl, getTimePickerWheelIndex(listEl));
    });
}

function readTimePickerWheelDraftFromLists() {
    var hourList = document.getElementById('timePickerHourList');
    var minuteList = document.getElementById('timePickerMinuteList');
    if (hourList) {
        var hourIdx = getTimePickerWheelIndex(hourList);
        var hourItem = hourList.children[hourIdx];
        _timePickerDraftHour = hourItem ? (hourItem.getAttribute('data-value') || '') : '';
    }
    if (minuteList) {
        var minuteIdx = getTimePickerWheelIndex(minuteList);
        var minuteItem = minuteList.children[minuteIdx];
        _timePickerDraftMinute = minuteItem ? (minuteItem.getAttribute('data-value') || '') : '';
    }
    var hourSelect = document.getElementById('timePickerHour');
    var minuteSelect = document.getElementById('timePickerMinute');
    if (hourSelect) hourSelect.value = _timePickerDraftHour;
    if (minuteSelect) minuteSelect.value = _timePickerDraftMinute;
}

function getTimePickerPreviewText(h, m) {
    if (!h || !m) return 'Selecione hora e minuto para ver a prévia.';
    var text = getSchedulePreviewText({ timeOverride: h + ':' + m });
    if (text) {
        return text.replace(/^Essa rotina/, 'Sua rotina');
    }
    return 'Sua rotina acontecerá às ' + formatTimeForPreview(h + ':' + m) + ' todos os dias.';
}

function syncTimePickerWheelUI() {
    readTimePickerWheelDraftFromLists();
    syncTimePickerWheelActiveItems();
    var displayBig = document.getElementById('timePickerDisplayBig');
    if (displayBig) {
        displayBig.textContent = (_timePickerDraftHour || '--') + ' : ' + (_timePickerDraftMinute || '--');
    }
    var previewEl = document.getElementById('timePickerPreviewText');
    if (previewEl) {
        previewEl.textContent = getTimePickerPreviewText(_timePickerDraftHour, _timePickerDraftMinute);
    }
    var confirmBtn = document.getElementById('timePickerConfirm');
    if (confirmBtn) confirmBtn.disabled = !(_timePickerDraftHour && _timePickerDraftMinute);
}

function updateTimePickerWheelPreview() {
    var previewEl = document.getElementById('timePickerPreviewText');
    if (previewEl) {
        previewEl.textContent = getTimePickerPreviewText(_timePickerDraftHour, _timePickerDraftMinute);
    }
}

function flushTimePickerWheelScrollUi(isFinal) {
    readTimePickerWheelDraftFromLists();
    var hourList = document.getElementById('timePickerHourList');
    var minuteList = document.getElementById('timePickerMinuteList');
    if (hourList) setWheelActiveIndex(hourList, getTimePickerWheelIndex(hourList));
    if (minuteList) setWheelActiveIndex(minuteList, getTimePickerWheelIndex(minuteList));
    var displayBig = document.getElementById('timePickerDisplayBig');
    if (displayBig) {
        displayBig.textContent = (_timePickerDraftHour || '--') + ' : ' + (_timePickerDraftMinute || '--');
    }
    var confirmBtn = document.getElementById('timePickerConfirm');
    if (confirmBtn) confirmBtn.disabled = !(_timePickerDraftHour && _timePickerDraftMinute);
    if (isFinal) updateTimePickerWheelPreview();
}

function onTimePickerWheelScroll(listEl, isFinal) {
    if (isFinal) {
        if (_timePickerWheelScrollRaf) {
            cancelAnimationFrame(_timePickerWheelScrollRaf);
            _timePickerWheelScrollRaf = 0;
        }
        flushTimePickerWheelScrollUi(true);
        return;
    }
    if (_timePickerWheelScrollRaf) return;
    _timePickerWheelScrollRaf = requestAnimationFrame(function () {
        _timePickerWheelScrollRaf = 0;
        flushTimePickerWheelScrollUi(false);
    });
}

function nudgeTimePickerWheel(unit, direction) {
    var listId = unit === 'hour' ? 'timePickerHourList' : 'timePickerMinuteList';
    var max = unit === 'hour' ? 23 : 59;
    var listEl = document.getElementById(listId);
    if (!listEl) return;
    var idx = getTimePickerWheelIndex(listEl);
    var next = Math.max(0, Math.min(max, idx + direction));
    scrollTimePickerWheelToIndex(listEl, next, false);
    flushTimePickerWheelScrollUi(true);
}

function confirmTimePickerWheel() {
    if (!_timePickerDraftHour || !_timePickerDraftMinute) return;
    var confirmBtn = document.getElementById('timePickerConfirm');
    runStep4PickerLoadingAction('Salvando horário…', 'Aguarde um instante', confirmBtn, function () {
        var timeInput = document.getElementById('routineTime');
        if (timeInput) timeInput.value = _timePickerDraftHour + ':' + _timePickerDraftMinute;
        updateTimePickerDisplay();
        updateSchedulePreview();
        if (isStep4Active() && _step4PickerOpenType === 'time') {
            closeStep4Picker();
        } else {
            closeTimePickerPanel();
        }
        updateStep4SubmitState();
    }, null, 160);
}

function initTimePickerWheel() {
    populateTimePickerSelectOptions();
    buildTimePickerWheelList(document.getElementById('timePickerHourList'), 24);
    buildTimePickerWheelList(document.getElementById('timePickerMinuteList'), 60);
    if (_timePickerWheelBound) return;
    _timePickerWheelBound = true;
    ['timePickerHourList', 'timePickerMinuteList'].forEach(function (id) {
        var listEl = document.getElementById(id);
        if (!listEl) return;
        listEl.addEventListener('scroll', function () {
            onTimePickerWheelScroll(listEl, false);
        }, { passive: true });
        listEl.addEventListener('scrollend', function () {
            onTimePickerWheelScroll(listEl, true);
        }, { passive: true });
    });
    document.querySelectorAll('.time-picker-wheel__arrow').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var unit = btn.getAttribute('data-wheel');
            var dir = btn.classList.contains('time-picker-wheel__arrow--up') ? -1 : 1;
            nudgeTimePickerWheel(unit, dir);
        });
    });
    var confirmBtn = document.getElementById('timePickerConfirm');
    if (confirmBtn) confirmBtn.addEventListener('click', confirmTimePickerWheel);
}

function openTimePickerWheel() {
    const panel = document.getElementById('timePickerPanel');
    const timeInput = document.getElementById('routineTime');
    const hourList = document.getElementById('timePickerHourList');
    const minuteList = document.getElementById('timePickerMinuteList');
    if (!panel || !hourList || !minuteList) return;
    initTimePickerWheel();
    var h = '08';
    var m = '30';
    if (timeInput && timeInput.value) {
        var parts = timeInput.value.split(':');
        h = parts[0] || '08';
        m = parts[1] || '00';
    }
    _timePickerDraftHour = h;
    _timePickerDraftMinute = m;
    scrollTimePickerWheelToIndex(hourList, parseInt(h, 10) || 0, false);
    scrollTimePickerWheelToIndex(minuteList, parseInt(m, 10) || 0, false);
    panel.classList.add('time-picker-panel--open');
    requestAnimationFrame(function () {
        scrollTimePickerWheelToIndex(hourList, parseInt(h, 10) || 0, false);
        scrollTimePickerWheelToIndex(minuteList, parseInt(m, 10) || 0, false);
        syncTimePickerWheelUI();
    });
}

function initTimePickerPanel() {
    initTimePickerWheel();
}

function openTimePickerPanel() {
    openTimePickerWheel();
}

function closeTimePickerPanel() {
    const panel = document.getElementById('timePickerPanel');
    if (panel) panel.classList.remove('time-picker-panel--open');
}

function applyTimeFromPanel() {
    readTimePickerWheelDraftFromLists();
    var timeInput = document.getElementById('routineTime');
    if (!timeInput) return;
    if (_timePickerDraftHour && _timePickerDraftMinute) {
        timeInput.value = _timePickerDraftHour + ':' + _timePickerDraftMinute;
    } else {
        timeInput.value = '';
    }
    updateTimePickerDisplay();
    updateSchedulePreview();
}

function updateStep4SubmitState() {
    const btn = document.getElementById('btnCreateRoutine');
    if (!btn) return;
    const timeChoiceChecked = document.querySelector('input[name="timeChoice"]:checked');
    const noTimeChoice = !timeChoiceChecked;
    const planType = (document.querySelector('input[name="planType"]:checked') || {}).value || 'daily';
    const schedule = getScheduleFromStep4();
    const dailyDayTypeSpecific = document.getElementById('dailyDayTypeSpecific');
    const dailyNoDayType = planType === 'daily' && !document.querySelector('input[name="dailyDayType"]:checked');
    const dailySpecificNoDays = planType === 'daily' && dailyDayTypeSpecific && dailyDayTypeSpecific.checked && (!schedule.weekDays || schedule.weekDays.length === 0);
    const weeklyNoDays = planType === 'weekly' && (!schedule.weekDays || schedule.weekDays.length === 0);
    const monthlyIncomplete = planType === 'monthly' && (
        !schedule.monthlyType ||
        (schedule.monthlyType === 'dayOfMonth' && !schedule.dayOfMonth) ||
        (schedule.monthlyType === 'weekOfMonth' && (schedule.weekOfMonth == null || schedule.weekOfMonth === '' || schedule.dayOfWeek == null || schedule.dayOfWeek === ''))
    );
    if (isEstudosCreateFlow()) {
        const dailyNoDayTypeStudy = planType === 'daily' && !document.querySelector('input[name="dailyDayType"]:checked');
        const dailySpecificNoDaysStudy = planType === 'daily' && dailyDayTypeSpecific && dailyDayTypeSpecific.checked && (!schedule.weekDays || schedule.weekDays.length === 0);
        const studyGoalMissing = !isStudyGoalStep4Valid();
        btn.disabled = !!dailyNoDayTypeStudy || !!dailySpecificNoDaysStudy || !!studyGoalMissing;
        return;
    }
    if (planType === 'task') {
        btn.disabled = !!noTimeChoice;
    } else {
        btn.disabled = !!noTimeChoice || !!dailyNoDayType || !!dailySpecificNoDays || !!weeklyNoDays || !!monthlyIncomplete;
    }
    const hintEmpty = document.getElementById('weekdaysHintEmpty');
    const weekdaysGroup = document.getElementById('step4WeekdaysGroup');
    if (hintEmpty && weekdaysGroup) {
        const showHint = (planType === 'weekly' && weeklyNoDays) || (planType === 'daily' && dailyDayTypeSpecific && dailyDayTypeSpecific.checked && (!schedule.weekDays || schedule.weekDays.length === 0));
        hintEmpty.style.display = showHint ? 'block' : 'none';
    }
}

function setupStep4Listeners() {
    initStep4PickerModal();
    initCreateRoutineConfirmModal();
    initMonthlyWeekPatternPicker();
    const timePickerWrapper = document.getElementById('timePickerWrapper');
    const timeInput = document.getElementById('routineTime');
    var timeChoiceClickedRadio = null;
    var timeChoiceCheckedBefore = false;
    document.addEventListener('mousedown', function (e) {
        const label = e.target && e.target.closest && e.target.closest('#routineTimeGroup label.time-choice-option');
        if (!label) return;
        const radio = label.querySelector && label.querySelector('input[name="timeChoice"]');
        timeChoiceClickedRadio = radio || null;
        timeChoiceCheckedBefore = radio ? radio.checked : false;
    }, true);
    document.addEventListener('click', function (e) {
        const label = e.target && e.target.closest && e.target.closest('#routineTimeGroup label.time-choice-option');
        if (!label || !timeChoiceClickedRadio) return;
        setTimeout(function () {
            if (timeChoiceClickedRadio.checked && timeChoiceCheckedBefore) {
                timeChoiceClickedRadio.checked = false;
                if (timePickerWrapper) timePickerWrapper.style.display = 'none';
                closeTimePickerPanel();
                closeStep4Picker();
                if (timeInput) { timeInput.value = ''; updateTimePickerDisplay(); }
                updateSchedulePreview();
                updateStep4SubmitState();
            }
            timeChoiceClickedRadio = null;
        }, 0);
    }, false);
    document.querySelectorAll('input[name="timeChoice"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const fixed = document.querySelector('input[name="timeChoice"][value="fixed"]');
            const showPicker = fixed && fixed.checked;
            syncStep4TimePickerVisibility(showPicker);
            if (!showPicker) {
                if (timeInput) {
                    timeInput.value = '';
                    updateTimePickerDisplay();
                }
            }
            updateSchedulePreview();
            updateStep4SubmitState();
        });
    });
    /* Card de horário aparece ao selecionar "Horário fixo diário" (modal no passo 4) */
    initTimePickerWheel();
    document.addEventListener('click', (e) => {
        if (isStep4Active() && (_step4PickerOpenType === 'time' || _step4PickerOpenType === 'studyMeta' || _step4PickerOpenType === 'studyStart')) return;
        const panel = document.getElementById('timePickerPanel');
        const wrapper = document.getElementById('timePickerWrapper');
        if (panel && panel.classList.contains('time-picker-panel--open') && wrapper && !wrapper.contains(e.target)) {
            closeTimePickerPanel();
        }
    });
    if (timeInput) {
        timeInput.addEventListener('change', () => {
            updateTimePickerDisplay();
            updateSchedulePreview();
        });
        timeInput.addEventListener('input', updateTimePickerDisplay);
    }
    // Diário: segundo clique desmarca (toggle)
    var dailyDayTypeClickedRadio = null;
    var dailyDayTypeCheckedBefore = false;
    document.addEventListener('mousedown', function (e) {
        const label = e.target && e.target.closest && e.target.closest('#dailyDayTypeOptions label.daily-day-type-option');
        if (!label) return;
        const radio = label.querySelector && label.querySelector('input[name="dailyDayType"]');
        dailyDayTypeClickedRadio = radio || null;
        dailyDayTypeCheckedBefore = radio ? radio.checked : false;
    }, true);
    document.addEventListener('click', function (e) {
        const label = e.target && e.target.closest && e.target.closest('#dailyDayTypeOptions label.daily-day-type-option');
        if (!label || !dailyDayTypeClickedRadio) return;
        setTimeout(function () {
            if (dailyDayTypeClickedRadio.checked && dailyDayTypeCheckedBefore) {
                dailyDayTypeClickedRadio.checked = false;
                updateStep4Fields();
            }
            dailyDayTypeClickedRadio = null;
        }, 0);
    }, false);
    document.querySelectorAll('input[name="dailyDayType"]').forEach(radio => {
        radio.addEventListener('change', () => {
            updateStep4Fields();
        });
    });
    document.querySelectorAll('input[name="weekDay"]').forEach(cb => {
        cb.addEventListener('change', () => {
            updateSchedulePreview();
            updateStep4SubmitState();
        });
    });
    var weekdaysBackBtn = document.getElementById('step4WeekdaysBack');
    if (weekdaysBackBtn) weekdaysBackBtn.addEventListener('click', goBackFromWeekdayChips);
    var monthlyTypeClickedRadio = null;
    var monthlyTypeCheckedBefore = false;
    document.addEventListener('mousedown', function (e) {
        const label = e.target && e.target.closest && e.target.closest('#step4MonthlyGroup label.monthly-type-option');
        if (!label) return;
        const radio = label.querySelector && label.querySelector('input[name="monthlyType"]');
        monthlyTypeClickedRadio = radio || null;
        monthlyTypeCheckedBefore = radio ? radio.checked : false;
    }, true);
    document.addEventListener('click', function (e) {
        const label = e.target && e.target.closest && e.target.closest('#step4MonthlyGroup label.monthly-type-option');
        if (!label || !monthlyTypeClickedRadio) return;
        setTimeout(function () {
            if (monthlyTypeClickedRadio.checked && monthlyTypeCheckedBefore) {
                monthlyTypeClickedRadio.checked = false;
                const dayFixed = document.getElementById('monthlyDayFixed');
                const weekPattern = document.getElementById('monthlyWeekPattern');
                if (dayFixed) dayFixed.style.display = 'none';
                if (weekPattern) weekPattern.style.display = 'none';
                closeStep4Picker();
                updateSchedulePreview();
                updateStep4SubmitState();
            }
            monthlyTypeClickedRadio = null;
        }, 0);
    }, false);
    document.querySelectorAll('input[name="monthlyType"]').forEach(r => {
        r.addEventListener('change', () => {
            const mt = document.querySelector('input[name="monthlyType"]:checked');
            syncStep4MonthlyPickerVisibility(mt);
            updateSchedulePreview();
            updateStep4SubmitState();
        });
    });
    ['monthlyDayOfMonth', 'monthlyWeekOfMonth', 'monthlyDayOfWeek'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', function () {
                updateSchedulePreview();
                if (id === 'monthlyWeekOfMonth' || id === 'monthlyDayOfWeek') {
                    maybeCloseStep4MonthWeekPicker();
                }
            });
        }
    });
}

// Renderizar chips de categorias
var _categoriesRendered = false;

function ensureCategoriesRendered() {
    const container = document.getElementById('categorySuggestions');
    if (!container) return;
    if (_categoriesRendered && container.children.length > 0) return;
    _categoriesRendered = true;
    renderCategories();
    setupCategoryListeners();
    setupStudyGoalListeners();
}

function preloadCategoriesSoon() {
    if (_categoriesRendered) return;
    var run = function () {
        ensureCategoriesRendered();
    };
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 1200 });
    } else {
        setTimeout(run, 300);
    }
}

function initLucideIcons(scopeEl) {
    const lucideLib = typeof lucide !== 'undefined' ? lucide : (typeof Lucide !== 'undefined' ? Lucide : null);
    if (!lucideLib || !lucideLib.createIcons) return;
    if (scopeEl) {
        lucideLib.createIcons({ root: scopeEl });
    } else {
        lucideLib.createIcons();
    }
}

var _step2IconsReady = false;

function initStep2PremiumIcons() {
    if (_step2IconsReady) return;
    var step2 = document.getElementById('wizardStep2');
    if (!step2) return;
    initLucideIcons(step2);
    _step2IconsReady = true;
}

function renderCategories() {
    const container = document.getElementById('categorySuggestions');
    if (!container) return;
    container.innerHTML = ROUTINE_CATEGORIES.map(cat => `
        <button type="button" class="category-chip" data-category-id="${cat.id}" data-category-name="${escapeHtml(cat.name)}" data-category-icon="${escapeHtml(cat.icon)}">
            <span class="category-chip__check" aria-hidden="true"><i data-lucide="check"></i></span>
            <span class="chip-icon"><i data-lucide="${escapeHtml(cat.icon)}"></i></span>
            <span>${escapeHtml(cat.name)}</span>
        </button>
    `).join('');
    initLucideIcons(container);
}

// Configurar listeners de seleção de categoria
function setupCategoryListeners() {
    document.querySelectorAll('.category-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const wasSelected = chip.classList.contains('selected');
            document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('selected'));
            if (!wasSelected) {
                chip.classList.add('selected');
                chip.classList.remove('category-chip--pulse');
                void chip.offsetWidth;
                chip.classList.add('category-chip--pulse');
                chip.addEventListener(
                    'animationend',
                    function once() {
                        chip.classList.remove('category-chip--pulse');
                        chip.removeEventListener('animationend', once);
                    },
                    { once: true }
                );
                document.getElementById('routineCategory').value = JSON.stringify({
                    id: chip.dataset.categoryId,
                    name: chip.dataset.categoryName,
                    icon: chip.dataset.categoryIcon
                });
            } else {
                document.getElementById('routineCategory').value = '';
            }
            syncStudyGoalUiVisibility();
        });
    });
}

// Obter categoria selecionada
function getSelectedCategory() {
    const el = document.getElementById('routineCategory');
    if (el && el.value) {
        try {
            return JSON.parse(el.value);
        } catch {
            /* fall through to chip */
        }
    }
    var selectedChip = document.querySelector('.category-chip.selected');
    if (selectedChip) {
        return {
            id: selectedChip.dataset.categoryId || '',
            name: selectedChip.dataset.categoryName || '',
            icon: selectedChip.dataset.categoryIcon || 'clipboard-list'
        };
    }
    return null;
}

function applyCategoryToForm(category) {
    if (!category) return;
    ensureCategoriesRendered();
    var hidden = document.getElementById('routineCategory');
    if (!hidden) return;
    if (typeof category === 'string') {
        try {
            category = JSON.parse(category);
        } catch (e) {
            return;
        }
    }
    hidden.value = JSON.stringify(category);
    var catId = String(category.id || '').toLowerCase();
    document.querySelectorAll('.category-chip').forEach(function (chip) {
        var chipId = String(chip.dataset.categoryId || '').toLowerCase();
        chip.classList.toggle('selected', chipId === catId);
    });
    syncStudyGoalUiVisibility();
}

function isEstudosCategorySelected() {
    var cat = getSelectedCategory();
    if (!cat) return false;
    var id = String(cat.id || '').trim().toLowerCase();
    var name = String(cat.name || '').trim().toLowerCase();
    return id === 'estudos' || id === 'estudo' || name === 'estudos' || name === 'estudo';
}

var _studyMetaDraftHour = '00';
var _studyMetaDraftMinute = '00';
var _studyStartDraftHour = '';
var _studyStartDraftMinute = '';
var _studyMetaPickerBound = false;
var _studyStartPickerBound = false;
var _studyMetaSnapshotOnOpen = null;
var _studyStartSnapshotOnOpen = null;
/** true só depois de Continuar no picker (grava routineTime). */
var _studyStartCommitted = false;

function snapshotStudyMetaPickerState() {
    _studyMetaSnapshotOnOpen = {
        hour: _studyMetaDraftHour,
        minute: _studyMetaDraftMinute
    };
}

function studyMetaPickerHasChanges() {
    if (!_studyMetaSnapshotOnOpen) return false;
    return _studyMetaDraftHour !== _studyMetaSnapshotOnOpen.hour
        || _studyMetaDraftMinute !== _studyMetaSnapshotOnOpen.minute;
}

function restoreStudyMetaPickerSnapshot() {
    if (!_studyMetaSnapshotOnOpen) return;
    _studyMetaDraftHour = _studyMetaSnapshotOnOpen.hour;
    _studyMetaDraftMinute = _studyMetaSnapshotOnOpen.minute;
    scrollStudyGoalMetaPickerToDraft();
    syncStudyGoalMetaPickerUI();
}

function syncStudyGoalMetaPickerConfirmState() {
    var confirmBtn = document.getElementById('studyGoalMetaConfirm');
    if (confirmBtn) {
        confirmBtn.disabled = getStudyGoalMetaMinutes() <= 0;
    }
}

function confirmStudyGoalMetaPicker() {
    if (getStudyGoalMetaMinutes() <= 0) return;
    var confirmBtn = document.getElementById('studyGoalMetaConfirm');
    runStep4PickerLoadingAction('Salvando meta…', 'Aguarde um instante', confirmBtn, function () {
        snapshotStudyMetaPickerState();
        closeStep4Picker();
    }, null, 160);
}

function snapshotStudyStartPickerState() {
    _studyStartSnapshotOnOpen = {
        hour: _studyStartDraftHour,
        minute: _studyStartDraftMinute
    };
}

function studyStartPickerHasChanges() {
    if (!_studyStartSnapshotOnOpen) return false;
    return _studyStartDraftHour !== _studyStartSnapshotOnOpen.hour
        || _studyStartDraftMinute !== _studyStartSnapshotOnOpen.minute;
}

function restoreStudyStartPickerSnapshot() {
    if (!_studyStartSnapshotOnOpen) return;
    _studyStartDraftHour = _studyStartSnapshotOnOpen.hour;
    _studyStartDraftMinute = _studyStartSnapshotOnOpen.minute;
    scrollStudyGoalStartPickerToDraft();
    syncStudyGoalStartPickerUI();
    if (_studyStartDraftHour && _studyStartDraftMinute) {
        applyStudyStartTimeToSchedule();
    } else {
        clearStudyStartScheduleForMetaMode();
    }
}

function syncStudyGoalStartPickerConfirmState() {
    var confirmBtn = document.getElementById('studyGoalStartConfirm');
    if (confirmBtn) {
        confirmBtn.disabled = !getStudyStartTimeValue();
    }
}

function syncStudyStartDraftFromWheels() {
    var draft = readStudyPickerDraftFromLists('studyStartHourList', 'studyStartMinuteList');
    if (draft.hour && draft.minute) {
        _studyStartDraftHour = draft.hour;
        _studyStartDraftMinute = draft.minute;
    } else if (!_studyStartDraftHour || !_studyStartDraftMinute) {
        _studyStartDraftHour = '08';
        _studyStartDraftMinute = '00';
    }
}

function isStudyStartTimeCommitted() {
    var draft = getStudyStartTimeValue();
    if (!draft || !_studyStartCommitted) return false;
    var timeInput = document.getElementById('routineTime');
    var applied = timeInput ? String(timeInput.value || '').trim() : '';
    return applied === draft;
}

function confirmStudyGoalStartPicker() {
    syncStudyStartDraftFromWheels();
    if (!getStudyStartTimeValue()) return;
    var confirmBtn = document.getElementById('studyGoalStartConfirm');
    runStep4PickerLoadingAction('Salvando horário…', 'Aguarde um instante', confirmBtn, function () {
        applyStudyStartTimeToSchedule();
        _studyStartCommitted = true;
        snapshotStudyStartPickerState();
        updateStudyGoalStartDisplay();
        closeStep4Picker();
    }, function () {
        syncStudyGoalStartPickerConfirmState();
    }, 160);
}

function syncStudyPickerWheelActiveItems(hourListId, minuteListId) {
    [hourListId, minuteListId].forEach(function (id) {
        var listEl = document.getElementById(id);
        if (!listEl) return;
        setWheelActiveIndex(listEl, getTimePickerWheelIndex(listEl));
    });
}

function readStudyPickerDraftFromLists(hourListId, minuteListId) {
    var hour = '';
    var minute = '';
    var hourList = document.getElementById(hourListId);
    var minuteList = document.getElementById(minuteListId);
    if (hourList) {
        var hourIdx = getTimePickerWheelIndex(hourList);
        var hourItem = hourList.children[hourIdx];
        hour = hourItem ? (hourItem.getAttribute('data-value') || '') : '';
    }
    if (minuteList) {
        var minuteIdx = getTimePickerWheelIndex(minuteList);
        var minuteItem = minuteList.children[minuteIdx];
        minute = minuteItem ? (minuteItem.getAttribute('data-value') || '') : '';
    }
    return { hour: hour, minute: minute };
}

function nudgeStudyPickerWheel(pickerKey, unit, direction) {
    var cfg = pickerKey === 'meta'
        ? { hourListId: 'studyGoalMetaHourList', minuteListId: 'studyGoalMetaMinuteList', hourMax: 8 }
        : { hourListId: 'studyStartHourList', minuteListId: 'studyStartMinuteList', hourMax: 23 };
    var listId = unit === 'hour' ? cfg.hourListId : cfg.minuteListId;
    var max = unit === 'hour' ? cfg.hourMax : 59;
    var listEl = document.getElementById(listId);
    if (!listEl) return;
    var idx = getTimePickerWheelIndex(listEl);
    var next = Math.max(0, Math.min(max, idx + direction));
    scrollTimePickerWheelToIndex(listEl, next, false);
    if (pickerKey === 'meta') flushStudyMetaPickerScroll(true);
    else flushStudyStartPickerScroll(true);
}

function syncStudyGoalMetaPickerUI() {
    var display = document.getElementById('studyGoalMetaDisplay');
    if (display) {
        display.textContent = (_studyMetaDraftHour || '--') + ' : ' + (_studyMetaDraftMinute || '--');
    }
    syncStudyPickerWheelActiveItems('studyGoalMetaHourList', 'studyGoalMetaMinuteList');
    syncStudyGoalMetaPickerConfirmState();
    updateStudyGoalMetaDisplay();
}

function formatStudyGoalMetaValueDisplay() {
    var minutes = getStudyGoalMetaMinutes();
    if (!minutes || minutes <= 0) return '';
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function updateStudyGoalMetaDisplay() {
    var displayEl = document.getElementById('studyGoalMetaValueDisplay');
    if (displayEl) {
        displayEl.textContent = formatStudyGoalMetaValueDisplay();
    }
}

function syncStudyGoalStartPickerUI() {
    var display = document.getElementById('studyGoalStartDisplay');
    if (display) {
        display.textContent = (_studyStartDraftHour && _studyStartDraftMinute)
            ? (_studyStartDraftHour + ' : ' + _studyStartDraftMinute)
            : '-- : --';
    }
    syncStudyPickerWheelActiveItems('studyStartHourList', 'studyStartMinuteList');
    syncStudyGoalStartPickerConfirmState();
}

function updateStudyGoalStartDisplay() {
    var displayEl = document.getElementById('studyGoalStartValueDisplay');
    if (displayEl) {
        displayEl.textContent = isStudyStartTimeCommitted() ? getStudyStartTimeValue() : '';
    }
}

function flushStudyMetaPickerScroll(isFinal) {
    var draft = readStudyPickerDraftFromLists('studyGoalMetaHourList', 'studyGoalMetaMinuteList');
    _studyMetaDraftHour = draft.hour;
    _studyMetaDraftMinute = draft.minute;
    var display = document.getElementById('studyGoalMetaDisplay');
    if (display) {
        display.textContent = (_studyMetaDraftHour || '--') + ' : ' + (_studyMetaDraftMinute || '--');
    }
    syncStudyPickerWheelActiveItems('studyGoalMetaHourList', 'studyGoalMetaMinuteList');
    if (isFinal) {
        syncStudyGoalMetaPickerConfirmState();
        updateStudyGoalMetaDisplay();
        updateSchedulePreview();
        updateStep4SubmitState();
    }
}

function flushStudyStartPickerScroll(isFinal) {
    var draft = readStudyPickerDraftFromLists('studyStartHourList', 'studyStartMinuteList');
    _studyStartDraftHour = draft.hour;
    _studyStartDraftMinute = draft.minute;
    var display = document.getElementById('studyGoalStartDisplay');
    if (display) {
        display.textContent = (_studyStartDraftHour && _studyStartDraftMinute)
            ? (_studyStartDraftHour + ' : ' + _studyStartDraftMinute)
            : '-- : --';
    }
    syncStudyPickerWheelActiveItems('studyStartHourList', 'studyStartMinuteList');
    if (isFinal) {
        syncStudyGoalStartPickerConfirmState();
        updateSchedulePreview();
        updateStep4SubmitState();
    }
}

function onStudyMetaPickerScroll(isFinal) {
    if (isFinal) {
        if (_studyMetaWheelScrollRaf) {
            cancelAnimationFrame(_studyMetaWheelScrollRaf);
            _studyMetaWheelScrollRaf = 0;
        }
        flushStudyMetaPickerScroll(true);
        return;
    }
    if (_studyMetaWheelScrollRaf) return;
    _studyMetaWheelScrollRaf = requestAnimationFrame(function () {
        _studyMetaWheelScrollRaf = 0;
        flushStudyMetaPickerScroll(false);
    });
}

function onStudyStartPickerScroll(isFinal) {
    if (isFinal) {
        if (_studyStartWheelScrollRaf) {
            cancelAnimationFrame(_studyStartWheelScrollRaf);
            _studyStartWheelScrollRaf = 0;
        }
        flushStudyStartPickerScroll(true);
        return;
    }
    if (_studyStartWheelScrollRaf) return;
    _studyStartWheelScrollRaf = requestAnimationFrame(function () {
        _studyStartWheelScrollRaf = 0;
        flushStudyStartPickerScroll(false);
    });
}

function bindStudyGoalPickerWheel(pickerKey) {
    var isMeta = pickerKey === 'meta';
    var hourListId = isMeta ? 'studyGoalMetaHourList' : 'studyStartHourList';
    var minuteListId = isMeta ? 'studyGoalMetaMinuteList' : 'studyStartMinuteList';
    var hourCount = isMeta ? 9 : 24;
    buildTimePickerWheelList(document.getElementById(hourListId), hourCount);
    buildTimePickerWheelList(document.getElementById(minuteListId), 60);
    if (isMeta ? _studyMetaPickerBound : _studyStartPickerBound) return;
    if (isMeta) _studyMetaPickerBound = true;
    else _studyStartPickerBound = true;
    var onScroll = isMeta ? onStudyMetaPickerScroll : onStudyStartPickerScroll;
    [hourListId, minuteListId].forEach(function (id) {
        var listEl = document.getElementById(id);
        if (!listEl) return;
        listEl.addEventListener('scroll', function () {
            onScroll(false);
        }, { passive: true });
        listEl.addEventListener('scrollend', function () {
            onScroll(true);
        }, { passive: true });
    });
    document.querySelectorAll('[data-study-picker="' + pickerKey + '"].time-picker-wheel__arrow').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var unit = btn.getAttribute('data-wheel');
            var dir = btn.classList.contains('time-picker-wheel__arrow--up') ? -1 : 1;
            nudgeStudyPickerWheel(pickerKey, unit, dir);
        });
    });
}

function scrollStudyGoalMetaPickerToDraft() {
    var hourList = document.getElementById('studyGoalMetaHourList');
    var minuteList = document.getElementById('studyGoalMetaMinuteList');
    if (!hourList || !minuteList) return;
    scrollTimePickerWheelToIndex(hourList, parseInt(_studyMetaDraftHour, 10) || 0, false);
    scrollTimePickerWheelToIndex(minuteList, parseInt(_studyMetaDraftMinute, 10) || 0, false);
    syncStudyGoalMetaPickerUI();
}

function scrollStudyGoalStartPickerToDraft() {
    var hourList = document.getElementById('studyStartHourList');
    var minuteList = document.getElementById('studyStartMinuteList');
    if (!hourList || !minuteList) return;
    if (!_studyStartDraftHour || !_studyStartDraftMinute) {
        _studyStartDraftHour = '08';
        _studyStartDraftMinute = '00';
    }
    scrollTimePickerWheelToIndex(hourList, parseInt(_studyStartDraftHour, 10) || 0, false);
    scrollTimePickerWheelToIndex(minuteList, parseInt(_studyStartDraftMinute, 10) || 0, false);
    syncStudyGoalStartPickerUI();
}

function initStudyGoalMetaPicker() {
    bindStudyGoalPickerWheel('meta');
    scrollStudyGoalMetaPickerToDraft();
}

function initStudyGoalStartPicker() {
    bindStudyGoalPickerWheel('start');
    scrollStudyGoalStartPickerToDraft();
}

function getStudyGoalMetaMinutes() {
    var h = parseInt(_studyMetaDraftHour, 10);
    var m = parseInt(_studyMetaDraftMinute, 10);
    if (isNaN(h)) h = 0;
    if (isNaN(m)) m = 0;
    return h * 60 + m;
}

function getStudyStartTimeValue() {
    if (!_studyStartDraftHour || !_studyStartDraftMinute) return '';
    return _studyStartDraftHour + ':' + _studyStartDraftMinute;
}

function applyStudyStartTimeToSchedule() {
    var time = getStudyStartTimeValue();
    if (!time) return;
    var timeInput = document.getElementById('routineTime');
    if (timeInput) timeInput.value = time;
    var fixed = document.querySelector('input[name="timeChoice"][value="fixed"]');
    if (fixed) fixed.checked = true;
    var any = document.querySelector('input[name="timeChoice"][value="any"]');
    if (any) any.checked = false;
    _studyStartCommitted = true;
    if (typeof updateTimePickerDisplay === 'function') updateTimePickerDisplay();
}

function clearStudyStartScheduleForMetaMode() {
    var timeInput = document.getElementById('routineTime');
    if (timeInput) timeInput.value = '';
    _studyStartCommitted = false;
    ensureStudyDefaultSchedule();
    if (typeof updateTimePickerDisplay === 'function') updateTimePickerDisplay();
}

function setStudyGoalMetaFromMinutes(totalMinutes) {
    var minutes = parseInt(totalMinutes, 10);
    if (isNaN(minutes) || minutes < 0) minutes = 0;
    var h = Math.min(8, Math.floor(minutes / 60));
    var m = minutes % 60;
    _studyMetaDraftHour = String(h).padStart(2, '0');
    _studyMetaDraftMinute = String(m).padStart(2, '0');
    initStudyGoalMetaPicker();
}

function setStudyStartTimeFromValue(timeStr) {
    if (!timeStr) return;
    var parts = String(timeStr).split(':');
    _studyStartDraftHour = (parts[0] || '08').padStart(2, '0');
    _studyStartDraftMinute = (parts[1] || '00').padStart(2, '0');
    initStudyGoalStartPicker();
    applyStudyStartTimeToSchedule();
    updateStudyGoalStartDisplay();
}

function clearInactiveStudyGoalMode(activeType) {
    if (activeType === 'time') {
        _studyStartDraftHour = '';
        _studyStartDraftMinute = '';
        _studyStartCommitted = false;
        clearStudyStartScheduleForMetaMode();
        updateStudyGoalStartDisplay();
        return;
    }
    if (activeType === 'startTime') {
        _studyMetaDraftHour = '00';
        _studyMetaDraftMinute = '00';
        updateStudyGoalMetaDisplay();
    }
}

function syncStudyGoalTargetPanels() {
    var typeEl = document.querySelector('input[name="studyGoalType"]:checked');
    var type = typeEl ? typeEl.value : null;
    var metaWrapper = document.getElementById('studyGoalMetaPickerWrapper');
    var startWrapper = document.getElementById('studyGoalStartPickerWrapper');
    if (metaWrapper && isStep4Active()) metaWrapper.style.display = 'none';
    if (startWrapper && isStep4Active()) startWrapper.style.display = 'none';
    if (type === 'time') {
        updateStudyGoalMetaDisplay();
    } else if (_step4PickerOpenType === 'studyMeta') {
        syncStep4StudyMetaPickerVisibility(false);
    }
    if (type === 'startTime') {
        updateStudyGoalStartDisplay();
    } else if (_step4PickerOpenType === 'studyStart') {
        syncStep4StudyStartPickerVisibility(false);
    }
}

function isStudyGoalStep4Valid() {
    var typeEl = document.querySelector('input[name="studyGoalType"]:checked');
    if (!typeEl) return false;
    if (typeEl.value === 'startTime') {
        return isStudyStartTimeCommitted();
    }
    var minutes = getStudyGoalMetaMinutes();
    return minutes > 0;
}

function isStudyCreateModeFromUrl() {
    var p = new URLSearchParams(window.location.search);
    return p.get('tipo') === 'estudos' || p.get('estudos') === '1';
}

function isEstudosCreateFlow() {
    return isStudyCreateModeFromUrl() || isEstudosCategorySelected();
}

function ensureDailyPlanForEstudos() {
    if (!isEstudosCreateFlow()) return;
    var daily = document.getElementById('planTypeDaily');
    if (daily) daily.checked = true;
}

function ensureStudyDefaultSchedule() {
    if (!isEstudosCreateFlow()) return;
    var any = document.getElementById('timeChoiceAny');
    if (any && !document.querySelector('input[name="timeChoice"]:checked')) {
        any.checked = true;
    }
}

function syncEstudosCreateUi() {
    var studyFlow = isEstudosCreateFlow();
    document.documentElement.classList.toggle('create-wizard--estudos', studyFlow);

    if (isStudyCreateModeFromUrl() && !isEstudosCategorySelected()) {
        applyCategoryToForm({ id: 'estudos', name: 'Estudos', icon: 'book-open' });
        studyFlow = true;
    }

    var step2Title = document.querySelector('.step2-premium-title');
    var step2Sub = document.querySelector('.step2-premium-subtitle');
    if (step2Title) {
        step2Title.textContent = studyFlow ? 'Criar rotina de estudos' : 'Criar Nova Tarefa';
    }
    if (step2Sub) {
        step2Sub.textContent = studyFlow
            ? 'Organize suas sessões e metas diárias.'
            : 'Construa hábitos que constroem resultados.';
    }

    var step4Title = document.querySelector('#wizardStep4 .create-title');
    var step4Sub = document.querySelector('#wizardStep4 .step4-premium-subtitle');
    if (step4Title) {
        step4Title.textContent = studyFlow ? 'Criar rotina de estudos' : 'Criar Nova Tarefa';
    }
    if (step4Sub) {
        step4Sub.textContent = studyFlow
            ? 'Defina sua meta diária e em quais dias vai estudar.'
            : 'Escolha como essa tarefa acontecerá.';
    }

    var step4El = document.getElementById('wizardStep4');
    if (step4El) step4El.classList.toggle('create-step-4--estudos', studyFlow);

    if (studyFlow) {
        ensureDailyPlanForEstudos();
        ensureStudyDefaultSchedule();
        syncStudyGoalTargetPanels();
        if (typeof updateStep4Fields === 'function') updateStep4Fields();
    }

    var block = document.getElementById('step4StudyGoalGroup');
    var divider = document.getElementById('step4StudyGoalDivider');
    if (block) {
        if (studyFlow) block.style.removeProperty('display');
        else block.style.setProperty('display', 'none', 'important');
    }
    if (divider) {
        if (studyFlow) divider.style.removeProperty('display');
        else divider.style.setProperty('display', 'none', 'important');
    }
}

function syncStudyGoalUiVisibility() {
    syncEstudosCreateUi();
}

function resolveStudyGoalForSave() {
    if (!isEstudosCategorySelected()) return null;
    var typeEl = document.querySelector('input[name="studyGoalType"]:checked');
    if (!typeEl || typeEl.value !== 'time') return null;
    var minutes = getStudyGoalMetaMinutes();
    if (!minutes || minutes <= 0) return null;
    return { type: 'time', target: minutes };
}

function applyStudyGoalToForm(goal, schedule) {
    syncStudyGoalUiVisibility();
    if (goal && typeof goal === 'object' && goal.type === 'time' && parseInt(goal.target, 10) > 0) {
        var typeInput = document.querySelector('input[name="studyGoalType"][value="time"]');
        if (typeInput) typeInput.checked = true;
        clearStudyStartScheduleForMetaMode();
        syncStudyGoalTargetPanels();
        setStudyGoalMetaFromMinutes(goal.target);
        updateStudyGoalMetaDisplay();
        updateSchedulePreview();
        updateStep4SubmitState();
        return;
    }
    if (schedule && schedule.time) {
        var startInput = document.querySelector('input[name="studyGoalType"][value="startTime"]');
        if (startInput) startInput.checked = true;
        syncStudyGoalTargetPanels();
        setStudyStartTimeFromValue(schedule.time);
        updateStudyGoalStartDisplay();
        updateSchedulePreview();
        updateStep4SubmitState();
    }
}

function setupStudyGoalListeners() {
    initStudyGoalMetaPicker();
    initStudyGoalStartPicker();
    var studyGoalMetaClickedRadio = null;
    var studyGoalMetaCheckedBefore = false;
    var studyGoalStartClickedRadio = null;
    var studyGoalStartCheckedBefore = false;
    document.addEventListener('mousedown', function (e) {
        var metaLabel = e.target && e.target.closest && e.target.closest('#labelStudyGoalMeta');
        var startLabel = e.target && e.target.closest && e.target.closest('#labelStudyGoalStart');
        if (metaLabel) {
            var metaRadio = metaLabel.querySelector && metaLabel.querySelector('input[name="studyGoalType"]');
            studyGoalMetaClickedRadio = metaRadio || null;
            studyGoalMetaCheckedBefore = metaRadio ? metaRadio.checked : false;
            studyGoalStartClickedRadio = null;
            return;
        }
        if (startLabel) {
            var startRadio = startLabel.querySelector && startLabel.querySelector('input[name="studyGoalType"]');
            studyGoalStartClickedRadio = startRadio || null;
            studyGoalStartCheckedBefore = startRadio ? startRadio.checked : false;
            studyGoalMetaClickedRadio = null;
        }
    }, true);
    document.addEventListener('click', function (e) {
        if (studyGoalMetaClickedRadio) {
            var metaLabel = e.target && e.target.closest && e.target.closest('#labelStudyGoalMeta');
            if (metaLabel) {
                setTimeout(function () {
                    if (studyGoalMetaClickedRadio.checked && studyGoalMetaCheckedBefore) {
                        studyGoalMetaClickedRadio.checked = false;
                        _studyMetaDraftHour = '00';
                        _studyMetaDraftMinute = '00';
                        syncStep4StudyMetaPickerVisibility(false);
                        closeStep4Picker();
                        updateStudyGoalMetaDisplay();
                        updateSchedulePreview();
                        updateStep4SubmitState();
                    }
                    studyGoalMetaClickedRadio = null;
                }, 0);
            }
            return;
        }
        if (studyGoalStartClickedRadio) {
            var startLabel = e.target && e.target.closest && e.target.closest('#labelStudyGoalStart');
            if (startLabel) {
                setTimeout(function () {
                    if (studyGoalStartClickedRadio.checked && studyGoalStartCheckedBefore) {
                        /* Já selecionado: reabrir o picker (não desmarcar). */
                        syncStep4StudyStartPickerVisibility(true);
                    }
                    studyGoalStartClickedRadio = null;
                }, 0);
            }
        }
    }, false);
    document.querySelectorAll('input[name="studyGoalType"]').forEach(function (input) {
        input.addEventListener('change', function () {
            if (!input.checked) return;
            if (input.value === 'time') {
                _studyMetaDraftHour = '00';
                _studyMetaDraftMinute = '00';
                updateStudyGoalMetaDisplay();
                syncStep4StudyStartPickerVisibility(false);
            } else if (input.value === 'startTime') {
                // Default visual do wheel é 08:00 — precisa bater no draft senão Continuar fica bloqueado
                if (!_studyStartDraftHour || !_studyStartDraftMinute) {
                    _studyStartDraftHour = '08';
                    _studyStartDraftMinute = '00';
                }
                if (!isStudyStartTimeCommitted()) {
                    _studyStartCommitted = false;
                }
                updateStudyGoalStartDisplay();
                syncStep4StudyMetaPickerVisibility(false);
            }
            clearInactiveStudyGoalMode(input.value);
            syncStudyGoalTargetPanels();
            if (input.value === 'time') {
                syncStep4StudyMetaPickerVisibility(true);
            } else if (input.value === 'startTime') {
                syncStep4StudyStartPickerVisibility(true);
            }
            updateSchedulePreview();
            updateStep4SubmitState();
        });
    });
}

function resolveCategoryForSave(editId) {
    var category = getSelectedCategory();
    if (editId && !category && editingRoutineSnapshot && editingRoutineSnapshot.category) {
        category = editingRoutineSnapshot.category;
    }
    return category;
}

// Configurar input de tarefas
function setupTaskInput() {
    const addTaskBtn = document.getElementById('addTaskBtn');
    const newTaskInput = document.getElementById('newTaskInput');

    if (addTaskBtn) addTaskBtn.addEventListener('click', addTask);
    if (newTaskInput) newTaskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTask();
        }
    });
}

// Adicionar tarefa
function addTask() {
    const input = document.getElementById('newTaskInput');
    const text = input.value.trim();

    if (!text) {
        return;
    }

    const task = {
        id: Date.now().toString(),
        text: text,
        completed: false,
        completedDates: [],
        createdAt: new Date().toISOString()
    };

    initialTasks.push(task);
    input.value = '';
    renderTasks();
}

// Remover tarefa
function removeTask(taskId) {
    initialTasks = initialTasks.filter(t => t.id !== taskId);
    renderTasks();
}

// Renderizar tarefas
function renderTasks() {
    const tasksList = document.getElementById('tasksList');
    
    if (initialTasks.length === 0) {
        tasksList.innerHTML = '';
        return;
    }

    tasksList.innerHTML = initialTasks.map(task => `
        <div class="task-preview-item">
            <span class="task-preview-text">${escapeHtml(task.text)}</span>
            ${typeof trashBinButtonHTML === 'function' ? trashBinButtonHTML({ className: 'task-preview-remove delete', modifier: 'uiverse-trash-btn--card', dataAttrs: { 'data-task-id': String(task.id) }, ariaLabel: 'Remover tarefa', title: 'Remover tarefa' }) : `<button type="button" class="task-preview-remove" data-task-id="${task.id}">×</button>`}
        </div>
    `).join('');

    // Adicionar event listeners
    document.querySelectorAll('.task-preview-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const taskId = e.currentTarget.dataset.taskId;
            removeTask(taskId);
        });
    });
}

// Carregar rotina para edição
async function loadRoutineForEdit(routineId) {
    const token = localStorage.getItem('token');
    let routine = null;

    if (token) {
        try {
            const routines = await apiRequest('/routines');
            routine = routines.find(r => r.id === routineId);
        } catch (error) {
            console.log('Servidor não disponível, carregando localmente');
        }
    }

    if (!routine) {
        const routines = JSON.parse(localStorage.getItem('localRoutines') || '[]');
        routine = routines.find(r => r.id === routineId);
    }

    if (routine) {
        editingRoutineSnapshot = routine;
        if (routine.planType === 'monthly' && routine.schedule) {
            const s = routine.schedule;
            if (s.monthlyType === 'dayOfMonth') {
                delete s.weekOfMonth;
                delete s.dayOfWeek;
            } else if (s.monthlyType === 'weekOfMonth') {
                delete s.dayOfMonth;
            }
        }
        document.getElementById('routineTitle').value = routine.title;
        document.getElementById('routineDescription').value = routine.description || '';
        const planType = routine.planType || 'daily';
        const planRadio = document.querySelector(`input[name="planType"][value="${planType}"]`);
        if (planRadio) planRadio.checked = true;
        const bulletType = routine.bulletType || 'task';
        const bulletRadio = document.querySelector(`input[name="bulletType"][value="${bulletType}"]`);
        if (bulletRadio) bulletRadio.checked = true;
        document.getElementById('routineObjectives').value = routine.objectives || '';
        document.getElementById('routineReasons').value = routine.reasons || '';
        const contextEl = document.getElementById('routineContext');
        if (contextEl) contextEl.value = routine.context || '';
        const timeEl = document.getElementById('routineTime');
        const timeChoiceFixed = document.querySelector('input[name="timeChoice"][value="fixed"]');
        const timeChoiceAny = document.querySelector('input[name="timeChoice"][value="any"]');
        const timePickerWrapper = document.getElementById('timePickerWrapper');
        if (routine.schedule?.time) {
            timeEl.value = routine.schedule.time;
            if (timeChoiceFixed) timeChoiceFixed.checked = true;
            if (timeChoiceAny) timeChoiceAny.checked = false;
            if (timePickerWrapper) timePickerWrapper.style.display = 'inline-flex';
        } else {
            if (timeChoiceFixed) timeChoiceFixed.checked = false;
            if (timeChoiceAny) timeChoiceAny.checked = true;
            timeEl.value = '';
            if (timePickerWrapper) timePickerWrapper.style.display = 'none';
        }
        updateTimePickerDisplay();
        if (routine.schedule?.weekDays && Array.isArray(routine.schedule.weekDays)) {
            document.querySelectorAll('input[name="weekDay"]').forEach(cb => { cb.checked = false; });
            routine.schedule.weekDays.forEach(d => {
                const cb = document.querySelector(`input[name="weekDay"][value="${d}"]`);
                if (cb) cb.checked = true;
            });
            const dailyDayTypeAll = document.getElementById('dailyDayTypeAll');
            const dailyDayTypeSpecific = document.getElementById('dailyDayTypeSpecific');
            if (routine.planType === 'daily' && dailyDayTypeAll && dailyDayTypeSpecific) {
                if (routine.schedule.weekDays.length < 7) {
                    dailyDayTypeSpecific.checked = true;
                    dailyDayTypeAll.checked = false;
                } else {
                    dailyDayTypeAll.checked = true;
                    dailyDayTypeSpecific.checked = false;
                }
            }
        } else if (routine.planType === 'daily') {
            const dailyDayTypeAll = document.getElementById('dailyDayTypeAll');
            const dailyDayTypeSpecific = document.getElementById('dailyDayTypeSpecific');
            if (dailyDayTypeAll) dailyDayTypeAll.checked = true;
            if (dailyDayTypeSpecific) dailyDayTypeSpecific.checked = false;
            document.querySelectorAll('input[name="weekDay"]').forEach(cb => { cb.checked = false; });
        }
        if (routine.schedule?.monthlyType === 'dayOfMonth' && routine.schedule?.dayOfMonth) {
            const radio = document.querySelector('input[name="monthlyType"][value="dayOfMonth"]');
            if (radio) radio.checked = true;
            const sel = document.getElementById('monthlyDayOfMonth');
            if (sel) sel.value = String(routine.schedule.dayOfMonth);
            const dayFixed = document.getElementById('monthlyDayFixed');
            const weekPattern = document.getElementById('monthlyWeekPattern');
            if (dayFixed) dayFixed.style.display = 'flex';
            if (weekPattern) weekPattern.style.display = 'none';
            const calendarEl = document.getElementById('monthlyDayCalendar');
            if (calendarEl) renderMonthlyDayCalendar(calendarEl);
        }
        if (routine.schedule?.monthlyType === 'weekOfMonth') {
            const radio = document.querySelector('input[name="monthlyType"][value="weekOfMonth"]');
            if (radio) radio.checked = true;
            const wSel = document.getElementById('monthlyWeekOfMonth');
            const dSel = document.getElementById('monthlyDayOfWeek');
            if (wSel) wSel.value = routine.schedule.weekOfMonth === 'last' ? 'last' : String(routine.schedule.weekOfMonth);
            if (dSel && routine.schedule.dayOfWeek != null) dSel.value = String(routine.schedule.dayOfWeek);
            syncMonthlyPatternCardsFromSelects();
            updateMonthlyPatternPreview();
            const dayFixed = document.getElementById('monthlyDayFixed');
            const weekPattern = document.getElementById('monthlyWeekPattern');
            if (dayFixed) dayFixed.style.display = 'none';
            if (weekPattern) weekPattern.style.display = 'flex';
        }
        if (routine.tasks) {
            initialTasks = routine.tasks;
            renderTasks();
        }
        document.querySelectorAll('.create-title').forEach(el => { el.textContent = 'Editar Rotina'; });
        const submitBtn = document.querySelector('.btn-create');
        if (submitBtn) submitBtn.textContent = 'Salvar Alterações';
        applyCategoryToForm(routine.category);
        applyStudyGoalToForm(routine.studyGoal, routine.schedule);
    }
}

// Função auxiliar para escapar HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Função para fazer requisições à API
async function apiRequest(endpoint, options = {}) {
    try {
        const token = localStorage.getItem('token');
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers
        });

        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            throw new Error(text || 'Erro na requisição');
        }

        if (!response.ok) {
            const reqError = new Error(data.error || 'Erro na requisição');
            reqError.status = response.status;
            throw reqError;
        }

        return data;
    } catch (error) {
        console.error('Erro na requisição:', error);
        
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            const netError = new Error('Servidor não disponível');
            netError.code = 'NETWORK_UNAVAILABLE';
            throw netError;
        }
        
        throw error;
    }
}

function shouldFallbackToOffline(error) {
    if (!error) return false;
    if (error.code === 'NETWORK_UNAVAILABLE') return true;
    if (typeof error.status === 'number' && error.status >= 500) return true;
    const msg = String(error.message || '').toLowerCase();
    return (
        msg.includes('servidor não disponível') ||
        msg.includes('failed to fetch') ||
        msg.includes('networkerror')
    );
}

function isAuthError(error) {
    if (!error) return false;
    if (error.status === 401 || error.status === 403) return true;
    const msg = String(error.message || '').toLowerCase();
    return (
        msg.includes('token') ||
        msg.includes('não autorizado') ||
        msg.includes('nao autorizado') ||
        msg.includes('unauthorized')
    );
}

// Criar rotina
async function handleCreateRoutine(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (window.__creatingRoutine || window.__awaitingCreateConfirm) return;
    const btnCreate = document.getElementById('btnCreateRoutine');
    if (btnCreate && btnCreate.disabled) return;

    const titleTrimmed = ((document.getElementById('routineTitle') || {}).value || '').trim();
    const titleForConfirm = titleTrimmed || 'Sem título';
    const scheduleText = getSchedulePreviewText();
    if (!scheduleText) {
        updateStep4SubmitState();
        if (typeof showRoutineToast === 'function') {
            showRoutineToast('Complete as opções do passo 4 antes de criar.');
        } else {
            alert('Complete as opções do passo 4 antes de criar.');
        }
        return;
    }

    const loadingCopy = getCreateRoutineLoadingCopy();
    setCreateRoutineButtonLoading(true);

    /* Confirmação primeiro — sem overlay por cima do modal */
    window.__awaitingCreateConfirm = true;
    let confirmed = false;
    try {
        confirmed = await waitForCreateRoutineConfirm(titleForConfirm, scheduleText);
    } finally {
        window.__awaitingCreateConfirm = false;
    }
    if (!confirmed) {
        setCreateRoutineButtonLoading(false);
        return;
    }

    showStep4CreateLoading(loadingCopy.createTitle, loadingCopy.subtitle);

    window.__creatingRoutine = true;
    if (btnCreate) btnCreate.disabled = true;
    try {
        const result = await handleCreateRoutineImpl();
        if (result !== 'redirect') {
            hideStep4CreateLoading();
            setCreateRoutineButtonLoading(false);
            if (btnCreate) {
                btnCreate.disabled = false;
                updateStep4SubmitState();
            }
        }
    } catch (err) {
        console.error('handleCreateRoutine:', err);
        hideStep4CreateLoading();
        setCreateRoutineButtonLoading(false);
        if (btnCreate) {
            btnCreate.disabled = false;
            updateStep4SubmitState();
        }
        if (typeof showRoutineToast === 'function') {
            showRoutineToast('Erro ao criar rotina. Tente novamente.');
        } else {
            alert('Erro ao criar rotina. Tente novamente.');
        }
    } finally {
        window.__creatingRoutine = false;
    }
}

window.__doCreateRoutine = function () {
    handleCreateRoutine({ preventDefault: function () {} });
};

async function handleCreateRoutineImpl() {
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');

    const title = (document.getElementById('routineTitle') || {}).value;
    const titleTrimmed = (title ? title.trim() : '') || 'Sem título';
    const description = (document.getElementById('routineDescription') || {}).value || '';
    const category = resolveCategoryForSave(editId);
    const studyGoal = resolveStudyGoalForSave();
    const planType = (document.querySelector('input[name="planType"]:checked') || {}).value || 'daily';
    const bulletType = (document.querySelector('input[name="bulletType"]:checked') || {}).value || 'task';
    const objectives = (document.getElementById('routineObjectives') || {}).value || '';
    const reasons = (document.getElementById('routineReasons') || {}).value || '';
    const context = (document.getElementById('routineContext') || {}).value ? (document.getElementById('routineContext').value || '').trim() : '';

    let schedule;
    try {
        schedule = getScheduleFromStep4();
    } catch (err) {
        console.error('getScheduleFromStep4:', err);
        alert('Erro ao ler os dados. Tente novamente.');
        return false;
    }

    if (bulletType === 'commitment') {
        const timeChoiceAny = document.querySelector('input[name="timeChoice"][value="any"]');
        if (!(timeChoiceAny && timeChoiceAny.checked) && !schedule.time) {
            alert('Para compromissos, defina um horário ou escolha "Pode ser feita a qualquer horário".');
            return false;
        }
    }
    if (planType === 'weekly') {
        if (!schedule.weekDays || schedule.weekDays.length === 0) {
            alert('Escolha pelo menos um dia da semana.');
            return false;
        }
    }
    if (planType === 'monthly') {
        if (!schedule.monthlyType || (schedule.monthlyType === 'dayOfMonth' && !schedule.dayOfMonth) ||
            (schedule.monthlyType === 'weekOfMonth' && (schedule.weekOfMonth == null || schedule.dayOfWeek == null))) {
            alert('Defina como a rotina se repete no mês: dia fixo ou padrão semanal.');
            return false;
        }
    }

    const token = localStorage.getItem('token');

    // Verificar se é edição
    if (editId) {
        // Atualizar rotina existente
        if (token) {
            try {
                await apiRequest(`/routines/${editId}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        title: titleTrimmed,
                        description,
                        category,
                        studyGoal,
                        studySessions: (editingRoutineSnapshot && editingRoutineSnapshot.studySessions) || [],
                        studySubjects: (editingRoutineSnapshot && editingRoutineSnapshot.studySubjects) || [],
                        tasks: initialTasks,
                        schedule,
                        planType,
                        objectives,
                        reasons,
                        bulletType,
                        context
                    })
                });
                showRoutineToast('Alterações guardadas com sucesso.');
                goToDashboardAfterToast();
                return 'redirect';
            } catch (error) {
                if (isAuthError(error)) {
                    alert('Sua sessão expirou. Faça login novamente.');
                    window.location.replace('auth.html?view=login');
                    return 'redirect';
                }
                alert('Não foi possível salvar no servidor. Tente novamente quando a conexão voltar.');
                return false;
            }
        }

        // Atualizar no localStorage
        let routines = JSON.parse(localStorage.getItem('localRoutines') || '[]');
        const index = routines.findIndex(r => r.id === editId);
        if (index !== -1) {
            routines[index] = {
                ...routines[index],
                title: titleTrimmed,
                description,
                category,
                studyGoal,
                tasks: initialTasks,
                schedule,
                planType,
                objectives,
                reasons,
                bulletType,
                context,
                checkIns: routines[index].checkIns || [],
                studySessions: routines[index].studySessions || [],
                studySubjects: routines[index].studySubjects || [],
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem('localRoutines', JSON.stringify(routines));
        }
        showRoutineToast('Alterações guardadas neste dispositivo.');
        goToDashboardAfterToast();
        return 'redirect';
    }

    // Criar nova rotina
    if (token) {
        try {
            const routine = await apiRequest('/routines', {
                method: 'POST',
                body: JSON.stringify({
                    title: titleTrimmed,
                    description,
                    category,
                    studyGoal,
                    studySessions: [],
                    studySubjects: [],
                    tasks: initialTasks,
                    schedule,
                    planType,
                    objectives,
                    reasons,
                    bulletType,
                    context
                })
            });

            showRoutineToast('Rotina criada com sucesso.');
            goToDashboardAfterToast();
            return 'redirect';
        } catch (error) {
            if (isAuthError(error)) {
                alert('Sua sessão expirou. Faça login novamente.');
                window.location.replace('auth.html?view=login');
                return 'redirect';
            }
            alert('Não foi possível salvar no servidor. Tente novamente quando a conexão voltar.');
            return false;
        }
    }

    // Modo offline: salvar localmente
    let routines = JSON.parse(localStorage.getItem('localRoutines') || '[]');
    const newRoutine = {
        id: Date.now().toString(),
        title: titleTrimmed,
        description,
        category,
        studyGoal,
        studySessions: [],
        studySubjects: [],
        tasks: initialTasks,
        schedule,
        planType,
        objectives,
        reasons,
        bulletType,
        context,
        checkIns: [],
        completed: false,
        createdAt: new Date().toISOString()
    };
    routines.push(newRoutine);
    localStorage.setItem('localRoutines', JSON.stringify(routines));

    showRoutineToast('Rotina guardada neste dispositivo.');
    goToDashboardAfterToast();
    return 'redirect';
}
