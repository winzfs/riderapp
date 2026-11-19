import assert from "node:assert/strict";
import { test } from "node:test";
import { createMapController } from "../src/map-controller.mjs";

function fixture() {
  const saved = new Map();
  const listeners = new Map();
  const center = { lat: 35.12, lng: 126.82 };
  const map = {
    center: { ...center },
    zoom: 12,
    fits: [],
    setView(coords, zoom) {
      this.center = Array.isArray(coords)
        ? { lat: coords[0], lng: coords[1] }
        : { lat: coords.lat, lng: coords.lng };
      this.zoom = zoom;
      return this;
    },
    getCenter() { return this.center; },
    getZoom() { return this.zoom; },
    fitBounds(bounds, options) {
      this.fits.push({ bounds, options });
      this.setView([bounds[0][0] + 0.01, bounds[0][1] + 0.01], 11);
      return this;
    },
    on() { return this; },
    off() { return this; },
    invalidateSize() {},
    remove() {},
  };
  const node = {
    clientWidth: 390, clientHeight: 500,
    addEventListener(name, cb) { listeners.set(name, cb); },
    removeEventListener(name) { listeners.delete(name); },
  };
  const storage = {
    getItem(key) { return saved.get(key) ?? null; },
    setItem(key, value) { saved.set(key, value); },
  };
  const original = {
    window: globalThis.window, document: globalThis.document,
    sessionStorage: globalThis.sessionStorage, localStorage: globalThis.localStorage,
    ResizeObserver: globalThis.ResizeObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  globalThis.sessionStorage = storage;
  globalThis.localStorage = storage;
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  return {
    map, node, saved, listeners,
    L: { map() { return map; } },
    restore() {
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      }
    },
  };
}

test("new app launch focuses first GPS fix despite a saved main camera, but never keeps following", () => {
  const f = fixture();
  try {
    f.saved.set("rs:map-main-camera-v52", JSON.stringify({ lat: 35.1, lng: 126.7, zoom: 9 }));
    const controller = createMapController(f.L, f.node, "main", [35.17, 126.83]);
    assert.equal(f.map.zoom, 9, "saved camera remains a temporary fallback until GPS");
    controller.initialLocation({ lat: 35.182, lng: 126.816 });
    assert.deepEqual(f.map.center, { lat: 35.182, lng: 126.816 });
    assert.equal(f.map.zoom, 16);
    controller.initialLocation({ lat: 35.19, lng: 126.84 });
    assert.equal(f.map.center.lat, 35.182, "later GPS fixes do not move the map");
    controller.destroy();
    const second = createMapController(f.L, f.node, "main", [35.17, 126.83]);
    second.initialLocation({ lat: 35.195, lng: 126.86 });
    assert.equal(f.map.center.lat, 35.182, "switching tabs in the same page does not refocus");
    second.destroy();
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    const reopened = createMapController(f.L, f.node, "main", [35.17, 126.83]);
    reopened.initialLocation({ lat: 35.195, lng: 126.86 });
    assert.equal(f.map.center.lat, 35.195, "a new app page refocuses on current GPS");
    reopened.destroy();
  } finally {
    f.restore();
  }
});

test("manual gesture before GPS never triggers an unexpected jump", () => {
  const f = fixture();
  try {
    f.saved.set("rs:map-main-camera-v52", JSON.stringify({ lat: 35.1, lng: 126.7, zoom: 9 }));
    const controller = createMapController(f.L, f.node, "main", [35.17, 126.83]);
    f.listeners.get("pointerdown")();
    controller.initialLocation({ lat: 35.18, lng: 126.82 });
    assert.deepEqual(f.map.center, { lat: 35.1, lng: 126.7 });
    controller.moveTo({ lat: 35.185, lng: 126.83 }, 16);
    assert.equal(f.map.center.lat, 35.185, "explicit locate still works");
    controller.destroy();
  } finally {
    f.restore();
  }
});

test("Timeline's first bounds fit overrides stale saved zoom, without repeated automatic refits", () => {
  const f = fixture();
  try {
    f.saved.set("rs:map-camera:day-1", JSON.stringify({ lat: 35.1, lng: 126.7, zoom: 19 }));
    const controller = createMapController(f.L, f.node, "day-1", [35.17, 126.83]);
    const bounds = [[35.1, 126.7], [35.25, 126.92]];
    controller.showBounds(bounds);
    assert.equal(f.map.fits.length, 1, "the whole route is fitted even with persisted camera");
    assert.deepEqual(f.map.fits[0].options.padding, [45, 66]);
    controller.showBounds([[35, 126.6], [35.4, 127]]);
    assert.equal(f.map.fits.length, 1, "later analysis/GPS changes do not reset zoom");
    controller.showBounds(bounds, true);
    assert.equal(f.map.fits.length, 2, "the existing full-route button still works");
    controller.destroy();
  } finally {
    f.restore();
  }
});
