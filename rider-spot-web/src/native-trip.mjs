import { rs43Meters } from "./route-analysis.mjs";
import { rs33ISO } from "./timeline-dates.mjs";

export const isNative = () =>
  Boolean(window.__rsNativeInstalled && window.RiderSpotHost);
const pointIsValid = (p) =>
  p &&
  p.lat != null &&
  p.lng != null &&
  Number.isFinite(Number(p.t)) &&
  Number(p.t) > 0 &&
  Math.abs(Number(p.lat)) <= 90 &&
  Math.abs(Number(p.lng)) <= 180;

export function mergeTripPoints(existing, source) {
  // An Android fix has a persistent native seq. Two distinct fixes can share
  // the same millisecond: never overwrite one merely because timestamps match.
  const key = (p) => Number.isSafeInteger(Number(p.seq)) && Number(p.seq) > 0
    ? "seq:" + Number(p.seq)
    : ["time", Number(p.t), Number(p.lat), Number(p.lng)].join(":");
  const index = new Map();
  for (const point of existing || [])
    if (pointIsValid(point)) index.set(key(point), point);
  for (const raw of source || []) {
    if (!pointIsValid(raw)) continue;
    const t = Number(raw.t);
    const identity = key(raw);
    const previous = index.get(identity);
    const seq = Number(raw.seq);
    index.set(identity, {
      lat: Number(raw.lat),
      lng: Number(raw.lng),
      t,
      ...(Number.isSafeInteger(seq) && seq > 0 ? { seq } : {}),
      accuracy: Number(raw.accuracy) || 0,
      heading: Number(raw.heading) || 0,
      speed: Number(raw.speed) || 0,
      ...(previous?.break ? { break: true } : {}),
    });
  }
  const points = [...index.values()].sort((a, b) =>
    Number(a.t) - Number(b.t) || Number(a.seq || 0) - Number(b.seq || 0));
  for (let i = 1; i < points.length; i++) {
    if (points[i].t - points[i - 1].t > 45000 && !points[i].break)
      points[i] = { ...points[i], break: true };
  }
  return points;
}

export function nativeDistance(points) {
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].break || points[i].t <= points[i - 1].t) continue;
    const distance = rs43Meters(points[i - 1], points[i]);
    if (distance > 4 && distance < 2500) meters += distance;
  }
  return Math.round(meters / 10) / 100;
}

// Native sequence IDs let the existing indexed SQLite "points" bridge seek
// directly into a selected day, even when a single ride crosses midnight.
export function nativeGpsDayRanges(points) {
  const ranges = {};
  for (const point of Array.isArray(points) ? points : []) {
    const seq = Number(point?.seq), timestamp = Number(point?.t);
    if (!Number.isSafeInteger(seq) || seq < 1 ||
        !Number.isFinite(timestamp) || timestamp <= 0) continue;
    const day = rs33ISO(timestamp);
    const range = ranges[day] || (ranges[day] = {
      firstSeq: seq, lastSeq: seq, pointCount: 0,
    });
    range.firstSeq = Math.min(range.firstSeq, seq);
    range.lastSeq = Math.max(range.lastSeq, seq);
    range.pointCount++;
  }
  return ranges;
}

export async function readStoppedTrip(bridge, trip, stopTime) {
  let state = await bridge.call("state");
  if (state.activeId === trip.id) {
    await bridge.call("stop", { tripId: trip.id });
    state = await bridge.call("state");
  }
  if (state.activeId || state.lastStoppedId !== trip.id)
    throw Error(
      "기기 GPS 종료 상태를 확인하지 못했어요. 운행 기록은 보관 중입니다.",
    );
  const nativePoints = await bridge.allPoints(trip.id);
  if (!nativePoints.length && !trip.points?.length)
    throw Error("기기 GPS 기록을 읽지 못했어요. 다시 시도해 주세요.");
  const points = mergeTripPoints(trip.points, nativePoints);
  const events = Array.isArray(trip.events) ? [...trip.events] : [];
  const stopEvents =
    bridge.detectStops?.(mergeTripPoints([], nativePoints)) || [];
  const index = new Map(
    events.filter((event) => event?.id).map((event) => [event.id, event]),
  );
  for (const event of stopEvents) {
    const prior = index.get(event.id);
    if (prior) events[events.indexOf(prior)] = event;
    else events.push(event);
  }
  const ended_at = trip.ended_at || stopTime;
  if (!trip.ended_at) events.push({ type: "운행 종료", at: ended_at });
  events.sort((a, b) => (Date.parse(a?.at) || 0) - (Date.parse(b?.at) || 0));
  if (state.gpsArchiveV59) {
    // The Android v59 build keeps an independent, durable event copy. This is
    // capability-gated: older installed APKs continue their unchanged flow.
    const saved = await bridge.call("gps-events-save", { tripId: trip.id, events });
    if (saved?.stored !== events.length)
      throw Error("정차 이벤트 기기 저장을 확인하지 못했어요. 다시 시도해 주세요.");
  }
  return {
    ...trip,
    ended_at,
    points,
    events,
    gps_day_ranges: nativeGpsDayRanges(nativePoints),
    distance_km: Math.max(
      Number(trip.distance_km) || 0,
      nativeDistance(points),
    ),
  };
}
