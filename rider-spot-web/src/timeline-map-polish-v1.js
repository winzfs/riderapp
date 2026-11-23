/* RiderSpot timeline map UI polish v1.
   This addon only mounts accessible attribution disclosure controls.
   Never changes Leaflet, route playback, income, GPS or React DOM hierarchy.
   Full legal source credits are shown for five seconds before collapse. */
(function riderSpotTimelineSourceDisclosure(win) {
  "use strict";
  if (!win || win.__rsTimelineMapPolishV1) return;
  win.__rsTimelineMapPolishV1 = "1.0";
  const doc = win.document;
  const MAPS = ".rs33-timeline .rs33-course-map, .rs33-trip-detail .rs33-course-map";
  let nextId = 0;
  let scheduled = false;
  let lastScan = 0;
  let pendingTimer = null;

  function close(map) {
    if (!map) return;
    const button = map.querySelector(".rs-tl-source-trigger");
    const panel = map.querySelector(".rs-tl-source-popover");
    if (panel) panel.hidden = true;
    if (button) button.setAttribute("aria-expanded", "false");
  }
  function build(map) {
    if (!map || map.querySelector(".rs-tl-source-trigger")) return;
    const attribution = map.querySelector(".leaflet-control-attribution");
    if (!attribution) return; // no legal provider data to move into a disclosure

    const id = "rs-tl-source-popover-" + (++nextId);
    const trigger = doc.createElement("button");
    trigger.type = "button";
    trigger.className = "rs-tl-source-trigger";
    trigger.hidden = true;
    trigger.textContent = "ⓘ 출처";
    trigger.title = "지도 데이터 및 라이선스 출처";
    trigger.setAttribute("aria-label", "지도 데이터 출처와 라이선스 정보 열기");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", id);

    const panel = doc.createElement("section");
    panel.id = id;
    panel.className = "rs-tl-source-popover";
    panel.hidden = true;
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "지도 데이터 출처");
    const heading = doc.createElement("strong");
    heading.textContent = "지도 데이터 출처";
    const sourceHolder = doc.createElement("div");
    sourceHolder.className = "rs-tl-source-body";
    panel.append(heading, sourceHolder);

    const refreshLinks = () => {
      const current = map.querySelector(".leaflet-control-attribution");
      sourceHolder.replaceChildren();
      if (!current) {
        const warning = doc.createElement("span");
        warning.textContent = "지도 데이터를 확인하고 있어요.";
        sourceHolder.append(warning);
        return;
      }
      const copy = current.cloneNode(true);
      copy.className = "rs-tl-source-full";
      copy.removeAttribute("style");
      copy.removeAttribute("role");
      sourceHolder.append(copy);
    };
    const stop = event => event.stopPropagation();
    for (const type of ["click", "dblclick", "mousedown", "pointerdown", "touchstart", "wheel"]) {
      panel.addEventListener(type, stop);
    }
    trigger.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const opening = panel.hidden;
      doc.querySelectorAll(".rs-tl-source-popover:not([hidden])").forEach(other => {
        other.hidden = true;
        other.parentElement?.querySelector(".rs-tl-source-trigger")?.setAttribute("aria-expanded", "false");
      });
      if (opening) refreshLinks();
      panel.hidden = !opening;
      trigger.setAttribute("aria-expanded", String(opening));
    });
    trigger.addEventListener("pointerdown", stop);
    trigger.addEventListener("touchstart", stop);

    map.append(trigger, panel);
    // OSMF permits collapse after the attribution has been visible for 5s.
    // Leave it visible if the button or original provider credit disappeared.
    win.setTimeout(() => {
      if (!map.isConnected || !trigger.isConnected ||
          !map.querySelector(".leaflet-control-attribution")) return;
      map.classList.add("rs-tl-credits-collapsed");
      trigger.hidden = false;
    }, 5000);
  }

  function scan() {
    scheduled = false;
    pendingTimer = null;
    lastScan = Date.now();
    if (!doc.querySelector(".rs33-timeline, .rs33-trip-detail")) return;
    doc.querySelectorAll(MAPS).forEach(build);
  }
  function schedule() {
    if (scheduled || pendingTimer != null) return;
    const elapsed = Date.now() - lastScan;
    if (elapsed < 850) {
      pendingTimer = win.setTimeout(() => {
        pendingTimer = null;
        if (!scheduled) {
          scheduled = true;
          win.requestAnimationFrame(scan);
        }
      }, 850 - elapsed);
      return;
    }
    scheduled = true;
    win.requestAnimationFrame(scan);
  }
  function init() {
    scan();
    const observer = new MutationObserver(schedule);
    observer.observe(doc.body, {childList:true, subtree:true});
    win.addEventListener("riderspot:screen",schedule);
    win.addEventListener("riderspot:tab-restored",schedule);
    doc.addEventListener("keydown",event => {
      if (event.key !== "Escape") return;
      doc.querySelectorAll(MAPS).forEach(close);
    });
    doc.addEventListener("click",event => {
      if (event.target.closest(".rs-tl-source-popover, .rs-tl-source-trigger")) return;
      doc.querySelectorAll(MAPS).forEach(close);
    });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})(typeof window === "undefined" ? null : window);
