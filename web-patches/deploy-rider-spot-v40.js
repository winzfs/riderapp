async () => {
  const path='/accounts/'+accountId+'/workers/scripts/rider-spot';
  const raw=String(await cloudflare.request({method:'GET',path}));
  const marker='const files=',at=raw.indexOf(marker);
  if(at<0) throw Error('Source has no asset table');
  const begin=at+marker.length;
  let depth=0,inString=false,escaped=false,end=-1;
  for(let i=begin;i<raw.length;i++) {
    const ch=raw[i];
    if(inString){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')inString=false;}
    else if(ch==='"')inString=true;
    else if(ch==='{')depth++;
    else if(ch==='}'&&!--depth){end=i+1;break;}
  }
  if(end<0)throw Error('Asset table truncation');
  const files=JSON.parse(raw.slice(begin,end));
  const oldMaint='/rider-maintenance-v33-935844ed0ab9.js';
  const newMaint='/rider-maintenance-v40-teal-defaults.js';
  const newCSS='/rider-spot-design-v40-teal-orange.css';
  const newShell='/rider-spot-shell-v40.js';
  const html=files['/index.html'][0];
  const sw=files['/sw.js'][0];
  if(files[newCSS] || files[newMaint] || files[newShell] || !html.includes(oldMaint) || !sw.includes(oldMaint)) throw Error('v40 already installed or source mismatch');
  if(!raw.includes('async function handleRiderSpotOAuth(') || !raw.includes('async function riderSpotMatchRoads(')) throw Error('Preserve existing OAuth + road-match handlers');
  let maint=files[oldMaint][0];
  const exact=(from,to) => {
    const n=maint.split(from).length-1;
    if(n!==1) throw Error('Maintenance patch match count '+n+' for '+from.slice(0,100));
    maint=maint.replace(from,to);
  };
  const defaults=String.raw`const RS_DEFAULTS={
  "엔진오일":{km:6000,days:365,cost:25000},
  "에어필터":{km:18000,cost:25000},
  "브레이크 패드":{cost:45000},
  "앞 타이어":{cost:80000},
  "뒤 타이어":{cost:100000},
  "구동벨트":{km:24000,cost:130000},
  "점화플러그":{km:12000,cost:25000},
  "배터리":{cost:80000}
};
`;
  exact('const T={client:',defaults+'const T={client:');
  exact('const choice=items.includes(T.selected)?T.selected:"기타",rule=data.cycles.get(T.selected)||{};',
        'const choice=items.includes(T.selected)?T.selected:"기타",rule=data.cycles.get(T.selected)||{},estimate=RS_DEFAULTS[T.selected]||{};');
  exact('E(p.interval??"")','E(p.interval??RS_DEFAULTS[name]?.km??"")');
  exact('E(p.days??"")','E(p.days??RS_DEFAULTS[name]?.days??"")');
  exact('E(rule.interval_km??"")','E(rule.interval_km??estimate.km??"")');
  exact('E(rule.interval_days??"")','E(rule.interval_days??estimate.days??"")');
  exact('inputmode="numeric" placeholder="0원도 가능"',
        'inputmode="numeric" value="\'+E(estimate.cost??"" )+\'" placeholder="실제 정비 비용으로 수정"');
  exact('<small>\'+E(source)+\'</small>',
        '<small>\'+E(source+(RS_DEFAULTS[name]?.cost?" · 예상 "+fmt(RS_DEFAULTS[name].cost)+"원":""))+\'</small>');
  exact('정비 빠르게 기록</h3><span>오늘 날짜 자동</span></div><form',
        '정비 빠르게 기록</h3><span>참고값 자동 입력</span></div><p class="rmm-note">주기와 비용은 스쿠터용 예시값입니다. 정비소 비용·연식·실제 마모 상태에 맞게 수정한 뒤 저장하세요.</p><form');
  exact('부품을 선택하면 다음 교체 예상 거리와 마지막 기록을 확인할 수 있어요.',
        '부품별 교체 주기와 예상 비용을 확인할 수 있어요. 실제 주행 환경과 마모 상태를 우선해 주세요.');
  if(!maint.includes('RS_DEFAULTS') || !maint.includes('estimate.cost') || !maint.includes('p.interval??RS_DEFAULTS'))throw Error('Maintenance result missing defaults');
  files[newMaint]=[maint,'application/javascript; charset=utf-8'];
  const css="/* Rider Spot v40 | mint + citrus minimal system | 2026-11-16 */\n:root {\n  color-scheme: light;\n  --paper:#fff;\n  --canvas:#f5faf8;\n  --ink:#173730;\n  --muted:#6b817b;\n  --border:#dceae6;\n  --green:#238f81;\n  --green-deep:#155f55;\n  --mint:#e1f4ee;\n  --mint-line:#c3e7dc;\n  --radius:20px;\n  --shadow:0 5px 22px rgba(23,64,55,.055);\n  --rs33-ink:#173730;\n  --rs33-muted:#6b817b;\n  --rs33-line:#dceae6;\n  --rs33-soft:#f5faf8;\n  --rs33-mint:#e1f4ee;\n  --rs33-accent:#238f81;\n  --rs33-dark:#155f55;\n  --rc-ink:#173730;\n  --rs-orange:#ff9a50;\n  --rs-orange-ink:#733c11;\n  --rs-orange-soft:#fff1e4;\n}\nhtml,body,.app {background:#f5faf8;color:#173730}\n.app, .app input, .app select, .app textarea, .app button {font-family: 'Noto Sans KR',system-ui,-apple-system,sans-serif}\n.app > header {\n  background:rgba(255,255,255,.97);\n  border-bottom:1px solid #e7efec;\n  box-shadow:0 1px 0 rgba(30,69,58,.025);\n  padding-inline:clamp(16px,3vw,30px);\n}\n.app .brand {font-weight:850;letter-spacing:-.055em;color:#173730;white-space:nowrap}\n.app .brand-dot {background:#238f81;border-radius:12px;box-shadow:none}\n.app > header .header-user {border-radius:12px;min-width:42px;background:#fff}\n.app .workspace>main {background:#f5faf8}\n.app :is(.page,.trip-page,#rs-tools,.rc-community) {color:#173730}\n.app :is(.rs33-title h1,.rs33-map-bar h1,.rs33-work-title h1,.rc-community .rc-head h1) {font-weight:850;letter-spacing:-.048em;color:#173730}\n.app :is(.rs33-title .primary,.rs33-trip-body .primary,.rs33-income-link,#rs-tools .rmm-save) {\n  background:#ff9a50;\n  color:#563313;\n  border:1px solid #fca462;\n  box-shadow:none;\n  font-weight:850;\n}\n.app :is(.rs33-title .primary,.rs33-trip-body .primary,.rs33-income-link,#rs-tools .rmm-save):not(:disabled):hover {\n  background:#ffad72;color:#563313;\n}\n.app :is(.primary,.secondary,.rs33-course-controls button,.rc-apply-button) {border-radius:14px}\n.app .secondary {background:#fff;color:#155f55;border-color:#dceae6}\n.app :is(button,a,input,select,textarea):focus-visible {outline:2px solid #f9944b;outline-offset:3px}\n.app input:focus,.app select:focus,.app textarea:focus {border-color:#57bdab;box-shadow:0 0 0 3px rgba(87,189,171,.15)}\n.app .desktop-nav {background:#fff;border-color:#e3eee9}\n.app .desktop-nav>button.active {background:#e1f4ee;color:#155f55}\n.app .rs33-map-bar {background:transparent}\n.app .rs33-map-bar-top {gap:12px}\n.app .rs33-map-share,.app .rs33-map-bar .rs33-region-toggle {\n  min-height:42px;border-radius:16px;border-color:#dceae6;background:#fff;\n  color:#1b453c;box-shadow:0 2px 8px rgba(32,83,72,.035);\n}\n.app .rs33-map-share.active {background:#e1f4ee;color:#155f55;border-color:#b9e1d4}\n.app .rs33-map-filters {gap:8px;scrollbar-width:none}\n.app .rs33-map-filters::-webkit-scrollbar {display:none}\n.app .rs33-map-filters button {\n  min-height:40px;padding-inline:14px;border-radius:14px;\n  background:#fff;border:1px solid #e0eae6;color:#5f7870;\n  font-size:13px;font-weight:750;box-shadow:0 1px 4px rgba(21,67,54,.025)\n}\n.app .rs33-map-filters button[aria-pressed=true] {background:#e1f4ee;border-color:#addccd;color:#155f55}\n.app .nearby.nearby-full .rs33-map-wrap {\n  border-radius:24px;border:1px solid #deebe7;\n  box-shadow:0 4px 20px rgba(27,77,66,.06);\n  overflow:hidden;\n}\n.app .rs33-map-wrap :is(.leaflet-control-zoom,.leaflet-control-attribution) {border-radius:13px!important;overflow:hidden}\n.app .rs33-map-wrap .leaflet-control-zoom a {border-color:#e3eeea!important;color:#276c60!important;background:#fff!important}\n.app .rs33-map-wrap :is(.rs-gps-state,#rs-presence-btn,#rs-demo-toggle,#rs-report-legend) {\n  border-radius:14px!important;\n  border:1px solid #e1ece7!important;\n  box-shadow:0 3px 12px rgba(20,61,51,.07)!important;\n}\n.app .nearby .map-wrap #rs-sos-fab {border-radius:16px;box-shadow:0 5px 18px rgba(179,74,73,.22)}\n.app :is(.rs33-timeline .rs33-week-head,.rs33-timeline .rs33-week,.rs33-timeline .rs33-list,.rs33-trip-summary,.rs33-trip-body .stats) {\n  border-color:#e1ece7;\n}\n.app .rs33-week-head {border-radius:20px 20px 0 0}\n.app .rs33-week {border-radius:0 0 20px 20px}\n.app .rs33-course-shell {border-radius:22px;border-color:#deebe7;box-shadow:0 3px 18px rgba(24,77,65,.055)}\n.app .rs33-trip-body :is(.trip-details,.rs33-trip-summary,.rs33-trip-memo,.timeline) {border-radius:18px}\n.app .rs33-course-controls button {min-height:42px;border-radius:13px;font-weight:760}\n.app .rs33-course-controls .rs38-road-toggle[aria-pressed=true] {background:#238f81;border-color:#238f81;color:#fff}\n.app .rs38-road-notice {background:#eaf7f2;border:1px solid #cfe7dd;color:#42685d;border-radius:12px}\n.app .rs33-stamp-label.stop {background:#fff1e4!important;color:#7c4316!important;border-color:#ffc592!important}\n.app #rs-tools .rmm-hero {background:#17665a;border-radius:22px}\n.app #rs-tools .rmm-card,.app #rs-tools .rmm-edit,.app #rs-tools .rmm-stats>div,\n.app #rs-tools .rmm-mileage,.app #rs-tools .rmm-part-panel {\n  border-radius:19px;background:#fff;border-color:#deebe6;box-shadow:0 3px 14px rgba(24,77,65,.045);\n}\n.app #rs-tools .rmm-presets button {background:#f8fbf9;border-radius:15px;border-color:#e1ece7}\n.app #rs-tools .rmm-presets button.active {background:#e1f4ee;border-color:#a9d9cc;color:#155f55}\n.app #rs-tools .rmm-part-icon {background:#eef8f4;border-radius:13px}\n.app #rs-tools .rmm-part-record,.app #rs-tools .rmm-rule-save {border-radius:13px}\n.app #rs-tools .rmm-guide {color:#6c857d}\n.app .rc-community :is(.rc-card,.rc-post-card,.rc-write-card,.rc-head,.rc-card-list) {border-radius:20px}\n.app .bottom-nav {\n  background:rgba(255,255,255,.98);\n  border-top:1px solid #e5eee9;\n  box-shadow:0 -4px 22px rgba(24,72,60,.055);\n}\n.app .bottom-nav button {\n  color:#748982;border-radius:14px;\n  transition:color .14s,background .14s;\n}\n.app .bottom-nav button.active {color:#155f55;background:#e1f4ee;font-weight:850}\n.app .bottom-nav button.active svg {stroke:#155f55}\n@media(max-width:760px){\n  :root{--shell-head:58px;--shell-nav:74px}\n  .app > header{height:var(--shell-head);padding-inline:16px}\n  .app .brand{font-size:21px}\n  .app .brand-dot{width:34px;height:34px}\n  .app .workspace{padding-bottom:calc(var(--shell-nav) + max(env(safe-area-inset-bottom,0px),12px))}\n  .app .workspace>main{padding-bottom:0}\n  .app .bottom-nav {\n    height:calc(var(--shell-nav) + max(env(safe-area-inset-bottom,0px),12px));\n    padding:5px 7px calc(5px + max(env(safe-area-inset-bottom,0px),12px));\n    gap:5px;\n  }\n  .app .bottom-nav button{min-height:58px;gap:4px;font-size:11px;padding:6px 2px}\n  .app .bottom-nav svg{height:22px;width:22px}\n  .app .nearby.nearby-full {\n    height:calc(100dvh - var(--shell-head) - var(--shell-nav) - max(env(safe-area-inset-bottom,0px),12px));\n    padding:0 12px 10px;min-height:0;\n  }\n  .app .rs33-map-bar{padding-top:14px}\n  .app .rs33-map-filters{margin-block:7px 10px}\n  .app :is(.rs33-timeline,.page.narrow:has(> .profile),.rc-community.rc-home.rc-community-v32){\n    padding-inline:16px;\n    padding-bottom:calc(25px + max(env(safe-area-inset-bottom,0px),12px));\n  }\n  .app .rs33-trip-detail{padding-bottom:30px}\n  .app .rs33-course-full {padding-top:max(12px,env(safe-area-inset-top,0px))}\n  .app .nearby .map-wrap #rs-sos-fab{bottom:78px!important}\n  /* Android WebView is edge-to-edge on Android 15+. This class is added only in the APK. */\n  html.rs-native-shell {--rs-top-inset:max(27px,env(safe-area-inset-top,0px));--rs-bottom-inset:max(24px,env(safe-area-inset-bottom,0px));}\n  html.rs-native-shell{--shell-head:calc(58px + var(--rs-top-inset));}\n  html.rs-native-shell .app > header {\n    box-sizing:border-box;\n    height:calc(58px + var(--rs-top-inset));\n    padding-top:var(--rs-top-inset);\n  }\n  html.rs-native-shell .app .workspace{padding-bottom:calc(74px + var(--rs-bottom-inset));}\n  html.rs-native-shell .app .bottom-nav{height:calc(74px + var(--rs-bottom-inset));padding-bottom:calc(5px + var(--rs-bottom-inset));}\n  html.rs-native-shell .app .nearby.nearby-full {\n    height:calc(100dvh - 58px - var(--rs-top-inset) - 74px - var(--rs-bottom-inset));\n  }\n  html.rs-native-shell .app .rs33-course-full{padding-top:var(--rs-top-inset);padding-bottom:var(--rs-bottom-inset)}\n}\n@media(max-width:380px){\n  .app .brand{font-size:19px}\n  .app .rs33-map-filters button{padding-inline:11px;font-size:12px}\n  .app .rs33-map-share,.app .rs33-map-bar .rs33-region-toggle{padding-inline:11px}\n}\n@media(prefers-reduced-motion:reduce){.app .bottom-nav button{transition:none}}\n";
  if(!css.includes('.rs-native-shell') || !css.includes('--rs-orange'))throw Error('New CSS invalid');
  files[newCSS]=[css,'text/css; charset=utf-8'];
  const detector='(function(){var ua=navigator.userAgent||"";if(ua.indexOf("; wv")>=0||typeof window.RiderSpotHost!=="undefined"){document.documentElement.classList.add("rs-native-shell");}})();';
  files[newShell]=[detector,"application/javascript; charset=utf-8"];
  const detectScript='<script src="'+newShell+'"></script>';
  const idx=html.indexOf('<script type="module"');
  if(idx<0)throw Error('main script marker missing');
  let next=html.slice(0,idx)+detectScript+html.slice(idx);
  next=next.replace(oldMaint,newMaint);
  next=next.replace('</head>','<link rel="stylesheet" href="'+newCSS+'?theme=v40"/></head>');
  next=next.replace('content="#ffffff"','content="#f5faf8"');
  files['/index.html'][0]=next;
  let newsw=sw.replace('rider-spot-shell-2026-11-16-rider-ui-v38-road-matching','rider-spot-shell-2026-11-16-rider-ui-v40-teal-orange');
  if(newsw===sw)throw Error('service worker cache version mismatch');
  newsw=newsw.replace(JSON.stringify(oldMaint),JSON.stringify(newMaint));
  newsw=newsw.replace('const CORE=[','const CORE=['+JSON.stringify(newCSS+'?theme=v40')+','+JSON.stringify(newShell)+',');
  files['/sw.js'][0]=newsw;
  const oldScript=raw.slice(raw.indexOf('\r\n\r\n')+4,raw.lastIndexOf('\r\n'+raw.slice(0,raw.indexOf('\r\n'))+'--'));
  const originalEnd=end;
  const oldTableEnd=raw.slice(begin,originalEnd);
  if(!oldScript.startsWith('/*') && !oldScript.startsWith('const files='))throw Error('worker prefix unexpected');
  const originalTail=raw.slice(originalEnd,raw.lastIndexOf('\r\n'+raw.slice(0,raw.indexOf('\r\n'))+'--'));
  const startSource=raw.indexOf('\r\n\r\n')+4;
  const head=raw.slice(startSource,at);
  const updated=head+marker+JSON.stringify(files)+originalTail;
  if(!updated.includes('async function handleRiderSpotOAuth(')||!updated.includes('async function riderSpotMatchRoads(')||!updated.includes('getIndustryNews')||!updated.includes('rider-ui-v40-teal-orange'))throw Error('Backend regression check failed');
  const verify={size:updated.length,files:Object.keys(files).length,headPreserved:head.includes('handleRiderSpotOAuth('),oauthRetained:updated.includes('async function handleRiderSpotOAuth('),matchRetained:updated.includes('async function riderSpotMatchRoads('),mainSourcePreserved:files['/assets/index-rider-v35-cb5dc21ec4b4.js'][0]===JSON.parse(raw.slice(begin,end))['/assets/index-rider-v35-cb5dc21ec4b4.js'][0],maintenanceDefaults:maint.includes('RS_DEFAULTS'),htmlNative:next.includes(newShell)&&files[newShell][0].includes('rs-native-shell'),htmlNewJS:next.includes(newMaint),swNewAsset:newsw.includes(newMaint)&&newsw.includes(newCSS)&&newsw.includes(newShell),swCache:newsw.includes('rider-ui-v40-teal-orange')};
  if(!Object.values(verify).every(v=>typeof v==='boolean'?v:true))throw Error('Preupload verification failed');
  if(false)return {dryRun:true,verify};
  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-15',bindings:[]})],{type:'application/json'}));
  form.append('worker.mjs',new Blob([updated],{type:'application/javascript+module'}),'worker.mjs');
  const deployed=await cloudflare.request({method:'PUT',path,body:form});
  return {success:deployed.success,errors:deployed.errors,version:deployed.result?.modified_on,verify};
}