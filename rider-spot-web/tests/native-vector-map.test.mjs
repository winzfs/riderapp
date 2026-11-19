import assert from "node:assert/strict";
import test from "node:test";
import { addBasemap, hideBasemapPoiLabels } from "../src/basemap.mjs";

test("the installed Android WebView uses the actual OpenFreeMap Positron vector map", async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const loads = [];
  const wrap = {
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
  };
  const leaflet = {
    maplibreGL(options) {
      assert.equal(options.style, "https://tiles.openfreemap.org/styles/positron");
      assert.equal(options.interactive, false);
      loads.push("vector-layer");
      return vectorLayer;
    },
    tileLayer(url, options) {
      assert.equal(url, "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
      assert.equal(options.className, undefined);
      return rasterLayer;
    },
  };
  let rasterMounted = false;
  const rasterLayer = {
    addTo() {
      rasterMounted = true;
      return this;
    },
  };
  const gl = {
    getStyle() { return { sources: {} }; },
    on() {},
    once(name, callback) {
      if (name === "load" || name === "idle") queueMicrotask(callback);
    },
    remove() {},
  };
  const vectorLayer = {
    addTo() {
      loads.push("vector-attached");
      return this;
    },
    getMaplibreMap() { return gl; },
    onRemove() {},
  };
  const node = { dataset: {}, closest() { return wrap; } };
  const map = {
    getContainer() { return node; },
    hasLayer(layer) { return layer === rasterLayer && rasterMounted; },
    removeLayer(layer) {
      if (layer === rasterLayer) rasterMounted = false;
    },
    attributionControl: { addAttribution() {}, removeAttribution() {} },
  };
  globalThis.window = { __rsNativeInstalled: true, maplibregl: {} };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "script");
      return { onload: null, onerror: null };
    },
    head: {
      append(script) {
        loads.push(script.src);
        queueMicrotask(() => script.onload());
      },
    },
  };
  try {
    const cleanup = addBasemap(leaflet, map);
    assert.equal(rasterMounted, false, "initial render must not request old OSM tiles");
    assert.equal(wrap.dataset.rsBase, "simple");
    assert.equal(node.dataset.rsBasemap, "loading");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.ok(loads.includes("vector-layer"));
    assert.ok(loads.includes("vector-attached"));
    assert.equal(wrap.dataset.rsBase, "simple");
    assert.equal(node.dataset.rsBasemap, "positron");
    assert.equal(rasterMounted, false, "vector map replaces old raster tiles on load");
    cleanup();
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test("WebView does not need a grayscale raster filter to approximate a modern map", async () => {
  const { readFileSync } = await import("node:fs");
  const build = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/basemap.mjs", import.meta.url), "utf8");
  assert.ok(source.includes('mode: "simple"'));
  assert.ok(source.includes("https://tiles.openfreemap.org/styles/positron"));
  assert.doesNotMatch(source, /simple-raster|rs57-native-light-tiles/);
  assert.doesNotMatch(build, /native-light-map\.css/);
  assert.match(build, /rel="preload" as="script"/);
  assert.match(build, /tiles\.openfreemap\.org/);
});


test("basemap suppresses every POI category while keeping geographic labels", () => {
  const changes = [];
  const gl = {
    getStyle: () => ({ layers: [
      { id: "poi_label", type: "symbol", "source-layer": "poi" },
      { id: "rs-poi-major", type: "symbol", "source-layer": "poi" },
      { id: "poi_points", type: "circle", "source-layer": "poi" },
      { id: "poi-shelter", type: "symbol" },
      { id: "city_names", type: "symbol", "source-layer": "place" },
      { id: "road_names", type: "symbol", "source-layer": "transportation_name" },
    ] }),
    setLayoutProperty: (...args) => changes.push(args),
  };
  hideBasemapPoiLabels(gl);
  assert.deepEqual(changes, [
    ["poi_label", "visibility", "none"],
    ["rs-poi-major", "visibility", "none"],
    ["poi_points", "visibility", "none"],
    ["poi-shelter", "visibility", "none"],
  ]);
});
