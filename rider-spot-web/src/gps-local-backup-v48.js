/* RiderSpot lossless GPS backup v48. Read only, never uploads or deletes. */
(function setupGpsBackup(win){
'use strict';
if(!win||win.__rsGpsLocalBackupV48)return;
win.__rsGpsLocalBackupV48=true;
const doc=win.document,ID='rs-gps-backup-v48',LIMIT=5500000;
const valid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const native=()=>Boolean(win.RiderSpotHost&&win.__rsNativeInstalled);
const byteLength=s=>new Blob([s],{type:'application/json'}).size;
let saving=false;
async function available(){
 const user=(await win.__rsClient?.auth.getUser().catch(()=>({})))?.data?.user?.id||null;
 const api=win.__rsRideApi, seen=new Set();
 const local=[...(Array.isArray(api?.history)?api.history:[]),api?.trip].filter(t=>{
   if(!valid(t?.id)||seen.has(t.id))return false;
   if(user){if(t.user_id&&t.user_id!==user)return false;}
   else if(t.user_id)return false;
   seen.add(t.id);return true;
 });
 // v49+ enumerates the complete SQLite catalog, including records missing
 // from the timeline. Older APKs still use the current/last-stopped fallback.
 if(native()&&typeof win.__rsNativeListGpsTrips==='function'){
   try{
     const result=await win.__rsNativeListGpsTrips();
     for(const item of result?.trips||[]){
       const id=item?.id;
       if(!valid(id)||seen.has(id))continue;
       if(user&&item.user_id&&item.user_id!==user)continue;
       if(!user&&item.user_id)continue;
       local.push({id,user_id:item.user_id||user||null,
         started_at:item.started_at||null,
         ended_at:item.ended_at||null,
         distance_km:Number(item.distance_km)||0,
         events:Array.isArray(item.events)?item.events:[],
         memo:item.memo||null,points:[],native_orphan:true,
         native_state:item.native_state||null});
       seen.add(id);
     }
   }catch(error){
     console.warn('[RiderSpot GPS] Full SQLite catalog unavailable:',error?.message||error);
   }
 }
 // React can show zero trips even while a native SQLite route still exists.
 // Discover the current/last-stopped native IDs without modifying their GPS.
 const bridge=win.__rsGPS42NativeRead;
 if(native()&&typeof bridge?.call==='function'){
   try{
     const status=await bridge.call('state');
     for(const id of [status?.activeId,status?.lastStoppedId]){
       if(!valid(id)||seen.has(id))continue;
       let time=Number(status?.startedAt)||0;
       if(!time){
         const first=await bridge.call('points',{tripId:id,afterSeq:0,limit:1});
         time=Number(first?.points?.[0]?.t)||0;
       }
       if(!Number.isFinite(time)||time<=0)continue;
       const isStopped=id===status?.lastStoppedId && id!==status?.activeId;
       const endMs=Number(status?.lastStoppedAt)||0;
       local.push({id,user_id:user||null,started_at:new Date(time).toISOString(),
         ended_at:isStopped&&endMs>time?new Date(endMs).toISOString():null,
         distance_km:0,events:[],memo:null,points:[],native_orphan:true,
         native_state:isStopped?'stopped':'active'});
       seen.add(id);
     }
   }catch(error){
     // Existing app records remain exportable even if native state is busy.
     console.warn('[RiderSpot GPS backup] Native state unavailable:',error?.message||error);
   }
 }
 return local.sort((a,b)=>String(a.started_at).localeCompare(String(b.started_at)));
}
async function entry(record){
 let points=null,source='';
 if(native()&&typeof win.__rsGPS42NativeRead?.allPoints==='function'){
   try{
     const rows=await win.__rsGPS42NativeRead.allPoints(record.id);
     if(Array.isArray(rows)&&rows.length){points=rows;source='android-sqlite';}
   }catch(e){if(!Array.isArray(record.points)||!record.points.length)throw e;}
 }
 if(!points&&Array.isArray(record.points)&&record.points.length){
   points=record.points;source='app-record';
 }
 if(!points?.length)throw Error('운행 '+record.id.slice(0,8)+'의 GPS 좌표를 읽지 못했어요.');
 // Coordinates remain exactly as supplied; no rounding, sampling or map matching.
 const value={trip_id:record.id,started_at:record.started_at,
   ended_at:record.ended_at||null,distance_km:Number(record.distance_km)||0,
   partial:!record.ended_at&&record.native_state!=='stopped',
   native_state:record.native_state||null,source,points:points.map(p=>({...p})),
   events:Array.isArray(record.events)?record.events:[],memo:record.memo||null};
 if(byteLength(JSON.stringify(value))>LIMIT)
   throw Error('너무 큰 운행 기록이 있어요. 좌표를 삭제하지 않고 백업을 중단했습니다.');
 return value;
}
function pack(entries){
 const groups=[];let chunk=[],size=0;
 for(const item of entries){
   const n=byteLength(JSON.stringify(item));
   if(chunk.length&&size+n>LIMIT){groups.push(chunk);chunk=[];size=0;}
   chunk.push(item);size+=n;
 }
 if(chunk.length)groups.push(chunk);
 const date=new Date().toISOString().slice(0,10);
 return groups.map((rows,i)=>{
   const content=JSON.stringify({format:'riderspot-gps-backup-v1',
     generated_at:new Date().toISOString(),coordinate_policy:'unaltered',
     file_part:i+1,total_parts:groups.length,count:rows.length,entries:rows});
   if(byteLength(content)>7500000)throw Error('백업 파일 크기 제한을 초과했어요.');
   return {content,name:'RiderSpot-GPS-'+date+'-'+(i+1)+'of'+groups.length+'.json'};
 });
}
async function save(file){
 if(typeof win.__rsNativeSaveGpsBackup==='function'){
   const encoded=await new Promise((ok,fail)=>{
     const reader=new FileReader();
     reader.onload=()=>ok(String(reader.result).split(',')[1]);
     reader.onerror=()=>fail(reader.error||Error('파일 변환 실패'));
     reader.readAsDataURL(new Blob([file.content],{type:'application/json'}));
   });
   const res=await win.__rsNativeSaveGpsBackup(encoded,file.name);
   if(res?.saved!==true)throw Error('기기에 파일 저장이 완료되지 않았어요.');
   return true;
 }
 const blob=new Blob([file.content],{type:'application/json;charset=utf-8'});
 const item=typeof File==='function'?
   new File([blob],file.name,{type:'application/json'}):null;
 if(item&&win.navigator?.canShare?.({files:[item]})&&typeof win.navigator?.share==='function'){
   await win.navigator.share({files:[item],title:'라이더스팟 GPS 기록 백업'});
   return true;
 }
 if(typeof win.showSaveFilePicker==='function'){
   const handle=await win.showSaveFilePicker({suggestedName:file.name,
     types:[{description:'GPS JSON 백업',accept:{'application/json':['.json']}}]});
   const output=await handle.createWritable();await output.write(blob);await output.close();
   return true;
 }
 if(native())throw Error('이 APK는 JSON 파일 저장을 지원하지 않아요. GPS 백업 지원 APK가 필요합니다.');
 const url=URL.createObjectURL(blob);
 try{const a=doc.createElement('a');a.href=url;a.download=file.name;a.hidden=true;
   doc.body.append(a);a.click();a.remove();}
 finally{win.setTimeout(()=>URL.revokeObjectURL(url),30000);}
 return false;
}
async function backup(status,button){
 if(saving)return;
 saving=true;button.disabled=true;let saved=0;
 try{
   if(native()&&typeof win.__rsNativeSaveGpsBackup!=='function'&&
      typeof win.navigator?.share!=='function'&&
      typeof win.showSaveFilePicker!=='function')
     throw Error('현재 APK는 JSON 백업 저장을 지원하지 않아요. GPS 백업 지원 버전 설치가 필요해요.');
   const records=await available();
   if(!records.length)throw Error('백업할 운행 기록이 없어요.');
   const entries=[];
   for(let i=0;i<records.length;i++){
     status.textContent='원본 경로 확인 '+(i+1)+'/'+records.length;
     entries.push(await entry(records[i]));
   }
   const files=pack(entries);
   for(let i=0;i<files.length;i++){
     status.textContent='기기 파일 저장 '+(i+1)+'/'+files.length;
     const confirmed=await save(files[i]);
     if(confirmed)saved++;
   }
   status.textContent=saved===files.length?
     '백업 완료 · '+entries.length+'개 운행 · '+files.length+'개 파일':
     '다운로드 요청 완료 · 파일 앱에서 저장 여부를 확인하세요.';
 }catch(error){
   status.textContent=error?.name==='AbortError'?'파일 저장이 취소됐어요.':
     (saved?saved+'개 파일 저장 후 중단 · ':'백업 실패 · ')+String(error?.message||error).slice(0,135);
 }finally{saving=false;button.disabled=false;}
}
async function restoreFile(file,status,button){
 if(saving || !file)return;
 saving=true;button.disabled=true;
 try{
   if(!native()||typeof win.__rsNativeImportGpsBackup!=='function')
     throw Error('이 APK는 GPS 복원을 지원하지 않아요. GPS 백업·복원 버전이 필요해요.');
   if(file.size>7500000||file.size<60)throw Error('백업 파일 크기가 맞지 않아요.');
   const raw=await file.text();
   const archive=JSON.parse(raw);
   if(archive.format!=='riderspot-gps-backup-v1'||
      !Array.isArray(archive.entries)||archive.entries.length<1||
      archive.entries.length>100)throw Error('라이더스팟 GPS 백업 파일이 아니에요.');
   let total=0;
   for(const item of archive.entries){
     if(!valid(item?.trip_id)||!Array.isArray(item.points)||!item.points.length)
       throw Error('복원 파일의 운행 ID 또는 좌표가 올바르지 않아요.');
     total+=item.points.length;
   }
   if(!win.confirm('운행 '+archive.entries.length+'건 · GPS 좌표 '+total.toLocaleString('ko-KR')+
     '개를 기기 SQLite에 복원할까요? 현재 운행과 서로 다른 기존 경로는 덮어쓰지 않아요.')){
       status.textContent='복원을 취소했어요.';return;
   }
   status.textContent='기기에 GPS 좌표 복원 중…';
   const encoded=await new Promise((ok,fail)=>{
     const reader=new FileReader();
     reader.onload=()=>ok(String(reader.result).split(',')[1]);
     reader.onerror=()=>fail(reader.error||Error('백업 파일 읽기 실패'));
     reader.readAsDataURL(new Blob([raw],{type:'application/json'}));
   });
   const result=await win.__rsNativeImportGpsBackup(encoded);
   if(!result||!Number.isFinite(Number(result.restored)))
     throw Error('기기에 복원됐는지 확인하지 못했어요.');
   status.textContent='복원 완료 · 신규 '+Number(result.restored)+'건 · 기존 '+Number(result.existing)+
     '건 · GPS '+Number(result.points).toLocaleString('ko-KR')+'개';
   win.dispatchEvent(new CustomEvent('riderspot:gps-local-restored',{detail:result}));
 }catch(error){
   status.textContent='복원 실패 · '+String(error?.message||error).slice(0,150)+
     ' · 기존 GPS는 그대로 보존됩니다.';
 }finally{saving=false;button.disabled=false;}
}
async function showAutomaticStatus(element){
 if(typeof win.__rsNativeGpsAutoBackupStatusV50!=='function')return;
 try{
   const state=await win.__rsNativeGpsAutoBackupStatusV50();
   if(!element.isConnected)return;
   const last=Number(state?.lastSuccessAt)||0;
   element.textContent=last?
     '기기 자동백업 5분 · 최근 '+new Date(last).toLocaleTimeString('ko-KR',
       {hour:'2-digit',minute:'2-digit'})+' · '+(state.pointCount||0)+'개 좌표':
     '기기 자동백업 5분 · 첫 백업 대기 중';
 }catch{
   element.textContent='기기 자동백업 상태 확인 대기';
 }
}
function addStyle(){
 if(doc.getElementById(ID+'-style'))return;
 const style=doc.createElement('style');style.id=ID+'-style';
 style.textContent='#'+ID+'{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;margin:12px 0;padding:11px 12px;border-radius:14px;border:1px solid #E5EAF0;background:#F6F8FA;color:#34475B;}'+
 '#'+ID+' .rsg-copy{flex:1;min-width:0;display:grid;gap:2px}'+
 '#'+ID+' strong{font-size:12px;font-weight:760;color:#34475B}'+
 '#'+ID+' small{font-size:10px;line-height:1.45;color:#748699;font-weight:500}'+
 '#'+ID+' .rsg-status{font-size:10px;line-height:1.4;color:#5D7185;overflow-wrap:anywhere}'+
 '#'+ID+' button{flex:none;min-height:37px;padding:0 12px;border:1px solid #DAE3ED;border-radius:11px;background:white;color:#385D86;font-size:12px;font-weight:740;cursor:pointer}'+
 '#'+ID+' button:disabled{opacity:.55;cursor:wait}'+
 '#'+ID+' .rsg-actions{display:flex;gap:6px;align-items:center}';
 doc.head.append(style);
}
function attach(){
 const page=doc.querySelector('.app .rs33-timeline');
 if(!page||page.querySelector('#'+ID))return;
 addStyle();
 const card=doc.createElement('section');card.id=ID;card.setAttribute('aria-label','GPS 원본 기기 백업');
 const info=doc.createElement('div');info.className='rsg-copy';
 const title=doc.createElement('strong');title.textContent='GPS 기록 백업';
 const sub=doc.createElement('small');sub.textContent='기기 전용 · 경로 원본 보존 · 수동 내보내기/복원';
 const status=doc.createElement('span');status.className='rsg-status';status.setAttribute('role','status');
 info.append(title,sub,status);
 const actions=doc.createElement('div');actions.className='rsg-actions';
 const button=doc.createElement('button');button.type='button';button.textContent='백업';
 button.addEventListener('click',()=>void backup(status,button));
 const restoreButton=doc.createElement('button');restoreButton.type='button';
 restoreButton.textContent='복원';
 const picker=doc.createElement('input');picker.type='file';picker.accept='.json,application/json';
 picker.hidden=true;picker.style.display='none';
 restoreButton.addEventListener('click',()=>picker.click());
 picker.addEventListener('change',()=>{
   const file=picker.files?.[0];picker.value='';
   if(file)void restoreFile(file,status,restoreButton);
 });
 actions.append(button,restoreButton,picker);
 card.append(info,actions);
 void showAutomaticStatus(sub);
 const calendar=page.querySelector('.rs34-timeline-calendar');
 const target=calendar||page.querySelector('.rs34-timeline-command');
 target?.insertAdjacentElement('afterend',card);
}
const schedule=()=>win.requestAnimationFrame?.(attach);
win.addEventListener('riderspot:screen',schedule);
win.addEventListener('riderspot:tab-restored',schedule);
if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',schedule,{once:true});
else schedule();
win.setInterval(attach,2400);
})(typeof window==='undefined'?null:window);
