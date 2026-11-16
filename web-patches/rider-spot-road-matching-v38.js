async () => {
  const path=`/accounts/${accountId}/workers/scripts/rider-spot`;
  const multipart=String(await cloudflare.request({method:'GET',path}));
  const pos=multipart.indexOf('const files=');
  if(pos<0) throw Error('No Worker asset dictionary');
  const start=pos+'const files='.length;
  let depth=0,inString=false,escaped=false,end=-1;
  for(let j=start;j<multipart.length;j++){
    const c=multipart[j];
    if(inString){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')inString=false;}
    else if(c==='"')inString=true;
    else if(c==='{')depth++;
    else if(c==='}' && !--depth){end=j+1;break;}
  }
  if(end<start)throw Error('Missing Worker dictionary end');
  const files=JSON.parse(multipart.slice(start,end));
  const asset='/assets/index-rider-v35-cb5dc21ec4b4.js';
  const htmlPath='/index.html';
  const cssPath='/rider-polish-v36-d680adacb934.css';
  const swPath='/sw.js';
  let app=files[asset][0];
  if(app.includes('rs38MatchRoads'))throw Error('Road preview already applied, stopping to prevent duplicates');
  function replaceOnce(before,after){
    const count=app.split(before).length-1;
    if(count!==1)throw Error('Unexpected app source, matches='+count+' for: '+before.slice(0,130));
    app=app.replace(before,after);
  }
  // Never fill in missing coordinates with an invented straight segment.
  replaceOnce(
`  const point={lat:sample.lat,lng:sample.lng,time:rs33Timestamp(sample.t)};
  const previous=current.at(-1);
  const gap=previous?.time!=null&&point.time!=null?point.time-previous.time:0;
  if(previous&&(sample.break||gap>=120000||gap<0)){groups.push(current);current=[];}
  current.push(point);`,
`  if(sample.accuracy!=null&&Number(sample.accuracy)>100){if(current.length){groups.push(current);current=[];}continue;}
  const point={lat:sample.lat,lng:sample.lng,time:rs33Timestamp(sample.t)};
  const previous=current.at(-1);
  const gap=previous?.time!=null&&point.time!=null?point.time-previous.time:0;
  const distance=previous?Qo(previous,point)*1000:0;
  const badJump=previous&&gap>0&&distance>75&&distance/(gap/1000)>38;
  if(previous&&(sample.break||gap>=30000||gap<0||badJump)){groups.push(current);current=[];}
  current.push(point);`);
  // One opt-in road-matching action per trip. Original GPS data remains unchanged.
  replaceOnce(` const [allDays,setAllDays]=S.useState(false);
 const current=ride.history.find(row=>row.id===selected)||ride.trip;`,
` const [allDays,setAllDays]=S.useState(false);
 const [roadPreview,setRoadPreview]=S.useState(null);
 const [roadBusy,setRoadBusy]=S.useState(false);
 const [roadNotice,setRoadNotice]=S.useState('');
 const current=ride.history.find(row=>row.id===selected)||ride.trip;`);
  replaceOnce(` const groups=S.useMemo(()=>rs33Paths(current?.points),[current?.points]);
 const stamps=S.useMemo(()=>rs33Stamps(groups,current?.events),[groups,current?.events]);
 const fit=S.useMemo(()=>groups.flat(),[groups]);`,
` const groups=S.useMemo(()=>rs33Paths(current?.points),[current?.points]);
 const activeRoad=roadPreview?.tripId===current?.id&&roadPreview?.pointCount===(current?.points?.length||0)?roadPreview:null;
 const shownGroups=activeRoad?.groups||groups;
 const stamps=S.useMemo(()=>rs33Stamps(groups,current?.events),[groups,current?.events]);
 const fit=S.useMemo(()=>shownGroups.flat(),[shownGroups]);`);
  replaceOnce(` function view(trip){
  setSelected(trip.id);setMemo(trip.memo||'');setFocused(null);setReset(value=>value+1);setExpanded(false);
 }`,
` async function rs38MatchRoads(){
  if(!current||roadBusy)return;
  if(activeRoad){setRoadPreview(null);setRoadNotice('GPS 원본 경로를 표시합니다.');return;}
  const eligible=groups.filter(group=>group.length>=4);
  if(!eligible.length){setRoadNotice('도로 보정에 필요한 GPS 좌표가 부족해요. 정확하지 않은 길은 임의로 만들지 않아요.');return;}
  // OSRM demo: one serial request per 1.2s, opt-in only, never upload to Supabase.
  const batches=[];
  for(const group of eligible){
   for(let i=0;i<group.length-1;i+=69){
    const slice=group.slice(i,Math.min(group.length,i+70));
    if(slice.length>=4)batches.push(slice);
   }
  }
  if(!batches.length||batches.length>5){setRoadNotice('이번 시험 기능은 연속 GPS 구간 최대 5개(약 350개 좌표)까지 지원해요. 긴 운행은 전용 도로 보정 서버가 필요해요.');return;}
  if(!confirm('도로에 맞춰 표시하기 위해 해당 운행의 GPS 좌표를 외부 OSRM 공개 경로 서비스로 보냅니다. GPS 원본·Supabase 저장 경로는 바꾸지 않습니다. 계속할까요?'))return;
  setRoadBusy(true);setRoadNotice('도로를 확인하고 있어요…');
  try{
   const matched=[];let skipped=0;
   for(let i=0;i<batches.length;i++){
    const response=await fetch('/api/route-match',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({points:batches[i]})});
    const data=await response.json();
    if(!response.ok)throw Error(data?.message||'도로 경로 서비스를 사용할 수 없어요.');
    const lines=Array.isArray(data.lines)?data.lines:[];
    if(!lines.length)skipped++;
    for(const line of lines){
     if(Array.isArray(line)&&line.length>=2)matched.push(line);
    }
    if(i<batches.length-1)await new Promise(resolve=>setTimeout(resolve,1250));
   }
   if(!matched.length)throw Error('GPS 정확도가 부족하거나 도로와 일치하는 경로를 찾지 못했어요.');
   setRoadPreview({tripId:current.id,pointCount:current.points.length,groups:matched});
   setRoadNotice(skipped?('도로 확인에 실패한 '+skipped+'개 구간은 표시하지 않았어요. 도로 선은 추정 경로예요.'):'도로에 맞춘 추정 경로입니다. 실제 운행한 길과 다를 수 있어요.');
  }catch(error){setRoadNotice(error?.message||'도로 경로를 불러오지 못했어요. 원본 GPS로 표시합니다.');}
  finally{setRoadBusy(false);}
 }
 function view(trip){
  setSelected(trip.id);setMemo(trip.memo||'');setFocused(null);setReset(value=>value+1);setExpanded(false);setRoadPreview(null);setRoadNotice('');
 }`);
  replaceOnce(`course:{groups,stamps,fit,onStamp,focused}});`,
`course:{groups:shownGroups,stamps,fit,onStamp,focused}});`);
  replaceOnce(`rs33J('div',{className:'rs33-course-controls'},rs33J('button',{type:'button',onClick:()=>{setFocused(null);setReset(value=>value+1);}},'전체 경로'),
     rs33J('button',{type:'button',className:'rs33-expand','aria-expanded':expanded,onClick:()=>setExpanded(value=>!value)},expanded?'닫기':'크게 보기')),`,
`rs33J('div',{className:'rs33-course-controls'},rs33J('button',{type:'button',onClick:()=>{setFocused(null);setReset(value=>value+1);}},'전체 경로'),
     rs33J('button',{type:'button',className:'rs38-road-toggle','aria-pressed':!!activeRoad,disabled:roadBusy,onClick:rs38MatchRoads},roadBusy?'도로 확인 중…':activeRoad?'원본 GPS 보기':'도로에 맞춰 보기'),
     rs33J('button',{type:'button',className:'rs33-expand','aria-expanded':expanded,onClick:()=>setExpanded(value=>!value)},expanded?'닫기':'크게 보기')),`);
  replaceOnce(`rs33J('div',{className:'trip-map rs33-course-map'},path),
    rs33J('div',{className:'rs33-course-footer'},`,
`rs33J('div',{className:'trip-map rs33-course-map'},path),
    roadNotice?rs33J('p',{className:'rs38-road-notice',role:'status'},roadNotice):null,
    rs33J('div',{className:'rs33-course-footer'},`);
  files[asset][0]=app;
  files[cssPath][0]+=`\n/* Road matching is a reversible, user-consented DISPLAY ONLY overlay. */\n.rs33-course-controls{flex-wrap:wrap;gap:6px}.rs33-course-controls .rs38-road-toggle{font-weight:700;max-width:190px}.rs33-course-controls .rs38-road-toggle[aria-pressed="true"]{background:#0b6650;color:#fff;border-color:#0b6650}.rs38-road-notice{margin:4px 12px 0;padding:6px 9px;font-size:12px;border:1px solid #c2d6cc;border-radius:8px;background:#f2faf5;color:#345b49}.rs33-course-controls .rs38-road-toggle:disabled{opacity:.6}\n`;
  const html=files[htmlPath][0],sw=files[swPath][0];
  if(!html.includes(asset+'?stops=v37')||!html.includes(cssPath+'?stops=v37')||!sw.includes('rider-ui-v37-stop-stamps'))throw Error('Unexpected current site version');
  files[htmlPath][0]=html.replace(asset+'?stops=v37',asset+'?roads=v38').replace(cssPath+'?stops=v37',cssPath+'?roads=v38');
  files[swPath][0]=sw.replace('rider-ui-v37-stop-stamps','rider-ui-v38-road-matching')
      .replace(JSON.stringify(asset+'?stops=v37'),JSON.stringify(asset+'?roads=v38'))
      .replace(JSON.stringify(cssPath+'?stops=v37'),JSON.stringify(cssPath+'?roads=v38'));
  const handler=String.raw`
// User-initiated display-only road matching. The GPS coordinates are not stored.
async function riderSpotMatchRoads(request, url) {
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const respond=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers});
 if(request.method!=='POST')return respond({message:'POST only'},405);
 const origin=request.headers.get('Origin');
 if(origin&&origin!==url.origin)return respond({message:'Origin not allowed'},403);
 const length=Number(request.headers.get('Content-Length')||0);
 if(length>16000)return respond({message:'Too many coordinates'},413);
 let body;
 try{const str=await request.text();if(str.length>16000)return respond({message:'Too many coordinates'},413);body=JSON.parse(str)}catch{return respond({message:'Invalid JSON'},400)}
 const points=body?.points;
 if(!Array.isArray(points)||points.length<4||points.length>70)return respond({message:'GPS points must be 4 to 70'},400);
 const valid=points.every(p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180);
 if(!valid)return respond({message:'Invalid coordinates'},400);
 const pairs=points.map(p=>Number(p.lng).toFixed(6)+','+Number(p.lat).toFixed(6)).join(';');
 let ts=points.map(p=>Number(p.time));
 const okTimes=ts.every((n,i)=>Number.isFinite(n)&&n>1e12&&(i===0||n>ts[i-1]));
 const timestampParam=okTimes?'&timestamps='+ts.map(t=>Math.round(t/1000)).join(';'):'';
 const upstream='https://router.project-osrm.org/match/v1/driving/'+pairs+'?geometries=geojson&overview=full&steps=false&tidy=true&gaps=split'+timestampParam;
 try{
  const ext=await fetch(upstream,{headers:{'Accept':'application/json','X-Client-Id':'riderspot-community-prototype'},signal:AbortSignal.timeout(9000),cache:'no-store'});
  if(!ext.ok)return respond({message:'External road matching server unavailable'},502);
  const result=await ext.json();
  if(result?.code!=='Ok')return respond({lines:[],message:'No road match'});
  const lines=[];
  for(const match of result.matchings||[]){
   const coords=match.geometry?.coordinates;
   if(Number(match.confidence)<0.5||!Array.isArray(coords)||coords.length>6000)continue;
   const line=coords.filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]))
       .map(p=>({lat:p[1],lng:p[0]}));
   if(line.length>=2)lines.push(line);
  }
  return respond({lines,matched:lines.length,source:'OSRM demo · estimate'});
 }catch{return respond({message:'External road matching timed out'},503)}
}
`;
  const routingStart="export default {async fetch(request){const u=new URL(request.url);";
  let rest=multipart.slice(end,multipart.lastIndexOf('\r\n--'));
  if(!rest.includes(routingStart)||rest.includes('riderSpotMatchRoads'))throw Error('Worker routing pattern mismatch');
  rest=rest.replace(routingStart,routingStart+"if(u.pathname==='/api/route-match')return riderSpotMatchRoads(request,u);");
  const code='const files='+JSON.stringify(files)+'\n'+handler+'\n'+rest;
  if(!code.includes('handleRiderSpotOAuth')||!code.includes("'/api/industry-news'")||!code.includes('rs38MatchRoads')||!code.includes('riderSpotMatchRoads'))throw Error('Deployment guard failed');
  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-15',bindings:[]})],{type:'application/json'}));
  form.append('worker.mjs',new Blob([code],{type:'application/javascript+module'}),'worker.mjs');
  const result=await cloudflare.request({method:'PUT',path,body:form});
  return {success:result.success,errors:result.errors,uploadedBytes:code.length,frontVersion:'v38-road-matching',scriptId:result.result?.id};
}