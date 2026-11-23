/* RiderSpot unified map credits v2 — main map + daily/individual timeline.
 * Preserves all original provider attribution URLs, React-owned map structure,
 * Leaflet events, GPS camera, replay data and export behavior.
 */
(function installUnifiedMapCredits(win) {
  "use strict";
  if (!win || win.__rsUnifiedMapCreditsV2) return;
  win.__rsUnifiedMapCreditsV2 = "2.0";
  const doc = win.document;
  const MAPS = [
    ".nearby.nearby-full .rs-map-v2 .map.leaflet-container",
    ".rs33-timeline .rs33-course-map .map.leaflet-container",
    ".rs33-trip-detail .rs33-course-map .map.leaflet-container",
  ].join(", ");
  let idCounter = 0, scheduled = false, pending = null, lastScan = 0;

  function hideCredits(map) {
    map.querySelector(".rs-tl-source-popover")?.setAttribute("hidden", "");
    map.querySelector(".rs-tl-source-trigger")?.setAttribute("aria-expanded", "false");
  }
  function creditsMarkup(map, target) {
    target.replaceChildren();
    const original = map.querySelector(".leaflet-control-attribution");
    if (!original) return;
    const copy = original.cloneNode(true);
    copy.removeAttribute("style");
    copy.className = "rs-tl-source-full";
    // Keep map provider's text and actual attribution links unchanged.
    target.append(copy);
  }
  function add(map) {
    if (!map?.isConnected || map.querySelector(".rs-tl-source-trigger")) return;
    const original = map.querySelector(".leaflet-control-attribution");
    if (!original) return; // attribution must remain visible without a control

    const id = "rs-unified-map-source-" + (++idCounter);
    const trigger = doc.createElement("button");
    trigger.type = "button";
    trigger.className = "rs-tl-source-trigger";
    trigger.hidden = true;
    trigger.textContent = "!";
    trigger.title = "지도 출처";
    trigger.setAttribute("aria-label", "지도 출처 및 라이선스 정보 보기");
    trigger.setAttribute("aria-controls", id);
    trigger.setAttribute("aria-expanded", "false");

    const panel = doc.createElement("section");
    panel.className = "rs-tl-source-popover";
    panel.id = id;
    panel.hidden = true;
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "지도 데이터 출처");
    const heading = doc.createElement("strong");
    heading.textContent = "지도 데이터 출처";
    const content = doc.createElement("div");
    content.className = "rs-tl-source-body";
    panel.append(heading, content);

    const suppress = ev => ev.stopPropagation();
    for (const event of ["pointerdown", "touchstart", "mousedown", "dblclick", "wheel"]) {
      trigger.addEventListener(event, suppress);
      panel.addEventListener(event, suppress);
    }
    trigger.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const expand = panel.hidden;
      doc.querySelectorAll(".rs-tl-source-popover:not([hidden])").forEach(open => {
        open.hidden = true;
        open.parentElement?.querySelector(".rs-tl-source-trigger")?.setAttribute("aria-expanded", "false");
      });
      if (expand) creditsMarkup(map, content);
      panel.hidden = !expand;
      trigger.setAttribute("aria-expanded", String(expand));
    });
    // Leaflet owns this container; no React-owned siblings are moved.
    map.append(trigger, panel);

    // First show original full provider credits before switching to a compact
    // access button. Do not collapse if the original credit control disappears.
    win.setTimeout(() => {
      if (!map.isConnected || !trigger.isConnected || !map.querySelector(".leaflet-control-attribution")) return;
      map.classList.add("rs-tl-credits-collapsed");
      trigger.hidden = false;
    }, 5000);
  }
  function scan() {
    scheduled = false;
    pending = null;
    lastScan = Date.now();
    doc.querySelectorAll(MAPS).forEach(add);
  }
  function schedule() {
    if (scheduled || pending != null) return;
    const dt = Date.now() - lastScan;
    if (dt < 700) {
      pending = win.setTimeout(() => {
        pending = null;
        scheduled = true;
        win.requestAnimationFrame(scan);
      }, 700 - dt);
      return;
    }
    scheduled = true;
    win.requestAnimationFrame(scan);
  }
  function init() {
    scan();
    const observer = new MutationObserver(schedule);
    observer.observe(doc.body, {childList:true, subtree:true});
    win.addEventListener("riderspot:screen", schedule);
    win.addEventListener("riderspot:tab-restored", schedule);
    doc.addEventListener("keydown", ev => {
      if (ev.key === "Escape") doc.querySelectorAll(MAPS).forEach(hideCredits);
    });
    doc.addEventListener("click", ev => {
      if (ev.target.closest(".rs-tl-source-popover, .rs-tl-source-trigger")) return;
      doc.querySelectorAll(MAPS).forEach(hideCredits);
    });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init,{once:true});
  else init();
})(typeof window === "undefined" ? null : window);
