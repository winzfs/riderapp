/* RiderSpot GPS v47: safe foreground incremental server checkpoint fallback.
 * Android SQLite remains the sole source of raw GPS while recording.
 * No coordinate rounding, path simplification, map matching or route changes.
 * Skips itself if the native APK already supplies the v1.0.15 uploader.
 * Guest rides remain on-device: the private server requires authentication.
 */
(function installTripCheckpointWebV47(win){
  "use strict";
  if(!win || win.__rsTripCheckpointWebV47)return;
  win.__rsTripCheckpointWebV47=true;
  const INTERVAL_MS=5*60*1000;
  const TICK_MS=60*1000;
  const LIMIT=120;
  const MAX_BATCHES=4;
  const KEY='rs:trip-checkpoint:last:';
  const state={tripId:'',uid:'',lastSuccess:0,nextRetryAt:0,
    failures:0,busy:false,uploadedSeq:0,backupAt:0,status:'idle',message:''};
  const now=()=>Date.now();
  const validId=id=>typeof id==='string'&&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
  const nativeOwnsGps=()=>Boolean(win.RiderSpotHost&&win.__rsNativeInstalled);
  const nativeUploaderAvailable=()=>typeof win.__rsTripCheckpointStatus==='function';
  const bridge=()=>win.__rsGPS42NativeRead;
  const stableNumber=n=>typeof n==='number'?n:Number(n);
  function emit(kind,message='',extra={}){
    state.status=kind;state.message=String(message).slice(0,180);
    const detail={kind,message:state.message,tripId:state.tripId,
      lastSeq:state.uploadedSeq,backupAt:state.backupAt,...extra};
    win.__rsTripCheckpointWebStateV47=detail;
    try{win.dispatchEvent(new CustomEvent('riderspot:trip-checkpoint',{detail}));}catch{}
  }
  function savedAt(uid,tripId){
    try{const v=Number(win.localStorage.getItem(KEY+uid+':'+tripId));
      return Number.isFinite(v)&&v>0?v:0;
    }catch{return 0;}
  }
  function markSaved(uid,tripId,at){
    state.lastSuccess=at;
    try{win.localStorage.setItem(KEY+uid+':'+tripId,String(at));}
    catch{ /* An exhausted WebView localStorage must never stop SQLite backups. */ }
  }
  function cleanEvents(events){
    return Array.isArray(events)?events.slice(-100)
      .filter(e=>e&&typeof e.type==='string')
      .map(e=>({type:e.type.slice(0,64),at:String(e.at||'').slice(0,50)})):[];
  }
  function preserveSamples(raw,cursor,start){
    if(!Array.isArray(raw)||raw.length>LIMIT)throw Error('GPS 응답 개수가 올바르지 않아요.');
    const out=[];
    let seq=cursor;
    const stamp=Date.parse(start);
    for(const item of raw){
      const n=stableNumber(item?.seq),t=stableNumber(item?.t);
      const lat=stableNumber(item?.lat),lng=stableNumber(item?.lng);
      if(!Number.isSafeInteger(n)||n<=seq||
         !Number.isFinite(t)||t<stamp-10000||t>now()+120000||
         !Number.isFinite(lat)||Math.abs(lat)>90||
         !Number.isFinite(lng)||Math.abs(lng)>180){
        // No silent loss: reject the batch instead of skipping a fix or
        // advancing the cursor through a missing/invalid GPS sample.
        throw Error('GPS 좌표 순서 또는 값을 확인해야 해요.');
      }
      const p={seq:n,lat,lng,t};
      for(const key of ['accuracy','speed','heading']){
        const value=stableNumber(item?.[key]);
        if(Number.isFinite(value))p[key]=value;
      }
      if(item?.break===true)p.break=true;
      out.push(p);seq=n;
    }
    return out;
  }
  function safeCursor(value){
    const n=Number(value||0);
    if(!Number.isSafeInteger(n)||n<0)throw Error('GPS 서버 커서가 올바르지 않아요.');
    return n;
  }
  async function remoteCursor(client,uid,id){
    const q=await client.from('rider_trip_checkpoints')
      .select('last_seq').eq('user_id',uid).eq('trip_id',id)
      .order('last_seq',{ascending:false}).limit(1);
    if(q.error)throw q.error;
    return safeCursor(q.data?.[0]?.last_seq);
  }
  function reset(uid,id){
    state.uid=uid;state.tripId=id;state.lastSuccess=savedAt(uid,id);
    state.uploadedSeq=0;state.backupAt=0;state.failures=0;
    state.nextRetryAt=0;state.message='';
    emit('waiting');
  }
  async function tick(force=false){
    if(state.busy||!nativeOwnsGps()||nativeUploaderAvailable()||
       !bridge()?.call||!win.__rsClient||win.navigator?.onLine===false)return;
    const trip=win.__rsRideApi?.trip;
    if(!trip||trip.ended_at||!validId(trip.id))return;
    const startAt=Date.parse(trip.started_at);
    if(!Number.isFinite(startAt)||startAt>now()||now()-startAt<INTERVAL_MS)return;
    if(!validId(trip.user_id)){
      if(state.status!=='login-required')emit('login-required','서버 백업은 로그인 상태에서만 가능해요.');
      return;
    }
    if(state.uid!==trip.user_id||state.tripId!==trip.id)
      reset(trip.user_id,trip.id);
    if(now()<state.nextRetryAt)return;
    if(!force && now()-state.lastSuccess<INTERVAL_MS)return;
    const localClient=win.__rsClient;
    const localBridge=bridge();
    state.busy=true;
    try {
      const {data,error}=await localClient.auth.getUser();
      if(error)throw error;
      const uid=data?.user?.id;
      if(uid!==trip.user_id||uid!==state.uid){
        emit('login-required','운행을 기록한 계정으로 로그인해야 서버에 백업할 수 있어요.');
        return;
      }
      const status=await localBridge.call('state');
      if(status?.activeId!==trip.id || win.__rsRideApi?.trip?.id!==trip.id)return;
      let cursor=await remoteCursor(localClient,uid,trip.id);
      let uploaded=0,more=false;
      for(let page=0;page<MAX_BATCHES;page++){
        if(win.__rsRideApi?.trip?.id!==trip.id||
           win.__rsRideApi.trip.ended_at)break;
        const active=await localBridge.call('state');
        if(active?.activeId!==trip.id)break;
        const result=await localBridge.call('points',{
          tripId:trip.id,afterSeq:cursor,limit:LIMIT
        });
        const raw=Array.isArray(result?.points)?result.points:[];
        if(!raw.length){more=false;break;}
        const points=preserveSamples(raw,cursor,trip.started_at);
        if(!points.length)break;
        const first=points[0],last=points[points.length-1];
        const row={
          user_id:uid,trip_id:trip.id,
          first_seq:first.seq,last_seq:last.seq,
          started_at:trip.started_at,
          last_point_at:new Date(Math.max(last.t,startAt)).toISOString(),
          points,events:cleanEvents(win.__rsRideApi?.trip?.events),
          distance_km:Math.max(0,Math.min(100000,
            Number(win.__rsRideApi?.trip?.distance_km)||0)),
          saved_at:new Date().toISOString()
        };
        const resultWrite=await localClient.from('rider_trip_checkpoints')
          .upsert(row,{onConflict:'user_id,trip_id,first_seq'});
        if(resultWrite.error)throw resultWrite.error;
        cursor=last.seq;uploaded+=points.length;
        more=raw.length===LIMIT;
        if(!more)break;
      }
      const when=now();
      markSaved(uid,trip.id,more ? when-INTERVAL_MS+TICK_MS:when);
      state.uploadedSeq=cursor;state.backupAt=when;
      state.failures=0;state.nextRetryAt=0;
      emit('saved','',{pointsUploaded:uploaded,catchup:more,authenticated:true});
    }catch(err){
      state.failures=Math.min(5,state.failures+1);
      state.nextRetryAt=now()+Math.min(5*60*1000,15000*2**state.failures);
      emit('retry',err?.message||'서버 백업 재시도 대기');
      console.warn('[RiderSpot GPS checkpoint] native SQLite retained; retry pending:',err?.message||err);
    }finally{state.busy=false;}
  }
  win.__rsTripCheckpointWebStatusV47=()=>({...state,
    nativeUploader:nativeUploaderAvailable(),intervalMinutes:INTERVAL_MS/60000});
  const wake=()=>{void tick(false);};
  win.setInterval(wake,TICK_MS);
  win.addEventListener('focus',wake);
  win.addEventListener('online',()=>{state.nextRetryAt=0;wake();});
  win.addEventListener('riderspot:native-events',wake);
  win.addEventListener('riderspot:screen',wake);
  win.document?.addEventListener('visibilitychange',()=>{
    if(!win.document.hidden)wake();
  });
  if(win.document?.readyState==='loading')
    win.document.addEventListener('DOMContentLoaded',wake,{once:true});
  else win.setTimeout(wake,1500);
})(typeof window==='undefined'?null:window);
