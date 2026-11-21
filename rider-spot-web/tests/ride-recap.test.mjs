import test from "node:test";
import assert from "node:assert/strict";
import {recapRouteSegments,buildRecapSnapshot,fetchRecapFinance,renderRecapCanvas} from "../src/ride-recap.mjs";

const point=(lat,lng,t,extra={})=>({lat,lng,t,...extra});
const trip=(id,start,end,points,distance=0)=>({
  id,started_at:start,ended_at:end,points,distance_km:distance
});
const yesterday="2026-11-21";
const first=trip("first","2026-11-21T17:30:00Z","2026-11-21T17:50:00Z",
  [point(35.16,126.82,1000),point(35.17,126.83,5000)],4.1);
const second=trip("second","2026-11-21T18:10:00Z","2026-11-21T18:40:00Z",
  [point(35.19,126.85,10000),point(35.20,126.86,12000)],5.7);

test("recap workday honors Seoul 03:00 boundary and does not mutate tracks",()=>{
  const original=JSON.stringify([first,second]);
  const old=buildRecapSnapshot([first,second],yesterday);
  const next=buildRecapSnapshot([first,second],"2026-11-22");
  assert.equal(old.trips,1);
  assert.equal(old.distanceKm,4.1);
  assert.equal(old.durationMs,20*60000);
  assert.equal(next.trips,1);
  assert.equal(next.distanceKm,5.7);
  assert.equal(JSON.stringify([first,second]),original);
});

test("tracks never join different trips, breaks, invalid GPS or delayed samples",()=>{
  const t1=trip("a","2026-11-21T09:00:00Z","2026-11-21T10:00:00Z",[
    point(35.11,126.8,1000),point(35.12,126.82,3000),
    point(35.13,126.83,3500,{break:true}),point(35.14,126.84,5000),
    point(0,0,5500),point(35.15,126.85,6000),point(35.16,126.86,180000),
  ]);
  const result=recapRouteSegments([t1,second]);
  assert.deepEqual(result.map(seg=>seg.length),[2,2,1,1,2]);
  assert.equal(result[0][0].lat,35.11);
  assert.equal(result[4][0].lat,35.19);
});

test("no fabricated route or income on empty day and exact finance semantics",()=>{
  const empty=buildRecapSnapshot([],"2026-11-21");
  assert.equal(empty.gross,null);assert.deepEqual(empty.segments,[]);
  const finance={
    earnings:[{work_date:yesterday,platform:"쿠팡이츠",gross_entered:true,gross_won:100000,expenses_won:3000,expense_scope:"other_only",deliveries:15}],
    fuel:[{fueled_on:yesterday,cost_won:5000}],
    maintenance:[],
    extras:[{expense_date:yesterday,category:"식비",amount_won:9000},{expense_date:yesterday,category:"장비",amount_won:2000}]
  };
  const snap=buildRecapSnapshot([first],yesterday,finance);
  assert.equal(snap.gross,100000);assert.equal(snap.cost,10000);
  assert.equal(snap.net,90000);assert.equal(snap.deliveries,15);
  assert.equal(snap.platforms[0][0],"쿠팡이츠");
  assert.equal(buildRecapSnapshot([first],yesterday,{
    ...finance,earnings:[{...finance.earnings[0],expense_scope:"unknown"}]
  }).net,null);
  assert.equal(buildRecapSnapshot([first],yesterday,{...finance,earnings:[]}).gross,null);
});

test("finance lookup is read-only, scoped by account and exact date",async()=>{
  const seen=[];
  const client={from:table=>({
    select:columns=>{
      assert.equal(columns,"*");
      return {eq:(field,value)=>{
        seen.push([table,field,value]);
        return {eq:(date,key)=>{
          seen.push([table,date,key]);
          return Promise.resolve({data:[],error:null});
        }};
      }};
    }
  })};
  const value=await fetchRecapFinance(client,"account-1",yesterday);
  assert.deepEqual(Object.keys(value),["earnings","fuel","maintenance","extras"]);
  assert.equal(seen.filter(([table,field,value])=>field==="user_id"&&value==="account-1").length,4);
  assert.equal(seen.filter(([table,field,value])=>field!=="user_id"&&value===yesterday).length,4);
});

test("portrait, story and square exports choose correct PNG pixel dimensions",()=>{
  const ops=[];
  const context=new Proxy({}, {get(target,name){
    if(["beginPath","roundRect","fill","stroke","moveTo","lineTo","fillText","arc","save","clip","restore"].includes(name))
      return (...args)=>{ops.push([name,...args]);};
    return target[name];
  },set(target,name,value){target[name]=value;return true;}});
  const canvas={width:0,height:0,getContext:()=>context};
  const snapshot=buildRecapSnapshot([first],yesterday);
  for(const [ratio,height] of [["4:5",1350],["9:16",1920],["1:1",1080]]) {
    renderRecapCanvas(canvas,snapshot,{mode:"all",ratio});
    assert.equal(canvas.width,1080);assert.equal(canvas.height,height);
  }
  renderRecapCanvas(canvas,snapshot,{mode:"route",showRoute:false,theme:"mist"});
  renderRecapCanvas(canvas,snapshot,{mode:"finance",showIncome:false,theme:"night"});
  assert.ok(ops.some(([name])=>name==="fillText"));
  // The 4:5 all-in-one image has a truly square 800×800 map, then a
  // compact settlement panel; neither collides with the footer.
  const square=ops.find(([op,x,y,w,h])=>op==="roundRect"&&x===140&&y===177&&w===800&&h===800);
  const receipt=ops.find(([op,x,y,w,h])=>op==="roundRect"&&x===72&&y===997&&w===936&&h===224);
  assert.ok(square,"Expected centered 1:1 map");
  assert.ok(receipt,"Expected condensed settlement beneath map");
  assert.ok(177+800<997 && 997+224<1350-112,"No footer / map overlap");
});
