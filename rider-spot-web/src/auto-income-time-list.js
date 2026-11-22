/*
 * RiderSpot: automatic per-delivery capture timestamp panel.
 * Used as a React child inside Earnings > Records, without changing native APK.
 * The canonical UTC timestamps are kept in rider_auto_deliveries.
 */
(function installAutoIncomeTimes(root) {
  "use strict";
  if (!root || root.__rsAutoIncomeTimes) return;

  const currency = new Intl.NumberFormat("ko-KR");
  const capturedClock = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const serverClock = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit",
    second: "2-digit", hour12: false,
  });
  const statusText = Object.freeze({
    applied: "자동 반영", needs_review: "중복 확인 필요 · 합산 전",
    covered: "기존 수익에 포함", rejected: "제외됨",
  });
  const statuses = new Set(Object.keys(statusText));
  function validDate(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  function koreaWorkDay(time) {
    const shifted = new Date(time - 3 * 3600000);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(shifted);
    const pieces = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return pieces.year + "-" + pieces.month + "-" + pieces.day;
  }
  const textStyle = {color:"#6d7987",fontSize:12};
  const headingStyle = {fontSize:15,fontWeight:750,letterSpacing:"-0.04em",margin:0};
  const rightStyle = {textAlign:"right",flexShrink:0,minWidth:89};

  function AutoIncomeTimes({React,client,userId}) {
    // All hooks are unconditional. The component lives in the existing React tree,
    // so no DOM insertion or MutationObserver can interfere with finance rendering.
    const h = React.createElement;
    const [result,setResult] = React.useState({rows:[],pending:true,error:""});
    const [scope,setScope] = React.useState("today");
    const [expanded,setExpanded] = React.useState(false);
    const [revision,refresh] = React.useState(0);
    React.useEffect(() => {
      if (!client || !userId) {
        setResult({rows:[],pending:false,error:""});
        return;
      }
      let alive = true;
      const controller = new AbortController();
      setResult(prev => ({...prev,pending:prev.rows.length===0,error:""}));
      (async()=>{
        try{
          const answer=await client.from("rider_auto_deliveries")
            .select("capture_id,captured_at,created_at,work_date,platform,gross_won,base_won,extra_won,reward_won,status")
            .eq("user_id",userId)
            .order("captured_at",{ascending:false})
            .limit(80);
          if(answer.error) throw answer.error;
          if(!alive || controller.signal.aborted)return;
          setResult({rows:Array.isArray(answer.data)?answer.data:[],pending:false,error:""});
        }catch(e){
          if(alive&&!controller.signal.aborted)
            setResult({rows:[],pending:false,error:"자동 수집 내역을 조회하지 못했어요."});
        }
      })();
      return ()=>{alive=false;controller.abort();};
    },[client,userId,revision]);
    React.useEffect(()=>{
      if (!userId) return;
      let last=0;
      const onFinance=e=>{
        if(e?.detail?.userId&&e.detail.userId!==userId)return;
        const now=Date.now();if(now-last<3000)return;last=now;
        refresh(v=>v+1);
      };
      const onVisible=()=>{
        if(document.visibilityState==="visible")onFinance({});
      };
      root.addEventListener("riderspot:finance-changed",onFinance);
      root.addEventListener("riderspot:auto-income-updated",onFinance);
      document.addEventListener("visibilitychange",onVisible);
      return ()=>{
        root.removeEventListener("riderspot:finance-changed",onFinance);
        root.removeEventListener("riderspot:auto-income-updated",onFinance);
        document.removeEventListener("visibilitychange",onVisible);
      };
    },[userId]);
    if(!userId)return null;

    const today=koreaWorkDay(Date.now());
    const rows=result.rows.filter(r=>statuses.has(r.status));
    const selected=scope==="today"?rows.filter(r=>r.work_date===today):rows;
    const shown=expanded?selected:selected.slice(0,8);
    const buttons=h("div",{style:{display:"flex",gap:6}},
      ...[["today","오늘"],["recent","최근 80건"]].map(([id,label])=>
        h("button",{key:id,type:"button","aria-pressed":scope===id,onClick:()=>{setScope(id);setExpanded(false);},
          style:{border:0,borderRadius:12,padding:"7px 10px",fontSize:12,fontWeight:700,
            color:scope===id?"#fff":"#5c6b7a",
            background:scope===id?"#3155b2":"#edf2f7"}},label)));
    return h("section",{className:"fin-card rs-auto-income-time-list",
      "aria-label":"자동 배달 수익 인식 시각",
      style:{margin:"14px 0",borderRadius:18,overflow:"hidden"}},
      h("header",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",
        gap:8,flexWrap:"wrap",marginBottom:11}},
        h("div",null,
          h("h2",{style:headingStyle},"자동 수익 · 시간별 기록"),
          h("small",{style:textStyle},"배달 완료 화면을 인식한 시각 · 한국시간")),
        buttons),
      result.pending?h("p",{style:textStyle},"수집 시각을 불러오는 중…"):
      result.error?h("div",{style:{padding:"8px 0"}},
        h("span",{style:textStyle},result.error),
        h("button",{type:"button",onClick:()=>refresh(v=>v+1),
          style:{marginLeft:9,border:0,borderRadius:9,padding:"7px 9px",
            background:"#edf2f7"}},"재시도")):
      selected.length===0?h("p",{style:{...textStyle,padding:"14px 0"}},
        scope==="today"?"오늘 자동 인식된 배달 기록이 없어요.":"아직 자동 인식 기록이 없어요.") :
      h(React.Fragment,null,
        h("div",{style:{display:"flex",justifyContent:"space-between",fontSize:11,color:"#81909d",
          marginBottom:6}},h("span",null,"인식 시간 · 플랫폼"),h("span",null,selected.length+"건")),
        ...shown.map(row=>{
          const at=validDate(row.captured_at);
          const server=validDate(row.created_at);
          const delay=at&&server?Math.max(0,server.getTime()-at.getTime()):0;
          const inc=row.status==="applied";
          const amount=Number(row.gross_won)||0;
          const component="기본 "+currency.format(Number(row.base_won)||0)+"원 · 추가 "+
            currency.format(Number(row.extra_won)||0)+"원 · 리워드 "+
            currency.format(Number(row.reward_won)||0)+"원";
          return h("div",{key:row.capture_id||String(row.captured_at),
            style:{display:"flex",gap:10,justifyContent:"space-between",alignItems:"center",
              borderTop:"1px solid #edf0f5",padding:"12px 0"}},
            h("div",{style:{minWidth:0,flex:1}},
              h("div",{style:{display:"flex",gap:6,flexWrap:"wrap",alignItems:"baseline"}},
                h("time",{dateTime:row.captured_at||undefined,
                  style:{fontSize:13,fontWeight:750,color:"#27364a",
                    fontVariantNumeric:"tabular-nums"}},
                  at?capturedClock.format(at):"인식 시각 없음"),
                h("span",{style:{fontSize:12,color:"#6c7a8c"}},row.platform||"배달")),
              h("div",{style:{...textStyle,fontSize:11,marginTop:3,
                lineHeight:1.45,overflowWrap:"anywhere"}},component),
              h("div",{style:{...textStyle,fontSize:11,marginTop:3}},
                statusText[row.status],
                row.work_date!==today?" · 업무일 "+row.work_date:"",
                delay>30000?" · 서버 저장 "+serverClock.format(server):"")),
            h("div",{style:rightStyle},
              h("strong",{style:{fontSize:15,fontWeight:760,
                color:inc?"#2a7a61":"#677586",
                fontVariantNumeric:"tabular-nums",
                textDecoration:row.status==="rejected"?"line-through":"none"}},
                (inc?"+":"")+" "+currency.format(amount)+"원")));
        }),
        selected.length>8&&h("button",{type:"button",
          onClick:()=>setExpanded(v=>!v),
          style:{width:"100%",padding:"12px",border:0,borderRadius:10,marginTop:9,
            background:"#f2f5fa",color:"#3d597b",fontSize:12,fontWeight:700}},
          expanded?"접기":"나머지 "+(selected.length-8)+"건 보기")),
      h("p",{style:{...textStyle,fontSize:11,marginTop:12,lineHeight:1.5}},
        "표시된 시각은 앱의 수익 인식 시각이며, 서버 저장 시각이나 실제 정산 시각과 다를 수 있어요. ",
        "확인 필요·제외 항목은 수익 합계에 자동으로 더하지 않아요."));
  }
  root.__rsAutoIncomeTimes=AutoIncomeTimes;
  // Read-only test hooks; no personal account data is exported here.
  root.__rsAutoIncomeTimeUtils=Object.freeze({koreaWorkDay,validDate});
})(typeof window!=="undefined"?window:null);
