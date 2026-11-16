async()=>{
 const path='/accounts/'+accountId+'/workers/scripts/rider-spot';
 const raw=String(await cloudflare.request({method:'GET',path}));
 const firstBreak=raw.indexOf('\r\n'),boundary=raw.slice(0,firstBreak);
 const sourceBegin=raw.indexOf('\r\n\r\n')+4, sourceEnd=raw.lastIndexOf('\r\n'+boundary+'--');
 if(!boundary.startsWith('--')||sourceBegin<4||sourceEnd<sourceBegin)throw Error('Worker multipart format changed');
 const marker='const files=',at=raw.indexOf(marker,sourceBegin);
 if(at<sourceBegin||at>sourceEnd)throw Error('Worker assets missing');
 const st=at+marker.length;
 let depth=0,quote=false,escaped=false,end=-1;
 for(let i=st;i<sourceEnd;i++){
  const c=raw[i];
  if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quote=false;}
  else if(c==='"')quote=true;else if(c==='{')depth++;else if(c==='}'&&!--depth){end=i+1;break;}
 }
 if(end<0)throw Error('Asset JSON malformed');
 const files=JSON.parse(raw.slice(st,end));
 const src='/assets/index-rider-v35-cb5dc21ec4b4.js';
 const oldApp=files[src]?.[0],h=files['/index.html']?.[0],sw=files['/sw.js']?.[0];
 if(!oldApp||!h||!sw)throw Error('Source assets absent');
 if(files['/rider-spot-ui-v45.css'])throw Error('v45 already deployed; refusing duplicate');
 if(!h.includes(src+'?ui=v44')||!sw.includes(src+'?ui=v44')||!oldApp.includes('rs44-event-toggle'))throw Error('Expected production version v44 not found');
 if(!raw.slice(sourceBegin,at).includes('async function handleRiderSpotOAuth(')||!raw.slice(end,sourceEnd).includes('async function riderSpotMatchRoads('))throw Error('Backend preamble or roads handler missing');
 let app=oldApp;let changes=[];
 function exact(from,to,label){const count=app.split(from).length-1;if(count!==1)throw Error(label+': expected 1 match, got '+count);app=app.replace(from,to);changes.push(label)}
 exact('Jo.default.map(i.current,{zoomControl:!1}).setView(Xo,13)',
       'Jo.default.map(i.current,{zoomControl:!1,zoomSnap:0,zoomDelta:.25,touchZoom:!0,bounceAtZoomLimits:!1,zoomAnimation:!0}).setView(Xo,13)',
       'enableContinuousPinchZoom');
 exact("const [eventOpen,setEventOpen]=S.useState(()=>{try{return localStorage.getItem('rs:trip-events-open')==='1'}catch{return false}});",
       "const [eventOpen,setEventOpen]=S.useState(()=>{try{return localStorage.getItem('rs:trip-events-open')==='1'}catch{return false}});\n const [showStamps,setShowStamps]=S.useState(()=>{try{return localStorage.getItem('rs:route-time-stamps')!=='0'}catch{return true}});",
       'persistVisibilityPreference');
 exact("course:{groups:shownGroups,stamps,fit,onStamp,focused,revisits}",
       "course:{groups:shownGroups,stamps:showStamps?stamps:rs33NoRiders,fit,onStamp,focused:showStamps?focused:null,revisits}",
       'onlyShowVisibleStamps');
 exact('},[e,t,n,course?.groups]),(0,S.useEffect)',
       '},[e,t,n,course?.groups,course?.stamps]),(0,S.useEffect)',
       'redrawOnStampToggle');
 exact('function paintLabels(){\n  overlays.clearLayers();\n  const size=map.getSize();',
       'function paintLabels(){\n  overlays.clearLayers();\n  if(!stamps.length)return; // Path-only mode hides timestamps AND route chevrons.\n  const size=map.getSize();',
       'hideAllOverlaysWhenOff');
 exact(`rs33J('button',{type:'button',className:'rs33-expand','aria-expanded':expanded,onClick:()=>setExpanded(value=>!value)},expanded?'닫기':'크게 보기')),
    rs33J('div',{className:'trip-map rs33-course-map'}`,
       `rs33J('button',{type:'button',className:'rs33-expand','aria-expanded':expanded,onClick:()=>setExpanded(value=>!value)},expanded?'닫기':'크게 보기'),
     rs33J('button',{type:'button',className:'rs45-stamp-toggle','aria-pressed':showStamps,
       'aria-label':showStamps?'경로 시간 표시 숨기기':'경로 시간 표시 켜기',onClick:()=>{setShowStamps(value=>{
        const next=!value;try{localStorage.setItem('rs:route-time-stamps',next?'1':'0')}catch{}return next;
       });setFocused(null);}},showStamps?'시간 숨기기':'시간 켜기')),
    rs33J('div',{className:'trip-map rs33-course-map'}`,
       'addTimeVisibilityControl');
 exact("focused?rs33J('b',null,rs33Time(focused.time)+' · '+focused.label):null),",
       "showStamps&&focused?rs33J('b',null,rs33Time(focused.time)+' · '+focused.label):null),",
       'hideFocusedStampCaption');
 exact("stamps.length?rs33J('div',{className:'rs33-stamp-list','aria-label':'경로 시간 스탬프'}",
       "showStamps&&stamps.length?rs33J('div',{className:'rs33-stamp-list','aria-label':'경로 시간 스탬프'}",
       'hideStampChips');
 exact("rs33J('p',{className:'rs33-muted'},'지도에 표시할 GPS 시간이 없어요.'))),",
       "showStamps?rs33J('p',{className:'rs33-muted'},'지도에 표시할 GPS 시간이 없어요.'):null)),",
       'hideTimeChipsAndEmptyTextWhenOff');
 const newCss='/rider-spot-ui-v45.css';
 const css="/* Rider Spot v45 — smooth fractional zoom, optional timeline labels. */\n.app .rs33-course-controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;align-items:stretch}\n.app .rs33-course-controls button,.app .rs33-course-controls .rs33-expand{min-width:0;min-height:46px;padding:7px 2px!important;font-size:11px!important;line-height:1.25;white-space:nowrap;border-radius:14px!important}\n.app .rs33-course-controls .rs45-stamp-toggle{background:#fff!important;color:#255950;border-color:#cce5dc!important}\n.app .rs33-course-controls .rs45-stamp-toggle[aria-pressed=\"false\"]{background:#fff1e6!important;border-color:#ffbf91!important;color:#9f531d!important}\n.app .rs33-course-controls .rs45-stamp-toggle:focus-visible{outline:3px solid #ff9a50;outline-offset:2px}\n/* Respect Leaflet's own pointer gestures; prevent the browser page from zooming instead of the map. */\n.app .trip-map.rs33-course-map .leaflet-container,.app .rs33-map-wrap .leaflet-container{touch-action:none}\n@media(min-width:600px){.app .rs33-course-controls{gap:10px}.app .rs33-course-controls button,.app .rs33-course-controls .rs33-expand{font-size:13px!important}}\n@media(max-width:340px){.app .rs33-course-controls{gap:4px}.app .rs33-course-controls button,.app .rs33-course-controls .rs33-expand{font-size:10.5px!important}}\n";
 if(css.length<900||!css.includes('.rs45-stamp-toggle'))throw Error('CSS corrupted');
 files[src][0]=app;
 files[newCss]=[css,'text/css; charset=utf-8'];
 const oldSrc=src+'?ui=v44',newSrc=src+'?ui=v45';
 const newHtml=h.replace(oldSrc,newSrc).replace('</head>','<link rel="stylesheet" href="'+newCss+'?ui=v45"/></head>');
 if(newHtml===h||!newHtml.includes(newCss+'?ui=v45'))throw Error('HTML CSS insertion failed');
 files['/index.html'][0]=newHtml;
 const cache=(sw.match(/const CACHE='([^']+)'/)||[])[1];
 if(!cache||!sw.includes(oldSrc))throw Error('Service Worker entry changed');
 const newCache='rider-spot-shell-2026-11-16-ui-v45-zoom-stamps';
 const nextSw=sw.replace("const CACHE='"+cache+"'","const CACHE='"+newCache+"'")
   .replace(JSON.stringify(oldSrc),JSON.stringify(newSrc))
   .replace('const CORE=[','const CORE=['+JSON.stringify(newCss+'?ui=v45')+',');
 if(!nextSw.includes(newCss+'?ui=v45')||!nextSw.includes(newSrc))throw Error('SW cache failed');
 files['/sw.js'][0]=nextSw;
 const updated=raw.slice(sourceBegin,at)+marker+JSON.stringify(files)+raw.slice(end,sourceEnd);
 const checks={auth:updated.includes('async function handleRiderSpotOAuth('),roads:updated.includes('async function riderSpotMatchRoads('),gps:app.includes('riderspot:native-sqlite-points')&&newHtml.includes('rider-gps-recovery-v42.js'),maintenance:newHtml.includes('rider-maintenance-v40-teal-defaults.js'),events:app.includes('rs44-event-toggle'),routeRails:app.includes('rs43DrawRails'),continuousZoom:app.includes('zoomSnap:0,zoomDelta:.25'),button:app.includes('rs45-stamp-toggle'),stampRedraw:app.includes('[e,t,n,course?.groups,course?.stamps]'),hideArrows:app.includes('if(!stamps.length)return; // Path-only'),html:newHtml.includes(newSrc)&&newHtml.includes(newCss),sw:nextSw.includes(newCache)&&nextSw.includes(newCss),sameTripStorage:raw.includes('riderspot:native-sqlite-points'),preamble:updated.includes('getIndustryNews')};
 if(Object.values(checks).some(v=>v!==true))throw Error('Regression check failed '+JSON.stringify(checks));
 if(false)return {dryRun:true,checks,changes,before:oldApp.length,after:app.length,cache};
 const metadata={main_module:'worker.mjs',compatibility_date:'2026-11-15',bindings:[]};
 const form=new FormData();
 form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 form.append('worker.mjs',new Blob([updated],{type:'application/javascript+module'}),'worker.mjs');
 const out=await cloudflare.request({method:'PUT',path,body:form});
 return {success:out.success,errors:out.errors,modified:out.result?.modified_on,checks,changes};
}