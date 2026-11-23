import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const source=readFileSync(new URL("../src/trip-checkpoint-web-fallback-v47.js",import.meta.url),"utf8");
const UID="11111111-1111-4111-8111-111111111111";
const TRIP="22222222-2222-4222-8222-222222222222";
function harness(options={}){
  let timestamp=Date.parse("2026-11-23T10:30:00.000Z");
  let wake;
  let fail=options.failWrites||0;
  let cursor=options.cursor||0;
  const requests=[],nativeReads=[],signals=[],items=new Map();
  class Clock extends Date {
    constructor(...args){super(...(args.length?args:[timestamp]));}
    static now(){return timestamp;}
  }
  const start=new Clock(timestamp-720000).toISOString();
  const points=options.points||Array.from({length:650},(_,i)=>({
    seq:i+1,t:timestamp-700000+i*1000,
    lat:35.123456789012+i*1e-7,lng:126.987654321098,
    accuracy:2.5,heading:100.123456789
  }));
  const api={
    auth:{getUser:async()=>({data:{user:{id:options.authId??UID}},error:null})},
    from(name){
      assert.equal(name,"rider_trip_checkpoints");
      return {select(){return this;},eq(){return this;},order(){return this;},
        limit:async()=>({data:cursor?[{last_seq:cursor}]:[],error:null}),
        upsert:async(row)=>{
          if(fail-->0)return {error:new Error("mock offline")};
          requests.push(row);cursor=row.last_seq;
          return {error:null};
        }};
    }
  };
  const win={
    RiderSpotHost:{},__rsNativeInstalled:true,
    navigator:{onLine:options.online!==false},
    document:{readyState:"complete",hidden:false,addEventListener(){}},
    __rsClient:api,
    __rsGPS42NativeRead:{call:async(action,args)=>{
      nativeReads.push(action);
      if(action==="state")return {activeId:TRIP};
      if(action==="points")return {points:points.filter(p=>p.seq>args.afterSeq).slice(0,args.limit)};
      throw Error("unexpected native action");
    }},
    __rsRideApi:{trip:{id:TRIP,user_id:options.guest?null:UID,
      started_at:start,ended_at:null,events:[{type:"운행 시작",at:start}],
      distance_km:12.34}},
    localStorage:{getItem:k=>items.get(k)??null,setItem:(k,v)=>items.set(k,String(v))},
    addEventListener(){},dispatchEvent(e){signals.push(e.detail)},
    setInterval:cb=>{wake=cb;},setTimeout:cb=>{wake=cb;}
  };
  if(options.nativeUploader)win.__rsTripCheckpointStatus=()=>({active:true});
  runInNewContext(source,{window:win,Date:Clock,
    CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},
    console:{warn(){}}});
  const drain=async()=>{wake();for(let i=0;i<160;i++)await Promise.resolve();};
  return {win,requests,nativeReads,signals,drain,
    advance:async ms=>{timestamp+=ms;await drain();}};
}
test("lossless coordinates, 120-point upload batches, 5-minute interval and 1-minute catchup",async()=>{
  const h=harness();await h.drain();
  assert.equal(h.requests.length,4);
  assert.equal(h.requests.reduce((n,row)=>n+row.points.length,0),480);
  assert.equal(h.requests[0].points[0].lat,35.123456789012);
  assert.equal(h.requests[0].points[0].lng,126.987654321098);
  assert.equal(h.requests[3].last_seq,480);
  await h.advance(60000);
  assert.equal(h.requests.length,6);
  assert.equal(h.requests[5].last_seq,650);
});
test("private GPS cannot upload for guest/offline or duplicate native uploader",async()=>{
  for(const opts of [{guest:true},{online:false},{nativeUploader:true}]){
    const h=harness(opts);await h.drain();
    assert.equal(h.requests.length,0);
    assert.equal(h.nativeReads.length,0);
  }
});
test("server sequence cursor prevents replaying already acknowledged points",async()=>{
  const h=harness({cursor:480});await h.drain();
  assert.equal(h.requests.length,2);
  assert.equal(h.requests[0].first_seq,481);
  assert.equal(h.requests[1].last_seq,650);
});
test("failed writes do not advance cursor and can resume without data loss",async()=>{
  const h=harness({failWrites:1});await h.drain();
  assert.equal(h.requests.length,0);
  assert.equal(h.win.__rsTripCheckpointWebStateV47.kind,"retry");
  await h.advance(60000);
  assert.equal(h.requests.length,4);
  assert.equal(h.requests[0].first_seq,1);
});
test("out-of-order points are rejected, not silently skipped",async()=>{
  const now=Date.parse("2026-11-23T10:30:00.000Z");
  const h=harness({points:[
    {seq:1,t:now-2000,lat:35.1,lng:126.1},
    {seq:3,t:now-1000,lat:35.2,lng:126.2},
    {seq:2,t:now-500,lat:35.3,lng:126.3}
  ]});
  await h.drain();
  assert.equal(h.requests.length,0);
  assert.equal(h.win.__rsTripCheckpointWebStateV47.kind,"retry");
});
