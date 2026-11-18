import {dailyRideSnapshot} from "./ride-insights.mjs";
import {icons} from "./ui.mjs";
import {won,num,koreanWorkDay,plusDays,financeTotals,financeDays,financeMonthPeriod} from "./finance-model.mjs";

const money = won;
const categories = ["식비","보험료","통신비","주차비","장비","기타"];
const platforms = ["쿠팡이츠","배민","기타"];
const emptyData = {earnings:[],fuel:[],maintenance:[],extras:[],goal:null};
const dateLabel = day => String(day||"").slice(5).replace("-","/");
const safeAmount = v => Number.isSafeInteger(Number(v)) && Number(v)>=0 && Number(v)<=100000000;
const monthDelta = (day,offset) => {
  const d=new Date(day.slice(0,7)+"-01T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth()+offset);
  return d.toISOString().slice(0,10);
};
export function createFinance(R, client) {
  const h=R.createElement;
  const txt=(tag,cls,...children)=>h(tag,{className:cls},...children);
  const icon=(name,size=20)=>h("svg",{viewBox:"0 0 24 24",width:size,height:size,
    fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",
    strokeLinejoin:"round","aria-hidden":true},h("path",{d:({left:"M15 18l-6-6 6-6",right:"M9 18l6-6-6-6",close:"M5 5l14 14M19 5L5 19"}[name]||icons[name]||icons.earnings)}));
  const button=(label,action,cls,extra={})=>h("button",{type:"button",onClick:action,
    className:cls,...extra},label);
  const dateInput=(label,name,value)=>h("label",{className:"fin-field"},h("span",null,label),
    h("input",{name,type:"date",required:true,defaultValue:value}));
  const input=(label,name,type,value,required=false,extra={})=>h("label",{className:"fin-field"},
    h("span",null,label),h("input",{name,type,defaultValue:value??"",required,
      inputMode:type==="number"?"numeric":undefined,...extra}));
  const select=(label,name,choices,value)=>h("label",{className:"fin-field"},h("span",null,label),
    h("select",{name,defaultValue:value},choices.map(c=>h("option",{value:c,key:c},c))));
  function FinanceSheet({editor,close,save,busy,error}) {
    const ref=R.useRef(null),closer=R.useRef(close);
    closer.current=close;
    R.useLayoutEffect(()=>{
      ref.current?.showModal();
      const vv=window.visualViewport;
      const adjust=()=>{if(ref.current){ref.current.style.top=(vv?.offsetTop||0)+"px";
        ref.current.style.height=(vv?.height||window.innerHeight)+"px";}};
      adjust();vv?.addEventListener("resize",adjust);vv?.addEventListener("scroll",adjust);
      return ()=>{vv?.removeEventListener("resize",adjust);vv?.removeEventListener("scroll",adjust);
        if(ref.current?.open)ref.current.close();};
    },[]);
    R.useEffect(()=>{
      if(!window.__rsNavigation)return;
      return window.__rsNavigation.registerLayer("finance-sheet",()=>closer.current());
    },[]);
    const row=editor.row||{},kind=editor.kind;
    const name=kind==="income"?"수익":kind==="fuel"?"주유비":kind==="expense"?"기타 지출":kind==="settlement"?"실제 입금":"월 목표";
    return h("dialog",{ref,className:"fin-dialog","aria-label":name+" 입력",
      onCancel:e=>{e.preventDefault();if(!busy)close();},
      onClick:e=>{if(e.target===e.currentTarget&&!busy)close();}},
      h("form",{className:"fin-sheet",onSubmit:e=>{e.preventDefault();save(e.currentTarget);}},
        h("header",{className:"fin-sheet-head"},
          h("div",null,txt("small",null,editor.row?"기록 수정":"빠른 입력"),
            h("h2",null,name+(kind==="goal"?" 설정":" 기록"))),
          button(icon("close",22),close,"fin-close",{"aria-label":"닫기",disabled:busy})),
        h("div",{className:"fin-sheet-body"},
          kind==="income"&&h(R.Fragment,null,
            dateInput("배달한 날짜","work_date",row.work_date||editor.day),
            select("플랫폼","platform",platforms,row.platform||"쿠팡이츠"),
            input("수입 금액 (원)","gross_won","number",row.gross_won??"",true,{min:0,max:100000000,placeholder:"예: 85000"}),
            h("details",{className:"fin-optional"},h("summary",null,"건수 · 기타 비용 · 메모 (선택)"),
              input("배달 건수","deliveries","number",row.deliveries??"",false,{min:0,max:300}),
              input("수익 기록에 포함할 기타 비용 (원)","expenses_won","number",row.expenses_won??"",false,{min:0,max:100000000}),
              input("메모","note","text",row.note||"",false,{maxLength:300})),
            txt("p","fin-hint","수익은 일한 날짜 기준으로 저장해요. 계좌 입금 여부는 정산에서 따로 관리합니다.")),
          kind==="fuel"&&h(R.Fragment,null,
            dateInput("주유 날짜","fueled_on",row.fueled_on||editor.day),
            input("주유 금액 (원)","cost_won","number",row.cost_won??"",true,{min:1,max:100000000,placeholder:"예: 8000"}),
            h("details",{className:"fin-optional"},h("summary",null,"주유량 · 메모 (선택)"),
              input("주유량 (L)","liters","number",row.liters??"",false,{min:0.001,max:150,step:0.001}),
              input("메모","note","text",row.note||"",false,{maxLength:300})),
            txt("p","fin-hint","내 바이크의 주유 기록과 같은 장부를 사용합니다.")),
          kind==="expense"&&h(R.Fragment,null,
            dateInput("지출 날짜","expense_date",row.expense_date||editor.day),
            select("분류","category",categories,row.category||"식비"),
            input("지출 금액 (원)","amount_won","number",row.amount_won??"",true,{min:1,max:100000000,placeholder:"예: 6500"}),
            input("메모","memo","text",row.memo||"",false,{maxLength:300}),
            txt("p","fin-hint","주유비·정비비는 각각의 기존 장부에서 기록해 주세요. 비용이 두 번 잡히지 않도록 분리합니다.")),
          kind==="settlement"&&h(R.Fragment,null,
            txt("p","fin-hint",row.platform+" · "+row.work_date+" 수익 "+money(row.gross_won)+" 기준"),
            dateInput("실제 입금 날짜","paid_at",row.paid_at||editor.day),
            input("실제 입금 금액 (원)","paid_won","number",row.paid_won??row.gross_won,true,{min:0,max:100000000}),
            txt("p","fin-hint","수입 금액과 실제 입금액이 다르면 차액을 정산 화면에 표시합니다.")),
          kind==="goal"&&h(R.Fragment,null,
            input("월 수익 목표 (원)","monthly_target_won","number",row.monthly_target_won??3000000,true,{min:0,max:100000000,step:10000}),
            input("한 달 근무 예정일","planned_work_days","number",row.planned_work_days??25,true,{min:1,max:31}),
            txt("p","fin-hint","목표는 내 계정에 저장되며 실제 수익은 입력된 기록만 반영합니다."))),
        h("footer",null,error&&txt("p","fin-error",error),
          h("button",{type:"submit",className:"fin-primary",disabled:busy},busy?"저장 중…":"저장하기"))));
  }

  function Finance({user,login,onBike}) {
    const [section,setSection]=R.useState("overview");
    const [scope,setScope]=R.useState("today");
    const [anchor,setAnchor]=R.useState(koreanWorkDay);
    const [data,setData]=R.useState(null);
    const [loading,setLoading]=R.useState(false);
    const [error,setError]=R.useState("");
    const [notice,setNotice]=R.useState("");
    const [rev,refresh]=R.useState(0);
    const [editor,setEditor]=R.useState(null);
    const [sheetError,setSheetError]=R.useState("");
    const [busy,setBusy]=R.useState(false);
    const [filter,setFilter]=R.useState("all");
    R.useEffect(()=>{
      if(window.__rsFinanceAction==="fuel"){window.__rsFinanceAction=null;
        setSection("records");setEditor({kind:"fuel",day:koreanWorkDay()});}
    },[]);
    R.useEffect(()=>{
      let active=true;setError("");setLoading(true);setData(null);
      if(!user){setLoading(false);return;}
      const fetchRows=async(table,date)=>{
        const list=[];
        for(let offset=0;offset<10000;offset+=500){
          const res=await client.from(table).select("*").eq("user_id",user.id)
            .order(date,{ascending:false}).range(offset,offset+499);
          if(res.error)throw res.error;
          list.push(...(res.data||[]));if((res.data||[]).length<500)break;
        }
        return list;
      };
      Promise.all([
        fetchRows("rider_earnings","work_date"),
        fetchRows("rider_fuel_logs","fueled_on"),
        fetchRows("maintenance_logs","serviced_on"),
        fetchRows("rider_extra_expenses","expense_date"),
        client.from("rider_finance_goals").select("*").eq("user_id",user.id).maybeSingle()
      ]).then(res=>{
        if(!active)return;
        if(res[4].error)throw res[4].error;
        setData({earnings:res[0],fuel:res[1],maintenance:res[2],extras:res[3],goal:res[4].data});
        setLoading(false);
      }).catch(e=>{if(active){setError(e?.message||"수익 데이터를 불러오지 못했어요.");
        setLoading(false);}});
      return ()=>{active=false;};
    },[user?.id,rev]);
    const today=koreanWorkDay();
    const [from,to]=scope==="month"?financeMonthPeriod(anchor):
      scope==="week"?[plusDays(today,-6),today]:[today,today];
    const totals=financeTotals(data||emptyData,from,to);
    const [monthFrom,monthTo]=financeMonthPeriod(anchor);
    const monthly=financeTotals(data||emptyData,monthFrom,monthTo);
    const goal={monthly_target_won:3000000,planned_work_days:25,...(data?.goal||{})};
    const goalTarget=num(goal.monthly_target_won);
    const achieved=goalTarget?Math.min(100,Math.round(monthly.gross/goalTarget*100)):100;
    const workedDays=new Set(monthly.earnings.filter(x=>num(x.gross_won)>0).map(x=>x.work_date)).size;
    const remainingWorkDays=Math.max(1,num(goal.planned_work_days)-workedDays);
    const perDay=Math.ceil(Math.max(0,goalTarget-monthly.gross)/remainingWorkDays);
    const graph=financeDays(data||emptyData,today,7);
    const ceiling=Math.max(1,...graph.map(x=>x.gross));
    const openEditor=(kind,row=null)=>{if(!user)return login();
      setSheetError("");setEditor({kind,row,day:today});};
    async function save(form) {
      if(!user||busy||!editor)return;
      const f=new FormData(form),v=k=>String(f.get(k)||"").trim();
      const amount=Number(v(editor.kind==="income"?"gross_won":editor.kind==="fuel"?"cost_won":editor.kind==="expense"?"amount_won":editor.kind==="settlement"?"paid_won":"monthly_target_won"));
      if(!safeAmount(amount) || (editor.kind==="fuel"&&amount===0) || (editor.kind==="expense"&&amount===0)){
        setSheetError("0~1억 원 범위의 올바른 금액을 입력해 주세요.");return;
      }
      setBusy(true);setSheetError("");
      try{
        let table="",values={};
        const kind=editor.kind,row=editor.row;
        if(kind==="income"){
          table="rider_earnings";
          values={work_date:v("work_date"),platform:v("platform"),gross_won:amount,gross_entered:true,
            deliveries:Number(v("deliveries")||0),note:v("note"),
            expenses_won:Number(v("expenses_won")||0),
            expense_scope:row?.expense_scope||"other_only"};
          if(!Number.isSafeInteger(values.deliveries)||values.deliveries<0||values.deliveries>300||
            !safeAmount(values.expenses_won))throw Error("건수 또는 기타 비용을 확인해 주세요.");
        }else if(kind==="fuel"){
          table="rider_fuel_logs";
          values={fueled_on:v("fueled_on"),cost_won:amount,note:v("note")};
          if(v("liters")){values.liters=Number(v("liters"));
            if(!(values.liters>0&&values.liters<=150))throw Error("주유량을 확인해 주세요.");}
          else values.liters=null;
        }else if(kind==="settlement"){
          table="rider_earnings";
          if(!row?.id||!v("paid_at"))throw Error("입금 날짜를 확인해 주세요.");
          values={paid_at:v("paid_at"),paid_won:amount};
        }else if(kind==="expense"){
          table="rider_extra_expenses";
          values={expense_date:v("expense_date"),category:v("category"),amount_won:amount,memo:v("memo")};
          if(!categories.includes(values.category))throw Error("지출 분류를 확인해 주세요.");
        }else{
          table="rider_finance_goals";
          const days=Number(v("planned_work_days"));
          if(!Number.isInteger(days)||days<1||days>31)throw Error("근무 예정일은 1~31일로 입력해 주세요.");
          values={monthly_target_won:amount,planned_work_days:days,updated_at:new Date().toISOString()};
        }
        if(kind==="goal"){
          const result=await client.from(table).upsert({...values,user_id:user.id},{onConflict:"user_id"});
          if(result.error)throw result.error;
        }else if(row){
          const result=await client.from(table).update(values).eq("id",row.id)
            .eq("user_id",user.id).select("id");
          if(result.error)throw result.error;
          if(!result.data?.length)throw Error("기록이 변경됐어요. 새로고침한 뒤 다시 시도해 주세요.");
        }else{
          const result=await client.from(table).insert({...values,user_id:user.id}).select("id");
          if(result.error)throw result.error;
        }
        setEditor(null);setNotice("기록을 저장했어요.");refresh(n=>n+1);
      }catch(e){setSheetError(e?.message||"기록을 저장하지 못했어요.");}
      finally{setBusy(false);}
    }
    async function remove(kind,row) {
      if(!user||!row||busy||!window.confirm("이 기록을 삭제할까요?"))return;
      const table={income:"rider_earnings",fuel:"rider_fuel_logs",expense:"rider_extra_expenses"}[kind];
      if(!table)return;
      setBusy(true);
      try{const r=await client.from(table).delete().eq("id",row.id)
        .eq("user_id",user.id).select("id");
        if(r.error)throw r.error;if(!r.data?.length)throw Error("삭제할 기록을 찾지 못했어요.");
        setNotice("기록을 삭제했어요.");refresh(n=>n+1);
      }catch(e){setNotice(e?.message||"삭제에 실패했어요.");}
      finally{setBusy(false);}
    }
    async function paid(row) {
      if(!user||busy||!row.paid_at||!window.confirm("입금 확인을 취소할까요?"))return;
      setBusy(true);
      try{const r=await client.from("rider_earnings")
        .update({paid_at:null,paid_won:null}).eq("id",row.id)
        .eq("user_id",user.id).select("id");
        if(r.error)throw r.error;if(!r.data?.length)throw Error("정산 기록이 변경됐어요.");
        setNotice("입금 표시를 취소했어요.");
        refresh(n=>n+1);
      }catch(e){setNotice(e?.message||"정산 상태를 변경하지 못했어요.");}
      finally{setBusy(false);}
    }
    const scopeButton=(id,label)=>button(label,()=>setScope(id),"fin-period-btn"+(scope===id?" selected":""),
      {"aria-pressed":scope===id});
    const moneyStat=(label,value,cls="")=>h("div",{className:"fin-stat "+cls},
      txt("small",null,label),txt("strong",null,value));
    const sectionNav=h("nav",{className:"fin-subnav","aria-label":"수익 관리 상세 메뉴"},
      [["overview","개요"],["records","내역"],["settlements","정산"],["analysis","분석"]]
        .map(([id,name])=>button(name,()=>setSection(id),
          "fin-subnav-btn"+(section===id?" selected":""),{key:id,"aria-current":section===id?"page":undefined})));
    function chart() {
      return h("div",{className:"fin-chart","aria-label":"최근 7일 날짜별 기록 수익 막대 그래프"},
        graph.map((x,i)=>h("div",{className:"fin-chart-col",key:x.day},
          txt("small","fin-chart-value",x.gross?new Intl.NumberFormat("ko-KR",{notation:"compact",maximumFractionDigits:1}).format(x.gross):""),
          h("div",{className:"fin-chart-track"},h("div",{className:"fin-chart-bar",
            style:{height:x.gross?Math.max(3,x.gross/ceiling*100)+"%":"2px"}})),
          txt("small","fin-chart-date",dateLabel(x.day)),
          x.day===today&&h("span",{className:"fin-chart-today","aria-label":"오늘"}))));
    }
    function platformBreakdown() {
      return h("div",{className:"fin-platforms"},
        Object.entries(totals.byPlatform).length?Object.entries(totals.byPlatform)
          .sort((a,b)=>b[1]-a[1]).map(([p,n])=>h("div",{className:"fin-platform",key:p},
            h("div",{className:"fin-platform-title"},txt("span",null,p),txt("strong",null,money(n))),
            h("div",{className:"fin-bar-track"},h("div",{className:"fin-bar-value",
              style:{width:totals.gross?(n/totals.gross*100)+"%":"0%"}}))))
          :txt("p","fin-empty","플랫폼 수익을 입력하면 비율을 보여줘요."));
    }
    function overview() {
      const snapDays=scope==="today"?[today]:scope==="week"?graph.map(x=>x.day):
        Array.from({length:31},(_,i)=>plusDays(monthFrom,i)).filter(x=>x<=monthTo);
      const rides=snapDays.map(day=>dailyRideSnapshot(window.__rsRideApi?.history,day));
      const duration=rides.reduce((n,x)=>n+num(x.durationMs),0),distance=rides.reduce((n,x)=>n+num(x.distanceKm),0);
      return h("div",{className:"fin-stack"},
        h("div",{className:"fin-period"},scopeButton("today","오늘"),scopeButton("week","최근 7일"),
          scopeButton("month","이번 달")),
        h("section",{className:"fin-hero"},
          h("div",{className:"fin-hero-top"},txt("span",null,"기록된 배달 수익"),icon("earnings",22)),
          h("strong",{className:"fin-hero-amount"},money(totals.gross)),
          txt("small","fin-hero-range",from===to?from:from+" ~ "+to),
          h("div",{className:"fin-hero-divider"}),
          h("div",{className:"fin-hero-bottom"},
            h("span",null,"기록된 지출",h("strong",null,money(totals.cost))),
            h("span",null,"비용 차감액",h("strong",null,totals.uncertain?"확인 필요":money(totals.net))))),
        totals.uncertain&&txt("p","fin-warning","과거 입력한 기타 비용에 주유·정비비가 포함됐는지 확인해 주세요. 중복 가능성이 있어 차감액을 표시하지 않아요."),
        h("div",{className:"fin-stat-grid"},
          moneyStat("운행 시간",duration?Math.round(duration/360000)/10+"시간":"기록 없음"),
          moneyStat("기록 기준 시간당 수익",duration?money(totals.gross/(duration/3600000)):"계산 불가"),
          moneyStat("운행 거리",distance?distance.toFixed(1)+"km":"기록 없음"),
          moneyStat("기록 기준 km당 수익",distance?money(totals.gross/distance):"계산 불가")),
        txt("p","fin-muted","GPS 운행 기록과 수익 입력 날짜가 일치할 때만 효율을 계산해요. 휴식·누락 수익은 반영되지 않을 수 있어요."),
        h("div",{className:"fin-quick"},
          button(h(R.Fragment,null,icon("earnings",19),"수익 입력"),()=>openEditor("income"),"fin-primary"),
          button(h(R.Fragment,null,icon("fuel",19),"지출 입력"),()=>openEditor("expense"),"fin-secondary")),
        h("section",{className:"fin-card"},
          h("header",null,h("h2",null,"플랫폼별 수익")),platformBreakdown()),
        h("section",{className:"fin-card"},
          h("header",null,h("h2",null,"최근 7일 수익"),txt("small",null,"원")),chart()),
        h("section",{className:"fin-card fin-goal"},
          h("header",null,h("h2",null,"월간 목표"),
            button(h(R.Fragment,null,icon("settings",17),"설정"),()=>openEditor("goal",goal),"fin-textbtn")),
          h("div",{className:"fin-goal-amount"},txt("strong",null,money(monthly.gross)),
            txt("small",null,"/ "+money(goalTarget))),
          h("div",{className:"fin-goal-track"},h("div",{style:{width:achieved+"%"}})),
          h("div",{className:"fin-goal-numbers"},
            txt("span",null,achieved+"% 달성"),
            txt("span",null,"남은 목표 "+money(Math.max(0,goalTarget-monthly.gross)))),
          h("div",{className:"fin-goal-daily"},txt("small",null,"남은 예정 근무 "+remainingWorkDays+"일 기준 하루 목표"),
            txt("strong",null,money(perDay)))));
    }
    function records() {
      const rows=[];
      for(const row of data?.earnings||[]) if(row.gross_entered!==false)
        rows.push({type:"income",day:row.work_date,amount:num(row.gross_won),row,name:row.platform});
      for(const row of data?.fuel||[])rows.push({type:"fuel",day:row.fueled_on,amount:num(row.cost_won),row,name:"주유비"});
      for(const row of data?.maintenance||[])rows.push({type:"maintenance",day:row.serviced_on,amount:num(row.cost_won),row,name:row.item||"정비"});
      for(const row of data?.extras||[])rows.push({type:"expense",day:row.expense_date,amount:num(row.amount_won),row,name:row.category});
      const visible=rows.filter(x=>x.day>=monthFrom&&x.day<=monthTo&&
        (filter==="all"||filter==="income"&&x.type==="income"||
        filter==="expense"&&x.type!=="income")).sort((a,b)=>b.day.localeCompare(a.day));
      return h("div",{className:"fin-stack"},
        h("div",{className:"fin-month-head"},
          button(icon("left",20),()=>setAnchor(monthDelta(anchor,-1)),"fin-iconbtn",{"aria-label":"이전 달"}),
          txt("strong",null,monthFrom.slice(0,7).replace("-","년 ")+"월"),
          button(icon("right",20),()=>setAnchor(monthDelta(anchor,1)),"fin-iconbtn",{"aria-label":"다음 달"})),
        h("div",{className:"fin-inline-tabs"},
          [["all","전체"],["income","수익"],["expense","지출"]].map(([id,label])=>
            button(label,()=>setFilter(id),"fin-filter"+(filter===id?" current":""),{key:id,"aria-pressed":filter===id}))),
        h("div",{className:"fin-quick"},
          button("＋ 수익 기록",()=>openEditor("income"),"fin-primary"),
          button("＋ 지출 기록",()=>openEditor("expense"),"fin-secondary")),
        h("section",{className:"fin-card"},
          h("header",null,h("h2",null,"날짜별 내역"),txt("small",null,visible.length+"건")),
          visible.length?visible.map((x,i)=>h(R.Fragment,{key:x.type+x.row.id},
            (!i||visible[i-1].day!==x.day)&&txt("h3","fin-record-date",x.day),
            h("div",{className:"fin-record"},
              h("span",{className:"fin-record-icon "+(x.type==="income"?"gain":"spend")},
                icon(x.type==="income"?"earnings":x.type==="fuel"?"fuel":"settings",19)),
              h("div",{className:"fin-record-info"},txt("strong",null,x.name),
                txt("small",null,x.type==="income"?(x.row.paid_at?"입금 확인 "+x.row.paid_at:"입금 확인 전") :
                  x.type==="maintenance"?"내 바이크 정비 기록":x.row.memo||x.row.note||"지출 기록")),
              h("div",{className:"fin-record-end"},
                txt("strong",x.type==="income"?"gain":"spend",(x.type==="income"?"+":"−")+money(x.amount)),
                h("div",{className:"fin-record-actions"},
                  button("수정",()=>x.type==="maintenance"?onBike():openEditor(x.type,x.row),"fin-textbtn"),
                  x.type!=="maintenance"&&button("삭제",()=>remove(x.type,x.row),"fin-textbtn fin-danger",{disabled:busy}))))))
          :txt("p","fin-empty","이 기간에 기록이 없어요.")),
        h("div",{className:"fin-shortcuts"},
          button("주유비 기록",()=>openEditor("fuel"),"fin-secondary"),
          button("정비 기록은 내 바이크에서",onBike,"fin-secondary")));
    }
    function settlements() {
      const rows=monthly.earnings.slice().sort((a,b)=>b.work_date.localeCompare(a.work_date));
      return h("div",{className:"fin-stack"},
        h("div",{className:"fin-month-head"},
          button(icon("left",20),()=>setAnchor(monthDelta(anchor,-1)),"fin-iconbtn",{"aria-label":"이전 달"}),
          txt("strong",null,monthFrom.slice(0,7).replace("-","년 ")+"월"),
          button(icon("right",20),()=>setAnchor(monthDelta(anchor,1)),"fin-iconbtn",{"aria-label":"다음 달"})),
        h("div",{className:"fin-stat-grid"},
          moneyStat("기록된 실제 입금액",money(monthly.paid),"paid"),
          moneyStat("미확인 수익",money(monthly.unpaid))),
        txt("p","fin-muted","플랫폼 계좌 내역과 자동 연동되지 않습니다. 실제 입금일과 금액을 수동 입력하는 장부입니다. 이전 입금 확인 기록에 금액이 없다면 기존 수익액으로 가정해 표시합니다."),
        monthly.payoutDifference!==0&&txt("p","fin-warning","수익으로 기록한 금액과 확인된 입금액 차이: "+money(monthly.payoutDifference)),
        h("section",{className:"fin-card"},
          h("header",null,h("h2",null,"플랫폼별 정산 현황")),
          ...Object.entries(monthly.byPlatform).map(([p,g])=>{
            const settled=rows.filter(x=>(x.platform==="배민커넥트"?"배민":x.platform)===p&&x.paid_at)
              .reduce((n,x)=>n+num(x.paid_won??x.gross_won),0);
            return h("div",{className:"fin-settlement-platform",key:p},
              txt("strong",null,p),txt("small",null,money(settled)+" 확인 / "+money(g)+" 수익"),
              h("div",{className:"fin-bar-track"},h("div",{className:"fin-bar-value",
                style:{width:g?settled/g*100+"%":"0%"}})));
          }),
          !rows.length&&txt("p","fin-empty","기록된 수익이 없어요.")),
        h("section",{className:"fin-card"},h("header",null,h("h2",null,"입금 확인 내역")),
          ...rows.map(x=>h("div",{className:"fin-settlement-row",key:x.id},
            h("div",null,txt("strong",null,x.platform+" · "+money(x.gross_won)),
              txt("small",null,x.work_date+(x.paid_at?" · 입금일 "+x.paid_at+" · "+money(x.paid_won??x.gross_won):" · 미확인"))),
            h("div",{className:"fin-settlement-actions"},
              button(x.paid_at?"입금 수정":"입금 입력",()=>openEditor("settlement",x),
                "fin-paid-btn"+(x.paid_at?" completed":""),{disabled:busy}),
              x.paid_at&&button("확인 취소",()=>paid(x),"fin-textbtn fin-danger",{disabled:busy}))))));
    }
    function analysis() {
      const days=[];
      for(let d=monthFrom;d<=monthTo;d=plusDays(d,1))days.push(d);
      const weeks=[];
      for(let i=0;i<days.length;i+=7) {
        const start=days[i],end=days[Math.min(i+6,days.length-1)];
        weeks.push({label:dateLabel(start)+"~"+dateLabel(end),...financeTotals(data||emptyData,start,end)});
      }
      const top=Math.max(1,...weeks.map(x=>x.gross));
      return h("div",{className:"fin-stack"},
        h("div",{className:"fin-month-head"},
          button(icon("left",20),()=>setAnchor(monthDelta(anchor,-1)),"fin-iconbtn",{"aria-label":"이전 달"}),
          txt("strong",null,monthFrom.slice(0,7).replace("-","년 ")+"월"),
          button(icon("right",20),()=>setAnchor(monthDelta(anchor,1)),"fin-iconbtn",{"aria-label":"다음 달"})),
        h("div",{className:"fin-stat-grid"},
          moneyStat("기록된 수입",money(monthly.gross)),
          moneyStat("기록된 지출",money(monthly.cost)),
          moneyStat("비용 차감액",monthly.uncertain?"확인 필요":money(monthly.net)),
          moneyStat("기록된 배달 건수",monthly.deliveries+"건")),
        h("section",{className:"fin-card"},h("header",null,h("h2",null,"주간 수익 추이")),
          h("div",{className:"fin-chart fin-chart-week"},
            weeks.map((x,i)=>h("div",{className:"fin-chart-col",key:i},
              txt("small","fin-chart-value",x.gross?new Intl.NumberFormat("ko-KR",{notation:"compact"}).format(x.gross):""),
              h("div",{className:"fin-chart-track"},h("div",{className:"fin-chart-bar",
                style:{height:x.gross?Math.max(3,x.gross/top*100)+"%":"2px"}})),
              txt("small","fin-chart-date",x.label))))),
        h("section",{className:"fin-card"},h("header",null,h("h2",null,"지출 구성")),
          [["주유",monthly.fuelCost],["정비",monthly.maintenanceCost],
            ["수익 입력 기타 비용",monthly.earningCosts],["생활·보험 등",monthly.extraCost]]
            .map(([name,value])=>h("div",{className:"fin-cost-row",key:name},
              txt("span",null,name),txt("strong",null,money(value))))),
        monthly.uncertain&&txt("p","fin-warning","예전 기록의 기타 비용 분류가 불분명해 주유·정비비와 중복될 수 있어요."),
        txt("p","fin-muted","미입력 비용, 세금, 보험 정산 및 실제 계좌 입금액은 자동 추정하지 않습니다.")));
    }
    return h("section",{className:"finance-page page narrow"},
      h("div",{className:"fin-page-head"},h("div",null,txt("small",null,"MY EARNINGS"),
        h("h1",null,"수익 관리")),icon("earnings",25)),
      sectionNav,
      !user?h("section",{className:"fin-card"},h("h2",null,"내 수익을 안전하게 보관해요."),
        txt("p","fin-muted","로그인하면 수익·지출·정산 기록을 모든 기기에서 확인할 수 있어요."),
        button("로그인",login,"fin-primary")):
      loading?txt("p","fin-load","수익 기록을 불러오는 중…"):
      error?h("section",{className:"fin-card"},txt("p","fin-error",error),
        button("다시 불러오기",()=>refresh(n=>n+1),"fin-secondary")):
      h(R.Fragment,null,notice&&txt("p","fin-notice",notice),
        section==="overview"?overview():section==="records"?records():
        section==="settlements"?settlements():analysis()),
      editor&&user&&h(FinanceSheet,{editor,close:()=>setEditor(null),save,busy,error:sheetError}));
  }
  return Finance;
}
