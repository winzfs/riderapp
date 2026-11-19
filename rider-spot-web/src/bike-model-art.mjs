// Rider Spot: five model-family illustrations, all facing right.
// Keep the catalog key as the source of truth; unsupported models use the generic scooter.
import atlas from "./assets/bikes/bike-models-atlas.webp";

export const BIKE_ART_FAMILIES = Object.freeze(["pcx", "nmax", "forza", "xmax", "supercub"]);
export function bikeArtFamily(model) {
  const key = String(model?.key || "").toLowerCase();
  if (/^honda-pcx/.test(key)) return "pcx";
  if (/^yamaha-nmax/.test(key)) return "nmax";
  if (/^honda-forza/.test(key)) return "forza";
  if (/^yamaha-xmax/.test(key)) return "xmax";
  if (/^honda-supercub/.test(key)) return "supercub";
  return null;
}
export function bikeArtStyle(model) {
  const family = bikeArtFamily(model);
  if (!family) return null;
  const row = BIKE_ART_FAMILIES.indexOf(family);
  return Object.freeze({
    backgroundImage: 'url("' + atlas + '")',
    backgroundSize: "100% 500%",
    backgroundPosition: "center " + (row * 25) + "%",
    backgroundRepeat: "no-repeat",
  });
}
