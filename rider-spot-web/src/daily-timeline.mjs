import { rs33WorkDay } from "./timeline-dates.mjs";
import { rs33Timestamp } from "./route-analysis.mjs";

/**
 * Calendar day boundaries are 00:00–23:59:59.999 in Asia/Seoul.
 * One SQLite GPS session can cross midnight. Never stop the real recording
 * at midnight: the daily route is a read-only projection of original points.
 * No interpolation, time rounding, map matching, upload, or extra GPS points.
 */
const KST_MIDNIGHT = day => Date.parse(day + "T00:00:00+09:00");
function segmentDistanceKm(points) {
  let meters = 0;
  const rad = Math.PI / 180;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (b.break || !Number.isFinite(Number(a.lat)) || !Number.isFinite(Number(a.lng)) ||
        !Number.isFinite(Number(b.lat)) || !Number.isFinite(Number(b.lng))) continue;
    const dt = Number(b.t) - Number(a.t);
    if (dt < 0 || dt > 120000) continue;
    const x = (Number(b.lat)-Number(a.lat)) * rad;
    const y = (Number(b.lng)-Number(a.lng)) * rad;
    const z = Math.sin(x / 2) ** 2 +
      Math.cos(Number(a.lat) * rad) * Math.cos(Number(b.lat) * rad) *
      Math.sin(y / 2) ** 2;
    const metersBetween = 12742000 * Math.atan2(Math.sqrt(z),Math.sqrt(Math.max(0,1-z)));
    if (metersBetween < 1200 && (dt===0 || metersBetween / (dt/1000) <= 48))
      meters += metersBetween;
  }
  return meters / 1000;
}
export function projectRideForCalendarDay(trip, day, clock = Date.now()) {
  const start = rs33Timestamp(trip?.started_at);
  const end = rs33Timestamp(trip?.ended_at) || clock;
  const from = KST_MIDNIGHT(day);
  if (!Number.isFinite(from) || !start || end <= from || start >= from + 86400000)
    return null;
  const begin = Math.max(start,from);
  const finish = Math.min(end,from+86400000);
  if(finish <= begin)return null;
  const completeDay = start >= from && end <= from + 86400000;
  if (completeDay) return trip;
  const points = (Array.isArray(trip.points)?trip.points:[])
    .filter(p => {
      const t=Number(p?.t);
      return Number.isFinite(t)&&t>=begin&&t<finish;
    });
  const events=(Array.isArray(trip.events)?trip.events:[]).filter(e=>{
    const time=rs33Timestamp(e?.at);
    return time && time>=begin&&time<finish;
  });
  return {...trip,
    started_at:new Date(begin).toISOString(),
    ended_at:trip.ended_at ? new Date(finish).toISOString() : null,
    points,events,
    distance_km:segmentDistanceKm(points),
    calendar_segment:true,
    original_started_at:trip.started_at,
    original_ended_at:trip.ended_at||null,
  };
}

export function buildDailyTimeline(history, day) {
  const trips = (Array.isArray(history) ? history : [])
    .map(trip=>projectRideForCalendarDay(trip,day))
    .filter(Boolean)
    .sort((a, b) =>
      rs33Timestamp(a.started_at) - rs33Timestamp(b.started_at) ||
      String(a.id).localeCompare(String(b.id)),
    );

  if (!trips.length) return null;

  const points = [];
  const events = [];
  let distanceKm = 0;
  let durationMs = 0;
  let latestEnd = 0;
  let originalPointCount = 0;

  for (const trip of trips) {
    distanceKm += Math.max(0, Number(trip.distance_km) || 0);
    const started = rs33Timestamp(trip.started_at);
    const ended = rs33Timestamp(trip.ended_at);
    if (started && ended && ended > started) durationMs += ended - started;
    latestEnd = Math.max(latestEnd, ended || started || 0);

    const samples = Array.isArray(trip.points) ? trip.points : [];
    originalPointCount += samples.length;
    // No mutation of SQLite / localStorage / Supabase source samples.
    // A new "break" on the first point guarantees separate journeys remain
    // independent on the map even when two runs share an exact GPS position.
    if (samples.length) {
      points.push({ ...samples[0], break: true });
      for (let i = 1; i < samples.length; i++) points.push(samples[i]);
    }
    if (Array.isArray(trip.events)) {
      for (const event of trip.events) {
        if (event && rs33Timestamp(event.at)) events.push(event);
      }
    }
  }
  events.sort(
    (a, b) => rs33Timestamp(a.at) - rs33Timestamp(b.at),
  );

  const startedAt = trips[0].started_at;
  return {
    day,
    trips,
    distanceKm,
    durationMs,
    originalPointCount,
    route: {
      id: "day:" + day,
      started_at: startedAt,
      ended_at: latestEnd ? new Date(latestEnd).toISOString() : startedAt,
      points,
      events,
      distance_km: distanceKm,
      readonly: true,
    },
  };
}
