import assert from "node:assert/strict";
import test from "node:test";
import { guardMaplibreLayerLifecycle } from "../src/basemap.mjs";

test("queued MapLibre transition after Leaflet teardown never accesses a null map", () => {
  const queue = [];
  const events = [];
  const L = {
    Util: { requestAnimFrame(callback, context) { queue.push(() => callback.call(context)); } },
    DomUtil: { setTransform(canvas, offset, scale) {
      events.push(["transform", canvas, offset, scale]);
    }},
  };
  const map = {
    getZoom() { return 13.5; },
    getCenter() { return [35.17, 126.83]; },
    getBounds() { return { getNorthWest() { return [35.2, 126.8]; }}; },
    latLngToContainerPoint() { return [4, 5]; },
  };
  const canvas = {};
  const gl = {
    _actualCanvas: canvas,
    once(event, callback) { events.push(event); this.done = callback; },
    jumpTo(options) { events.push(["jump", options]); },
  };
  const layer = {
    _map: map, _glMap: gl,
    _zoomEnd() { events.push("zoomEnd"); },
    _resizeContainer() { events.push("resize"); },
  };
  guardMaplibreLayerLifecycle(L, layer);
  layer._transitionEnd();
  assert.equal(queue.length, 1);
  // Leaflet removes the layer before the adapter's queued callback runs.
  layer._map = null;
  layer._glMap = null;
  assert.doesNotThrow(queue.shift());
  assert.deepEqual(events, [], "detached map is never accessed");
  layer._zoomEnd();
  assert.deepEqual(events, [], "late zoomend callback is ignored");
  // A live layer still performs its normal map transition and zoom.
  layer._map = map;
  layer._glMap = gl;
  layer._transitionEnd();
  queue.shift()();
  assert.equal(events[0], "resize");
  assert.ok(events.some((event) => Array.isArray(event) && event[0] === "jump"));
  assert.equal(events.find((event) => Array.isArray(event) && event[0] === "jump")[1].zoom, 12.5);
  gl.done();
  assert.ok(events.includes("zoomEnd"));
  // A WebGL map detached before its moveend callback must also be safe.
  layer._map = null;
  layer._glMap = null;
  assert.doesNotThrow(() => gl.done());
});

test("late vector load failure never adds raster fallback to a detached Leaflet map", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/basemap.mjs", import.meta.url), "utf8");
  assert.match(source, /function restoreOsm\(\)\s*\{[\s\S]{0,300}if \(!state\.alive \|\| !map\.getPane\?\.\("tilePane"\)\) return/);
  assert.match(source, /Never resurrect an unmounted map from a stale asynchronous error/);
});
