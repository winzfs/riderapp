import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rs33CourseToneColor } from "../src/course-layers.mjs";

const color = (tone) => {
  const value = rs33CourseToneColor(tone);
  assert.match(value, /^rgb\(\d+,\d+,\d+\)$/);
  return value.match(/\d+/g).map(Number);
};
const css = readFileSync(new URL("../src/design-system.css", import.meta.url), "utf8");
const daily = readFileSync(new URL("../src/daily-timeline.css", import.meta.url), "utf8");

test("orange departure and dark green arrival remain consistent in route and playback", () => {
  assert.deepEqual(color(0), [246, 151, 69]);
  assert.deepEqual(color(23), [3, 66, 50]);
  const halfway = color(12);
  assert.ok(halfway[1] > halfway[0] && halfway[1] > halfway[2],
    "midpoint turns sage-green before darkening");
  assert.ok(color(3)[0] > color(3)[1], "early segment remains orange");
  const all = Array.from({ length: 24 }, (_, n) => color(n));
  assert.equal(new Set(all.map(x => x.join(","))).size, 24,
    "every band has a visually distinct color");
  assert.ok(all.every(v => v.every(n => n >= 0 && n <= 255)));
  assert.deepEqual(color(-10), color(0));
  assert.deepEqual(color(100), color(23));
});

test("route legends, orange start flag and restrained accents share brand color", () => {
  for (const source of [css, daily]) {
    for (const color of ["#f69745", "#034232"]) {
      assert.ok(source.includes(color), "route endpoint missing in CSS: " + color);
    }
  }
  assert.ok(css.includes("--rs-accent-orange: #f69745"));
  assert.ok(css.includes("--rs-accent-blue: #216db3"));
  assert.ok(css.includes(".rs-course-start-pin .rs-start-flag"));
  assert.ok(css.includes(".rs56-day-badge"));
  assert.ok(css.includes(".rc-community .rc-head .rc-write"));
  assert.ok(css.includes("#rs-tools .rs33-work-quick:not(.rs33-work-utilities)"));
  assert.ok(css.includes(".rs-profile-page .rs-metrics"));
});

test("orange and blue accent text remain legible on their light backgrounds", () => {
  const luminance = (hex) => {
    const components = hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255);
    const channels = components.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const contrast = (fg, bg) => {
    const a = luminance(fg), b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  assert.ok(contrast("#914310", "#fff1e1") >= 4.5);
  assert.ok(contrast("#216db3", "#eaf3fc") >= 4.5);
});
