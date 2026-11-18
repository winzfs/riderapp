// Rider Spot navigation: browser history and Android WebView back share one stack.
// Only UI state is tracked. GPS capture, ride persistence and database data stay untouched.
const KEY = "__rsNav";
const LAYER = "__rsLayer";
const VERSION = 187;
const TABS = new Set(["nearby","trips","community","bike","account","tools"]);
const DEFAULT = "nearby";
const ROOT_GUARD = 1;
export function createNavigationController(win = window) {
  if (win.__rsNavigation) return win.__rsNavigation;
  const history = win.history;
  const current = history.state?.[KEY];
  let tab = TABS.has(current?.tab) && current?.version === VERSION ? current.tab : DEFAULT;
  let serial = current?.version === VERSION ? current.step : ROOT_GUARD;
  let onTab = () => {};
  let lastRootBack = 0;
  let overlays = [];
  let sequence = 0;
  let disposed = false;
  const emit = (type, detail) => {
    if (typeof win.CustomEvent === "function")
      win.dispatchEvent(new win.CustomEvent(type, { detail }));
  };
  const copy = (extra = {}) => Object.assign({}, history.state || {}, extra);
  const state = (targetTab, step) => ({ version: VERSION, tab: targetTab, step });
  if (current?.version !== VERSION) {
    history.replaceState(copy({ [KEY]: state(DEFAULT, 0) }), "", win.location?.href);
    history.pushState(copy({ [KEY]: state(DEFAULT, ROOT_GUARD) }), "", win.location?.href);
  }
  function publish(next) {
    if (!TABS.has(next)) return;
    tab = next;
    onTab(next);
    emit("riderspot:tab-restored", next);
  }
  function goTab(next, { replace = false } = {}) {
    if (!TABS.has(next) || next === tab) return false;
    serial += 1;
    // Drop a stale sheet marker when a screen changes; the sheet itself is unmounted.
    const nextState = copy({ [KEY]: state(next, serial), [LAYER]: undefined, recordSheet: undefined });
    if (replace) history.replaceState(nextState, "", win.location?.href);
    else history.pushState(nextState, "", win.location?.href);
    publish(next);
    return true;
  }
  function rootBack() {
    const now = Date.now();
    const twice = now - lastRootBack < 1900;
    lastRootBack = now;
    if (twice) {
      emit("riderspot:exit-request");
      // A native Android activity may expose this optional exit bridge.
      if (typeof win.__rsNativeExit === "function") win.__rsNativeExit();
      else history.back();
      return;
    }
    // Keep a guarded root entry so the first Back gesture never closes the app.
    history.pushState(copy({ [KEY]: state(DEFAULT, ROOT_GUARD), [LAYER]: undefined }), "", win.location?.href);
    emit("riderspot:root-back", { message: "뒤로가기를 한 번 더 누르면 앱을 종료합니다." });
  }
  function pop() {
    if (disposed) return;
    const top = overlays.at(-1);
    if (top && history.state?.[LAYER] !== top.marker) {
      const handled = top.dismiss();
      // Do not lose the sheet's history entry while a database write is busy.
      if (handled === false)
        history.pushState(copy({ [LAYER]: top.marker }), "", win.location?.href);
      return;
    }
    const record = history.state?.[KEY];
    if (record?.version !== VERSION) return;
    if (TABS.has(record.tab)) publish(record.tab);
    serial = Math.max(serial, record.step || 0);
    if (record.step === 0 && record.tab === DEFAULT) rootBack();
  }
  function registerLayer(type, dismiss) {
    const marker = "rs-layer-" + (++sequence) + "-" + Date.now();
    overlays.push({ type, marker, dismiss });
    history.pushState(copy({ [LAYER]: marker }), "", win.location?.href);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const i = overlays.findIndex(item => item.marker === marker);
      if (i >= 0) overlays.splice(i, 1);
      // Only consume the top layer's entry. Never remove a parent's history entry.
      if (history.state?.[LAYER] === marker) history.back();
    };
  }
  function back() {
    if (disposed) return false;
    if (history.state?.[KEY]?.step === 0 && !overlays.length) rootBack();
    else history.back();
    return true;
  }
  const key = event => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (event.target?.closest?.("input,textarea,[contenteditable=true]")) return;
    // Native dialogs, map sheets and modals own Escape themselves.
    if (win.document?.querySelector?.("dialog[open],.modal-backdrop,.rs-sheet-backdrop,[role=dialog]")) return;
    // Native Android Back is managed via history; Escape supports desktop/keyboard.
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
    subscribe(listener) { onTab = listener; listener(tab); return () => { if (onTab === listener) onTab = () => {}; }; },
    destroy() { disposed = true; win.removeEventListener("popstate", pop); win.removeEventListener("keydown", key); delete win.__rsNavigation; },
  };
  win.__rsNavigation = api;
  // An Android WebView Activity may call this when hardware Back is pressed.
  win.__rsHandleBack = back;
  return api;
}
