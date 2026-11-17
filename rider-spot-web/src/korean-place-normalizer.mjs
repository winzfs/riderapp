// Pure normalization of authorized Korean public map records.
// Never include provider credentials in browser bundles.
const tidy = value => String(value ?? "").trim().replace(/\s+/g, " ");
const coordinate = (row, keys) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== "") {
      const number = Number(row[key]);
      if (Number.isFinite(number)) return number;
    }
  }
  return NaN;
};
export function normalizeKoreanPlace(row, kind = "shop") {
  const name = tidy(row.bizesNm ?? row.bldNm ?? row.bdNm ?? row.name ?? row.title);
  const lng = coordinate(row, ["lon", "lng", "longitude", "경도", "x"]);
  const lat = coordinate(row, ["lat", "latitude", "위도", "y"]);
  if (!name || !Number.isFinite(lng) || !Number.isFinite(lat) ||
      lat < 33 || lat > 39.5 || lng < 124 || lng > 132) return null;
  const category = ["region", "apartment", "building", "shop", "facility"].includes(kind)
    ? kind : "shop";
  const sourceId = tidy(row.bizesId ?? row.bdMgtSn ?? row.id);
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: {
      name, category, source_id: sourceId,
      subcategory: tidy(row.indsSclsNm ?? row.category),
    },
  };
}
export function normalizeKoreanPlaces(rows, kind = "shop") {
  const seen = new Set();
  const features = [];
  for (const row of rows) {
    const feature = normalizeKoreanPlace(row, kind);
    if (!feature) continue;
    const { name, source_id } = feature.properties;
    const [lng, lat] = feature.geometry.coordinates;
    const key = source_id ? kind + ":" + source_id :
      [kind, name, lng.toFixed(5), lat.toFixed(5)].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    features.push(feature);
  }
  return { type: "FeatureCollection", features };
}
