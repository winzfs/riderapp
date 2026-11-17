// Keep the official Korean place-name layer authoritative within Gwangju.
// All other places keep their OSM/OpenMapTiles names. Road names are untouched.
export const GWANGJU_PUBLIC_LABEL_AREA = {
  type: "Polygon",
  coordinates: [[
    [126.68, 34.98], [127.13, 34.98], [127.13, 35.36],
    [126.68, 35.36], [126.68, 34.98],
  ]],
};

const LOCAL_CLASSES = [
  "suburb", "borough", "town", "quarter", "neighbourhood", "village", "hamlet",
];
const OUTSIDE = ["!", ["within", GWANGJU_PUBLIC_LABEL_AREA]];
const KEEP_OTHER_PLACE_CLASSES = [
  "!", ["match", ["get", "class"], LOCAL_CLASSES, true, false],
];
const OFFICIAL_REGION_PRIORITY = ["any", KEEP_OTHER_PLACE_CLASSES, OUTSIDE];

/**
 * Hide legacy native and RiderSpot OSM dong labels only inside the extent
 * covered by imported public Korean region names. Preserve city/province
 * names, roads and the exact same vector map elsewhere.
 */
export function preferPublicKoreanPlaceLabels(gl) {
  const layers = gl?.getStyle?.()?.layers;
  if (!Array.isArray(layers) || typeof gl.setFilter !== "function") return 0;
  let changed = 0;
  for (const layer of layers) {
    const placeSymbol = layer.type === "symbol" && layer["source-layer"] === "place";
    const redundantBusiness = layer.id === "rs-korean-business-names" ||
      layer.id === "rs-korean-nearby-names";
    if (!placeSymbol && !redundantBusiness) continue;
    // A style reload creates new layers, but calling this twice must be safe.
    if (JSON.stringify(layer.filter ?? []).includes('"within"')) continue;
    const coverage = redundantBusiness ? OUTSIDE : OFFICIAL_REGION_PRIORITY;
    const next = layer.filter ? ["all", layer.filter, coverage] : coverage;
    try {
      gl.setFilter(layer.id, next);
      changed++;
    } catch (error) {
      console.warn("RiderSpot public name precedence:", layer.id, error?.message || error);
    }
  }
  return changed;
}
