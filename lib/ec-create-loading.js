(function (global) {
  var STEP4_CREATE_LOADING_MIN_MS = 240;
  var _step4PickerLoadingTimer = null;
  var _loadingShownAt = 0;
  var _loadingHideTimer = null;

  function ensureLoadingOverlayOnTop(overlay) {
    if (!overlay || !document.body) return;
    document.body.appendChild(overlay);
  }

  function getStep4CreateLoadingRemainingMs() {
    if (!_loadingShownAt) return 0;
    return Math.max(0, STEP4_CREATE_LOADING_MIN_MS - (Date.now() - _loadingShownAt));
  }

  function hideStep4CreateLoadingImmediate() {
    var overlay = document.getElementById("step4CreateLoading");
    var root = document.documentElement;
    _loadingShownAt = 0;
    if (!overlay) {
      root.classList.remove("step4-create-loading-open", "step4-create-loading-over");
      return;
    }
    overlay.classList.remove("is-active", "is-over-transition");
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("aria-busy", "false");
    root.classList.remove("step4-create-loading-open", "step4-create-loading-over");
  }

  function showStep4CreateLoading(title, subtitle, options) {
    options = options || {};
    var overlay = document.getElementById("step4CreateLoading");
    if (!overlay) return;
    if (_loadingHideTimer) {
      clearTimeout(_loadingHideTimer);
      _loadingHideTimer = null;
    }
    _loadingShownAt = Date.now();
    var titleEl = document.getElementById("step4CreateLoadingTitle");
    var subtitleEl = document.getElementById("step4CreateLoadingSubtitle");
    if (titleEl && title) titleEl.textContent = title;
    if (subtitleEl && subtitle) subtitleEl.textContent = subtitle;
    var overTransition = !!options.overTransition;
    var root = document.documentElement;
    overlay.classList.toggle("is-over-transition", overTransition);
    root.classList.toggle("step4-create-loading-over", overTransition);
    ensureLoadingOverlayOnTop(overlay);
    overlay.classList.remove("hidden");
    if (overTransition) {
      void overlay.offsetWidth;
    }
    overlay.classList.add("is-active");
    overlay.setAttribute("aria-hidden", "false");
    overlay.setAttribute("aria-busy", "true");
    root.classList.add("step4-create-loading-open");
  }

  function hideStep4CreateLoading(onHidden) {
    var remaining = getStep4CreateLoadingRemainingMs();
    var complete = function () {
      hideStep4CreateLoadingImmediate();
      if (typeof onHidden === "function") onHidden();
    };
    if (remaining <= 0) {
      if (_loadingHideTimer) {
        clearTimeout(_loadingHideTimer);
        _loadingHideTimer = null;
      }
      complete();
      return;
    }
    if (_loadingHideTimer) return;
    _loadingHideTimer = setTimeout(function () {
      _loadingHideTimer = null;
      complete();
    }, remaining);
  }

  function setStep4CreateLoadingMessage(title, subtitle) {
    var titleEl = document.getElementById("step4CreateLoadingTitle");
    var subtitleEl = document.getElementById("step4CreateLoadingSubtitle");
    if (titleEl && title) titleEl.textContent = title;
    if (subtitleEl && subtitle) subtitleEl.textContent = subtitle;
  }

  function beginStep4PickerLoading(title, subtitle, triggerBtn) {
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.classList.add("is-loading");
      triggerBtn.setAttribute("aria-busy", "true");
    }
    showStep4CreateLoading(title || "Salvando…", subtitle || "Aguarde um instante", { overTransition: true });
  }

  function endStep4PickerLoading(triggerBtn, restoreBtnState, minMs) {
    if (_step4PickerLoadingTimer) {
      clearTimeout(_step4PickerLoadingTimer);
      _step4PickerLoadingTimer = null;
    }
    var extraMs = typeof minMs === "number" ? minMs : 0;
    var waitMs = Math.max(extraMs, getStep4CreateLoadingRemainingMs());
    var finish = function () {
      hideStep4CreateLoading(function () {
        if (triggerBtn) {
          triggerBtn.classList.remove("is-loading");
          triggerBtn.removeAttribute("aria-busy");
          if (typeof restoreBtnState === "function") {
            restoreBtnState();
          }
        }
      });
    };
    if (waitMs <= 0) {
      finish();
      return;
    }
    _step4PickerLoadingTimer = setTimeout(finish, waitMs);
  }

  function runStep4PickerLoadingAction(title, subtitle, triggerBtn, actionFn, restoreBtnState, minMs) {
    beginStep4PickerLoading(title, subtitle, triggerBtn);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        try {
          if (typeof actionFn === "function") actionFn();
        } catch (err) {
          console.error("runStep4PickerLoadingAction:", err);
          hideStep4CreateLoading(function () {
            if (triggerBtn) {
              triggerBtn.classList.remove("is-loading");
              triggerBtn.removeAttribute("aria-busy");
              if (typeof restoreBtnState === "function") restoreBtnState();
            }
          });
          return;
        }
        endStep4PickerLoading(triggerBtn, restoreBtnState, minMs);
      });
    });
  }

  function initLoadingOverlayPlacement() {
    var overlay = document.getElementById("step4CreateLoading");
    if (overlay) ensureLoadingOverlayOnTop(overlay);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLoadingOverlayPlacement);
  } else {
    initLoadingOverlayPlacement();
  }

  global.STEP4_CREATE_LOADING_MIN_MS = STEP4_CREATE_LOADING_MIN_MS;
  global.showStep4CreateLoading = showStep4CreateLoading;
  global.hideStep4CreateLoading = hideStep4CreateLoading;
  global.setStep4CreateLoadingMessage = setStep4CreateLoadingMessage;
  global.beginStep4PickerLoading = beginStep4PickerLoading;
  global.endStep4PickerLoading = endStep4PickerLoading;
  global.runStep4PickerLoadingAction = runStep4PickerLoadingAction;
})(typeof window !== "undefined" ? window : globalThis);
