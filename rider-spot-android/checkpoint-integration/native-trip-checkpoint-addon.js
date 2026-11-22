/* RiderSpot native trip checkpoints: 5-minute incremental, private, retryable.
 * Never writes an active ride into the public completed-trip timeline table.
 */
(() => {
  'use strict';
  if(typeof document==='undefined'||typeof window==='undefined'||
     typeof window.addEventListener!=='function'||typeof navigator==='undefined'||
     typeof document.addEventListener!=='function'||typeof send!=='function'||
     !window.__rsTripCheckpointCore)return;
  const core=window.__rsTripCheckpointCore;
  const STORE='rs:trip-checkpoint:last:';
  const MAX_BATCHES_PER_TICK=4;
  let running=false;
  let recentTrip='',recentSavedAt=0,recentSeq=0,warning='';
  const cursors=new Map();

  function record(status, detail){
    try{
      window.__rsTripCheckpointState={...status,message:detail||''};
      window.dispatchEvent(new CustomEvent('riderspot:trip-checkpoint',{
        detail:window.__rsTripCheckpointState
      }));
    }catch{}
  }
  async function owner(client,trip){
    if(!client?.auth||!trip?.id||!trip?.user_id)return null;
    try{
      const result=await client.auth.getUser();
      const uid=result?.data?.user?.id;
      return uid&&uid===trip.user_id?uid:null;
    }catch{return null;}
  }
  async function remoteCursor(client,uid,tripId){
    const answer=await client.from('rider_trip_checkpoints')
      .select('last_seq').eq('user_id',uid).eq('trip_id',tripId)
      .order('last_seq',{ascending:false}).limit(1);
    if(answer.error)throw answer.error;
    const seq=Number(answer.data?.[0]?.last_seq||0);
    return Number.isSafeInteger(seq)&&seq>=0?seq:0;
  }
  function cleanKey(uid,tripId){return STORE+uid+':'+tripId;}
  function lastSuccess(uid,tripId){
    try{return Number(localStorage.getItem(cleanKey(uid,tripId))||0);}
    catch{return 0;}
  }
  function markSuccess(uid,tripId,time){
    try{localStorage.setItem(cleanKey(uid,tripId),String(time));}catch{}
  }
  async function uploadOne(client,uid,trip,startSeq,raw){
    const data=core.normalize(raw,startSeq,trip.started_at,core.LIMIT);
    if(!data.length)return {count:0,lastSeq:startSeq};
    const last=data[data.length-1];
    const first=data[0];
    // Always capture the data returned by native SQLite, not React's
    // possibly throttled or incomplete in-memory trip points.
    const state=await send('state');
    if(state?.activeId!==trip.id) return {count:0,lastSeq:startSeq,stopped:true};
    const row={
      user_id:uid,
      trip_id:trip.id,
      first_seq:first.seq,
      last_seq:last.seq,
      started_at:trip.started_at,
      last_point_at:new Date(Math.max(last.t,Date.parse(trip.started_at))).toISOString(),
      points:data,
      events:core.safeEvents(trip.events),
      distance_km:core.distance(trip.distance_km),
      saved_at:new Date().toISOString()
    };
    const result=await client.from('rider_trip_checkpoints')
      .upsert(row,{onConflict:'user_id,trip_id,first_seq'});
    if(result.error)throw result.error;
    return {count:data.length,lastSeq:last.seq};
  }
  async function tick(force=false){
    if(running)return;
    if(!window.__rsNativeInstalled||!window.RiderSpotHost||
       !window.__rsRideApi?.trip||navigator.onLine===false)return;
    const trip=window.__rsRideApi.trip;
    if(!trip?.id||trip.ended_at)return;
    const id=trip.id,now=Date.now();
    const startedAt=Date.parse(trip.started_at);
    if(!Number.isFinite(startedAt)||now-startedAt<core.INTERVAL_MS)return;
    // Wait until the rider has been tracking for five minutes. Honor a
    // per-trip persisted successful timestamp across WebView recreation.
    running=true;
    try{
      const client=window.__rsClient;
      const uid=await owner(client,trip);
      if(!uid)return;
      const last=lastSuccess(uid,id);
      if(!force && !core.due(last,trip.started_at,now))return;
      const state=await send('state');
      if(!state || state.activeId!==id)return;
      // Always ask the server for the last accepted seq. This prevents losing
      // batches after a process crash or duplicate backups after a retry.
      let cursor=await remoteCursor(client,uid,id);
      let processed=0,more=false;
      for(let page=0;page<MAX_BATCHES_PER_TICK;page++){
        const active=window.__rsRideApi?.trip;
        if(!active||active.id!==id||active.ended_at||!window.RiderSpotHost)break;
        const current=await send('state');
        if(current?.activeId!==id)break;
        const response=await send('points',{
          tripId:id,afterSeq:cursor,limit:core.LIMIT
        });
        const raw=Array.isArray(response.points)?response.points:[];
        if(!raw.length){more=false;break;}
        const saved=await uploadOne(client,uid,active,cursor,raw);
        if(saved.stopped)break;
        if(saved.count===0){
          // Invalid samples must not create an infinite busy-upload loop.
          more=false;break;
        }
        cursor=saved.lastSeq;
        processed+=saved.count;
        more=raw.length>=core.LIMIT;
        if(!more)break;
      }
      const stamped=Date.now();
      // If the user returns after hours away, stream the catch-up in groups
      // of at most four small requests, one additional group a minute.
      markSuccess(uid,id,more?stamped-core.INTERVAL_MS+60000:stamped);
      recentTrip=id;recentSavedAt=stamped;recentSeq=cursor;warning='';
      record({tripId:id,backupAt:stamped,lastSeq:cursor,pointsUploaded:processed,
        catchup:more,online:true},'');
    }catch(err){
      warning=String(err?.message||err||'서버 백업 실패').slice(0,140);
      record({tripId:id,backupAt:recentSavedAt,lastSeq:recentSeq,
        online:navigator.onLine!==false,failed:true},warning);
      console.warn('[RiderSpot] GPS 자동 백업은 로컬에 보관하고 재시도합니다:',warning);
    }finally{running=false;}
  }
  const wake=()=>void tick(false);
  // One inexpensive eligibility check a minute; network writes only after
  // 5 minutes and only for new native SQLite points.
  setInterval(wake,60000);
  window.addEventListener('focus',wake);
  window.addEventListener('online',wake);
  window.addEventListener('riderspot:native-events',wake);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)wake();
  });
  window.__rsTripCheckpointStatus=()=>({
    tripId:recentTrip,backupAt:recentSavedAt,lastSeq:recentSeq,
    intervalMinutes:5,message:warning
  });
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',wake,{once:true});
  else wake();
})();
