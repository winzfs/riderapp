import { rs33ISO } from "./timeline-dates.mjs";
import scooter from "./scooter.svg";
import { icons } from "./ui.mjs";
import { maintenanceIcon } from "./maintenance-icons.mjs";
import { standardParts, itemsOf, composeServiceItems, normalizePart, serviceRows, serviceDue } from "./maintenance-model.mjs";

const platforms = ["쿠팡이츠", "배민"];
let openRecordSheets = 0;
let originalBodyOverflow = "";
const number = value => Number(value).toLocaleString("ko-KR");
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
  const PartIcon = ({name,size=28}) => h("img",{className:"bike-part-svg",src:maintenanceIcon(name),alt:"",width:size,height:size,draggable:false,"aria-hidden":true});
  function Sheet({title, date, close, save, submit, children, subtitle, leading, action, detail=false}) {
    const [error, setError] = R.useState("");
    const [busy, setBusy] = R.useState(false);
    const lock = R.useRef(false), surface = R.useRef(null), startY = R.useRef(null);
    const closeRef = R.useRef(close);
    closeRef.current = close;
    const dismiss = () => { if (!lock.current) closeRef.current(); };
    R.useLayoutEffect(() => {
      const node = surface.current, viewport = window.visualViewport;
      node.showModal();
      const size = () => {
        node.style.height = (viewport?.height || innerHeight) + "px";
        node.style.top = (viewport?.offsetTop || 0) + "px";
      };
      size();
      viewport?.addEventListener("resize", size);
      viewport?.addEventListener("scroll", size);
      // Preserve the page's scroll position even when detail/edit sheets are nested.
      if (openRecordSheets++ === 0) {
        originalBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
      }
      return () => {
        viewport?.removeEventListener("resize", size);
        viewport?.removeEventListener("scroll", size);
        if (node.open) node.close();
        if (--openRecordSheets === 0) document.body.style.overflow = originalBodyOverflow;
      };
    }, []);
    R.useEffect(() => {
      const marker = crypto.randomUUID();
      history.pushState({...history.state, recordSheet:marker}, "");
      const back = () => {
        const dialogs = [...document.querySelectorAll("dialog.record-surface[open]")];
        if (history.state?.recordSheet !== marker && dialogs.at(-1) === surface.current && !lock.current)
          closeRef.current();
      };
      window.addEventListener("popstate", back);
      return () => {
        window.removeEventListener("popstate", back);
        // Do not consume the parent's history entry when closing a nested edit sheet.
        if (history.state?.recordSheet === marker) history.back();
      };
    }, []);
    const dragStart = event => { startY.current = event.touches?.[0]?.clientY ?? null; };
    const dragEnd = event => {
      const end = event.changedTouches?.[0]?.clientY;
      if (startY.current != null && end - startY.current > 85) dismiss();
      startY.current = null;
    };
    const heading = h("div", {className:"record-heading",onTouchStart:dragStart,onTouchEnd:dragEnd},
      h("span",{className:"record-grab", "aria-hidden":true}),
      h("div",{className:"record-heading-label"},
        h("span",{className:"record-heading-title"},leading || null,h("strong",null,title)),
        subtitle && h("small",null,subtitle)),
      btn(h("svg",{viewBox:"0 0 24 24",width:22,height:22,fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round","aria-hidden":true},
        h("path",{d:"M5 5 19 19M19 5 5 19"})),dismiss,
        {className:"record-close","aria-label":"닫기",disabled:busy}));
    const footer = detail ? (action && h("footer",null,btn(action.label,action.onClick,{className:"record-primary"}))) :
      h("footer",null,error && h("p",{role:"alert"},error),
        h("button",{className:"record-primary",type:"submit",disabled:busy},busy?"저장 중…":submit));
    const props = {className:"record-sheet"};
    if (!detail) props.onSubmit = async event => {
      event.preventDefault();
      if (lock.current) return;
      lock.current = true; setBusy(true); setError("");
      try {
        await save(new FormData(event.currentTarget));
        closeRef.current();
      } catch (err) {
        setError(err?.message || "저장하지 못했어요. 다시 시도해 주세요.");
      } finally {lock.current = false; setBusy(false); }
    };
    return h("dialog",{ref:surface,className:"record-surface","aria-label":title,
      onCancel:event=>{event.preventDefault();dismiss();},
      onClick:event=>{if(event.target===event.currentTarget)dismiss();}},
      h(detail?"div":"form",props,heading,
        h("section",{className:"record-content"},date && h("small",{className:"record-date-label"},date),children),footer));
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
    const [selected,select] = R.useState(() => row ? itemsOf(row) : item ? [item] : []);
    const id = R.useRef(row?.id || crypto.randomUUID());
    const selectedKeys = new Set(selected.map(x=>normalizePart(x).toLocaleLowerCase("ko-KR")));
    const partButton = name => btn(h(R.Fragment,null,
        h(PartIcon,{name,size:32}),
        h("span",{className:"record-part-name"},name),
        selectedKeys.has(normalizePart(name).toLocaleLowerCase("ko-KR")) &&
          h("span",{className:"record-part-check","aria-hidden":true},h(Icon,{name:"check",size:13}))),
      () => select(current => current.includes(name) ? current.filter(x=>x!==name) : [...current,name]),
      {key:name,className:"record-part", "aria-pressed":selected.includes(name),"aria-label":name});
    return h(Sheet,{title:row?"정비 기록 수정":"정비 기록",subtitle:"교환한 부품을 선택하세요",close,
      submit:row?"변경사항 저장":"정비 기록 저장",save:async form=>{
        const items = composeServiceItems(selected, form.get("custom"));
        const day = String(form.get("day") || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error("정비 날짜를 확인해 주세요.");
        const optional = (key,max) => {
          const raw = String(form.get(key) ?? "").replace(/,/g,"").trim();
          if (!raw) return null;
          if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw)>max)
            throw Error((key==="km"?"계기판 거리":"총비용")+"를 확인해 주세요.");
          return Number(raw);
        };
        const payload = {
          id:id.current,user_id:user.id,item:items.join(" · "),service_items:items,
          serviced_on:day,odometer_km:optional("km",999999),cost_won:optional("cost",100000000),
          workshop:String(form.get("shop")||"").trim(),note:String(form.get("note")||"").trim()
        };
        await read(client.from("maintenance_logs").upsert(payload).select("id").single());
        changed(payload);
      }},
      field("정비 날짜",{name:"day",type:"date",required:true,defaultValue:row?.serviced_on||rs33ISO(Date.now())}),
      h("fieldset",{className:"record-parts"},
        h("legend",null,"교환 부품",h("small",null,"복수 선택 가능")),
        h("div",{className:"record-parts-grid"},choices.map(partButton))),
      field("다른 부품 직접 입력",{name:"custom",maxLength:40,
        placeholder:"목록에 없다면 부품명을 입력하세요",autoComplete:"off"}),
      h("p",{className:"record-help"},"선택한 부품들은 한 건의 정비 기록으로 저장됩니다."),
      h("div",{className:"record-pair record-measures"},
        field("계기판 거리 (km)",{type:"text",inputMode:"numeric",name:"km",placeholder:"미입력",
          defaultValue:row?.odometer_km??"",autoComplete:"off"}),
        field("총비용 (원)",{type:"text",inputMode:"numeric",name:"cost",placeholder:"미입력",
          defaultValue:row?.cost_won??"",autoComplete:"off"})),
      h("details",{className:"record-extra",open:row?.workshop||row?.note?true:undefined},
        h("summary",null,"정비소 · 메모",h(Icon,{name:"chevron",size:17})),
        field("정비소",{name:"shop",maxLength:100,defaultValue:row?.workshop||""}),
        h("label",null,"메모",h("textarea",{name:"note",maxLength:500,rows:3,defaultValue:row?.note||""}))));
  }

  function ServiceDetail({item,rows,cycles,reading,close,edit,add}) {
    const historyRows = serviceRows(rows,item);
    const recent = historyRows[0], cycle = cycles.find(c=>c.item_key===item);
    const due = serviceDue(recent,cycle,reading?.[0]);
    const metric = (label,value) => h("div",{className:"record-detail-metric",key:label},
      h("small",null,label),h("strong",null,value));
    const dueText = due.next==null ? (cycle?.interval_days ? number(cycle.interval_days)+"일 기준" : "주기 미설정") : km(due.next);
    return h(Sheet,{title:item+" 관리",detail:true,leading:h(PartIcon,{name:item,size:30}),
      subtitle:"교환 시점과 정비 이력을 확인하세요",close,
      action:{label:historyRows.length?"이 부품 정비 기록 추가":"첫 정비 기록 남기기",onClick:()=>add(item)}},
      h("div",{className:"record-detail-summary"},
        metric("최근 교환일",recent?.serviced_on || "이력 없음"),
        metric("최근 교환 거리",recent ? km(recent.odometer_km) : "거리 미입력"),
        metric("다음 교환 예정",dueText),
        metric("설정한 교체 주기",cycle?.interval_km ? number(cycle.interval_km)+" km" :
          cycle?.interval_days ? number(cycle.interval_days)+"일" : "미설정")),
      due.remaining!=null && h("p",{className:"record-due-status bike-state-"+due.state},
        due.state==="overdue" ? "교체 기준 "+number(-due.remaining)+" km 초과" :
        due.state==="soon" ? "교체 기준까지 "+number(due.remaining)+" km 남음" :
        "교체 기준까지 "+number(due.remaining)+" km 남음"),
      h("div",{className:"record-detail-section-title"},h("h3",null,"정비 이력"),
        h("small",null,historyRows.length+"건")),
      historyRows.length ? h("div",{className:"record-detail-list"},
        historyRows.map(row=>btn(h(R.Fragment,null,
          h("span",{className:"record-log-date"},h("strong",null,row.serviced_on),
            h("small",null,km(row.odometer_km))),
          h("span",{className:"record-log-cost"},h("b",null,row.cost_won==null?"비용 미입력":number(row.cost_won)+"원"),
            row.workshop && h("small",null,row.workshop),
            h("small",{className:"record-log-edit"},"정비 기록 수정"))),
          ()=>edit(row),{key:row.id,className:"record-log","aria-label":row.serviced_on+" 정비 기록 수정"})))
        : h("div",{className:"record-detail-empty"},
          h(PartIcon,{name:item,size:48}),h("strong",null,"아직 교환 기록이 없어요"),
          h("p",null,"첫 정비 기록을 남기면 여기서 바로 확인할 수 있어요.")));
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
        if(!/^\d{1,7}$/.test(value)||!Number.isSafeInteger(distance)||distance>9999999)
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
          if(!/^\d+$/.test(raw)||!Number.isSafeInteger(n)||n<1||n>max)
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
      h("strong",null,h(PartIcon,{name:item,size:22}),item),
      h("div",{className:"record-pair"},
        field("교체 거리 (km)",{name:"km-"+i,type:"number",inputMode:"numeric",min:1,max:999999,
          step:1,placeholder:"선택",defaultValue:current[item]?.interval_km??""}),
        field("교체 기간 (일)",{name:"days-"+i,type:"number",inputMode:"numeric",min:1,max:3650,
          step:1,placeholder:"선택",defaultValue:current[item]?.interval_days??""})))));
  }

  function Bike({user,login,profile}) {
    const [data,setData] = R.useState(null),[error,setError]=R.useState(""),[revision,refresh]=R.useState(0);
    const [editor,setEditor]=R.useState(null),[detailItem,setDetailItem]=R.useState(null);
    const [vehicleEdit,setVehicleEdit]=R.useState(null),[cyclesOpen,setCyclesOpen]=R.useState(false);
    const changed = payload => {
      if (payload?.id) setData(current => current ? {
        ...current,rows:serviceRows([
          {...(current.rows.find(row=>row.id===payload.id)||{created_at:new Date().toISOString()}),...payload},
          ...current.rows.filter(row=>row.id!==payload.id)])
      } : current);
      refresh(n=>n+1);
    };
    R.useEffect(()=>{
      let active=true; setError("");
      if(user){
        const table=name=>client.from(name).select("*").eq("user_id",user.id);
        Promise.all([pages(()=>table("maintenance_logs").order("serviced_on",{ascending:false}).order("created_at",{ascending:false}).order("id")),
          read(table("rider_vehicle_profiles").maybeSingle()),read(table("rider_maintenance_cycles")),
          read(table("rider_fuel_logs").not("odometer_km","is",null).order("fueled_on",{ascending:false}).order("created_at",{ascending:false}).limit(1))])
          .then(([rows,vehicle,cycles,fuel])=>{if(active)setData({rows:serviceRows(rows),vehicle,cycles,fuel:fuel[0]});})
          .catch(()=>{if(active)setError("정비 이력을 불러오지 못했어요.");});
      }
      return ()=>{active=false;};
    },[user?.id,revision]);
    const rows=data?.rows||[], vehicle=data?.vehicle, cycles=data?.cycles||[];
    const choices=[...new Set([...standardParts,...rows.flatMap(itemsOf),...cycles.map(c=>c.item_key)])];
    const latest=rows.find(r=>r.odometer_km!=null),fuel=data?.fuel;
    const historyReadings=[[latest?.odometer_km,latest?.serviced_on],[fuel?.odometer_km,fuel?.fueled_on]]
      .filter(([distance,date])=>distance!=null&&date).sort((a,b)=>b[1].localeCompare(a[1])||b[0]-a[0]);
    const manual=vehicle?.odometer_km!=null;
    const reading=manual?[vehicle.odometer_km,vehicle.odometer_recorded_on||"입력일 미기록"]:historyReadings[0];
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
          h("strong",{className:"bike-distance"},reading?.[0]==null?"거리 미입력":h(R.Fragment,null,
            h("span",null,number(reading[0]))," ",h("small",null,"km"))),
          h("small",null,reading?.[1]||"입력일 미기록",
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
        btn(h(R.Fragment,null,h(Icon,{name:"fuel",size:19}),"주유 기록"),()=>tool("fuel"))),
      error && h("p",{role:"alert"},error,btn("다시 조회",changed)),
      h("div",{className:"bike-section-head"},
        h("h2",null,"소모품 현황"),
        btn(h(R.Fragment,null,h(Icon,{name:"settings",size:17}),"교체 주기 설정"),
          ()=>user?setCyclesOpen(true):login(),
          {className:"bike-quiet-action","aria-label":"교체 주기 설정",disabled:!!user&&!data})),
      h("div",{className:"bike-consumables"},
        choices.map(item=>{
          const row=serviceRows(rows,item)[0], cycle=cycles.find(c=>c.item_key===item);
          const due=serviceDue(row,cycle,reading?.[0]);
          const status=due.state==="overdue"?"기준 초과 · "+number(-due.remaining)+" km":
            due.state==="soon"?"교체 임박 · "+number(due.remaining)+" km":
            due.remaining!=null?number(due.remaining)+" km 남음":
            due.next!=null?"다음 "+km(due.next):
            cycle?.interval_days?number(cycle.interval_days)+"일 주기":"주기 미설정";
          return btn(h(R.Fragment,null,
            h("span",{className:"bike-row-main"},
              h("span",{className:"bike-item-icon"},h(PartIcon,{name:item,size:30})),
              h("span",null,h("b",null,item),
                h("small",null,row?"최근 "+row.serviced_on:"교환 기록 없음"),
                h("small",null,row?km(row.odometer_km):"거리 미입력"))),
            h("span",{className:"bike-row-meta"},
              h("b",{className:"bike-status bike-state-"+due.state},status),
              h(Icon,{name:"chevron",size:17}))),
          ()=>user?setDetailItem(item):login(),
          {key:item,className:"bike-row bike-consumable","aria-label":item+" 관리"}); 
        })),
      h("div",{className:"bike-heading bike-history-head"},
        h("h2",null,h(Icon,{name:"history",size:19}),"전체 정비 이력"),
        h("small",null,rows.length+"건")),
      rows.length ? rows.map((row,i)=>h(R.Fragment,{key:row.id},
        (!i||rows[i-1].serviced_on?.slice(0,7)!==row.serviced_on?.slice(0,7)) &&
          h("h3",null,row.serviced_on.slice(0,7).replace("-","년 ")+"월"),
        btn(h(R.Fragment,null,
          h("span",{className:"bike-row-main"},
            h("span",{className:"bike-item-icon subtle"},h(PartIcon,{name:itemsOf(row)[0],size:26})),
            h("span",null,h("b",null,itemsOf(row).join(" · ")),
              h("small",null,row.serviced_on+" · "+km(row.odometer_km)))),
          h("span",{className:"bike-row-meta"},h("b",null,row.cost_won==null?"비용 미입력":number(row.cost_won)+"원"),
            h(Icon,{name:"chevron",size:17}))),
        ()=>edit({row}),{className:"bike-row bike-history-row","aria-label":itemsOf(row).join(" · ")+" "+row.serviced_on+" "+(row.cost_won==null?"비용 미입력":number(row.cost_won)+"원")})))
        :h("p",{className:"bike-empty"},user&&!data&&!error?"기록을 읽고 있어요…":"등록된 정비 기록이 없어요."),
      h("div",{className:"bike-links"},
        btn(h(R.Fragment,null,h(Icon,{name:"work",size:18}),"전체 업무 도구 ›"),()=>tool("hub"))),
      vehicleEdit && h(VehicleEditor,{kind:vehicleEdit,user,vehicle,
        close:()=>setVehicleEdit(null),changed}),
      cyclesOpen && h(CyclesEditor,{user,choices,cycles,
        close:()=>setCyclesOpen(false),changed}),
      detailItem && h(ServiceDetail,{item:detailItem,rows,cycles,reading,
        close:()=>setDetailItem(null),edit:row=>edit({row}),add:item=>edit({item})}),
      editor && h(ServiceEditor,{...editor,user,choices,
        close:()=>setEditor(null),changed}));
  }

  return {Income,Bike};
}
