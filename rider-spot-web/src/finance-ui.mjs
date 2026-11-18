import {dailyRideSnapshot} from "./ride-insights.mjs";
import {icons} from "./ui.mjs";
import {won,num,koreanWorkDay,plusDays,financeTotals,financeDays,financeMonthPeriod,financeLedger,validWon,recurringOccurrences,nextPayoutDate,financeMonths} from "./finance-model.mjs";

const money = won;
const categories = ["보험료","통신비","주차비","장비","기타","식비","개인 비용"];
const platforms = ["쿠팡이츠","배민","기타"];
const emptyData = {earnings:[],fuel:[],maintenance:[],extras:[],goal:null,recurring:[],payoutRules:[]};
const dateLabel = day => String(day||"").slice(5).replace("-","/");
const safeAmount = validWon;
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
  const amountInput=(label,name,value,required=true)=>h("label",{className:"fin-field fin-money-input"},
    h("span",null,label),h("input",{type:"text",name,inputMode:"numeric",enterKeyHint:"done",
      autoComplete:"off",required,pattern:"[0-9,]*",
      defaultValue:value==null?"":new Intl.NumberFormat("ko-KR").format(value),placeholder:"0",
      onInput:e=>{const raw=e.currentTarget.value.replace(/\D/g,"").slice(0,9);
        const normalized=raw?new Intl.NumberFormat("ko-KR").format(Number(raw)):"";
        if(e.currentTarget.value!==normalized)e.currentTarget.value=normalized;}}));
  function FinanceSheet({editor,close,save,busy,error,userId}) {
    const ref=R.useRef(null),formRef=R.useRef(null),drag=R.useRef(null),dirty=R.useRef(false);
    const closer=R.useRef(close),key="rs:fin-draft:v2:"+userId+":"+editor.kind;
    const dismiss=()=>{if(busy)return;
      if(dirty.current&&!window.confirm("작성 중인 내용을 닫을까요?"))return;
      close();};
    closer.current=dismiss;
    const draftChange=e=>{
      if(editor.row?.id||editor.kind==="goal"||editor.kind==="settlement")return;
      dirty.current=true;
      try{const values=Object.fromEntries(new FormData(e.currentTarget));
        localStorage.setItem(key,JSON.stringify({at:Date.now(),values}));}catch{}
    };
    const pointerStart=e=>{if(!e.isPrimary||e.button!==0)return;
      drag.current={id:e.pointerId,start:e.clientY};
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if(formRef.current)formRef.current.style.animation="none";};
    const pointerMove=e=>{if(drag.current?.id!==e.pointerId)return;
      if(formRef.current)formRef.current.style.transform="translate3d(0,"+
        Math.max(0,e.clientY-drag.current.start)+"px,0)";};
    const pointerEnd=e=>{if(drag.current?.id!==e.pointerId)return;
      const distance=Math.max(0,e.clientY-drag.current.start);drag.current=null;
      if(formRef.current){formRef.current.style.transition="transform 200ms cubic-bezier(.2,.8,.3,1)";
        formRef.current.style.transform="";}
      if(distance>120)dismiss();};
    R.useLayoutEffect(()=>{
      ref.current?.showModal();
      const vv=window.visualViewport;
      const adjust=()=>{if(ref.current){ref.current.style.top=(vv?.offsetTop||0)+"px";
        ref.current.style.height=(vv?.height||window.innerHeight)+"px";}};
      adjust();vv?.addEventListener("resize",adjust);vv?.addEventListener("scroll",adjust);
      if(!editor.row?.id&&editor.kind!=="goal"&&editor.kind!=="settlement"){
        try{const draft=JSON.parse(localStorage.getItem(key)||"null");
          if(draft?.at>Date.now()-7*86400000&&draft.at<Date.now()+60000){
            for(const [fieldName,value] of Object.entries(draft.values||{})){
              const el=formRef.current?.elements.namedItem(fieldName);
              if(el?.length&&el[0]?.type==="radio"){
                for(const radio of el)radio.checked=radio.value===value;
              }else if(el&&typeof el.value==="string")el.value=value;
            }
            dirty.current=true;
          }}catch{}
      }
      return ()=>{vv?.removeEventListener("resize",adjust);vv?.removeEventListener("scroll",adjust);
        if(ref.current?.open)ref.current.close();};
    },[]);
    R.useEffect(()=>{
      if(!window.__rsNavigation)return;
      return window.__rsNavigation.registerLayer("finance-sheet",()=>closer.current());
    },[]);
    const row=editor.row||{},kind=editor.kind;
    const name=kind==="income"?"수익":kind==="fuel"?"주유비":kind==="expense"?"지출":
      kind==="settlement"?"실제 입금":kind==="recurrence"?"반복 지출":
      kind==="payout"?"정산 일정":"월 목표";
    const [cycle,setCycle]=R.useState(row.cycle||"none");
    return h("dialog",{ref,className:"fin-dialog","aria-label":name+" 입력",
      onCancel:e=>{e.preventDefault();dismiss();},
      onClick:e=>{if(e.target===e.currentTarget)dismiss();}},
      h("form",{ref:formRef,className:"fin-sheet",onChange:draftChange,
        onInput:draftChange,onSubmit:e=>{e.preventDefault();save(e.currentTarget);}},
        h("div",{className:"fin-drag-area",onPointerDown:pointerStart,onPointerMove:pointerMove,
          onPointerUp:pointerEnd,onPointerCancel:pointerEnd},h("span",{className:"fin-drag-handle"})),
        h("header",{className:"fin-sheet-head"},
          h("div",null,txt("small",null,editor.row?"기록 수정":kind==="recurrence"||kind==="payout"?"일정 설정":"빠른 입력"),
            h("h2",null,name+(kind==="goal"?" 설정":" 기록"))),
          button(icon("close",22),dismiss,"fin-close",{"aria-label":"닫기",disabled:busy})),
        h("div",{className:"fin-sheet-body"},
          kind==="income"&&h(R.Fragment,null,
            h("div",{className:"fin-platform-choice",role:"radiogroup","aria-label":"배달 플랫폼"},
              platforms.map(p=>h("label",{key:p},h("input",{type:"radio",name:"platform",value:p,
                defaultChecked:p===(row.platform||editor.platform||"쿠팡이츠")}),h("span",null,p)))),
            amountInput("수익 금액","gross_won",row.gross_won??null),
            h("details",{className:"fin-optional"},h("summary",null,"날짜 · 건수 · 기타"),
              dateInput("업무일","work_date",row.work_date||editor.day),
              input("배달 건수","deliveries","number",row.deliveries??"",false,{min:0,max:300}),
              amountInput("수익에 포함되지 않은 기타 비용","expenses_won",row.expenses_won??null,false),
              input("메모","note","text",row.note||"",false,{maxLength:300}))),
          kind==="fuel"&&h(R.Fragment,null,
            dateInput("주유 날짜","fueled_on",row.fueled_on||editor.day),
            amountInput("주유 금액","cost_won",row.cost_won??null),
            h("details",{className:"fin-optional"},h("summary",null,"주유량 · 메모 (선택)"),
              input("주유량 (L)","liters","number",row.liters??"",false,{min:0.001,max:150,step:0.001}),
              input("메모","note","text",row.note||"",false,{maxLength:300})),
            txt("p","fin-hint","내 바이크의 주유 기록과 같은 장부를 사용합니다.")),
          kind==="expense"&&h(R.Fragment,null,
            dateInput("지출 날짜","expense_date",row.expense_date||editor.day),
            select("분류","category",categories,row.category||editor.category||"보험료"),
            amountInput("지출 금액","amount_won",row.amount_won??null),
            input("메모","memo","text",row.memo||"",false,{maxLength:300}),
            txt("p","fin-hint","주유비·정비비는 각각의 기존 장부에서 기록해 주세요. 비용이 두 번 잡히지 않도록 분리합니다.")),
          kind==="settlement"&&h(R.Fragment,null,
            txt("p","fin-hint",row.platform+" · "+row.work_date+" 수익 "+money(row.gross_won)+" 기준"),
            dateInput("실제 입금 날짜","paid_at",row.paid_at||editor.day),
            amountInput("실제 입금 금액","paid_won",row.paid_won??row.gross_won),
            txt("p","fin-hint","수입 금액과 실제 입금액이 다르면 차액을 정산 화면에 표시합니다.")),
          kind==="goal"&&h(R.Fragment,null,
            amountInput("월 수익 목표","monthly_target_won",row.monthly_target_won??3000000),
            input("한 달 근무 예정일","planned_work_days","number",row.planned_work_days??25,true,{min:1,max:31}),
            h("label",{className:"fin-field"},h("span",null,"목표 기준"),
              h("select",{name:"goal_basis",defaultValue:row.goal_basis||"gross"},
                h("option",{value:"gross"},"총수익"),
                h("option",{value:"net"},"업무 비용 차감액")))),
          kind==="recurrence"&&h(R.Fragment,null,
            select("비용 분류","category",categories,row.category||editor.category||"보험료"),
            amountInput("반복 금액","amount_won",row.amount_won??null),
            input("매월 날짜","day_of_month","number",row.day_of_month??Number(editor.day.slice(8)),true,
              {min:1,max:31,step:1}),
            input("메모","memo","text",row.memo||"",false,{maxLength:300}),
            h("label",{className:"fin-toggle-line"},h("input",{name:"active",type:"checkbox",
              defaultChecked:row.active!==false}),h("span",null,"반복 일정 활성화")),
            txt("p","fin-hint","설정만 저장합니다. 실제 지출은 내역에서 확인 후 등록해요.")),
          kind==="payout"&&h(R.Fragment,null,
            txt("p","fin-hint",(row.platform||editor.platform)+" · 내 정산 예정 일정"),
            h("label",{className:"fin-field"},h("span",null,"반복 방식"),
              h("select",{name:"cycle",value:cycle,onChange:e=>setCycle(e.target.value)},
                h("option",{value:"none"},"예정일 설정 안 함"),
                h("option",{value:"weekly"},"매주 특정 요일"),
                h("option",{value:"monthly"},"매월 특정 날짜"))),
            cycle==="weekly"&&h("label",{className:"fin-field"},h("span",null,"요일"),
              h("select",{name:"weekday",defaultValue:String(row.weekday??1)},
                ["일요일","월요일","화요일","수요일","목요일","금요일","토요일"].map((day,i)=>
                  h("option",{key:i,value:i},day)))),
            cycle==="monthly"&&input("매월 일자","month_day","number",row.month_day??25,true,
              {min:1,max:31,step:1}),
            txt("p","fin-hint","예정일은 직접 정한 참고 일정입니다. 입금 여부와 실제 날짜는 별도로 기록해야 해요.")),
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
    const [selectedChart,setSelectedChart]=R.useState(null);
    const [selectedAnalysis,setSelectedAnalysis]=R.useState(null);
    const [analysisMode,setAnalysisMode]=R.useState("weekly");
    R.useEffect(()=>{
      const changed=e=>{if(!e?.detail?.userId||e.detail.userId===user?.id)refresh(n=>n+1);};
      const visible=()=>{if(document.visibilityState==="visible")refresh(n=>n+1);};
      window.addEventListener("riderspot:finance-changed",changed);
      document.addEventListener("visibilitychange",visible);
      return ()=>{window.removeEventListener("riderspot:finance-changed",changed);
        document.removeEventListener("visibilitychange",visible);};
    },[user?.id]);
    R.useEffect(()=>{
      if(window.__rsFinanceAction==="fuel"){window.__rsFinanceAction=null;
        setSection("records");setEditor({kind:"fuel",day:koreanWorkDay()});}
    },[]);
    R.useEffect(()=>{
      let active=true;setError("");setLoading(true);
      if(!user){setData(null);setLoading(false);return;}
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
        client.from("rider_finance_goals").select("*").eq("user_id",user.id).maybeSingle(),
        client.from("rider_recurring_expenses").select("*").eq("user_id",user.id)
          .order("created_at",{ascending:false}),
        client.from("rider_finance_payout_rules").select("*").eq("user_id",user.id)
      ]).then(res=>{
        if(!active)return;
        if(res[4].error)throw res[4].error;
        if(res[5].error)throw res[5].error;
        if(res[6].error)throw res[6].error;
        setData({earnings:res[0],fuel:res[1],maintenance:res[2],extras:res[3],
          goal:res[4].data,recurring:res[5].data||[],payoutRules:res[6].data||[]});
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
    const goal={monthly_target_won:3000000,planned_work_days:25,goal_basis:"gross",...(data?.goal||{})};
    const goalTarget=num(goal.monthly_target_won);
    const goalValue=goal.goal_basis==="net"?monthly.net:monthly.gross;
    const goalUncertain=goal.goal_basis==="net"&&monthly.uncertain;
    const achieved=goalUncertain?null:goalTarget?Math.min(100,Math.round(goalValue/goalTarget*100)):100;
    const workedDays=new Set(monthly.earnings.filter(x=>num(x.gross_won)>0).map(x=>x.work_date)).size;
    const remainingWorkDays=Math.max(1,num(goal.planned_work_days)-workedDays);
    const perDay=goalUncertain?null:Math.ceil(Math.max(0,goalTarget-goalValue)/remainingWorkDays);
    const graph=financeDays(data||emptyData,today,7);
    const ceiling=Math.max(1,...graph.map(x=>x.gross));
    const openMaintenance=(row,mode="detail")=>{
      if(!user||!row?.id)return;
      window.__rsFinanceMaintenance={id:row.id,userId:user.id,mode};
      onBike();
    };
    const openEditor=(kind,row=null)=>{if(!user)return login();
      let savedPlatform="쿠팡이츠";
      try{savedPlatform=localStorage.getItem("rs:finance-platform:"+user.id)||savedPlatform;}catch{}
      let category="보험료";
      try{category=localStorage.getItem("rs:finance-category:"+user.id)||category;}catch{}
      setSheetError("");setEditor({kind,row,day:today,category:categories.includes(category)?category:"보험료",
        platform:platforms.includes(savedPlatform)?savedPlatform:"쿠팡이츠"});};
    async function save(form) {
      if(!user||busy||!editor)return;
      const f=new FormData(form),v=k=>String(f.get(k)||"").trim(),moneyValue=k=>v(k).replace(/,/g,"");
      const amountKey=editor.kind==="income"?"gross_won":editor.kind==="fuel"?"cost_won":
        editor.kind==="expense"||editor.kind==="recurrence"?"amount_won":
        editor.kind==="settlement"?"paid_won":"monthly_target_won";
      const raw=moneyValue(amountKey),amount=Number(raw);
      if(editor.kind!=="payout"&&(!raw||!safeAmount(amount) ||
          (["fuel","expense","recurrence"].includes(editor.kind)&&amount===0))){
        setSheetError("1억 원 이하의 올바른 금액을 입력해 주세요.");return;
      }
      setBusy(true);setSheetError("");
      try{
        let table="",values={};
        const kind=editor.kind,row=editor.row;
        if(kind==="income"){
          table="rider_earnings";
          values={work_date:v("work_date"),platform:v("platform"),gross_won:amount,gross_entered:true,
            deliveries:Number(v("deliveries")||0),note:v("note"),
            expenses_won:Number(moneyValue("expenses_won")||0),
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
        }else if(kind==="recurrence"){
          table="rider_recurring_expenses";
          const day=Number(v("day_of_month"));
          if(!categories.includes(v("category"))||!Number.isInteger(day)||day<1||day>31)
            throw Error("비용 분류 또는 매월 날짜를 확인해 주세요.");
          values={category:v("category"),amount_won:amount,day_of_month:day,
            memo:v("memo").slice(0,300),active:f.get("active")==="on",
            updated_at:new Date().toISOString()};
        }else if(kind==="payout"){
          table="rider_finance_payout_rules";
          const cycle=v("cycle"),platform=row?.platform||editor.platform;
          if(!platforms.includes(platform)||!["none","weekly","monthly"].includes(cycle))
            throw Error("정산 주기를 확인해 주세요.");
          const weekday=cycle==="weekly"?Number(v("weekday")):null;
          const monthDay=cycle==="monthly"?Number(v("month_day")):null;
          if(cycle==="weekly"&&(!Number.isInteger(weekday)||weekday<0||weekday>6)||
             cycle==="monthly"&&(!Number.isInteger(monthDay)||monthDay<1||monthDay>31))
            throw Error("정산 요일 또는 날짜를 확인해 주세요.");
          values={platform,cycle,weekday,month_day:monthDay,updated_at:new Date().toISOString()};
        }else{
          table="rider_finance_goals";
          const days=Number(v("planned_work_days")),goalBasis=v("goal_basis");
          if(!Number.isInteger(days)||days<1||days>31||!["gross","net"].includes(goalBasis))
            throw Error("목표 근무일 또는 기준을 확인해 주세요.");
          values={monthly_target_won:amount,planned_work_days:days,goal_basis:goalBasis,
            updated_at:new Date().toISOString()};
        }
        if(kind==="payout"){
          const result=await client.from(table).upsert({...values,user_id:user.id},
            {onConflict:"user_id,platform"});
          if(result.error)throw result.error;
        }else if(kind==="goal"){
          const result=await client.from(table).upsert({...values,user_id:user.id},{onConflict:"user_id"});
          if(result.error)throw result.error;
        }else if(kind==="income"&&!row){
          // Same-date/platform finance and timeline totals share one locked RPC.
          const existing=await client.from("rider_earnings").select("id,gross_won,gross_entered")
            .eq("user_id",user.id).eq("work_date",values.work_date).eq("platform",values.platform)
            .order("created_at",{ascending:true});
          if(existing.error)throw existing.error;
          const matches=existing.data||[];
          const previous=matches.filter(x=>x.gross_entered!==false)
            .reduce((n,x)=>n+Number(x.gross_won||0),0);
          if(matches.length&&!window.confirm(values.work_date+" "+values.platform+" 기록에 이미 "+money(previous)+"이 있어요. 새 금액 "+money(amount)+"으로 변경할까요?")){
            setSheetError("기존 기록은 그대로 유지했어요.");return;
          }
          const details=values.deliveries>0||values.expenses_won>0||!!values.note;
          if(values.platform!=="기타"&&!details){
            const r=await client.rpc("set_rider_daily_income",{p_date:values.work_date,p_values:{[values.platform]:amount}});
            if(r.error)throw r.error;
          }else if(matches.length===1){
            const r=await client.from("rider_earnings").update(values).eq("id",matches[0].id)
              .eq("user_id",user.id).select("id");
            if(r.error)throw r.error;
            if(!r.data?.length)throw Error("기록 변경을 확인하지 못했어요.");
          }else if(matches.length>1){
            throw Error("같은 날짜·플랫폼의 기존 기록이 여러 건이에요. 내역에서 개별 수정해 주세요.");
          }else{
            const r=await client.from("rider_earnings").insert({...values,user_id:user.id}).select("id");
            if(r.error)throw r.error;
          }
          try{localStorage.setItem("rs:finance-platform:"+user.id,values.platform);}catch{}
        }else if(row){
          const result=await client.from(table).update(values).eq("id",row.id)
            .eq("user_id",user.id).select("id");
          if(result.error)throw result.error;
          if(!result.data?.length)throw Error("기록이 변경됐어요. 새로고침한 뒤 다시 시도해 주세요.");
        }else{
          const result=await client.from(table).insert({...values,user_id:user.id}).select("id");
          if(result.error)throw result.error;
        }
        try{
          localStorage.removeItem("rs:fin-draft:v2:"+user.id+":"+editor.kind);
          if(kind==="expense"||kind==="recurrence")localStorage.setItem("rs:finance-category:"+user.id,values.category);
        }catch{}
        setEditor(null);setNotice(kind==="recurrence"?"반복 지출 일정을 저장했어요.":
          kind==="payout"?"정산 예정일을 저장했어요.":"기록을 저장했어요.");
        refresh(n=>n+1);
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
    const plannedRows=recurringOccurrences(data?.recurring,data?.extras,monthFrom.slice(0,7));
    async function confirmRecurring(rule) {
      if(!user||busy||rule.recorded||!rule.day)return;
      setBusy(true);setNotice("");
      try{
        const values={user_id:user.id,recurrence_id:rule.id,recurrence_month:monthFrom,
          expense_date:rule.day,category:rule.category,amount_won:rule.amount_won,memo:rule.memo||""};
        const res=await client.from("rider_extra_expenses").insert(values).select("id");
        if(res.error){
          if(res.error.code==="23505")setNotice("이달 반복 지출은 이미 등록됐어요.");
          else throw res.error;
        }else setNotice("실제 지출 "+money(rule.amount_won)+"을(를) 등록했어요.");
        refresh(n=>n+1);
      }catch(e){setNotice(e?.message||"지출을 등록하지 못했어요.");}
      finally{setBusy(false);}
    }
    async function removeRecurring(rule) {
      if(!user||busy||!rule?.id)return;
      if((data?.extras||[]).some(x=>x.recurrence_id===rule.id)){
        setNotice("등록된 실제 지출이 있는 반복 규칙은 '활성화'를 꺼서 중지해 주세요.");
        return;
      }
      if(!window.confirm("반복 지출 일정을 삭제할까요?"))return;
      setBusy(true);
      try{
        const res=await client.from("rider_recurring_expenses").delete()
          .eq("id",rule.id).eq("user_id",user.id).select("id");
        if(res.error)throw res.error;
        if(!res.data?.length)throw Error("삭제할 설정을 찾지 못했어요.");
        setNotice("반복 일정을 삭제했어요.");refresh(n=>n+1);
      }catch(e){setNotice(e?.message||"일정을 삭제하지 못했어요.");}
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
      const selected=graph.find(x=>x.day===selectedChart);
      return h(R.Fragment,null,
        h("div",{className:"fin-chart","aria-label":"최근 7일 날짜별 수익"},
          graph.map(x=>h("button",{type:"button",
            className:"fin-chart-col fin-chart-point"+(selectedChart===x.day?" selected":""),
            key:x.day,onClick:()=>setSelectedChart(selectedChart===x.day?null:x.day),
            "aria-label":x.day+" 수익 "+money(x.gross),"aria-pressed":selectedChart===x.day},
            txt("small","fin-chart-value",x.gross?new Intl.NumberFormat("ko-KR",{notation:"compact",maximumFractionDigits:1}).format(x.gross):""),
            h("span",{className:"fin-chart-track"},h("span",{className:"fin-chart-bar",
              style:{height:x.gross?Math.max(3,x.gross/ceiling*100)+"%":"2px"}})),
            txt("small","fin-chart-date",dateLabel(x.day)),
            x.day===today&&h("span",{className:"fin-chart-today","aria-label":"오늘"})))),
        selected&&h("div",{className:"fin-chart-detail",role:"status"},
          txt("strong",null,selected.day),
          txt("span",null,"수익 "+money(selected.gross)),
          txt("span",null,"업무 비용 "+money(financeTotals(data||emptyData,selected.day,selected.day).cost)),
          txt("span",null,financeTotals(data||emptyData,selected.day,selected.day).uncertain?
            "차감액 확인 필요":"차감액 "+money(selected.net))));
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
      const usable=!!duration&&!!distance;
      return h("div",{className:"fin-stack"},
        h("div",{className:"fin-period"},
          scopeButton("today","오늘"),scopeButton("week","최근 7일"),scopeButton("month","월간")),
        scope==="month"&&h("div",{className:"fin-month-head"},
          button(icon("left",20),()=>setAnchor(monthDelta(anchor,-1)),"fin-iconbtn",{"aria-label":"이전 달"}),
          txt("strong",null,monthFrom.slice(0,7).replace("-","년 ")+"월"),
          button(icon("right",20),()=>setAnchor(monthDelta(anchor,1)),"fin-iconbtn",{"aria-label":"다음 달"})),
        h("section",{className:"fin-hero"},
          h("div",{className:"fin-hero-top"},txt("span",null,"총 배달 수익"),icon("earnings",20)),
          h("strong",{className:"fin-hero-amount"},money(totals.gross)),
          txt("small","fin-hero-range",from===to?from:from+" ~ "+to),
          h("div",{className:"fin-hero-divider"}),
          h("div",{className:"fin-hero-bottom"},
            h("span",null,"업무 비용",h("strong",null,money(totals.cost))),
            h("span",null,"비용 차감액",h("strong",null,totals.uncertain?"확인 필요":money(totals.net))))),
        totals.uncertain&&txt("p","fin-warning","예전 수익의 비용 분류가 불분명해 비용 차감액 확인이 필요해요."),
        h("div",{className:"fin-quick"},
          button(h(R.Fragment,null,icon("earnings",19),"수익 입력"),()=>openEditor("income"),"fin-primary"),
          button(h(R.Fragment,null,icon("fuel",19),"지출 입력"),()=>openEditor("expense"),"fin-secondary")),
        h("section",{className:"fin-card fin-goal"},
          h("header",null,h("h2",null,"월 목표"),
            button(h(R.Fragment,null,icon("settings",16),"설정"),()=>openEditor("goal",goal),"fin-textbtn")),
          h("div",{className:"fin-goal-amount"},txt("strong",null,goalUncertain?"확인 필요":money(goalValue)),
            txt("small",null,"/ "+money(goalTarget)+" · "+(goal.goal_basis==="net"?"비용 차감액":"총수익"))),
          h("div",{className:"fin-goal-track"},h("div",{style:{width:(achieved??0)+"%"}})),
          h("div",{className:"fin-goal-numbers"},
            txt("span",null,achieved==null?"분류 확인 필요":achieved+"% 달성"),
            txt("span",null,goalUncertain?"확인 필요":"남은 목표 "+money(Math.max(0,goalTarget-goalValue)))),
          h("details",{className:"fin-optional"},h("summary",null,"필요한 하루 수익 보기"),
            h("div",{className:"fin-goal-daily"},txt("small",null,"남은 근무 "+remainingWorkDays+"일 기준"),
              txt("strong",null,perDay==null?"확인 필요":money(perDay))))),
        h("section",{className:"fin-card"},
          h("header",null,h("h2",null,"플랫폼별 수익")),platformBreakdown()),
        h("section",{className:"fin-card"},
          h("header",null,h("h2",null,"최근 7일 수익")),chart()),
        h("details",{className:"fin-insights"},
          h("summary",null,"운행 효율",h("span",null,usable?"운행 기록 기준":"기록 없음")),
          h("div",{className:"fin-stat-grid"},
            moneyStat("운행 시간",duration?Math.round(duration/360000)/10+"시간":"기록 없음"),
            moneyStat("시간당 수익",duration?money(totals.gross/(duration/3600000)):"계산 불가"),
            moneyStat("운행 거리",distance?distance.toFixed(1)+"km":"기록 없음"),
            moneyStat("km당 수익",distance?money(totals.gross/distance):"계산 불가"),
            moneyStat("시간당 비용 차감액",duration&&!totals.uncertain?money(totals.net/(duration/3600000)):"계산 불가"),
            moneyStat("km당 비용 차감액",distance&&!totals.uncertain?money(totals.net/distance):"계산 불가"))));
    }
    function records() {
      const rows=financeLedger(data||emptyData,monthFrom,monthTo);
      const visible=rows.filter(x=>filter==="all"||filter==="income"&&x.type==="income"||
        filter==="expense"&&x.type!=="income");
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
              button(h(R.Fragment,null,txt("strong",null,x.name),
                txt("small",null,x.type==="income"?(x.row.paid_at?"입금 확인 "+x.row.paid_at:"입금 확인 전") :
                  x.type==="maintenance"?"정비 원본 기록 보기":x.personal?"개인 지출 · 업무비 제외":x.row.memo||x.row.note||"업무 지출")),
                ()=>x.type==="maintenance"?openMaintenance(x.row):openEditor(x.type,x.row),
                "fin-record-info fin-record-open",{"aria-label":x.name+" "+x.day+" 기록 보기"}),
              h("div",{className:"fin-record-end"},
                txt("strong",x.type==="income"?"gain":"spend",(x.type==="income"?"+":"−")+money(x.amount)),
                h("div",{className:"fin-record-actions"},
                  button("수정",()=>x.type==="maintenance"?openMaintenance(x.row,"edit"):openEditor(x.type,x.row),"fin-textbtn"),
                  x.type!=="maintenance"&&button("삭제",()=>remove(x.type,x.row),"fin-textbtn fin-danger",{disabled:busy}))))))
          :txt("p","fin-empty","이 기간에 기록이 없어요.")),
        h("details",{className:"fin-recurring"},
          h("summary",null,h("strong",null,"반복 지출"),h("span",null,
            (data?.recurring||[]).filter(x=>x.active!==false).length+"건 설정 · 예정 비용은 미반영")),
          h("div",{className:"fin-recurring-body"},
            button("＋ 반복 지출 설정",()=>openEditor("recurrence"),"fin-secondary"),
            ...(data?.recurring||[]).map(rule=>{
              const planned=plannedRows.find(x=>x.id===rule.id);
              const registered=(data?.extras||[]).find(x=>x.recurrence_id===rule.id&&
                x.recurrence_month===monthFrom);
              return h("div",{className:"fin-recurring-row",key:rule.id},
                h("div",{className:"fin-recurring-info"},
                  txt("strong",null,rule.category+" · "+money(rule.amount_won)),
                  txt("small",null,rule.active===false?"반복 중지됨":
                    registered?"실제 지출 등록 완료":planned?.day+" 예정 · 실제 지출 미반영"),
                  !!rule.memo&&txt("small",null,rule.memo)),
                h("div",{className:"fin-recurring-actions"},
                  rule.active!==false&&!registered&&button("지출 등록",()=>confirmRecurring(planned),
                    "fin-paid-btn",{disabled:busy}),
                  button("설정",()=>openEditor("recurrence",rule),"fin-textbtn",{disabled:busy}),
                  button("삭제",()=>removeRecurring(rule),"fin-textbtn fin-danger",{disabled:busy})));
            }),
            !(data?.recurring||[]).length&&txt("p","fin-empty","반복 지출 일정이 없어요."))),
        h("div",{className:"fin-shortcuts"},
          button("주유비 기록",()=>openEditor("fuel"),"fin-secondary"),
          button("정비 기록은 내 바이크에서",onBike,"fin-secondary")));
    }
    function settlements() {
      const rows=monthly.earnings.slice().sort((a,b)=>
        Number(!!a.paid_at)-Number(!!b.paid_at)||b.work_date.localeCompare(a.work_date));
      const normalized=p=>p==="배민커넥트"?"배민":p;
      return h("div",{className:"fin-stack"},
        h("div",{className:"fin-month-head"},
          button(icon("left",20),()=>setAnchor(monthDelta(anchor,-1)),"fin-iconbtn",{"aria-label":"이전 달"}),
          txt("strong",null,monthFrom.slice(0,7).replace("-","년 ")+"월"),
          button(icon("right",20),()=>setAnchor(monthDelta(anchor,1)),"fin-iconbtn",{"aria-label":"다음 달"})),
        h("div",{className:"fin-stat-grid"},
          moneyStat("미입금 확인 수익",money(monthly.unpaid)),
          moneyStat("확인된 실제 입금",money(monthly.paid),"paid")),
        txt("p","fin-muted","수익은 업무일, 입금은 실제 입금일 기준입니다. 계좌 자동 연동은 하지 않아요."),
        monthly.payoutDifference!==0&&txt("p","fin-warning",
          "확인된 입금액과 해당 수익 기록 차액: "+money(monthly.payoutDifference)),
        h("section",{className:"fin-card"},
          h("header",null,h("h2",null,"플랫폼별 입금 현황")),
          ...Object.entries(monthly.byPlatform).map(([p,g])=>{
            const paidTotal=rows.filter(x=>normalized(x.platform)===p&&x.paid_at)
              .reduce((n,x)=>n+num(x.paid_won??x.gross_won),0);
            return h("div",{className:"fin-settlement-platform",key:p},
              txt("strong",null,p),
              txt("small",null,money(paidTotal)+" 입금 확인 / "+money(g)+" 업무 수익"),
              h("div",{className:"fin-bar-track"},h("div",{className:"fin-bar-value",
                style:{width:g?Math.min(100,paidTotal/g*100)+"%":"0%"}})));
          }),
          !rows.length&&txt("p","fin-empty","이 달의 수익 기록이 없어요.")),
        h("details",{className:"fin-recurring"},
          h("summary",null,h("strong",null,"플랫폼별 정산 일정"),h("span",null,"직접 설정 · 예정일 참고")),
          h("div",{className:"fin-recurring-body"},
            ...platforms.map(p=>{
              const rule=(data?.payoutRules||[]).find(x=>x.platform===p);
              const date=nextPayoutDate(rule,today);
              const summary=!rule||rule.cycle==="none"?"예정일 미설정":
                rule.cycle==="weekly"?"매주 "+["일","월","화","수","목","금","토"][rule.weekday]+"요일":
                  "매월 "+rule.month_day+"일";
              return h("div",{className:"fin-recurring-row",key:p},
                h("div",{className:"fin-recurring-info"},
                  txt("strong",null,p),
                  txt("small",null,summary+(date?" · 다음 예정 "+date:""))),
                button("설정",()=>openEditor("payout",{...rule,platform:p}),"fin-textbtn"));
            }),
            txt("p","fin-muted","설정한 예정일은 실제 입금을 확정하지 않아요."))),
        h("section",{className:"fin-card"},h("header",null,h("h2",null,"입금 확인 내역"),
          txt("small",null,rows.length+"건")),
          ...rows.map(x=>h("div",{className:"fin-settlement-row",key:x.id},
            h("div",null,txt("strong",null,x.platform+" · "+money(x.gross_won)),
              txt("small",null,x.work_date+(x.paid_at?" · 입금일 "+x.paid_at+" · 실제 "+money(x.paid_won??x.gross_won):" · 미확인"))),
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
          moneyStat("업무 비용",money(monthly.cost)),
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
            ["수익 입력 기타 비용",monthly.earningCosts],["기타 업무 비용",monthly.extraCost],["개인 지출 (업무비 제외)",monthly.personalCost]]
            .map(([name,value])=>h("div",{className:"fin-cost-row",key:name},
              txt("span",null,name),txt("strong",null,money(value))))),
        monthly.uncertain&&txt("p","fin-warning","예전 기록의 기타 비용 분류가 불분명해 주유·정비비와 중복될 수 있어요."),
        txt("p","fin-muted","개인 지출은 업무 비용에서 제외합니다. 미기록 비용과 세금은 반영하지 않습니다."));
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
      editor&&user&&h(FinanceSheet,{editor,close:()=>setEditor(null),save,busy,error:sheetError,userId:user.id}));
  }
  return Finance;
}
