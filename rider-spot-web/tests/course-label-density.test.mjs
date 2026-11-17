import test from "node:test";
import assert from "node:assert/strict";
import { layoutCourseStamps } from "../src/course-layers.mjs";
const base=Date.parse("2026-11-17T00:00:00Z");
const hours=Array.from({length:7},(_,i)=>({
  kind:"hour",time:base+i*3600000,lat:35.17,lng:126.83,label:"정각"
}));
const stops=Array.from({length:43},(_,i)=>({
  kind:"stop",time:base+i*10000,
  lat:35.16+i*0.000002,lng:126.82+i*0.000002,label:"정차"
}));
const markers=[{kind:"start",time:base,lat:35.15,lng:126.81},...hours,...stops,
  {kind:"end",time:base+8*3600000,lat:35.18,lng:126.84}];
const projected=s=>({x:192+(s.lat-35.16)*15,y:160+(s.lng-126.82)*15});

test("all recorded hours and all individual stops remain visible at city-scale zoom",()=>{
  for(const zoom of [10.5,11,11.5,12,14]){
    const items=layoutCourseStamps(markers,zoom,390,480,projected);
    assert.equal(items.filter(x=>x.kind==="hour").length,7);
    assert.equal(items.filter(x=>x.kind==="stop").length,43);
    assert.equal(items.filter(x=>x.kind==="start").length,1);
    assert.equal(items.filter(x=>x.kind==="end").length,1);
  }
});

test("zooming beyond city scale only groups stops by map-cell counts",()=>{
  const items=layoutCourseStamps(markers,9.5,390,480,projected);
  assert.equal(items.filter(x=>x.kind==="hour").length,7,"KST hours are never clustered");
  assert.equal(items.filter(x=>x.kind==="stop").length,1);
  assert.equal(items.find(x=>x.kind==="stop").count,43);
  assert.equal(items.filter(x=>x.kind==="start").length,1);
  assert.equal(items.filter(x=>x.kind==="end").length,1);
});

test("map viewport projection never writes to original GPS markers",()=>{
  const original=JSON.stringify(markers);
  assert.equal(layoutCourseStamps(markers,7,390,480,()=>({x:-999,y:-999})).length,0);
  assert.equal(JSON.stringify(markers),original);
});
