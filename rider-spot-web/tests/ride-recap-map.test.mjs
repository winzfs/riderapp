import test from "node:test";
import assert from "node:assert/strict";
import { recapMapBounds, recapDongLabels } from "../src/ride-recap-map.mjs";
import { recapMapDimensions } from "../src/ride-recap.mjs";

test("recap map bounds come only from real GPS coordinates; never synthesize a location",()=>{
  assert.equal(recapMapBounds([]),null);
  assert.equal(recapMapBounds([[{lat:0,lng:0}]]),null);
  const gps=[[{lat:35.169,lng:126.82},{lat:35.192,lng:126.86}],[],[{lat:35.177,lng:126.83}]];
  const bounds=recapMapBounds(gps);
  assert.ok(bounds[0][0]<126.82&&bounds[0][1]<35.169);
  assert.ok(bounds[1][0]>126.86&&bounds[1][1]>35.192);
  assert.equal(recapMapBounds([[{lat:35.17,lng:126.82}]])[0].length,2);
});

test("only actual public Korean administrative names are placed on an accurate projected map",()=>{
  const names=[[126.823,35.169,"운남동","region"],[126.831,35.180,"신가동","region"],
    [126.832,35.200,"수완동","region"],[126.85,35.175,"가짜","shop"],
    [127.39,36.35,"둔산동","region"],[126.81,35.175," ","region"]];
  const bounds=[[126.78,35.15],[126.87,35.23]];
  const project=(lng,lat)=>({x:(lng-126.78)*900/.09,y:(35.23-lat)*410/.08});
  const labels=recapDongLabels(names,bounds,project,900,410);
  assert.ok(labels.some(x=>x.name==="운남동"));
  assert.ok(labels.every(x=>/동$/.test(x.name)));
  assert.ok(!labels.some(x=>x.name==="둔산동"||x.name==="가짜"));
});

test("map card sizes are the exact pixel sizes used by exported PNG",()=>{
  assert.deepEqual(recapMapDimensions("all","4:5"),{width:920,height:920});
  assert.deepEqual(recapMapDimensions("route","1:1"),{width:936,height:572});
  assert.deepEqual(recapMapDimensions("route","9:16"),{width:936,height:900});
  assert.equal(recapMapDimensions("finance","4:5"),null);
});
