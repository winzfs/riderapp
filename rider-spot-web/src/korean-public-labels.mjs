// Lightweight viewport loading for Gwangju public business/building and town labels.
// The nationwide OSM vector map stays the basemap. All these overlays are text
// symbols, never interactive facility markers. Missing data is non-fatal.
const EMPTY = { type: "FeatureCollection", features: [] };
const SOURCE = "rs-public-korean-names";
const DATA_ROOT = "/mapdata/";
const TILE_CAP = 30;
const FEATURE_CAP = 8500;
const tilePromises = new Map();
let manifestPromise = null;

function manifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(DATA_ROOT + "manifest.json")
      .then((r) => r.ok ? r.json() : null)
      .catch(() => { manifestPromise = null; return null; });
  }
  return manifestPromise;
}
function tile(name) {
  if (!/^(admin|government|t\d+-\d+)$/.test(name)) return Promise.resolve([]);
  if (!tilePromises.has(name)) {
    const task = fetch(DATA_ROOT + name + ".json")
      .then((r) => { if (!r.ok) throw Error("Unavailable map tile"); return r.json(); })
      .then((rows) => Array.isArray(rows) ? rows : [])
      .catch(() => { tilePromises.delete(name); return []; });
    tilePromises.set(name, task);
  }
  return tilePromises.get(name);
}
function intersect(a, b) {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}
function toFeature(row) {
  if (!Array.isArray(row) || row.length !== 4) return null;
  const [lon, lat, name, kind] = row;
  if (!Number.isFinite(lon) || !Number.isFinite(lat) ||
      typeof name !== "string" || name.length > 64 ||
      !["region", "apartment", "building", "shop", "government"].includes(kind)) return null;
  return {
    type: "Feature",
    properties: { name, kind },
    geometry: { type: "Point", coordinates: [lon, lat] },
  };
}
export function visibleTileKeys(info, bounds) {
  if (!info || !Array.isArray(info.tiles) || !intersect(info.bbox, bounds)) return [];
  const size = info.size || 0.04;
  const west = Math.max(info.bbox[0], bounds[0]);
  const south = Math.max(info.bbox[1], bounds[1]);
  const east = Math.min(info.bbox[2], bounds[2]);
  const north = Math.min(info.bbox[3], bounds[3]);
  const selected = new Set(info.tiles);
  const keys = [];
  for (let x = Math.floor(west / size); x <= Math.floor(east / size); x++) {
    for (let y = Math.floor(south / size); y <= Math.floor(north / size); y++) {
      const key = "t" + x + "-" + y;
      if (selected.has(key)) keys.push(key);
      if (keys.length >= TILE_CAP) return keys;
    }
  }
  return keys;
}
function addLayer(gl, id, filter, minzoom, color, sizes, padding) {
  if (gl.getLayer(id)) return;
  gl.addLayer({
    id,
    type: "symbol",
    source: SOURCE,
    minzoom,
    filter: ["==", ["get", "kind"], filter],
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], ...sizes],
      "text-padding": padding,
      "text-max-width": 9,
      "text-allow-overlap": false,
      "text-ignore-placement": false,
      "text-variable-anchor": ["top", "bottom", "left", "right"],
      "text-radial-offset": 0.2,
    },
    paint: {
      "text-color": color,
      "text-halo-color": "#fbfffc",
      "text-halo-width": 1.5,
    },
  });
}
export function ensurePublicKoreanLayers(gl) {
  if (!gl?.getStyle?.()) return false;
  if (!gl.getSource(SOURCE)) gl.addSource(SOURCE, { type: "geojson", data: EMPTY });
  addLayer(gl, "rs-public-region-label", "region", 10, "#456c5f",
    [10, 10.6, 12.7, 12, 15, 13], 4);
  addLayer(gl, "rs-public-government-label", "government", 12.2, "#3b665c",
    [12.2, 11.3, 14.5, 12.6, 18, 13.8], 2);
  addLayer(gl, "rs-public-apartment-label", "apartment", 14, "#526b64",
    [14, 10, 16, 12, 18, 13], 5);
  addLayer(gl, "rs-public-building-label", "building", 15.5, "#737b76",
    [15.5, 9.3, 17.5, 11, 19, 12], 4);
  addLayer(gl, "rs-public-shop-label", "shop", 16.1, "#66736f",
    [16.1, 9.3, 18, 10.8, 19, 11.7], 3);
  return true;
}

/** Called only on a MapLibre map created by basemap.mjs. */
export function mountPublicKoreanLabels(gl) {
  let alive = true;
  let revision = 0;
  let lastKey = null;
  async function refresh() {
    const my = ++revision;
    try {
      const info = await manifest();
      if (!alive || my !== revision || !info || !gl.getSource(SOURCE)) return;
      const bounds = gl.getBounds();
      const b = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
      const zoom = gl.getZoom();
      if (!intersect(info.bbox, b)) {
        if (lastKey !== "outside") {
          gl.getSource(SOURCE)?.setData(EMPTY);
          lastKey = "outside";
        }
        return;
      }
      const keys = zoom >= 14.5 ? visibleTileKeys(info, b) : [];
      const cacheKey = keys.join(",") + ":admin:" + (zoom >= 9.5) + ":gov:" + (zoom >= 12.2);
      if (cacheKey === lastKey) return;
      const data = await Promise.all([
        zoom >= 9.5 ? tile("admin") : Promise.resolve([]),
        zoom >= 12.2 ? tile("government") : Promise.resolve([]),
        ...keys.map(tile),
      ]);
      if (!alive || my !== revision || !gl.getSource(SOURCE)) return;
      // Recheck viewport after slow downloads to avoid displaying another region.
      const rows = data.flat().slice(0, FEATURE_CAP);
      const features = rows.map(toFeature).filter(Boolean);
      gl.getSource(SOURCE).setData({ type: "FeatureCollection", features });
      lastKey = cacheKey;
    } catch (error) {
      console.warn("RiderSpot public map names:", error?.message || error);
    }
  }
  const onStyle = () => {
    if (!alive) return;
    lastKey = null;
    try {
      if (ensurePublicKoreanLayers(gl)) void refresh();
    } catch (error) {
      console.warn("RiderSpot public map style:", error?.message || error);
    }
  };
  gl.on("style.load", onStyle);
  gl.on("moveend", refresh);
  if (gl.isStyleLoaded?.()) onStyle();
  return () => {
    alive = false;
    revision++;
    gl.off?.("style.load", onStyle);
    gl.off?.("moveend", refresh);
  };
}
