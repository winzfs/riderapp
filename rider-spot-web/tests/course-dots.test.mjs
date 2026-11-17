import assert from "node:assert/strict";
import test from "node:test";
import { rs33DrawCourse } from "../src/course-layers.mjs";
import { routeGeometry, ROUTE_GRADIENT_STEPS } from "../src/route-analysis.mjs";

test("isolated GPS fixes do not appear as orange dots; route and revisit layers remain", () => {
  const layers = [];
  let detached = false;
  const L = {
    layerGroup() {
      return {
        addTo() { return this; },
        remove() { detached = true; },
      };
    },
    polyline(coords, style) {
      return {
        addTo() {
          layers.push({ coords, color: style.color, weight: style.weight });
          return this;
        },
      };
    },
  };
  const geometry = routeGeometry([
    [{ lat: 35.1701, lng: 126.8101 }],
    [{ lat: 35.1702, lng: 126.8102 }, { lat: 35.1703, lng: 126.8103 }],
    [{ lat: 35.1704, lng: 126.8104 }],
  ], [
    {
      group: 0,
      index: 0,
      count: 2,
      from: { lat: 35.1702, lng: 126.8102 },
      to: { lat: 35.1703, lng: 126.8103 },
    },
  ]);
  assert.equal(geometry.dots.length, 2, "original isolated fix data is retained");
  const before = JSON.stringify(geometry);
  const dispose = rs33DrawCourse(L, {}, geometry);

  assert.equal(JSON.stringify(geometry), before, "rendering must not modify GPS geometry");
  assert.ok(layers.some((layer) => layer.color.startsWith("rgb(")), "gradient remains");
  assert.ok(layers.some((layer) => layer.color === "#95a5a0"), "neutral revisit highlight remains distinct from orange departure");
  assert.ok(
    layers.every((layer) => layer.color !== "#178f78"),
    "isolated-point green-orange circles should be absent",
  );
  assert.ok(
    layers.every((layer) =>
      !(
        layer.coords.length === 2 &&
        layer.coords.every((entry) => Array.isArray(entry) && entry.length === 2 &&
          entry[0] === entry[1])
      )
    ),
    "no zero-length dot segments should be drawn",
  );
  dispose();
  assert.equal(detached, true);
});


test("route progress colors begin orange, transition through sage and end deep green", () => {
  const colors = [];
  const L = {
    layerGroup() { return { addTo() { return this; }, remove() {} }; },
    polyline(coords, style) {
      return { addTo() {
        if (style.color.startsWith("rgb(")) colors.push(style.color);
        return this;
      }};
    },
  };
  const geometry = routeGeometry([[
    {lat:35.17,lng:126.81}, {lat:35.19,lng:126.83},
  ]]);
  const before = JSON.stringify(geometry);
  const release = rs33DrawCourse(L, {}, geometry);
  assert.equal(colors.length, ROUTE_GRADIENT_STEPS, "all route progress tones are displayed");
  assert.equal(colors[0], "rgb(246,151,69)", "start is warm orange");
  assert.equal(colors.at(-1), "rgb(3,66,50)", "finish is deep green");
  assert.ok(colors.some((color) => {
    const [r, g, b] = color.match(/\d+/g).map(Number);
    return g > r && g > b && r > 60;
  }), "middle section includes a visibly green transition");
  const brightness = (color) => color.match(/\d+/g).map(Number).reduce((sum, channel) => sum + channel, 0);
  assert.ok(brightness(colors[0]) - brightness(colors.at(-1)) > 260,
    "start/end have a clear color contrast");
  assert.equal(JSON.stringify(geometry), before, "recoloring must not modify route geometry");
  release();
});
