// Model-family artwork is stored as real-alpha, high-resolution individual files.
// Keep the bike model catalog as the only selection source of truth.
import pcx from "./assets/bikes/pcx-profile-hd.webp";
import nmax from "./assets/bikes/nmax-profile-hd.webp";
import forza from "./assets/bikes/forza-profile-hd.webp";
import xmax from "./assets/bikes/xmax-profile-hd.webp";
import supercub from "./assets/bikes/supercub-profile-hd.webp";

const sources=Object.freeze({pcx,nmax,forza,xmax,supercub});
export const BIKE_ART_FAMILIES=Object.freeze(Object.keys(sources));
export function bikeArtFamily(model){
  const key=String(model?.key||"").toLowerCase();
  if(/^honda-pcx/.test(key))return "pcx";
  if(/^yamaha-nmax/.test(key))return "nmax";
  if(/^honda-forza/.test(key))return "forza";
  if(/^yamaha-xmax/.test(key))return "xmax";
  if(/^honda-supercub/.test(key))return "supercub";
  return null;
}
export function bikeArtSource(model){
  const family=bikeArtFamily(model);
  return family?sources[family]:null;
}
