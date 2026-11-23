const MIN_ZOOM = 7.5;
const MAX_ZOOM = 19;

function readCamera(key) {
  // A denied or corrupted sessionStorage value must not mask a valid
  // persistent camera after a WebView renderer restart.
  for (const storage of [
    typeof sessionStorage === "undefined" ? null : sessionStorage,
    typeof localStorage === "undefined" ? null : localStorage,
  ]) {
    if (!storage) continue;
    try {
      const saved = JSON.parse(storage.getItem(key) || "null");
      if (
        saved &&
        Number.isFinite(saved.lat) && Math.abs(saved.lat) <= 90 &&
        Number.isFinite(saved.lng) && Math.abs(saved.lng) <= 180 &&
        Number.isFinite(saved.zoom) &&
        saved.zoom >= MIN_ZOOM && saved.zoom <= MAX_ZOOM
      ) return saved;
    } catch {
      /* Keep trying the next independent storage location. */
    }
  }
  return null;
}

export function createMapController(L, node, cameraId, fallback) {
  const isCourse = cameraId !== "main";
  const key = isCourse ? `rs:map-camera:${cameraId}` : "rs:map-main-camera-v52";
  const saved =
    readCamera(key) ||
    (isCourse && readCamera(`rs:map-camera-v48:${cameraId}:1`));
  const map = L.map(node, {
    zoomControl: false,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    // Pinch still updates continuously via Leaflet touchZoom. A CSS zoom
    // transition can outlive the map pane when React switches tabs.
    zoomAnimation: false,
    zoomSnap: 0,
    zoomDelta: 0.25,
    touchZoom: true,
    bounceAtZoomLimits: false,
    trackResize: false,
    preferCanvas: isCourse,
  }).setView(saved ? [saved.lat, saved.lng] : fallback, saved?.zoom ?? 13);
  let center = map.getCenter();
  let zoom = map.getZoom();
  let cameraChosen = Boolean(saved);
  let readyToSave = cameraChosen;
  // Only the first GPS fix of a new app page recenters the main map.
  // The first route bounds of each Timeline map override an old saved view.
  let firstCourseFit = isCourse;
  let userInteracted = false;
  let resizing = false;
  let touch = false;
  let moving = false;
  let frame = 0;
  let width = node.clientWidth;
  let height = node.clientHeight;

  function save() {
    if (!readyToSave) return;
    const value = JSON.stringify({ lat: center.lat, lng: center.lng, zoom });
    // One unavailable storage backend must never disable the other.
    for (const storage of [
    typeof sessionStorage === "undefined" ? null : sessionStorage,
    typeof localStorage === "undefined" ? null : localStorage,
  ]) {
    if (!storage) continue;
      try { storage.setItem(key, value); }
      catch { /* Camera persistence is optional. */ }
    }
  }
  function begin() {
    if (resizing) return;
    moving = true;
    cameraChosen = readyToSave = true;
  }
  function finish() {
    moving = false;
    if (resizing) return;
    center = map.getCenter();
    zoom = map.getZoom();
    save();
    scheduleResize();
  }
  function resize() {
    frame = 0;
    if (
      touch ||
      moving ||
      !node.clientWidth ||
      !node.clientHeight ||
      (width === node.clientWidth && height === node.clientHeight)
    )
      return;
    width = node.clientWidth;
    height = node.clientHeight;
    resizing = true;
    try {
      // A resize must preserve the user's geographical center, not the
      // old pixel origin. Leaflet's pan:true compensates for the dimension
      // delta without resetting GPS or calling setView during resize.
      map.invalidateSize({ pan: true, animate: false });
    } finally {
      resizing = false;
    }
  }
  function scheduleResize() {
    if (!frame) frame = requestAnimationFrame(resize);
  }
  function onUserInput() {
    userInteracted = true;
    if (!isCourse) window.__rsStartupMainCameraSet = true;
  }
  function onTouchStart() {
    onUserInput();
    touch = true;
  }
  function onTouchEnd(event) {
    touch = event.touches.length > 0;
    if (!touch) scheduleResize();
  }
  map.on("movestart zoomstart", begin);
  map.on("moveend", finish);
  node.addEventListener("touchstart", onTouchStart, { passive: true });
  node.addEventListener("pointerdown", onUserInput, { passive: true });
  node.addEventListener("wheel", onUserInput, { passive: true });
  document.addEventListener("touchend", onTouchEnd, { passive: true });
  document.addEventListener("touchcancel", onTouchEnd, { passive: true });
  const observer = new ResizeObserver(scheduleResize);
  observer.observe(node);
  window.addEventListener("pageshow", scheduleResize);

  function moveTo(position, level) {
    if (!isCourse) window.__rsStartupMainCameraSet = true;
    cameraChosen = readyToSave = true;
    map.setView([Number(position.lat), Number(position.lng)], level, {
      animate: false,
    });
    finish();
  }
  function showBounds(bounds, explicit = false) {
    if (!bounds) return;
    const firstFit = firstCourseFit;
    firstCourseFit = false;
    if (!explicit && (userInteracted || (!firstFit && (cameraChosen || touch)))) return;
    cameraChosen = readyToSave = true;
    map.fitBounds(bounds, { padding: [45, 66], maxZoom: 16, animate: false });
    finish();
  }
  return {
    map,
    moveTo,
    showBounds,
    initialLocation(position) {
      // A saved camera is an intentional view: GPS updates must never override it.
      // Only the initial unsaved map may center on the first valid GPS fix.
      if (!isCourse && !window.__rsStartupMainCameraSet && !userInteracted && !touch) {
        moveTo(position, 16);
      }
    },
    destroy() {
      save();
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pageshow", scheduleResize);
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("pointerdown", onUserInput);
      node.removeEventListener("wheel", onUserInput);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
      map.off("movestart zoomstart", begin);
      map.off("moveend", finish);
      map.remove();
    },
  };
}
