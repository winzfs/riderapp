import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCourse, rs43CleanPaths, ROUTE_GRADIENT_STEPS } from "../src/route-analysis.mjs";
import { createTripStorage } from "../src/trip-storage.mjs";
import { mergeTripPoints, readStoppedTrip } from "../src/native-trip.mjs";
import fixtures from "./fixtures.cjs";
const { sampleTrip, tripId, userId } = fixtures;

for (const count of [100, 1000, 5000, 15000]) {
  test(`Route analysis retains GPS originals and events for ${count} points`, () => {
    const trip = sampleTrip(count);
    const snapshot = JSON.stringify(trip);
    const result = analyzeCourse(trip.points, trip.events);
    assert.equal(JSON.stringify(trip), snapshot);
    assert.ok(result.bounds[1][0] > result.bounds[0][0]);
    assert.equal(result.gapCount, Math.floor((count - 1) / 480));
    assert.equal(
      result.stamps.filter((p) => p.kind === "stop").length,
      trip.events.length,
    );
    assert.equal(
      result.geometry.gradient.filter((parts) => parts.length).length,
      ROUTE_GRADIENT_STEPS,
    );
    if (count > 1000)
      assert.ok(result.geometry.railRuns.slice(2).flat().length > 0);
    assert.equal(result.batches === null, count > 350);
  });
}

test("Dense short stop clusters complete and preserve endpoints", () => {
  const points = Array.from({ length: 15000 }, (_, i) => ({
    lat: 35.17,
    lng: 126.82 + i / 1e11,
    time: Date.now() + i,
  }));
  const clean = rs43CleanPaths([points]);
  assert.equal(clean.length, 1);
  assert.deepEqual(clean[0][0], points[0]);
  assert.ok(clean[0].length < 10);
});

test("SQLite merge keeps all 15,000 samples, explicit gaps and events", async () => {
  const sample = sampleTrip(15000, { active: true });
  const stop = "2026-11-16T07:00:00Z";
  const state = { activeId: tripId };
  const calls = [];
  const bridge = {
    call: async (action) => {
      calls.push(action);
      if (action === "stop") {
        state.activeId = null;
        state.lastStoppedId = tripId;
      }
      return state;
    },
    allPoints: async (id) => {
      assert.equal(id, tripId);
      calls.push("points");
      return sample.points.map((point, i) => ({ ...point, seq: i + 1 }));
    },
  };
  const record = { ...sample, points: [sample.points[480]] };
  const finished = await readStoppedTrip(bridge, record, stop);
  assert.deepEqual(calls, ["state", "stop", "state", "points"]);
  assert.equal(finished.ended_at, stop);
  assert.equal(finished.points.length, 15000);
  assert.equal(finished.points[480].break, true);
  assert.ok(!Object.hasOwn(finished.points[0], "seq"));
  assert.equal(finished.events.filter((e) => e.type === "운행 종료").length, 1);
  assert.equal(finished.events.length, sample.events.length + 1);
  assert.equal(record.points.length, 1);
});

test("A different active SQLite session cannot be stopped or associated with this trip", async () => {
  const trip = sampleTrip(100, { active: true });
  await assert.rejects(
    readStoppedTrip(
      {
        call: async (action) => {
          assert.equal(action, "state");
          return { activeId: "other-trip", lastStoppedId: tripId };
        },
        allPoints: () => assert.fail("Unexpected read"),
      },
      trip,
      new Date().toISOString(),
    ),
  );
});

test("SQLite read failure and retry leave the original record intact", async () => {
  const trip = sampleTrip(100, { active: true });
  const bridge = {
    call: async () => ({ lastStoppedId: tripId }),
    allPoints: async () => {
      throw Error("read failed");
    },
  };
  const before = JSON.stringify(trip);
  await assert.rejects(
    readStoppedTrip(bridge, trip, new Date().toISOString()),
    /read failed/,
  );
  assert.equal(JSON.stringify(trip), before);
  bridge.allPoints = async () => trip.points;
  assert.equal(
    (await readStoppedTrip(bridge, trip, new Date().toISOString())).points
      .length,
    100,
  );
});

test("Offline completion persists and retries after app restart without duplicate uploads or lost records", async () => {
  const saved = new Map();
  const sent = [];
  let online = false;
  let fail = true;
  const adapter = {
    read: (key, fallback) =>
      saved.has(key) ? JSON.parse(saved.get(key)) : fallback,
    write: (key, value) => saved.set(key, JSON.stringify(value)),
    isOnline: () => online,
    upload: async (row) => {
      if (fail) throw Error("network error");
      sent.push(row);
    },
  };
  const first = createTripStorage(adapter);
  const trip = { ...sampleTrip(1000), user_id: userId };
  const unrelated = {
    ...sampleTrip(100, { id: "different" }),
    user_id: userId,
  };
  first.commit(userId, unrelated);
  first.commit(userId, trip);
  first.enqueue(userId, trip.id);
  first.enqueue(userId, trip.id);
  assert.equal(await first.sync(userId, trip.id, () => true), false);
  online = true;
  const recovered = createTripStorage(adapter);
  await assert.rejects(
    recovered.sync(userId, trip.id, () => true),
    /network error/,
  );
  assert.equal(recovered.getHistory(userId).length, 2);
  assert.deepEqual(recovered.pending(userId), [trip.id]);
  assert.equal(await recovered.sync(userId, trip.id, () => false), false);
  fail = false;
  await Promise.all([
    recovered.sync(userId, trip.id, () => true),
    recovered.sync(userId, trip.id, () => true),
  ]);
  assert.deepEqual(sent, [trip]);
  assert.deepEqual(recovered.pending(userId), []);
  assert.throws(() => recovered.commit(userId, { ...trip, ended_at: null }));
  assert.throws(() => recovered.commit("different-user", trip));
});

test("A newer queued memo survives an older request completing", async () => {
  const values = new Map();
  const received = [];
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const storage = createTripStorage({
    read: (key, fallback) => values.get(key) ?? fallback,
    write: (key, value) => values.set(key, structuredClone(value)),
    upload: async (record) => {
      received.push(record);
      if (received.length === 1) await barrier;
    },
  });
  const trip = { ...sampleTrip(100), user_id: userId };
  storage.commit(userId, trip);
  storage.enqueue(userId, trip.id);
  const pending = storage.sync(userId, trip.id, () => true);
  await Promise.resolve();
  storage.commit(userId, { ...trip, memo: "new" });
  storage.enqueue(userId, trip.id);
  release();
  await pending;
  assert.deepEqual(
    received.map((row) => row.memo),
    [trip.memo, "new"],
  );
  assert.deepEqual(storage.pending(userId), []);
  assert.equal(
    mergeTripPoints(trip.points, trip.points).length,
    trip.points.length,
  );
});
