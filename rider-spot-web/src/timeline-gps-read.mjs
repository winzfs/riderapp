import { rs33ISO, rs33DateAdd } from "./timeline-dates.mjs";
import { rs33Timestamp } from "./route-analysis.mjs";
import { buildDailyTimeline } from "./daily-timeline.mjs";
import { mergeTripPoints } from "./native-trip.mjs";

const DAY_MS = 86_400_000;
const nowMs = () => globalThis.performance?.now?.() ?? Date.now();
const validDay = day => /^\d{4}-\d{2}-\d{2}$/.test(String(day || "")) &&
  Number.isFinite(Date.parse(day + "T00:00:00+09:00"));
export function kstDayBounds(day) {
  if (!validDay(day)) throw Error("유효한 운행 날짜가 아닙니다.");
  const from = Date.parse(day + "T00:00:00+09:00");
  return { from, until: from + DAY_MS };
}
export function overlapsKstDay(trip, day, clock = Date.now()) {
  const { from, until } = kstDayBounds(day);
  const start = rs33Timestamp(trip?.started_at);
  const end = rs33Timestamp(trip?.ended_at) || clock;
  return start !== null && end > start && start < until && end > from;
}
export function calendarDaysForTrip(trip, clock = Date.now()) {
  const start = rs33Timestamp(trip?.started_at);
  const end = rs33Timestamp(trip?.ended_at) || clock;
  if (start === null || end <= start) return [];
  const first = rs33ISO(start);
  const last = rs33ISO(end - 1);
  const days = [];
  for (let date = first; date <= last && days.length < 3660; date = rs33DateAdd(date, 1))
    days.push(date);
  return days;
}

// SQLite remains the original source. This is a small metadata projection,
// never a second GPS store and never a modification of recorded coordinates.
export function toNativeGpsSummary(trip) {
  const ranges = trip?.gps_day_ranges;
  const points = trip?.points;
  if (!Array.isArray(points) || !points.length || !ranges ||
      !Object.keys(ranges).length) return trip; // Unknown native completeness: preserve the original.
  const days = {};
  for (const day of Object.keys(ranges)) {
    const projected = buildDailyTimeline([trip], day);
    if (projected) days[day] = {
      distance_km: projected.distanceKm,
      duration_ms: projected.durationMs,
      point_count: projected.originalPointCount,
    };
  }
  return {
    ...trip, points: [], gps_native: true, gps_point_count: points.length,
    gps_day_summary: days,
  };
}
// Native v59 keeps a durable event record independent of the WebView cache.
// Older APKs expose no reader and retain the exact existing timeline behavior.
export async function withNativeGpsEventsV59(row) {
  const readEvents = globalThis.__rsNativeReadEventsV59;
  if (!row?.gps_native || typeof readEvents !== "function") return row;
  try {
    const response = await readEvents(row.id);
    const saved = Array.isArray(response?.events) ? response.events : [];
    if (!saved.length) return row;
    const key = event => event?.id ||
      [event?.type || "", event?.at || "", event?.lat ?? "", event?.lng ?? ""].join("|");
    const events = new Map((row.events || []).map(event => [key(event), event]));
    for (const event of saved) if (event && typeof event === "object")
      events.set(key(event), event);
    return { ...row, events: [...events.values()].sort((a,b) =>
      (Date.parse(a?.at) || 0) - (Date.parse(b?.at) || 0)) };
  } catch (error) {
    // An event read failure must not prevent GPS route playback.
    console.warn("[RiderSpot] native event read deferred", row.id, error?.message);
    return row;
  }
}
const candidatePoints = row => Array.isArray(row?.points) && row.points.length > 0;
const cacheKey = (owner, row, day) =>
  [owner || "guest", row.id, day, row.ended_at || "", row.gps_point_count || 0].join(":");
function remember(cache, key, points, max = 6) {
  if (!cache) return;
  cache.delete(key);
  cache.set(key, points);
  while (cache.size > max) cache.delete(cache.keys().next().value);
}
function projectSamples(samples, from, until) {
  const filtered = (Array.isArray(samples) ? samples : []).filter(point =>
    Number.isFinite(Number(point?.t)) && Number(point.t) >= from &&
    Number(point.t) < until);
  return mergeTripPoints([], filtered);
}

/**
 * The only native reads are for trips overlapping the selected KST day.
 * A v58 trip supplies a per-day SQLite sequence range. Legacy trips safely
 * fall back to reading that trip, NOT every trip in the user's history.
 */
export async function loadCalendarGps(history, day, {
  reader = null, cache = null, owner = "guest", clock = Date.now(),
} = {}) {
  const t0 = nowMs();
  const { from, until } = kstDayBounds(day);
  const rows = (Array.isArray(history) ? history : []).filter(row =>
    overlapsKstDay(row, day, clock));
  let sqliteTrips = 0, sqlitePoints = 0, cacheHits = 0, missing = 0;
  const records = [];
  for (const row of rows) {
    if (candidatePoints(row)) {
      records.push(await withNativeGpsEventsV59(row)); // Legacy routes remain untouched.
      continue;
    }
    const key = cacheKey(owner, row, day);
    if (cache?.has(key)) {
      cacheHits++;
      records.push(await withNativeGpsEventsV59({ ...row, points: cache.get(key) }));
      continue;
    }
    if (!reader?.allPointsForDay && !reader?.allPoints) {
      missing++;
      records.push(await withNativeGpsEventsV59(row));
      continue;
    }
    try {
      const response = reader.allPointsForDay
        ? await reader.allPointsForDay(row.id, day, row.gps_day_ranges?.[day])
        : await reader.allPoints(row.id);
      const raw = Array.isArray(response) ? response : response?.points || [];
      const points = projectSamples(raw, from, until);
      sqliteTrips++;
      sqlitePoints += Number.isFinite(response?.readCount) ?
        response.readCount : raw.length;
      remember(cache, key, points);
      records.push(await withNativeGpsEventsV59({ ...row, points }));
    } catch (error) {
      // Never pretend missing SQLite route is an empty recorded route.
      missing++;
      records.push(await withNativeGpsEventsV59(row));
      console.warn("[RiderSpot] selected-day GPS read failed", row.id, error?.message);
    }
  }
  const report = {
    day, matchingTrips: rows.length, sqliteTrips, sqlitePoints,
    renderedPoints: records.reduce((sum, row) => sum +
      (Array.isArray(row.points) ? row.points.length : 0), 0),
    cacheHits, missing, elapsedMs: Math.round((nowMs() - t0) * 10) / 10,
  };
  return { records, report };
}
export async function loadDetailGps(row, {
  reader = null, cache = null, owner = "guest",
} = {}) {
  if (!row || candidatePoints(row) || !reader?.allPoints) return withNativeGpsEventsV59(row);
  const key = cacheKey(owner, row, "all");
  if (cache?.has(key)) return withNativeGpsEventsV59({ ...row, points: cache.get(key) });
  const raw = await reader.allPoints(row.id);
  const points = mergeTripPoints([], raw);
  remember(cache, key, points);
  return withNativeGpsEventsV59({ ...row, points });
}
