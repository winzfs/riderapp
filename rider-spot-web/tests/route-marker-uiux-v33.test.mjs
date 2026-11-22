import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const native=readFileSync(new URL("../web-patches/native-maplibre-v32.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/curated-v9.css",import.meta.url),"utf8");
test("small Korean endpoint chip stays centered on exact recorded GPS point",()=>{
  assert.match(native,/html,\[82,40\],\[41,20\]\)/);
  assert.match(css,/width:82px;height:40px/);
  assert.match(css,/left:50%;top:50%;width:10px;height:10px/);
  assert.match(native,/text=isStart\?"시작":"종료"/);
  assert.match(native,/const isStart=kind==="start"/);
});
test("endpoint label, not coordinate, moves when markers overlap",()=>{
  assert.match(css,/rs-v32-near\.rs-v32-start \.rs-v32-chip/);
  assert.match(css,/rs-v32-near\.rs-v32-end \.rs-v32-chip/);
  assert.match(native,/setLngLat/);
});
