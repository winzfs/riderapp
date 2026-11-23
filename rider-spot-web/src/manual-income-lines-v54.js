/* RiderSpot finance v54: show manually added income as independent rows.
 *
 * The ledger source remains public.rider_earnings (RLS-protected).
 * No GPS access, no writes, no balance changes, no new polling queries.
 * Reuses the existing finance screen's authenticated GET responses.
 * The React app owns the original ledger; this read-only section is separate.
 */
(function installManualIncomeLines(win){
  'use strict';
  if(!win||win.__rsManualIncomeLinesV54||typeof win.fetch!=='function')return;
  win.__rsManualIncomeLinesV54=true;

  const doc=win.document;
  const ID='rs-manual-income-lines-v54';
  const AUTO_SECTION='.rs-auto-income-time-list';
  const MANUAL_NOTES=new Set([
    '수기입력 추가분',
    '자동수집 누락분 보충 · 실제 총수입 기준'
  ]);
  const host='qkcqzhkvfbymzjdktshp.supabase.co';
  const won=new Intl.NumberFormat('ko-KR');
  const timeFormat=new Intl.DateTimeFormat('ko-KR',{
    timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  });
  const ledger=new Map();
  let owner='',revision=0,signature='';
  let lastSection=null;
  const original=win.fetch.bind(win);

  function isManualIncome(row){
    return row&&row.source_type==='manual'&&row.gross_entered!==false&&
      Number.isFinite(Number(row.gross_won))&&Number(row.gross_won)>0&&
      typeof row.work_date==='string'&&typeof row.id==='string';
  }
  function displayLabel(row){
    return MANUAL_NOTES.has(String(row?.note||''))?'수기입력 추가분':'수기입력 수익';
  }
  function selectDay(day,rows){
    return rows.filter(row=>isManualIncome(row)&&row.work_date===day)
      .sort((a,b)=>String(b.manual_snapshot_at||b.created_at||'').localeCompare(
        String(a.manual_snapshot_at||a.created_at||'')));
  }
  function summary(rows){
    return {total:rows.reduce((sum,row)=>sum+Number(row.gross_won),0),
      count:rows.length};
  }
  function previewRow(row){
    const at=new Date(row.manual_snapshot_at||row.created_at||'');
    return {id:row.id,label:displayLabel(row),platform:row.platform||'기타',
      amount:Number(row.gross_won),
      time:Number.isFinite(at.getTime())?timeFormat.format(at):'',
      note:MANUAL_NOTES.has(String(row.note||''))?'실제 총수입 차액':'직접 입력'};
  }
  win.__rsManualIncomeMathV54=Object.freeze({
    isManualIncome,displayLabel,selectDay,summary,previewRow
  });

  function ingest(rows,requestOwner,firstPage){
    if(!Array.isArray(rows))return;
    if(requestOwner && requestOwner!==owner){
      owner=requestOwner;ledger.clear();
    }
    if(firstPage)ledger.clear();
    for(const row of rows){
      if(row?.user_id && requestOwner && row.user_id!==requestOwner)continue;
      if(isManualIncome(row))ledger.set(row.id,{
        id:row.id,work_date:row.work_date,source_type:row.source_type,
        platform:row.platform,gross_won:row.gross_won,note:row.note,
        gross_entered:row.gross_entered,
        created_at:row.created_at,manual_snapshot_at:row.manual_snapshot_at
      });
    }
    ++revision;
    win.requestAnimationFrame?.(paint);
  }

  function inspectFetch(input,init){
    try{
      const url=new URL(typeof input==='string'?input:input?.url||String(input),
        win.location?.href||'https://rider-spot.jazzhjm.workers.dev/');
      const method=String(init?.method||input?.method||'GET').toUpperCase();
      if(method!=='GET'||url.hostname!==host||
         url.pathname!=='/rest/v1/rider_earnings')return null;
      const selection=String(url.searchParams.get('select')||'');
      if(selection!=='*'&&!(selection.includes('note')&&selection.includes('source_type')))
        return null; // Ignore HUD/day-goal partial reads.
      const param=String(url.searchParams.get('user_id')||'');
      const requestOwner=param.startsWith('eq.')?param.slice(3):'';
      const headers=new Headers(init?.headers||input?.headers||{});
      const range=String(headers.get('range')||'');
      const isFirst=!range||range.startsWith('0-');
      return {requestOwner,isFirst};
    }catch{return null;}
  }
  win.fetch=function(input,init){
    const tracked=inspectFetch(input,init);
    const response=original(input,init);
    if(tracked){
      Promise.resolve(response).then(res=>{
        if(!res?.ok||typeof res.clone!=='function')return;
        return res.clone().json().then(rows=>ingest(rows,tracked.requestOwner,tracked.isFirst));
      }).catch(()=>{ /* No impact on the finance screen's normal request. */ });
    }
    return response;
  };

  function el(tag,className,content){
    const node=doc.createElement(tag);
    if(className)node.className=className;
    if(content!==undefined)node.textContent=String(content);
    return node;
  }
  function addStyle(){
    if(doc.getElementById(ID+'-style'))return;
    const s=doc.createElement('style');s.id=ID+'-style';
    s.textContent=[
      '#'+ID+'{display:grid;gap:8px;margin:12px 0 14px;padding:14px 15px;'+
        'border:1px solid #e6ebf0;border-radius:16px;background:#fff;'+
        'color:#23374d;box-shadow:0 2px 8px rgba(29,51,79,.025)}',
      '#'+ID+' .rsmi-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}',
      '#'+ID+' .rsmi-title{font-size:14px;font-weight:790;letter-spacing:-.035em}',
      '#'+ID+' .rsmi-sub{font-size:11px;color:#76899b}',
      '#'+ID+' .rsmi-row{display:flex;align-items:center;justify-content:space-between;gap:10px;'+
        'padding:9px 0;border-top:1px solid #eef2f6}',
      '#'+ID+' .rsmi-main{display:flex;flex-direction:column;gap:3px;min-width:0}',
      '#'+ID+' .rsmi-name{font-size:12px;font-weight:735;color:#394e65}',
      '#'+ID+' .rsmi-detail{font-size:11px;color:#8291a2}',
      '#'+ID+' .rsmi-money{font-size:14px;font-weight:790;color:#28755c;'+
        'white-space:nowrap;font-variant-numeric:tabular-nums}',
      '#'+ID+' .rsmi-foot{font-size:11px;color:#8190a0;line-height:1.5}'
    ].join('\n');
    doc.head?.append(s);
  }
  function paint(){
    const panel=doc.querySelector(AUTO_SECTION);
    const current=doc.getElementById(ID);
    if(!panel||!panel.isConnected){
      current?.remove();signature='';lastSection=null;return;
    }
    const day=panel.querySelector('input[aria-label="배달 수익 조회 날짜"]')?.value;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day||''))){
      current?.remove();signature='';return;
    }
    const rows=selectDay(day,[...ledger.values()]);
    if(!rows.length){
      current?.remove();signature='';return;
    }
    const snapshot=rows.map(r=>[r.id,r.gross_won,r.note,r.manual_snapshot_at].join(':')).join('|');
    const nextSignature=owner+'|'+day+'|'+revision+'|'+snapshot;
    if(current&&lastSection===panel&&signature===nextSignature &&
       current.previousElementSibling===panel)return;
    addStyle();
    const box=current||el('section');
    box.id=ID;box.setAttribute('aria-label','수기입력 수익 내역');
    box.replaceChildren();
    const totals=summary(rows);
    const header=el('div','rsmi-head');
    header.append(el('strong','rsmi-title','수기입력 추가분'),
      el('span','rsmi-sub',rows.length+'건 · +'+won.format(totals.total)+'원'));
    box.append(header);
    for(const row of rows){
      const item=previewRow(row);
      const card=el('div','rsmi-row');
      const detail=el('div','rsmi-main');
      detail.append(el('span','rsmi-name',item.label),
        el('span','rsmi-detail',item.platform+
          (item.time?' · '+item.time:'')+' · '+item.note));
      card.append(detail,el('strong','rsmi-money','+'+won.format(item.amount)+'원'));
      box.append(card);
    }
    box.append(el('div','rsmi-foot',
      '자동수집과 구분되는 수동 수익 기록입니다. 총수익에 이미 포함된 금액이에요.'));
    if(box.previousElementSibling!==panel)panel.insertAdjacentElement('afterend',box);
    lastSection=panel;signature=nextSignature;
  }
  const refresh=()=>win.requestAnimationFrame?.(paint);
  win.addEventListener('riderspot:screen',refresh);
  win.addEventListener('riderspot:tab-restored',refresh);
  win.addEventListener('riderspot:finance-changed',refresh);
  win.addEventListener('riderspot:auto-income-updated',refresh);
  doc.addEventListener('change',e=>{
    if(e.target?.matches?.('input[aria-label="배달 수익 조회 날짜"]'))
      win.setTimeout(refresh,0);
  },true);
  if(doc.readyState==='loading')
    doc.addEventListener('DOMContentLoaded',refresh,{once:true});
  else refresh();
  // A very light DOM-presence check covers React remounts/date navigation.
  win.setInterval(refresh,1800);
})(typeof window==='undefined'?null:window);
