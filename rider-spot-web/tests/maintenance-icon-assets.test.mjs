import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root=new URL("../",import.meta.url);
const read=(p,enc)=>readFileSync(new URL(p,root),enc);
test("first-original Neo-Flat artwork replaces newer redraw at native 256 px per icon",()=>{
  const mod=read("src/maintenance-icons.mjs","utf8");
  const image=read("src/assets/maintenance/neo-flat-original-v197.webp");
  assert.equal(image.subarray(0,4).toString("ascii"),"RIFF");
  assert.equal(image.subarray(8,12).toString("ascii"),"WEBP");
  assert.ok(image.length>100000,"keep original rendered gloss and details");
  assert.match(mod,/neo-flat-original-v197\.webp/);
  assert.match(mod,/backgroundSize:"500% 200%"/);
  assert.doesNotMatch(mod,/import engine from|vector-v196|neo-flat-v195\.png/);
  for(const name of ["엔진오일","앞 타이어","뒤 타이어","브레이크 패드","구동벨트",
     "에어필터","배터리","점화플러그","냉각수","기타"])
    assert.ok(mod.includes('"'+name+'"'),name+" original slot");
  assert.match(read("scripts/build.mjs","utf8"),/"\.webp": "dataurl"/);
});
test("extra part remains in its dedicated dialog, without changing maintenance entry UX",()=>{
  const source=read("src/mobile-records.mjs","utf8");
  assert.match(source,/title:"기타 부품 추가"/);
  assert.match(source,/className:"record-custom-trigger"/);
  assert.doesNotMatch(source,/field\("다른 부품 직접 입력"/);
  assert.doesNotMatch(source,/className:"bike-tile-cycle-caption"/);
});
