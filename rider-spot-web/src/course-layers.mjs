import { rs33Time } from "./timeline-dates.mjs";

const line = {
  interactive: false,
  lineCap: "round",
  lineJoin: "round",
  smoothFactor: 1,
};

export function rs33DrawCourse(L, map, geometry) {
  const group = L.layerGroup().addTo(map);
  for (let level = 3; level >= 1; level--) {
    const coordinates = geometry.railRuns.slice(level + 1).flat();
    if (!coordinates.length) continue;
    const weight = 9 + 6 * level;
    L.polyline(coordinates, {
      ...line,
      color: "#ff9a50",
      weight,
      opacity: 0.92,
    }).addTo(group);
    if (level > 1)
      L.polyline(coordinates, {
        ...line,
        color: "#fff7f0",
        weight: weight - 3,
        opacity: 0.98,
      }).addTo(group);
  }
  if (geometry.paths.length)
    L.polyline(geometry.paths, {
      ...line,
      color: "#fff",
      weight: 9,
      opacity: 0.92,
    }).addTo(group);
  if (geometry.dots.length) {
    const dotLines = geometry.dots.map((point) => [point, point]);
    L.polyline(dotLines, { ...line, color: "#178f78", weight: 9 }).addTo(group);
    L.polyline(dotLines, { ...line, color: "#ff9a50", weight: 6 }).addTo(group);
  }
  geometry.gradient.forEach((coordinates, tone) => {
    if (!coordinates.length) return;
    const p = tone / 23;
    const color =
      "rgb(" +
      [106 - 91 * p, 206 - 115 * p, 172 - 104 * p].map(Math.round).join(",") +
      ")";
    L.polyline(coordinates, { ...line, color, weight: 6 }).addTo(group);
  });
  return () => group.remove();
}

export function paintCourseLabels(L, map, geometry, stamps, onStamp) {
  if (!stamps?.length) return undefined;
  const overlays = L.layerGroup().addTo(map);
  const priority = [...stamps].sort(
    (a, b) => priorityFor(a.kind) - priorityFor(b.kind),
  );
  let frame = 0;
  function priorityFor(kind) {
    return kind === "stop" ? 0 : kind === "stamp" ? 2 : 1;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(paint);
  }
  function paint() {
    frame = 0;
    overlays.clearLayers();
    const size = map.getSize();
    const occupied = new Set();
    for (const stamp of priority) {
      const point = map.latLngToContainerPoint([stamp.lat, stamp.lng]);
      if (
        point.x < -30 ||
        point.y < -25 ||
        point.x > size.x + 30 ||
        point.y > size.y + 25
      )
        continue;
      const cell = `${Math.floor(point.x / 57)},${Math.floor(point.y / 28)}`;
      if (occupied.has(cell)) continue;
      occupied.add(cell);
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
