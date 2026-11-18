import test from "node:test";
import assert from "node:assert/strict";
import {createTripOdometerSync} from "../src/odometer-sync.mjs";
const one="11111111-1111-4111-8111-111111111111";
const two="22222222-2222-4222-8222-222222222222";
const trip=(id,km=2.35)=>({id,ended_at:"2026-11-18T12:05:00.000Z",distance_km:km});
const memory=()=>{const store=new Map();return {read:(k,d)=>store.get(k)??d,write:(k,v)=>store.set(k,v)};};
test("local trip queue excludes guest, repeats and malformed GPS distance",()=>{
 const api=createTripOdometerSync({...memory(),apply:async()=>60000});
 assert.equal(api.enqueue("guest",trip(one)),false);
 assert.equal(api.enqueue("u",trip(one)),true);
 assert.equal(api.enqueue("u",trip(one)),false);
 assert.equal(api.enqueue("u",trip(two,-1)),false);
 assert.equal(api.pending("u").length,1);
});
test("offline and absent initial odometer never discard the pending trip",async()=>{
 const mem=memory();let online=false,base=null,calls=0;
 const api=createTripOdometerSync({...mem,isOnline:()=>online,
   apply:async()=>{calls++;return base;}});
 api.enqueue("u",trip(one));
 assert.equal(await api.flush("u"),0);assert.equal(calls,0);
 online=true;assert.equal(await api.flush("u"),0);
 assert.equal(api.pending("u").length,1);
 base=60002;assert.equal(await api.flush("u"),1);
 assert.equal(api.pending("u").length,0);
 assert.equal(calls,2);
});
test("deduplicated concurrent flush applies each queued trip once",async()=>{
 const api=createTripOdometerSync({...memory(),apply:async()=>60001});
 api.enqueue("u",trip(one));api.enqueue("u",trip(two));
 const [a,b]=await Promise.all([api.flush("u"),api.flush("u")]);
 assert.equal(a,2);assert.equal(b,2);
 assert.deepEqual(api.pending("u"),[]);
});
