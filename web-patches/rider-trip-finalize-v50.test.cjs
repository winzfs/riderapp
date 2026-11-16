const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const script = fs.readFileSync('/mnt/data/rider-trip-finalize-v50.js','utf8');
const id='a59da0be-462f-4bda-9bf9-8d2496bc83f6';
const uid='3fb987d2-4ee7-4121-bf58-7fbf5fd2df18';
function setup({state, user=uid, history, geo, stops=[], online=true}={}) {
  let writes=[], upserts=[];
  const store = new Map();
  const data = {id, user_id:user, started_at:'2026-11-16T08:00:00Z', ended_at:'2026-11-16T09:00:00Z', points:[], events:[{type:'운행 종료',at:'2026-11-16T09:00:00Z'}], distance_km:0};
  if(history!==false) store.set('rs:trips:'+user, JSON.stringify([history||data]));
  const listeners = new Map();
  const document={hidden:false,querySelector:()=>null, getElementById:()=>null, addEventListener:(k,fn)=>listeners.set(k,fn)};
  const window={
    __rsNativeInstalled:true,RiderSpotHost:{},
    __rsGPS42NativeRead:{call:async()=>state||{activeId:'',lastStoppedId:id},allPoints:async()=>geo||[
      {seq:1,t:100000,lat:35.1,lng:126.1,accuracy:7},
      {seq:2,t:110000,lat:35.1001,lng:126.1001,accuracy:7}]},
    __rsClient:{auth:{getUser:async()=>({data:{user:{id:user}}})},from:()=>({upsert:async record=>{upserts.push(record);return online?{error:null}:{error:{message:'offline'}};}})},
    addEventListener:(k,fn)=>listeners.set(k,fn),
    dispatchEvent:()=>{},
    __rsNativeDetectStops:()=>stops,
    __rsNativeStopMerge:(old, auto)=>[...old, ...auto]
  };
  const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>{store.set(k,v);writes.push(k)}};
  const sessionStorage={m:new Map(),getItem(k){return this.m.get(k)||null},setItem(k,v){this.m.set(k,v)}};
  const scope={window,document,localStorage,sessionStorage,Date,Math,Number,Map,JSON,Error,console,Event:class{},
    setTimeout:()=>1,setInterval:()=>1,clearTimeout:()=>{}};
  vm.runInNewContext(script,scope);
  return {window,store,upserts,writes,data};
}
(async()=>{
  // The error case: the old APK expected bare 'trips:uid', but the app stores rs:trips:uid.
  const a=setup();
  assert.equal(a.store.get('trips:'+uid), undefined);
  await a.window.__rsGPS50Retry();
  const fixed=JSON.parse(a.store.get('rs:trips:'+uid))[0];
  assert.equal(fixed.points.length,2);
  assert.equal(JSON.parse(a.store.get('trips:'+uid))[0].points.length,2);
  assert.equal(a.upserts.length,1);
  assert.equal(a.upserts[0].user_id,uid);
  assert.deepEqual(JSON.parse(a.store.get('rs:pending:trips:'+uid)),[]);

  // Never upload while native GPS is active.
  const b=setup({state:{activeId:id,lastStoppedId:id}});
  await b.window.__rsGPS50Retry();
  assert.equal(b.upserts.length,0);

  // Do not construct a fabricated trip when React has no finished record.
  const c=setup({history:false});
  await c.window.__rsGPS50Retry();
  assert.equal(c.upserts.length,0);
  assert.equal(c.store.get('rs:trips:'+uid),undefined);

  // Offline path: local route is intact and pending ID remains for retry.
  const d=setup({online:false});
  await d.window.__rsGPS50Retry();
  assert.equal(JSON.parse(d.store.get('rs:trips:'+uid))[0].points.length,2);
  assert.deepEqual(JSON.parse(d.store.get('rs:pending:trips:'+uid)),[id]);

  // All existing unrelated rides are retained.
  const e=setup();
  const other='7b71f0b4-582a-46bb-861c-9aff507a6009';
  e.store.set('rs:trips:'+uid,JSON.stringify([e.data,{...e.data,id:other}]));
  await e.window.__rsGPS50Retry();
  assert.equal(JSON.parse(e.store.get('rs:trips:'+uid)).length,2);
  assert.equal(JSON.parse(e.store.get('rs:trips:'+uid))[1].id,other);
  console.log('PASS 5 GPS finalize recovery tests');
})().catch(error=>{console.error(error);process.exit(1)});