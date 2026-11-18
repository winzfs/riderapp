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
})();
