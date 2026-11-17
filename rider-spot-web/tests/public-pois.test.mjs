import assert from "node:assert/strict";
import test from "node:test";
import { createPublicPoiOverlay } from "../src/public-pois-overlay.mjs";

function fixture(zoom = 16) {
  const calls = { mounted: 0, removed: 0, cleared: 0, reads: 0, writes: 0 };
  const group = {
    addTo() { calls.mounted++; return this; },
    clearLayers() { calls.cleared++; },
    remove() { calls.removed++; },
  };
  const L = { layerGroup: () => group };
  const map = {
    getZoom: () => zoom,
    getBounds: () => ({ getSouth: () => 35.11, getNorth: () => 35.23,
      getWest: () => 126.72, getEast: () => 126.87 }),
    getContainer: () => null,
  };
  const conditions = [];
  const query = {
    select(columns) { conditions.push(["select", columns]); return this; },
    eq(...args) { conditions.push(["eq", ...args]); return this; },
    gte(...args) { conditions.push(["gte", ...args]); return this; },
    lte(...args) { conditions.push(["lte", ...args]); return this; },
    order(...args) { conditions.push(["order", ...args]); return this; },
    limit(...args) { conditions.push(["limit", ...args]); return this; },
    then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
  };
  const client = {
    from(table) {
      calls.reads++;
      assert.equal(table, "public_pois");
      return query;
    },
  };
  return { calls, L, map, client, conditions };
}

test("no external OSM queries or map remounts; only bounded Supabase reads", async () => {
  const mock = fixture();
  const overlay = createPublicPoiOverlay(() => {});
  await overlay.refresh({ ...mock, filter: "places" });
  await overlay.refresh({ ...mock, filter: "shelters" });
  assert.equal(mock.calls.mounted, 1, "one independent map layer only");
  assert.equal(mock.calls.reads, 2);
  assert.equal(mock.calls.writes, 0);
  assert.ok(mock.conditions.some((e) => e[0] === "eq" && e[1] === "active" && e[2] === true));
  assert.ok(mock.conditions.some((e) => e[0] === "gte" && e[1] === "lat"));
  assert.ok(mock.conditions.some((e) => e[0] === "lte" && e[1] === "lng"));
  assert.ok(mock.conditions.some((e) => e[0] === "limit" && e[1] === 260));
});

test("road reports, riders and low-zoom maps never query the POI database", async () => {
  for (const filter of ["roads", "riders", "shops"]) {
    const mock = fixture();
    await createPublicPoiOverlay(() => {}).refresh({ ...mock, filter });
    assert.equal(mock.calls.reads, 0, "unexpected public query in " + filter);
  }
  const lowZoom = fixture(12);
  await createPublicPoiOverlay(() => {}).refresh({ ...lowZoom, filter: "places" });
  assert.equal(lowZoom.calls.reads, 0, "small-scale map should not render hundreds of pins");
});
