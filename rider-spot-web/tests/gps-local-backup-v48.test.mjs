import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/gps-local-backup-v48.js",import.meta.url),"utf8")
  .replace("win.setInterval(attach,2400);",
    "win.__rsLocalBackupTestV48={available,entry,pack};win.setInterval(attach,2400);");
const OWNER="11111111-1111-4111-8111-111111111111";
const OTHER="22222222-2222-4222-8222-222222222222";
const ID="33333333-3333-4333-8333-333333333333";
function mock({owner=OWNER,points=[],appPoints=[],native=true}={}){
 const record={id:ID,user_id:owner,started_at:"2026-11-23T08:00:00Z",
   ended_at:"2026-11-23T09:00:00Z",distance_km:11.25,
   events:[{type:"운행 시작",at:"2026-11-23T08:00:00Z"}],
   points:appPoints,memo:"테스트"};
 const requests=[];
 const win={
   RiderSpotHost:native?{}:null,__rsNativeInstalled:native,
   __rsClient:{auth:{getUser:async()=>({data:{user:{id:OWNER}}})}},
   __rsRideApi:{trip:null,history:[record]},
   __rsGPS42NativeRead:{allPoints:async id=>{requests.push(id);return points}},
   document:{readyState:"loading",addEventListener(){}},
   addEventListener(){},setInterval(){}
 };
 runInNewContext(source,{window:win,Blob,Date,console});
 return {win,record,requests,api:win.__rsLocalBackupTestV48};
}
test("preserve raw GPS precision, ordering and stop break markers",async()=>{
 const raw=[
  {seq:1,t:1795410000000,lat:35.111111111123,lng:126.222222222234,speed:12.125},
  {seq:2,t:1795410001000,lat:35.111111110999,lng:126.222222222998,break:true}
 ];
 const {record,api,requests}=mock({points:raw,appPoints:[{lat:0,lng:0,t:1}]});
 const backup=await api.entry(record);
 assert.equal(backup.source,"android-sqlite");
 assert.equal(backup.points[0].lat,raw[0].lat);
 assert.equal(backup.points[0].lng,raw[0].lng);
 assert.equal(backup.points[1].break,true);
 assert.deepEqual(requests,[ID]);
 assert.equal(backup.events[0].type,"운행 시작");
 assert.equal(record.points[0].lat,0,"source record must remain untouched");
 const [file]=api.pack([backup]);
 const decoded=JSON.parse(file.content);
 assert.equal(decoded.format,"riderspot-gps-backup-v1");
 assert.equal(decoded.coordinate_policy,"unaltered");
 assert.deepEqual(decoded.entries[0].points,raw);
});
test("do not export another user's trip",async()=>{
 const {api,win}=mock();
 win.__rsRideApi.history.push({
   id:OTHER,user_id:OTHER,started_at:"2026-11-23T08:00:00Z",
   points:[{lat:35,lng:126,t:12}],ended_at:"2026-11-23T09:00:00Z"
 });
 const selected=await api.available();
 assert.equal(selected.length,1);assert.equal(selected[0].id,ID);
});
test("fall back to available app points without overwriting SQLite",async()=>{
 const rows=[{lat:35.123456789,lng:126.123456789,t:1795410001000}];
 const {record,api}=mock({points:[],appPoints:rows});
 const entry=await api.entry(record);
 assert.equal(entry.source,"app-record");
 assert.deepEqual(JSON.parse(JSON.stringify(entry.points)),rows);
});
test("cannot silently create empty-route backup",async()=>{
 const {record,api}=mock();
 await assert.rejects(()=>api.entry(record),/GPS 좌표를 읽지 못했어요/);
});
test("backup file is a local JSON archive with source and no network data",async()=>{
 const {api,record}=mock({appPoints:[{lat:35,lng:126,t:1795410000000}],native:false});
 const e=await api.entry(record);
 const files=api.pack([e]);
 assert.equal(files.length,1);
 assert.match(files[0].name,/^RiderSpot-GPS-.*\.json$/);
 const payload=JSON.parse(files[0].content);
 assert.equal(payload.entries[0].trip_id,ID);
 assert.equal(payload.entries[0].partial,false);
});
