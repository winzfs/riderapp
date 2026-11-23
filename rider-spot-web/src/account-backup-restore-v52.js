/* RiderSpot v52: device file backup and non-destructive restore of
 * account records. Everyday income, service and ride summaries stay in Supabase.
 * Legacy cloud GPS points are exported ONLY to the user's downloaded backup
 * file and restored ONLY into Android SQLite, never sent back to Supabase.
 */
(function accountBackupV52(win){
  'use strict';
  if(!win || win.__rsAccountBackupV52)return;
  win.__rsAccountBackupV52=true;
  const doc=win.document;
  const ID='rs-account-backup-v52';
  const BASE='https://qkcqzhkvfbymzjdktshp.supabase.co';
  const PREFIX='sb-qkcqzhkvfbymzjdktshp-auth-token';
  const MAX_BYTES=7_400_000, PAGE=600;
  const TABLES=[
    'rider_profiles','rider_settings','rider_vehicle_profiles',
    'rider_finance_goals','rider_finance_payout_rules',
    'rider_recurring_expenses','rider_earnings','rider_auto_deliveries',
    'rider_fuel_logs','rider_extra_expenses','maintenance_logs',
    'rider_maintenance_cycles','rider_model_maintenance_settings',
    'rider_trip_odometer_entries','rider_places','rider_bookmarks'
  ];
  const allTables=[...TABLES,'trips','rider_trip_checkpoints'];
  let busy=false,publicKey='';
  const isUuid=id=>typeof id==='string'&&
    /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
  const size=value=>new Blob([value],{type:'application/json'}).size;
  const msg=e=>String(e?.message||e).slice(0,180);

  // A Supabase "anon" key is public client configuration, not a secret.
  // Capture it from the app's own same-origin trusted API requests only.
  const original=win.fetch?.bind(win);
  if(original){
    win.fetch=function(input,init){
      if(!publicKey)try{
        const url=new URL(typeof input==='string'?input:input?.url||String(input),win.location.href);
        if(url.origin===BASE){
          const headers=new Headers(init?.headers||input?.headers||{});
          const found=headers.get('apikey');
          if(found && found.length<512)publicKey=found;
        }
      }catch{}
      return original(input,init);
    };
  }
  function sessionFromLocal(){
    try{
      const raw=win.localStorage.getItem(PREFIX);
      const data=JSON.parse(raw||'null');
      return data?.access_token ? data : data?.currentSession||null;
    }catch{return null;}
  }
  async function context(){
    const native=win.__rsClient;
    if(native?.auth?.getSession){
      const {data,error}=await native.auth.getSession();
      if(error)throw error;
      if(!data?.session?.user?.id||!data.session.access_token)throw Error('계정 로그인 후 이용해 주세요.');
      return {uid:data.session.user.id,client:native,
        token:data.session.access_token,key:publicKey};
    }
    const session=sessionFromLocal();
    if(!session?.access_token||!isUuid(session.user?.id))
      throw Error('로그인 정보를 확인하지 못했어요. 계정에 다시 로그인해 주세요.');
    if(!publicKey)throw Error('계정 연결 확인 중이에요. 화면을 다시 열고 시도해 주세요.');
    // Never trust only the user ID stored in localStorage; verify the JWT.
    const verify=await original(BASE+'/auth/v1/user',{headers:{
      apikey:publicKey,authorization:'Bearer '+session.access_token}});
    if(!verify.ok)throw Error('로그인 인증이 만료됐어요. 다시 로그인해 주세요.');
    const user=await verify.json();
    if(user?.id!==session.user.id)throw Error('로그인 계정이 일치하지 않아요.');
    return {uid:user.id,client:null,token:session.access_token,key:publicKey};
  }
  async function list(ctx,table){
    let all=[];
    for(let offset=0;offset<5000;offset+=PAGE){
      let rows;
      if(ctx.client){
        const response=await ctx.client.from(table).select('*')
          .eq('user_id',ctx.uid).range(offset,offset+PAGE-1);
        if(response.error)throw Error(table+': '+msg(response.error));
        rows=response.data;
      }else{
        const url=new URL(BASE+'/rest/v1/'+table);
        url.searchParams.set('select','*');
        url.searchParams.set('user_id','eq.'+ctx.uid);
        url.searchParams.set('limit',String(PAGE));
        url.searchParams.set('offset',String(offset));
        const response=await original(url.toString(),{
          headers:{apikey:ctx.key,authorization:'Bearer '+ctx.token}
        });
        if(!response.ok)throw Error(table+' 조회 실패 ('+response.status+')');
        rows=await response.json();
      }
      if(!Array.isArray(rows))throw Error(table+' 응답이 올바르지 않아요.');
      for(const row of rows){
        if(row?.user_id!==ctx.uid)throw Error('다른 계정의 기록이 섞여 있어요.');
      }
      all.push(...rows);
      if(rows.length<PAGE)return all;
    }
    throw Error(table+' 기록이 너무 많아요. 범위별 백업이 필요해요.');
  }
  function extractLegacyGps(trips,chunks){
    const entries=[],existing=new Set();
    for(const t of trips){
      if(!isUuid(t.id)||!Array.isArray(t.points))throw Error('운행 데이터 형식 오류');
      if(!t.points.length)continue;
      entries.push({trip_id:t.id,started_at:t.started_at,ended_at:t.ended_at||null,
        distance_km:Number(t.distance_km)||0,
        events:Array.isArray(t.events)?t.events:[],memo:t.memo||null,
        points:t.points,source:'legacy-cloud-before-device-only',partial:!t.ended_at});
      existing.add(t.id);
    }
    const byTrip=new Map();
    for(const row of chunks){
      if(!isUuid(row.trip_id)||existing.has(row.trip_id))continue;
      if(!byTrip.has(row.trip_id))byTrip.set(row.trip_id,[]);
      byTrip.get(row.trip_id).push(row);
    }
    for(const [id,batches] of byTrip){
      batches.sort((a,b)=>Number(a.first_seq)-Number(b.first_seq));
      const points=[];
      let last=0;
      for(const batch of batches){
        if(!Array.isArray(batch.points))throw Error('GPS 증분 파일 형식 오류');
        for(const point of batch.points){
          const seq=Number(point?.seq);
          if(!Number.isSafeInteger(seq)||seq<=last)
            throw Error('과거 GPS 좌표 순서가 맞지 않아요.');
          points.push(point);last=seq;
        }
      }
      if(!points.length)continue;
      const first=batches[0],end=batches[batches.length-1];
      entries.push({trip_id:id,started_at:first.started_at,ended_at:null,
        distance_km:Number(end.distance_km)||0,events:Array.isArray(end.events)?end.events:[],
        points,source:'legacy-cloud-checkpoints',partial:true});
    }
    return entries;
  }
  async function gather(status){
    const ctx=await context();
    const tables={},totals={};
    for(let i=0;i<allTables.length;i++){
      const table=allTables[i];
      status.textContent='계정 기록 확인 중 · '+(i+1)+'/'+allTables.length;
      const rows=await list(ctx,table);
      if(table==='trips'||table==='rider_trip_checkpoints')tables[table]=rows;
      else tables[table]=rows;
      totals[table]=rows.length;
    }
    const oldGps=extractLegacyGps(tables.trips,tables.rider_trip_checkpoints);
    const legacyCount=oldGps.reduce((n,t)=>n+t.points.length,0);
    // Keep the trip summaries, never write GPS points on account restore.
    const summaries=tables.trips.map(row=>({...row,points:[]}));
    delete tables.rider_trip_checkpoints;
    tables.trips=summaries;
    const archive={
      format:'riderspot-account-backup-v52',
      created_at:new Date().toISOString(),
      account_id:ctx.uid,
      data_policy:'gps-original-only-on-device',
      tables,
      legacy_gps:oldGps,
      summary:{records:Object.values(totals).reduce((s,n)=>s+n,0),
        trips:summaries.length,old_cloud_gps_points:legacyCount,by_table:totals}
    };
    const encoded=JSON.stringify(archive);
    if(size(encoded)>MAX_BYTES)throw Error('계정 기록이 파일 크기 제한을 초과했어요. 기존 기록은 그대로 유지됩니다.');
    return {archive,content:encoded};
  }
  async function saveFile(content,filename){
    // Native bridge for arbitrary JSON is only present in future signed APKs.
    if(typeof win.__rsNativeSaveAccountBackup==='function'){
      const base64=await encode(content);
      const response=await win.__rsNativeSaveAccountBackup(base64,filename);
      if(response?.saved!==true)throw Error('기기 저장을 확인할 수 없어요.');
      return 'saved';
    }
    const blob=new Blob([content],{type:'application/json'});
    const file=typeof File==='function'?
      new File([blob],filename,{type:'application/json'}):null;
    if(file&&win.navigator?.canShare?.({files:[file]})&&win.navigator?.share){
      await win.navigator.share({files:[file],title:'라이더스팟 계정 백업'});
      return 'shared';
    }
    if(typeof win.showSaveFilePicker==='function'){
      const handle=await win.showSaveFilePicker({
        suggestedName:filename,
        types:[{description:'RiderSpot 계정 백업',accept:{'application/json':['.json']}}]
      });
      const stream=await handle.createWritable();
      await stream.write(blob);await stream.close();
      return 'saved';
    }
    const url=URL.createObjectURL(blob);
    try{
      const node=doc.createElement('a');
      node.href=url;node.download=filename;node.hidden=true;
      doc.body.append(node);node.click();node.remove();
    }finally{win.setTimeout(()=>URL.revokeObjectURL(url),30000);}
    return 'download-requested';
  }
  function encode(content){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result).split(',')[1]);
      reader.onerror=()=>reject(reader.error||Error('파일 읽기 실패'));
      reader.readAsDataURL(new Blob([content],{type:'application/json'}));
    });
  }
  async function backup(status,button){
    if(busy)return;
    busy=true;button.disabled=true;
    try{
      if(!win.confirm('현재 계정의 운행 요약·수익·정비·설정을 JSON 파일로 백업할까요? 과거 서버 GPS도 파일에 함께 보관하며 서버 데이터는 변경하지 않아요.'))return;
      const {archive,content}=await gather(status);
      status.textContent='백업 파일 저장 중…';
      const file='RiderSpot-Account-'+new Date().toISOString().slice(0,10)+'.json';
      const result=await saveFile(content,file);
      status.textContent=result==='download-requested'?
        '다운로드를 요청했어요. 파일 앱에서 JSON 파일이 저장됐는지 확인해 주세요.':
        '계정 백업 완료 · '+archive.summary.records+'개 기록 · 운행 '+archive.summary.trips+
        '건 · 과거 GPS '+archive.summary.old_cloud_gps_points+'개 좌표';
    }catch(error){
      status.textContent=error?.name==='AbortError'?'백업 저장을 취소했어요.':
        '백업 실패 · '+msg(error);
    }finally{busy=false;button.disabled=false;}
  }
  async function restore(file,status,button){
    if(busy||!file)return;
    busy=true;button.disabled=true;
    try{
      if(file.size>MAX_BYTES||file.size<90)throw Error('계정 백업 파일 크기를 확인해 주세요.');
      const archive=JSON.parse(await file.text());
      if(archive?.format!=='riderspot-account-backup-v52'||
        !isUuid(archive.account_id)||!archive.tables||
        typeof archive.tables!=='object'||Array.isArray(archive.tables)||
        !Array.isArray(archive.legacy_gps))
        throw Error('라이더스팟 계정 백업 파일이 아니에요.');
      const ctx=await context();
      if(archive.account_id!==ctx.uid)
        throw Error('백업 파일의 계정과 현재 로그인 계정이 달라요.');
      const tables=archive.tables;
      for(const [key,rows] of Object.entries(tables)){
        if(![...TABLES,'trips'].includes(key)||!Array.isArray(rows))
          throw Error('지원하지 않는 계정 기록이 포함되어 있어요.');
        for(const row of rows){
          if(row?.user_id!==ctx.uid)throw Error('백업 파일에 다른 계정 기록이 있어요.');
        }
      }
      if(!win.confirm('같은 계정의 없는 수익·정비·운행 요약만 복원할까요? 기존 기록은 덮어쓰지 않아요. GPS는 기기에만 복원합니다.'))return;
      status.textContent='계정 서버 기록 복원 중…';
      let result;
      if(ctx.client){
        const response=await ctx.client.rpc('rs_restore_account_backup_v52',{
          p_account_id:ctx.uid,p_tables:tables
        });
        if(response.error)throw response.error;
        result=response.data;
      }else{
        const response=await original(BASE+'/rest/v1/rpc/rs_restore_account_backup_v52',{
          method:'POST',
          headers:{apikey:ctx.key,authorization:'Bearer '+ctx.token,
            'content-type':'application/json'},
          body:JSON.stringify({p_account_id:ctx.uid,p_tables:tables})
        });
        if(!response.ok)throw Error('계정 서버 복원 실패 ('+response.status+')');
        result=await response.json();
      }
      let gpsMessage='';
      if(archive.legacy_gps.length){
        if(typeof win.__rsNativeImportGpsBackup==='function'){
          status.textContent='과거 GPS를 기기 SQLite에 복원 중…';
          const payload=JSON.stringify({format:'riderspot-gps-backup-v1',
            generated_at:new Date().toISOString(),coordinate_policy:'unaltered',
            entries:archive.legacy_gps});
          if(size(payload)>7_400_000)
            gpsMessage=' · 과거 GPS는 용량 제한으로 별도 복원이 필요해요.';
          else{
            try{
              const done=await win.__rsNativeImportGpsBackup(await encode(payload));
              gpsMessage=' · GPS '+(Number(done?.restored)||0)+'건 복원';
            }catch(e){
              gpsMessage=' · GPS 복원 실패: '+msg(e)+' (백업 파일 보존)';
            }
          }
        }else{
          gpsMessage=' · GPS 복원은 지원 APK 설치 후 가능해요. 파일을 보관해 주세요.';
        }
      }
      status.textContent='계정 복원 완료 · 신규 '+Number(result?.restored||0)+
        '건 · 기존 '+Number(result?.already_present||0)+'건'+gpsMessage;
      win.dispatchEvent(new Event('riderspot:finance-changed'));
      win.dispatchEvent(new Event('riderspot:gps-local-restored'));
    }catch(error){
      status.textContent=error?.name==='AbortError'?'복원 취소':
        '복원 실패 · '+msg(error)+' · 기존 기록은 삭제되지 않았어요.';
    }finally{busy=false;button.disabled=false;}
  }
  function addStyles(){
    if(doc.getElementById(ID+'-style'))return;
    const css=doc.createElement('style');css.id=ID+'-style';
    css.textContent='#'+ID+'{border:1px solid #e5eaf0;border-radius:17px;'+
      'background:#f7f9fc;padding:17px;margin:15px 0;color:#263b50;display:grid;gap:10px}'+
      '#'+ID+' .rs-account-head{font-size:16px;font-weight:800;letter-spacing:-.035em}'+
      '#'+ID+' .rs-account-note{color:#7b8da0;font-size:12px;line-height:1.55}'+
      '#'+ID+' .rs-account-actions{display:flex;gap:9px}'+
      '#'+ID+' button{flex:1;min-height:42px;border:1px solid #dce5ef;'+
      'border-radius:12px;background:white;color:#315881;font-weight:750;font-size:13px}'+
      '#'+ID+' button:first-child{background:#3565a5;border-color:#3565a5;color:white}'+
      '#'+ID+' button:disabled{opacity:.5}'+
      '#'+ID+' .rs-account-status{font-size:12px;color:#61748a;line-height:1.5;overflow-wrap:anywhere}';
    doc.head.append(css);
  }
  function mount(){
    const profile=doc.querySelector('.app[data-screen="account"] .rs-profile-page');
    if(!profile||profile.querySelector('#'+ID))return;
    addStyles();
    const root=doc.createElement('section');root.id=ID;
    const heading=doc.createElement('div');heading.className='rs-account-head';
    heading.textContent='내 기록 백업 · 복원';
    const note=doc.createElement('div');note.className='rs-account-note';
    note.textContent='수익·정비·운행 요약은 서버에 계속 저장돼요. 파일 백업에는 과거 GPS도 보관하며, 새로운 GPS는 기기에만 기록돼요.';
    const actions=doc.createElement('div');actions.className='rs-account-actions';
    const exportButton=doc.createElement('button');exportButton.type='button';
    exportButton.textContent='기기에 백업';
    const importButton=doc.createElement('button');importButton.type='button';
    importButton.textContent='파일에서 복원';
    const input=doc.createElement('input');input.type='file';input.accept='.json,application/json';
    input.hidden=true;input.style.display='none';
    const status=doc.createElement('div');status.className='rs-account-status';
    status.setAttribute('role','status');
    status.textContent='기기 GPS 원본은 타임라인의 GPS 백업 메뉴에서 따로 보관할 수 있어요.';
    exportButton.addEventListener('click',()=>void backup(status,exportButton));
    importButton.addEventListener('click',()=>input.click());
    input.addEventListener('change',()=>{
      const file=input.files?.[0];input.value='';
      if(file)void restore(file,status,importButton);
    });
    actions.append(exportButton,importButton,input);
    root.append(heading,note,actions,status);
    const anchor=profile.querySelector('.profile');
    if(anchor)anchor.insertAdjacentElement('afterend',root);
    else profile.append(root);
  }
  win.addEventListener('riderspot:screen',()=>win.requestAnimationFrame(mount));
  win.addEventListener('riderspot:tab-restored',()=>win.requestAnimationFrame(mount));
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
  win.setInterval(mount,2000);
  // Deterministic QA entrypoints; never expose access credentials.
  win.__rsAccountBackupMathV52=Object.freeze({extractLegacyGps});
})(typeof window==='undefined'?null:window);
