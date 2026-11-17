import { riderLocalDay, riderDayResult } from "./gamification.mjs";

// Read-only summaries of completed rides. Coordinates, stops and route points
// are not processed here, copied to the clipboard or sent to a server.
const sessionHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23" });
const TIME_BANDS = Object.freeze([
  { label: "이른 시간", start: 5, end: 11 },
  { label: "낮 시간", start: 11, end: 17 },
  { label: "저녁 시간", start: 17, end: 23 },
  { label: "밤 시간", start: 23, end: 29 },
]);
export function completedRideRows(history, now = Date.now()) {
  const rows = [];
  const seen = new Set();
  for (const record of Array.isArray(history) ? history : []) {
    if (!record || typeof record.id !== "string" || !record.id || seen.has(record.id)) continue;
    const start = Date.parse(record.started_at), end = Date.parse(record.ended_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > now) continue;
    const day = riderLocalDay(start);
    if (!day) continue;
    const distance = Number(record.distance_km);
    const hour = Number(sessionHour.format(new Date(start)));
    seen.add(record.id);
    rows.push({
      day, start, durationMs: end - start,
      distanceKm: Number.isFinite(distance) && distance > 0 ? distance : 0,
      band: TIME_BANDS.find(b => (hour < b.start ? hour + 24 : hour) >= b.start && (hour < b.start ? hour + 24 : hour) < b.end)?.label || "밤 시간",
    });
  }
  return rows;
}
export function dailyRideSnapshot(history, day, now = Date.now()) {
  const rows = completedRideRows(history, now).filter(row => row.day === day);
  return {
    day, trips: rows.length,
    distanceKm: rows.reduce((total, row) => total + row.distanceKm, 0),
    durationMs: rows.reduce((total, row) => total + row.durationMs, 0),
  };
}
export function riderRhythm(history, now = Date.now()) {
  const today = riderLocalDay(now);
  const cutoff = new Date(Date.parse(today + "T00:00:00Z") - 27 * 86400000).toISOString().slice(0, 10);
  const rows = completedRideRows(history, now).filter(row => row.day >= cutoff && row.day <= today);
  const counts = new Map(TIME_BANDS.map(b => [b.label, 0]));
  for (const row of rows) counts.set(row.band, (counts.get(row.band) || 0) + 1);
  const sessions = rows.length;
  const activeDays = new Set(rows.map(row => row.day)).size;
  const favorite = sessions
    ? TIME_BANDS.reduce((best, band) => counts.get(band.label) > counts.get(best.label) ? band : best, TIME_BANDS[0]).label
    : null;
  const durationMs = rows.reduce((sum, row) => sum + row.durationMs, 0);
  return { sessions, activeDays, favorite, durationMs, averageMinutes: activeDays ? Math.round(durationMs / activeDays / 60000) : 0, periodDays: 28 };
}
export function rideRecapText(history, day) {
  const ride = dailyRideSnapshot(history, day);
  if (!ride.trips) return "";
  const earned = riderDayResult(history, day);
  const duration = Math.round(ride.durationMs / 60000);
  const hours = Math.floor(duration / 60), minutes = duration % 60;
  const time = [hours ? hours + "시간" : "", minutes ? minutes + "분" : "", !duration ? "1분 미만" : ""].filter(Boolean).join(" ");
  return [
    "라이더스팟 · " + day.replaceAll("-", ".") + "의 라이딩",
    "완료한 운행 " + ride.trips + "회",
    "기록 거리 " + ride.distanceKm.toFixed(1) + "km",
    "기록 시간 " + time,
    "기록 XP +" + earned.earnedXp,
    ...(earned.newBadges.length ? ["새 배지 " + earned.newBadges.map(b => b.title).join(", ")] : []),
    "경로·위치 정보는 포함하지 않았어요.",
  ].join("\n");
}
export function rideEfficiency(gross, ride) {
  const won = Number(gross);
  if (!Number.isFinite(won) || won <= 0 || !ride || !ride.trips) return null;
  const hours = ride.durationMs / 3600000, km = ride.distanceKm;
  return {
    perHour: hours > 0 ? Math.round(won / hours) : null,
    perKm: km > 0 ? Math.round(won / km) : null,
  };
}
