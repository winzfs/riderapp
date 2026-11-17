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

// Do not cull or merge hourly clock markers at any zoom. Show each
// city-scale stop event; merge nearby stop events only below zoom 10.5.
export function layoutCourseStamps(stamps, zoom, width, height, project) {
  const labels=[], clusters=new Map();
  for (const stamp of stamps || []) {
    if (!stamp || !Number.isFinite(Number(stamp.lat)) || !Number.isFinite(Number(stamp.lng))) continue;
    const pixel=project(stamp);
    if (!pixel || !Number.isFinite(pixel.x) || !Number.isFinite(pixel.y) ||
      pixel.x < -30 || pixel.y < -25 || pixel.x > width + 30 || pixel.y > height + 25) continue;
    if (stamp.kind !== "stop" || zoom >= 10.5) {
      labels.push({stamp,kind:stamp.kind,count:1,pixel});
      continue;
    }
    const key=Math.floor(pixel.x/68)+":"+Math.floor(pixel.y/42);
    const found=clusters.get(key);
    if (found) found.count++;
    else clusters.set(key,{stamp,kind:"stop",count:1,pixel});
  }
  return [...labels,...clusters.values()];
}

export function paintCourseLabels(L, map, geometry, stamps, onStamp) {
  if (!stamps?.length && !geometry?.paths?.length) return undefined;
  const overlays=L.layerGroup().addTo(map);
  let frame=0;
  function schedule() { if (!frame) frame=requestAnimationFrame(paint); }
  function paint() {
    frame=0;
    overlays.clearLayers();
    const size=map.getSize(),zoom=map.getZoom();
    const selected=layoutCourseStamps(stamps,zoom,size.x,size.y,
      stamp=>map.latLngToContainerPoint([stamp.lat,stamp.lng]));
    const hourlyCells=new Map();
    for (const item of selected) {
      const stamp=item.stamp;
      const clustered=item.kind==="stop" && item.count>1;
      const width=clustered?70:54;
      const badge=document.createElement("span");
      badge.textContent=clustered?"정차 "+item.count:rs33Time(stamp.time);
      badge.className="rs33-stamp-label "+item.kind+(clustered?" rs33-stamp-cluster":"");
      let dx=0,dy=0;
      if(item.kind==="hour" || item.kind==="stamp"){
        const cell=Math.floor(item.pixel.x/56)+":"+Math.floor(item.pixel.y/31);
        const i=hourlyCells.get(cell)||0;
        hourlyCells.set(cell,i+1);
        // Stagger each clock label without moving its actual GPS anchor.
        dx=((i%3)-1)*56;
        dy=(Math.floor(i/3)%2?34:-34)-Math.floor(i/6)*58;
      }else if(item.kind==="stop")dy=15;
      const icon=L.divIcon({
        className:"rs33-stamp-pin",html:badge,iconSize:[width,27],
        iconAnchor:[width/2-dx,34-dy]
      });
      const choice=clustered?{...stamp,groupCount:item.count,label:item.count+"건 정차"}:stamp;
      L.marker([stamp.lat,stamp.lng],{
        title:choice.label+" "+rs33Time(stamp.time),
        zIndexOffset:item.kind==="hour"?3700:3500,icon
      }).on("click",()=>onStamp?.(choice)).addTo(overlays);
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
  map.on("moveend zoomend resize", schedule);
  return () => {
    cancelAnimationFrame(frame);
    map.off("moveend zoomend resize", schedule);
    overlays.remove();
  };
}
