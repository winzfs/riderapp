/* Rider Spot v54: preserve the selected screen across Android WebView reloads.
 * Does not touch GPS, trip SQLite, account/session storage or network requests.
 */
(() => {
  "use strict";
  if (window.__rsTabResumeInstalled) return;
  window.__rsTabResumeInstalled = true;

  const KEY = "rs:ui:selected-tab-v54";
  const TABS = {
    "운행":"nearby", "동네":"community", "내 바이크":"bike",
    "지도": "nearby",
    "타임라인": "trips",
    "업무": "tools",
    "커뮤니티": "community",
    "내 정보": "account",
  };
  const VALID = new Set(Object.values(TABS));
  function read() {
    try {
      const saved = localStorage.getItem(KEY);
      return VALID.has(saved) ? saved : "nearby";
    } catch {
      return "nearby";
    }
  }
  const freshLaunch = window.performance?.getEntriesByType?.("navigation")[0]?.type === "navigate";
  let desired = freshLaunch ? "nearby" : read();
  let go = typeof window.__rsGoToTab === "function" ? window.__rsGoToTab : null;
  let lastAction = 0;
  let bootedAt = Date.now();
  let lastRepair = 0;
  let repairCount = 0;
  let toolsOpened = false;

  function remember(tab) {
    if (!VALID.has(tab)) return;
    desired = tab;
    lastAction = Date.now();
    repairCount = 0;
    toolsOpened = tab === "tools";
    try { localStorage.setItem(KEY, tab); } catch { /* optional */ }
  }

  // React replaces this setter on every render. The accessor preserves the
  // original state setter while tracking programmatic navigation, too.
  try {
    Object.defineProperty(window, "__rsGoToTab", {
      configurable: true,
      get() {
        return function (tab) {
          remember(tab);
          return typeof go === "function" ? go(tab) : undefined;
        };
      },
      set(value) { go = value; },
    });
  } catch { /* The bottom-navigation listener remains a fallback. */ }

  function rememberPointer(event) {
    const target = event.target?.nodeType === 1
      ? event.target
      : event.target?.parentElement;
    if (!target?.closest) return;
    const button = target.closest("nav.bottom-nav button");
    if (button) {
      const label = button.querySelector("span:last-child")?.textContent?.trim();
      if (TABS[label]) remember(TABS[label]);
      return;
    }
    if (target.closest("header a.brand")) remember("nearby");
    else if (target.closest("header button[aria-label='내 계정']")) remember("account");
  }
  // A touch must be stored *before* a WebView renderer restarts, not after the
  // click callback or a React render that may never finish.
  document.addEventListener("pointerdown", rememberPointer, true);
  document.addEventListener("click", rememberPointer, true);

  function navTab() {
    const active = document.querySelector("nav.bottom-nav button[aria-current='page']");
    return active ? TABS[active.querySelector("span:last-child")?.textContent?.trim()] : null;
  }

  function repair() {
    if (document.hidden || Date.now() - bootedAt < 500 ||
        Date.now() - lastAction < 650 || desired === "nearby") return;
    if (desired === "tools") {
      if (!toolsOpened && typeof window.__rsOpenTool === "function" &&
          document.querySelector("nav.bottom-nav")) {
        toolsOpened = true;
        window.__rsOpenTool("hub");
      }
      return;
    }
    if (window.__rsActiveTab === desired || navTab() === desired || typeof go !== "function") return;

    const now = Date.now();
    if (now - lastRepair > 12000) repairCount = 0;
    // Avoid a crash/reload loop for a screen that is itself broken.
    if (repairCount >= 3 || now - lastRepair < 1200) return;
    lastRepair = now;
    repairCount++;
    go(desired);
  }

  setInterval(repair, 240);
  window.addEventListener("pageshow", repair);
  window.__rsTabResumeState = () => ({ desired, active: navTab(), repairs: repairCount });
})();
