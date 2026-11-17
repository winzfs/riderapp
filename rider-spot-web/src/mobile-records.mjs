import { rs33ISO } from "./timeline-dates.mjs";
import scooter from "./scooter.svg";
import { icons } from "./ui.mjs";

const platforms = ["쿠팡이츠", "배민"];
const defaults = ["엔진오일", "앞 타이어", "뒤 타이어", "브레이크 패드"];
const number = value => Number(value).toLocaleString("ko-KR");
const itemsOf = row => row.service_items?.length ? row.service_items : [row.item];
const km = value => value == null ? "거리 미입력" : number(value) + " km";
async function read(request) {
  const { data, error } = await request;
  if (error) throw error;
  return data;
}
async function pages(query) {
  const rows = [];
  for (let start = 0; ; start += 500) {
    const batch = await read(query().range(start, start + 499));
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}
export function createRecords(R, client) {
  const h = R.createElement;

  const field = (label, props) => h("label", null, label, h("input", props));
  const btn = (label, click, props = {}) => h("button", {type:"button", onClick:click, ...props}, label);
  const Icon = ({name,size=20}) => h("svg",{
    className:"rs-icon",width:size,height:size,viewBox:"0 0 24 24",
    fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":true,
  },h("path",{d:icons[name]||icons.shops}));
  const serviceIcon = item => /타이어/.test(item)?"tire":/오일/.test(item)?"oil":/브레이크/.test(item)?"brake":/배터리/.test(item)?"battery":/벨트/.test(item)?"belt":"shops";
  function Sheet({title, date, close, save, submit, children}) {
    const [error, setError] = R.useState("");
    const [busy, setBusy] = R.useState(false);
    const lock = R.useRef(false);
    const surface=R.useRef(null);
    R.useLayoutEffect(()=>{
      const node=surface.current, viewport=window.visualViewport;
      node.showModal();
      const size=()=>{node.style.height=(viewport?.height||innerHeight)+"px";node.style.top=(viewport?.offsetTop||0)+"px";};
      size(); viewport?.addEventListener("resize",size); viewport?.addEventListener("scroll",size);
      return ()=>{viewport?.removeEventListener("resize",size);viewport?.removeEventListener("scroll",size);node.close();};
    },[]);
    const dismiss = () => { if (!lock.current) close(); };
    const latest = R.useRef(dismiss);
    latest.current = dismiss;
    R.useEffect(() => {
      const marker = crypto.randomUUID();
      history.pushState({...history.state, recordSheet:marker}, "");
      const back = () => { if(lock.current) history.pushState({recordSheet:marker},""); else latest.current(); };
      window.addEventListener("popstate",back);
      return () => {
        window.removeEventListener("popstate",back);
        if(history.state?.recordSheet === marker) history.back();
      };
    }, []);
    return h("dialog",{ref:surface,className:"record-surface","aria-label":title,onCancel:e=>{e.preventDefault();dismiss();},onClick:e=>{if(e.target===e.currentTarget)dismiss();}},h("form",{className:"record-sheet",
      onSubmit:async event=>{
        event.preventDefault();
        if(lock.current) return;
        lock.current=true; setBusy(true); setError("");
        try { await save(new FormData(event.currentTarget)); close(); }
        catch(err){ setError(err.message || "저장하지 못했어요. 다시 시도해 주세요."); }
        finally {lock.current=false; setBusy(false);}
      }},
      h("div",{className:"record-heading"},h("strong",null,title),btn("닫기",dismiss,{disabled:busy})),
      h("section",null,date && h("small",null,date),children),
      h("footer",null,error && h("p",{role:"alert"},error),h("button",{className:"record-primary",disabled:busy},busy?"저장 중…":submit))));
  }
  function Income({day,user,login}) {
    const [values,setValues]=R.useState(null),[error,setError]=R.useState(""),[revision,refresh]=R.useState(0);
    const [draft,edit]=R.useState(null);
    R.useEffect(()=>{
      let active=true; setValues(null); setError(""); edit(null);
      if(user) pages(()=>client.from("rider_earnings").select("id,platform,gross_won,gross_entered").eq("user_id",user.id).eq("work_date",day).order("id"))
        .then(rows=>{if(active){const totals={}; for(const row of rows) if(row.gross_entered!==false) totals[row.platform]=(totals[row.platform]??0)+Number(row.gross_won); setValues(totals);}})
        .catch(()=>{if(active)setError("조회 재시도");});
      return ()=>{active=false;};
    },[day,user?.id,revision]);
    const sum=obj=>Object.values(obj || {}).reduce((total,v)=>total+Number(v||0),0);
    return h(R.Fragment,null,btn(h(R.Fragment,null,h("span",null,"수익"),h("strong",null,error || (values && Object.keys(values).length ? number(sum(values))+"원" : user && !values?"조회 중…":"수익 입력")," ›")),()=>{
      if(!user) return login();
      if(error) return refresh(revision+1);
      if(values) edit(Object.fromEntries(platforms.map(p=>[p,values[p]==null?"":String(values[p])])));
    },{className:"record-income"}),
    draft && h(Sheet,{title:"수익 입력",date:day+" · 한국시간 결산일",close:()=>edit(null),submit:number(sum(draft))+"원 저장",
      save:async()=>{
        const changes={};
        for(const p of platforms){const v=draft[p]===""?null:Number(draft[p]); if(v!==(values[p]??null))changes[p]=v;}
        await read(client.rpc("set_rider_daily_income",{p_date:day,p_values:changes}));
        refresh(n=>n+1);
      }},platforms.map((p,i)=>field(p+" (원)",{key:p,name:p,inputMode:"numeric",enterKeyHint:i?"done":"next",placeholder:"미입력",value:draft[p]===""?"":number(draft[p]),
        onKeyDown:event=>{if(!i && event.key==="Enter"){event.preventDefault();event.target.form.elements.namedItem(platforms[1]).focus();}},
        onChange:event=>{const digits=event.target.value.replace(/,/g,""); if(/^\d{0,9}$/.test(digits)&&Number(digits)<=100000000) edit({...draft,[p]:digits});}}))));
  }

  function ServiceEditor({row,item,choices,user,close,changed}) {
    const [selected,select]=R.useState(row?itemsOf(row):item?[item]:[]);
    const id=R.useRef(row?.id || crypto.randomUUID());
    return h(Sheet,{title:row?"정비 기록 수정":"정비 기록",close,submit:"정비 기록 저장",save:async form=>{
      const custom=form.get("custom").trim();
      const items=[...new Set([...selected,...(custom?[custom]:[])])];
      if(!items.length) throw Error("정비 항목을 선택해 주세요.");
      const label=items.join(" · ");
      if(label.length<2 || label.length>80) throw Error("정비명은 2~80자로 입력해 주세요.");
      const optional=key=>form.get(key)===""?null:Number(form.get(key));
      await read(client.from("maintenance_logs").upsert({id:id.current,user_id:user.id,item:label,service_items:items,
        serviced_on:form.get("day"),odometer_km:optional("km"),cost_won:optional("cost"),
        workshop:form.get("shop").trim(),note:form.get("note").trim()}).select("id").single());
      changed();
    }},field("정비 날짜",{name:"day",type:"date",required:true,defaultValue:row?.serviced_on||rs33ISO(Date.now())}),
    h("fieldset",null,h("legend",null,"교환 항목 · 복수 선택"),choices.map(name=>btn(name,()=>select(current=>current.includes(name)?current.filter(x=>x!==name):[...current,name]),{key:name,"aria-pressed":selected.includes(name)}))),
    field("직접 입력",{name:"custom",maxLength:80,placeholder:"다른 정비 항목"}),
    h("div",{className:"record-pair"},field("계기판 (km)",{type:"number",inputMode:"numeric",min:0,max:999999,name:"km",placeholder:"선택",defaultValue:row?.odometer_km??""}),
      field("총비용 (원)",{type:"number",inputMode:"numeric",min:0,max:100000000,name:"cost",placeholder:"선택",defaultValue:row?.cost_won??""})),
    h("details",{open:row?.workshop||row?.note?true:undefined},h("summary",null,"정비소 · 메모"),field("정비소",{name:"shop",maxLength:100,defaultValue:row?.workshop||""}),field("메모",{name:"note",maxLength:500,defaultValue:row?.note||""})));
  }


  // Vehicle distance is edited independently of workshop entries and fuel logs.
  // The database trigger records the Korean calendar date only when the value changes.
  function VehicleEditor({kind,user,vehicle,close,changed}) {
    const odometer=kind==="odometer";
    return h(Sheet,{title:odometer?"현재 계기판 입력":"차량명 수정",close,submit:odometer?"계기판 저장":"차량명 저장",save:async form=>{
      const value=String(form.get(odometer?"odometer":"vehicle_name")||"").trim();
      let payload;
      if(odometer){
        const distance=Number(value);
        if(!/^\\d{1,7}$/.test(value)||!Number.isSafeInteger(distance)||distance>9999999)
          throw Error("계기판 거리를 0~9,999,999km 사이로 입력해 주세요.");
        payload={odometer_km:distance};
      }else{
        if(!value||value.length>40)throw Error("차량명을 1~40자로 입력해 주세요.");
        payload={vehicle_name:value};
      }
      if(vehicle){
        const updated=await read(client.from("rider_vehicle_profiles").update(payload)
          .eq("user_id",user.id).select("user_id").maybeSingle());
        if(!updated)throw Error("차량 정보가 변경됐어요. 화면을 새로고침한 뒤 다시 시도해 주세요.");
      }else{
        await read(client.from("rider_vehicle_profiles").insert({user_id:user.id,...payload}).select("user_id").single());
      }
      changed();
    }},
    odometer
      ? h(R.Fragment,null,
          h("p",{className:"record-help"},"오토바이 계기판에 표시된 현재 거리를 입력해 주세요. 정비 이력과는 별도로 저장됩니다."),
          field("현재 계기판 (km)",{name:"odometer",type:"number",inputMode:"numeric",enterKeyHint:"done",
            min:0,max:9999999,step:1,required:true,placeholder:"예: 24500",defaultValue:vehicle?.odometer_km??""}),
          h("p",{className:"record-help"},"변경된 거리를 저장하면 한국시간 기준 입력일이 자동 기록됩니다."))
      : h(R.Fragment,null,
          field("차량명",{name:"vehicle_name",type:"text",required:true,maxLength:40,
            placeholder:"예: PCX125",defaultValue:vehicle?.vehicle_name||""}),
          h("p",{className:"record-help"},"차량명만 바꾸면 기존 계기판 거리와 입력일은 유지됩니다.")));
  }

  function CyclesEditor({user,choices,cycles,close,changed}) {
    const current=Object.fromEntries(cycles.map(row=>[row.item_key,row]));
    return h(Sheet,{title:"소모품 교체 주기",close,submit:"교체 주기 저장",save:async form=>{
      const rows=[];
      for(let i=0;i<choices.length;i++){
        const item=choices[i];
        const parse=(key,max)=>{
          const raw=String(form.get(key)||"").trim();
          if(!raw)return null;
          const n=Number(raw);
          if(!/^\\d+$/.test(raw)||!Number.isSafeInteger(n)||n<1||n>max)
            throw Error(item+"의 교체 주기를 확인해 주세요.");
          return n;
        };
        const distance=parse("km-"+i,999999),days=parse("days-"+i,3650);
        if(distance!=null||days!=null||current[item])
          rows.push({user_id:user.id,item_key:item,interval_km:distance,interval_days:days});
      }
      if(rows.length)await read(client.from("rider_maintenance_cycles")
        .upsert(rows,{onConflict:"user_id,item_key"}).select("item_key"));
      changed();
    }},
    h("p",{className:"record-help"},"내 바이크에서 확인할 교체 기준을 정하세요. 비워 둔 항목은 주기를 표시하지 않습니다."),
    ...choices.map((item,i)=>h("div",{className:"bike-cycle-editor",key:item},
      h("strong",null,h(Icon,{name:serviceIcon(item),size:19}),item),
      h("div",{className:"record-pair"},
        field("교체 거리 (km)",{name:"km-"+i,type:"number",inputMode:"numeric",min:1,max:999999,
          step:1,placeholder:"선택",defaultValue:current[item]?.interval_km??""}),
        field("교체 기간 (일)",{name:"days-"+i,type:"number",inputMode:"numeric",min:1,max:3650,
          step:1,placeholder:"선택",defaultValue:current[item]?.interval_days??""})))));
  }

  function Bike({user,login,profile}) {
    const [data,setData]=R.useState(null),[error,setError]=R.useState(""),[revision,refresh]=R.useState(0);
    const [editor,setEditor]=R.useState(null),[filter,setFilter]=R.useState("");
    const [vehicleEdit,setVehicleEdit]=R.useState(null),[cyclesOpen,setCyclesOpen]=R.useState(false);
    const historyHeading=R.useRef(null);
    R.useEffect(()=>{if(filter)historyHeading.current?.scrollIntoView({block:"start"});},[filter]);
    const changed=()=>refresh(n=>n+1);
    R.useEffect(()=>{
      let active=true; setError("");
      if(user){
        const table=name=>client.from(name).select("*").eq("user_id",user.id);
        Promise.all([pages(()=>table("maintenance_logs").order("serviced_on",{ascending:false}).order("created_at",{ascending:false}).order("id")),
          read(table("rider_vehicle_profiles").maybeSingle()),read(table("rider_maintenance_cycles")),
          read(table("rider_fuel_logs").not("odometer_km","is",null).order("fueled_on",{ascending:false}).order("created_at",{ascending:false}).limit(1))])
          .then(([rows,vehicle,cycles,fuel])=>{if(active)setData({rows,vehicle,cycles,fuel:fuel[0]});}).catch(()=>{if(active)setError("정비 이력을 불러오지 못했어요.");});
      }
      return ()=>{active=false;};
    },[user?.id,revision]);
    const rows=data?.rows||[], vehicle=data?.vehicle, cycles=data?.cycles||[];
    const choices=[...new Set([...rows.flatMap(itemsOf),...defaults,...cycles.map(c=>c.item_key)])];
    const latest=rows.find(r=>r.odometer_km!=null),fuel=data?.fuel;
    const historyReadings=[[latest?.odometer_km,latest?.serviced_on],[fuel?.odometer_km,fuel?.fueled_on]]
      .filter(([distance,date])=>distance!=null&&date).sort((a,b)=>b[1].localeCompare(a[1])||b[0]-a[0]);
    const manual=vehicle?.odometer_km!=null;
    const reading=manual?[vehicle.odometer_km,vehicle.odometer_recorded_on||"입력일 미기록"]:historyReadings[0];
    const visible=rows.filter(row=>!filter||itemsOf(row).includes(filter));
    const tool=name=>window.__rsOpenTool?.(name);
    const edit=value=>user?setEditor(value):login();
    const vehicleAction=kind=>user?setVehicleEdit(kind):login();
    return h("section",{className:"bike-page page narrow"},
      h("div",{className:"bike-heading"},
        h("h1",null,"내 바이크"),
        btn(h(R.Fragment,null,h(Icon,{name:"settings",size:17}),"프로필·설정"),profile,
          {className:"bike-quiet-action","aria-label":"프로필·설정"})),
      h("div",{className:"bike-vehicle"},
        h("div",{className:"bike-vehicle-data"},
          h("small",null,"등록 차량"),
          h("h2",null,vehicle?.vehicle_name||"내 오토바이"),
          h("div",{className:"bike-odometer-label"},h(Icon,{name:"gauge",size:17}),"현재 계기판"),
          h("strong",null,reading?km(reading[0]):"거리 미입력"),
          h("small",null,reading?.[1]||"아직 입력된 거리 없음",
            !manual&&reading?" · 정비·주유 기록 기준":"")),
        h("img",{src:scooter,alt:"스쿠터 일러스트",width:130,height:82})),
      h("div",{className:"bike-vehicle-actions"},
        btn(h(R.Fragment,null,h(Icon,{name:"gauge",size:19}),"계기판 입력"),
          ()=>vehicleAction("odometer"),{className:"bike-outline-action","aria-label":"계기판 입력",disabled:!!user&&!data}),
        btn(h(R.Fragment,null,h(Icon,{name:"edit",size:18}),"차량명 수정"),
          ()=>vehicleAction("name"),{className:"bike-outline-action","aria-label":"차량명 수정",disabled:!!user&&!data})),
      h("div",{className:"bike-actions"},
        btn(h(R.Fragment,null,h(Icon,{name:"shops",size:19}),"＋ 정비 기록"),
          ()=>edit({}),{className:"record-primary",disabled:!!user&&!data,"aria-label":"＋ 정비 기록"}),
        btn(h(R.Fragment,null,h(Icon,{name:"fuel",size:19}),"주유 기록"),
          ()=>tool("fuel"))),
      error && h("p",{role:"alert"},error,btn("다시 조회",changed)),
      h("div",{className:"bike-section-head"},
        h("h2",null,"소모품 현황"),
        btn(h(R.Fragment,null,h(Icon,{name:"settings",size:17}),"교체 주기 설정"),
          ()=>user?setCyclesOpen(true):login(),{className:"bike-quiet-action","aria-label":"교체 주기 설정",disabled:!!user&&!data})),
      choices.map(item=>{
        const row=rows.find(r=>itemsOf(r).includes(item));
        const cycle=cycles.find(c=>c.item_key===item);
        const interval=cycle?.interval_km;
        const due=row?.next_due_km??(interval&&row?.odometer_km!=null?Number(interval)+Number(row.odometer_km):null);
        return btn(h(R.Fragment,null,
          h("span",{className:"bike-row-main"},
            h("span",{className:"bike-item-icon"},h(Icon,{name:serviceIcon(item),size:21})),
            h("span",null,h("b",null,item),
              h("small",null,row?km(row.odometer_km):"교환 기록 없음"),
              row?.serviced_on?h("small",null,"마지막 교환 · "+row.serviced_on):null)),
          h("span",{className:"bike-row-meta"},
            due!=null?h("b",null,"다음 "+km(due)):(cycle?.interval_days?h("b",null,cycle.interval_days+"일 주기"):h("small",null,"주기 미설정")),
            h(Icon,{name:"chevron",size:17}))),
          ()=>setFilter(filter===item?"":item),
          {key:item,className:"bike-row","aria-pressed":filter===item});
      }),
      h("div",{className:"bike-heading bike-history-head",ref:historyHeading,style:{scrollMarginTop:"64px"}},
        h("h2",null,h(Icon,{name:"history",size:19}),filter?filter+" 이력":"정비 이력"),
        filter&&btn("전체 보기",()=>setFilter(""),{className:"bike-quiet-action"})),
      filter&&btn("＋ "+filter+" 교환 기록",()=>edit({item:filter}),{className:"bike-add"}),
      visible.length?visible.map((row,i)=>h(R.Fragment,{key:row.id},
        (!i||visible[i-1].serviced_on.slice(0,7)!==row.serviced_on.slice(0,7))
          &&h("h3",null,row.serviced_on.slice(0,7).replace("-","년 ")+"월"),
        btn(h(R.Fragment,null,
          h("span",{className:"bike-row-main"},
            h("span",{className:"bike-item-icon subtle"},h(Icon,{name:serviceIcon(itemsOf(row)[0]),size:19})),
            h("span",null,h("b",null,itemsOf(row).join(" · ")),
              h("small",null,row.serviced_on+" · "+km(row.odometer_km)))),
          h("span",{className:"bike-row-meta"},h("b",null,row.cost_won==null?"비용 미입력":number(row.cost_won)+"원"),
            h(Icon,{name:"chevron",size:17}))),
          ()=>edit({row}),{className:"bike-row bike-history-row"})))
        :h("p",{className:"bike-empty"},user&&!data&&!error?"기록을 읽고 있어요…":"등록된 정비 기록이 없어요."),
      h("div",{className:"bike-links"},
        btn(h(R.Fragment,null,h(Icon,{name:"work",size:18}),"전체 업무 도구 ›"),()=>tool("hub"))),
      vehicleEdit && h(VehicleEditor,{kind:vehicleEdit,user,vehicle,
        close:()=>setVehicleEdit(null),changed}),
      cyclesOpen && h(CyclesEditor,{user,choices,cycles,
        close:()=>setCyclesOpen(false),changed}),
      editor && h(ServiceEditor,{...editor,user,choices,close:()=>setEditor(null),changed}));
  }
  return {Income,Bike};
}
