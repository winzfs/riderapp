/* Rider Spot v50 — complete native SQLite GPS merge after a trip has ended.
 * Fixes v1.0.6 native bridge reading `trips:<uid>` while the React app writes
 * `rs:trips:<uid>`. Only COMPLETED rides may be uploaded. Never delete fixes.
 */
(() => {
  'use strict';
  if (window.__rsGPSFinalizeV50Installed) return;
  window.__rsGPSFinalizeV50Installed = true;

  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
  const prefix = 'rs:trips:';
  let busy = false;
  let lastAttempt = 0;
  let lastCompletedId = '';

  function readArray(key) {
    try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; }
    catch (error) { console.warn('[RiderSpot v50] Invalid local history:', key, error); return []; }
  }
  function saveArray(key, records) {
    // Save the complete list. No deletion or replacement of unrelated rides.
    localStorage.setItem(key, JSON.stringify(records));
  }
  function markPending(uid, tripId) {
    const key = 'rs:pending:trips:' + uid;
    const values = readArray(key).filter(item => uuid(item));
    saveArray(key, [...new Set([...values, tripId])]);
    window.dispatchEvent(new Event('riderspot:trip-pending'));
  }
  function clearPending(uid, tripId) {
    const key = 'rs:pending:trips:' + uid;
    saveArray(key, readArray(key).filter(id => id !== tripId));
    window.dispatchEvent(new Event('riderspot:trip-synced'));
  }
  function calcKm(points) {
    let meters = 0;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1], next = points[i];
      const dt = next.t - prev.t;
      if (dt <= 0 || dt > 45_000 || next.break) continue;
      const r = Math.PI / 180;
      const a = Math.sin((next.lat-prev.lat)*r/2)**2 + Math.cos(prev.lat*r)*Math.cos(next.lat*r)*Math.sin((next.lng-prev.lng)*r/2)**2;
      const length = 6371000*2*Math.asin(Math.min(1,Math.sqrt(a)));
      if (length > 4 && length < 2500 && Number.isFinite(length)) meters += length;
    }
    return Math.round(meters / 10) / 100;
  }
  function mergeFinished(original, nativePoints) {
    if (!original || !uuid(original.id) || !original.ended_at) throw Error('완료된 운행 기록만 병합할 수 있어요.');
    const indexed = new Map();
    const valid = p => p && Number.isFinite(Number(p.t)) && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) &&
      Math.abs(Number(p.lat))<=90 && Math.abs(Number(p.lng))<=180 && Number(p.t)>0;
    for (const p of original.points || []) if (valid(p)) indexed.set(Number(p.t), {...p, t:Number(p.t)});
    for (const p of nativePoints || []) {
      if (!valid(p)) continue;
      const time = Number(p.t), old = indexed.get(time);
      // Use the higher-quality SQLite coordinate, not another WebView sample.
      if (!old || !Number.isFinite(Number(old.accuracy)) || Number(p.accuracy) <= Number(old.accuracy)) {
        indexed.set(time, {
          lat:Number(p.lat), lng:Number(p.lng), t:time,
          accuracy:Number(p.accuracy)||0, heading:Number(p.heading)||0,
          speed:Number(p.speed)||0
        });
      }
    }
    const points = [...indexed.values()].sort((a,b)=>a.t-b.t).slice(-14999);
    for (let i=1; i<points.length; i++) if (points[i].t-points[i-1].t > 45_000) points[i].break = true;
    const stops = typeof window.__rsNativeDetectStops === 'function' ? window.__rsNativeDetectStops(nativePoints) : [];
    const events = typeof window.__rsNativeStopMerge === 'function'
      ? window.__rsNativeStopMerge(original.events || [], stops)
      : original.events || [];
    return {...original, points, events, distance_km:Math.max(Number(original.distance_km)||0, calcKm(points))};
  }
  window.__rsGPS50MergeForTest = mergeFinished; // Pure helper; no write or upload.

  function explain(status, positive=false) {
    const old = document.getElementById('rs-gps-v50-recovery');
    if (!status) { old?.remove(); return; }
    const anchor = document.querySelector('.rs33-timeline, .rs33-trip-detail, .trip-page');
    if (!anchor) return;
    const node = old || document.createElement('div');
    if (!old) {
      node.id = 'rs-gps-v50-recovery';
      node.setAttribute('role','status');
      Object.assign(node.style, {padding:'12px 14px',borderRadius:'14px',border:'1px solid #cadfd6',margin:'10px 0',lineHeight:'1.5',fontSize:'13px'});
      anchor.prepend(node);
    }
    node.style.background = positive ? '#e6f5ed' : '#fff4e7';
    node.textContent = status;
  }

  async function verifiedUid() {
    const client = window.__rsClient;
    if (!client) return 'guest';
    try {
      const {data} = await client.auth.getUser();
      if (uuid(data?.user?.id)) return data.user.id;
    } catch(error) { /* read the offline cached session below */ }
    try {
      const {data} = await client.auth.getSession();
      if (uuid(data?.session?.user?.id)) return data.session.user.id;
    } catch(error) { /* stay local and do not upload */ }
    return 'guest';
  }

  async function repairLastFinishedTrip(force=false) {
    if (busy || !window.__rsNativeInstalled || !window.__rsGPS42NativeRead || document.hidden) return;
    if (!force && Date.now()-lastAttempt < 15_000) return;
    busy = true;
    lastAttempt = Date.now();
    try {
      const bridge = window.__rsGPS42NativeRead;
      const state = await bridge.call('state');
      // Strictly no upload/merge while a native trip is being recorded.
      if (uuid(state?.activeId) || !uuid(state?.lastStoppedId)) return;
      const tripId = state.lastStoppedId;
      const uid = await verifiedUid();
      const recoveryMarker = 'rs:gps-v50-completed:'+uid+':'+tripId;
      if (!force && sessionStorage.getItem(recoveryMarker) === 'ok'
          && !readArray('rs:pending:trips:'+uid).includes(tripId)) return;
      const localKey = prefix + uid;
      const saved = readArray(localKey);
      const legacy = readArray('trips:' + uid);
      const matching = saved.find(t=>t?.id===tripId && t?.ended_at) || legacy.find(t=>t?.id===tripId && t?.ended_at);
      if (!matching) {
        // Never manufacture a completed journey from points alone. An old
        // guest trip may still be available if the user is now logged in.
        if (!lastCompletedId || lastCompletedId !== tripId) explain('GPS 원본은 기기에 보관돼 있어요. 완료 기록과 연결되지 않아 자동 서버 전송은 하지 않았어요. 앱을 삭제하지 마세요.');
        return;
      }
      if (matching.user_id && uid !== 'guest' && matching.user_id !== uid) {
        explain('운행 기록의 계정이 현재 로그인 계정과 달라 GPS 경로를 전송하지 않았어요.');
        return;
      }
      const originalCount = Number(matching.points?.length)||0;
      const points = await bridge.allPoints(tripId);
      if (!points.length) return;
      const merged = mergeFinished(matching, points);
      const canonical = readArray(localKey);
      // Only replace the exact same finished trip; do not change any others.
      const newest = canonical.some(t=>t?.id===tripId)
        ? canonical.map(t=>t?.id===tripId?merged:t)
        : [merged, ...canonical];
      saveArray(localKey, newest);
      saveArray('trips:' + uid, legacy.some(t=>t?.id===tripId)
        ? legacy.map(t=>t?.id===tripId?merged:t)
        : [merged, ...legacy]);
      window.dispatchEvent(new Event('riderspot:native-events'));
      lastCompletedId = tripId;
      const added = Math.max(0,merged.points.length-originalCount);
      const client = window.__rsClient;
      if (uid==='guest' || !client) {
        explain('완료 운행의 GPS 경로를 기기 기록과 병합했어요 ('+merged.points.length+'개 좌표). 로그인한 뒤 서버에 저장할 수 있어요.',true);
        return;
      }
      markPending(uid, tripId);
      try {
        const {error} = await client.from('trips').upsert({...merged,user_id:uid});
        if (error) throw error;
        clearPending(uid, tripId);
        sessionStorage.setItem(recoveryMarker,'ok');
        explain('완료 운행 GPS '+merged.points.length+'개 좌표를 확인하고 서버에 저장했어요.'+(added?' 누락 '+added+'개 보완.':''),true);
      } catch(error) {
        explain('완료 GPS 경로는 기기에 안전하게 병합했어요. 서버 저장은 연결 복구 시 다시 시도합니다.');
        console.warn('[RiderSpot v50] Sync queued:',error?.message||error);
      }
    } catch(error) {
      console.warn('[RiderSpot v50] Finalization reconciliation deferred:',error?.message||error);
    } finally { busy = false; }
  }

  window.__rsGPS50Retry = () => repairLastFinishedTrip(true);
  setTimeout(()=>repairLastFinishedTrip(),3500);
  setInterval(()=>repairLastFinishedTrip(),15_000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) void repairLastFinishedTrip(true);});
  window.addEventListener('riderspot:native-events',()=>setTimeout(()=>repairLastFinishedTrip(),700));
  window.addEventListener('riderspot:trip-pending',()=>setTimeout(()=>repairLastFinishedTrip(),1200));
})();