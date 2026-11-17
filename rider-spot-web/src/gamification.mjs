// Rider Spot passive progress v1. Deliberately read-only: no localStorage,
// network, GPS, timers, trip mutations or separate state to reconcile.
const ZONE = "Asia/Seoul";
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
export const XP_PER_RECORDED_DAY = 25;
export const XP_PER_ACHIEVEMENT = 15;
const LEVEL_XP = 100;

function instant(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value !== "string" || !value.trim()) return NaN;
  return Date.parse(value);
}
export function riderLocalDay(timestamp) {
  const time = instant(timestamp);
  if (!Number.isFinite(time)) return null;
  const fields = Object.fromEntries(
    formatter.formatToParts(new Date(time)).map((part) => [part.type, part.value]),
  );
  return [fields.year, fields.month, fields.day].join("-");
}

function completedRecords(history) {
  const seen = new Set();
  const rows = [];
  if (!Array.isArray(history)) return rows;
  for (const record of history) {
    if (!record || typeof record.id !== "string" || !record.id || seen.has(record.id)) continue;
    const start = instant(record.started_at);
    const end = instant(record.ended_at);
    // A ride still in progress (even with points) does not count as finished.
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    const day = riderLocalDay(start);
    if (!day) continue;
    seen.add(record.id);
    const value = Number(record.distance_km);
    rows.push({
      id: record.id,
      day,
      start,
      end,
      durationMs: end - start,
      distanceKm: Number.isFinite(value) && value > 0 ? value : 0,
    });
  }
  return rows.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

export const RIDER_ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: "first", icon: "✦", title: "첫 발자국", detail: "첫 운행 기록을 완성했어요", kind: "days", need: 1, tone: "orange" }),
  Object.freeze({ id: "three", icon: "◈", title: "3일의 기록", detail: "서로 다른 3일 동안 기록했어요", kind: "days", need: 3, tone: "mint" }),
  Object.freeze({ id: "seven", icon: "✧", title: "일주일의 흔적", detail: "서로 다른 7일 동안 기록했어요", kind: "days", need: 7, tone: "blue" }),
  Object.freeze({ id: "hundred", icon: "◇", title: "거리의 흔적", detail: "누적 기록 거리 100km", kind: "distance", need: 100, tone: "orange" }),
  Object.freeze({ id: "thirty", icon: "★", title: "기록의 달인", detail: "서로 다른 30일 동안 기록했어요", kind: "days", need: 30, tone: "gold" }),
]);

function tally(records) {
  const days = new Set(records.map((record) => record.day)).size;
  const distance = records.reduce((sum, record) => sum + record.distanceKm, 0);
  const badges = RIDER_ACHIEVEMENTS.map((badge) => {
    const current = badge.kind === "distance" ? distance : days;
    return { ...badge, unlocked: current >= badge.need };
  });
  const earnedBadges = badges.filter((badge) => badge.unlocked).length;
  const xp = days * XP_PER_RECORDED_DAY + earnedBadges * XP_PER_ACHIEVEMENT;
  const level = Math.floor(xp / LEVEL_XP) + 1;
  const title = level >= 10 ? "거리의 기록자" :
    level >= 6 ? "동네 길잡이" : level >= 3 ? "골목 탐험가" : "첫 출발";
  return {
    activeDays: days,
    completedTrips: records.length,
    distanceKm: distance,
    badges,
    earnedBadges,
    xp,
    level,
    title,
    levelXp: xp % LEVEL_XP,
    nextLevelXp: LEVEL_XP,
    percent: (xp % LEVEL_XP) / LEVEL_XP * 100,
  };
}

export function riderProgress(history) {
  return tally(completedRecords(history));
}
export function riderDayResult(history, day) {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day))
    return { day, completedTrips: 0, durationMs: 0, distanceKm: 0, earnedXp: 0, newBadges: [] };
  const records = completedRecords(history);
  const selected = records.filter((record) => record.day === day);
  const before = tally(records.filter((record) => record.day < day));
  const through = tally(records.filter((record) => record.day <= day));
  const newBadges = through.badges.filter((badge) =>
    badge.unlocked && !before.badges.find((previous) => previous.id === badge.id)?.unlocked);
  return {
    day,
    completedTrips: selected.length,
    durationMs: selected.reduce((sum, record) => sum + record.durationMs, 0),
    distanceKm: selected.reduce((sum, record) => sum + record.distanceKm, 0),
    earnedXp: selected.length
      ? XP_PER_RECORDED_DAY + newBadges.length * XP_PER_ACHIEVEMENT : 0,
    newBadges,
  };
}
