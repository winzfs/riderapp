// A single transient sheet; reuses existing safe DOM and event handlers.
let activeClose;
export function openMapSheet(content, title, onDispose) {
  activeClose?.();
  const previous = document.activeElement,
    backdrop = document.createElement("div"),
    sheet = document.createElement("section"),
    close = document.createElement("button");
  backdrop.className = "rs-sheet-backdrop";
  sheet.className = "rs-map-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", title || "지도 상세");
  close.className = "close";
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "상세 닫기");
  content.classList.add("rs-sheet-content");
  sheet.append(close, content);
  backdrop.append(sheet);
  document.body.append(backdrop);
  const overflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  let unregister;
  let closing = false;
  const cleanup = () => {
    if (closing) return;
    closing = true;
    unregister?.();
    backdrop.remove();
    document.body.style.overflow = overflow;
    document.removeEventListener("keydown", key);
    window.removeEventListener("riderspot:screen", cleanup);
    if (activeClose === cleanup) activeClose = null;
    if (previous?.isConnected) previous.focus();
    onDispose?.();
  };
  const key = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cleanup();
    }
    if (e.key === "Tab") {
      const items = [
        ...sheet.querySelectorAll(
          "button:not(:disabled),a[href],input,select,textarea",
        ),
      ].filter((x) => x.getClientRects().length);
      if (e.shiftKey && document.activeElement === items[0]) {
        e.preventDefault();
        items.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
        e.preventDefault();
        items[0]?.focus();
      }
    }
  };
  close.onclick = cleanup;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) cleanup();
  };
  document.addEventListener("keydown", key);
  window.addEventListener("riderspot:screen", cleanup);
  unregister = window.__rsNavigation?.registerLayer("map-sheet", cleanup);
  activeClose = cleanup;
  close.focus();
  return cleanup;
}
