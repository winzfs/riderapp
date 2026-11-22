  /* RiderSpot auto-income native bridge v1: trusted-origin, local first. */
  (() => {
    const API = Object.freeze({
      call: (action, payload={}) => send(action, payload),
    });
    window.__rsIncomeNative = API;
    const ID = 'rs-native-income-panel-v1';
    const STYLE_ID = 'rs-native-income-css-v1';
    const fmt = n => new Intl.NumberFormat('ko-KR').format(Number(n)||0)+'원';
    const weekday = (date=new Date()) => {
      const shifted = new Date(date.getTime()-3*3600000);
      const pieces = Object.fromEntries(new Intl.DateTimeFormat('en-US',{
        timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
      }).formatToParts(shifted).map(p=>[p.type,p.value]));
      return pieces.year+'-'+pieces.month+'-'+pieces.day;
    };
    let userId=null, userAt=0, busy=false, nativeStatus=null, serverRows=[], pendingRows=[], summary=null;
    let lastUiAt=0,lastSyncAt=0,lastRenderedSignature='';
    function el(tag,cls,txt) {
      const node=document.createElement(tag);
      if(cls)node.className=cls;
      if(txt!=null)node.textContent=String(txt);
      return node;
    }
    async function owner(){
      const now=Date.now();
      if(userId&&now-userAt<60000)return userId;
      try{
        const client=window.__rsClient;
        if(!client?.auth)return null;
        const {data,error}=await client.auth.getUser();
        if(error||!data?.user?.id)return null;
        userId=data.user.id;userAt=now;return userId;
      }catch{return null;}
    }
    function css(){
      if(document.getElementById(STYLE_ID))return;
      const style=el('style');style.id=STYLE_ID;
      style.textContent=[
        '#'+ID+'{font-family:inherit;background:#fff;border:1px solid #e8edf3;border-radius:21px;padding:19px 17px;margin:16px 0 20px;box-shadow:0 3px 16px rgba(26,43,62,.045);color:#263548}',
        '#'+ID+' .rsai-head{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:12px}',
        '#'+ID+' .rsai-title{font-weight:760;font-size:17px;letter-spacing:-.045em}',
        '#'+ID+' .rsai-chip{font-size:11px;padding:5px 8px;border-radius:30px;background:#eaf6f0;color:#277854;font-weight:700}',
        '#'+ID+' .rsai-desc{font-size:12px;line-height:1.6;color:#6f8090;margin:0 0 12px}',
        '#'+ID+' .rsai-stats{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:10px 0 14px}',
        '#'+ID+' .rsai-stat{background:#f5f8fb;border-radius:14px;padding:12px 13px}',
        '#'+ID+' .rsai-label{display:block;font-size:11px;color:#778797;margin-bottom:5px}',
        '#'+ID+' .rsai-value{font-size:19px;font-weight:760;font-variant-numeric:tabular-nums}',
        '#'+ID+' .rsai-action{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}',
        '#'+ID+' button{font-family:inherit;font-size:13px;font-weight:700;border:0;border-radius:11px;padding:10px 13px;cursor:pointer}',
        '#'+ID+' .rsai-primary{background:#284cdd;color:white}',
        '#'+ID+' .rsai-sub{background:#eff3f8;color:#415269}',
        '#'+ID+' .rsai-item{display:flex;gap:10px;justify-content:space-between;align-items:center;padding:11px 1px;border-top:1px solid #edf0f5}',
        '#'+ID+' .rsai-item strong{font-size:14px;white-space:nowrap;font-variant-numeric:tabular-nums}',
        '#'+ID+' .rsai-small{font-size:11px;color:#7c8898;margin-top:4px}',
        '#'+ID+' .rsai-section{font-size:13px;font-weight:720;margin:15px 0 9px}',
        '#'+ID+' .rsai-warning{color:#92653c;font-size:12px;margin-top:8px;line-height:1.5}',
        '#'+ID+' .rsai-state{font-size:11px;color:#5b7182;font-weight:600}',
      ].join('');
      document.head?.appendChild(style);
    }
    function locate(){
      const page=document.querySelector('.finance-page');
      if(!page||!document.body.contains(page))return;
      css();
      let panel=document.getElementById(ID);
      if(!panel){
        panel=el('section');panel.id=ID;panel.setAttribute('aria-label','자동 배달 수익');
        page.insertBefore(panel,page.firstChild);
      }
      return panel;
    }
    function button(label,cls,callback){
      const b=el('button',cls,label);
      b.type='button';
      b.addEventListener('click',callback);
      return b;
    }
    async function refreshBackend(uid){
      if(!uid||!window.__rsClient)return;
      const day=weekday();
      try{
        const [auto,earnings]=await Promise.all([
          window.__rsClient.from('rider_auto_deliveries')
            .select('capture_id,captured_at,platform,gross_won,base_won,extra_won,reward_won,status,work_date')
            .eq('user_id',uid).order('captured_at',{ascending:false}).limit(25),
          window.__rsClient.from('rider_earnings')
            .select('work_date,platform,gross_won,gross_entered')
            .eq('user_id',uid).eq('work_date',day)
        ]);
        if(auto.error)throw auto.error;
        if(earnings.error)throw earnings.error;
        serverRows=auto.data||[];
        const rows=(earnings.data||[]).filter(r=>r.gross_entered!==false);
        summary={
          day,
          amount:rows.reduce((a,r)=>a+Number(r.gross_won||0),0),
          count:(auto.data||[]).filter(r=>r.work_date===day&&r.status==='applied').length
        };
      }catch(err){ console.warn('[RiderSpotIncome] query',err?.message||err); }
    }
    async function sync(uid){
      if(!uid||busy||!window.__rsClient)return;
      busy=true;
      try{
        const s=await API.call('income-status',{userId:uid});
        nativeStatus=s;
        if(!s.enabled||!s.ownerMatches)return;
        const result=await API.call('income-records',{userId:uid});
        pendingRows=Array.isArray(result.records)?result.records:[];
        let changed=false;
        for(const row of pendingRows){
          if(row.server_status || row.strength!=='STRONG' ||
            row.state!=='CANDIDATE')continue;
          const amount=Number(row.amount),base=Number(row.base)||0,
                extra=Number(row.extra)||0,reward=Number(row.reward)||0;
          if(amount<500||amount>150000||base+extra+reward!==amount)continue;
          try{
            const {data,error}=await window.__rsClient.rpc('rs_append_auto_income',{
              p_capture_id:String(row.id),
              p_captured_at:new Date(Number(row.time)).toISOString(),
              p_platform:row.platform,
              p_amount:amount,p_base:base,p_extra:extra,p_reward:reward
            });
            if(error)throw error;
            await API.call('income-ack',{userId:uid,captureId:String(row.id),
              status:data?.status||'needs_review'});
            changed=changed||data?.applied;
          }catch(error){ console.warn('[RiderSpotIncome] sync pending',error?.message||error);break;}
        }
        if(changed){
          window.dispatchEvent(new CustomEvent('riderspot:finance-changed',{detail:{userId:uid}}));
          window.dispatchEvent(new Event('riderspot:auto-income-updated'));
        }
      }finally{busy=false;}
    }
    async function tick(force=false){
      if(document.hidden||busy)return;
      const at=Date.now();
      if(!force&&at-lastSyncAt<10000&&at-lastUiAt<5000)return;
      const uid=await owner();
      if(!uid){render();return;}
      if(force||at-lastSyncAt>12000){
        lastSyncAt=at;
        try{nativeStatus=await API.call('income-status',{userId:uid});}
        catch{}
        await sync(uid);
        await refreshBackend(uid);
        try{
          const result=await API.call('income-records',{userId:uid});
          pendingRows=Array.isArray(result.records)?result.records:[];
        }catch{}
      }
      lastUiAt=at;render();
    }
    async function toggle(){
      const uid=await owner();
      if(!uid){alert('라이더스팟 로그인 후 자동 수집을 켤 수 있어요.');return;}
      if(nativeStatus?.enabled){
        await API.call('income-enable',{userId:uid,enabled:false});await tick(true);return;
      }
      if(!confirm('쿠팡이츠와 배민커넥트의 완료 화면에서 수수료 항목을 읽어 자동 수익을 기록할까요?\n\n수집한 금액·시간·플랫폼은 라이더스팟 계정의 수익 원장에 저장됩니다. 고객 이름이나 주소, 화면 원문은 보관하지 않습니다.\n\n수집은 언제든 끌 수 있고, 오인식 가능성이 있으니 정산 금액과 비교해 주세요.'))return;
      const state=await API.call('income-enable',{userId:uid,enabled:true});
      if(!state.enabled){alert(state.message||'다른 계정의 수집 내역이 남아 있어 전환할 수 없어요.');return;}
      if(!state.accessibility)await API.call('income-settings',{});
      await tick(true);
    }
    async function resolve(row,choice){
      const uid=await owner();
      if(!uid)return;
      const msg=choice==='include'?
        '이 금액을 수익에 추가할까요? 기존 수동 입력과 중복되지 않는지 확인해 주세요.':
        choice==='covered'?'이미 입력된 수익에 포함된 금액으로 표시할까요?':
        '이 금액을 수익에서 제외할까요?';
      if(!confirm(msg))return;
      try{
        const {error}=await window.__rsClient.rpc('rs_resolve_auto_income',{
          p_capture_id:row.capture_id,p_choice:choice
        });
        if(error)throw error;
        window.dispatchEvent(new CustomEvent('riderspot:finance-changed',{detail:{userId:uid}}));
        await tick(true);
      }catch(err){alert('저장할 수 없어요: '+(err?.message||err));}
    }
    function renderTimeline(){
      const stale=document.getElementById('rs-native-income-day-total');
      if(!summary){stale?.remove();return;}
      const page=document.querySelector('.trip-page');
      const heading=page?.querySelector('.rs-timeline-heading-main h1') ||
        page?.querySelector('h1');
      const currentLabel=new Intl.DateTimeFormat('ko-KR',{
        timeZone:'Asia/Seoul',month:'long',day:'numeric'
      }).format(new Date());
      // Never show today's sum when the rider is viewing a different historical date.
      if(!page||!heading?.textContent?.includes(currentLabel)){
        stale?.remove();return;
      }
      const anchor=page.querySelector('.record-income');
      if(!anchor){stale?.remove();return;}
      let row=stale;
      if(!row){
        row=el('div');
        row.id='rs-native-income-day-total';
        row.setAttribute('aria-live','polite');
        row.style.cssText='margin:8px 0 14px;padding:10px 12px;background:#f2f6fb;border-radius:12px;color:#3f5873;font-size:12px;font-weight:650;';
        anchor.insertAdjacentElement('afterend',row);
      }
      row.textContent='오늘 누적 수익 '+fmt(summary.amount)+' · 자동 반영 '+summary.count+'건';
    }
    function render(){
      renderTimeline();
      const root=locate();
      if(!root)return;
      const status=nativeStatus||{};
      const latest=[...serverRows].slice(0,12);
      const flag=status.enabled&&status.ownerMatches;
      // Never replace the React page; only this additive, native-owned section.
      root.replaceChildren();
      const head=el('div','rsai-head');
      head.append(el('span','rsai-title','배달 수익 자동수집'));
      head.append(el('span','rsai-chip',flag?(status.accessibility?'수집 중':'권한 확인'):'선택 기능'));
      root.append(head);
      root.append(el('p','rsai-desc','배달 완료 수수료를 건별로 저장하고 타임라인에는 일일 누적 금액으로 반영해요.'));
      const stats=el('div','rsai-stats');
      for(const [label,value] of [
        ['오늘 누적 수익',summary?fmt(summary.amount):'조회 중'],
        ['오늘 자동 반영',summary?summary.count+'건':'—']
      ]){
        const cell=el('div','rsai-stat');
        cell.append(el('span','rsai-label',label),el('strong','rsai-value',value));
        stats.append(cell);
      }
      root.append(stats);
      const actions=el('div','rsai-action');
      actions.append(button(flag?'수집 끄기':'자동수집 시작','rsai-primary',()=>void toggle()));
      actions.append(button('접근성 설정','rsai-sub',()=>void API.call('income-settings')));
      actions.append(button('새로고침','rsai-sub',()=>void tick(true)));
      root.append(actions);
      if(status.owner&&userId&&!status.ownerMatches)
        root.append(el('p','rsai-warning','이 기기의 수집 원장은 다른 계정에 연결되어 있어요.'));
      if(flag&&!status.accessibility)
        root.append(el('p','rsai-warning','안드로이드 접근성 설정에서 라이더스팟 수익 자동수집을 켜야 해요.'));
      root.append(el('h3','rsai-section','건별 자동수익 내역'));
      if(!latest.length)root.append(el('p','rsai-desc','아직 수집된 배달 수익이 없어요.'));
      for(const row of latest){
        const item=el('div','rsai-item');
        const side=el('div');
        const when=new Date(row.captured_at);
        side.append(el('div',null,row.platform+' · '+new Intl.DateTimeFormat('ko-KR',{
          hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}).format(when)));
        side.append(el('div','rsai-small',
          '기본 '+fmt(row.base_won)+' · 추가 '+fmt(row.extra_won)+' · 리워드 '+fmt(row.reward_won)));
        const right=el('div');
        right.style.textAlign='right';
        right.append(el('strong',null,'+'+fmt(row.gross_won)));
        const label=row.status==='applied'?'자동 반영':
          row.status==='needs_review'?'중복 확인 필요':
          row.status==='covered'?'기존 입력에 포함':'제외됨';
        right.append(el('div','rsai-state',label));
        item.append(side,right);
        root.append(item);
        if(row.status==='needs_review'){
          const controls=el('div','rsai-action');
          controls.append(button('추가','rsai-sub',()=>void resolve(row,'include')));
          controls.append(button('기존 수익에 포함','rsai-sub',()=>void resolve(row,'covered')));
          controls.append(button('제외','rsai-sub',()=>void resolve(row,'reject')));
          root.append(controls);
        }
      }
      const queued=pendingRows.filter(r=>r.strength==='STRONG'&&r.state==='CANDIDATE'&&!r.server_status);
      if(queued.length)root.append(el('p','rsai-warning','서버 동기화 대기 '+queued.length+'건 · 온라인에서 다시 시도해요.'));
      root.append(el('p','rsai-desc','수동 입력과 중복되는 날짜의 수익은 자동 합산하지 않고 확인 대상으로 보관해요.'));
    }
    window.addEventListener('focus',()=>void tick(true));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void tick(true);});
    window.addEventListener('riderspot:finance-changed',()=>{setTimeout(()=>void tick(true),250);});
    // This timer never triggers WebView navigation/reload or maps reinitialization.
    setInterval(()=>void tick(false),5000);
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void tick(true));
    else void tick(true);
  })();
