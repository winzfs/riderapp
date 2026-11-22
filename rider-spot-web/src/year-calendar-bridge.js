/* RiderSpot My Year v1: additive, read-only calendar. No trip or earnings writes. */
(function () {
  "use strict";
  if (window.__rsMyYearVersion) return;
  window.__rsMyYearVersion = "2.0";
  const API = "https://qkcqzhkvfbymzjdktshp.supabase.co";
  const PUBLIC_KEY = "sb_publishable_Bva-1GI3jPgZUkHuxoThJQ_GDelHoRs";
  const STORAGE_KEY = "sb-qkcqzhkvfbymzjdktshp-auth-token";
  const KST = 9 * 60 * 60 * 1000;
  const today = new Date(Date.now() + KST).toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const won = n => new Intl.NumberFormat("ko-KR").format(Math.round(n || 0)) + "원";
  const distance = n => new Intl.NumberFormat("ko-KR", {maximumFractionDigits:1}).format(n || 0) + "km";
  const duration = min => {
    const m = Math.round(min || 0);
    return m >= 60 ? Math.floor(m / 60) + "시간" + (m % 60 ? " " + (m % 60) + "분" : "") : m + "분";
  };
  const koreaDay = value => {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms + KST).toISOString().slice(0,10) : "";
  };
  const isoStart = year => new Date(Date.UTC(year,0,1) - KST).toISOString();
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const state = {dialog:null,year:currentYear,view:"year",month:0,day:1,mode:"work",loading:false,error:"",
    rows:new Map(),request:0,abort:null,unregister:null,release:null};
  function session() {
    let item;
    try { item = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
    if (item && item.currentSession) item = item.currentSession;
    if (!item || !item.access_token || !item.user || !/^[\da-f-]{36}$/i.test(item.user.id || "")) return null;
    return { token:item.access_token, userId:item.user.id };
  }
  async function list(table, select, filters, auth, signal) {
    let result = [], offset = 0;
    for (let page = 0; page < 30; page++) {
      const url = new URL(API + "/rest/v1/" + table);
      url.searchParams.set("select", select);
      url.searchParams.set("user_id", "eq." + auth.userId);
      for (const [field, value] of Object.entries(filters)) {
        for (const part of Array.isArray(value) ? value : [value]) url.searchParams.append(field, part);
      }
      url.searchParams.set("limit", "1000");
      url.searchParams.set("offset", String(offset));
      const response = await fetch(url.toString(), {
        headers: {apikey:PUBLIC_KEY,authorization:"Bearer " + auth.token,accept:"application/json"},
        cache:"no-store",signal
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error("로그인 상태를 다시 확인해 주세요.");
        throw new Error("기록을 불러오지 못했어요. (" + response.status + ")");
      }
      const block = await response.json();
      if (!Array.isArray(block)) throw new Error("기록 응답 형식을 확인해 주세요.");
      result.push(...block);
      if (block.length < 1000) return result;
      offset += block.length;
    }
    throw new Error("연간 기록이 너무 많아 집계가 중단됐어요.");
  }
  function compute(trips, earnings, year) {
    const rows = new Map();
    const row = day => {
      if (!rows.has(day)) rows.set(day,{day,trips:0,minutes:0,km:0,gross:0,deliveries:0,hasEarning:false});
      return rows.get(day);
    };
    const starts = String(year) + "-";
    for (const trip of trips) {
      const day = koreaDay(trip.started_at);
      const start = Date.parse(trip.started_at), end = Date.parse(trip.ended_at);
      if (!day.startsWith(starts) || !Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
      const r = row(day);
      r.trips++;
      r.minutes += Math.min(1440 * 3, (end - start) / 60000);
      r.km += Math.max(0,Number(trip.distance_km) || 0);
    }
    for (const item of earnings) {
      const day = String(item.work_date || "");
      if (!day.startsWith(starts) || item.gross_entered === false) continue;
      const r = row(day);
      r.hasEarning = true;
      r.gross += Math.max(0,Number(item.gross_won) || 0);
      r.deliveries += Math.max(0,Number(item.deliveries) || 0);
    }
    return rows;
  }
  async function load() {
    if (!state.dialog) return;
    state.abort?.abort();
    const controller = new AbortController();
    state.abort = controller;
    const requestId = ++state.request;
    state.loading = true;
    state.error = "";
    state.rows = new Map();
    render();
    const auth = session();
    if (!auth) {
      state.loading = false;
      state.error = "연간 기록을 보려면 로그인해 주세요.";
      render();
      return;
    }
    const year = state.year;
    try {
      const [trips, earnings] = await Promise.all([
        list("trips","started_at,ended_at,distance_km",
          {started_at:["gte." + isoStart(year),"lt." + isoStart(year+1)], ended_at:"not.is.null"},auth,controller.signal),
        list("rider_earnings","work_date,gross_won,gross_entered,deliveries",
          {work_date:["gte." + year + "-01-01","lt." + (year+1) + "-01-01"]},auth,controller.signal)
      ]);
      // Filter to the selected KST year. The user_id filter and RLS both apply.
      if (state.request !== requestId || controller.signal.aborted) return;
      state.rows = compute(trips,earnings,year);
      state.loading = false;
      render();
    } catch (err) {
      if (controller.signal.aborted || state.request !== requestId) return;
      state.loading = false;
      state.error = err?.message || "일시적으로 기록을 불러오지 못했어요.";
      render();
    }
  }
  const weekdays = ["일","월","화","수","목","금","토"];
  function dateKey(month,day) {
    return String(state.year) + "-" + String(month+1).padStart(2,"0") + "-" + String(day).padStart(2,"0");
  }
  function monthDays(month) { return new Date(Date.UTC(state.year,month+1,0)).getUTCDate(); }
  function weekday(month,day) { return new Date(Date.UTC(state.year,month,day)).getUTCDay(); }
  function valueColor(row) {
    if (!row) return "zero";
    if (state.mode === "income") return row.gross >= 150000 ? "strong" : row.gross >= 60000 ? "middle" : row.gross > 0 ? "light" : "zero";
    if (!row.trips && !row.hasEarning) return "zero";
    return row.minutes >= 360 ? "strong" : row.minutes >= 180 ? "middle" : "light";
  }
  function stats(rows) {
    const list = [...rows.values()];
    return {
      workDays:list.filter(x=>x.trips > 0 || x.hasEarning).length,
      gross:list.reduce((sum,x)=>sum+x.gross,0),
      km:list.reduce((sum,x)=>sum+x.km,0),
      minutes:list.reduce((sum,x)=>sum+x.minutes,0)
    };
  }
  function clearBody() {
    const body = state.dialog?.querySelector(".rs-year-body");
    if (!body) return null;
    body.replaceChildren();
    return body;
  }
  function button(label, className, click, ariaLabel) {
    const b = make("button",className,label);
    b.type="button";
    if (ariaLabel) b.setAttribute("aria-label",ariaLabel);
    b.addEventListener("click",click);
    return b;
  }
  function render() {
    const body = clearBody();
    if (!body) return;
    if (state.loading) {
      body.append(make("div","rs-year-loading","기록을 정리하고 있어요…"));
      return;
    }
    if (state.error) {
      const panel = make("div","rs-year-empty");
      panel.append(make("div","rs-year-empty-glyph","◌"),make("strong",null,state.error));
      panel.append(button("다시 불러오기","rs-year-retry",load));
      body.append(panel);
      return;
    }
    if (state.view === "month") renderMonth(body);
    else renderYear(body);
  }
  function yearHero(body) {
    const hero = make("header","rs-year-hero");
    const overline = make("div","rs-year-hero-top");
    overline.append(make("small","rs-year-overline","MY YEAR / ANNUAL ARCHIVE"),
      make("span","rs-year-index","01 — 12"));
    const main = make("div","rs-year-hero-main");
    const intro = make("div","rs-year-intro");
    intro.append(make("h2","rs-year-title","나의 1년"),
      make("p","rs-year-intro-caption","한 해의 운행 기록"));
    const controls = make("nav","rs-year-controls");
    controls.setAttribute("aria-label","연도 변경");
    const prev = button("‹","rs-year-nav-icon",()=>{state.year--;load();},"이전 연도");
    const number = make("strong","rs-year-current",String(state.year));
    const next = button("›","rs-year-nav-icon",()=>{if(state.year<currentYear){state.year++;load();}},"다음 연도");
    next.disabled=state.year>=currentYear;
    controls.append(prev,number,next);
    main.append(intro,controls);
    hero.append(overline,main);
    body.append(hero);
  }
  function monthHero(body,month) {
    const hero = make("header","rs-year-month-hero");
    const top = make("div","rs-year-month-top");
    top.append(
      button("‹","rs-year-nav-icon",()=>{state.view="year";render();},"나의 1년으로 돌아가기"),
      make("span","rs-year-eyebrow",String(state.year)+" / MONTHLY RECORD")
    );
    const headline = make("div","rs-year-month-hero-title");
    headline.append(make("strong",null,String(month+1).padStart(2,"0")),
      make("small",null,"월의 라이딩"));
    hero.append(top,headline);
    body.append(hero);
  }
  function statCard(label,value) {
    const el = make("div","rs-year-stat");
    el.append(make("span",null,label),make("strong",null,value));
    return el;
  }
  function monthlyRows(month) {
    const prefix = String(state.year) + "-" + String(month + 1).padStart(2,"0") + "-";
    return new Map([...state.rows].filter(([day])=>day.startsWith(prefix)));
  }
  function renderYear(body) {
    yearHero(body);
    const total = stats(state.rows);
    const summary = make("div","rs-year-summary");
    summary.append(
      statCard("기록된 근무일",total.workDays + "일"),
      statCard("연간 수익",won(total.gross)),
      statCard("완료 주행 거리",distance(total.km)),
      statCard("완료 운행 시간",duration(total.minutes))
    );
    body.append(summary);
    const displayHead = make("div","rs-year-display-head");
    displayHead.append(make("span",null,"ACTIVITY / 12 MONTHS"),
      make("span",null,"01 — 12"));
    body.append(displayHead);
    const toggle = make("div","rs-year-toggle");
    for (const [key,label] of [["work","근무 기록"],["income","수익 구간"]]) {
      const b=button(label,"rs-year-toggle-option"+(state.mode===key?" active":""),()=>{state.mode=key;render();});
      b.setAttribute("aria-pressed",String(state.mode===key));
      toggle.append(b);
    }
    body.append(toggle);
    const months = make("div","rs-year-months");
    for (let month=0;month<12;month++) {
      const tile = button("","rs-year-month",()=>{
        state.month=month;
        state.day=1;
        state.view="month";
        render();
        state.dialog?.querySelector(".rs-year-body")?.scrollTo(0,0);
      },(month+1)+"월 상세 근무 기록 보기");
      const ttl=make("div","rs-year-month-heading");
      const monthly = stats(monthlyRows(month));
      ttl.append(make("strong",null,(month+1)+"월"),make("small",null,monthly.workDays + "일"));
      const squares=make("div","rs-year-tiles");
      for (let i=0;i<weekday(month,1);i++) squares.append(make("i","rs-year-day blank"));
      for (let day=1;day<=monthDays(month);day++) squares.append(make("i","rs-year-day "+valueColor(state.rows.get(dateKey(month,day)))));
      tile.append(ttl,squares);
      months.append(tile);
    }
    body.append(months);
    const legend=make("div","rs-year-legend");
    legend.append(make("span",null,state.mode==="work"?"기록 적음":"수익 적음"));
    for(const intensity of ["zero","light","middle","strong"]) legend.append(make("i","rs-year-day "+intensity));
    legend.append(make("span",null,state.mode==="work"?"기록 많음":"수익 많음"));
    body.append(legend,make("p","rs-year-footnote","기록이 없는 날은 휴무로 판단하지 않아요. 근무일은 완료된 운행 또는 기록된 수익이 있는 날입니다."));
  }
  function renderMonth(body) {
    const month=state.month;
    monthHero(body,month);
    const rows=monthlyRows(month);
    const monthly=stats(rows);
    const summary=make("div","rs-year-month-summary");
    summary.append(statCard("근무일",monthly.workDays+"일"),statCard("기록 수익",won(monthly.gross)));
    body.append(summary);
    const week=make("div","rs-year-weekdays");
    for(const label of weekdays) week.append(make("span",null,label));
    body.append(week);
    const grid=make("div","rs-year-calendar");
    for (let i=0;i<weekday(month,1);i++) grid.append(make("span","rs-year-pad"));
    for (let day=1;day<=monthDays(month);day++) {
      const dayKey=dateKey(month,day);
      const r=rows.get(dayKey);
      const b=button(String(day),"rs-year-date"+(day===state.day?" selected":"")+
        (dayKey===today?" today":""),
        ()=>{state.day=day;render();},dayKey+" 운행 기록");
      b.append(make("i","rs-year-date-dot "+valueColor(r)));
      grid.append(b);
    }
    body.append(grid);
    const d=dateKey(month,state.day),r=rows.get(d);
    const detail=make("section","rs-year-detail");
    detail.append(make("small","rs-year-eyebrow",d),make("h3",null,
      r && (r.trips||r.hasEarning) ? "이날의 기록" : "기록이 없어요"));
    if(r) {
      const items=make("div","rs-year-details-grid");
      items.append(
        statCard("수익",won(r.gross)),
        statCard("완료 운행",r.trips+"회"),
        statCard("주행 거리",distance(r.km)),
        statCard("운행 시간",duration(r.minutes))
      );
      detail.append(items);
      if(r.trips>0) detail.append(button("타임라인 탭 열기 →","rs-year-timeline",()=>{
        close();
        window.__rsGoToTab?.("trips");
      }));
    } else detail.append(make("p","rs-year-footnote","기록이 없다는 사실만 표시해요. 실제 휴무 여부는 알 수 없습니다."));
    body.append(detail);
  }
  function close() {
    const dialog=state.dialog;
    if(!dialog) return;
    ++state.request;
    state.abort?.abort();
    state.abort=null;
    state.dialog=null;
    try{if(dialog.open)dialog.close();}catch{}
    dialog.remove();
    const release=state.unregister;state.unregister=null;
    if(release) release();
    document.body.classList.remove("rs-year-open");
  }
  function open() {
    if(state.dialog) return;
    state.year=currentYear;state.view="year";state.mode="work";state.rows=new Map();state.loading=true;state.error="";
    const dlg=make("dialog","rs-year-dialog");
    dlg.setAttribute("aria-label","나의 1년 근무 캘린더");
    const panel=make("div","rs-year-panel");
    const bar=make("div","rs-year-topbar");
    bar.append(make("span","rs-year-brand","RIDERSPOT  /  MY YEAR"),
      button("×","rs-year-close",close,"캘린더 닫기"));
    const body=make("div","rs-year-body");
    panel.append(bar,body);
    dlg.append(panel);
    dlg.addEventListener("cancel",event=>{event.preventDefault();close();});
    dlg.addEventListener("click",event=>{if(event.target===dlg)close();});
    document.body.append(dlg);
    state.dialog=dlg;
    dlg.showModal();
    document.body.classList.add("rs-year-open");
    if(window.__rsNavigation?.registerLayer)
      state.unregister=window.__rsNavigation.registerLayer("my-year-calendar",()=>{close();return true;});
    load();
  }
  function attach() {
    if(window.__rsActiveTab!=="earnings" && !document.querySelector(".finance-page")) return;
    const heading=document.querySelector(".finance-page .fin-page-head");
    if(!heading || heading.querySelector(".rs-year-entry")) return;
    const btn=button("나의 1년","rs-year-entry",open,"나의 1년 근무 캘린더 열기");
    heading.append(btn);
  }
  const style=make("style");
  style.id="rs-year-v2-style";
  style.textContent="/* RiderSpot / MY YEAR — Quiet Grid, art-direction v2\n   Editorial data poster: typography, rhythm, no illustration or stacked cards. */\n:root{--ry-paper:#FAFAF7;--ry-ink:#23382F;--ry-quiet:#77867C;--ry-rule:#DAE0D9;--ry-empty:#E6E9E4;--ry-sage-1:#BED7C8;--ry-sage-2:#83B49B;--ry-sage-3:#376A56}\n.rs-year-entry{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:8px 11px;border:1px solid #d9e2da;border-radius:11px;background:#f6f8f5;color:var(--ry-ink);font-weight:690;font-size:12px;letter-spacing:-.035em;white-space:nowrap;cursor:pointer}\n.rs-year-entry:focus-visible,.rs-year-dialog button:focus-visible{outline:2px solid var(--ry-sage-3);outline-offset:3px}\nbody.rs-year-open{overflow:hidden}\n.rs-year-dialog{padding:0;border:0;background:transparent;color:var(--ry-ink);width:min(100%,620px);height:min(100dvh,860px);max-height:100dvh;max-width:620px;overflow:hidden;border-radius:18px;box-shadow:0 18px 70px rgba(22,38,29,.13);font-family:Pretendard,SUIT,\"Apple SD Gothic Neo\",\"Noto Sans KR\",system-ui,sans-serif;font-variant-numeric:tabular-nums;font-feature-settings:\"tnum\" 1}\n.rs-year-dialog::backdrop{background:rgba(24,39,31,.31);backdrop-filter:blur(2px)}\n.rs-year-dialog :where(button){-webkit-tap-highlight-color:transparent;font-family:inherit}\n.rs-year-panel{height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--ry-paper)}\n.rs-year-topbar{flex:none;height:64px;padding:0 28px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--ry-rule)}\n.rs-year-brand{font-size:10px;letter-spacing:.17em;font-weight:780;color:#607569}\n.rs-year-close{width:38px;height:38px;min-width:38px;display:grid;place-items:center;border:0;background:transparent;color:#44594E;font-size:24px;font-weight:300;line-height:1;cursor:pointer}\n.rs-year-close:hover{background:#eff2ec;border-radius:99px}\n.rs-year-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:28px 28px 44px;-webkit-overflow-scrolling:touch;scrollbar-width:thin}\n.rs-year-eyebrow,.rs-year-overline{font-size:10px;font-weight:750;letter-spacing:.13em;color:#718579;line-height:1.5}\n.rs-year-hero{padding:10px 0 29px;border-bottom:1px solid var(--ry-rule)}\n.rs-year-hero-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}\n.rs-year-hero-top .rs-year-index{font-family:Georgia,\"Times New Roman\",serif;font-style:italic;font-size:11px;color:#839389}\n.rs-year-hero-main{display:flex;align-items:flex-end;justify-content:space-between;gap:14px}\n.rs-year-intro{display:flex;flex-direction:column;align-items:flex-start;gap:9px;padding-bottom:5px;flex:1;min-width:0}\n.rs-year-title{font-size:26px;line-height:1.18;letter-spacing:-.065em;font-weight:750;color:var(--ry-ink);margin:0}\n.rs-year-intro-caption{font-size:11px;font-weight:480;color:#7A8980;letter-spacing:-.015em;margin:0}\n.rs-year-controls{display:flex;align-items:center;justify-content:flex-end;gap:5px;flex:none;margin:0}\n.rs-year-nav-icon{border:0;width:29px;height:38px;display:grid;place-items:center;background:transparent;color:var(--ry-ink);font-size:22px;font-weight:300;cursor:pointer;padding:0}\n.rs-year-nav-icon:hover:not(:disabled){background:#EEF2EC;border-radius:9px}\n.rs-year-nav-icon:disabled{color:#BDC8BD;cursor:default}\n.rs-year-current{font-size:clamp(45px,10vw,65px);font-weight:570;line-height:1;letter-spacing:-.085em;color:#263E31}\n.rs-year-summary,.rs-year-month-summary,.rs-year-details-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:23px;row-gap:0;margin:18px 0 25px}\n.rs-year-stat{min-width:0;min-height:78px;padding:13px 0 14px;border-bottom:1px solid var(--ry-rule);background:transparent}\n.rs-year-stat span{display:block;font-size:11px;color:#78887D;font-weight:570;letter-spacing:-.024em;margin-bottom:8px}\n.rs-year-stat strong{display:block;font-size:clamp(19px,4.8vw,27px);line-height:1.2;letter-spacing:-.055em;font-weight:690;color:var(--ry-ink);overflow-wrap:anywhere}\n.rs-year-display-head{display:flex;justify-content:space-between;align-items:flex-end;margin:34px 0 14px;gap:10px}\n.rs-year-display-head span:first-child{font-size:11px;font-weight:700;letter-spacing:.13em;color:var(--ry-ink)}\n.rs-year-display-head span:last-child{font-size:10px;letter-spacing:.09em;color:#87948A}\n.rs-year-toggle{display:flex;justify-content:flex-start;align-items:stretch;gap:23px;padding:0;margin:8px 0 13px;border-bottom:1px solid var(--ry-rule);background:none}\n.rs-year-toggle-option{position:relative;padding:10px 1px 12px;border:0;background:transparent;color:#849086;font-size:12px;font-weight:600;cursor:pointer}\n.rs-year-toggle-option.active{color:var(--ry-ink);font-weight:760}\n.rs-year-toggle-option.active::after{content:\"\";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--ry-sage-3)}\n.rs-year-months{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:23px;row-gap:1px;margin:0}\n.rs-year-month{display:block;width:100%;border:0;border-top:1px solid var(--ry-rule);border-radius:0;padding:17px 0 24px;text-align:left;background:transparent;min-width:0;cursor:pointer;transition:opacity .18s ease}\n.rs-year-month:hover{opacity:.68}\n.rs-year-month-heading{display:flex;align-items:baseline;justify-content:space-between;gap:6px;margin-bottom:17px}\n.rs-year-month-heading strong{font-size:18px;font-weight:650;letter-spacing:-.045em;color:#2B4939}\n.rs-year-month-heading small{font-size:10px;font-weight:510;color:#94A097;white-space:nowrap}\n.rs-year-tiles{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;width:100%;user-select:none}\n.rs-year-day{display:block;aspect-ratio:1.45;min-height:8px;min-width:0;border-radius:2.5px;background:var(--ry-empty)}\n.rs-year-day.blank{background:transparent}\n.rs-year-day.light{background:var(--ry-sage-1)}\n.rs-year-day.middle{background:var(--ry-sage-2)}\n.rs-year-day.strong{background:var(--ry-sage-3)}\n.rs-year-legend{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin:18px 0 0;padding-top:13px;border-top:1px solid var(--ry-rule)}\n.rs-year-legend span{font-size:10px;font-weight:520;color:#819085}\n.rs-year-legend span:first-child{margin-right:5px}\n.rs-year-legend span:last-child{margin-left:5px}\n.rs-year-legend .rs-year-day{width:12px;min-width:12px;height:9px}\n.rs-year-footnote{font-size:11px;color:#829086;line-height:1.7;letter-spacing:-.016em;margin:14px 0 0}\n.rs-year-month-hero{padding:4px 0 20px;border-bottom:1px solid var(--ry-rule)}\n.rs-year-month-top{display:flex;align-items:center;gap:7px;margin-bottom:15px}\n.rs-year-month-top .rs-year-nav-icon{margin-left:-6px}\n.rs-year-month-hero-title{display:flex;align-items:baseline;justify-content:space-between;gap:12px}\n.rs-year-month-hero-title strong{font-size:57px;letter-spacing:-.09em;font-weight:590;line-height:1}\n.rs-year-month-hero-title small{font-size:13px;color:#6D8573;font-weight:550}\n.rs-year-month-summary{margin:15px 0 25px}\n.rs-year-weekdays,.rs-year-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));column-gap:5px}\n.rs-year-weekdays{margin-bottom:7px}\n.rs-year-weekdays span{text-align:center;color:#8B998D;font-size:11px;font-weight:550}\n.rs-year-calendar{row-gap:5px}\n.rs-year-pad{min-height:46px}\n.rs-year-date{min-height:46px;padding:7px 0 5px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid transparent;background:#F0F2EE;border-radius:5px;color:#4A5F51;font-size:13px;font-weight:550;cursor:pointer}\n.rs-year-date.today{border-color:#9EBEAB}\n.rs-year-date.selected{background:#345F4B;border-color:#345F4B;color:#fff}\n.rs-year-date-dot{display:block;width:5px;height:5px;border-radius:2px;background:#DAE1D9;margin-top:5px}\n.rs-year-date-dot.light{background:var(--ry-sage-1)}\n.rs-year-date-dot.middle{background:var(--ry-sage-2)}\n.rs-year-date-dot.strong{background:var(--ry-sage-3)}\n.rs-year-date.selected .rs-year-date-dot{background:#D5EED9}\n.rs-year-detail{margin-top:30px;padding-top:20px;border-top:1px solid var(--ry-rule)}\n.rs-year-detail h3{font-size:22px;letter-spacing:-.05em;margin:8px 0 6px;font-weight:680}\n.rs-year-details-grid{margin:4px 0 20px}\n.rs-year-timeline,.rs-year-retry{display:inline-flex;align-items:center;justify-content:center;min-height:42px;margin-top:12px;padding:8px 14px;border:1px solid #CEDAD0;background:transparent;border-radius:7px;color:#315A46;font-size:12px;font-weight:690;cursor:pointer}\n.rs-year-loading,.rs-year-empty{text-align:center;padding:70px 16px;color:#708273;font-size:13px}\n.rs-year-empty{display:flex;flex-direction:column;align-items:center;gap:14px}\n.rs-year-empty-glyph{font-family:Georgia,serif;font-size:43px;color:#A9B9AB}\n@media (min-width:560px){\n  .rs-year-months{grid-template-columns:repeat(3,minmax(0,1fr))}\n  .rs-year-dialog{max-height:min(92dvh,860px)}\n  .rs-year-body{padding:33px 36px 50px}\n}\n@media (max-width:440px){\n  .rs-year-dialog{height:100dvh;width:100%;max-width:100%;max-height:100dvh;border-radius:0}\n  .rs-year-topbar{height:58px;padding:0 19px}\n  .rs-year-body{padding:22px 19px 40px}\n  .rs-year-months{column-gap:17px}\n  .rs-year-tiles{gap:3px}\n  .rs-year-month-heading strong{font-size:16px}\n  .rs-year-month{padding-top:15px;padding-bottom:24px}\n  .rs-year-hero{padding-top:8px}\n  .rs-year-title{font-size:23px}\n  .rs-year-current{font-size:clamp(41px,12vw,55px)}\n  .rs-year-summary,.rs-year-month-summary,.rs-year-details-grid{column-gap:17px}\n  .rs-year-stat strong{font-size:clamp(18px,5vw,25px)}\n  .rs-year-display-head{margin-top:25px}\n  .rs-year-pad,.rs-year-date{min-height:43px}\n}\n@media (max-width:355px){\n  .rs-year-body{padding-inline:15px}\n  .rs-year-title{font-size:21px}\n  .rs-year-current{font-size:40px}\n  .rs-year-month-heading small{font-size:9px}\n  .rs-year-summary{column-gap:12px}\n  .rs-year-stat strong{font-size:18px}\n}\n@media(prefers-reduced-motion:reduce){.rs-year-dialog *{animation:none!important;transition:none!important}}\n";
  document.head.append(style);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",()=>requestAnimationFrame(attach),{once:true});
  else requestAnimationFrame(attach);
  window.addEventListener("riderspot:screen",()=>requestAnimationFrame(attach));
  window.addEventListener("riderspot:tab-restored",()=>requestAnimationFrame(attach));
})();