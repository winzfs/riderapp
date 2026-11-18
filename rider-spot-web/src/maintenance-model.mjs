// Shared, read-only maintenance presentation helpers. No user data is mutated here.
export const standardParts = ["엔진오일", "앞 타이어", "뒤 타이어", "브레이크 패드", "구동벨트", "에어필터"];
export const normalizePart = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
export function itemsOf(row) {
  const fromArray = Array.isArray(row?.service_items) ? row.service_items.map(normalizePart).filter(Boolean) : [];
  const legacy = normalizePart(row?.item);
  return [...new Set(fromArray.length ? fromArray : legacy ? legacy.split(/\s+·\s+/).map(normalizePart).filter(Boolean) : [])];
}
export function composeServiceItems(selected = [], custom = "") {
  const extra = normalizePart(custom);
  if (extra && (extra.length < 2 || extra.length > 40))
    throw Error("직접 입력한 부품명은 2~40자로 입력해 주세요.");
  const seen = new Set(), items = [];
  for (const part of [...selected, ...(extra ? [extra] : [])]) {
    const name = normalizePart(part), key = name.toLocaleLowerCase("ko-KR");
    if (!name || seen.has(key)) continue;
    if (name.length > 40) throw Error("부품명은 40자 이내로 입력해 주세요.");
    seen.add(key); items.push(name);
  }
  if (!items.length) throw Error("정비 항목을 선택해 주세요.");
  if (items.join(" · ").length > 80) throw Error("정비 항목의 전체 길이는 80자 이하여야 해요.");
  return items;
}
export function serviceRows(rows, item) {
  return (rows || []).filter(row => !item || itemsOf(row).includes(item)).slice().sort((a,b) =>
    String(b.serviced_on || "").localeCompare(String(a.serviced_on || "")) ||
    String(b.created_at || "").localeCompare(String(a.created_at || "")) ||
    String(b.id || "").localeCompare(String(a.id || "")));
}
// A newer service entry with an empty odometer must not hide the last
// known replacement distance (common when multiple parts were logged together).
// Keep the date-ordered history unchanged; choose the latest usable baseline
// only for distance-based due calculations.
export function serviceBaseline(rows, item) {
  return serviceRows(rows, item).find(row =>
    (row.odometer_km != null && Number.isFinite(Number(row.odometer_km)) && Number(row.odometer_km) >= 0) ||
    (row.next_due_km != null && Number.isFinite(Number(row.next_due_km)) && Number(row.next_due_km) >= 0)
  ) || null;
}
export function serviceDue(row, cycle, currentKm) {
  const interval = Number(cycle?.interval_km);
  const explicit = row?.next_due_km == null ? null : Number(row.next_due_km);
  const last = row?.odometer_km == null ? null : Number(row.odometer_km);
  const next = Number.isFinite(explicit) && explicit >= 0 ? explicit :
    Number.isSafeInteger(interval) && interval > 0 && Number.isFinite(last) && last >= 0 ? last + interval : null;
  const distance = currentKm == null ? null : Number(currentKm);
  const remaining = next == null || !Number.isFinite(distance) ? null : next - distance;
  const threshold = Number.isSafeInteger(interval) && interval > 0 ? Math.min(500, Math.max(100, Math.round(interval * 0.1))) : 500;
  const state = remaining == null ? "unknown" : remaining < 0 ? "overdue" : remaining <= threshold ? "soon" : "ok";
  return {next, remaining, state, threshold};
}
export function totalMaintenanceCost(rows) {
  const visited = new Set();
  return (rows || []).reduce((sum,row) => {
    const key = row.id || row;
    if (visited.has(key)) return sum;
    visited.add(key);
    return sum + (row.cost_won == null ? 0 : Number(row.cost_won) || 0);
  }, 0);
}
