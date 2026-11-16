import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { addBasemap } from "../src/basemap.mjs";

test("Android WebView always receives light raster tiles without creating a MapLibre renderer", () => {
  const previously = globalThis.window;
  const tiles = [];
  const marks = [];
  const wrap = {
    dataset: {},
    classList: { add(...args) { marks.push(["add", ...args]); },
      remove(...args) { marks.push(["remove", ...args]); },
      toggle(...args) { marks.push(["toggle", ...args]); } },
  };
  const layer = {
    addTo() { tiles.push("add"); return this; },
  };
  const L = {
    tileLayer(url, options) {
      assert.equal(url, "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
      assert.equal(options.maxZoom, 19);
      assert.equal(options.className, "rs57-native-light-tiles");
      return layer;
    },
  };
  const map = { getContainer() { return { closest() { return wrap; } }; } };
  try {
    globalThis.window = { __rsNativeInstalled: true };
    const cleanup = addBasemap(L, map);
    assert.equal(wrap.dataset.rsBase, "simple-raster");
    assert.deepEqual(tiles, ["add"]);
    assert.ok(!globalThis.window.maplibregl, "native must not load GPU-based renderer");
    cleanup();
  } finally {
    globalThis.window = previously;
  }
});

test("light style is applied to its own raster layer rather than course overlays", () => {
  const css = readFileSync(new URL("../src/native-light-map.css", import.meta.url), "utf8");
  assert.match(css, /\.leaflet-layer\.rs57-native-light-tiles/);
  assert.match(css, /grayscale\(/);
  assert.doesNotMatch(css, /leaflet-overlay-pane|rs33-course-map\s*\{/);
});
