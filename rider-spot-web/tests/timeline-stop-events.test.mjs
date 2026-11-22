import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCourse } from "../src/route-analysis.mjs";
import { timelineDisplayEvents } from "../src/timeline-stop-events.mjs";
import { buildDailyTimeline } from "../src/daily-timeline.mjs";

const start = Date.parse("2026-11-22T09:00:00+09:00");
const at = (seconds) => new Date(start + seconds * 1000).toISOString();
const point = (seconds, lat = 35.1595, lng = 126.8526, extras = {}) => ({
  t: start + seconds * 1000, lat, lng, accuracy: 12, ...extras,
});
const stationary = [0, 15, 30, 45, 60, 75, 90, 105, 120].map((seconds) => point(seconds));

test("GPS-inferred stop appears on the map and in the trip event list", () => {
  const recorded = [
    { type: "운행 시작", at: at(0) },
    { type: "운행 종료", at: at(150) },
  ];
  const course = analyzeCourse([...stationary, point(150, 35.161, 126.854)], recorded);
  const stops = course.stamps.filter((stamp) => stamp.kind === "stop");
  assert.equal(stops.length, 1);
  assert.equal(stops[0].inferred, true);
  const displayed = timelineDisplayEvents(recorded, course.stamps);
  assert.equal(displayed.length, 3);
  assert.match(displayed[1].type, /정차 추정/);
  assert.equal(displayed[1].inferred, true);
  assert.equal(recorded.length, 2, "source record must remain unchanged");
});

test("saved manual rest does not produce a duplicate inferred event", () => {
  const recorded = [
    { type: "운행 시작", at: at(0) },
    { type: "휴식 시작", at: at(60) },
    { type: "운행 재개", at: at(120) },
  ];
  const course = analyzeCourse(stationary, recorded);
  const stops = course.stamps.filter((stamp) => stamp.kind === "stop");
  // Only "휴식 시작" becomes a map pin; "운행 재개" remains in the event list.
  assert.equal(stops.length, 1);
  assert.equal(stops[0].inferred, false);
  const displayed = timelineDisplayEvents(recorded, course.stamps);
  assert.equal(displayed.length, 3);
  assert.equal(displayed.filter((event) => event.inferred).length, 0);
});

test("daily route retains independent inferred stops without mutating trips", () => {
  const trip = {
    id: "trip-a", started_at: at(0), ended_at: at(150),
    points: [...stationary, point(150, 35.161, 126.854)],
    events: [{ type: "운행 시작", at: at(0) }], distance_km: 1,
  };
  const daily = buildDailyTimeline([trip], "2026-11-22");
  assert.ok(daily);
  assert.equal(analyzeCourse(daily.route.points, daily.route.events).stamps.filter(
    (stamp) => stamp.kind === "stop").length, 1);
  assert.equal(trip.events.length, 1);
});

test("missing GPS fixes do not fabricate a stop", () => {
  const points = [point(0), point(5), point(110), point(115, 35.16, 126.854)];
  const course = analyzeCourse(points, []);
  assert.equal(course.stamps.filter((stamp) => stamp.kind === "stop").length, 0);
});
