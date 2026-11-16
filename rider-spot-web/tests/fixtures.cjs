const tripId = "fd5c320a-63eb-45be-8267-c840bd05ef94";
const userId = "68143efa-b9c8-44e2-a459-2b326e64b591";
function sampleTrip(
  count,
  {
    active = false,
    id = tripId,
    started = Date.now() - (count + 600) * 1000,
  } = {},
) {
  const points = Array.from({ length: count }, (_, i) => ({
    lat: 35.17 + Math.cos(i / 40) * 0.005,
    lng: 126.82 + Math.sin(i / 40) * 0.005,
    t: started + i * 1000,
    accuracy: 8,
    ...(i > 0 && i % 480 === 0 ? { break: true } : {}),
  }));
  const events = points
    .filter((_, i) => i % 30 === 0)
    .map((point, i) => ({
      id: `stop:${i}`,
      type: "정차",
      source: "riderspot-native-stop-v1",
      lat: point.lat,
      lng: point.lng,
      at: new Date(point.t).toISOString(),
    }));
  return {
    id,
    user_id: null,
    started_at: new Date(started).toISOString(),
    ended_at: active ? null : new Date(points.at(-1).t).toISOString(),
    points,
    events,
    distance_km: 15,
    memo: `QA ${count}`,
  };
}
module.exports = { sampleTrip, tripId, userId };
