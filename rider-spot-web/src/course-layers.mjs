import { rs33Time } from "./timeline-dates.mjs";
import { ROUTE_GRADIENT_STEPS } from "./route-analysis.mjs";

const line = {
  interactive: false,
  lineCap: "round",
  lineJoin: "round",
  smoothFactor: 1,
};

// Shared by the completed route and GPS-time playback overlays.
// Deliberate color landmarks: orange departure -> sage middle -> forest finish.
// The original GPS samples, timing and route geometry are never modified.
export function rs33CourseToneColor(tone) {
  const value = Number(tone);
  const progress = Number.isFinite(value)
    ? Math.max(0, Math.min(ROUTE_GRADIENT_STEPS - 1, value)) / (ROUTE_GRADIENT_STEPS - 1) : 0;
  const stops = [
    [0, [246, 151, 69]],       // orange at departure
    [0.21, [238, 184, 108]],  // warm amber
    [0.45, [205, 200, 143]],  // yellow-sage
    [0.64, [159, 191, 143]],  // fresh sage
    [0.78, [117, 175, 133]],  // medium green
    [0.82, [92, 157, 123]],   // green dominates most of the route
    [1, [3, 66, 50]],         // darkest green only near arrival
  ];
  for (let i = 1; i < stops.length; i++) {
    const [end, to] = stops[i];
    if (progress > end) continue;
    const [begin, from] = stops[i - 1];
    // Linear interpolation avoids the small plateaus caused by
    // smoothstep easing at each color stop, especially on long GPS rides.
    const fraction = (progress - begin) / (end - begin);
    return "rgb(" + from.map((channel, j) =>
      Math.round(channel + (to[j] - channel) * fraction)).join(",") + ")";
  }
  return "rgb(3,66,50)";
}

export function rs33DrawCourse(L, map, geometry) {
  const group = L.layerGroup().addTo(map);
  for (let level = 3; level >= 1; level--) {
    const coordinates = geometry.railRuns.slice(level + 1).flat();
    if (!coordinates.length) continue;
    const weight = 7 + 4 * level;
    L.polyline(coordinates, {
      ...line,
      color: "#95a5a0",
      weight,
      opacity: 0.6,
    }).addTo(group);
    if (level > 1)
      L.polyline(coordinates, {
        ...line,
        color: "#f1f5f3",
        weight: Math.max(5, weight - 4),
        opacity: 0.74,
      }).addTo(group);
  }
  if (geometry.paths.length)
    L.polyline(geometry.paths, {
      ...line,
      color: "#fff",
      weight: 9,
      opacity: 0.92,
    }).addTo(group);
  // Single-point GPS fragments remain in route geometry for analysis, but
  // are deliberately not rendered as orange/green dots on the map.
  // Their visual markers made sparse and noisy GPS samples look like stops.
  geometry.gradient.forEach((coordinates, tone) => {
    if (!coordinates.length) return;
    // Smoothly transition from orange at departure to deep green at
    // arrival. Keep every segment derived from the existing route geometry;
    // recoloring must never mutate or interpolate the stored GPS samples.
    L.polyline(coordinates, {
      ...line, color: rs33CourseToneColor(tone), weight: 6,
    }).addTo(group);
  });
  return () => group.remove();
}

export function paintCourseLabels(L, map, geometry, stamps, onStamp) {
  if (!stamps?.length && !geometry?.paths?.length) return undefined;
  const overlays = L.layerGroup().addTo(map);
  const priority = [...(stamps || [])].sort(
    (a, b) => priorityFor(a.kind) - priorityFor(b.kind),
  );
  let frame = 0;
  function priorityFor(kind) {
    return kind === "start" ? 0 : kind === "stop" ? 1 : 2;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(paint);
  }
  function paint() {
    frame = 0;
    overlays.clearLayers();
    const size = map.getSize();
    const occupied = new Set();
    const zoom = map.getZoom();
    const cellWidth = zoom < 12 ? 124 : zoom < 14 ? 94 : zoom < 16 ? 72 : 60;
    const cellHeight = zoom < 13 ? 43 : 33;
    const maxLabels = Math.max(3, Math.min(24, Math.floor(size.x * size.y / 18000)));
    let rendered = 0;
    for (const stamp of priority) {
      if (rendered >= maxLabels) break;
      const point = map.latLngToContainerPoint([stamp.lat, stamp.lng]);
      if (
        point.x < -30 ||
        point.y < -25 ||
        point.x > size.x + 30 ||
        point.y > size.y + 25
      )
        continue;
      const cell = `${Math.floor(point.x / cellWidth)},${Math.floor(point.y / cellHeight)}`;
      if (occupied.has(cell)) continue;
      occupied.add(cell);
      rendered++;
      const badge = document.createElement("span");
      badge.textContent = rs33Time(stamp.time);
      badge.className = "rs33-stamp-label " + stamp.kind;
      const icon = L.divIcon({
        className: "rs33-stamp-pin",
        html: badge,
        iconSize: [54, 27],
        iconAnchor: [27, 34],
      });
      L.marker([stamp.lat, stamp.lng], {
        title: stamp.label + " " + badge.textContent,
        zIndexOffset: 3500,
        icon,
      })
        .on("click", () => onStamp(stamp))
        .addTo(overlays);
    }
    let count = 0;
    for (const path of geometry.paths) {
      let sinceArrow = 68;
      let a = map.latLngToContainerPoint(path[0]);
      for (let i = 1; i < path.length && count < 70; i++) {
        const b = map.latLngToContainerPoint(path[i]);
        if (
          Math.max(a.x, b.x) < -10 ||
          Math.max(a.y, b.y) < -10 ||
          Math.min(a.x, b.x) > size.x + 10 ||
          Math.min(a.y, b.y) > size.y + 10
        ) {
          a = b;
          sinceArrow = 68;
          continue;
        }
        const dx = b.x - a.x,
          dy = b.y - a.y,
          length = Math.hypot(dx, dy);
        sinceArrow += length;
        const x = (a.x + b.x) / 2,
          y = (a.y + b.y) / 2;
        a = b;
        if (
          length < 1 ||
          sinceArrow < 110 ||
          x < -10 ||
          y < -10 ||
          x > size.x + 10 ||
          y > size.y + 10
        )
          continue;
        sinceArrow = 0;
        const chevron = document.createElement("span");
        chevron.className = "rs33-route-arrow";
        chevron.style.transform = `rotate(${Math.round((Math.atan2(dy, dx) * 180) / Math.PI)}deg)`;
        const icon = L.divIcon({
          className: "rs33-arrow-pin",
          html: chevron,
          iconSize: [13, 13],
          iconAnchor: [7, 7],
        });
        L.marker(map.containerPointToLatLng([x, y]), {
          interactive: false,
          keyboard: false,
          zIndexOffset: 3000,
          icon,
        }).addTo(overlays);
        count++;
      }
      if (count === 70) break;
    }
  }
  schedule();
  map.on("moveend resize", schedule);
  return () => {
    cancelAnimationFrame(frame);
    map.off("moveend resize", schedule);
    overlays.remove();
  };
}
