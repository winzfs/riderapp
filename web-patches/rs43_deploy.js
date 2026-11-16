async () => {
  const scriptPath=`/accounts/${accountId}/workers/scripts/rider-spot`;
  const raw=String(await cloudflare.request({method:'GET',path:scriptPath}));
  const st=raw.indexOf('const files=');
  if(st<0)throw Error('missing Worker virtual assets');
  const dataStart=st+12;
  let depth=0,quoted=false,escaped=false,end=-1;
  for(let i=dataStart;i<raw.length;i++){
    const c=raw[i];
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}
    else if(c==='"')quoted=true;
    else if(c==='{')depth++;
    else if(c==='}'&&!--depth){end=i+1;break;}
  }
  if(end<0)throw Error('invalid virtual assets JSON');
  const originalFiles=JSON.parse(raw.slice(dataStart,end));
  const files={...originalFiles};
  const appPath='/assets/index-rider-v35-cb5dc21ec4b4.js';
  const cssPath='/rider-spot-design-v40-teal-orange.css';
  let app=files[appPath]?.[0];
  let html=files['/index.html']?.[0];
  let sw=files['/sw.js']?.[0];
  if(!app||!html||!sw)throw Error('missing critical assets');
  if(app.includes('function rs43CleanPaths('))throw Error('v43 already deployed, refusing double patch');
  function replaceUnique(needle, replacement) {
    const count=app.split(needle).length-1;
    if(count!==1)throw Error('Expected one app match; found '+count+': '+needle.slice(0,140));
    app=app.replace(needle,replacement);
  }
  const alg="/* Rider Spot v43. Display-only algorithms: NEVER alter original GPS points. */\nfunction rs43Meters(a,b){\n  if(!a||!b) return Infinity;\n  const r=Math.PI/180;\n  const dLat=(b.lat-a.lat)*r,dLng=(b.lng-a.lng)*r;\n  const s=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLng/2)**2;\n  return 12742000*Math.atan2(Math.sqrt(s),Math.sqrt(Math.max(0,1-s)));\n}\nfunction rs43CleanPaths(groups){\n return groups.map(path=>{\n  if(!Array.isArray(path)||path.length<3)return path||[];\n  const output=[];\n  let i=0;\n  while(i<path.length){\n   const pivot=path[i];\n   let j=i+1;\n   while(j<path.length){\n    const gap=(path[j].time??0)-(pivot.time??0);\n    if(gap<0 || gap>1800000)break;\n    const radius=rs43Meters(pivot,path[j]);\n    if(radius<=24){j++;continue;}\n    // Ignore a single noisy sample which immediately returns to the stop radius.\n    if(j+1<path.length&&rs43Meters(pivot,path[j+1])<=24){j+=2;continue;}\n    break;\n   }\n   const span=path.slice(i,j);\n   const duration=span.length>1?(span.at(-1).time??0)-(span[0].time??0):0;\n   if(span.length>=5&&duration>=25000){\n    const lat=span.map(p=>p.lat).sort((a,b)=>a-b);\n    const lng=span.map(p=>p.lng).sort((a,b)=>a-b);\n    const center={...span[0],lat:lat[Math.floor(lat.length/2)],lng:lng[Math.floor(lng.length/2)]};\n    if(output.length&&rs43Meters(output.at(-1),center)<6)output[output.length-1]=center;\n    else output.push(center);\n    i=j;\n    continue;\n   }\n   const next=path[i];\n   if(!output.length||rs43Meters(output.at(-1),next)>=7){output.push(next);}\n   i++;\n  }\n  const last=path.at(-1);\n  if(last&&(!output.length||rs43Meters(last,output.at(-1))>=7))output.push(last);\n  return output.length?output:[path[0]];\n }).filter(p=>p&&p.length);\n}\nfunction rs43Revisits(groups){\n const rails=[];\n const cells=new Map();\n const zones=[];\n let cumulative=0;\n const centerLat=groups.flat().reduce((x,p,_,a)=>x+p.lat/a.length,0)||35;\n const latMeter=111120,lonMeter=111120*Math.cos(centerLat*Math.PI/180);\n const bin=24;\n const threshold=19;\n for(let g=0;g<groups.length;g++){\n  const path=groups[g];\n  for(let i=1;i<path.length;i++){\n   const from=path[i-1],to=path[i],len=rs43Meters(from,to);\n   if(!Number.isFinite(len)||len<8||len>110){if(Number.isFinite(len)&&len<20000)cumulative+=len;continue;}\n   cumulative+=len;\n   const x=(from.lng+to.lng)/2*lonMeter,y=(from.lat+to.lat)/2*latMeter;\n   const dx=(to.lng-from.lng)*lonMeter/len,dy=(to.lat-from.lat)*latMeter/len;\n   const gx=Math.floor(x/bin),gy=Math.floor(y/bin);\n   let candidate=null,score=Infinity;\n   for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){\n     for(const idx of cells.get((gx+ox)+','+(gy+oy))||[]){\n      const z=zones[idx],dist=Math.hypot(x-z.x,y-z.y);\n      // Parallel or opposite lanes both count; crossing streets do not.\n      const parallel=Math.abs(dx*z.dx+dy*z.dy);\n      if(dist<threshold&&parallel>.88&&dist+(1-parallel)*35<score){\n       candidate=z;score=dist+(1-parallel)*35;\n      }\n     }\n   }\n   const at=Number.isFinite(to.time)?to.time:null;\n   let zone;\n   if(!candidate){\n     zone={x,y,dx,dy,visits:[{time:at,distance:cumulative}],segments:[]};\n     const idx=zones.push(zone)-1,key=gx+','+gy;\n     if(!cells.has(key))cells.set(key,[]);\n     cells.get(key).push(idx);\n   }else{\n     zone=candidate;\n     const farEnough=at!=null&&zone.visits.every(v=>v.time!=null&&Math.abs(at-v.time)>120000&&Math.abs(cumulative-v.distance)>160);\n     if(farEnough)zone.visits.push({time:at,distance:cumulative});\n   }\n   zone.segments.push({group:g,index:i,from,to});\n  }\n }\n // Multiple observations in the same location during a single visit are one pass.\n for(const zone of zones){\n   const count=Math.min(4,zone.visits.length);\n   if(count<2)continue;\n   for(const seg of zone.segments)rails.push({...seg,count});\n }\n return rails.sort((a,b)=>a.group-b.group||a.index-b.index);\n}\nfunction rs43DrawRails(L,layer,rails){\n if(!Array.isArray(rails)||!rails.length)return;\n const runs=[];let current=null;\n // Keep layers cheap: join only consecutive matched route sections.\n for(const rail of rails){\n  if(current&&current.group===rail.group&&current.lastIndex+1===rail.index&&current.count===rail.count){\n    current.points.push([rail.to.lat,rail.to.lng]);current.lastIndex=rail.index;\n  }else{current={group:rail.group,lastIndex:rail.index,count:rail.count,points:[[rail.from.lat,rail.from.lng],[rail.to.lat,rail.to.lng]]};runs.push(current);}\n }\n for(const run of runs){\n  const line=run.points,passes=Math.min(4,run.count);\n  for(let level=passes-1;level>=1;level--){\n   const width=9+6*level;\n   L.polyline(line,{color:'#ff9a50',weight:width,opacity:.92,interactive:false,lineCap:'round',lineJoin:'round',smoothFactor:0}).addTo(layer);\n   if(level>1)L.polyline(line,{color:'#fff7f0',weight:width-3,opacity:.98,interactive:false,lineCap:'round',lineJoin:'round',smoothFactor:0}).addTo(layer);\n  }\n }\n}\n";
  replaceUnique('function rs33Paths(points){',alg+'\nfunction rs33Paths(points){');
  replaceUnique('function rs33DrawCourse(L,map,layer,groups,stamps,onStamp){',
   'function rs33DrawCourse(L,map,layer,groups,stamps,onStamp,revisits=[]){');
  replaceUnique(' const paths=groups.filter(group=>group.length>1);\n for(const g of groups){',
   ' const paths=groups.filter(group=>group.length>1);\n rs43DrawRails(L,layer,revisits);\n for(const g of groups){');
  replaceUnique('if(course)return rs33DrawCourse(Jo.default,a.current,r,course.groups,course.stamps,course.onStamp);',
   'if(course)return rs33DrawCourse(Jo.default,a.current,r,course.groups,course.stamps,course.onStamp,course.revisits);');
  replaceUnique('zIndexOffset:1400,interactive:true', 'zIndexOffset:6500,interactive:true');
  replaceUnique(' const groups=S.useMemo(()=>rs33Paths(current?.points),[current?.points]);',
   ' const groups=S.useMemo(()=>rs33Paths(current?.points),[current?.points]);\n const displayGroups=S.useMemo(()=>rs43CleanPaths(groups),[groups]);');
  replaceUnique(' const shownGroups=activeRoad?.groups||groups;',
   ' const shownGroups=activeRoad?.groups||displayGroups;\n const revisits=S.useMemo(()=>activeRoad?[]:rs43Revisits(displayGroups),[activeRoad,displayGroups]);');
  replaceUnique('position:ended?null:ride.position,points:current.points||[]',
   'position:ended?null:(ride.position||current.points?.at(-1)),points:current.points||[]');
  replaceUnique('course:{groups:shownGroups,stamps,fit,onStamp,focused}',
   'course:{groups:shownGroups,stamps,fit,onStamp,focused,revisits}');
  replaceUnique("rs33J('div',{className:'trip-map rs33-course-map'},path),",
`rs33J('div',{className:'trip-map rs33-course-map'},path,
    !ended?rs33J('button',{type:'button',className:'rs43-current-position','aria-label':'지도에서 내 현재 위치로 이동',onClick:()=>{
       const pos=ride.position||current?.points?.at(-1);
       if(!pos||!Number.isFinite(Number(pos.lat))||!Number.isFinite(Number(pos.lng))) {notify('현재 위치를 확인하는 중이에요.');ride.locate?.().catch(()=>{});return;}
       setFocused(null);
       const map=window.__rsMap;
       if(map)map.setView([Number(pos.lat),Number(pos.lng)],17,{animate:true});
     }},'◎ 내 위치'):null),`);
  replaceUnique("rs33J('div',{className:'rs33-course-footer'},\n     rs33J('div'",
"rs33J('div',{className:'rs33-course-footer'},\n     revisits.length?rs33J('div',{className:'rs43-revisit-key'},'청록 경로 · 오렌지 겹선은 재통과 추정 (2회/3회/4회 이상)'):null,\n     rs33J('div'");
  const cssPatch=`
/* Rider Spot v43 — clear live location + repeat-pass rails */
.rs33-course-map .rs-self-location{background:transparent!important;border:0!important;overflow:visible!important;pointer-events:auto}
.rs33-course-map .rs-self-halo{position:absolute;inset:0;border-radius:50%;background:#00a89b25;border:1.5px solid #00a89b70;box-shadow:0 0 0 8px #29c1ab14;pointer-events:none}
.rs33-course-map .rs-self-dot{position:absolute;top:7px;left:7px;width:24px;height:24px;box-sizing:border-box;border-radius:50%;background:#0cbaaa;border:4px solid white;box-shadow:0 0 0 2px #ff9a50,0 3px 12px #083c3980;pointer-events:none}
.rs33-course-map .rs-self-arrow{position:absolute;width:13px;height:13px;top:-4px;left:12px;clip-path:polygon(50% 0,100% 100%,0 75%);background:#ff9a50;filter:drop-shadow(0 1px 2px #60341477);pointer-events:none}
.rs33-course-map .rs-gps-accuracy{pointer-events:none}
.rs33-course-map .rs43-current-position{position:absolute;right:14px;bottom:54px;z-index:950;display:flex;align-items:center;justify-content:center;gap:7px;min-height:43px;padding:0 15px;border:1px solid #9bd9ca;border-radius:999px;color:#126d61;background:#fff;box-shadow:0 4px 18px #103e342b;font-size:13px;font-weight:850;letter-spacing:-.02em;cursor:pointer;touch-action:manipulation}
.rs33-course-map .rs43-current-position:focus-visible{outline:3px solid #ff9a50;outline-offset:2px}
.rs33-course-map .rs43-current-position:active{transform:scale(.97)}
.rs33-trip-detail .rs43-revisit-key{font-size:12px;line-height:1.45;color:#77604e;padding:7px 11px;margin:0 0 4px;border:1px solid #ffccaa;background:#fff5ed;border-radius:11px;font-weight:750}
@media(max-width:760px){.rs33-course-map .rs43-current-position{bottom:57px;right:14px}}
`;
  files[appPath]=[app,files[appPath][1]];
  files[cssPath]=[files[cssPath][0]+cssPatch,files[cssPath][1]];
  // Force the installed WebView and PWA to refresh their old cached JS and CSS.
  const oldAppRegex=/\/assets\/index-rider-v35-cb5dc21ec4b4\.js(?:\?[^"']*)?/g;
  const oldCssRegex=/\/rider-spot-design-v40-teal-orange\.css(?:\?[^"']*)?/g;
  if(!html.includes(appPath)||!html.includes(cssPath))throw Error('index references unexpected');
  html=html.replace(oldAppRegex,appPath+'?route=v43').replace(oldCssRegex,cssPath+'?route=v43');
  sw=sw.replace(/const CACHE='[^']+'/,"const CACHE='rider-spot-shell-2026-11-16-route-v43'");
  sw=sw.replace(/\/assets\/index-rider-v35-cb5dc21ec4b4\.js(?:\?[^"']*)?/g,appPath+'?route=v43');
  sw=sw.replace(/\/rider-spot-design-v40-teal-orange\.css(?:\?[^"']*)?/g,cssPath+'?route=v43');
  files['/index.html']=[html,files['/index.html'][1]];
  files['/sw.js']=[sw,files['/sw.js'][1]];
  const srcStart=raw.indexOf('\r\n\r\n')+4;
  const last=raw.lastIndexOf('\r\n--');
  if(srcStart<4||last<end)throw Error('Worker multipart boundaries invalid');
  const preamble=raw.slice(srcStart,st);
  const rest=raw.slice(end,last);
  const updated=preamble+'const files='+JSON.stringify(files)+rest;
  const checks={
    oauth:updated.includes('async function handleRiderSpotOAuth('),
    routeMatching:updated.includes('async function riderSpotMatchRoads('),
    nativeGPS:app.includes('riderspot:native-sqlite-points'),
    tripRecovery:updated.includes('/rider-gps-recovery-v42.js?gps=v42'),
    routeSimplification:app.includes('function rs43CleanPaths('),
    doubleRails:app.includes('rs43DrawRails(L,layer,revisits)'),
    liveLocation:app.includes('rs43-current-position'),
    mainScriptCacheBust:html.includes(appPath+'?route=v43'),
    styleCacheBust:html.includes(cssPath+'?route=v43'),
    serviceWorkerFresh:sw.includes('route-v43')&&sw.includes(appPath+'?route=v43'),
    noBackendTripChange:updated.includes("from(`trips`).upsert("),
    originalTripJS:app.includes('window.__rsRideApi=p')
  };
  if(!Object.values(checks).every(Boolean))throw Error('Refusing deploy; post-patch checks '+JSON.stringify(checks));
  try{new Function(app);}catch(e){throw Error('Main JS syntax error: '+e.message)}
  if(true)return {dryRun:true,checks,files:Object.keys(files).length,oldBytes:raw.length,newBytes:updated.length};
  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-15',bindings:[]})],{type:'application/json'}));
  form.append('worker.mjs',new Blob([updated],{type:'application/javascript+module'}),'worker.mjs');
  const deployed=await cloudflare.request({method:'PUT',path:scriptPath,body:form});
  return {success:deployed.success,errors:deployed.errors,modified:deployed.result?.modified_on,checks};
}