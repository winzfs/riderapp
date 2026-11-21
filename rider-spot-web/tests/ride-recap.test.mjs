import test from "node:test";
import assert from "node:assert/strict";
import {recapRouteSegments,buildRecapSnapshot,fetchRecapFinance,renderRecapCanvas,recapEndpointLayout,recapMapDimensions,recapDistanceMeters,recapMapLabelVisible} from "../src/ride-recap.mjs";

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
  // The 4:5 all-in-one image has a truly square 920×920 map, then a
  // compact settlement panel; neither touches the edge.
  const square=ops.find(([op,x,y,w,h])=>op==="roundRect"&&x===80&&y===166&&w===920&&h===920);
  const ledgerRule=ops.find(([op,x1,y1,x2,y2])=>op==="moveTo"&&x1===80&&y1===1103);
  const detachedCard=ops.find(([op,x,y,w,h])=>op==="roundRect"&&x===80&&y===1103&&w===920&&h===221);
  assert.ok(square,"Expected centered 1:1 map");
  assert.ok(ledgerRule,"Expected a unified editorial report grid, not a second floating widget");
  const card=ops.find(([op,x,y,w,h])=>op==="roundRect"&&x===24&&y===22&&w===1032&&h===1306);
  assert.ok(card,"The exported bitmap must have one elevated premium card frame");
  const mapMat=ops.find(([op,x,y,w,h])=>op==="roundRect"&&x===74&&y===160&&w===932&&h===932);
  assert.ok(mapMat,"The square GPS map must have a dedicated subtle inset print frame");
  assert.equal(detachedCard,undefined,"Floating finance card must be removed");
  assert.ok(166+920<1103 && 1309<1328,"No map, metrics or premium card edge overlap");
  const textValues=ops.filter(x=>x[0]==="fillText").map(x=>x[1]);
  assert.ok(textValues.includes("출발") && textValues.includes("종료"),"Both route endpoints shown");
  assert.ok(!textValues.includes("배달")&&!textValues.includes("배달 건수"),"Do not render missing delivery metrics");
  assert.equal(textValues.filter(x=>x==="라이더스팟").length,5,"Only one top brand per rendered image, no footer");
  // No double entry for the same revenue when cost is zero or missing.
  assert.ok(textValues.includes("총수익"),"Main monetary label present");
  assert.ok(textValues.includes("운행거리")&&textValues.includes("운행시간"),"Ride metrics visible");
  assert.ok(!textValues.includes("주행 경로"),"Large floating map badge removed");
  assert.ok(920===recapMapDimensions("all","4:5").width,"Map remains square");
});

