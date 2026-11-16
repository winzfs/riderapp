async () => {
  const workerPath='/accounts/'+accountId+'/workers/scripts/rider-spot';
  const raw=String(await cloudflare.request({method:'GET',path:workerPath}));
  const firstBreak=raw.indexOf('\r\n');
  const boundary=raw.slice(0,firstBreak);
  const sourceBegin=raw.indexOf('\r\n\r\n')+4;
  const sourceEnd=raw.lastIndexOf('\r\n'+boundary+'--');
  if(!boundary.startsWith('--') || sourceBegin<4 || sourceEnd<=sourceBegin) throw Error('Worker multipart format changed; abort');
  const marker='const files=',at=raw.indexOf(marker,sourceBegin);
  if(at<sourceBegin||at>sourceEnd)throw Error('Worker asset table missing');
  const begin=at+marker.length;
  let depth=0,quote=false,escaped=false,end=-1;
  for(let i=begin;i<sourceEnd;i++){
    const c=raw[i];
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quote=false;}
    else if(c==='"')quote=true;
    else if(c==='{')depth++;
    else if(c==='}'&&!--depth){end=i+1;break;}
  }
  if(end<0)throw Error('Asset JSON not terminated');
  const files=JSON.parse(raw.slice(begin,end));
  const oldJs=files['/assets/index-rider-v35-cb5dc21ec4b4.js']?.[0];
  const html=files['/index.html']?.[0];
  const sw=files['/sw.js']?.[0];
  if(!oldJs||!html||!sw||files['/rider-spot-ui-v44.css'])throw Error('Required files missing or UI v44 already deployed');
  if(!raw.slice(sourceBegin,at).includes('async function handleRiderSpotOAuth('))throw Error('OAuth source preamble missing');
  if(!raw.includes('async function riderSpotMatchRoads(')||!raw.includes('getIndustryNews'))throw Error('Important worker routes missing');
  if(!oldJs.includes('rs43DrawRails')||!oldJs.includes('riderspot:native-sqlite-points')||!html.includes('/rider-gps-recovery-v42.js'))throw Error('GPS source version not expected');
  let app=oldJs;
  const edits=[];
  function exact(from,to,label){
    const count=app.split(from).length-1;
    if(count!==1)throw Error('UI source '+label+' expected once, got '+count);
    app=app.replace(from,to);
    edits.push(label);
  }
  exact(' const [allDays,setAllDays]=S.useState(false);\n',
` const [allDays,setAllDays]=S.useState(false);\n const [eventOpen,setEventOpen]=S.useState(()=>{try{return localStorage.getItem('rs:trip-events-open')==='1'}catch{return false}});\n`,
'eventDisclosureState');
  exact(`    rs33J('h2',null,'운행 이벤트'),
    rs33J('ol',{className:'timeline'},...(current.events||[]).map((event,i)=>rs33J('li',{key:i},
      rs33J('span',{className:'timeline-dot'}),rs33J('time',null,rs33Timestamp(event.at)?rs33Time(event.at):'—'),rs33J('strong',null,event.type)))),`,
`    rs33J('section',{className:'rs44-events'},
     rs33J('button',{type:'button',className:'rs44-event-toggle','aria-expanded':eventOpen,'aria-controls':'rs44-event-list',
      onClick:()=>{const value=!eventOpen;setEventOpen(value);try{localStorage.setItem('rs:trip-events-open',value?'1':'0')}catch{}}},
      rs33J('span',null,'운행 이벤트'),
      rs33J('span',{className:'rs44-count'},(current.events||[]).length+'개'),
      rs33J('span',{className:'rs44-chevron','aria-hidden':true},eventOpen?'⌃':'⌄')),
     eventOpen?rs33J('ol',{id:'rs44-event-list',className:'timeline rs44-event-list'},...(current.events||[]).map((event,i)=>rs33J('li',{key:i},
      rs33J('span',{className:'timeline-dot'}),rs33J('time',null,rs33Timestamp(event.at)?rs33Time(event.at):'—'),rs33J('strong',null,event.type)))):null),`,
'eventDisclosureReact');
  exact('p.trip&&e!==`trips`&&(0,J.jsxs)(`button`,{className:`recording-strip`',
        'p.trip&&e!==`trips`&&e!==`nearby`&&e!==`tools`&&(0,J.jsxs)(`button`,{className:`recording-strip`',
        'removeDuplicateBannerOnMapAndWork');
  exact('p.paused?`휴식 중`:`운행 기록 중`,` · `,p.trip.distance_km.toFixed(1),` km `',
        'p.paused?`일시정지`:`운행 중`,` · `,p.trip.distance_km.toFixed(1),` km `',
        'shortenBanner');
  exact('roadBusy?\'도로 확인 중…\':activeRoad?\'원본 GPS 보기\':\'도로에 맞춰 보기\'',
        'roadBusy?\'확인 중…\':activeRoad?\'원본 경로\':\'도로 보정\'',
        'compactRoadButton');
  exact("ended?null:rs33J('p',{className:'rs33-muted'},'다른 앱으로 전환하거나 화면을 잠그면 GPS 기록에 공백이 생길 수 있어요.'),",
        "ended?null:rs33J('p',{className:'rs33-muted'},'운행 경로는 기기에 기록 중입니다. GPS 저장 상태를 확인할 수 있어요.'),",
        'modernizeGpsNote');
  const newStyle='/rider-spot-ui-v44.css';
  const sheet="/* Rider Spot v44 — compact mint / citrus interface. Presentation only.\n   Tracks, event payloads, persisted records and Android bridge are untouched. */\n:root {\n  --rs44-canvas:#f6faf8;\n  --rs44-paper:#ffffff;\n  --rs44-mint:#e7f5f0;\n  --rs44-mint-line:#cce5dc;\n  --rs44-teal:#218c7d;\n  --rs44-deep:#143d35;\n  --rs44-text:#1a3932;\n  --rs44-muted:#637d75;\n  --rs44-orange:#ff9a50;\n  --rs44-orange-soft:#fff1e6;\n  --rs44-line:#dbe8e2;\n  --rs44-shadow:0 5px 22px rgba(16,65,54,.043);\n}\n.app{background:var(--rs44-canvas);color:var(--rs44-text)}\n.app .workspace>main{min-width:0;overflow:visible}\n.app :is(button,a,input,select){-webkit-tap-highlight-color:transparent}\n.app button:focus-visible,.app a:focus-visible{outline:2px solid var(--rs44-orange);outline-offset:3px}\n.app > header {background:rgba(250,253,251,.96);border-bottom:1px solid #e4ece8;backdrop-filter:blur(12px)}\n.app .brand{letter-spacing:-.035em}\n/* The recording strip was position:absolute top:57px; it covered real controls. */\n.app .workspace>main>.recording-strip{\n position:relative!important;inset:auto!important;top:auto!important;left:auto!important;right:auto!important;\n transform:none!important;z-index:2!important;box-sizing:border-box!important;\n width:calc(100% - 32px)!important;max-width:980px;margin:12px auto 8px!important;\n min-height:48px;display:flex;align-items:center;gap:9px;flex-wrap:nowrap;\n padding:9px 13px!important;background:var(--rs44-mint)!important;color:#1f564a;\n border:1px solid var(--rs44-mint-line);border-radius:16px;\n font-size:13px;line-height:1.3;font-weight:680;box-shadow:none;\n}\n.app .workspace>main>.recording-strip span{flex:none;width:7px;height:7px;border-radius:50%;background:var(--rs44-teal)}\n.app .workspace>main>.recording-strip strong{flex:none;margin-left:auto;color:var(--rs44-deep);font-size:12px;white-space:nowrap}\n/* Timeline top controls — three actions on one line, not a staggered block. */\n.app .rs33-trip-detail{max-width:1010px;padding-top:14px}\n.app .rs33-trip-detail .trip-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px}\n.app .rs33-trip-detail .trip-heading .back{font-size:12px;min-height:36px;padding:6px 0;background:none;border:0;color:var(--rs44-muted)}\n.app .rs33-trip-detail .trip-heading h1{font-size:clamp(21px,5.5vw,26px);line-height:1.18;font-weight:900;color:var(--rs44-deep);letter-spacing:-.04em}\n.app .rs33-state{border-radius:999px;padding:8px 12px;background:var(--rs44-mint);color:#176657;font-size:13px}\n.app .rs33-course-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:0;margin:0 0 10px}\n.app .rs33-course-controls button,\n.app .rs33-course-controls .rs33-expand{\n min-width:0;min-height:46px!important;width:100%;padding:7px 5px!important;\n font-size:12px!important;font-weight:790;border-radius:15px!important;border:1px solid var(--rs44-line)!important;\n white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:#fff;color:var(--rs44-deep);box-shadow:none!important\n}\n.app .rs33-course-controls button:first-child{background:var(--rs44-mint);border-color:var(--rs44-mint-line)!important}\n.app .rs33-course-controls button[aria-pressed=true]{background:var(--rs44-orange-soft);color:#995122;border-color:#f7caab!important}\n.app .rs33-trip-detail .rs33-course-map{border-radius:24px;box-shadow:var(--rs44-shadow);border:1px solid var(--rs44-line)}\n.app .rs33-course-footer{background:transparent;padding:10px 0 6px;display:grid;gap:9px}\n.app .rs33-course-legend{display:flex;gap:8px;align-items:center;margin:0}\n.app .rs33-course-legend small{color:var(--rs44-muted)}\n.app .rs33-stamp-list{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px 0 5px}\n.app .rs33-stamp-list::-webkit-scrollbar{display:none}\n.app .rs33-stamp-list button{flex:none;border:1px solid var(--rs44-line);border-radius:13px;padding:9px 13px;background:#fff;color:var(--rs44-deep);font-size:12px;min-height:43px;white-space:nowrap}\n.app .rs33-trip-summary{padding:20px 18px;border:1px solid var(--rs44-mint-line);border-radius:23px;background:linear-gradient(145deg,#e7f5f0,#e4f3ed);box-shadow:none;display:grid;gap:8px}\n.app .rs33-trip-summary strong{font-size:clamp(27px,6vw,36px);letter-spacing:-.04em;line-height:1.1;color:var(--rs44-deep)}\n.app .rs33-trip-summary span{color:var(--rs44-muted);font-size:13px}\n.app .rs33-trip-body>.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}\n.app .rs33-trip-body>.actions button{width:100%;min-height:51px;border-radius:16px;font-weight:850}\n.app .rs33-trip-body>.actions .primary{background:var(--rs44-orange);color:#3d2716;border:1px solid #f6a76e}\n.app .rs33-trip-body>.actions .secondary{background:#fff;color:var(--rs44-teal);border:1px solid var(--rs44-line)}\n.app .rs33-trip-body>.rs33-muted{font-size:12px;line-height:1.55;color:var(--rs44-muted)}\n.app .rs-gps-capture-state{padding:10px 14px;margin:6px 0 0;border-radius:14px;box-shadow:none;font-size:12px;line-height:1.5}\n.app .rs43-revisit-key{font-size:12px;border-radius:13px;margin:0}\n/* React-owned, accessible disclosure for ride events. */\n.app .rs44-events{border:1px solid var(--rs44-line);border-radius:20px;background:var(--rs44-paper);overflow:hidden;box-shadow:var(--rs44-shadow)}\n.app .rs44-event-toggle{display:flex;align-items:center;gap:10px;width:100%;min-height:62px;\n padding:15px 18px;background:#fff;border:0;text-align:left;color:var(--rs44-deep);font-size:16px;font-weight:870}\n.app .rs44-event-toggle .rs44-count{margin-left:auto;font-size:12px;color:var(--rs44-muted);background:#f1f6f3;border:1px solid var(--rs44-line);border-radius:999px;padding:5px 9px}\n.app .rs44-event-toggle .rs44-chevron{font-size:16px;color:var(--rs44-teal)}\n.app .rs44-event-list{margin:0!important;padding:4px 16px 10px 24px;background:#fff;border-top:1px solid var(--rs44-line)}\n.app .rs44-event-list li{padding:14px 0;border-bottom:1px solid #edf2ef;min-width:0}\n.app .rs44-event-list li:last-child{border-bottom:0}\n.app .rs44-event-list time{flex:none;color:var(--rs44-muted)}\n.app .rs44-event-list strong{color:var(--rs44-deep);line-height:1.45;overflow-wrap:anywhere}\n/* Main map: keep three-finger distractions from obscuring the map. */\n.app .rs33-map-bar{padding-top:10px;padding-bottom:7px;gap:8px;background:transparent}\n.app .rs33-map-bar-top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:4px}\n.app .rs33-map-bar-top h1{font-size:clamp(23px,6vw,28px);color:var(--rs44-deep)}\n.app .rs33-map-share{min-height:44px;border:1px solid var(--rs44-line);background:#fff;border-radius:999px;padding:0 14px;color:var(--rs44-deep);font-weight:790}\n.app .rs33-map-share.active{border-color:var(--rs44-mint-line);background:var(--rs44-mint);color:#086b59}\n.app .rs33-region-toggle{min-height:40px;border-radius:999px;background:#fff;border:1px solid var(--rs44-line);color:var(--rs44-deep);padding:0 14px}\n.app .rs33-map-filters{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none;padding:2px 0 6px;margin:0}\n.app .rs33-map-filters::-webkit-scrollbar{display:none}\n.app .rs33-map-filters button{flex:0 0 auto;min-height:39px;border-radius:999px;border:1px solid var(--rs44-line);padding:7px 13px;color:var(--rs44-muted);background:#fff;font-size:12px;font-weight:820}\n.app .rs33-map-filters button[aria-pressed=true]{background:var(--rs44-mint);color:#145b4e;border-color:#b5dccd}\n.app .nearby.nearby-full .rs33-map-wrap{border-radius:24px;border:1px solid var(--rs44-line);box-shadow:var(--rs44-shadow)}\n.app .nearby.nearby-full .rs33-map-wrap .rs-gps-state{top:11px;left:11px;max-width:calc(100% - 106px);padding:8px 11px;border-radius:14px;font-size:11px}\n.app .nearby.nearby-full .rs33-map-wrap #rs-presence-btn{top:55px;border-radius:14px;max-width:150px}\n.app .nearby.nearby-full .rs33-map-wrap #rs-demo-toggle{top:106px;border-radius:14px;max-width:160px}\n.app .nearby .map-wrap #rs-sos-fab{bottom:90px!important}\n/* Work: two separate 'recording' calls were stacking. Keep the hub's own compact one. */\n.app .rs-tools-route #rs-tools .rs33-work-running{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;\n padding:14px;border:1px solid var(--rs44-mint-line);border-radius:18px;background:var(--rs44-mint);width:100%;box-sizing:border-box}\n.app .rs-tools-route #rs-tools .rs33-work-running > div{min-width:0;display:grid;grid-template-columns:1fr;gap:3px}\n.app .rs-tools-route #rs-tools .rs33-work-running strong{white-space:normal;word-break:keep-all;overflow-wrap:anywhere;font-size:14px}\n.app .rs-tools-route #rs-tools .rs33-work-running button{width:100%;min-width:0;min-height:46px;border-radius:14px}\n.app .rs-tools-route #rs-tools .rs33-work-quick{gap:8px;background:transparent;padding:0;margin:10px 0}\n.app .rs-tools-route #rs-tools .rs33-work-quick button{border:1px solid var(--rs44-line);border-radius:14px;background:#fff;min-height:48px}\n.app .rs-tools-route #rs-tools .rs33-work-utilities{gap:8px}\n.app .rs-tools-route #rs-tools .rs33-work-utilities button{min-height:56px;border:1px solid var(--rs44-line);border-radius:14px;background:#fff}\n.app .rs-tools-route #rs-tools .rs33-work-amount{border-radius:22px;box-shadow:none;padding:18px 20px}\n.app .rs-tools-route #rs-tools .rs33-work-overview{gap:10px}\n.app .rs-tools-route #rs-tools .rs33-work-summary-head{gap:8px;flex-wrap:wrap}\n.app .rs-tools-route #rs-tools .rs33-work-platforms{border:1px solid var(--rs44-line);background:#fff;border-radius:20px;padding:0 14px}\n/* Community: visual hierarchy without extra navigation. */\n.app .rc-community.rc-community-v32{padding-top:14px}\n.app .rc-community .rc-head{margin-bottom:14px;gap:12px}\n.app .rc-community .rc-head h1{font-size:clamp(25px,6vw,30px);margin:0;color:var(--rs44-deep)}\n.app .rc-community .rc-head .rc-write{min-height:44px;border-radius:15px;background:var(--rs44-teal);font-size:13px;white-space:nowrap}\n.app .rc-community .rc-controls{display:grid;gap:11px}\n.app .rc-community .rc-search{height:48px;border-radius:16px;background:#fff;border:1px solid var(--rs44-line)}\n.app .rc-community .rc-search input{background:transparent}\n.app .rc-community .rc-filter-row{gap:10px}\n.app .rc-community .rc-area-button,.app .rc-community .rc-filter-row select{min-height:42px;border:1px solid var(--rs44-line);background:#fff;border-radius:14px}\n.app .rc-community .rc-tabs{gap:8px}\n.app .rc-community .rc-tabs button{border-radius:999px;min-height:41px;border:1px solid var(--rs44-line);background:#fff}\n.app .rc-community .rc-tabs button[aria-pressed=true]{background:var(--rs44-mint);border-color:var(--rs44-mint-line);color:#145b4e}\n.app .rc-community .rc-card,.app .rc-community article{border-radius:23px;border:1px solid var(--rs44-line);background:#fff;box-shadow:none}\n/* Bottom navigation should never cover the last actions. */\n.app .bottom-nav{background:rgba(255,255,255,.97);border-top:1px solid #e2ebe6;backdrop-filter:blur(18px)}\n.app .bottom-nav button{border-radius:18px;font-size:11px}\n.app .bottom-nav button.active{background:var(--rs44-mint);color:#155f55}\n@media(max-width:700px){\n .app .workspace>main>.recording-strip{width:calc(100% - 28px)!important}\n .app .rs33-course-controls{grid-template-columns:repeat(3,minmax(0,1fr))}\n .app .rs33-course-controls button{font-size:12px!important}\n .app .rs33-trip-detail{padding-inline:14px;padding-bottom:calc(100px + env(safe-area-inset-bottom,0px))}\n .app .rc-community{padding-bottom:calc(108px + env(safe-area-inset-bottom,0px))}\n .app .rs33-trip-body>.actions button{min-width:0}\n}\n@media(max-width:355px){\n .app .rs33-course-controls button{font-size:11px!important;padding-inline:3px!important}\n .app .rc-community .rc-head h1{font-size:24px}\n}\n";
  if(sheet.length<7500||!sheet.includes('.rs44-event-toggle')||!sheet.includes('.recording-strip'))throw Error('Style integrity check failed');
  files[newStyle]=[sheet,'text/css; charset=utf-8'];
  files['/assets/index-rider-v35-cb5dc21ec4b4.js'][0]=app;
  const oldSrc=(html.match(/\/assets\/index-rider-v35-cb5dc21ec4b4\.js\?[^"']+/)||[])[0];
  if(!oldSrc || sw.indexOf(JSON.stringify(oldSrc))<0)throw Error('HTML/Service Worker entry mismatch');
  const newSrc='/assets/index-rider-v35-cb5dc21ec4b4.js?ui=v44';
  const oldCss=(html.match(/\/rider-spot-design-v40-teal-orange\.css\?[^"']+/)||[])[0];
  if(!oldCss)throw Error('Current theme asset missing');
  const newCss='/rider-spot-design-v40-teal-orange.css?ui=v44';
  const newHtml=html.replace(oldSrc,newSrc).replace(oldCss,newCss)
     .replace('</head>','<link rel="stylesheet" href="'+newStyle+'?ui=v44"/></head>');
  if(newHtml===html||newHtml.split(newStyle).length!==2)throw Error('HTML new asset not linked');
  files['/index.html'][0]=newHtml;
  const oldCache=(sw.match(/const CACHE='([^']+)'/)||[])[1];
  if(!oldCache)throw Error('Service Worker cache scheme unknown');
  const newCache='rider-spot-shell-2026-11-16-ui-v44';
  let nextSw=sw.replace("const CACHE='"+oldCache+"'","const CACHE='"+newCache+"'");
  nextSw=nextSw.replace(JSON.stringify(oldSrc),JSON.stringify(newSrc));
  if(nextSw===sw||!nextSw.includes(newSrc))throw Error('Service Worker main script did not update');
  nextSw=nextSw.replace('const CORE=[','const CORE=['+JSON.stringify(newStyle+'?ui=v44')+','+JSON.stringify(newCss)+',');
  files['/sw.js'][0]=nextSw;
  const updated=raw.slice(sourceBegin,at)+marker+JSON.stringify(files)+raw.slice(end,sourceEnd);
  const verify={
   eventReact:app.includes('className:\'rs44-event-toggle\'')&&app.includes('eventOpen?rs33J(\'ol\''),
   eventsClosedByDefault:app.includes("localStorage.getItem('rs:trip-events-open')==='1'"),
   stickyStripRemoved:app.includes('e!==`nearby`&&e!==`tools`'),
   gpsNative:app.includes('riderspot:native-sqlite-points')&&updated.includes('/rider-gps-recovery-v42.js'),
   mapRails:app.includes('function rs43DrawRails('),
   maintenance:updated.includes('rider-maintenance-v40-teal-defaults.js'),
   existingAuth:updated.includes('async function handleRiderSpotOAuth('),
   existingRoads:updated.includes('async function riderSpotMatchRoads('),
   existingIndustry:updated.includes('getIndustryNews'),
   html:newHtml.includes(newSrc)&&newHtml.includes(newStyle),
   serviceWorker:nextSw.includes(newCache)&&nextSw.includes(newSrc)&&nextSw.includes(newStyle),
   theme:sheet.includes('--rs44-orange'),
   preservedBackendPreamble:updated.startsWith(raw.slice(sourceBegin,at)),
   preservedBackendTail:updated.endsWith(raw.slice(end,sourceEnd))
  };
  if(Object.values(verify).some(x=>!x))throw Error('Preflight checks failed '+JSON.stringify(verify));
  if(false)return {dryRun:true,checks:verify,edited:edits,oldScriptBytes:oldJs.length,newScriptBytes:app.length,assetCount:Object.keys(files).length,oldCache,newCache,workerBytes:updated.length};
  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-15',bindings:[]})],{type:'application/json'}));
  form.append('worker.mjs',new Blob([updated],{type:'application/javascript+module'}),'worker.mjs');
  const result=await cloudflare.request({method:'PUT',path:workerPath,body:form});
  return {success:result.success,errors:result.errors,modified:result.result?.modified_on,checks:verify,edited:edits};
}