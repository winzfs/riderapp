// Read-only GPS projection for route map overlays. It never writes to SQLite,
// localStorage, Supabase or the underlying trip points.
export function isTimelineCoordinate(point) {
  return point != null && point.lat != null && point.lng != null &&
    point.lat !== "" && point.lng !== "" &&
    Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) &&
    Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lng)) <= 180;
}

function pointTime(point) {
  const value = point?.t;
  const time = typeof value === "number" ? value :
    typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(time) && time > 0 ? time : null;
}

export function timelineStartPoint(tripOrPoints) {
  const points = Array.isArray(tripOrPoints) ? tripOrPoints : tripOrPoints?.points;
  if (!Array.isArray(points)) return null;
  return points.find(isTimelineCoordinate) || null;
}

export function timelineEndPoint(tripOrPoints) {
  const points=Array.isArray(tripOrPoints)?tripOrPoints:tripOrPoints?.points;
  if(!Array.isArray(points))return null;
  let latest=-Infinity,last=null;
  for(const point of points){
    if(!isTimelineCoordinate(point))continue;
    const at=pointTime(point);
    if(at!=null && at>=latest){latest=at;last=point;}
    else if(at==null && latest===-Infinity)last=point;
  }
  return last;
}

export function timelineLivePosition(position, trip) {
  const points = Array.isArray(trip?.points) ? trip.points : [];
  const last = points.findLast(isTimelineCoordinate) || null;
  if (!isTimelineCoordinate(position)) return last;
  if (!last) return position;
  const liveAt = pointTime(position), savedAt = pointTime(last);
  // Native SQLite can report a newer sample than geolocation.watchPosition.
  // Prefer the newest real measured fix rather than a stale foreground callback.
  return savedAt && (!liveAt || savedAt > liveAt) ? last : position;
}

export function timelineFixStale(position, now = Date.now()) {
  const t = pointTime(position);
  return !isTimelineCoordinate(position) || !t ||
    now - t > 45000 || t - now > 10000;
}

export function timelineHeading(position) {
  if (position?.heading == null || position.heading === "") return null;
  const value = Number(position.heading);
  return Number.isFinite(value) && value >= 0 && value <= 360
    ? value : null;
}
