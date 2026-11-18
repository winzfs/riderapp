// Rider Spot navigation policy: Back dismisses a visible overlay; otherwise
// the first press prompts and the second press requests app exit.
// Tab changes never add browser-history entries or replay visited tabs.
const KEY = "__rsNav";
const LAYER = "__rsLayer";
const VERSION = 192;
const TABS = new Set(["nearby", "trips", "community", "earnings", "bike", "account", "tools"]);
const DEFAULT = "nearby";
const DOUBLE_BACK_MS = 2000;

export function createNavigationController(win = window) {
  if (win.__rsNavigation) return win.__rsNavigation;
  const history = win.history;
  const previous = history.state?.[KEY];
  let tab = previous?.version === VERSION && TABS.has(previous.tab)
    ? previous.tab : DEFAULT;
  let onTab = () => {};
  let lastBack = 0;
  let overlays = [];
  let sequence = 0;
  let disposed = false;
  let suppressNextPop = false;

  const emit = (type, detail) => {
    if (typeof win.CustomEvent === "function")
      win.dispatchEvent(new win.CustomEvent(type, { detail }));
  };
  const copy = extra => Object.assign({}, history.state || {}, extra);
  const state = next => ({ version: VERSION, tab: next, step: 1 });
  const url = () => win.location?.href;

  // A guard keeps one Back event inside the PWA/WebView. Migrating from the old
  // tab-history scheme deliberately starts at the map, not a stale saved tab.
  if (previous?.version !== VERSION) {
    history.replaceState(copy({ [KEY]: state(DEFAULT), [LAYER]: undefined, recordSheet: undefined }), "", url());
    history.pushState(copy({ [KEY]: state(DEFAULT), [LAYER]: undefined, recordSheet: undefined }), "", url());
  }

  function publish(next) {
    if (!TABS.has(next)) return;
    tab = next;
    onTab(next);
    emit("riderspot:tab-restored", next);
  }
  function goTab(next) {
    if (!TABS.has(next) || next === tab) return false;
    lastBack = 0;
    // Replacing (rather than pushing) history prevents Back from visiting tabs.
    history.replaceState(copy({
      [KEY]: state(next),
      [LAYER]: undefined,
      recordSheet: undefined,
    }), "", url());
    publish(next);
    return true;
  }
  function exitRequest(fromPop) {
    lastBack = 0;
    emit("riderspot:exit-request");
    if (typeof win.__rsNativeExit === "function") {
      win.__rsNativeExit();
    } else if (fromPop) {
      // Browser/PWA Back has already popped the guard; allow leaving the page.
      suppressNextPop = true;
      history.back();
    }
    // The Android host can also finish its Activity when __rsHandleBack
    // returns false. Do not navigate to a previously visited tab.
    return false;
  }
  function rootBack(fromPop = false) {
    const now = Date.now();
    if (lastBack && now - lastBack <= DOUBLE_BACK_MS) return exitRequest(fromPop);
    lastBack = now;
    if (fromPop) {
      history.pushState(copy({ [KEY]: state(tab), [LAYER]: undefined }), "", url());
    }
    emit("riderspot:root-back", {
      message: "뒤로가기를 한 번 더 누르면 앱을 종료합니다.",
    });
    return true;
  }
  function pop() {
    if (disposed) return;
    if (suppressNextPop) {
      suppressNextPop = false;
      return;
    }
    const top = overlays.at(-1);
    if (top) {
      if (history.state?.[LAYER] !== top.marker) {
        lastBack = 0;
        const handled = top.dismiss();
        // Keep the open sheet reachable while a save operation is in progress.
        if (handled === false)
          history.pushState(copy({ [LAYER]: top.marker }), "", url());
      }
      return;
    }
    // popstate must never restore a tab from an old history entry.
    rootBack(true);
  }
  function registerLayer(type, dismiss) {
    const marker = "rs-layer-" + (++sequence) + "-" + Date.now();
    overlays.push({ type, marker, dismiss });
    lastBack = 0;
    history.pushState(copy({ [LAYER]: marker }), "", url());
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const index = overlays.findIndex(item => item.marker === marker);
      if (index >= 0) overlays.splice(index, 1);
      lastBack = 0;
      if (history.state?.[LAYER] === marker) {
        // A close button closed the sheet (no user Back). Consume its marker
        // without treating the corresponding popstate as an exit press.
        suppressNextPop = true;
        history.back();
      }
    };
  }
  function back() {
    if (disposed) return false;
    const top = overlays.at(-1);
    if (top) {
      if (history.state?.[LAYER] === top.marker) history.back();
      else top.dismiss();
      return true;
    }
    return rootBack();
  }
  const key = event => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (event.target?.closest?.("input,textarea,[contenteditable=true]")) return;
    // Dialogs and sheet components already handle keyboard Escape.
    if (win.document?.querySelector?.("dialog[open],.modal-backdrop,.rs-sheet-backdrop,[role=dialog]")) return;
    event.preventDefault();
    back();
  };
  win.addEventListener("popstate", pop);
  win.addEventListener("keydown", key);
  const api = {
    get tab() { return tab; },
    get depth() { return overlays.length; },
    topLayer() { return overlays.at(-1)?.type || null; },
    goTab,
    back,
    registerLayer,
    subscribe(listener) {
      onTab = listener;
      listener(tab);
      return () => { if (onTab === listener) onTab = () => {}; };
    },
    destroy() {
      disposed = true;
      win.removeEventListener("popstate", pop);
      win.removeEventListener("keydown", key);
      delete win.__rsNavigation;
      delete win.__rsHandleBack;
    },
  };
  win.__rsNavigation = api;
  win.__rsHandleBack = back;
  return api;
}
