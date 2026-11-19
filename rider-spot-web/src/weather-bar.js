// Rider Spot map weather HUD. A supplementary UI: no React root, GPS tracker or map camera changes.
import { openMapSheet } from "./ui-overlays.mjs";

const ID = "rs-weather-hud";
const CACHE = "riderspot:weather:last:v1";
const REFRESH_MS = 30 * 60 * 1000;
let current = null, currentKey = "", loadedAt = 0, pending = null;
const icons = {
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  cloud: '<path d="M7 18h10a4.5 4.5 0 0 0 .2-9A6 6 0 0 0 5.6 10.4 3.8 3.8 0 0 0 7 18Z"/>',
  rain: '<path d="M7 16h10a4.5 4.5 0 0 0 .2-9A6 6 0 0 0 5.6 8.4 3.8 3.8 0 0 0 7 16Z"/><path d="m8 19-1 2m5-2-1 2m5-2-1 2"/>',
  snow: '<path d="M7 16h10a4.5 4.5 0 0 0 .2-9A6 6 0 0 0 5.6 8.4 3.8 3.8 0 0 0 7 16Z"/><path d="M8 20h.1m4-.7h.1m4 .7h.1"/>',
  lightning: '<path d="M7 16h10a4.5 4.5 0 0 0 .2-9A6 6 0 0 0 5.6 8.4 3.8 3.8 0 0 0 7 16Z"/><path d="m12 17-2 4 4-3h-3l2-3"/>',
  partly: '<path d="M8 3V2m-4 9H2m2.5-5.5-1-1M13 4h1"/><path d="M4 11a5 5 0 0 1 8.8-3"/><path d="M8 19h10a4 4 0 0 0 .1-8A5.6 5.6 0 0 0 7 12.5 3.3 3.3 0 0 0 8 19Z"/>',
  fog: '<path d="M5 9h14M3 13h18M5 17h14"/>',
  wind: '<path d="M3 8h13a3 3 0 1 0-3-3M2 12h18a2 2 0 1 1-2 2M4 17h9a3 3 0 1 1-3 3"/>',
  drop: '<path d="M12 3c-3 5-6 8.5-6 12a6 6 0 1 0 12 0c0-3.5-3-7-6-12Z"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>'
};
function svg(kind, size = 18) {
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[kind] || icons.cloud) + '</svg>';
}
function describe(symbol) {
  const s = String(symbol || "").toLowerCase();
  if (s.includes("thunder")) return {kind:"lightning", text:"뇌우"};
  if (s.includes("snow") || s.includes("sleet")) return {kind:"snow", text:"눈"};
  if (s.includes("rain") || s.includes("drizzle")) return {kind:"rain", text:"비"};
  if (s.includes("fog")) return {kind:"fog", text:"안개"};
  if (s.includes("partlycloudy")) return {kind:"partly", text:"구름 조금"};
  if (s.includes("clearsky") || s.includes("fair")) return {kind:"sun", text:"맑음"};
  return {kind:"cloud", text:"흐림"};
}
const numberText = (n, suffix = "") => Number.isFinite(n) ? Math.round(n) + suffix : "—";
function rainText(data) {
  const rows = data?.hours || [];
  const now = Date.now();
  for (const row of rows) {
    const elapsed = (Date.parse(row.time) - now) / 3600000;
    if (elapsed < -1 || elapsed > 3.5) continue;
    const type = describe(row.symbol).kind;
    if (Number(row.precipMm) >= 0.2 || type === "rain" || type === "snow") {
      const period = elapsed < 0.25 ? "곧" : Math.max(1, Math.ceil(elapsed)) + "시간 내";
      return period + (type === "snow" ? " 눈" : " 비") + " 예보";
    }
  }
  return "시간별 예보";
}
function gridPosition() {
  const gps = window.__rsMapPosition;
  const gpsTime = Number(gps?.t || gps?.timestamp || 0);
  const fresh = gpsTime > 0 && Date.now() - gpsTime < 15 * 60 * 1000;
  let lat = fresh ? Number(gps?.lat) : NaN, lon = fresh ? Number(gps?.lng) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const map = window.__rsMap;
    const center = map?.getCenter?.();
    lat = Number(center?.lat); lon = Number(center?.lng);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 32 || lat > 40 || lon < 124 || lon > 132) return null;
  return {lat:(Math.round(lat * 20) / 20).toFixed(2), lon:(Math.round(lon * 20) / 20).toFixed(2)};
}
function barElement() {
  const host = document.querySelector(".nearby.nearby-full .rs33-map-bar");
  if (!host) return null;
  let button = host.querySelector("#" + ID);
  if (!button) {
    button = document.createElement("button");
    button.id = ID; button.type = "button"; button.className = "rs-weather-hud";
    button.innerHTML =
      '<span class="rs-weather-icon">' + svg("cloud", 18) + '</span>' +
      '<strong class="rs-weather-temp">—°</strong>' +
      '<span class="rs-weather-condition">날씨 확인 중</span>' +
      '<span class="rs-weather-notice"></span>' +
      '<span class="rs-weather-chevron">' + svg("chevron", 16) + '</span>';
    button.setAttribute("aria-label", "운행 날씨 상세");
    button.addEventListener("click", openDetails);
    host.append(button);
  }
  return button;
}
function paint() {
  const button = barElement(); if (!button) return;
  const stale = !current || Date.now() - Date.parse(current.receivedAt || "") > 3 * 3600000;
  button.dataset.state = stale ? "stale" : "ready";
  if (!current || stale) {
    button.querySelector(".rs-weather-icon").innerHTML = svg("cloud");
    button.querySelector(".rs-weather-temp").textContent = "—°";
    button.querySelector(".rs-weather-condition").textContent = pending ? "날씨 불러오는 중" : "날씨 확인";
    button.querySelector(".rs-weather-notice").textContent = "예보 보기";
    return;
  }
  const condition = describe(current.current?.symbol);
  button.querySelector(".rs-weather-icon").innerHTML = svg(condition.kind);
  button.querySelector(".rs-weather-temp").textContent = numberText(current.current?.temp, "°");
  button.querySelector(".rs-weather-condition").textContent = condition.text;
  button.querySelector(".rs-weather-notice").textContent = rainText(current);
}
function hourKst(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Intl.DateTimeFormat("ko-KR",{hour:"2-digit",hour12:false,timeZone:"Asia/Seoul"}).format(t) + "시" : "—";
}
function openDetails() {
  if (!current) { void refresh(true); return; }
  const data = current;
  const root = document.createElement("div"); root.className = "rs-weather-details";
  const head = document.createElement("div"); head.className = "rs-weather-head";
  const title = document.createElement("h2"); title.textContent = "운행 날씨";
  const time = document.createElement("small");
  time.textContent = hourKst(data.current?.time) + " 기준 · 시간별 예보";
  head.append(title, time); root.append(head);
  const overview = document.createElement("div"); overview.className = "rs-weather-overview";
  const kind = describe(data.current?.symbol);
  overview.innerHTML = '<span class="rs-weather-large-icon">' + svg(kind.kind, 32) + '</span><strong>' + numberText(data.current?.temp, "°") + '</strong><span>' + kind.text + '</span>';
  root.append(overview);
  const stats = document.createElement("div"); stats.className = "rs-weather-stats";
  for (const [icon, label, value] of [
    ["drop","강수량", Number.isFinite(data.current?.precipMm) ? data.current.precipMm.toFixed(1) + " mm" : "—"],
    ["wind","풍속", Number.isFinite(data.current?.wind) ? data.current.wind.toFixed(1) + " m/s" : "—"],
    ["drop","습도",numberText(data.current?.humidity, "%")]
  ]) {
    const cell = document.createElement("div"); cell.className = "rs-weather-stat";
    cell.innerHTML = svg(icon,16);
    const small = document.createElement("span"); small.textContent = label;
    const strong = document.createElement("strong"); strong.textContent = value;
    cell.append(small,strong); stats.append(cell);
  }
  root.append(stats);
  const sub = document.createElement("h3"); sub.textContent = "시간별 예보"; root.append(sub);
  const hours = document.createElement("div"); hours.className = "rs-weather-hours";
  for (const row of (data.hours || []).slice(0,6)) {
    const cell = document.createElement("div"); cell.className = "rs-weather-hour";
    const label = document.createElement("span"); label.textContent = hourKst(row.time);
    const cond = describe(row.symbol);
    const pict = document.createElement("span"); pict.innerHTML = svg(cond.kind,19);
    const temp = document.createElement("strong"); temp.textContent = numberText(row.temp,"°");
    const rain = document.createElement("small"); rain.textContent = Number.isFinite(row.precipMm) ? row.precipMm.toFixed(1) + " mm" : "—";
    cell.append(label,pict,temp,rain); hours.append(cell);
  }
  root.append(hours);
  const foot = document.createElement("p"); foot.className = "rs-weather-credit";
  foot.textContent = "제공: Norwegian Meteorological Institute (MET Norway) · CC BY 4.0 · 실제 기상과 다를 수 있음";
  root.append(foot);
  openMapSheet(root, "운행 날씨");
  document.querySelector(".rs-sheet-backdrop .rs-map-sheet:has(.rs-weather-details)")?.classList.add("rs-weather-sheet");
}
async function refresh(force = false) {
  const bar = barElement(); if (!bar || document.hidden) return;
  const point = gridPosition(); if (!point) { paint(); return; }
  const key = point.lat + "," + point.lon;
  if (!force && pending) return;
  if (!force && currentKey === key && current && Date.now() - loadedAt < REFRESH_MS) { paint(); return; }
  if (!force && currentKey !== key) {
    current = null;
    try {
      const saved = JSON.parse(sessionStorage.getItem(CACHE) || "null");
      if (saved?.key === key && Date.now() - saved.savedAt < 2 * 3600000) current = saved.data;
    } catch {}
  }
  currentKey = key;
  pending = fetch("/api/weather?lat=" + point.lat + "&lon=" + point.lon, {headers:{"Accept":"application/json"}})
    .then(async res => {
      if (!res.ok) throw Error("Weather unavailable");
      const data = await res.json();
      if (!data || data.source !== "MET Norway" || !data.current) throw Error("Invalid weather");
      if (currentKey === key) {
        current = data; loadedAt = Date.now();
        try { sessionStorage.setItem(CACHE,JSON.stringify({key,data,savedAt:loadedAt})); } catch {}
      }
    }).catch(() => {
      if (currentKey === key && !current) loadedAt = Date.now() - REFRESH_MS + 5 * 60000;
    }).finally(() => { pending = null; paint(); });
  paint();
  await pending;
}
function initialize() {
  const root = document.getElementById("root");
  if (!root) return;
  const observer = new MutationObserver(records => {
    // Ignore our own icon/text mutations. Only mount when React adds a map screen.
    const mountedMap = records.some(record => [...record.addedNodes].some(node =>
      node.nodeType === 1 && (node.matches?.(".rs33-map-bar") || node.querySelector?.(".rs33-map-bar"))));
    if (mountedMap) { paint(); void refresh(); }
  });
  observer.observe(root,{childList:true,subtree:true});
  window.addEventListener("riderspot:map", () => { paint(); void refresh(); });
  window.addEventListener("riderspot:screen", () => { paint(); void refresh(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
  setInterval(() => void refresh(),60_000);
  paint(); void refresh();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",initialize,{once:true});
else initialize();
