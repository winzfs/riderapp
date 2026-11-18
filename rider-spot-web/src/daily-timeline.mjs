import { rs33WorkDay } from "./timeline-dates.mjs";
import { rs33Timestamp } from "./route-analysis.mjs";

/**
 * A read-only daily view. Every saved trip keeps its original id, samples and
 * upload state. GPS segments are separated at recording boundaries so a
 * missing interval never becomes a fictitious straight-line journey.
 */
export function buildDailyTimeline(history, day) {
  const trips = (Array.isArray(history) ? history : [])
    .filter((trip) => {
      const started = rs33Timestamp(trip?.started_at);
      return started != null && rs33WorkDay(started) === day;
    })
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
