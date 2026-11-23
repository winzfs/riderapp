import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyTimeline } from "../src/daily-timeline.mjs";
import { analyzeCourse, rs33Paths } from "../src/route-analysis.mjs";

const point = (lat, lng, t) => ({ lat, lng, t, accuracy: 8 });
function record(id, start, end, km, points = [], events = []) {
  return {
    id, started_at: start, ended_at: end, distance_km: km,
    points, events,
  };
}

test("daily timeline combines all saved runs on their Korean calendar date", () => {
  const source = [
    record("overnight", "2026-11-16T12:55:00Z", "2026-11-16T14:29:00Z", 88.9,
      [
        point(35.160, 126.830, Date.parse("2026-11-16T12:55:01Z")),
        point(35.161, 126.830, Date.parse("2026-11-16T12:55:11Z")),
      ],
      [{ type: "정차", at: "2026-11-16T13:20:00Z" }]),
    record("late", "2026-11-16T13:14:00Z", "2026-11-16T13:28:00Z", 2.3,
      [
        point(35.180, 126.870, Date.parse("2026-11-16T13:14:01Z")),
        point(35.181, 126.871, Date.parse("2026-11-16T13:14:11Z")),
      ]),
    record("morning", "2026-11-16T07:17:00Z", "2026-11-16T07:21:00Z", .4,
      [
        point(35.120, 126.810, Date.parse("2026-11-16T07:17:01Z")),
        point(35.121, 126.812, Date.parse("2026-11-16T07:17:11Z")),
      ]),
    record("no-gps", "2026-11-16T13:28:00Z", "2026-11-16T13:28:01Z", 0),
    record("next-day", "2026-11-16T21:01:00Z", "2026-11-16T21:04:00Z", 1,
      [point(35.3, 126.9, Date.parse("2026-11-16T21:01:01Z"))]),
  ];
  const unchanged = JSON.stringify(source);
  const daily = buildDailyTimeline(source, "2026-11-16");

  assert.deepEqual(daily.trips.map((trip) => trip.id), [
    "morning", "overnight", "late", "no-gps",
  ]);
  assert.equal(daily.distanceKm, 91.60000000000001 /* float sum, not recomputed from GPS */);
  assert.equal(daily.route.id, "day:2026-11-16");
  assert.equal(daily.route.readonly, true);
  assert.equal(daily.originalPointCount, 6);
  assert.equal(daily.route.points.length, 6);
  assert.equal(daily.route.points[0].break, true);
  assert.equal(daily.route.points[2].break, true);
  assert.equal(daily.route.points[4].break, true);
  assert.equal(rs33Paths(daily.route.points).length, 3);
  assert.equal(daily.route.events.length, 1);
  assert.equal(daily.route.events[0].type, "정차");
  assert.equal(daily.durationMs, (4 + 94 + 14) * 60_000 + 1000);
  assert.equal(JSON.stringify(source), unchanged, "original SQLite/web trip snapshots unchanged");

  // The map can safely use its ordinary worker analysis, including revisits.
  const analyzed = analyzeCourse(daily.route.points, daily.route.events);
  assert.ok(analyzed.bounds);
  assert.equal(analyzed.geometry.paths.length, 3);
});

test("a day with zero-GPS trips remains selectable without drawing a false path", () => {
  const saved = [
    record("empty1", "2026-11-16T09:00:00Z", "2026-11-16T09:00:02Z", 0),
    record("empty2", "2026-11-16T10:00:00Z", "2026-11-16T10:12:00Z", 0),
  ];
  const daily = buildDailyTimeline(saved, "2026-11-16");
  assert.equal(daily.trips.length, 2);
  assert.deepEqual(daily.route.points, []);
  assert.equal(daily.durationMs, 722_000);
  assert.equal(buildDailyTimeline(saved, "2026-11-17"), null);
});

test("explicit route break and overlapping runs never produce artificial cross-run connections", () => {
  const start = Date.parse("2026-11-16T09:00:00Z");
  const a = record("a", "2026-11-16T09:00:00Z", "2026-11-16T10:00:00Z", 1,
    [point(35.1, 126.7, start), {...point(35.1002, 126.7002, start + 10000), break: true}, point(35.1004, 126.7004, start + 20000)]);
  const b = record("b", "2026-11-16T09:20:00Z", "2026-11-16T09:30:00Z", 2,
    [point(36.1, 127.7, start + 20 * 60000),point(36.1002, 127.7002, start + 20 * 60000 + 10000)]);
  const daily = buildDailyTimeline([b, a], "2026-11-16");
  assert.equal(daily.trips[0].id, "a");
  assert.equal(rs33Paths(daily.route.points).length, 3);
  assert.equal(a.points[0].break, undefined);
  assert.equal(b.points[0].break, undefined);
});


test("ongoing rides span midnight while new rides belong to their calendar date", () => {
  const source = [
    record("before-midnight", "2026-11-18T14:59:00Z", "2026-11-18T15:01:00Z", 1),
    record("after-midnight", "2026-11-18T15:00:00Z", "2026-11-18T15:05:00Z", 2),
    record("before-three", "2026-11-18T17:59:59Z", "2026-11-18T18:01:00Z", 3),
    record("three-exact", "2026-11-18T18:00:00Z", "2026-11-18T18:10:00Z", 4),
  ];
  const snapshot = JSON.stringify(source);
  assert.deepEqual(buildDailyTimeline(source, "2026-11-18").trips.map(t => t.id),
    ["before-midnight"]);
  assert.deepEqual(buildDailyTimeline(source, "2026-11-19").trips.map(t => t.id), ["after-midnight", "before-midnight", "before-three", "three-exact"]);
  assert.equal(buildDailyTimeline(source, "2026-11-18").distanceKm, 0);
  assert.equal(JSON.stringify(source), snapshot, "date grouping must not mutate the original trips");
});