test("round-trip rides never hide the start label under the finish",()=>{
  const a=recapEndpointLayout([[{x:415,y:540},{x:520,y:290},{x:419,y:542}]],800,800,
    [[{lat:35.17000,lng:126.83000},{lat:35.174,lng:126.835},{lat:35.17001,lng:126.83001}]]);
  assert.ok(a.coincident);
  assert.deepEqual(a.first,{x:415,y:540});
  assert.deepEqual(a.last,{x:419,y:542});
  const overlap=(p,q)=>p.x<q.x+q.width+8&&p.x+p.width+8>q.x&&
    p.y<q.y+q.height+8&&p.y+p.height+8>q.y;
  assert.ok(a.joint,"A real same-place return has one adjacent joint label");
  assert.equal(a.start,null);assert.equal(a.end,null);
  for(const chip of [a.joint]){
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


test("GPS proximity is measured in meters, not projected screen distance",()=>{
  const projected=[[{x:350,y:350},{x:352,y:351}]];
  const a={lat:35.17,lng:126.83};
  const near={lat:35.17004,lng:126.83003};
  const apart={lat:35.1702,lng:126.83};
  assert.ok(recapDistanceMeters(a,near)<9);
  assert.ok(recapDistanceMeters(a,apart)>10);
  assert.equal(recapEndpointLayout(projected,800,800,[[a,near]]).coincident,true);
  const separate=recapEndpointLayout(projected,800,800,[[a,apart]]);
  assert.equal(separate.coincident,false);
  assert.ok(separate.start&&separate.end,"10–30 meter points retain distinct labels");
  assert.equal(recapEndpointLayout(projected,800,800).coincident,false,"Pixels alone cannot merge fixes");
});

test("known-timestamp GPS teleport is split without modifying source samples",()=>{
  const initial=Date.parse("2026-11-21T04:00:00Z");
  const samples=[
    point(35.17,126.83,initial),
    point(35.1701,126.8301,initial+10000),
    point(35.65,127.35,initial+20000),
    point(35.6501,127.3501,initial+30000),
    point(35.651,127.351,initial+180000),
  ];
  const original=JSON.stringify(samples);
  const segments=recapRouteSegments([{points:samples}]);
  assert.deepEqual(segments.map(x=>x.length),[2,2,1]);
  assert.equal(JSON.stringify(samples),original);
});


test("zero-cost disclosure and unknown-cost disclosure remain distinct",()=>{
  const known={earnings:[{work_date:yesterday,platform:"쿠팡이츠",gross_won:128000,
    gross_entered:true,expense_scope:"other_only",expenses_won:0}],
    fuel:[],maintenance:[],extras:[]};
  const explicit=buildRecapSnapshot([first],yesterday,known);
  const unknown=buildRecapSnapshot([first],yesterday,{
    ...known,earnings:[{...known.earnings[0],expense_scope:undefined,expenses_won:undefined}]
  });
  assert.equal(explicit.costKnown,true);
  assert.equal(unknown.costKnown,false);
  const labels=[];
  const context=new Proxy({}, {get(target,key){
    if(key==="fillText")return value=>labels.push(String(value));
    if(["beginPath","roundRect","fill","stroke","moveTo","lineTo","arc","save","clip","restore"].includes(key))return ()=>{};
    return target[key];
  },set(target,key,value){target[key]=value;return true;}});
  const canvas={getContext:()=>context};
  renderRecapCanvas(canvas,explicit);
  assert.ok(!labels.includes("순수익"),"Never repeat gross as net at zero expense");
  labels.length=0;
  renderRecapCanvas(canvas,unknown);
  assert.ok(labels.includes("비용 확인 필요"),"Missing cost declaration cannot pretend zero");
});


test("Korean dong names cannot collide with endpoint labels or clip at map edge",()=>{
  const routes=[[{x:110,y:625},{x:420,y:300},{x:805,y:510}]];
  assert.equal(recapMapLabelVisible({x:105,y:640},routes,920,920),false);
  assert.equal(recapMapLabelVisible({x:800,y:506},routes,920,920),false);
  assert.equal(recapMapLabelVisible({x:49,y:400},routes,920,920),false);
  assert.equal(recapMapLabelVisible({x:430,y:545},routes,920,920),true);
});

test("actual distinct endpoints retain both visual markers at low map zoom",()=>{
  const ops=[];
  const context=new Proxy({}, {get(target,key){
    if(["beginPath","roundRect","fill","stroke","moveTo","lineTo","fillText","arc","save","clip","restore"].includes(key))
      return (...args)=>ops.push([key,...args]);
    return target[key];
  },set(target,key,value){target[key]=value;return true;}});
  const canvas={getContext:()=>context};
  const firstFix={lat:35.169,lng:126.812};
  const lastFix={lat:35.16918,lng:126.812};
  const recap={day:"2026-11-21",segments:[[firstFix,lastFix]],trips:1,
    distanceKm:0.02,durationMs:1000,gross:null,deliveries:null};
  renderRecapCanvas(canvas,recap);
  const text=ops.filter(x=>x[0]==="fillText").map(x=>x[1]);
  assert.ok(text.includes("출발")&&text.includes("종료"));
  assert.ok(!text.includes("출발·종료"),"10–30m endpoints must remain distinct");
  const pinRings=ops.filter(x=>x[0]==="arc"&&x[3]>=15);
  assert.ok(pinRings.length>=2,"Both endpoints must keep visible rings");
});

test("premium card stays integrated in the actual 4:5 PNG and avoids unnecessary widgets",()=>{
  const ops=[],context=new Proxy({}, {get(target,key){
    if(["beginPath","roundRect","fill","stroke","moveTo","lineTo","fillText","arc","save","clip","restore"].includes(key))
      return (...args)=>ops.push([key,...args]);
    return target[key];
  },set(target,key,v){target[key]=v;return true;}});
  const canvas={getContext:()=>context};
  renderRecapCanvas(canvas,{day:"2026-11-21",segments:[],trips:2,
    distanceKm:99.1,durationMs:14100000,gross:79409,net:null,costKnown:false,
    cost:0,financeLoaded:true,deliveries:null}, {mode:"all",ratio:"4:5"});
  const marks=ops.filter(x=>x[0]==="roundRect");
  assert.ok(marks.some(x=>x[1]===24&&x[2]===1099&&x[3]===1032),"Integrated ledger section missing");
  assert.ok(marks.some(x=>x[1]===80&&x[2]===23&&x[3]===112),"Card edge accent missing");
  assert.equal(marks.some(x=>x[1]===80&&x[2]===1103&&x[3]===920&&x[4]===221),false);
  const labels=ops.filter(x=>x[0]==="fillText").map(x=>x[1]);
  assert.ok(labels.includes("₩79,409")&&labels.includes("99.1 km")&&labels.includes("3시간 55분"));
  assert.equal(labels.includes("₩0"),false);
});
