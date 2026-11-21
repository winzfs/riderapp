import test from "node:test";
import assert from "node:assert/strict";
import {recapRouteSegments,buildRecapSnapshot,fetchRecapFinance,renderRecapCanvas,recapEndpointLayout} from "../src/ride-recap.mjs";

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
  const receipt=ops.find(([op,x,y,w,h])=>op==="roundRect"&&x===72&&y===993&&w===936&&h===278);
  assert.ok(square,"Expected centered 1:1 map");
  assert.ok(receipt,"Expected condensed settlement beneath map");
  assert.ok(177+800<993 && 993+278<1350,"No map or bottom edge overlap");
  const textValues=ops.filter(x=>x[0]==="fillText").map(x=>x[1]);
  assert.ok(textValues.includes("출발") && textValues.includes("종료"),"Both route endpoints shown");
  assert.ok(!textValues.includes("배달")&&!textValues.includes("배달 건수"),"Do not render missing delivery metrics");
  assert.equal(textValues.filter(x=>x==="라이더스팟").length,5,"Only one top brand per rendered image, no footer");
});

test("round-trip rides never hide the start label under the finish",()=>{
  const a=recapEndpointLayout([[{x:415,y:540},{x:520,y:290},{x:419,y:542}]],800,800);
  assert.ok(a.coincident);
  assert.deepEqual(a.first,{x:415,y:540});
  assert.deepEqual(a.last,{x:419,y:542});
  const overlap=(p,q)=>p.x<q.x+q.width+8&&p.x+p.width+8>q.x&&
    p.y<q.y+q.height+8&&p.y+p.height+8>q.y;
  assert.ok(!overlap(a.start,a.end),"Start and end text chips must not overlap");
  for(const chip of [a.start,a.end]){
    assert.ok(chip.x>=8&&chip.x+chip.width<=790);
    assert.ok(chip.y>=10&&chip.y+chip.height<=790);
  }
});

test("start and end labels stay separately visible near each map edge",()=>{
  const tracks=[
    [{x:2,y:2},{x:4,y:4}],
    [{x:797,y:780},{x:798,y:785}],
    [{x:4,y:780},{x:4,y:780}],
    [{x:796,y:4},{x:797,y:3}],
    [{x:70,y:90},{x:750,y:750}],
  ];
  for(const trip of tracks) {
    const v=recapEndpointLayout([trip],800,800);
    const a=v.start,b=v.end;
    assert.ok(a.x>=8&&a.x+a.width<=790);
    assert.ok(b.x>=8&&b.x+b.width<=790);
    assert.ok(a.y>=10&&a.y+a.height<=790);
    assert.ok(b.y>=10&&b.y+b.height<=790);
    assert.ok(a.x+a.width+8<=b.x||b.x+b.width+8<=a.x||
      a.y+a.height+8<=b.y||b.y+b.height+8<=a.y,
      "Must not overlap at edge: "+JSON.stringify({trip,a,b}));
  }
});

test("multiple daily segments use the earliest fix and latest fix, not segment join points",()=>{
  const v=recapEndpointLayout([
    [{x:95,y:110},{x:250,y:170}],
    [{x:430,y:410},{x:600,y:650}],
  ],800,800);
  assert.deepEqual(v.first,{x:95,y:110});
  assert.deepEqual(v.last,{x:600,y:650});
  assert.equal(v.coincident,false);
});
