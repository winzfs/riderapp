/* Legacy tab preference compatibility. Never navigate from a timer or retry a
 * previous tab: the navigation controller is the single source of truth.
 * This script intentionally does not wrap __rsGoToTab or run a repair loop.
 */
(() => {
  "use strict";
  if (window.__rsTabResumeInstalled) return;
  window.__rsTabResumeInstalled = true;
  const KEY = "rs:ui:selected-tab-v54";
  const VALID = new Set(["nearby", "trips", "community", "bike", "account", "tools"]);
  let lastSelected = "nearby";
  try {
    const saved = localStorage.getItem(KEY);
    if (VALID.has(saved)) lastSelected = saved;
  } catch { /* Preference is optional. */ }

  window.addEventListener("riderspot:tab-restored", event => {
    if (!VALID.has(event.detail)) return;
    lastSelected = event.detail;
    try { localStorage.setItem(KEY, lastSelected); } catch { /* optional */ }
  });
  window.__rsTabResumeState = () => ({
    desired: lastSelected,
    active: window.__rsNavigation?.tab || window.__rsActiveTab || "nearby",
    repairs: 0,
  });
  // Lightweight local-only lifecycle log. No GPS, identity or trip data.
  const DIAG_KEY = "rs:page-lifecycle:v1";
  // Persist across Activity/WebView recreation: sessionStorage alone is lost
  // when Android replaces the renderer, hiding the cause of repeated boots.
  const PERSISTENT_DIAG_KEY = "rs:page-lifecycle:persistent:v2";
  function readLog(storage, key) {
    try {
      const value = JSON.parse(storage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }
  function recordLifecycle(type, detail = "") {
    const entry = { at: Date.now(), type, detail: String(detail).slice(0, 60) };
    for (const [storage, key] of [[sessionStorage, DIAG_KEY], [localStorage, PERSISTENT_DIAG_KEY]]) {
      try {
        const rows = readLog(storage, key);
        rows.push(entry);
        storage.setItem(key, JSON.stringify(rows.slice(-64)));
      } catch { /* Private browsing and disabled storage are supported. */ }
    }
  }
  window.__rsReloadDiagnostics = () => ({
    currentSession: readLog(sessionStorage, DIAG_KEY),
    persistent: readLog(localStorage, PERSISTENT_DIAG_KEY),
  });
  const navigationType = window.performance?.getEntriesByType?.("navigation")?.[0]?.type;
  recordLifecycle("boot", navigationType || "unknown");
  window.addEventListener("pagehide", event => recordLifecycle("pagehide", event.persisted ? "bfcache" : "unload"));
  window.addEventListener("beforeunload", () => recordLifecycle("beforeunload"));
  window.addEventListener("pageshow", event => recordLifecycle("pageshow", event.persisted ? "bfcache" : "normal"));
  window.addEventListener("error", () => recordLifecycle("window-error"));
  window.addEventListener("unhandledrejection", () => recordLifecycle("unhandled-rejection"));
  try {
    window.navigator?.serviceWorker?.addEventListener("controllerchange", () => recordLifecycle("sw-controllerchange"));
  } catch { /* Unavailable in some Android shells. */ }

})();
