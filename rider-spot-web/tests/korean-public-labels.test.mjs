import assert from "node:assert/strict";
import test from "node:test";
import { ensurePublicKoreanLayers, mountPublicKoreanLabels, visibleTileKeys } from "../src/korean-public-labels.mjs";

test("public map data is clipped to visible Gwangju tiles", () => {
  const info = { bbox: [126.68, 34.98, 127.13, 35.36], size: 0.04, tiles: ["t3170-879", "t3171-879"] };
  assert.deepEqual(visibleTileKeys(info, [126.82, 35.16, 126.87, 35.18]), ["t3170-879", "t3171-879"]);
  assert.deepEqual(visibleTileKeys(info, [127.8, 36, 128, 36.2]), []);
});

test("public regional, apartment, building and store labels have no facility icons", () => {
  const layers = [];
  const sources = new Map();
  const gl = {
    getStyle: () => ({ sources: {} }),
    getSource: (id) => sources.get(id),
    addSource: (id, data) => sources.set(id, data),
    getLayer: (id) => layers.find(x => x.id === id),
    addLayer: x => layers.push(x),
  };
  assert.equal(ensurePublicKoreanLayers(gl), true);
  assert.equal(ensurePublicKoreanLayers(gl), true);
  assert.equal(sources.size, 1);
  assert.equal(layers.length, 4);
  for (const layer of layers) {
    assert.equal(layer.type, "symbol");
    assert.equal(layer.layout["icon-image"], undefined);
    assert.equal(layer.layout["text-allow-overlap"], false);
  }
  assert.ok(layers.find(x => x.id === "rs-public-shop-label").minzoom >= 16);
  assert.ok(layers.find(x => x.id === "rs-public-region-label").minzoom <= 10);
});

test("public Korean labels load on demand and do not keep callbacks after teardown", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [], events = new Map(), layers = [], sources = new Map(), updates = [];
  const manifest = {
    schema: 1, bbox: [126.68, 34.98, 127.13, 35.36],
    size: 0.04, tiles: ["t3170-879"], counts: { shop: 1 }
  };
  globalThis.fetch = async url => {
    requested.push(url);
    const content = String(url).endsWith("manifest.json") ? manifest
      : String(url).endsWith("admin.json") ? [[126.84, 35.17, "운남동", "region"]]
      : [[126.84, 35.17, "테스트가게", "shop"], [126.84, 35.17, "테스트아파트", "apartment"]];
    return { ok: true, async json() { return content; } };
  };
  const gl = {
    getStyle: () => ({ sources: {} }),
    getSource: id => sources.get(id),
    addSource(id) { sources.set(id, { setData(data) { updates.push(data); } }); },
    getLayer: id => layers.find(x => x.id === id),
    addLayer: layer => layers.push(layer),
    getZoom: () => 16.5,
    getBounds: () => ({ getWest: () => 126.82, getSouth: () => 35.16, getEast: () => 126.87, getNorth: () => 35.18 }),
    isStyleLoaded: () => true,
    on: (name, callback) => events.set(name, callback),
    off: (name) => events.delete(name),
  };
  try {
    const cleanup = mountPublicKoreanLabels(gl);
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.ok(requested.some(url => url.endsWith("manifest.json")));
    assert.ok(requested.some(url => url.endsWith("t3170-879.json")));
    assert.ok(updates.some(data => data.features?.some(feature => feature.properties.name === "테스트가게")));
    assert.equal(layers.filter(x => x.id === "rs-public-shop-label").length, 1);
    cleanup();
    assert.equal(events.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
