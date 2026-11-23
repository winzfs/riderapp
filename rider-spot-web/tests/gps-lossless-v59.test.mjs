import test from "node:test";
import assert from "node:assert/strict";
import { mergeTripPoints, readStoppedTrip, nativeGpsDayRanges } from "../src/native-trip.mjs";
import { withNativeGpsEventsV59 } from "../src/timeline-gps-read.mjs";

const id = "11111111-2222-4333-8444-555555555555";
const t = Date.parse("2026-11-23T14:59:59+09:00");

test("v59 preserves two distinct native fixes with identical millisecond timestamp", () => {
  const a = {seq:20, lat:35.01, lng:126.01, t, accuracy:2.0, heading:1, speed:0};
  const b = {seq:21, lat:35.01001, lng:126.01, t, accuracy:2.0, heading:1, speed:0};
  const results = mergeTripPoints([], [a,b]);
  assert.equal(results.length, 2);
  assert.deepEqual(results.map(p=>p.seq),[20,21]);
  assert.equal(results[0].t,results[1].t);
  assert.equal(mergeTripPoints(results,[a]).length,2);
});

test("v59 retains one continuous ride across KST midnight and indexes both days", () => {
  const points = [
    {seq:160,lat:35,lng:126,t:Date.parse("2026-11-23T23:59:58+09:00")},
    {seq:161,lat:35.0001,lng:126.0001,t:Date.parse("2026-11-24T00:00:01+09:00")}
  ];
  assert.deepEqual(nativeGpsDayRanges(points),{
    "2026-11-23":{firstSeq:160,lastSeq:160,pointCount:1},
    "2026-11-24":{firstSeq:161,lastSeq:161,pointCount:1},
  });
});

test("v59 saves existing stop and rest events in native SQLite before trip summary", async () => {
  const saved=[];
  const points=[
    {seq:1,lat:35,lng:126,t,accuracy:3,heading:0,speed:0},
    {seq:2,lat:35.00001,lng:126,t:t+120000,accuracy:3,heading:0,speed:0}
  ];
  const bridge={
    async call(action,data){
      saved.push({action,data});
      if(action==="state")return {activeId:id,gpsArchiveV59:true};
      if(action==="stop")return {stopped:true};
      if(action==="gps-events-save")return {stored:data.events.length};
      throw Error(action);
    },
    async allPoints(){return points;},
    detectStops(){return [{
      id:"stop-1",type:"정차",at:new Date(t).toISOString(),
      lat:35,lng:126,durationMs:120000,source:"riderspot-native-stop-v1"
    }]}
  };
  // The native state transitions to stopped immediately after the bridge stop.
  let stopped=false;
  bridge.call=async(action,data)=>{
    saved.push({action,data});
    if(action==="state")return stopped
      ? {activeId:"",lastStoppedId:id,gpsArchiveV59:true}
      : {activeId:id,gpsArchiveV59:true};
    if(action==="stop"){stopped=true;return {stopped:true};}
    if(action==="gps-events-save")return {stored:data.events.length};
    throw Error(action);
  };
  const trip={id,started_at:new Date(t).toISOString(),events:[
    {type:"운행 시작",at:new Date(t).toISOString()},
    {type:"휴식 시작",at:new Date(t+30000).toISOString()}
  ],points:[]};
  const done=await readStoppedTrip(bridge,trip,new Date(t+130000).toISOString());
  assert.equal(done.points.length,2);
  assert.ok(done.events.some(e=>e.type==="정차"));
  assert.ok(done.events.some(e=>e.type==="휴식 시작"));
  assert.equal(saved.filter(x=>x.action==="gps-events-save").length,1);
  assert.deepEqual(saved.at(-1).data.events,done.events);
});

test("v59 will not use new GPS event bridge with pre-v59 native APK", async () => {
  const calls=[];
  let stopped=false;
  const bridge={
    async call(action){
      calls.push(action);
      if(action==="state")return stopped?{activeId:"",lastStoppedId:id}:{activeId:id};
      if(action==="stop"){stopped=true;return {stopped:true};}
      throw Error(action);
    },
    async allPoints(){return [{seq:1,t,lat:35,lng:126,accuracy:3}];},
    detectStops(){return []}
  };
  await readStoppedTrip(bridge,{id,started_at:new Date(t).toISOString(),events:[],points:[]},
    new Date(t+1200).toISOString());
  assert.ok(!calls.includes("gps-events-save"));
});

test("v59 native event recovery merges with existing timeline events without duplicate",async(tctx)=>{
  const original=globalThis.__rsNativeReadEventsV59;
  tctx.after(()=>{if(original===undefined)delete globalThis.__rsNativeReadEventsV59;
     else globalThis.__rsNativeReadEventsV59=original;});
  const stop={id:"stop:1",type:"정차",at:new Date(t).toISOString(),lat:35,lng:126};
  globalThis.__rsNativeReadEventsV59=async() => ({events:[stop]});
  const row={id,gps_native:true,points:[],events:[{...stop}]};
  const loaded=await withNativeGpsEventsV59(row);
  assert.equal(loaded.events.length,1);
  assert.deepEqual(loaded.events[0],stop);
});
