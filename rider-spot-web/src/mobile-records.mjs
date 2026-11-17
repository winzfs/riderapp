import { rs33ISO } from "./timeline-dates.mjs";
import scooter from "./scooter.svg";

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
      h("header",null,h("h2",null,title),btn("닫기",dismiss,{disabled:busy})),
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

  function Bike({user,login,profile}) {
    const [data,setData]=R.useState(null),[error,setError]=R.useState(""),[revision,refresh]=R.useState(0);
    const [editor,setEditor]=R.useState(null),[filter,setFilter]=R.useState("");
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
    const readings=[[vehicle?.odometer_km,vehicle?.updated_at && rs33ISO(vehicle.updated_at)],[latest?.odometer_km,latest?.serviced_on],[fuel?.odometer_km,fuel?.fueled_on]]
      .filter(([v,d])=>v!=null&&d).sort((a,b)=>b[1].localeCompare(a[1])||b[0]-a[0]);
    const visible=rows.filter(row=>!filter||itemsOf(row).includes(filter));
    const tool=name=>window.__rsOpenTool?.(name);
    const edit=value=>user?setEditor(value):login();
    return h("section",{className:"bike-page page narrow"},
      h("div",{className:"bike-heading"},h("h1",null,"내 바이크"),btn("프로필·설정 ›",profile)),
      h("div",{className:"bike-vehicle"},h("div",null,h("h2",null,vehicle?.vehicle_name||"내 오토바이"),h("small",null,"마지막 계기판"),h("strong",null,readings.length?km(readings[0][0]):"거리 미입력"),h("small",null,readings[0]?.[1]||"계기판 기록 없음")),h("img",{src:scooter,alt:"",width:130,height:82})),
      h("div",{className:"bike-actions"},btn("＋ 정비 기록",()=>edit({}),{className:"record-primary",disabled:!!user&&!data}),btn("주유 기록",()=>tool("fuel"))),
      error && h("p",{role:"alert"},error,btn("다시 조회",changed)),
      h("h2",null,"소모품 현황"),choices.map(item=>{
        const row=rows.find(r=>itemsOf(r).includes(item));
        const interval=cycles.find(c=>c.item_key===item)?.interval_km;
        return btn(h(R.Fragment,null,h("b",null,item),h("span",null,row?km(row.odometer_km):"교환 기록 없음",h("small",null,row?.serviced_on),
          interval && row?.odometer_km!=null?h("small",null,"다음 "+km(Number(interval)+Number(row.odometer_km))):null),"›"),()=>setFilter(filter===item?"":item),{key:item,className:"bike-row","aria-pressed":filter===item});
      }),
      h("div",{className:"bike-heading",ref:historyHeading,style:{scrollMarginTop:"64px"}},h("h2",null,filter?filter+" 이력":"정비 이력"),filter&&btn("전체 보기",()=>setFilter(""))),
      filter&&btn("＋ "+filter+" 교환 기록",()=>edit({item:filter}),{className:"bike-add"}),
      visible.length?visible.map((row,i)=>h(R.Fragment,{key:row.id},(!i||visible[i-1].serviced_on.slice(0,7)!==row.serviced_on.slice(0,7))&&h("h3",null,row.serviced_on.slice(0,7).replace("-","년 ")+"월"),
        btn(h(R.Fragment,null,h("span",null,h("b",null,itemsOf(row).join(" · ")),h("small",null,row.serviced_on+" · "+km(row.odometer_km))),h("b",null,row.cost_won==null?"비용 미입력":number(row.cost_won)+"원"),"›"),()=>edit({row}),{className:"bike-row"}))):h("p",null,user&&!data&&!error?"기록을 읽고 있어요…":"등록된 정비 기록이 없어요."),
      h("div",{className:"bike-links"},btn("차량·교체 주기 관리 ›",()=>tool("maintenance")),btn("전체 업무 도구 ›",()=>tool("hub"))),
      editor && h(ServiceEditor,{...editor,user,choices,close:()=>setEditor(null),changed}));
  }
  return {Income,Bike};
}
