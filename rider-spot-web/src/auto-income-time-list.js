/*
 * RiderSpot Earnings > Records: day-by-day delivery income.
 * Read-only: real UTC recognition timestamp is stored by the Android bridge in Supabase.
 * No navigation/reload or modifications to GPS, manual ledgers, finance totals, timeline.
 */
(function installAutoIncomeTimes(root) {
  "use strict";
  if (!root || root.__rsAutoIncomeTimes) return;
  const money = new Intl.NumberFormat("ko-KR");
  const captureClock = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"
  });
  const syncClock = new Intl.DateTimeFormat("ko-KR", {
    timeZone:"Asia/Seoul", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"
  });
  const dateLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone:"UTC", month:"long", day:"numeric"
  });
  const stateLabel = Object.freeze({
    applied:"자동 반영", needs_review:"중복 확인 필요 · 합산 전",
    covered:"기존 수익에 포함", rejected:"제외됨"
  });
  function validDate(value) {
    if(typeof value!=="string" || !value.trim()) return null;
    const date=new Date(value);
    return Number.isFinite(date.getTime())?date:null;
  }
  function koreaWorkDay(utcMillis) {
    const adjusted = new Date(utcMillis);
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone:"Asia/Seoul", year:"numeric",month:"2-digit",day:"2-digit"
    }).formatToParts(adjusted).map(part=>[part.type,part.value]));
    return p.year+"-"+p.month+"-"+p.day;
  }
  function moveWorkDay(day,delta) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day)))return "";
    const d=new Date(day+"T12:00:00Z");
    if(!Number.isFinite(d.getTime()))return "";
    d.setUTCDate(d.getUTCDate()+delta);
    return d.toISOString().slice(0,10);
  }
  function summarizeDay(rows) {
    const eligible=rows.filter(r=>r.status==="applied");
    return {
      recorded:rows.length,
      applied:eligible.length,
      appliedAmount:eligible.reduce((a,r)=>a+(Number(r.gross_won)||0),0),
      review:rows.filter(r=>r.status==="needs_review").length
    };
  }
  const fine={fontSize:11,color:"#718093",lineHeight:1.5};
  const btnBase={border:0,borderRadius:10,padding:"9px 11px",fontSize:12,fontWeight:750,
    background:"#eff3f9",color:"#415a78",cursor:"pointer",fontFamily:"inherit"};
  function AutoIncomeTimes({React,client,userId}) {
    const h=React.createElement;
    const [day,setDay]=React.useState(()=>koreaWorkDay(Date.now()));
    // Follow the calendar day after midnight without page navigation or remount.
    React.useEffect(()=>{
      const rollover=()=>{
        const next=koreaWorkDay(Date.now());
        setDay(previous=>previous<next?next:previous);
      };
      const timer=root.setInterval(rollover,15000);
      const visible=()=>{if(!document.hidden)rollover();};
      document.addEventListener("visibilitychange",visible);
      root.addEventListener("focus",rollover);
      return()=>{root.clearInterval(timer);document.removeEventListener("visibilitychange",visible);
        root.removeEventListener("focus",rollover);};
    },[]);
    const [visibleCount,setVisibleCount]=React.useState(12);
    const [result,setResult]=React.useState({
      forUser:null,forDay:null,rows:[],loading:true,error:"",capped:false
    });
    const [revision,refresh]=React.useState(0);
    const today=koreaWorkDay(Date.now());
    const useDay=(next)=>{
      if(typeof next!=="string"||! /^\d{4}-\d{2}-\d{2}$/.test(next) ||
         next>today||next<"2020-01-01")return;
      setDay(next);setVisibleCount(12);
    };

    React.useEffect(()=>{
      if(!client||!userId){
        setResult({forUser:null,forDay:null,rows:[],loading:false,error:"",capped:false});
        return;
      }
      let active=true;
      setResult(prev=>({forUser:userId,forDay:day,
        rows:prev.forUser===userId&&prev.forDay===day?prev.rows:[],
        loading:true,error:"",capped:false}));
      (async()=>{
        try{
          const all=[];
          const pageSize=200;
          const maxRecords=20000;
          for(let start=0;start<maxRecords;start+=pageSize){
            const response=await client.from("rider_auto_deliveries")
              .select("capture_id,captured_at,created_at,work_date,platform,gross_won,base_won,extra_won,reward_won,status")
              .eq("user_id",userId)
              .eq("work_date",day)
              .order("captured_at",{ascending:false})
              .range(start,start+pageSize-1);
            if(response.error)throw response.error;
            if(!active)return;
            const batch=Array.isArray(response.data)?response.data:[];
            all.push(...batch);
            if(batch.length<pageSize){
              setResult({forUser:userId,forDay:day,rows:all,loading:false,error:"",capped:false});
              return;
            }
          }
          if(active)setResult({forUser:userId,forDay:day,rows:all,loading:false,error:"",capped:true});
        }catch(e){
          if(active)setResult({forUser:userId,forDay:day,rows:[],
            loading:false,error:"수익 내역을 가져오지 못했어요.",capped:false});
        }
      })();
      return ()=>{active=false;};
    },[client,userId,day,revision]);

    React.useEffect(()=>{
      if(!userId)return;
      let lastRefresh=0;
      const update=e=>{
        if(e?.detail?.userId&&e.detail.userId!==userId)return;
        const now=Date.now();
        if(now-lastRefresh<3000)return;
        lastRefresh=now;
        refresh(value=>value+1);
      };
      const wake=()=>{
        if(document.visibilityState==="visible")update({});
      };
      root.addEventListener("riderspot:finance-changed",update);
      root.addEventListener("riderspot:auto-income-updated",update);
      document.addEventListener("visibilitychange",wake);
      return()=>{
        root.removeEventListener("riderspot:finance-changed",update);
        root.removeEventListener("riderspot:auto-income-updated",update);
        document.removeEventListener("visibilitychange",wake);
      };
    },[userId]);
    if(!userId)return null;

    const valid=result.forUser===userId && result.forDay===day;
    const rows=valid?result.rows.filter(r=>Object.hasOwn(stateLabel,r.status)):[];
    const stats=summarizeDay(rows);
    const preview=rows.slice(0,visibleCount);
    const pickedDate=new Date(day+"T12:00:00Z");
    const label=Number.isFinite(pickedDate.getTime())?dateLabel.format(pickedDate):day;
    return h("section",{
      className:"fin-card rs-auto-income-time-list",
      "aria-label":"일별 배달 건별 수익 기록",
      style:{margin:"14px 0",padding:"16px 15px",borderRadius:18,overflow:"hidden"}
    },
      h("header",{style:{marginBottom:11,display:"flex",gap:6,justifyContent:"space-between",
          alignItems:"center",flexWrap:"wrap"}},
        h("div",null,
          h("h2",{style:{fontSize:16,fontWeight:770,letterSpacing:"-.045em",margin:0}},
            "일별 배달 수익"),
          h("small",{style:fine},"수익 인식 시간별 · 자정(00:00) 날짜 기준")),
        h("button",{type:"button",style:btnBase,onClick:()=>{useDay(today);refresh(x=>x+1);}},
          "오늘 보기")),
      h("div",{style:{display:"flex",gap:8,alignItems:"center",marginBottom:10}},
        h("button",{type:"button",style:btnBase,"aria-label":"이전 날짜",
          onClick:()=>useDay(moveWorkDay(day,-1))},"‹"),
        h("label",{style:{flex:"1",display:"flex",alignItems:"center",gap:8,minWidth:0}},
          h("span",{style:{fontSize:12,fontWeight:750,whiteSpace:"nowrap"}},"업무일"),
          h("input",{type:"date",value:day,max:today,min:"2020-01-01",
            "aria-label":"배달 수익 조회 날짜",
            onChange:e=>useDay(e.target.value),
            style:{boxSizing:"border-box",minWidth:0,width:"100%",padding:"8px 9px",
              border:"1px solid #e0e8f0",borderRadius:10,background:"white",
              color:"#35485d",fontSize:13,fontFamily:"inherit"}})),
        h("button",{type:"button",style:{...btnBase,opacity:day>=today?.4:1},
          disabled:day>=today,"aria-label":"다음 날짜",
          onClick:()=>useDay(moveWorkDay(day,1))},"›")),
      h("div",{style:{background:"#f4f7fb",borderRadius:13,padding:"11px 12px",
        display:"flex",gap:9,alignItems:"center",justifyContent:"space-between",
        flexWrap:"wrap",marginBottom:7}},
        h("div",null,
          h("span",{style:{fontSize:11,color:"#748393",display:"block"}},label+" · 자동 반영 수익"),
          h("strong",{style:{fontSize:20,color:"#263b55",fontVariantNumeric:"tabular-nums"}},
            money.format(stats.appliedAmount)+"원")),
        h("span",{style:{fontSize:12,fontWeight:750,color:"#506680"}},
          stats.recorded+"건 기록 · "+stats.applied+"건 반영")),
      stats.review>0&&h("p",{style:{...fine,color:"#996b42",margin:"8px 0"}},
        "중복 확인 필요 "+stats.review+"건은 아직 합산하지 않았어요."),
      (valid&&result.loading || !valid)?
        h("p",{style:{...fine,padding:"12px 0"}},"배달 수익 내역을 불러오는 중…"):
      result.error?
        h("div",{style:{padding:"8px 0"}},
          h("span",{style:fine},result.error),
          h("button",{type:"button",style:{...btnBase,marginLeft:8},
            onClick:()=>refresh(x=>x+1)},"다시 불러오기")):
      rows.length===0?
        h("p",{style:{...fine,padding:"13px 0"}},"이 날짜에 자동 인식된 배달 수익이 없어요."):
      h(React.Fragment,null,
        ...preview.map(row=>{
          const captured=validDate(row.captured_at);
          const server=validDate(row.created_at);
          const delay=captured&&server?server.getTime()-captured.getTime():0;
          const included=row.status==="applied";
          const component="기본 "+money.format(Number(row.base_won)||0)+" · 추가 "+
            money.format(Number(row.extra_won)||0)+" · 리워드 "+money.format(Number(row.reward_won)||0);
          const badge=stateLabel[row.status];
          return h("div",{key:row.capture_id||row.captured_at||"unknown",
            style:{display:"flex",gap:9,justifyContent:"space-between",alignItems:"center",
              padding:"12px 0",borderTop:"1px solid #eef1f5"}},
            h("div",{style:{flex:1,minWidth:0}},
              h("div",{style:{display:"flex",flexWrap:"wrap",gap:6,alignItems:"baseline"}},
                h("time",{dateTime:row.captured_at||undefined,style:{
                  fontSize:13,fontWeight:760,color:"#2a3c53",fontVariantNumeric:"tabular-nums"}},
                  captured?captureClock.format(captured):"인식 시각 없음"),
                h("span",{style:{fontSize:12,color:"#6d7c8f"}},row.platform||"배달")),
              h("div",{style:{...fine,fontSize:11,marginTop:4}},component),
              h("div",{style:{...fine,fontSize:11,marginTop:3}},
                badge,delay>30000?" · 서버 저장 "+syncClock.format(server):"")),
            h("div",{style:{textAlign:"right",flexShrink:0}},
              h("strong",{style:{fontSize:15,fontWeight:780,color:included?"#28755c":"#6e7f8d",
                fontVariantNumeric:"tabular-nums",
                textDecoration:row.status==="rejected"?"line-through":"none"}},
                (included?"+":"")+money.format(Number(row.gross_won)||0)+"원")) );
        }),
        rows.length>visibleCount&&h("button",{type:"button",
          onClick:()=>setVisibleCount(n=>n+20),
          style:{...btnBase,width:"100%",marginTop:8,padding:"12px"}},
          "나머지 "+(rows.length-visibleCount)+"건 더 보기"),
        result.capped&&h("p",{style:{...fine,color:"#955e3b"}},
          "한 날짜의 조회 건수가 제한을 초과했어요. 추가 데이터 확인이 필요해요.")),
      h("p",{style:{...fine,marginTop:11,marginBottom:0}},
        "여기에는 자동 인식된 건별 수익만 보여요. 기존 날짜별 총수익은 수동 입력까지 포함하는 원래 집계를 유지해요. ",
        "인식 시각과 서버 저장 시각은 다를 수 있어요."));
  }
  root.__rsAutoIncomeTimes=AutoIncomeTimes;
  root.__rsAutoIncomeTimeUtils=Object.freeze({
    koreaWorkDay,moveWorkDay,validDate,summarizeDay
  });
})(typeof window!=="undefined"?window:null);
