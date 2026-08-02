(function (global) {
  "use strict";

  const COL_TO_PLAN_TYPE = { diario: "daily", semanal: "weekly", mensal: "monthly", tarefa: "task" };

  let app;
  let stage;
  let header;
  let tarefaScreen;
  let continuarBtn;
  let voltarBtn;
  let stageBackBtn;
  let cols;
  let confirmCallback = null;
  let backCallback = null;
  let escHandler = null;
  let touchHandler = null;
  let initialized = false;

const isTouch = matchMedia("(hover: none) and (pointer: coarse)").matches;
const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const mobileStackMq = matchMedia("(max-width: 640px)");
let isMobileStack = mobileStackMq.matches;
const HOVER_PIN_MS = 500;
const SHADE_REVERSE_DELAY_MS = 150;

let hoverCol = "";
let activeColId = null;
let isOpeningCol = false;
let colHoverSettled = false;
let colHoverSettleColId = "";
let colHoverSettleTask = null;
let isClosingCol = false;
let lastColOpenState = null;
let hoverPinUntil = 0;
let hoverPinColId = "";
let hoverPinTimer = null;
let focusBeforeColScreen = null;
let colScreenFocusTrapHandler = null;
let colMorphHandoff = null;
let pendingColMorphHandoff = null;
let pendingMobileImgCommit = null;
const MOBILE_IMG_FADE_MS = 1500;

function snapshotDomSlot(el) {
  return { parent: el.parentNode, nextSibling: el.nextSibling };
}

function saveColumnSlots(colEl) {
  const img = colEl.querySelector(".col__visual img");
  const title = colEl.querySelector(".col__body h2");
  const lead = colEl.querySelector(".col__lead");

  return {
    colId: colEl.dataset.col,
    els: { img, title, lead },
    slots: {
      img: snapshotDomSlot(img),
      title: snapshotDomSlot(title),
      lead: snapshotDomSlot(lead),
    },
  };
}

function isColMorphHandedOff() {
  return colMorphHandoff !== null;
}

function getColMorphEls() {
  if (colMorphHandoff?.els) return colMorphHandoff.els;

  const colEl = activeColId ? getColEl(activeColId) : null;
  if (!colEl) return null;

  return {
    img: colEl.querySelector(".col__visual img"),
    title: colEl.querySelector(".col__body h2"),
    lead: colEl.querySelector(".col__lead"),
  };
}

function insertAtDomSlot(el, slot) {
  if (!slot?.parent) return;
  if (slot.nextSibling && slot.nextSibling.parentNode === slot.parent) {
    slot.parent.insertBefore(el, slot.nextSibling);
  } else {
    slot.parent.appendChild(el);
  }
}

function getMorphSlotEls() {
  return {
    titleEl: tarefaScreen.querySelector(".tarefa-screen__title.tarefa-screen__morph-slot"),
    leadEl: tarefaScreen.querySelector(".tarefa-screen__lead.tarefa-screen__morph-slot"),
    listEl: tarefaScreen.querySelector(".tarefa-screen__list"),
    cardImgEl: tarefaScreen.querySelector(".tarefa-screen__card img.tarefa-screen__morph-slot"),
  };
}

function stripScreenMorphClasses(els) {
  if (els.title) {
    els.title.classList.remove("tarefa-screen__title");
    if (els.title.id === "planTypeTarefaScreenTitle") els.title.removeAttribute("id");
  }
  if (els.lead) {
    els.lead.classList.remove("tarefa-screen__lead");
  }
}

const CONTENT_IN_MS = 220;

/** Título, lead e lista entram juntos (is-list-ready + is-content-in) — PC e mobile. */
async function revealMobileFooterContent() {
  if (!tarefaScreen) return;
  tarefaScreen.classList.remove("is-list-ready", "is-content-in");
  await nextFrame();
  await nextFrame();
  tarefaScreen.classList.add("is-list-ready", "is-content-in");
}

async function fadeOutScreenContent() {
  if (!tarefaScreen.classList.contains("is-content-in")) return;
  tarefaScreen.classList.remove("is-content-in");
  const ms = isMobileStack ? motionMs(getFeatureRevealMs()) : motionMs(CONTENT_IN_MS);
  if (ms === 0) return;
  await delay(ms);
}

function stripScreenMorphClassForEl(el) {
  if (!el) return;
  if (el.classList.contains("tarefa-screen__title")) {
    el.classList.remove("tarefa-screen__title");
    if (el.id === "planTypeTarefaScreenTitle") el.removeAttribute("id");
  }
  if (el.classList.contains("tarefa-screen__lead")) {
    el.classList.remove("tarefa-screen__lead");
  }
}

function clearColMorphHandoff() {
  colMorphHandoff = null;
}

function isPlanTypeDarkTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

/**
 * Modo claro — Voltar: tudo some JUNTO com transparência no fundo,
 * depois o fundo transiciona para a cor padrão (branco) e volta a seleção.
 */
async function closeLightModeToPlanSelection(colEl) {
  if (!colEl) return;

  const imgLayer = getMobileImgLayer();
  const exitMs = motionMs(getShadeBrandExitMs());
  const fadeTogetherMs = motionMs(280);

  /* Congela filhos e some tudo no mesmo fade */
  tarefaScreen.classList.add("is-confirm-exiting");
  imgLayer?.classList.add("is-confirm-exiting");
  await nextFrame();

  if (fadeTogetherMs > 0) {
    await delay(fadeTogetherMs);
  }

  /* Ponte: fundo atual → cor padrão */
  app.classList.add("is-mobile-blackout");
  await nextFrame();
  app.classList.add("is-return-to-default");
  await nextFrame();

  if (exitMs > 0) {
    await delay(exitMs);
  }

  hideScreenMorphSources();
  restoreColOriginalsToColumn();
  imgLayer?.classList.remove("is-confirm-exiting");
  imgLayer?.replaceChildren();

  tarefaScreen.hidden = true;
  tarefaScreen.setAttribute("aria-hidden", "true");
  tarefaScreen.classList.remove(
    "is-open",
    "is-morphed",
    "is-list-ready",
    "is-hero-in",
    "is-content-in",
    "is-word-sweep",
    "is-reversing",
    "is-reversing-chrome",
    "is-fading-chrome",
    "is-closing-chrome",
    "is-closing",
    "is-mobile-img-fading",
    "is-confirm-exiting",
    "is-handoff",
    "is-hero-settling",
    "is-hero-settling-reverse",
  );

  app.classList.remove(
    "is-col-open",
    "is-col-opening",
    "is-col-shade-overlay",
    "is-col-closing",
    "is-brand-exiting",
    "is-mobile-blackout",
    "is-return-to-default",
  );
  app.classList.add("is-brand-returning");
  colEl.classList.remove("is-shade-handoff");
  resetColShadeBrand(colEl);
  releaseColHoverPin();
  clearHover();

  resetWordTrackOrigin();
  resetShadeHandoff();
  resetColBackdrop();
  document.body.style.overflow = "";

  stage?.removeAttribute("aria-hidden");
  header?.removeAttribute("aria-hidden");

  restoreColElements(colEl);
  colEl.classList.remove("is-hover-instant");
  await nextFrame();

  const returnMs = motionMs(getShadeBrandExitMs());
  if (returnMs > 0) {
    await Promise.all([
      header ? waitForTransition(header, "opacity", returnMs + 100) : Promise.resolve(),
      stage ? waitForTransition(stage, "opacity", returnMs + 100) : Promise.resolve(),
    ]);
  }

  app.classList.remove("is-brand-returning");
  colEl.focus();
}

/** Dark — Voltar: tudo some JUNTO (como o claro); ponte cinza → preto. */
async function closeDarkModeToPlanSelection(colEl) {
  if (!colEl) return;

  const imgLayer = getMobileImgLayer();
  const exitMs = motionMs(getShadeBrandExitMs());
  const fadeTogetherMs = motionMs(280);

  /* Congela filhos e some tudo no mesmo fade */
  tarefaScreen.classList.add("is-confirm-exiting");
  imgLayer?.classList.add("is-confirm-exiting");
  await nextFrame();

  if (fadeTogetherMs > 0) {
    await delay(fadeTogetherMs);
  }

  /* Ponte: cinza (fundo atual) → preto */
  app.classList.add("is-mobile-blackout");
  await nextFrame();
  app.classList.add("is-return-to-black");
  await nextFrame();

  if (exitMs > 0) {
    await delay(exitMs);
  }

  hideScreenMorphSources();
  restoreColOriginalsToColumn();
  imgLayer?.classList.remove("is-confirm-exiting");
  imgLayer?.replaceChildren();

  tarefaScreen.hidden = true;
  tarefaScreen.setAttribute("aria-hidden", "true");
  tarefaScreen.classList.remove(
    "is-open",
    "is-morphed",
    "is-list-ready",
    "is-hero-in",
    "is-content-in",
    "is-word-sweep",
    "is-reversing",
    "is-reversing-chrome",
    "is-fading-chrome",
    "is-closing-chrome",
    "is-closing",
    "is-mobile-img-fading",
    "is-confirm-exiting",
    "is-handoff",
    "is-hero-settling",
    "is-hero-settling-reverse",
  );

  app.classList.remove(
    "is-col-open",
    "is-col-opening",
    "is-col-shade-overlay",
    "is-col-closing",
    "is-brand-exiting",
    "is-mobile-blackout",
    "is-return-to-black",
  );
  app.classList.add("is-brand-returning");
  colEl.classList.remove("is-shade-handoff");
  resetColShadeBrand(colEl);
  releaseColHoverPin();
  clearHover();

  resetWordTrackOrigin();
  resetShadeHandoff();
  resetColBackdrop();
  document.body.style.overflow = "";

  stage?.removeAttribute("aria-hidden");
  header?.removeAttribute("aria-hidden");

  restoreColElements(colEl);
  colEl.classList.remove("is-hover-instant");
  await nextFrame();

  const returnMs = motionMs(getShadeBrandExitMs());
  if (returnMs > 0) {
    await Promise.all([
      header ? waitForTransition(header, "opacity", returnMs + 100) : Promise.resolve(),
      stage ? waitForTransition(stage, "opacity", returnMs + 100) : Promise.resolve(),
    ]);
  }

  app.classList.remove("is-brand-returning");
  colEl.focus();
}

/** Compat: rotas antigas devolvem à seleção no tema atual. */
async function closeMobileToPlanSelection(colEl) {
  if (isPlanTypeDarkTheme()) {
    await closeDarkModeToPlanSelection(colEl);
  } else {
    await closeLightModeToPlanSelection(colEl);
  }
}

async function beginMobileStageReturn(colEl) {
  await closeMobileToPlanSelection(colEl);
}

function getColEl(id) {
  return app ? app.querySelector(`.col--${id}`) : null;
}

function getShadeBrandExitMs() {
  return readCssMs("--dur-shade-brand-exit", 580);
}

function resetColShadeBrand(colEl) {
  if (cols) {
    cols.forEach(function (c) {
      c.classList.remove("is-shade-brand-exiting");
    });
  } else if (colEl) {
    colEl.classList.remove("is-shade-brand-exiting");
  }
}

function resetAppBrand(colEl) {
  app?.classList.remove(
    "is-brand-exiting",
    "is-mobile-blackout",
    "is-brand-returning",
    "is-return-to-black",
    "is-return-to-default",
  );
  resetColShadeBrand(colEl);
}

async function exitAppBrand() {
  if (!app || !header) return;
  app.classList.add("is-brand-exiting");
  const ms = motionMs(getShadeBrandExitMs());
  if (ms === 0) return;
  await nextFrame();
  const sampleCol = app.querySelector(".stage .col");
  await Promise.all([
    waitForTransition(header, "transform", ms + 100),
    waitForTransition(header, "opacity", ms + 100),
    sampleCol ? waitForTransition(sampleCol, "opacity", ms + 100) : Promise.resolve(),
    stage ? waitForTransition(stage, "opacity", ms + 100) : Promise.resolve(),
  ]);
}

function handleColActivate(id) {
  openColScreen(id);
}

async function confirmColScreen() {
  if (!activeColId || tarefaScreen.hidden || isClosingCol) return;
  const planType = COL_TO_PLAN_TYPE[activeColId];
  if (!planType || !confirmCallback) return;
  const radio = document.querySelector(`input[name="planType"][value="${planType}"]`);
  if (radio) radio.checked = true;

  isClosingCol = true;
  if (continuarBtn) {
    continuarBtn.disabled = true;
    continuarBtn.classList.add("is-loading");
    continuarBtn.setAttribute("aria-busy", "true");
  }

  if (typeof showStep4CreateLoading === "function") {
    showStep4CreateLoading("Continuando…", "Aguarde um instante", { overTransition: true });
  } else if (typeof showEcBusyOverlay === "function") {
    showEcBusyOverlay({ minMs: 180 });
  }

  await new Promise(function (resolve) {
    requestAnimationFrame(function () {
      requestAnimationFrame(resolve);
    });
  });

  tarefaScreen.classList.add("is-confirm-exiting");

  try {
    await Promise.resolve(confirmCallback(planType));
  } catch (error) {
    console.error("Erro ao confirmar coluna:", error);
    tarefaScreen.classList.remove("is-confirm-exiting");
    if (continuarBtn) {
      continuarBtn.disabled = false;
      continuarBtn.classList.remove("is-loading");
      continuarBtn.removeAttribute("aria-busy");
    }
    if (typeof hideStep4CreateLoading === "function") {
      hideStep4CreateLoading();
    } else if (typeof hideEcBusyOverlay === "function") {
      try {
        await hideEcBusyOverlay();
      } catch (_) {}
    }
  } finally {
    isClosingCol = false;
    if (typeof hideStep4CreateLoading !== "function" && typeof hideEcBusyOverlay === "function") {
      try {
        await hideEcBusyOverlay();
      } catch (_) {}
    }
  }
}

async function finalizePlanTypeConfirmCleanup() {
  if (!tarefaScreen.hidden) {
    await finalizeColClose();
  }
  clearColMorphHandoff();
  lastColOpenState = null;
  tarefaScreen.classList.remove("is-confirm-exiting");
  if (continuarBtn) {
    continuarBtn.disabled = false;
    continuarBtn.classList.remove("is-loading");
    continuarBtn.removeAttribute("aria-busy");
  }
}

function splitHeroWords(text) {
  const trimmed = text.trim();
  const space = trimmed.indexOf(" ");
  if (space > 0) {
    return [trimmed.slice(0, space), trimmed.slice(space + 1)];
  }
  const mid = Math.ceil(trimmed.length / 2);
  return [trimmed.slice(0, mid), trimmed.slice(mid)];
}

const HERO_WORDS = {
  diario: ["DIARIAMENTE"],
  semanal: ["SEMANALMENTE"],
  mensal: ["MENSALMENTE"],
  tarefa: ["TAREFA"],
};

const PLAN_TYPE_SCREEN_FEATURES = {
  diario: [
    { icon: "book-open", title: "Estudar", desc: "Avance um pouco todos os dias." },
    { icon: "dumbbell", title: "Treinar", desc: "Construa consistência no corpo." },
    { icon: "droplets", title: "Beber Água", desc: "Hidratação como hábito simples." },
  ],
  semanal: [
    { icon: "target", title: "Definir Metas", desc: "Escolha prioridades para a semana." },
    { icon: "bar-chart-2", title: "Revisar Progresso", desc: "Veja o que funcionou e o que falta." },
    { icon: "calendar-days", title: "Organizar Agenda", desc: "Distribua tarefas nos 7 dias." },
  ],
  mensal: [
    { icon: "target", title: "Definir Metas do Mês", desc: "Estabeleça objetivos claros e alcançáveis." },
    { icon: "bar-chart-2", title: "Revisar Resultados", desc: "Analise o que foi feito e o que pode melhorar." },
    { icon: "arrow-right", title: "Planejar Próximo Ciclo", desc: "Prepare-se hoje para um próximo mês melhor." },
  ],
  tarefa: [
    { icon: "zap", title: "Criar tarefa rápida", desc: "Cadastre uma ação pontual em segundos." },
    { icon: "play", title: "Executar quando necessário", desc: "Faça no seu ritmo, quando fizer sentido." },
    { icon: "circle-check", title: "Concluir e arquivar", desc: "Ao finalizar, encerra e não volta a aparecer." },
  ],
};

function escapePlanTypeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function refreshPlanTypeLucideIcons(rootEl) {
  if (!rootEl) return;
  const lucideLib = typeof lucide !== "undefined" ? lucide : typeof Lucide !== "undefined" ? Lucide : null;
  if (!lucideLib || typeof lucideLib.createIcons !== "function") return;
  try {
    lucideLib.createIcons({ root: rootEl });
  } catch (_) {
    try {
      lucideLib.createIcons();
    } catch (e2) {}
  }
}

function renderScreenFeatureList(colId) {
  const listEl = tarefaScreen?.querySelector(".tarefa-screen__list");
  if (!listEl) return;
  const items = PLAN_TYPE_SCREEN_FEATURES[colId] || [];
  listEl.innerHTML = items
    .map(function (item) {
      return (
        '<div class="tarefa-screen__feature" role="listitem">'
        + '<span class="tarefa-screen__feature-icon" aria-hidden="true">'
        + '<i data-lucide="' + escapePlanTypeHtml(item.icon) + '"></i>'
        + "</span>"
        + '<span class="tarefa-screen__feature-body">'
        + '<span class="tarefa-screen__feature-title">' + escapePlanTypeHtml(item.title) + "</span>"
        + '<span class="tarefa-screen__feature-desc">' + escapePlanTypeHtml(item.desc) + "</span>"
        + "</span>"
        + "</div>"
      );
    })
    .join("");
  refreshPlanTypeLucideIcons(listEl);
  if (tarefaScreen?.classList.contains("is-content-in")) {
    scheduleHeroWordLayoutFit();
  }
}

let heroWordLayoutTimer = null;
let pendingHeroLayout = null;

function resetHeroWordLayout() {
  if (!tarefaScreen) return;
  tarefaScreen.style.removeProperty("--hero-word-scale");
  tarefaScreen.style.removeProperty("--hero-v-offset");
  tarefaScreen.style.removeProperty("--hero-footer-reserve");
  const stage = tarefaScreen.querySelector(".tarefa-screen__hero-stage");
  if (stage) stage.style.removeProperty("--hero-single-min-h");
}

function applyHeroLayoutStart() {
  if (!tarefaScreen) return;
  tarefaScreen.style.setProperty("--hero-word-scale", "1");
  tarefaScreen.style.setProperty("--hero-v-offset", "0px");
  tarefaScreen.style.setProperty("--hero-footer-reserve", "0px");
  const stage = tarefaScreen.querySelector(".tarefa-screen__hero-stage");
  if (stage) stage.style.removeProperty("--hero-single-min-h");
}

function applyHeroLayout(layout) {
  if (!tarefaScreen || !layout) return;
  tarefaScreen.style.setProperty("--hero-footer-reserve", `${layout.footerReserve}px`);
  tarefaScreen.style.setProperty("--hero-word-scale", String(layout.wordScale));
  tarefaScreen.style.setProperty("--hero-v-offset", `${layout.vOffset}px`);
  const stage = tarefaScreen.querySelector(".tarefa-screen__hero-stage");
  if (stage && layout.singleMinH > 0) {
    stage.style.setProperty("--hero-single-min-h", `${layout.singleMinH}px`);
  }
}

function buildHeroImgMorphTarget(fromImgRect, slotRect) {
  if (!fromImgRect?.width || !slotRect?.width) {
    return measureHeroImgCenterTarget(fromImgRect);
  }
  const cx = slotRect.left + slotRect.width / 2;
  const cy = slotRect.top + slotRect.height / 2;
  return {
    left: cx - fromImgRect.width / 2,
    top: cy - fromImgRect.height / 2,
    width: fromImgRect.width,
    height: fromImgRect.height,
  };
}

/** Dimensões finais da img no hero (coluna oculta no mobile usa fallback pequeno). */
function resolveHeroImgTargetSize(fromImgRect) {
  const MIN = 100;
  if (fromImgRect?.width >= MIN && fromImgRect?.height >= MIN) {
    return { width: fromImgRect.width, height: fromImgRect.height };
  }

  const card = tarefaScreen?.querySelector(".tarefa-screen__card");
  if (card) {
    const cardRect = snapshotRect(card.getBoundingClientRect());
    const ar = 317 / 475;
    if (cardRect.width >= MIN) {
      const width = cardRect.width;
      const height = cardRect.height >= MIN ? cardRect.height : width / ar;
      return { width, height };
    }
  }

  if (tarefaScreen) {
    const sr = tarefaScreen.getBoundingClientRect();
    const width = Math.min(
      sr.width * (isMobileStack ? 0.54 : 0.5),
      isMobileStack ? 210 : 480,
    );
    const height = Math.min(
      width * (475 / 317),
      isMobileStack ? sr.height * 0.33 : sr.height * 0.62,
      isMobileStack ? 240 : 560,
    );
    return { width, height };
  }

  return fromImgRect || { width: 0, height: 0 };
}

/** Alvo FLIP da img: centro horizontal da tela + centro vertical do cluster (ignora offset do word-track). */
function resolveHeroImgMorphTarget(fromImgRect) {
  const size = resolveHeroImgTargetSize(fromImgRect);
  if (!tarefaScreen || !size?.width || !size?.height) {
    return measureHeroImgCenterTarget(size || fromImgRect);
  }

  const screenRect = tarefaScreen.getBoundingClientRect();
  const centerX = screenRect.left + screenRect.width / 2;
  let centerY = screenRect.top + screenRect.height / 2;

  const stage = tarefaScreen.querySelector(".tarefa-screen__hero-stage");
  if (stage) {
    const bounds = measureHeroClusterBounds(stage);
    if (Number.isFinite(bounds.center) && bounds.center > 0) {
      centerY = bounds.center;
    }
  }

  return {
    left: centerX - size.width / 2,
    top: centerY - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

function measureHeroClusterBounds(stageEl) {
  if (!stageEl) return { top: 0, bottom: 0, center: 0 };
  const parts = stageEl.querySelectorAll(
    ".tarefa-screen__word:not([hidden]), .tarefa-screen__card"
  );
  let top = Infinity;
  let bottom = -Infinity;
  for (const part of parts) {
    if (part.hidden) continue;
    const r = part.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
  }
  if (top === Infinity) {
    const r = stageEl.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, center: r.top + r.height / 2 };
  }
  return { top, bottom, center: (top + bottom) / 2 };
}

async function resolveHeroLayout({ reset = true } = {}) {
  if (!tarefaScreen) return null;

  const stage = tarefaScreen.querySelector(".tarefa-screen__hero-stage");
  if (!stage) return null;

  if (reset) {
    resetHeroWordLayout();
    await nextFrame();
    await nextFrame();
  }

  tarefaScreen.style.setProperty("--hero-footer-reserve", "0px");
  await nextFrame();

  let singleMinH = 0;
  const card = stage.querySelector(".tarefa-screen__card");
  if (stage.classList.contains("is-single-word") && card) {
    const cardH = Math.ceil(card.getBoundingClientRect().height);
    if (cardH > 0) {
      singleMinH = cardH;
      stage.style.setProperty("--hero-single-min-h", `${cardH}px`);
      await nextFrame();
    }
  }

  const edgeGap = 16;
  const minScale = 0.48;
  const scaleStep = 0.06;
  let scale = 1;
  let vOffset = 0;

  for (let attempt = 0; attempt < 24; attempt++) {
    tarefaScreen.style.setProperty("--hero-word-scale", String(scale));
    tarefaScreen.style.setProperty("--hero-v-offset", "0px");
    await nextFrame();

    const screenBounds = tarefaScreen.getBoundingClientRect();
    const minTop = screenBounds.top + edgeGap;
    const maxBottom = screenBounds.bottom - edgeGap;
    const targetCenterY = screenBounds.top + screenBounds.height / 2;

    let bounds = measureHeroClusterBounds(stage);
    vOffset = targetCenterY - bounds.center;
    tarefaScreen.style.setProperty("--hero-v-offset", `${vOffset}px`);
    await nextFrame();

    bounds = measureHeroClusterBounds(stage);
    if (bounds.top < minTop) {
      vOffset += minTop - bounds.top;
    }
    if (bounds.bottom > maxBottom) {
      vOffset -= bounds.bottom - maxBottom;
    }
    tarefaScreen.style.setProperty("--hero-v-offset", `${vOffset}px`);
    await nextFrame();

    bounds = measureHeroClusterBounds(stage);
    const fitsTop = bounds.top >= minTop;
    const fitsBottom = bounds.bottom <= maxBottom;
    if (fitsTop && fitsBottom) {
      break;
    }

    if (scale <= minScale) break;
    scale = Math.max(minScale, scale - scaleStep);
  }

  return { footerReserve: 0, vOffset, wordScale: scale, singleMinH };
}

async function fitHeroWordLayout() {
  if (!tarefaScreen || tarefaScreen.hidden || !tarefaScreen.classList.contains("is-content-in")) return;
  const layout = await resolveHeroLayout({ reset: true });
  if (layout) pendingHeroLayout = layout;
}

async function withHeroWordTrackAtRest(run) {
  const hadHeroIn = tarefaScreen.classList.contains("is-hero-in");
  const savedStart = tarefaScreen.style.getPropertyValue("--word-track-start");

  tarefaScreen.classList.add("is-hero-in");
  tarefaScreen.style.setProperty("--word-track-start", "0px");
  await nextFrame();
  await nextFrame();

  try {
    return await run();
  } finally {
    if (!hadHeroIn) tarefaScreen.classList.remove("is-hero-in");
    if (savedStart) {
      tarefaScreen.style.setProperty("--word-track-start", savedStart);
    } else {
      tarefaScreen.style.removeProperty("--word-track-start");
    }
    await nextFrame();
  }
}

async function measureHeroMorphTarget(fromImgRect) {
  if (!tarefaScreen || !fromImgRect?.width || !fromImgRect?.height) {
    return {
      targetRect: measureHeroImgCenterTarget(fromImgRect),
      layout: null,
    };
  }

  const cardImgEl = tarefaScreen.querySelector(".tarefa-screen__card img");
  if (!cardImgEl) {
    return {
      targetRect: measureHeroImgCenterTarget(fromImgRect),
      layout: null,
    };
  }

  const hadContentIn = tarefaScreen.classList.contains("is-content-in");
  const wasMeasuring = tarefaScreen.classList.contains("is-measuring");

  tarefaScreen.classList.add("is-measuring", "is-content-in");
  await nextFrame();
  await nextFrame();

  let layout;
  let targetRect;

  await withHeroWordTrackAtRest(async function () {
    layout = await resolveHeroLayout({ reset: true });
    targetRect = resolveHeroImgMorphTarget(fromImgRect);
  });

  if (!wasMeasuring) tarefaScreen.classList.remove("is-measuring");
  if (!hadContentIn) tarefaScreen.classList.remove("is-content-in");

  applyHeroLayoutStart();
  await nextFrame();

  pendingHeroLayout = layout;
  return { targetRect, layout };
}

function resolveMorphFromImgRect(sourceImg, pinnedImgFromRect) {
  if (pinnedImgFromRect?.width && pinnedImgFromRect?.height) return pinnedImgFromRect;
  const live = sourceImg ? snapshotRect(sourceImg.getBoundingClientRect()) : null;
  if (live?.width && live?.height) return live;
  return { left: 0, top: 0, width: 0, height: 0 };
}

function beginHeroOpenLayout(layout) {
  if (!layout) return;
  tarefaScreen.classList.add("is-content-in");
  applyHeroLayout(layout);
}

async function beginHeroSettleAnimation(layout) {
  if (!layout) return;

  if (motionMs(getMorphClickMs()) === 0) {
    tarefaScreen.classList.add("is-content-in");
    applyHeroLayout(layout);
    return;
  }

  applyHeroLayoutStart();
  tarefaScreen.classList.add("is-hero-settling", "is-content-in");
  await nextFrame();
  await nextFrame();

  applyHeroLayout(layout);
}

async function beginHeroSettleReverse() {
  const stage = tarefaScreen.querySelector(".tarefa-screen__hero-stage");
  const reverseMs = motionMs(getMorphReverseMs());

  if (!stage || reverseMs === 0) {
    applyHeroLayoutStart();
    return;
  }

  tarefaScreen.classList.add("is-hero-settling", "is-hero-settling-reverse");
  await nextFrame();
  await nextFrame();

  applyHeroLayoutStart();
  tarefaScreen.style.setProperty("--hero-footer-reserve", "0px");
  await waitForTransition(stage, "transform", reverseMs);
  tarefaScreen.classList.remove("is-hero-settling", "is-hero-settling-reverse");
}

function scheduleHeroWordLayoutFit() {
  void (async function () {
    await nextFrame();
    await nextFrame();
    await fitHeroWordLayout();
  })();
}

function debouncedFitHeroWordLayout() {
  clearTimeout(heroWordLayoutTimer);
  heroWordLayoutTimer = setTimeout(function () {
    void fitHeroWordLayout();
  }, 120);
}

function getHeroWords(colId, h2Text) {
  if (HERO_WORDS[colId]) return HERO_WORDS[colId];
  return splitHeroWords(h2Text);
}

function populateColScreen(colId) {
  const colEl = getColEl(colId);
  if (!colEl) return;

  const h2 = colEl.querySelector(".col__body h2");
  const lead = colEl.querySelector(".col__lead");
  const srcImg = colEl.querySelector(".col__visual img");

  const morphSlots = getMorphSlotEls();
  const wordLeft = tarefaScreen.querySelector(".tarefa-screen__word--left");
  const wordRight = tarefaScreen.querySelector(".tarefa-screen__word--right");

  if (morphSlots.titleEl) morphSlots.titleEl.textContent = h2.textContent;
  if (morphSlots.leadEl) morphSlots.leadEl.textContent = lead.textContent;
  if (morphSlots.cardImgEl) morphSlots.cardImgEl.src = srcImg.getAttribute("src") || srcImg.src;
  renderScreenFeatureList(colId);

  const words = getHeroWords(colId, h2.textContent);
  wordLeft.textContent = words[0] || "";
  wordRight.textContent = words[1] || "";
  wordRight.hidden = !words[1];

  const heroStage = tarefaScreen.querySelector(".tarefa-screen__hero-stage");
  if (heroStage) {
    heroStage.classList.toggle("is-single-word", !words[1]);
  }

  tarefaScreen.dataset.col = colId;
}

function readCssMs(varName, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return fallback;
  if (raw.endsWith("ms")) return parseFloat(raw);
  if (raw.endsWith("s")) return parseFloat(raw) * 1000;
  return parseFloat(raw) || fallback;
}

function motionMs(ms) {
  return prefersReducedMotion.matches ? 0 : ms;
}

function getHoverMs() {
  return readCssMs("--dur-hover", 800);
}

function getShadeSweepMs() {
  return readCssMs("--dur-shade-sweep", 1200);
}

function getMorphClickMs() {
  return readCssMs("--dur-morph-fast", 1200);
}

function getMorphReverseMs() {
  return readCssMs("--dur-morph-reverse", 900);
}

function getMobileImgFadeMs() {
  return readCssMs("--dur-mobile-img-fade", MOBILE_IMG_FADE_MS);
}

function getFooterRevealMs() {
  return readCssMs("--dur-footer-reveal", 900);
}

function getFeatureRevealMs() {
  return readCssMs("--dur-feature-reveal", 480);
}

function getMobileFooterExitMs() {
  return (
    readCssMs("--delay-footer-btn", 1260) -
    readCssMs("--delay-footer-list", 450) +
    getFeatureRevealMs()
  );
}

function syncReducedMotion() {
  app.classList.toggle("is-reduced-motion", prefersReducedMotion.matches);
}

function shouldMorphImageScale(from, to) {
  if (!from?.width || !from?.height || !to?.width || !to?.height) return false;
  return Math.abs(from.width - to.width) > 0.5 || Math.abs(from.height - to.height) > 0.5;
}

function snapshotRect(rect) {
  if (!rect) return { left: 0, top: 0, width: 0, height: 0 };
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function measureColumnRects(colEl) {
  const img = colEl.querySelector(".col__visual img");
  const title = colEl.querySelector(".col__body h2");
  const lead = colEl.querySelector(".col__lead");

  return {
    img: snapshotRect(img?.getBoundingClientRect()),
    title: snapshotRect(title?.getBoundingClientRect()),
    lead: snapshotRect(lead?.getBoundingClientRect()),
  };
}

function measureColumnTargetRects(colEl) {
  if (colMorphHandoff && colMorphHandoff.colId === colEl.dataset.col) {
    if (lastColOpenState?.sourceRects) return lastColOpenState.sourceRects;
  }
  return measureColumnRects(colEl);
}

function buildColumnReverseTargets(screenRects, openState) {
  const colTitle = openState?.sourceRects?.title;
  const colLead = openState?.sourceRects?.lead;
  const colImg = openState?.pinnedImgFromRect || openState?.sourceRects?.img;

  return {
    title: {
      left: colTitle?.left ?? 0,
      top: colTitle?.top ?? 0,
      width: screenRects.title.width,
      height: screenRects.title.height,
    },
    lead: {
      left: colLead?.left ?? 0,
      top: colLead?.top ?? 0,
      width: screenRects.lead.width,
      height: screenRects.lead.height,
    },
    img: {
      left: colImg?.left ?? 0,
      top: colImg?.top ?? 0,
      width: screenRects.img.width,
      height: screenRects.img.height,
    },
  };
}

function measureOpenScreenRects(handoff) {
  const { img, title, lead } = handoff.els;
  return {
    title: snapshotRect(title.getBoundingClientRect()),
    lead: snapshotRect(lead.getBoundingClientRect()),
    img: snapshotRect(img.getBoundingClientRect()),
  };
}

async function measureScreenMorphRects(targets, fromTitleRect, fromLeadRect) {
  const wasMeasuring = tarefaScreen.classList.contains("is-measuring");
  tarefaScreen.classList.add("is-measuring");
  await nextFrame();

  const titleSlot = snapshotRect(targets.titleEl.getBoundingClientRect());
  const leadSlot = snapshotRect(targets.leadEl.getBoundingClientRect());

  if (!wasMeasuring) {
    tarefaScreen.classList.remove("is-measuring");
  }

  return {
    title: {
      left: titleSlot.left,
      top: titleSlot.top,
      width: fromTitleRect?.width || titleSlot.width,
      height: fromTitleRect?.height || titleSlot.height,
    },
    lead: {
      left: leadSlot.left,
      top: leadSlot.top,
      width: fromLeadRect?.width || leadSlot.width,
      height: fromLeadRect?.height || leadSlot.height,
    },
  };
}

function activateColScreenA11y() {
  focusBeforeColScreen = document.activeElement;
  stage.setAttribute("aria-hidden", "true");
  header?.setAttribute("aria-hidden", "true");

  colScreenFocusTrapHandler = (e) => {
    if (e.key !== "Tab" || tarefaScreen.hidden) return;

    const focusable = [voltarBtn, continuarBtn];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  document.addEventListener("keydown", colScreenFocusTrapHandler);
  voltarBtn.focus();
}

function deactivateColScreenA11y() {
  stage.removeAttribute("aria-hidden");
  header?.removeAttribute("aria-hidden");

  if (colScreenFocusTrapHandler) {
    document.removeEventListener("keydown", colScreenFocusTrapHandler);
    colScreenFocusTrapHandler = null;
  }

  const colEl = activeColId ? getColEl(activeColId) : null;
  if (focusBeforeColScreen && typeof focusBeforeColScreen.focus === "function") {
    focusBeforeColScreen.focus();
  } else {
    colEl?.focus();
  }

  focusBeforeColScreen = null;
}

function sync() {
  cols.forEach((col) => col.classList.toggle("is-active", col.dataset.col === hoverCol));
  app.dataset.active = hoverCol;
}

function clearColHoverCache() {
  colHoverSettled = false;
  colHoverSettleColId = "";
  colHoverSettleTask = null;
}

function setHover(id) {
  if (performance.now() < hoverPinUntil && id !== hoverPinColId) return;

  hoverCol = id;
  sync();
  if (id) {
    scheduleColHoverSettle(id);
  } else {
    clearColHoverCache();
  }
}

function clearHover() {
  if (performance.now() < hoverPinUntil) return;

  hoverCol = "";
  sync();
  clearColHoverCache();
}

function pinColHover(colId, ms = HOVER_PIN_MS) {
  setHover(colId);
  colHoverSettled = true;
  colHoverSettleColId = colId;
  extendColHoverPin(colId, ms);
}

function releaseColHoverPin() {
  if (hoverPinTimer) {
    window.clearTimeout(hoverPinTimer);
    hoverPinTimer = null;
  }
  hoverPinUntil = 0;
  hoverPinColId = "";
  app.classList.remove("is-col-hover-pin");
}

function extendColHoverPin(colId, ms = HOVER_PIN_MS) {
  if (hoverPinTimer) window.clearTimeout(hoverPinTimer);

  hoverPinColId = colId;
  hoverPinUntil = performance.now() + ms;
  app.classList.add("is-col-hover-pin");

  hoverPinTimer = window.setTimeout(() => {
    hoverPinTimer = null;
    hoverPinUntil = 0;
    hoverPinColId = "";
    app.classList.remove("is-col-hover-pin");
    const colEl = getColEl(colId);
    if (!colEl?.matches(":hover")) clearHover();
  }, ms);
}

function scheduleColHoverSettle(colId) {
  if (colHoverSettleTask) return;

  colHoverSettleTask = (async () => {
    const colEl = getColEl(colId);
    const visual = colEl?.querySelector(".col__visual");
    const img = colEl?.querySelector(".col__visual img");
    if (!visual || !img) {
      colHoverSettleTask = null;
      return;
    }

    await nextFrame();

    await Promise.all([
      waitForTransition(visual, "top", motionMs(getHoverMs())),
      waitForTransition(visual, "transform", motionMs(getHoverMs())),
      waitForTransition(img, "transform", motionMs(getHoverMs())),
    ]);
    await nextFrame();

    if (hoverCol === colId) {
      colHoverSettled = true;
      colHoverSettleColId = colId;
    }
    colHoverSettleTask = null;
  })();
}

async function ensureColHoverSettled(colId, { instant = false } = {}) {
  setHover(colId);
  await nextFrame();

  if (colHoverSettled && colHoverSettleColId === colId) return;

  const colEl = getColEl(colId);
  if (!colEl) return;

  if (instant) {
    colEl.classList.add("is-hover-instant");
    await nextFrame();
    await nextFrame();
    colEl.classList.remove("is-hover-instant");
    colHoverSettled = true;
    colHoverSettleColId = colId;
    return;
  }

  if (colHoverSettleTask) {
    await colHoverSettleTask;
  }
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function delay(ms) {
  const effectiveMs = motionMs(ms);
  if (effectiveMs === 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, effectiveMs));
}

function flipTransitionMs(durationMs) {
  return motionMs(durationMs);
}

const FLIP_EASE = "cubic-bezier(0.71, -0.02, 0.25, 0.99)";

function flipLayoutTransition(effectiveMs) {
  return [
    `top ${effectiveMs}ms ${FLIP_EASE}`,
    `left ${effectiveMs}ms ${FLIP_EASE}`,
    `width ${effectiveMs}ms ${FLIP_EASE}`,
    `height ${effectiveMs}ms ${FLIP_EASE}`,
  ].join(", ");
}

function measureColumnImgHoverRect(colEl) {
  const img = colEl?.querySelector(".col__visual img");
  if (!img) return { left: 0, top: 0, width: 0, height: 0 };
  const rect = snapshotRect(img.getBoundingClientRect());
  if (rect.width && rect.height) return rect;
  if (isMobileStack) return buildMobileFallbackImgRect(colEl);
  return rect;
}

function buildMobileFallbackImgRect(colEl) {
  const colRect = snapshotRect(colEl.getBoundingClientRect());
  const body = colEl.querySelector(".col__body");
  const bodyRect = body ? snapshotRect(body.getBoundingClientRect()) : null;
  const anchor = bodyRect && bodyRect.width ? bodyRect : colRect;
  const size = Math.min(Math.max(anchor.height * 0.75, 56), 112, anchor.width * 0.28);
  return {
    left: anchor.right - size - 14,
    top: anchor.top + (anchor.height - size) / 2,
    width: size,
    height: size,
  };
}

function resolveMobileShadeRect(colEl, shadeEl) {
  const shadeRect = shadeEl ? snapshotRect(shadeEl.getBoundingClientRect()) : null;
  if (shadeRect && shadeRect.width && shadeRect.height) return shadeRect;
  return snapshotRect(colEl.getBoundingClientRect());
}

function syncMobileStackLayout() {
  if (!app) return;
  isMobileStack = mobileStackMq.matches;
  app.classList.toggle("is-mobile-stack", isMobileStack);
  if (isMobileStack && (!tarefaScreen || tarefaScreen.hidden)) {
    clearHover();
  }
}

function pinColumnImgAtHoverRect(columnEl, fromRect) {
  Object.assign(columnEl.style, {
    position: "fixed",
    top: `${fromRect.top}px`,
    left: `${fromRect.left}px`,
    width: `${fromRect.width}px`,
    height: `${fromRect.height}px`,
    zIndex: "55",
    margin: "0",
    padding: "0",
    boxSizing: "border-box",
    pointerEvents: "none",
    transform: "none",
    transition: "none",
    visibility: "visible",
    opacity: "1",
    maxWidth: "none",
    maxHeight: "none",
    objectFit: "contain",
    objectPosition: "center top",
  });
}

/** Mobile: img aparece no alvo final com fade — sem FLIP de posição/tamanho. */
async function fadeMobileImageIntoHero(sourceImg, imageTarget, morphPrep) {
  if (!sourceImg || !imageTarget?.width) return snapshotRect(imageTarget);

  const effectiveMs = motionMs(getMobileImgFadeMs());

  tarefaScreen.classList.add("is-hero-in", "is-mobile-img-fading");
  if (morphPrep?.layout) beginHeroOpenLayout(morphPrep.layout);

  reparentElementToMobileImgLayer(sourceImg);
  pinColumnImgAtHoverRect(sourceImg, imageTarget);
  sourceImg.style.zIndex = "1";
  sourceImg.style.mixBlendMode = "normal";
  sourceImg.style.opacity = "0";
  sourceImg.style.transition =
    effectiveMs > 0 ? `opacity ${effectiveMs}ms ease` : "none";

  await nextFrame();
  sourceImg.style.opacity = "1";

  if (effectiveMs > 0) {
    await waitForTransition(sourceImg, "opacity", effectiveMs);
  }

  sourceImg.style.removeProperty("transition");
  tarefaScreen.classList.remove("is-mobile-img-fading");

  return snapshotRect(sourceImg.getBoundingClientRect());
}

/** Mobile: fecha com fade de opacidade — sem FLIP de volta à coluna. */
async function fadeMobileImageOutOfHero(sourceImg, fromRect, durationMs) {
  if (!sourceImg) return;

  const effectiveMs = motionMs(durationMs);
  const rect = fromRect?.width
    ? snapshotRect(fromRect)
    : snapshotRect(sourceImg.getBoundingClientRect());

  reparentElementToMobileImgLayer(sourceImg);
  resetColCardLayout();
  pinColumnImgAtHoverRect(sourceImg, rect);
  sourceImg.style.zIndex = "1";
  sourceImg.style.mixBlendMode = "normal";
  sourceImg.style.opacity = "1";
  sourceImg.style.transition =
    effectiveMs > 0 ? `opacity ${effectiveMs}ms ease` : "none";

  await nextFrame();
  sourceImg.style.opacity = "0";

  if (effectiveMs > 0) {
    await waitForTransition(sourceImg, "opacity", effectiveMs);
  }

  sourceImg.style.removeProperty("transition");
}

function pinTextAtMorphRect(columnEl, rect, screenStyle) {
  Object.assign(columnEl.style, {
    position: "fixed",
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: "55",
    margin: "0",
    padding: "0",
    boxSizing: "border-box",
    pointerEvents: "none",
    transform: "none",
    transformOrigin: "top left",
    transition: "none",
    visibility: "visible",
    opacity: "1",
    overflow: "hidden",
    fontFamily: screenStyle.fontFamily,
    fontSize: screenStyle.fontSize,
    fontWeight: screenStyle.fontWeight,
    lineHeight: screenStyle.lineHeight,
    textAlign: screenStyle.textAlign,
    letterSpacing: screenStyle.letterSpacing,
    color: screenStyle.color,
    whiteSpace: screenStyle.whiteSpace || "nowrap",
  });
}

async function runImageLayoutMorph(
  columnEl,
  toRect,
  effectiveMs,
  { onAnimateStart = null, lockSize = false, resolveToRect = null } = {},
) {
  void columnEl.offsetWidth;
  columnEl.style.transition = lockSize
    ? [`top ${effectiveMs}ms ${FLIP_EASE}`, `left ${effectiveMs}ms ${FLIP_EASE}`].join(", ")
    : flipLayoutTransition(effectiveMs);
  void columnEl.offsetWidth;
  onAnimateStart?.();
  const finalToRect = resolveToRect ? resolveToRect() : toRect;
  columnEl.style.top = `${finalToRect.top}px`;
  columnEl.style.left = `${finalToRect.left}px`;
  if (!lockSize) {
    columnEl.style.width = `${toRect.width}px`;
    columnEl.style.height = `${toRect.height}px`;
  }

  const waits = [
    waitForTransition(columnEl, "top", effectiveMs),
    waitForTransition(columnEl, "left", effectiveMs),
  ];
  if (!lockSize) {
    waits.push(
      waitForTransition(columnEl, "width", effectiveMs),
      waitForTransition(columnEl, "height", effectiveMs),
    );
  }
  await Promise.all(waits);
}

function morphRectsSameSize(a, b) {
  if (!a?.width || !b?.width) return false;
  return Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

function measureHeroImgCenterTarget(sizeRect) {
  if (!tarefaScreen || !sizeRect?.width || !sizeRect?.height) return sizeRect;

  const screenRect = tarefaScreen.getBoundingClientRect();
  const centerX = screenRect.left + screenRect.width / 2;
  const centerY = screenRect.top + screenRect.height / 2;

  return {
    left: centerX - sizeRect.width / 2,
    top: centerY - sizeRect.height / 2,
    width: sizeRect.width,
    height: sizeRect.height,
  };
}

async function measureHeroImgCenterTargetAsync(sizeRect) {
  await nextFrame();
  return measureHeroImgCenterTarget(sizeRect);
}

async function runTransformMorph(columnEl, dx, dy, sx, sy, scale, effectiveMs, { onAnimateStart = null } = {}) {
  await nextFrame();
  void columnEl.offsetWidth;
  columnEl.style.transition = `transform ${effectiveMs}ms ${FLIP_EASE}`;
  await nextFrame();
  onAnimateStart?.();
  columnEl.style.transform =
    scale && (sx !== 1 || sy !== 1)
      ? `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
      : `translate(${dx}px, ${dy}px)`;
  await waitForTransition(columnEl, "transform", effectiveMs);
}

const FLIP_ORIGINAL_INLINE_PROPS = [
  "position",
  "top",
  "left",
  "width",
  "height",
  "margin",
  "padding",
  "transform",
  "transition",
  "transform-origin",
  "z-index",
  "visibility",
  "opacity",
  "max-width",
  "max-height",
  "object-fit",
  "object-position",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "text-align",
  "letter-spacing",
  "color",
  "white-space",
  "overflow",
  "box-sizing",
  "pointer-events",
];

function clearFlipOriginalInlineStyles(el) {
  FLIP_ORIGINAL_INLINE_PROPS.forEach((prop) => el.style.removeProperty(prop));
}

function reparentElementToApp(el) {
  const parent = el.parentNode;
  const nextSibling = el.nextSibling;
  app.appendChild(el);

  return () => {
    if (!parent) return;
    if (nextSibling && nextSibling.parentNode === parent) {
      parent.insertBefore(el, nextSibling);
    } else {
      parent.appendChild(el);
    }
  };
}

function getMobileImgLayer() {
  if (!app) return null;
  let layer = app.querySelector(".plan-type-mobile-img-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "plan-type-mobile-img-layer";
    layer.setAttribute("aria-hidden", "true");
    app.appendChild(layer);
  }
  return layer;
}

function reparentElementToMobileImgLayer(el) {
  const layer = getMobileImgLayer();
  if (!layer || !el) return reparentElementToApp(el);
  layer.appendChild(el);
  return () => {};
}

function hideMobileMorphText(el) {
  if (el) el.style.visibility = "hidden";
}

function hideScreenMorphSources() {
  const { titleEl, leadEl, cardImgEl } = getMorphSlotEls();
  const cardWrap = tarefaScreen.querySelector(".tarefa-screen__card");

  titleEl && (titleEl.style.visibility = "hidden");
  leadEl && (leadEl.style.visibility = "hidden");
  cardImgEl && (cardImgEl.style.visibility = "hidden");
  cardWrap?.style.setProperty("visibility", "hidden");
}

function beginColReverseCommit(colEl) {
  colEl?.classList.add("is-hover-instant");
}

async function commitReverseFlipToColumn(columnEl, restoreSlot, colEl, { isImage = false } = {}) {
  if (!columnEl || !restoreSlot) return;

  beginColReverseCommit(colEl);
  stripScreenMorphClassForEl(columnEl);
  insertAtDomSlot(columnEl, restoreSlot);

  columnEl.style.transition = "none";
  clearFlipOriginalInlineStyles(columnEl);
  if (!isImage) {
    columnEl.style.removeProperty("overflow");
    columnEl.style.removeProperty("white-space");
  }

  columnEl.style.visibility = "";
  columnEl.style.removeProperty("transition");

  await nextFrame();
}

async function flipColumnOriginalFromScreen(
  columnEl,
  fromRect,
  toRect,
  durationMs,
  {
    isImage = false,
    scale = false,
    restoreSlot = null,
    styleSourceEl = null,
    reverseCommit = false,
    colEl = null,
  } = {},
) {
  if (!columnEl) return;

  const styleSource = styleSourceEl || columnEl;
  const styleRef = isImage ? getComputedStyle(styleSource) : getComputedStyle(styleSource);

  if (!fromRect?.width || !fromRect?.height || !toRect?.width || !toRect?.height) {
    if (reverseCommit && restoreSlot) {
      await commitReverseFlipToColumn(columnEl, restoreSlot, colEl, { isImage });
      return;
    }

    clearFlipOriginalInlineStyles(columnEl);
    if (restoreSlot) {
      stripScreenMorphClassForEl(columnEl);
      insertAtDomSlot(columnEl, restoreSlot);
    }
    columnEl.style.visibility = "";
    return;
  }

  const effectiveMs = flipTransitionMs(durationMs);
  const restoreParent = reparentElementToApp(columnEl);

  if (isImage) {
    resetColCardLayout();
  }

  if (effectiveMs === 0) {
    if (reverseCommit && restoreSlot) {
      await commitReverseFlipToColumn(columnEl, restoreSlot, colEl, { isImage });
      return;
    }

    clearFlipOriginalInlineStyles(columnEl);
    restoreParent();
    if (restoreSlot) {
      stripScreenMorphClassForEl(columnEl);
      insertAtDomSlot(columnEl, restoreSlot);
    }
    columnEl.style.visibility = "";
    return;
  }

  if (isImage) {
    pinColumnImgAtHoverRect(columnEl, fromRect);
  } else {
    pinTextAtMorphRect(columnEl, fromRect, styleRef);
  }

  try {
    await runImageLayoutMorph(columnEl, toRect, effectiveMs, {
      lockSize: true,
    });
  } finally {
    if (reverseCommit && restoreSlot) {
      await commitReverseFlipToColumn(columnEl, restoreSlot, colEl, { isImage });
    } else {
      clearFlipOriginalInlineStyles(columnEl);
      if (restoreSlot) {
        stripScreenMorphClassForEl(columnEl);
        insertAtDomSlot(columnEl, restoreSlot);
      } else {
        restoreParent();
      }
      columnEl.style.visibility = "";
    }
  }
}

async function flipColumnOriginalToScreen(
  columnEl,
  screenEl,
  fromRect,
  toRect,
  durationMs,
  {
    isImage = false,
    scale = false,
    onAnimateStart = null,
    retainMorphStyles = false,
    resolveToRect = null,
  } = {},
) {
  if (!columnEl || !screenEl) return null;

  const screenStyle = getComputedStyle(screenEl);
  const cardWrap = isImage ? screenEl.closest(".tarefa-screen__card") : null;

  screenEl.style.visibility = "hidden";
  cardWrap?.style.setProperty("visibility", "hidden");

  if (!fromRect?.width || !toRect?.width) {
    if (!retainMorphStyles) clearFlipOriginalInlineStyles(columnEl);
    return isImage ? snapshotRect(toRect) : null;
  }

  const effectiveMs = flipTransitionMs(durationMs);
  reparentElementToApp(columnEl);

  if (effectiveMs === 0) {
    if (isImage) pinColumnImgAtHoverRect(columnEl, toRect);
    else pinTextAtMorphRect(columnEl, toRect, screenStyle);
    onAnimateStart?.();
    return isImage ? snapshotRect(toRect) : null;
  }

  let endRect = isImage ? snapshotRect(toRect) : null;

  const shouldMorphSize =
    isImage &&
    fromRect?.width &&
    toRect?.width &&
    toRect.width > fromRect.width * 1.12;

  if (isImage) {
    pinColumnImgAtHoverRect(columnEl, fromRect);
  } else {
    pinTextAtMorphRect(columnEl, fromRect, screenStyle);
  }

  try {
    await runImageLayoutMorph(columnEl, toRect, effectiveMs, {
      onAnimateStart,
      lockSize: !shouldMorphSize,
      resolveToRect: resolveToRect,
    });
  } finally {
    if (isImage) {
      endRect = snapshotRect(columnEl.getBoundingClientRect());
    }
    if (!retainMorphStyles) {
      clearFlipOriginalInlineStyles(columnEl);
    }
  }

  return endRect;
}

function waitForTransition(element, propertyName, durationMs) {
  const effectiveMs = motionMs(durationMs);
  if (effectiveMs === 0) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const finish = (event) => {
      if (event.propertyName !== propertyName) return;
      element.removeEventListener("transitionend", finish);
      settle();
    };

    element.addEventListener("transitionend", finish);
    window.setTimeout(settle, effectiveMs + 50);
  });
}

function restoreColMorphToColumn() {
  const handoff = colMorphHandoff || pendingColMorphHandoff;
  if (!handoff) return;

  const { els, slots } = handoff;

  if (els.img) {
    clearFlipOriginalInlineStyles(els.img);
    stripScreenMorphClasses(els);
    if (slots.img) insertAtDomSlot(els.img, slots.img);
    els.img.style.removeProperty("visibility");
  }

  if (els.title) {
    clearFlipOriginalInlineStyles(els.title);
    stripScreenMorphClassForEl(els.title);
    if (slots.title) insertAtDomSlot(els.title, slots.title);
    els.title.style.removeProperty("visibility");
  }

  if (els.lead) {
    clearFlipOriginalInlineStyles(els.lead);
    stripScreenMorphClassForEl(els.lead);
    if (slots.lead) insertAtDomSlot(els.lead, slots.lead);
    els.lead.style.removeProperty("visibility");
  }

  clearColMorphHandoff();
  pendingColMorphHandoff = null;
}

function restoreColOriginalsToColumn() {
  restoreColMorphToColumn();
}

function restoreColElements(colEl) {
  restoreColOriginalsToColumn();
  tarefaScreen.classList.remove("is-content-in");

  colEl
    ?.querySelectorAll(".col__body h2, .col__lead, .col__list, .col__visual img")
    .forEach((el) => {
      clearFlipOriginalInlineStyles(el);
      el.style.visibility = "";
    });

  resetColCardLayout();
  const morphSlots = getMorphSlotEls();
  morphSlots.titleEl?.style.removeProperty("visibility");
  morphSlots.titleEl?.style.removeProperty("opacity");
  morphSlots.leadEl?.style.removeProperty("visibility");
  morphSlots.leadEl?.style.removeProperty("opacity");
  morphSlots.cardImgEl?.style.removeProperty("visibility");
  tarefaScreen.querySelector(".tarefa-screen__card")?.style.removeProperty("visibility");
  tarefaScreen.querySelector(".tarefa-screen__list")?.style.removeProperty("visibility");
  tarefaScreen.querySelector(".tarefa-screen__rule")?.style.removeProperty("opacity");
  voltarBtn.style.removeProperty("visibility");
  continuarBtn.style.removeProperty("visibility");
}

async function measureTarefaTargets() {
  tarefaScreen.hidden = false;
  tarefaScreen.classList.add("is-measuring");
  await nextFrame();

  const morphSlots = getMorphSlotEls();
  const { titleEl, leadEl, listEl, cardImgEl } = morphSlots;

  const targets = {
    title: snapshotRect(titleEl.getBoundingClientRect()),
    lead: snapshotRect(leadEl.getBoundingClientRect()),
    list: snapshotRect(listEl.getBoundingClientRect()),
    cardImg: snapshotRect(cardImgEl.getBoundingClientRect()),
    titleEl,
    leadEl,
    listEl,
    cardImgEl,
  };

  tarefaScreen.classList.remove("is-measuring");
  tarefaScreen.hidden = true;

  return targets;
}

function beginShadeOverlay() {
  app.classList.add("is-col-shade-overlay");
}

function applyShadeHandoff(shadeRect) {
  const appRect = app.getBoundingClientRect();
  const screenRect = tarefaScreen.getBoundingClientRect();
  const containerLeft = screenRect.width ? screenRect.left : appRect.left;
  const screenWidth = screenRect.width || appRect.width || window.innerWidth;
  const startLeft = shadeRect.left - containerLeft;
  const startWidth = shadeRect.width;

  tarefaScreen.style.setProperty("--shade-start-left", `${startLeft}px`);
  tarefaScreen.style.setProperty("--shade-start-width", `${startWidth}px`);
  return screenWidth && startWidth ? Math.min(1, startWidth / screenWidth) : 0;
}

function resetShadeHandoff() {
  tarefaScreen.style.removeProperty("--shade-start-left");
  tarefaScreen.style.removeProperty("--shade-start-width");
}

async function collapseColBackdrop({
  skipHeroInRemove = false,
  delayMs = 0,
  keepStageHidden = false,
} = {}) {
  const backdrop = tarefaScreen.querySelector(".tarefa-screen__backdrop");
  if (!backdrop) return;

  if (delayMs) await delay(delayMs);

  backdrop.classList.add("is-sweeping", "is-active");
  await nextFrame();
  if (!keepStageHidden) {
    app.classList.remove("is-col-open");
  }
  app.classList.add("is-col-closing");
  await nextFrame();
  if (!skipHeroInRemove) {
    tarefaScreen.classList.remove("is-hero-in");
  }
  backdrop.classList.remove("is-active", "is-sweep-done");
  await waitForTransition(backdrop, "width", motionMs(getShadeSweepMs()));
  syncBackdropToColumnShade();
}

async function finalizeColClose() {
  const colId = activeColId;
  const colEl = colId ? getColEl(colId) : null;

  resetHeroWordLayout();
  pendingHeroLayout = null;
  deactivateColScreenA11y();
  syncBackdropToColumnShade();

  tarefaScreen.hidden = true;
  tarefaScreen.setAttribute("aria-hidden", "true");

  app.classList.remove(
    "is-col-shade-overlay",
    "is-col-open",
    "is-col-opening",
    "is-col-closing",
  );
  colEl?.classList.remove("is-shade-handoff");
  resetAppBrand(colEl);
  beginColReverseCommit(colEl);
  releaseColHoverPin();
  clearHover();

  tarefaScreen.classList.remove(
    "is-open",
    "is-morphed",
    "is-list-ready",
    "is-hero-in",
    "is-content-in",
    "is-word-sweep",
    "is-reversing",
    "is-reversing-chrome",
    "is-fading-chrome",
    "is-closing-chrome",
    "is-closing",
    "is-handoff",
    "is-hero-settling",
    "is-hero-settling-reverse",
  );
  document.body.style.overflow = "";
  if (colEl) {
    restoreColElements(colEl);
    await nextFrame();
    colEl.classList.remove("is-hover-instant");
  }
  resetWordTrackOrigin();
  resetShadeHandoff();
  resetColBackdrop();
  activeColId = null;
}

async function fadeOutFooterChrome() {
  if (motionMs(getFooterRevealMs()) === 0) {
    voltarBtn.style.visibility = "hidden";
    continuarBtn.style.visibility = "hidden";
    tarefaScreen.querySelector(".tarefa-screen__list")?.style.setProperty("visibility", "hidden");
    return;
  }

  tarefaScreen.classList.add("is-fading-chrome");
  await nextFrame();

  const listEl = tarefaScreen.querySelector(".tarefa-screen__list");
  const ruleEl = tarefaScreen.querySelector(".tarefa-screen__rule");
  const titleEl = tarefaScreen.querySelector("#planTypeTarefaScreenTitle");
  const leadEl = tarefaScreen.querySelector(".tarefa-screen__footer .tarefa-screen__lead");
  const accentEl = tarefaScreen.querySelector(".tarefa-screen__accent");

  if (isMobileStack) {
    const mobileExitMs = motionMs(getMobileFooterExitMs()) + 50;
    const chromeWaits = [
      waitForTransition(continuarBtn, "opacity", mobileExitMs),
      waitForTransition(voltarBtn, "opacity", mobileExitMs),
      titleEl ? waitForTransition(titleEl, "transform", mobileExitMs) : Promise.resolve(),
      leadEl ? waitForTransition(leadEl, "transform", mobileExitMs) : Promise.resolve(),
      accentEl ? waitForTransition(accentEl, "transform", mobileExitMs) : Promise.resolve(),
    ];
    const features = listEl ? [...listEl.querySelectorAll(".tarefa-screen__feature")] : [];
    for (const featureEl of features) {
      chromeWaits.push(waitForTransition(featureEl, "transform", mobileExitMs));
    }
    if (ruleEl) chromeWaits.push(waitForTransition(ruleEl, "transform", mobileExitMs));
    await Promise.all(chromeWaits);
  } else {
    const listDelay = readCssMs("--delay-footer-btn", 720) - readCssMs("--delay-footer-list", 450);
    const chromeFadeMs = getFooterRevealMs() + listDelay;
    const btnFadeMs = getFooterRevealMs() + 50;

    await Promise.all([
      waitForTransition(voltarBtn, "opacity", btnFadeMs),
      waitForTransition(continuarBtn, "opacity", btnFadeMs),
      listEl ? waitForTransition(listEl, "opacity", chromeFadeMs) : Promise.resolve(),
    ]);
  }

  voltarBtn.style.visibility = "hidden";
  continuarBtn.style.visibility = "hidden";
  if (listEl) listEl.style.visibility = "hidden";
  titleEl?.style.setProperty("visibility", "hidden");
  leadEl?.style.setProperty("visibility", "hidden");
  ruleEl?.style.setProperty("visibility", "hidden");
}

async function morphColReverse() {
  const openState = lastColOpenState;
  const colEl = getColEl(activeColId);
  const handoff = colMorphHandoff;
  if (!colEl || !handoff || !openState) return;

  /* Claro e dark: mesma velocidade; dark só muda a cor da ponte (cinza → preto). */
  if (isPlanTypeDarkTheme()) {
    await closeDarkModeToPlanSelection(colEl);
  } else {
    await closeLightModeToPlanSelection(colEl);
  }
}

async function measureImageHeroRect(cardImgEl) {
  cardImgEl.style.removeProperty("width");
  cardImgEl.style.removeProperty("height");
  cardImgEl.style.removeProperty("max-width");
  cardImgEl.style.removeProperty("max-height");
  cardImgEl.style.removeProperty("object-fit");
  cardImgEl.style.removeProperty("object-position");
  await nextFrame();
  return snapshotRect(cardImgEl.getBoundingClientRect());
}

async function measureImageHeroTarget(cardImgEl) {
  const wasMeasuring = tarefaScreen.classList.contains("is-measuring");
  tarefaScreen.classList.add("is-measuring");
  await nextFrame();
  const rect = await measureImageHeroRect(cardImgEl);
  if (!wasMeasuring) {
    tarefaScreen.classList.remove("is-measuring");
  }
  return rect;
}

function applyCardImageSize(targetImg, sizeRect) {
  targetImg.style.width = `${sizeRect.width}px`;
  targetImg.style.height = `${sizeRect.height}px`;
  targetImg.style.maxWidth = "none";
  targetImg.style.maxHeight = "none";
  targetImg.style.objectFit = "contain";
  targetImg.style.objectPosition = "center top";
}

function lockTarefaCardToRect(cardEl, imgEl, rect) {
  if (!cardEl || !imgEl || !rect.width || !rect.height) return;

  applyCardImageSize(imgEl, rect);
  cardEl.style.position = "fixed";
  cardEl.style.left = `${rect.left}px`;
  cardEl.style.top = `${rect.top}px`;
  cardEl.style.width = `${rect.width}px`;
  cardEl.style.height = `${rect.height}px`;
  cardEl.style.transform = "none";
  cardEl.style.margin = "0";
}

function resetColCardLayout() {
  const card = tarefaScreen.querySelector(".tarefa-screen__card");
  if (!card) return;

  card.style.removeProperty("visibility");
  card.style.removeProperty("position");
  card.style.removeProperty("left");
  card.style.removeProperty("top");
  card.style.removeProperty("width");
  card.style.removeProperty("height");
  card.style.removeProperty("transform");
  card.style.removeProperty("margin");
}

function preserveMorphTextStyles(el) {
  if (!el) return;
  const preserved = {
    fontSize: el.style.fontSize,
    lineHeight: el.style.lineHeight,
    letterSpacing: el.style.letterSpacing,
    width: el.style.width,
    height: el.style.height,
  };
  clearFlipOriginalInlineStyles(el);
  if (preserved.fontSize) el.style.fontSize = preserved.fontSize;
  if (preserved.lineHeight) el.style.lineHeight = preserved.lineHeight;
  if (preserved.letterSpacing) el.style.letterSpacing = preserved.letterSpacing;
  if (preserved.width) el.style.width = preserved.width;
  if (preserved.height) el.style.height = preserved.height;
}

function commitColOriginalImg(imgEl, imageRect) {
  const card = tarefaScreen.querySelector(".tarefa-screen__card");
  const placeholder = card.querySelector(".tarefa-screen__morph-slot");
  const sizeRect =
    imageRect?.width && imageRect?.height
      ? { width: imageRect.width, height: imageRect.height }
      : snapshotRect(imgEl.getBoundingClientRect());

  card.insertBefore(imgEl, placeholder);
  clearFlipOriginalInlineStyles(imgEl);
  resetColCardLayout();
  applyCardImageSize(imgEl, sizeRect);
  card.style.removeProperty("visibility");
  imgEl.style.removeProperty("visibility");
  if (isMobileStack) {
    imgEl.style.mixBlendMode = "lighten";
  } else {
    imgEl.style.removeProperty("mix-blend-mode");
  }
  getMobileImgLayer()?.replaceChildren();
}

function commitColOriginalTitle(titleEl) {
  const headingCopy =
    tarefaScreen.querySelector(".tarefa-screen__heading-copy") ||
    tarefaScreen.querySelector(".tarefa-screen__footer");
  const placeholder = headingCopy.querySelector(".tarefa-screen__title.tarefa-screen__morph-slot");

  titleEl.classList.add("tarefa-screen__title");
  titleEl.id = "planTypeTarefaScreenTitle";
  headingCopy.insertBefore(titleEl, placeholder);
  preserveMorphTextStyles(titleEl);
  titleEl.style.removeProperty("visibility");
  titleEl.style.removeProperty("overflow");
}

function commitColOriginalLead(leadEl) {
  const headingCopy =
    tarefaScreen.querySelector(".tarefa-screen__heading-copy") ||
    tarefaScreen.querySelector(".tarefa-screen__desc");
  const placeholder = headingCopy.querySelector(".tarefa-screen__lead.tarefa-screen__morph-slot");

  leadEl.classList.add("tarefa-screen__lead");
  headingCopy.insertBefore(leadEl, placeholder);
  preserveMorphTextStyles(leadEl);
  leadEl.style.removeProperty("visibility");
  leadEl.style.removeProperty("overflow");
  leadEl.style.removeProperty("text-align");
}

function commitColOriginalsHandoff(handoff, imageRect, options) {
  const skipImg = options && options.skipImg === true;
  tarefaScreen.classList.add("is-open", "is-morphed");
  /* PC e mobile: título/lead entram depois via revealMobileFooterContent (cima → baixo) */
  tarefaScreen.classList.remove("is-closing", "is-word-sweep", "is-hero-settling");

  if (!skipImg) {
    commitColOriginalImg(handoff.els.img, imageRect);
  }
  if (handoff.els.title) commitColOriginalTitle(handoff.els.title);
  if (handoff.els.lead) commitColOriginalLead(handoff.els.lead);

  if (pendingHeroLayout) {
    applyHeroLayout(pendingHeroLayout);
  }

  colMorphHandoff = handoff;
  pendingColMorphHandoff = null;
}

function flushPendingMobileImgCommit() {
  if (!pendingMobileImgCommit) return;
  const pending = pendingMobileImgCommit;
  pendingMobileImgCommit = null;
  if (!pending.img) return;
  commitColOriginalImg(pending.img, pending.imageRect);
}

function computeWordTrackExitX() {
  const track = tarefaScreen.querySelector(".tarefa-screen__word-track");
  const screenRect = tarefaScreen.getBoundingClientRect();
  if (!track) return screenRect.width;

  const words = [...track.querySelectorAll(".tarefa-screen__word")];
  if (!words.length) return screenRect.width;

  let wordsLeft = Infinity;
  for (const word of words) {
    const r = word.getBoundingClientRect();
    wordsLeft = Math.min(wordsLeft, r.left);
  }

  if (!Number.isFinite(wordsLeft)) return screenRect.width;

  return Math.ceil(screenRect.right - wordsLeft + 16);
}

function prepareWordTrackForReverse(shadeRect) {
  const track = tarefaScreen.querySelector(".tarefa-screen__word-track");
  if (!track) return;

  const trackRect = track.getBoundingClientRect();
  const shadeBasedStart = shadeRect.right - trackRect.left;
  const exitX = computeWordTrackExitX();
  const startX = Math.max(shadeBasedStart, exitX);

  tarefaScreen.style.setProperty("--word-track-start", `${startX}px`);
}

/** Mobile: letreiro no centro → sai para a direita (inverso da entrada). */
async function runMobileLetreiroExitReverse(shadeRect) {
  applyHeroLayoutStart();
  tarefaScreen.classList.remove("is-content-in", "is-list-ready");
  tarefaScreen.classList.add("is-word-sweep", "is-reversing", "is-hero-in");
  await nextFrame();
  await nextFrame();

  prepareWordTrackForReverse(shadeRect);
  await nextFrame();
  void tarefaScreen.querySelector(".tarefa-screen__word-track")?.offsetWidth;
  tarefaScreen.classList.remove("is-hero-in");
  await nextFrame();

  const track = tarefaScreen.querySelector(".tarefa-screen__word-track");
  const reverseMs = motionMs(getMorphReverseMs());
  if (track && reverseMs > 0) {
    await waitForTransition(track, "transform", reverseMs + 50);
  }
}

function prepareWordTrackFromColumn(shadeRect) {
  const track = tarefaScreen.querySelector(".tarefa-screen__word-track");
  if (!track) return;

  tarefaScreen.classList.remove("is-hero-in");
  tarefaScreen.style.setProperty("--word-track-start", "0px");

  const finalLeft = track.getBoundingClientRect().left;
  const startX = shadeRect.right - finalLeft;

  tarefaScreen.style.setProperty("--word-track-start", `${startX}px`);
}

function resetWordTrackOrigin() {
  tarefaScreen.style.removeProperty("--word-track-start");
}

async function morphColOriginalsToScreen(colEl, targets, pinnedImgFromRect = null, handoff = null) {
  const sourceTitle = handoff?.els.title || colEl.querySelector(".col__body h2");
  const sourceLead = handoff?.els.lead || colEl.querySelector(".col__lead");
  const sourceImg = handoff?.els.img || colEl.querySelector(".col__visual img");

  const measureFromRect = resolveMorphFromImgRect(sourceImg, pinnedImgFromRect);
  const morphPrep = await measureHeroMorphTarget(measureFromRect);
  const imageTarget = morphPrep.targetRect;

  hideScreenMorphSources();
  if (sourceTitle) hideMobileMorphText(sourceTitle);
  if (sourceLead) hideMobileMorphText(sourceLead);

  const imageEndRect = await fadeMobileImageIntoHero(sourceImg, imageTarget, morphPrep);

  const endPos = imageEndRect?.width ? snapshotRect(imageEndRect) : snapshotRect(imageTarget);
  const handoffRect = {
    left: endPos.left,
    top: endPos.top,
    width: imageTarget.width,
    height: imageTarget.height,
  };
  if (handoff) {
    if (handoff.els.img) {
      commitColOriginalsHandoff(handoff, handoffRect, { skipImg: true });
      pendingMobileImgCommit = { img: handoff.els.img, imageRect: handoffRect };
    } else {
      commitColOriginalsHandoff(handoff, handoffRect);
    }
  }

  return handoffRect;
}

async function expandColBackdrop() {
  const backdrop = tarefaScreen.querySelector(".tarefa-screen__backdrop");
  if (!backdrop) return;

  if (motionMs(getShadeSweepMs()) === 0) {
    backdrop.classList.add("is-sweep-done");
    return;
  }

  backdrop.classList.remove("is-sweep-done");
  backdrop.classList.add("is-sweeping");
  await nextFrame();
  await nextFrame();
  void backdrop.offsetWidth;

  backdrop.classList.add("is-active");
  await waitForTransition(backdrop, "width", motionMs(getShadeSweepMs()));
  backdrop.classList.remove("is-sweeping", "is-active");
  backdrop.classList.add("is-sweep-done");
}

/** Desktop: sem sweep esquerda→direita — backdrop preto full + fade (igual sumir do claro/mobile). */
function finishColBackdropInstant() {
  const backdrop = tarefaScreen.querySelector(".tarefa-screen__backdrop");
  if (!backdrop) return;

  tarefaScreen.style.setProperty("--shade-start-left", "0px");
  tarefaScreen.style.setProperty("--shade-start-width", "100%");
  backdrop.classList.remove("is-sweeping", "is-active", "is-sweep-collapsed");
  backdrop.classList.add("is-sweep-done");
}

function syncBackdropToColumnShade() {
  const backdrop = tarefaScreen.querySelector(".tarefa-screen__backdrop");
  const colEl = activeColId ? getColEl(activeColId) : null;
  const shadeEl = colEl?.querySelector(".col__shade");
  if (!backdrop || !shadeEl) return;

  const shadeRect = shadeEl.getBoundingClientRect();
  const screenRect = tarefaScreen.getBoundingClientRect();

  tarefaScreen.style.setProperty("--shade-start-left", `${shadeRect.left - screenRect.left}px`);
  tarefaScreen.style.setProperty("--shade-start-width", `${shadeRect.width}px`);

  backdrop.classList.remove("is-sweeping", "is-active", "is-sweep-done");
  backdrop.classList.add("is-sweep-collapsed");
}

function resetColBackdrop() {
  const backdrop = tarefaScreen.querySelector(".tarefa-screen__backdrop");
  backdrop?.classList.remove("is-sweeping", "is-active", "is-sweep-done", "is-sweep-collapsed");
}

async function openColScreenInstant(colEl, handoff, pinnedImgFromRect, shadeRect, sourceRects) {
  beginShadeOverlay();
  tarefaScreen.hidden = false;
  tarefaScreen.classList.add("is-hero-in");
  tarefaScreen.querySelector(".tarefa-screen__backdrop")?.classList.add("is-sweep-done");
  applyShadeHandoff(shadeRect);

  const morphPrep = await measureHeroMorphTarget(pinnedImgFromRect);
  if (morphPrep.layout) {
    beginHeroOpenLayout(morphPrep.layout);
  }

  const handoffRect = {
    left: morphPrep.targetRect.left,
    top: morphPrep.targetRect.top,
    width: morphPrep.targetRect.width,
    height: morphPrep.targetRect.height,
  };
  commitColOriginalsHandoff(handoff, handoffRect);

  lastColOpenState = {
    sourceRects,
    imageTarget: morphPrep.targetRect,
    shadeRect,
    shadeStartScale: 0,
  };

  tarefaScreen.setAttribute("aria-hidden", "false");
  app.classList.add("is-col-open");
  document.body.style.overflow = "hidden";
  activateColScreenA11y();
  await revealMobileFooterContent();
}

function abortColOpen() {
  const colEl = activeColId ? getColEl(activeColId) : null;

  resetHeroWordLayout();
  pendingHeroLayout = null;
  app.classList.remove(
    "is-col-opening",
    "is-col-open",
    "is-col-shade-overlay",
    "is-mobile-blackout",
    "is-brand-exiting",
  );
  colEl?.classList.remove("is-shade-handoff");
  resetAppBrand(colEl);
  document.body.style.overflow = "";
  tarefaScreen.hidden = true;
  tarefaScreen.setAttribute("aria-hidden", "true");
  tarefaScreen.classList.remove(
    "is-open",
    "is-morphed",
    "is-list-ready",
    "is-hero-in",
    "is-content-in",
    "is-word-sweep",
    "is-measuring",
    "is-hero-settling",
    "is-hero-settling-reverse",
    "is-mobile-img-fading",
  );
  if (colEl) restoreColElements(colEl);
  pendingMobileImgCommit = null;
  pendingColMorphHandoff = null;
  getMobileImgLayer()?.replaceChildren();
  resetWordTrackOrigin();
  resetShadeHandoff();
  resetColBackdrop();
  deactivateColScreenA11y();
  activeColId = null;
}

async function openColScreen(colId) {
  if (!tarefaScreen.hidden || isOpeningCol) return;

  isOpeningCol = true;
  activeColId = colId;
  const colEl = getColEl(colId);
  if (!colEl) {
    isOpeningCol = false;
    activeColId = null;
    return;
  }

  const hoverWasSettled = colHoverSettled && colHoverSettleColId === colId && hoverCol === colId;

  try {
    app.classList.add("is-brand-exiting");
    await nextFrame();
    await ensureColHoverSettled(colId, { instant: !hoverWasSettled });
    await exitAppBrand();
    app.classList.add("is-mobile-blackout");
    await nextFrame();
    populateColScreen(colId);
    const pinnedImgFromRect = measureColumnImgHoverRect(colEl);
    const handoff = saveColumnSlots(colEl);
    pendingColMorphHandoff = handoff;

    const sourceRects = measureColumnRects(colEl);
    const shadeRect = isMobileStack
      ? resolveMobileShadeRect(colEl, colEl.querySelector(".col__shade"))
      : colEl.querySelector(".col__shade").getBoundingClientRect();

    const targets = await measureTarefaTargets();

    if (motionMs(getMorphClickMs()) === 0) {
      tarefaScreen.hidden = false;
      await nextFrame();
      await openColScreenInstant(colEl, handoff, pinnedImgFromRect, shadeRect, sourceRects);
      app.classList.remove("is-mobile-blackout");
      return;
    }

    tarefaScreen.hidden = false;
    app.classList.add("is-col-opening");
    tarefaScreen.classList.add("is-word-sweep");
    const shadeStartScale = applyShadeHandoff(shadeRect);
    await nextFrame();
    beginShadeOverlay();
    prepareWordTrackFromColumn(shadeRect);

    if (handoff.els.img) {
      const heroImg = handoff.els.img;
      if (!heroImg.complete || !heroImg.naturalWidth) {
        if (heroImg.decode) {
          try {
            await heroImg.decode();
          } catch (_) {
            /* segue com morph */
          }
        }
      }
    }

    let imageEndRect;

    if (isMobileStack) {
      colEl.classList.add("is-shade-handoff");
      [, imageEndRect] = await Promise.all([
        expandColBackdrop(),
        morphColOriginalsToScreen(colEl, targets, pinnedImgFromRect, handoff),
      ]);
      colEl.classList.remove("is-shade-handoff");
    } else {
      /* Desktop: fundo cinza full + letreiro R→L (sem sweep do painel L→R) */
      finishColBackdropInstant();
      imageEndRect = await morphColOriginalsToScreen(
        colEl,
        targets,
        pinnedImgFromRect,
        handoff,
      );
    }

    lastColOpenState = {
      sourceRects,
      imageTarget: imageEndRect,
      pinnedImgFromRect,
      shadeRect,
      shadeStartScale,
    };

    tarefaScreen.setAttribute("aria-hidden", "false");
    app.classList.add("is-col-open");
    app.classList.remove("is-col-opening", "is-mobile-blackout", "is-brand-exiting");
    flushPendingMobileImgCommit();
    await revealMobileFooterContent();
    document.body.style.overflow = "hidden";
    activateColScreenA11y();
  } catch (error) {
    console.error(`Erro ao abrir coluna ${colId}:`, error);
    abortColOpen();
  } finally {
    isOpeningCol = false;
  }
}

async function closeColScreen() {
  if (tarefaScreen.hidden || isClosingCol || isOpeningCol || !activeColId) return;

  isClosingCol = true;
  const colId = activeColId;

  try {
    setHover(colId);
    await ensureColHoverSettled(colId, { instant: true });
    beginShadeOverlay();
    await nextFrame();

    if (lastColOpenState) {
      await morphColReverse();
    }
  } catch (error) {
    console.error(`Erro ao fechar coluna ${colId}:`, error);
  } finally {
    await finalizeColClose();
    isClosingCol = false;
    lastColOpenState = null;
  }
}

function bindPlanTypeFigmaEvents() {
  cols.forEach((col) => {
    const id = col.dataset.col;

    if (!isTouch) {
      col.addEventListener("mouseenter", () => setHover(id));
      col.addEventListener("mouseleave", () => {
        if (hoverCol === id) clearHover();
      });
    } else {
      col.addEventListener("touchstart", () => {
        if (isMobileStack) setHover(id);
      }, { passive: true });
    }

    col.addEventListener("click", (e) => {
      e.stopPropagation();
      handleColActivate(id);
    });

    col.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleColActivate(id);
      }
    });
  });

  if (!isTouch) {
    stage.addEventListener("mouseleave", clearHover);
  } else {
    touchHandler = (e) => {
      if (!app || app.hidden) return;
      if (e.target.closest(".col")) return;
      clearHover();
    };
    document.addEventListener("touchstart", touchHandler);
  }

  continuarBtn.addEventListener("click", confirmColScreen);
  voltarBtn.addEventListener("click", closeColScreen);

  if (stageBackBtn) {
    stageBackBtn.addEventListener("click", function () {
      if (typeof backCallback === "function") {
        backCallback();
        return;
      }
      window.location.href = "dashboard.html?view=cards";
    });
  }

  escHandler = (e) => {
    if (e.key !== "Escape") return;
    if (!app || app.hidden) return;
    if (!tarefaScreen.hidden) closeColScreen();
  };
  document.addEventListener("keydown", escHandler);

  app.querySelectorAll(".col__visual img, .tarefa-screen__card img").forEach((img) => {
    img.addEventListener("error", () => {
      console.warn(`Imagem ausente: ${img.getAttribute("src")}. Rode: node sync-figma.mjs`);
    });
  });

  window.addEventListener("resize", function () {
    syncMobileStackLayout();
    if (!tarefaScreen || tarefaScreen.hidden) return;
    debouncedFitHeroWordLayout();
  });
}

function initPlanTypeFigma(options) {
  options = options || {};
  confirmCallback = options.onConfirm || null;
  backCallback = options.onBack || null;

  app = document.getElementById("planTypeFigmaApp");
  if (!app) return;
  if (initialized) return;
  initialized = true;

  stage = app.querySelector("#planTypeStage");
  header = app.querySelector(".header");
  tarefaScreen = app.querySelector("#planTypeTarefaScreen");
  continuarBtn = app.querySelector("#planTypeContinuarBtn");
  voltarBtn = app.querySelector("#planTypeVoltarBtn");
  stageBackBtn = app.querySelector("#planTypeStageBackBtn");
  cols = [...app.querySelectorAll(".col")];

  bindPlanTypeFigmaEvents();
  syncMobileStackLayout();
  mobileStackMq.addEventListener("change", syncMobileStackLayout);
  sync();
  syncReducedMotion();
  prefersReducedMotion.addEventListener("change", syncReducedMotion);

  if (tarefaScreen.hidden) {
    app.classList.remove("is-col-open", "is-col-opening", "is-col-closing");
  }
}

function setPlanTypeFigmaVisible(visible) {
  if (!app) app = document.getElementById("planTypeFigmaApp");
  if (!app) return;
  app.hidden = !visible;
  if (visible) {
    document.documentElement.classList.add("create-wizard-step1-active");
    document.body.style.overflow = "hidden";
    sync();
  } else {
    document.documentElement.classList.remove("create-wizard-step1-active");
    if (!tarefaScreen || tarefaScreen.hidden) {
      document.body.style.overflow = "";
    }
  }
}

function resetPlanTypeColTextVisibility() {
  app?.querySelectorAll(".col__body h2, .col__lead").forEach((el) => {
    el.style.removeProperty("visibility");
  });
  const morphSlots = getMorphSlotEls();
  morphSlots.titleEl?.style.removeProperty("visibility");
  morphSlots.leadEl?.style.removeProperty("visibility");
}

global.initPlanTypeFigma = initPlanTypeFigma;
global.setPlanTypeFigmaVisible = setPlanTypeFigmaVisible;
global.finalizePlanTypeConfirmCleanup = finalizePlanTypeConfirmCleanup;
global.resetPlanTypeColTextVisibility = resetPlanTypeColTextVisibility;
})(typeof window !== "undefined" ? window : globalThis);
