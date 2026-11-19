import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const application=readFileSync(new URL("../src/application.mjs",import.meta.url),"utf8");
const weather=readFileSync(new URL("../src/weather-bar.js",import.meta.url),"utf8");
test("the weather HUD mounts in an explicit React-owned extension slot",()=>{
  const mapBar=application.slice(application.indexOf("  function MapBar("),application.indexOf("  function rs33OpenMap("));
  assert.match(mapBar,/rs33J\("div", \{ className: "rs-weather-slot" \}\)/);
  assert.match(weather,/querySelector\("\.nearby\.nearby-full \.rs-weather-slot"\)/);
  assert.doesNotMatch(weather,/querySelector\("\.nearby\.nearby-full \.rs33-map-bar"\)/);
});
test("weather requests cannot overlap and have a finite deadline",()=>{
  assert.match(weather,/if \(pending\) return;/);
  assert.match(weather,/new AbortController\(\)/);
  assert.match(weather,/abort\.abort\(\), 10000/);
  assert.match(weather,/clearTimeout\(timeout\)/);
});
test("routine map-marker ticks don't refetch weather",()=>{
  assert.match(weather,/window\.addEventListener\("riderspot:map", \(\) => \{ if \(!document\.hidden\) paint\(\); \}\)/);
});
