/* RiderSpot / finance: actual-total entry helper, read-only UI.
 * Server-side rs_save_daily_income_guarded handles reconciliation atomically.
 * Do not intercept React submission, modify native capture, or navigate/reload.
 */
(function initIncomeTotalHelper(win){
  'use strict';
  if(!win || win.__rsIncomeTotalHelperV1) return;
  win.__rsIncomeTotalHelperV1=true;
  const doc=win.document, ID='rs-fin-income-total-preview-v1';
  const kWon=n=>Math.max(0,Number(n)||0).toLocaleString('ko-KR')+'원';
  let page=null,observer=null,lastDialog=null,request=0;
  let snapshot=null,activeForm=null;
  function scriptStyle(){
    if(doc.getElementById(ID+'-css'))return;
    const node=doc.createElement('style');
    node.id=ID+'-css';
    node.textContent=[
      '#'+ID+'{margin:8px 0 15px;padding:11px 13px;border-radius:12px;background:#F4F7FA;border:1px solid #E6ECF1;display:flex;flex-direction:column;gap:4px;color:#61748B;font-family:inherit;font-weight:600;font-size:12px;line-height:1.5}',
      '#'+ID+' strong{color:#314E72;font-weight:800;font-size:12px;letter-spacing:-.03em}',
      '#'+ID+' .rsfit-note{font-size:11px;color:#83919F;font-weight:500}',
      '@media(max-width:360px){#'+ID+'{padding:9px 10px;font-size:11px}}'
    ].join('\n');
    doc.head.append(node);
  }
  function formValues(form){
    const data=new FormData(form);
    const date=String(data.get('work_date')||'');
    const platform=String(data.get('platform')||'');
    const total=String(data.get('gross_won')||'').replace(/,/g,'').trim();
    const typed=total===''?null:Number(total);
    return {date,platform,total:typed};
  }
  function updatePreview(form){
    const preview=form.querySelector('#'+ID);
    if(!preview)return;
    const status=preview.querySelector('strong');
    const note=preview.querySelector('.rsfit-note');
    const val=formValues(form);
    if(val.platform==='기타'){
      status.textContent='기타 플랫폼은 입력 금액 그대로 기록해요.';
      note.textContent='자동수집 차감은 쿠팡이츠·배민에만 적용돼요.';
      return;
    }
    if(!snapshot || snapshot.day!==val.date || snapshot.platform!==val.platform){
      status.textContent='자동수집 기록 확인 중…';
      note.textContent='선택한 날짜와 플랫폼을 기준으로 계산해요.';
      return;
    }
    if(snapshot.error){
      status.textContent='현재 기록을 불러오지 못했어요.';
      note.textContent='저장 시 서버에서 최신 수익을 확인해요.';
      return;
    }
    const current=snapshot.auto+snapshot.manual;
    if(val.total==null||!Number.isFinite(val.total)){
      status.textContent='자동수집 '+kWon(snapshot.auto)+' · 기존 수동 '+kWon(snapshot.manual);
      note.textContent='배달앱의 실제 총수입을 입력해 주세요.';
      return;
    }
    const delta=val.total-current;
    status.textContent='현재 '+kWon(current)+' → 실제 '+kWon(val.total);
    note.textContent=delta>0?('수동 보충 예정 '+kWon(delta)):
      delta===0?'추가 수입 없음 · 현재 총수익과 같아요.':
        '기록보다 '+kWon(-delta)+' 적어요 · 기존 세부 기록에 따라 확인이 필요해요.';
  }
  async function load(form){
    const {date,platform}=formValues(form);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['쿠팡이츠','배민'].includes(platform)){
      snapshot={day:date,platform,auto:0,manual:0,error:false};
      updatePreview(form);
      return;
    }
    const token=++request;
    snapshot=null;
    updatePreview(form);
    try{
      const client=win.__rsClient;
      if(!client)throw Error('client unavailable');
      const {data:auth,error:authError}=await client.auth.getUser();
      if(authError||!auth?.user?.id)throw Error('login required');
      const res=await client.from('rider_earnings')
        .select('gross_won,source_type,gross_entered')
        .eq('user_id',auth.user.id).eq('work_date',date).eq('platform',platform);
      if(res.error)throw res.error;
      if(token!==request || form!==activeForm || !form.isConnected)return;
      let auto=0,manual=0;
      for(const row of res.data||[]){
        if(row.gross_entered===false)continue;
        if(row.source_type==='auto')auto+=Number(row.gross_won)||0;
        else manual+=Number(row.gross_won)||0;
      }
      snapshot={day:date,platform,auto,manual,error:false};
    }catch(err){
      if(token!==request || form!==activeForm || !form.isConnected)return;
      snapshot={day:date,platform,auto:0,manual:0,error:true};
    }
    updatePreview(form);
  }
  function inspect(){
    const dialog=doc.querySelector('.finance-page .fin-dialog[aria-label="수익 입력"]');
    const form=dialog?.querySelector('form');
    const editing=dialog?.querySelector('.fin-sheet-head small')?.textContent?.includes('기록 수정');
    if(!form || editing){
      if(lastDialog){++request;snapshot=null;activeForm=null;lastDialog=null;}
      return;
    }
    if(dialog===lastDialog)return;
    lastDialog=dialog;activeForm=form;snapshot=null;
    scriptStyle();
    const field=form.elements.namedItem('gross_won');
    const label=field?.closest('label');
    if(!field||!label)return;
    const span=label.querySelector('span');
    if(span)span.textContent='실제 총수입 (자동수집 포함)';
    let preview=form.querySelector('#'+ID);
    if(!preview){
      preview=doc.createElement('div');
      preview.id=ID;
      preview.setAttribute('aria-live','polite');
      const first=doc.createElement('strong');
      const note=doc.createElement('span');note.className='rsfit-note';
      preview.append(first,note);
      label.insertAdjacentElement('afterend',preview);
    }
    const local=()=>updatePreview(form);
    let lastKey='';
    const changed=()=>{
      const {date,platform}=formValues(form);
      const key=date+'|'+platform;
      if(key!==lastKey){lastKey=key;void load(form);}else local();
    };
    form.addEventListener('input',changed);
    form.addEventListener('change',changed);
    changed();
  }
  function bindPage(){
    const next=doc.querySelector('.finance-page');
    if(page!==next){
      observer?.disconnect();page=next;lastDialog=null;activeForm=null;snapshot=null;
      if(page){observer=new MutationObserver(inspect);observer.observe(page,{childList:true,subtree:true});}
    }
    inspect();
  }
  const schedule=()=>win.requestAnimationFrame(bindPage);
  win.addEventListener('riderspot:screen',schedule);
  win.addEventListener('riderspot:tab-restored',schedule);
  win.addEventListener('riderspot:finance-changed',()=>{if(activeForm)void load(activeForm);});
  win.addEventListener('riderspot:auto-income-updated',()=>{if(activeForm)void load(activeForm);});
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();
  win.setInterval(bindPage,1800);
})(typeof window==='undefined'?null:window);
