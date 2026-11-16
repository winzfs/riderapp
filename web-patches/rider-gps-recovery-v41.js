/* Rider Spot GPS v41: on-device native SQLite -> WebView timeline recovery.
 * Android bridge only; this code NEVER posts location to an HTTP endpoint.
 * Does not replace native bridge onmessage: it forwards every other reply.
 */
(() => {
  'use strict';
  if (window.__rsGPS41Installed || !window.RiderSpotHost || !window.__rsNativeInstalled) return;
  window.__rsGPS41Installed = true;
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