/* RiderSpot My Year v1: additive, read-only calendar. No trip or earnings writes. */
(function () {
  "use strict";
  if (window.__rsMyYearVersion) return;
  window.__rsMyYearVersion = "1.0";
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
      for (const [field, value] of Object.entries(filters)) url.searchParams.set(field, value);
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
          {started_at:"gte." + isoStart(year), "started_at":"gte." + isoStart(year), "ended_at":"not.is.null"},auth,controller.signal),
        list("rider_earnings","work_date,gross_won,gross_entered,deliveries",
          {work_date:"gte." + year + "-01-01", "work_date_lte":"",},auth,controller.signal)
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
  function head(container, title, subtitle, back) {
    const top = make("div","rs-year-title-row");
    const left = make("div","");
    left.append(make("small","rs-year-eyebrow",subtitle),make("h2","rs-year-title",title));
    if (back) top.append(button("‹","rs-year-nav-icon",()=>{state.view="year";render();},"연간 캘린더로 돌아가기"));
    top.append(left);
    container.append(top);
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
    head(body,"나의 1년","MY RIDING YEAR",false);
    const controls = make("div","rs-year-controls");
    controls.append(
      button("‹","rs-year-nav-icon",()=>{state.year--;load();},"이전 연도"),
      make("strong","rs-year-current",String(state.year)),
      button("›","rs-year-nav-icon",()=>{if(state.year<currentYear){state.year++;load();}},"다음 연도")
    );
    controls.lastChild.disabled = state.year >= currentYear;
    body.append(controls);
    const total = stats(state.rows);
    const summary = make("div","rs-year-summary");
    summary.append(
      statCard("기록된 근무일",total.workDays + "일"),
      statCard("연간 수익",won(total.gross)),
      statCard("완료 주행 거리",distance(total.km)),
      statCard("완료 운행 시간",duration(total.minutes))
    );
    body.append(summary);
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
      ttl.append(make("strong",null,(month+1)+"월"),make("small",null,monthly.workDays + "일 기록"));
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
    head(body,(month+1)+"월의 라이딩",state.year+" · MONTHLY JOURNAL",true);
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
    bar.append(make("span","rs-year-brand","RIDERSPOT · MY YEAR"),
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
    const btn=button("▦ 나의 1년","rs-year-entry",open,"나의 1년 근무 캘린더 열기");
    heading.append(btn);
  }
  const css=String.raw;
  const style=make("style");
  style.id="rs-year-v1-style";
  style.textContent=[
    ".rs-year-entry{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 12px;min-height:38px;border-radius:12px;border:1px solid #d8e7de;background:#f1f7f2;color:#28584a;font-size:12px;font-weight:750;letter-spacing:-.035em;white-space:nowrap;cursor:pointer}",
    ".rs-year-entry:focus-visible,.rs-year-dialog button:focus-visible{outline:2px solid #418a73;outline-offset:2px}",
    "body.rs-year-open{overflow:hidden}",
    ".rs-year-dialog{padding:0;border:0;background:transparent;color:#21372e;width:min(100%,620px);height:min(100dvh,830px);max-width:620px;max-height:100dvh;overflow:hidden;border-radius:23px;box-shadow:0 22px 80px rgba(17,43,32,.16)}",
    ".rs-year-dialog::backdrop{background:rgba(13,30,23,.38);backdrop-filter:blur(3px)}",
    ".rs-year-panel{display:flex;flex-direction:column;height:100%;background:#fbfcfa;overflow:hidden}",
    ".rs-year-topbar{flex:none;height:53px;padding:0 17px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #edf0ec}",
    ".rs-year-brand{font-size:10px;font-weight:800;letter-spacing:.12em;color:#5d8d7b}",
    ".rs-year-close{border:0;background:#edf2ee;color:#355c4c;border-radius:10px;width:34px;height:34px;font-size:25px;cursor:pointer;line-height:1}",
    ".rs-year-body{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:19px 17px 28px;-webkit-overflow-scrolling:touch}",
    ".rs-year-title-row{display:flex;align-items:center;gap:11px}",
    ".rs-year-title{font-size:25px;font-weight:800;letter-spacing:-.065em;margin:3px 0 15px;color:#1c342a}",
    ".rs-year-eyebrow{font-size:10px;letter-spacing:.12em;font-weight:800;color:#719384}",
    ".rs-year-controls{display:flex;align-items:center;gap:12px;justify-content:center;margin:0 0 15px}",
    ".rs-year-current{font-size:19px;letter-spacing:-.03em}",
    ".rs-year-nav-icon{width:36px;height:36px;border:1px solid #e2e9e2;background:#fff;border-radius:11px;font-size:22px;color:#315d4d;cursor:pointer}",
    ".rs-year-nav-icon:disabled{opacity:.3;cursor:default}",
    ".rs-year-summary,.rs-year-details-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}",
    ".rs-year-stat{padding:12px 12px 11px;background:#f0f4f0;border:1px solid #edf1ec;border-radius:14px;min-width:0}",
    ".rs-year-stat span{display:block;font-size:11px;color:#718578;font-weight:650;margin-bottom:6px}",
    ".rs-year-stat strong{display:block;color:#243f34;font-weight:790;font-size:18px;letter-spacing:-.045em;overflow-wrap:anywhere}",
    ".rs-year-toggle{display:flex;background:#edf2ee;border-radius:12px;padding:3px;margin:18px 0 14px}",
    ".rs-year-toggle-option{border:0;background:transparent;flex:1;padding:10px 4px;border-radius:9px;font-size:12px;color:#63786d;font-weight:700;cursor:pointer}",
    ".rs-year-toggle-option.active{background:#fff;color:#255a48;box-shadow:0 1px 6px rgba(27,61,47,.08)}",
    ".rs-year-months{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}",
    ".rs-year-month{text-align:left;background:#fff;border:1px solid #e6ede7;border-radius:15px;padding:12px 11px 13px;cursor:pointer;min-width:0}",
    ".rs-year-month-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}",
    ".rs-year-month-heading strong{color:#274c3c;font-size:13px;font-weight:800}",
    ".rs-year-month-heading small{font-size:10px;color:#8b9b90}",
    ".rs-year-tiles{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}",
    ".rs-year-day{display:block;aspect-ratio:1.28;border-radius:3px;background:#e7ece6;min-width:0}",
    ".rs-year-day.blank{background:transparent}",
    ".rs-year-day.light{background:#b5dccd}",
    ".rs-year-day.middle{background:#79baa3}",
    ".rs-year-day.strong{background:#3a8168}",
    ".rs-year-legend{display:flex;align-items:center;justify-content:flex-end;gap:5px;margin-top:14px}",
    ".rs-year-legend .rs-year-day{width:12px;min-width:12px;height:10px}",
    ".rs-year-legend span{font-size:10px;color:#7b8c80;margin:0 3px}",
    ".rs-year-footnote{font-size:11px;color:#819083;line-height:1.65;margin:14px 0 0}",
    ".rs-year-month-summary{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:4px 0 22px}",
    ".rs-year-weekdays,.rs-year-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}",
    ".rs-year-weekdays{margin-bottom:8px}.rs-year-weekdays span{text-align:center;color:#849589;font-size:11px;font-weight:700}",
    ".rs-year-date{position:relative;min-height:43px;border:1px solid transparent;background:#f0f4f0;border-radius:10px;color:#325044;font-size:13px;font-weight:650;cursor:pointer}",
    ".rs-year-date.today{border-color:#84b19b}",
    ".rs-year-date.selected{background:#315b4a;color:#fff}",
    ".rs-year-date-dot{display:block;width:6px;height:6px;background:#d5dfd4;border-radius:99px;margin:4px auto 0}",
    ".rs-year-date-dot.light{background:#b5dccd}.rs-year-date-dot.middle{background:#79baa3}.rs-year-date-dot.strong{background:#3a8168}",
    ".rs-year-date.selected .rs-year-date-dot{background:#d5f2e4}",
    ".rs-year-detail{margin-top:19px;border-top:1px solid #e7eee7;padding-top:18px}",
    ".rs-year-detail h3{font-size:19px;margin:4px 0 12px;letter-spacing:-.04em}",
    ".rs-year-timeline,.rs-year-retry{margin-top:13px;border:1px solid #cee3d6;background:#e9f3ec;color:#2e6651;border-radius:12px;padding:11px 15px;min-height:42px;font-weight:750;cursor:pointer}",
    ".rs-year-loading,.rs-year-empty{text-align:center;padding:64px 15px;color:#6d8275;font-size:14px}",
    ".rs-year-empty{display:flex;flex-direction:column;align-items:center;gap:13px;line-height:1.5}",
    ".rs-year-empty-glyph{font-size:40px;color:#76a88f}",
    "@media(min-width:560px){.rs-year-months{grid-template-columns:repeat(3,minmax(0,1fr))}}",
    "@media(max-width:440px){.rs-year-dialog{width:100%;max-width:100%;height:100dvh;max-height:100dvh;border-radius:0}.rs-year-body{padding:19px 15px 34px}.rs-year-month{padding:10px 9px}.rs-year-stat strong{font-size:16px}.rs-year-date{min-height:40px}}",
    "@media(prefers-reduced-motion:reduce){.rs-year-dialog *{animation:none!important;transition:none!important}}"
  ].join("\n");
  document.head.append(style);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",()=>requestAnimationFrame(attach),{once:true});
  else requestAnimationFrame(attach);
  window.addEventListener("riderspot:screen",()=>requestAnimationFrame(attach));
  window.addEventListener("riderspot:tab-restored",()=>requestAnimationFrame(attach));
})();