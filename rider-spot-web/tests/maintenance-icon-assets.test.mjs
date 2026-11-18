import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root=new URL("../",import.meta.url);
const read=name=>readFileSync(new URL(name,root));
test("v195 maintenance icons include a real compact transparent PNG atlas",()=>{
  const png=read("src/assets/maintenance/neo-flat-v195.png");
  const mod=read("src/maintenance-icons.mjs").toString("utf8");
  assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16),250);
  assert.equal(png.readUInt32BE(20),100);
  assert.ok(png.includes(Buffer.from("tRNS")),"background remains transparent");
  assert.ok(png.length>3500&&png.length<10000,"use optimized but nonempty art");
  assert.match(mod,/neo-flat-v195\.png/);
  assert.match(mod,/backgroundSize:"500% 200%"/);
  assert.doesNotMatch(mod,/data:image\/svg\+xml/);
  for(const item of ["엔진오일","앞 타이어","뒤 타이어","브레이크 패드",
    "구동벨트","에어필터","배터리","점화플러그","냉각수","기타"])
    assert.ok(mod.includes('"'+item+'"'),item+" must have an atlas slot");
});
