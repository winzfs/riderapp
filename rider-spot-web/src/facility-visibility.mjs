// Which public facilities appear on the live map by default.
// Keep all imported/user-contributed records unchanged; display-only policy.
export const VISIBLE_FACILITY = "화장실";
export function isVisibleFacility(filter, category) {
  return (filter === "places" || filter === "shelters") &&
    category === VISIBLE_FACILITY;
}
