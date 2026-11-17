import assert from "node:assert/strict";
import test from "node:test";
import {
  riderProgress, riderDayResult, riderLocalDay, RIDER_ACHIEVEMENTS,
} from "../src/gamification.mjs";
import { createGamificationUI } from "../src/gamification-ui.mjs";

const ride = (id, start, opts = {}) => ({
  id, started_at: start,
  ended_at: opts.ended === false ? null : new Date(Date.parse(start) + (opts.minutes ?? 30) * 60000).toISOString(),
  distance_km: opts.km ?? 8,
  points: [{ lat: 35.1, lng: 126.8, t: Date.parse(start) }],
  events: [{ type: "운행 종료", at: start }],
});
const FIRST = "2026-11-15T03:10:00.000Z"; // 12:10 Korea
const SECOND = "2026-11-16T03:10:00.000Z";
const THIRD = "2026-11-17T03:10:00.000Z";

test("counts only unique completed ride days; no rewards for live rides or sync duplicates", () => {
  const rides = [
    ride("one", FIRST),
    ride("two", FIRST, { minutes: 40, km: 5 }),
    ride("one", FIRST), // repeated server upsert id
    ride("live", SECOND, { ended: false, km: 500 }),
    ride("invalid-time", "not a time"),
    ride("end-before-start", THIRD, { minutes: -20 }),
    ride("negative-distance", SECOND, { km: -12 }),
    ride("nan-distance", SECOND, { km: "not-a-number" }),
  ];
  const original = JSON.stringify(rides);
  const progress = riderProgress(rides);
  assert.equal(progress.activeDays, 2);
  assert.equal(progress.completedTrips, 4);
  assert.equal(progress.distanceKm, 13);
  assert.equal(progress.earnedBadges, 1);
  assert.equal(progress.xp, 65);
  assert.equal(progress.level, 1);
  assert.equal(progress.levelXp, 65);
  assert.deepEqual(riderDayResult(rides, "2026-11-15"), {
    day: "2026-11-15", completedTrips: 2, durationMs: 70 * 60000,
    distanceKm: 13, earnedXp: 40,
    newBadges: [{ ...RIDER_ACHIEVEMENTS[0], unlocked: true }],
  });
  assert.equal(riderDayResult(rides, "2026-11-16").earnedXp, 25);
  assert.equal(JSON.stringify(rides), original, "gamification must never mutate source records");
});

test("consistent Seoul calendar day boundaries and no bonus for a second trip", () => {
  assert.equal(riderLocalDay("2026-11-16T15:05:00.000Z"), "2026-11-17");
  assert.equal(riderLocalDay("2026-11-16T14:59:59.000Z"), "2026-11-16");
  assert.equal(riderLocalDay("invalid"), null);
  const d = riderDayResult([
    ride("a", "2026-11-16T15:05:00.000Z"),
    ride("b", "2026-11-16T16:05:00.000Z"),
  ], "2026-11-17");
  assert.equal(d.completedTrips, 2);
  assert.equal(d.earnedXp, 40);
  assert.equal(d.newBadges.length, 1);
});

test("achievements unlock once on milestones; no speed or per-km XP", () => {
  const dates = [FIRST, SECOND, THIRD];
  const rides = dates.map((date, i) => ride("day-" + i, date, { km: i === 2 ? 90 : 6 }));
  assert.equal(riderDayResult(rides, "2026-11-15").earnedXp, 40);
  assert.equal(riderDayResult(rides, "2026-11-16").earnedXp, 25);
  assert.equal(riderDayResult(rides, "2026-11-17").earnedXp, 55);
  assert.deepEqual(riderDayResult(rides, "2026-11-17").newBadges.map(x => x.id), ["three", "hundred"]);
  const progress = riderProgress(rides);
  assert.equal(progress.xp, 120);
  assert.equal(progress.level, 2);
  assert.equal(progress.levelXp, 20);
  assert.equal(progress.percent, 20);
  assert.equal(progress.title, "첫 출발");
  const withExtraRide = [...rides, ride("extra", THIRD, { km: 50 })];
  assert.equal(riderProgress(withExtraRide).xp, progress.xp,
    "more distance or sessions on the same day must not farm XP");
  assert.equal(riderDayResult(withExtraRide, "2026-11-17").earnedXp, 55);
});

test("empty, invalid and incomplete history never creates XP or rewards", () => {
  for (const value of [null, undefined, [], {}, [ride("live", FIRST, { ended: false })]]) {
    const progress = riderProgress(value);
    assert.equal(progress.xp, 0);
    assert.equal(progress.level, 1);
    assert.equal(progress.earnedBadges, 0);
    assert.equal(progress.completedTrips, 0);
  }
  assert.equal(riderDayResult([], "bad").earnedXp, 0);
});

test("profile and recap components are read-only with accessible XP progress", () => {
  const React = { createElement: (type, props, ...children) => ({type, props: props || {}, children}) };
  const { RiderProgressCard, DayRideCard } = createGamificationUI(React);
  const history = [ride("one", FIRST)];
  const profile = RiderProgressCard({ history });
  const collect = (node, out = []) => {
    if (!node || typeof node !== "object") return out;
    out.push(node);
    for (const child of node.children || []) {
      if (Array.isArray(child)) child.forEach(n => collect(n, out));
      else collect(child, out);
    }
    return out;
  };
  const profileNodes = collect(profile);
  const xp = profileNodes.find(node => node.props.role === "progressbar");
  assert.ok(xp, "accessible level progression");
  assert.equal(xp.props["aria-valuenow"], 40);
  assert.equal(profileNodes.filter(node => node.type === "button").length, 0,
    "gamification cannot add interactive controls to active ride flow");
  const recap = DayRideCard({history, day:"2026-11-15", celebrate:true});
  assert.ok(collect(recap).some(node => node.props.className?.includes("rs-game-xp-earned")));
  assert.equal(DayRideCard({history, day:"2026-11-16"}), null);
});
