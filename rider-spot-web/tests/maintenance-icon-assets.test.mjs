import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root=new URL("../",import.meta.url);
const read=name=>readFileSync(new URL(name,root),"utf8");
test("v196 maintenance icons are scalable SVG assets rather than enlarged sprite cells",()=>{
  const mod=read("src/maintenance-icons.mjs");
  assert.match(mod,/cache\.set\(part,assets\[part\]\)/);
  assert.doesNotMatch(mod,/neo-flat-v195\.png|500% 200%/);
  for(const [name,file] of [
    ["엔진오일","engine-oil"],["앞 타이어","front-tire"],["뒤 타이어","rear-tire"],
    ["브레이크 패드","brake-pad"],["구동벨트","drive-belt"],["에어필터","air-filter"],
    ["배터리","battery"],["점화플러그","spark-plug"],["냉각수","coolant"],["기타","other"]]){
    assert.ok(mod.includes('"'+name+'"'),name+" must have its vector source");
    const asset=read("src/assets/maintenance/"+file+".svg");
    assert.match(asset,/<svg[\s>]/);
    assert.match(asset,/viewBox=/);
  }
});
test("the service form keeps extra parts behind a dedicated dialog",()=>{
  const source=read("src/mobile-records.mjs");
  assert.match(source,/title:"기타 부품 추가"/);
  assert.match(source,/className:"record-custom-trigger"/);
  assert.doesNotMatch(source,/field\("다른 부품 직접 입력"/);
  assert.doesNotMatch(source,/className:"bike-tile-cycle-caption"/);
});
