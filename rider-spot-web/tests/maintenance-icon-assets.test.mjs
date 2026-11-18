import test from "node:test";
import assert from "node:assert/strict";
import {maintenanceIcon,maintenanceIconSources} from "../src/maintenance-icons.mjs";
test("ten unique compact faceted vector maintenance symbols use SVG data URLs",()=>{
 const all=Object.keys(maintenanceIconSources);
 assert.equal(all.length,10);
 const art=new Set();
 for(const part of all){
   const style=maintenanceIcon(part);
   assert.equal(style.backgroundSize,"contain");
   const encoded=style.backgroundImage.match(/data:image\/svg\+xml,([^"]+)/)?.[1];
   assert.ok(encoded,part+" missing SVG");
   const markup=decodeURIComponent(encoded);
   assert.match(markup,/viewBox="0 0 64 64"/);
   assert.match(markup,/<linearGradient/);
   assert.ok(markup.length<2000,"avoid over-detailed icons");
   art.add(markup);
 }
 assert.equal(art.size,10);
});
test("custom maintenance items fall back safely and tire aliases match",()=>{
 assert.deepEqual(maintenanceIcon("체인"),maintenanceIcon("기타"));
 assert.deepEqual(maintenanceIcon("프론트 타이어"),maintenanceIcon("앞 타이어"));
});
