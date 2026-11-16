async () => {
  const path=`/accounts/${accountId}/workers/scripts/rider-spot`;
  const raw=String(await cloudflare.request({method:'GET',path}));
  const boundary=raw.slice(0,raw.indexOf('\r\n'));
  const firstBlank=raw.indexOf('\r\n\r\n')+4;
  const terminator=raw.lastIndexOf('\r\n'+boundary+'--');
  if(!boundary.startsWith('--')||firstBlank<4||terminator<=firstBlank)throw Error('Worker multipart unexpected');
  const original=raw.slice(firstBlank,terminator);
  const marker='const files=';
  const loc=original.indexOf(marker);
  if(loc<0||!original.includes('async function handleRiderSpotOAuth(')||!original.includes('async function riderSpotMatchRoads('))throw Error('Worker handlers missing - deployment blocked');
  const offset=loc+marker.length;
  let d=0,inString=false,escaped=false,end=-1;
  for(let i=offset;i<original.length;i++){
    const c=original[i];
    if(inString){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')inString=false;}
    else if(c==='"')inString=true;
    else if(c==='{')d++;
    else if(c==='}'&&!--d){end=i+1;break;}
  }
  if(end<0)throw Error('Assets parse error');
  const f=JSON.parse(original.slice(offset,end));
  const main='/assets/index-rider-v35-cb5dc21ec4b4.js';
  const css='/rider-spot-design-v40-teal-orange.css';
  const helper='/rider-gps-recovery-v41.js';
  const js=f[main]?.[0];
  if(typeof js!=='string'||!js.includes('function cs(e,t,view)'))throw Error('Main app mismatch');
  if(js.includes('riderspot:native-sqlite-points'))throw Error('v41 already present - refusing double-install');
  const at='async function ae(n){';
  if(js.split(at).length!==2)throw Error('Cannot safely inject into React hook');
  f[main][0]=js.replace(at,`__RS_HOOK__\n${at}`);
  f[main][0]=f[main][0].replace('__RS_HOOK__',"(0,S.useEffect)(()=>{\n  const absorb=(event)=>{\n    const detail=event?.detail;\n    const trip=y.current;\n    if(!trip?.id||b.current||detail?.tripId!==trip.id||!Array.isArray(detail.points))return;\n    const known=new Map();\n    const good=p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180&&Number.isFinite(Number(p.t))&&Number(p.t)>0;\n    for(const item of (trip.points||[]))if(good(item))known.set(Number(item.t),item);\n    let changed=false;\n    const start=Date.parse(trip.started_at)||0;\n    for(const raw of detail.points){\n      if(!good(raw))continue;\n      const time=Number(raw.t);\n      if(time<start-15000||time>Date.now()+15000)continue;\n      const p={lat:Number(raw.lat),lng:Number(raw.lng),accuracy:Number(raw.accuracy)||0,heading:Number(raw.heading)||0,speed:Number(raw.speed)||0,t:time};\n      const prev=known.get(time);\n      if(!prev||p.accuracy>0&&(Number(prev.accuracy)<=0||p.accuracy<Number(prev.accuracy))){known.set(time,p);changed=true;}\n    }\n    if(!changed)return;\n    const points=[...known.values()].sort((a,b)=>a.t-b.t).slice(-14999);\n    for(let j=1;j<points.length;j++) if(points[j].t-points[j-1].t>45000)points[j]={...points[j],break:true};\n    // Single source of truth: SQLite samples, not the WebView's GPS callbacks.\n    ie({...trip,points,distance_km:es(points)});\n    const final=points.at(-1);\n    if(final&&Date.now()-final.t<60000){r(final);re.current=final;setGpsStatus('ready');setGpsProblem('');}\n  };\n  window.addEventListener('riderspot:native-sqlite-points',absorb);\n  return()=>window.removeEventListener('riderspot:native-sqlite-points',absorb);\n},[e?.id]);\n");
  // A single isolated GPS sample should still be visible, not vanish as a zero-length path.
  const one='const paths=groups.filter(group=>group.length>1);';
  if(f[main][0].split(one).length!==2)throw Error('Map segment marker mismatch');
  f[main][0]=f[main][0].replace(one,one+`\n for(const g of groups){if(g.length!==1)continue;const p=g[0];L.circleMarker([p.lat,p.lng],{radius:4,color:'#178f78',fillColor:'#ff9a50',fillOpacity:.95,weight:1.3,interactive:false}).addTo(layer);}`);
  f[helper]=["/* Rider Spot GPS v41: on-device native SQLite -> WebView timeline recovery.\n * Android bridge only; this code NEVER posts location to an HTTP endpoint.\n * Does not replace native bridge onmessage: it forwards every other reply.\n */\n(() => {\n  'use strict';\n  if (window.__rsGPS41Installed || !window.RiderSpotHost || !window.__rsNativeInstalled) return;\n  window.__rsGPS41Installed = true;\n  const host = window.RiderSpotHost;\n  const oldReply = host.onmessage;\n  const pending = new Map();\n  let nextId = 900000000;\n  let busy = false;\n  let lastReopen = 0;\n  let lastWarning = 0;\n  let lastTrip = '';\n  let nextSeq = 0;\n\n  host.onmessage = event => {\n    let result;\n    try { result = JSON.parse(event.data); } catch { /* bridge's own handler handles errors */ }\n    if (result && pending.has(result.id)) {\n      const task = pending.get(result.id);\n      pending.delete(result.id);\n      clearTimeout(task.timer);\n      if (result.ok) task.resolve(result.data);\n      else task.reject(new Error(result.error || '기기 GPS 조회 실패'));\n      return;\n    }\n    if (typeof oldReply === 'function') oldReply.call(host, event);\n  };\n\n  function call(action, extra={}) {\n    return new Promise((resolve, reject) => {\n      const id = nextId++;\n      const timer = setTimeout(() => {\n        pending.delete(id);\n        reject(new Error('기기 GPS 응답 지연'));\n      }, 6000);\n      pending.set(id, {resolve, reject, timer});\n      try { host.postMessage(JSON.stringify({id, action, ...extra})); }\n      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }\n    });\n  }\n\n  function badge(message, warning=false) {\n    const api = window.__rsRideApi;\n    const tripId = api?.trip?.id;\n    let el = document.querySelector('#rs-gps-capture-state');\n    if (!tripId) { if(el) el.remove(); return; }\n    const container = document.querySelector('.rs33-course-footer') || document.querySelector('.rs33-trip-detail');\n    if (!container) return;\n    if (!el) {\n      el = document.createElement('div');\n      el.id='rs-gps-capture-state';\n      el.setAttribute('role','status');\n      container.prepend(el);\n    }\n    el.className = warning ? 'rs-gps-capture-state rs-gps-capture-warning' : 'rs-gps-capture-state';\n    el.textContent = message;\n  }\n  function resetForTrip(id) {\n    if (id !== lastTrip) {\n      lastTrip = id;\n      nextSeq = 0;  // Recover from the start even if old bridge already skipped points.\n    }\n  }\n\n  async function poll() {\n    if (busy) return;\n    const api = window.__rsRideApi;\n    const id = api?.trip?.id;\n    if (!id || api?.trip?.ended_at) { badge(''); return; }\n    busy = true;\n    resetForTrip(id);\n    try {\n      let status=await call('state');\n      if (window.__rsRideApi?.trip?.id !== id) return;\n      // If the original APK wrapper failed to start the foreground service,\n      // retry once while the app is visible. Never restart a notification-stopped trip.\n      if (!status.activeId && status.lastStoppedId !== id && !api.paused\n          && document.visibilityState === 'visible' && Date.now() - lastReopen > 20000) {\n        lastReopen = Date.now();\n        try { await call('start', {tripId:id}); status=await call('state'); }\n        catch(e) {badge('기기 GPS 시작 실패 · 앱 위치 권한을 확인해 주세요', true);return;}\n      }\n      if (status.activeId !== id) {\n        badge('기기 GPS 대기 중 · 운행을 다시 확인해 주세요', true);\n        return;\n      }\n      let total=0;\n      for (let page=0; page<20; page++) {\n        const data=await call('points',{tripId:id,afterSeq:nextSeq,limit:180});\n        const source=Array.isArray(data?.points)?data.points:[];\n        if (!source.length) break;\n        const points=source.filter(p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Number.isFinite(p.t)\n              && Number.isFinite(p.seq)).sort((a,b)=>a.seq-b.seq);\n        if (window.__rsRideApi?.trip?.id !== id || window.__rsRideApi?.paused) break;\n        if (points.length) {\n          window.dispatchEvent(new CustomEvent('riderspot:native-sqlite-points', {detail:{tripId:id,points}}));\n          total += points.length;\n          nextSeq = Math.max(nextSeq, ...points.map(p=>p.seq));\n        }\n        if (source.length<180) break;\n        await new Promise(resolve=>setTimeout(resolve,0));\n      }\n      const n = Number(status.nativePointCount)||0;\n      const saved = Number(status.gpsLastSavedAt)||0;\n      const age = saved ? Math.max(0,Math.floor((Date.now()-saved)/1000)) : null;\n      const lagging = !api.paused && (!status.gpsServiceActive || n===0 || age===null || age>35);\n      if (api.paused) badge(`운행 일시정지 · 기기에 ${n}개 좌표 저장`);\n      else if (lagging) badge(`GPS 저장 지연 · 기기 ${n}개 좌표 · ${age===null?'수신 대기':age+'초 전'} · 재연결 확인`,true);\n      else badge(`GPS 기록 정상 · 기기 ${n}개 좌표 · 마지막 ${age}초 전`);\n      if (lagging && !status.gpsServiceActive && document.visibilityState==='visible'\n          && Date.now()-lastReopen>20000) {\n        lastReopen=Date.now();\n        try { await call('ensure-tracking',{tripId:id}); }\n        catch(e) { if(Date.now()-lastWarning>60000){console.warn('[RiderSpotGPS41] restart',e);lastWarning=Date.now();} }\n      }\n    } catch (err) {\n      badge('기기 GPS와 연결이 지연되고 있어요 · 앱을 다시 열어 주세요',true);\n      if(Date.now()-lastWarning>60000){console.warn('[RiderSpotGPS41] polling',err);lastWarning=Date.now();}\n    } finally { busy = false; }\n  }\n\n  window.__rsGPS41Poll = poll;\n  setInterval(poll, 3000);\n  window.addEventListener('focus',poll);\n  document.addEventListener('visibilitychange',()=>{if(!document.hidden) poll();});\n  setTimeout(poll,1000);\n})();\n",'application/javascript; charset=utf-8'];
  f[css][0]+=`\n/* Rider Spot v41 GPS replay status */\n.rs-gps-capture-state{font-size:12px;font-weight:750;line-height:1.45;padding:8px 11px;border-radius:10px;margin:4px 0 8px;border:1px solid #aedccf;background:#e6f6f1;color:#186456;white-space:normal}.rs-gps-capture-warning{border-color:#f5c38b;background:#fff1dd;color:#8b4f13}\n`;
  let html=f['/index.html']?.[0];
  if(!html||!html.includes('</head>')||!html.includes(main)||!html.includes(css))throw Error('HTML mismatch');
  html=html.replace(new RegExp(main.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\?roads=v38'),main+'?gps=v41');
  // Some deployments may already have a different cachebuster, avoid injecting a duplicate path.
  if(!html.includes(main+'?gps=v41'))throw Error('App script cachebust missing');
  html=html.replace(css,css+'?gps=v41');
  html=html.replace('</head>',`<script defer src="${helper}?gps=v41"></script></head>`);
  f['/index.html'][0]=html;
  let sw=f['/sw.js'][0];
  if(!sw.includes('const CORE=['))throw Error('Service Worker mismatch');
  sw=sw.replace(/const CACHE='[^']+';/,`const CACHE='rider-spot-shell-2026-11-16-gps-v41';`);
  sw=sw.replace('const CORE=[',`const CORE=[${JSON.stringify(helper+'?gps=v41')},`);
  sw=sw.replace(JSON.stringify(main+'?roads=v38'),JSON.stringify(main+'?gps=v41'));
  sw=sw.replace(JSON.stringify(css),JSON.stringify(css+'?gps=v41'));
  f['/sw.js'][0]=sw;
  const updated=original.slice(0,loc)+marker+JSON.stringify(f)+original.slice(end);
  const checks={oauth:updated.includes('async function handleRiderSpotOAuth('),road:updated.includes('async function riderSpotMatchRoads('),nativeHook:f[main][0].includes('riderspot:native-sqlite-points'),gpsBadge:f[css][0].includes('rs-gps-capture-warning'),helper:!!f[helper],html:html.includes(helper),sw:sw.includes('gps-v41'),noServerUpload:!f[helper][0].includes('fetch(')};
  if(!Object.values(checks).every(Boolean))throw Error('Regression verification: '+JSON.stringify(checks));
  if(false)return {dryRun:true,checks,oldLength:original.length,newLength:updated.length,assetCount:Object.keys(f).length};
  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-15',bindings:[]})],{type:'application/json'}));
  form.append('worker.mjs',new Blob([updated],{type:'application/javascript+module'}),'worker.mjs');
  const deployed=await cloudflare.request({method:'PUT',path,body:form});
  return {success:deployed.success,errors:deployed.errors,modified:deployed.result?.modified_on,checks};
}