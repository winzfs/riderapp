import assert from "node:assert/strict";
import test from "node:test";
import { addKoreanPoiNameLayers, KOREAN_POI_TIERS } from "../src/korean-map-labels.mjs";
import { hideBasemapPoiLabels } from "../src/basemap.mjs";

test("Korean POI labels are nationwide, text-only and zoom-controlled", () => {
  const layers = [];
  const gl = {
    getStyle: () => ({ sources: { openmaptiles: {} }, layers }),
    getLayer: (id) => layers.find((layer) => layer.id === id),
    addLayer: (layer) => layers.push(layer),
  };
  assert.equal(addKoreanPoiNameLayers(gl), 3);
  assert.equal(addKoreanPoiNameLayers(gl), 0, "a repeated style check does not duplicate layers");
  assert.deepEqual(layers.map((x) => x.id), KOREAN_POI_TIERS.map((x) => x.id));
  for (const layer of layers) {
    assert.equal(layer.type, "symbol");
    assert.equal(layer.source, "openmaptiles");
    assert.equal(layer["source-layer"], "poi");
    assert.equal(layer.layout["text-allow-overlap"], false);
    assert.equal(layer.layout["text-ignore-placement"], false);
    assert.equal(layer.layout["icon-image"], undefined, "no new POI icons");
    assert.equal(layer.layout["text-field"][1][1], "name:ko");
    assert.ok(layer.minzoom >= 13.7);
  }
  assert.ok(layers[2].minzoom > layers[0].minzoom);
  assert.ok(layers[2].filter[2][2].includes("shop"));
});

test("the original POI symbols remain hidden, our text-only layers stay visible", () => {
  const hidden = [];
  const layers = [
    { id: "poi_label", "source-layer": "poi" },
    { id: "rs-poi-shelter", "source-layer": "poi" },
    { id: "rs-korean-business-names", "source-layer": "poi" },
    { id: "road_names", "source-layer": "transportation_name" },
  ];
  hideBasemapPoiLabels({
    getStyle: () => ({ layers }),
    setLayoutProperty: (id, key, value) => hidden.push([id, key, value]),
  });
  assert.deepEqual(hidden, [
    ["poi_label", "visibility", "none"],
    ["rs-poi-shelter", "visibility", "none"],
  ]);
});

test("the legacy raster fallback does not attempt to add vector labels", () => {
  assert.equal(addKoreanPoiNameLayers({
    getStyle: () => ({ sources: {} }),
    addLayer: () => assert.fail("no vector source"),
  }), 0);
});
