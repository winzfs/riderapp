const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../checkpoint-core.js');
const now=Date.now();
const start=new Date(now-3600000).toISOString();
const gps=(seq,t=now-1000,lat=35.16,lng=126.83)=>({seq,lat,lng,t,accuracy:8,heading:180,speed:5});

test('server checkpoint is due after five minutes, never every GPS event',()=>{
  const started=new Date(now-299999).toISOString();
  assert.equal(core.due(0,started,now),false);
  assert.equal(core.due(0,new Date(now-300001).toISOString(),now),true);
  assert.equal(core.due(now-299999,start,now),false);
  assert.equal(core.due(now-300001,start,now),true);
});
test('checkpoint contains only valid seq > last successful upload cursor',()=>{
  const result=core.normalize([gps(4),gps(5),gps(5),gps(6),gps(7,now-1000,91,126),
    {...gps(8),lat:35.2,lng:126.8},gps(9,now-1000,35.21,126.9)],5,start);
  assert.deepEqual(result.map(p=>p.seq),[6,8,9]);
  assert.deepEqual(Object.keys(result[0]).sort(), ['accuracy','heading','lat','lng','seq','speed','t'].sort());
});
test('same batch replay does not increase the cursor or duplicate positions',()=>{
  const records=[gps(1),gps(2),gps(3),gps(4)];
  const first=core.normalize(records,0,start,2);
  const second=core.normalize(records,first.at(-1).seq,start,2);
  const third=core.normalize(records,second.at(-1).seq,start,2);
  assert.deepEqual(first.map(x=>x.seq),[1,2]);
  assert.deepEqual(second.map(x=>x.seq),[3,4]);
  assert.deepEqual(third,[]);
});
test('never put arbitrary event object data in server payload',()=>{
  const events=[{type:'운행 시작',at:'2026-11-22T13:00:00Z',customerAddress:'private'}];
  assert.deepEqual(core.safeEvents(events),[{type:'운행 시작',at:'2026-11-22T13:00:00Z'}]);
  assert.equal(core.safeEvents(Array.from({length:120},()=>events[0])).length,100);
});
test('bad coordinates, time and unbounded distance cannot enter backup batch',()=>{
  const sample=[gps(1),gps(2,now+180000),gps(3,now-999999999)];
  assert.deepEqual(core.normalize(sample,0,start).map(p=>p.seq),[1]);
  assert.equal(core.distance(-2),0);
  assert.equal(core.distance(7.126),7.13);
  assert.equal(core.distance(Infinity),0);
});
