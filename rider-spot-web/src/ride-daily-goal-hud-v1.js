/* RiderSpot: ride-only, account-scoped daily target. Web UI only.
 * Preserves trip/GPS, monthly goal settings, ledgers and automatic income writing.
 */
(function installRiderSpotDailyGoal(win) {
  'use strict';
  if (!win || win.__rsDailyGoalV1) return;
  win.__rsDailyGoalV1 = true;
  const doc = win.document;
  const ID = 'rs-ride-daily-goal-v1';
  const STYLE = 'rs-ride-daily-goal-style-v1';
  const CYCLE_MS = 60000;
  const now = () => Date.now();
  const money = value => Math.max(0, Math.round(value)).toLocaleString('ko-KR') + '원';
  const noon = day => new Date(day + 'T12:00:00Z');
  const addDays = (day, count) => {
    const d = noon(day); d.setUTCDate(d.getUTCDate() + count);
    return d.toISOString().slice(0, 10);
  };
  const workDay = (at = new Date()) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', hourCycle:'h23'
    }).formatToParts(at).map(p => [p.type, p.value]));
    const day = parts.year + '-' + parts.month + '-' + parts.day;
    return Number(parts.hour) < 3 ? addDays(day, -1) : day;
  };
  const monthLast = day => {
    const d = new Date(day.slice(0,7) + '-01T12:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + 1);
    return addDays(d.toISOString().slice(0, 10), -1);
  };
  const nonPersonal = row => !['식비','개인 비용'].includes(row.category);
  const number = value => Number(value) || 0;
  function calculate(day, goal, rows) {
    const start = day.slice(0,7) + '-01';
    const last = monthLast(day);
    const oldEarnings = rows.earnings.filter(row => row.work_date >= start && row.work_date < day && row.gross_entered !== false);
    const todayEarnings = rows.earnings.filter(row => row.work_date === day && row.gross_entered !== false);
    const total = items => items.reduce((sum,row) => sum + number(row.gross_won), 0);
    const priorDays = new Set(oldEarnings.filter(row => number(row.gross_won) > 0).map(row => row.work_date)).size;
    const costs = (before) => {
      const inRange = (date) => date >= start && (before ? date < day : date === day);
      return rows.earnings.filter(row => row.gross_entered !== false && inRange(row.work_date))
        .reduce((sum,row) => sum + number(row.expenses_won),0)
        + rows.fuel.filter(row => inRange(row.fueled_on)).reduce((sum,row)=>sum+number(row.cost_won),0)
        + rows.maintenance.filter(row => inRange(row.serviced_on)).reduce((sum,row)=>sum+number(row.cost_won),0)
        + rows.extras.filter(row => nonPersonal(row) && inRange(row.expense_date))
          .reduce((sum,row)=>sum+number(row.amount_won),0);
    };
    const target = Math.max(0, Math.trunc(number(goal.monthly_target_won)));
    const basis = goal.goal_basis === 'net' ? 'net' : 'gross';
    const uncertainty = basis === 'net' && rows.earnings.some(row =>
      row.gross_entered !== false && row.work_date >= start && row.work_date <= day &&
      row.expense_scope !== 'other_only' && number(row.expenses_won) > 0);
    if(uncertainty) return {status:'uncertain'};
    const before = total(oldEarnings) - (basis === 'net' ? costs(true) : 0);
    const earnedToday = total(todayEarnings) - (basis === 'net' ? costs(false) : 0);
    const monthlyLeftBeforeToday = Math.max(0, target - before);
    if (monthlyLeftBeforeToday === 0) return {status:'month-complete'};
    const planned = Math.max(0, Math.trunc(number(goal.planned_work_days)));
    const remainingPlanned = Math.max(0, planned - priorDays);
    const calendarDays = Math.max(0, Math.round((noon(last) - noon(day))/86400000) + 1);
    const days = Math.min(remainingPlanned, calendarDays);
    if (days === 0) return {status:'no-days'};
    const dailyTarget = Math.ceil(monthlyLeftBeforeToday / days);
    return {
      status: earnedToday >= dailyTarget ? 'complete' : 'remaining',
      dailyTarget, todayEarned:earnedToday, remaining:Math.max(0,dailyTarget-earnedToday),
      days, basis
    };
  }
  // Exposed for deterministic offline verification only. No storage or public API writes.
  win.__rsDailyGoalMathV1 = Object.freeze({calculate,workDay,monthLast});

  const state = {element:null, userId:null, day:null, data:null,
    requestKey:null, lastFetch:0, needsRefresh:true, busy:false, retryAfter:0, status:'loading'};
  let requestSerial = 0;
  function style() {
    if(doc.getElementById(STYLE)) return;
    const node=doc.createElement('style'); node.id=STYLE;
    node.textContent = [
      '.app.rs34-app > header #'+ID+'{flex:0 1 auto;min-width:0;max-width:160px;margin:0 7px;padding:4px 10px;min-height:40px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:1px;border:1px solid #E3EAF0;border-radius:12px;background:#F3F6FA;color:#31537B;pointer-events:none;box-shadow:none;line-height:1.25;white-space:nowrap;overflow:hidden}',
      '#'+ID+' .rsdg-caption{max-width:100%;color:#758598;font-size:10px;font-weight:700;letter-spacing:-.025em;overflow:hidden;text-overflow:ellipsis}',
      '#'+ID+' .rsdg-amount{max-width:100%;font-size:14px;color:#355D91;font-weight:850;font-variant-numeric:tabular-nums;letter-spacing:-.035em;overflow:hidden;text-overflow:ellipsis}',
      '#'+ID+'[data-complete="true"]{background:#ECF7F1;border-color:#D5EBDD}',
      '#'+ID+'[data-complete="true"] .rsdg-amount{color:#397C5B}',
      '@media(max-width:360px){.app.rs34-app > header #'+ID+'{margin:0 3px;padding:4px 7px;max-width:125px;min-height:39px}#'+ID+' .rsdg-caption{font-size:9px}#'+ID+' .rsdg-amount{font-size:12px}}',
      '@media(min-width:800px){.app.rs34-app > header #'+ID+'{max-width:200px;margin-inline:14px}}'
    ].join('\n');
    doc.head?.appendChild(node);
  }
  function isRiding() {
    return Boolean(win.__rsRideApi?.trip && !win.__rsRideApi.trip.ended_at);
  }
  function attach() {
    if(!isRiding()){
      if(state.element){state.element.remove();state.element=null;}
      if(state.userId){state.userId=null;state.day=null;state.data=null;state.needsRefresh=true;++requestSerial;}
      return false;
    }
    const header=doc.querySelector('.app.rs34-app > header');
    if(!header)return false;
    if(state.element?.parentNode !== header){
      style();
      const el=doc.createElement('div');el.id=ID;
      el.setAttribute('role','status');el.setAttribute('aria-label','오늘 목표 남은 금액');
      const cap=doc.createElement('span');cap.className='rsdg-caption';
      const val=doc.createElement('strong');val.className='rsdg-amount';
      el.append(cap,val);
      const right=header.querySelector('.header-right');
      if(right)header.insertBefore(el,right); else header.appendChild(el);
      state.element=el;
      render();
    }
    return true;
  }
  function render() {
    const el=state.element;
    if(!el || !el.isConnected) return;
    const cap=el.querySelector('.rsdg-caption');
    const val=el.querySelector('.rsdg-amount');
    if(!cap || !val)return;
    let caption='오늘 목표까지',amount='확인 중';
    let complete=false;
    if(state.status==='error'){caption='오늘 목표';amount='조회 실패';}
    else if(state.status==='no-goal'){caption='오늘 목표';amount='로그인 필요';}
    else if(state.status==='uncertain'){caption='오늘 목표';amount='비용 확인 필요';}
    else if(state.status==='no-days'){caption='월 목표';amount='근무일 확인';}
    else if(state.status==='month-complete'){caption='이번 달 목표';amount='달성 완료';complete=true;}
    else if(state.data?.status === 'complete'){caption='오늘 목표';amount='달성 완료';complete=true;}
    else if(state.data?.status === 'remaining')amount=money(state.data.remaining);
    if(cap.textContent!==caption)cap.textContent=caption;
    if(val.textContent!==amount)val.textContent=amount;
    if(el.dataset.complete!==(complete?'true':'false'))el.dataset.complete=complete?'true':'false';
    const label=caption + ' ' + amount;
    if(el.getAttribute('aria-label')!==label)el.setAttribute('aria-label',label);
  }
  async function fetchUser(client) {
    const {data,error}=await client.auth.getUser();
    if(error)throw error;
    return data?.user?.id || null;
  }
  async function pages(client,table,date,fields,uid,start,end){
    const out=[];
    for(let offset=0;offset<10000;offset+=500){
      const response=await client.from(table).select(fields)
        .eq('user_id',uid).gte(date,start).lte(date,end).order(date,{ascending:false})
        .range(offset,offset+499);
      if(response.error)throw response.error;
      const batch=Array.isArray(response.data)?response.data:[];
      out.push(...batch);
      if(batch.length<500)return out;
    }
    throw Error('Record limit exceeded');
  }
  async function fetchData(uid,day,token){
    const client=win.__rsClient;
    if(!client)return;
    const start=day.slice(0,7)+'-01';
    const [goalRes,earnings,fuel,maintenance,extras]=await Promise.all([
      client.from('rider_finance_goals').select('monthly_target_won,planned_work_days,goal_basis')
        .eq('user_id',uid).maybeSingle(),
      pages(client,'rider_earnings','work_date',
        'work_date,gross_won,gross_entered,expenses_won,expense_scope',uid,start,day),
      pages(client,'rider_fuel_logs','fueled_on','fueled_on,cost_won',uid,start,day),
      pages(client,'maintenance_logs','serviced_on','serviced_on,cost_won',uid,start,day),
      pages(client,'rider_extra_expenses','expense_date','expense_date,amount_won,category',uid,start,day)
    ]);
    if(goalRes.error)throw goalRes.error;
    if(token!==requestSerial || !isRiding())return;
    const goal={monthly_target_won:3000000,planned_work_days:25,goal_basis:'gross',...(goalRes.data||{})};
    state.data=calculate(day,goal,{earnings,fuel,maintenance,extras});
    state.status=state.data.status;
    state.lastFetch=now();
    state.needsRefresh=false;
    render();
  }
  async function refresh() {
    if(!isRiding() || state.busy || !win.__rsClient || doc.hidden)return;
    const day=workDay();
    if(state.day!==day){state.day=day;state.needsRefresh=true;state.data=null;state.status='loading';render();}
    if(!state.needsRefresh && now()-state.lastFetch<CYCLE_MS)return;
    if(now()<state.retryAfter)return;
    state.busy=true;
    const token=++requestSerial;
    try {
      const uid=await fetchUser(win.__rsClient);
      if(token!==requestSerial||!isRiding())return;
      if(!uid){state.userId=null;state.data=null;state.status='no-goal';state.needsRefresh=false;state.lastFetch=now();render();return;}
      if(state.userId && state.userId!==uid){state.data=null;state.status='loading';render();}
      state.userId=uid;
      await fetchData(uid,day,token);
    }catch(err){
      if(token===requestSerial&&isRiding()){
        state.status=state.data?.status||'error';
        state.needsRefresh=true;
        state.retryAfter=now()+10000;
        render();
        console.warn('[RiderSpotDailyGoal] read-only refresh',err?.message||err);
      }
    }finally{state.busy=false;}
  }
  let lastRide=false;
  function tick() {
    const active=attach();
    if(active){
      if(!lastRide){state.status='loading';state.data=null;state.needsRefresh=true;render();}
      void refresh();
    }
    lastRide=active;
  }
  function changed(event){
    if(event?.detail?.userId && state.userId && event.detail.userId!==state.userId)return;
    state.needsRefresh=true;
    state.retryAfter=0;
    tick();
  }
  win.addEventListener('riderspot:finance-changed',changed);
  win.addEventListener('riderspot:auto-income-updated',changed);
  win.addEventListener('riderspot:screen',tick);
  win.addEventListener('riderspot:tab-restored',tick);
  win.addEventListener('focus',tick);
  win.addEventListener('online',tick);
  doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)tick();});
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',tick,{once:true});
  else tick();
  win.setInterval(tick,1500);
})(typeof window === 'undefined' ? null : window);
