import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const root=new URL("../",import.meta.url);
const png=readFileSync(fileURLToPath(new URL("src/assets/maintenance/angular-parts-v3.png",root)));
const mod=readFileSync(fileURLToPath(new URL("src/maintenance-icons.mjs",root)),"utf8");
test("angular maintenance icons use one transparent 5x2 PNG atlas",()=>{
 assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
 assert.equal(png.readUInt32BE(16),400);
 assert.equal(png.readUInt32BE(20),160);
 assert.equal(png[25],3);
 assert.ok(png.includes(Buffer.from("tRNS")),"transparent background");
 assert.ok(png.length<14000,"keep atlas compact");
 assert.ok(png.length>6000,"ensure generated icon art is present");
});
test("ten icon slots and sprite layout stay compatible",()=>{
 assert.match(mod,/angular-parts-v3\.png/);
 assert.match(mod,/backgroundSize:"500% 200%"/);
 for(const name of ["엔진오일","앞 타이어","뒤 타이어","브레이크 패드","구동벨트","에어필터","배터리","점화플러그","냉각수","기타"])
  assert.ok(mod.includes(name),name);
});
