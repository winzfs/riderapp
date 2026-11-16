/* Rider Spot GPS v42: on-device native SQLite -> WebView timeline recovery.
 * Android bridge only; this code NEVER posts location to an HTTP endpoint.
 * Does not replace native bridge onmessage: it forwards every other reply.
 */
(() => {
  'use strict';
  if (window.__rsGPS41Installed || !window.RiderSpotHost || !window.__rsNativeInstalled) return;
  window.__rsGPS41Installed = true;
  window.__rsGPS42Installed = true;
  const host = window.RiderSpotHost;
  const oldReply = host.onmessage;
  const pending = new Map();
  let nextId = 900000000;
  let busy = false;
  let lastReopen = 0;
  let lastWarning = 0;
  let lastTrip = '';
  let nextSeq = 0;

  host.onmessage = event => {
    let result;
    try { result = JSON.parse(event.data); } catch { /* bridge's own handler handles errors */ }
    if (result && pending.has(result.id)) {
      const task = pending.get(result.id);
      pending.delete(result.id);
      clearTimeout(task.timer);
      if (result.ok) task.resolve(result.data);
      else task.reject(new Error(result.error || '기기 GPS 조회 실패'));
      return;
    }
    if (typeof oldReply === 'function') oldReply.call(host, event);
  };

  function call(action, extra={}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('기기 GPS 응답 지연'));
      }, 6000);
      pending.set(id, {resolve, reject, timer});
      try { host.postMessage(JSON.stringify({id, action, ...extra})); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }

  function badge(message, warning=false) {
    const api = window.__rsRideApi;
    const tripId = api?.trip?.id;
    let el = document.querySelector('#rs-gps-capture-state');
    if (!tripId) { if(el) el.remove(); return; }
    const container = document.querySelector('.rs33-course-footer') || document.querySelector('.rs33-trip-detail');
    if (!container) return;
    if (!el) {
      el = document.createElement('div');
      el.id='rs-gps-capture-state';
      el.setAttribute('role','status');
      container.prepend(el);
    }
    el.className = warning ? 'rs-gps-capture-state rs-gps-capture-warning' : 'rs-gps-capture-state';
    el.textContent = message;
  }
  function resetForTrip(id) {
    if (id !== lastTrip) {
      lastTrip = id;
      nextSeq = 0;  // Recover from the start even if old bridge already skipped points.
    }
  }


  // A WebView reload or sign-in change can leave an Android SQLite session alive
  // while React creates a different trip id. Never stop or overwrite that native
  // session on an automatic retry; offer a deliberate, on-device restoration.
  let recovering = false;
  const recoveryId = 'rs-gps-v42-recovery';
  const localRecord = key => {
    try { return JSON.parse(localStorage.getItem('rs:' + key) || 'null'); }
    catch { return null; }
  };
  const localSave = (key, value) => localStorage.setItem('rs:' + key, JSON.stringify(value));
  const validUuid = id => typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id);
  async function currentUserId() {
    try { return (await window.__rsClient?.auth.getUser())?.data?.user?.id || 'guest'; }
    catch { return 'guest'; }
  }
  async function allPoints(id) {
    const points = [];
    let cursor = 0;
    for (let page=0;page<90;page++) {
      const response = await call('points',{tripId:id,afterSeq:cursor,limit:180});
      const batch=Array.isArray(response?.points)?response.points:[];
      if (!batch.length) break;
      for(const p of batch) {
        if (!Number.isFinite(Number(p.t)) || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) continue;
        points.push({lat:Number(p.lat),lng:Number(p.lng),t:Number(p.t),accuracy:Number(p.accuracy)||0,
          heading:Number(p.heading)||0,speed:Number(p.speed)||0,seq:Number(p.seq)});
        cursor=Math.max(cursor,Number(p.seq)||0);
      }
      if (batch.length<180) break;
    }
    return points.sort((a,b)=>a.t-b.t);
  }
  const rootForBanner = () => document.querySelector('.rs33-trip-detail, .rs33-timeline');
  function removeRecoveryNotice() { document.getElementById(recoveryId)?.remove(); }
  function showRecoveryNotice(nativeId, currentId) {
    if (!validUuid(nativeId)) return;
    let el=document.getElementById(recoveryId);
    const parent=rootForBanner();
    if (!parent) return;
    if (!el) {
      el=document.createElement('div');
      el.id=recoveryId;
      el.className='rs-gps-v42-recovery';
      el.setAttribute('role','alert');
      const message=document.createElement('p');
      message.textContent='기기에 이전 운행의 GPS 기록이 남아 있어요. 새 기록과 연결하지 않고 안전하게 복구할 수 있어요.';
      const button=document.createElement('button');
      button.type='button';
      button.className='rs-gps-v42-action';
      button.textContent='기존 운행 복구하고 이어서 기록';
      button.addEventListener('click', async()=>{
        if (recovering) return;
        recovering=true;button.disabled=true;button.textContent='기기 기록 확인 중…';
        try {
          await restoreNativeTrip(nativeId);
        } catch(error) {
          recovering=false;button.disabled=false;button.textContent='복구 다시 시도';
          message.textContent='운행 복구에 실패했어요. 기기 GPS 원본은 그대로 남아 있습니다. ' + (error?.message||'');
        }
      });
      el.append(message,button);
      parent.prepend(el);
    }
  }
  async function restoreNativeTrip(expectedId) {
    const state = await call('state');
    if (!validUuid(expectedId) || state?.activeId !== expectedId) throw new Error('기기의 운행 상태가 변경되었습니다. 화면을 다시 열어 주세요.');
    const userId = await currentUserId();
    const activeKey='active:'+userId;
    const current=localRecord(activeKey);
    // Preserve the recently created web-only record; NEVER upload it as a
    // completed trip or delete Android SQLite samples.
    if (current?.id && current.id !== expectedId) {
      localSave('trip-rescue:'+current.id, current);
    }
    const matched=current?.id===expectedId ? current
       :localRecord('active:guest')?.id===expectedId ? localRecord('active:guest') : null;
    const samples=await allPoints(expectedId);
    const startedAt=Number(state.startedAt)||samples[0]?.t||Date.now();
    const restored={
      id:expectedId,user_id:userId==='guest'?null:userId,
      started_at:matched?.started_at || new Date(startedAt).toISOString(),
      ended_at:null,
      points: matched?.points?.length ? matched.points : [],
      distance_km: Number(matched?.distance_km)||0,
      events: Array.isArray(matched?.events) ? matched.events : [{type:'운행 시작 · 기기 기록 복구',at:new Date(startedAt).toISOString()}],
      memo:matched?.memo||null
    };
    if (samples.length) {
      const known=new Map();
      for(const p of restored.points) if(Number.isFinite(Number(p.t)))known.set(Number(p.t),p);
      for(const p of samples) known.set(p.t,p);
      restored.points=[...known.values()].sort((a,b)=>a.t-b.t).slice(-14999);
    }
    // Commit only when all reads succeed. The native SQLite session stays active.
    localSave(activeKey,restored);
    sessionStorage.removeItem('rs-native-recovery:'+expectedId);
    location.reload();
  }
  window.__rsGPS42PreflightStart = async () => {
    if (!window.RiderSpotHost) return false;
    try {
      const state=await call('state');
      const active=state?.activeId;
      if (!validUuid(active)) return false;
      // Starting a second trip while one is still in native SQLite is always
      // unsafe. Do not let React create a new UUID just to fail in Java.
      showRecoveryNotice(active,window.__rsRideApi?.trip?.id||null);
      window.__rsGoToTab?.('trips');
      return true;
    } catch(error) {
      // On a broken bridge we cannot safely start an Android recording.
      badge('기기 GPS 연결 확인 중 · 다시 시작해 주세요',true);
      return true;
    }
  };

  async function poll() {
    if (busy) return;
    const api = window.__rsRideApi;
    const id = api?.trip?.id;
    if (!id || api?.trip?.ended_at) { badge(''); return; }
    busy = true;
    resetForTrip(id);
    try {
      let status=await call('state');
      if (window.__rsRideApi?.trip?.id !== id) return;
      if (validUuid(status.activeId) && status.activeId !== id) {
        showRecoveryNotice(status.activeId,id);
        badge('기기에는 이전 운행이 기록 중입니다 · 위의 복구 버튼을 눌러 주세요',true);
        return;
      }
      removeRecoveryNotice();
      // If the original APK wrapper failed to start the foreground service,
      // retry once while the app is visible. Never restart a notification-stopped trip.
      if (!status.activeId && status.lastStoppedId !== id && !api.paused
          && document.visibilityState === 'visible' && Date.now() - lastReopen > 20000) {
        lastReopen = Date.now();
        try { await call('start', {tripId:id}); status=await call('state'); }
        catch(e) {badge('기기 GPS 시작 실패 · 앱 위치 권한을 확인해 주세요', true);return;}
      }
      if (status.activeId !== id) {
        badge('기기 GPS 대기 중 · 운행을 다시 확인해 주세요', true);
        return;
      }
      let total=0;
      for (let page=0; page<20; page++) {
        const data=await call('points',{tripId:id,afterSeq:nextSeq,limit:180});
        const source=Array.isArray(data?.points)?data.points:[];
        if (!source.length) break;
        const points=source.filter(p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Number.isFinite(p.t)
              && Number.isFinite(p.seq)).sort((a,b)=>a.seq-b.seq);
        if (window.__rsRideApi?.trip?.id !== id || window.__rsRideApi?.paused) break;
        if (points.length) {
          window.dispatchEvent(new CustomEvent('riderspot:native-sqlite-points', {detail:{tripId:id,points}}));
          total += points.length;
          nextSeq = Math.max(nextSeq, ...points.map(p=>p.seq));
        }
        if (source.length<180) break;
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      const n = Number(status.nativePointCount)||0;
      const saved = Number(status.gpsLastSavedAt)||0;
      const age = saved ? Math.max(0,Math.floor((Date.now()-saved)/1000)) : null;
      const lagging = !api.paused && (!status.gpsServiceActive || n===0 || age===null || age>35);
      if (api.paused) badge(`운행 일시정지 · 기기에 ${n}개 좌표 저장`);
      else if (lagging) badge(`GPS 저장 지연 · 기기 ${n}개 좌표 · ${age===null?'수신 대기':age+'초 전'} · 재연결 확인`,true);
      else badge(`GPS 기록 정상 · 기기 ${n}개 좌표 · 마지막 ${age}초 전`);
      if (lagging && !status.gpsServiceActive && document.visibilityState==='visible'
          && Date.now()-lastReopen>20000) {
        lastReopen=Date.now();
        try { await call('ensure-tracking',{tripId:id}); }
        catch(e) { if(Date.now()-lastWarning>60000){console.warn('[RiderSpotGPS41] restart',e);lastWarning=Date.now();} }
      }
    } catch (err) {
      badge('기기 GPS와 연결이 지연되고 있어요 · 앱을 다시 열어 주세요',true);
      if(Date.now()-lastWarning>60000){console.warn('[RiderSpotGPS41] polling',err);lastWarning=Date.now();}
    } finally { busy = false; }
  }

  window.__rsGPS41Poll = poll;
  setInterval(poll, 3000);
  window.addEventListener('focus',poll);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) poll();});
  setTimeout(poll,1000);
})();