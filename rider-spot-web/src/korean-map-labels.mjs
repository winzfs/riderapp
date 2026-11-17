// Nationwide Korean place names from the existing OpenMapTiles POI vector source.
// Text-only overlays: these must never restore facility markers or POI icons.
// OpenMapTiles does not encode most apartment/building names in its building layer;
// those require a separate licensed Korean public-data import.
export const KOREAN_POI_TIERS = Object.freeze([
  {
    id: "rs-korean-landmark-names",
    minzoom: 13.7,
    classes: ["hospital", "school", "college", "town_hall", "library",
      "railway", "stadium", "post", "attraction"],
    color: "#526c66",
    size: [13.7, 10, 15.5, 11.5, 18, 12.7],
    padding: 6,
  },
  {
    id: "rs-korean-nearby-names",
    minzoom: 15.2,
    classes: ["grocery", "lodging", "park", "bus", "car", "office"],
    color: "#63736f",
    size: [15.2, 9.7, 17, 11.2, 19, 12],
    padding: 5,
  },
  {
    id: "rs-korean-business-names",
    minzoom: 16.2,
    classes: ["shop", "cafe", "fast_food", "grocery", "laundry",
      "ice_cream", "clothing_store", "music", "bar", "office", "lodging"],
    color: "#737b77",
    size: [16.2, 9.5, 18, 11, 19, 11.8],
    padding: 3,
  },
]);

export const KOREAN_POI_NAME = [
  "coalesce",
  ["get", "name:ko"],
  ["get", "name:nonlatin"],
  ["get", "name"],
  ["get", "name:latin"],
];

const HAS_POI_NAME = [
  "any",
  ["has", "name:ko"],
  ["has", "name:nonlatin"],
  ["has", "name"],
  ["has", "name:latin"],
];

/**
 * Add Korean-first labels for existing nationwide vector POIs.
 * The underlying Positron style intentionally keeps all original POI icons
 * and labels hidden. Place-name labels here contain text only, appear at
 * street zoom, and rely on collision detection rather than allowing overlap.
 */
export function addKoreanPoiNameLayers(gl) {
  const style = gl.getStyle?.();
  if (!style?.sources?.openmaptiles) return 0;
  let added = 0;
  for (const tier of KOREAN_POI_TIERS) {
    if (gl.getLayer(tier.id)) continue;
    try {
      gl.addLayer({
        id: tier.id,
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "poi",
        minzoom: tier.minzoom,
        filter: [
          "all",
          HAS_POI_NAME,
          ["match", ["get", "class"], tier.classes, true, false],
        ],
        layout: {
          "text-field": KOREAN_POI_NAME,
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], ...tier.size],
          "text-max-width": 8,
          "text-padding": tier.padding,
          "text-optional": true,
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "text-variable-anchor": ["top", "bottom", "left", "right"],
          "text-radial-offset": 0.3,
          "symbol-sort-key": ["coalesce", ["get", "rank"], 100],
        },
        paint: {
          "text-color": tier.color,
          "text-halo-color": "#f8fbfa",
          "text-halo-width": 1.35,
        },
      });
      added++;
    } catch (error) {
      console.warn("RiderSpot Korean POI names:", tier.id, error?.message || error);
    }
  }
  return added;
}
