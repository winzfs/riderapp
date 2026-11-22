/* Shared production/test helpers for incremental RiderSpot GPS checkpoints. */
(function(root, factory) {
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.__rsTripCheckpointCore=api;
})(typeof window!=='undefined'?window:null, function(){
  'use strict';
  const INTERVAL_MS=300000;
  const LIMIT=120;
  function due(lastAttemptAt, startedAt, now){
    const start=Date.parse(startedAt);
    if(!Number.isFinite(start)||start>now||now-start<INTERVAL_MS)return false;
    return !Number.isFinite(lastAttemptAt)||now-lastAttemptAt>=INTERVAL_MS;
  }
  function normalize(raw, cursor, startedAt, limit=LIMIT){
    const start=Date.parse(startedAt);
    if(!Number.isFinite(start)||!Array.isArray(raw))return [];
    let previous=Math.max(0,Math.trunc(Number(cursor)||0));
    const out=[];
    for(const p of raw){
      if(out.length>=limit)break;
      if(!p||!Number.isSafeInteger(Number(p.seq)))continue;
      const seq=Number(p.seq);
      if(seq<=previous)continue;
      const lat=Number(p.lat),lng=Number(p.lng),t=Number(p.t);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||
        Math.abs(lat)>90||Math.abs(lng)>180||
        !Number.isFinite(t)||t<start-10000||t>Date.now()+120000)continue;
      const accuracy=Number(p.accuracy),speed=Number(p.speed),heading=Number(p.heading);
      out.push({
        seq,lat,lng,t,
        accuracy:Number.isFinite(accuracy)&&accuracy>=0?accuracy:0,
        speed:Number.isFinite(speed)&&speed>=0?speed:0,
        heading:Number.isFinite(heading)?heading:0
      });
      previous=seq;
    }
    return out;
  }
  function safeEvents(events){
    if(!Array.isArray(events))return [];
    return events.slice(-100).filter(e=>e&&typeof e.type==='string')
      .map(e=>({type:e.type.slice(0,64),at:String(e.at||'').slice(0,50)}));
  }
  function distance(value){
    const n=Number(value);
    return Number.isFinite(n)&&n>=0&&n<=100000?Math.round(n*100)/100:0;
  }
  return Object.freeze({INTERVAL_MS,LIMIT,due,normalize,safeEvents,distance});
});
