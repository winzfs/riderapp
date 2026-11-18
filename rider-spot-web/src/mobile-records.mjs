import { rs33ISO } from "./timeline-dates.mjs";
import scooter from "./scooter.svg";
import { icons } from "./ui.mjs";
import { maintenanceIcon } from "./maintenance-icons.mjs";
import { standardParts, itemsOf, composeServiceItems, normalizePart, serviceRows, serviceBaseline, serviceDue } from "./maintenance-model.mjs";

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
  const PartIcon = ({name,size=28}) => h("span",{className:"bike-part-svg",style:{width:size,height:size,...maintenanceIcon(name)},"aria-hidden":true});
  function Sheet({title, date, close, save, submit, children, subtitle, leading, action, detail=false,footerExtra=null}) {
    const [error, setError] = R.useState("");
    const [busy, setBusy] = R.useState(false);
    const lock = R.useRef(false), surface = R.useRef(null);
    const drag = R.useRef(null), closing = R.useRef(false), closeTimer = R.useRef(null);
    const closeRef = R.useRef(close);
    closeRef.current = close;
    const dismiss = (force = false) => {
      if (lock.current && !force) return false;
      if (closing.current) return true;
      closing.current = true;
      const node = surface.current, panel = node?.querySelector(".record-sheet");
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      if (!panel || reduced) { closeRef.current(); return true; }
      node.classList.add("rs-record-exiting");
      panel.style.transition = "transform 190ms cubic-bezier(.22,.85,.28,1), opacity 170ms ease";
      panel.style.transform = "translate3d(0,110%,0)";
      panel.style.opacity = "0.86";
      closeTimer.current = window.setTimeout(() => closeRef.current(), 190);
      return true;
    };
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
        if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
        if (node.open) node.close();
        if (--openRecordSheets === 0) document.body.style.overflow = originalBodyOverflow;
      };
    }, []);
    R.useEffect(() => {
      // Every detail/form is a nested history layer, including Android Back.
      if (window.__rsNavigation)
        return window.__rsNavigation.registerLayer("record-sheet", () => dismiss());
      // Graceful fallback when an older web bundle loads without the controller.
      const marker = crypto.randomUUID();
      history.pushState({...history.state, recordSheet:marker}, "");
      const back = () => {
        const dialogs = [...document.querySelectorAll("dialog.record-surface[open]")];
        if (history.state?.recordSheet !== marker && dialogs.at(-1) === surface.current)
          dismiss();
      };
      window.addEventListener("popstate", back);
      return () => {
        window.removeEventListener("popstate", back);
        if (history.state?.recordSheet === marker) history.back();
      };
    }, []);
    const dragStart = event => {
      if (!event.isPrimary || event.button !== 0 || event.target.closest?.("button,input,textarea")) return;
      // CSS sheet entrance uses animation-fill-mode:both. End its transform ownership
      // as soon as the user grabs the sheet so the panel follows every pointer move.
      surface.current?.classList.add("rs-record-interactive");
      drag.current = {pointer:event.pointerId,startX:event.clientX,startY:event.clientY,
        lastY:event.clientY,lastAt:performance.now(),distance:0};
      event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const dragMove = event => {
      const g = drag.current;
      if (!g || g.pointer !== event.pointerId || closing.current) return;
      const distance = Math.max(0,event.clientY-g.startY);
      if (distance < 4 || distance < Math.abs(event.clientX-g.startX)*1.1) return;
      const panel = surface.current?.querySelector(".record-sheet");
      if (!panel) return;
      g.distance = distance;
      g.velocity = (event.clientY-g.lastY)/Math.max(8,performance.now()-g.lastAt);
      g.lastY=event.clientY;
      g.lastAt=performance.now();
      panel.style.transition = "none";
      panel.style.transform = "translate3d(0,"+Math.min(distance,innerHeight*.72)+"px,0)";
      if (event.cancelable) event.preventDefault();
    };
    const dragEnd = event => {
      const g = drag.current;
      if (!g || g.pointer !== event.pointerId) return;
      drag.current = null;
      const distance = Math.max(0,event.clientY-g.startY);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      if (distance > 105 || (distance > 48 && (g.velocity||0) > .72)) {
        dismiss();
        return;
      }
      const panel = surface.current?.querySelector(".record-sheet");
      if (panel) {
        panel.style.transition = "transform 310ms cubic-bezier(.18,1.12,.3,1)";
        panel.style.transform = "";
      }
    };
    const dragCancel = () => {
      drag.current = null;
      const panel = surface.current?.querySelector(".record-sheet");
      if (panel && !closing.current) {
        panel.style.transition = "transform 260ms cubic-bezier(.18,1,.3,1)";
        panel.style.transform = "";
      }
    };
    const heading = h("div", {className:"record-heading",
      onPointerDown:dragStart,onPointerMove:dragMove,onPointerUp:dragEnd,onPointerCancel:dragCancel},
      h("span",{className:"record-grab", "aria-hidden":true}),
      h("div",{className:"record-heading-label"},
        h("span",{className:"record-heading-title"},leading || null,h("strong",null,title)),
        subtitle && h("small",null,subtitle)),
      btn(h("svg",{viewBox:"0 0 24 24",width:22,height:22,fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round","aria-hidden":true},
        h("path",{d:"M5 5 19 19M19 5 5 19"})),dismiss,
        {className:"record-close","aria-label":"닫기",disabled:busy}));
    const footer = detail ? (action && h("footer",null,btn(action.label,action.onClick,{className:"record-primary"}))) :
      h("footer",null,error && h("p",{role:"alert"},error),
        h("button",{className:"record-primary",type:"submit",disabled:busy},busy?"저장 중…":submit),footerExtra));
    const props = {className:"record-sheet"};
    if (!detail) props.onSubmit = async event => {
      event.preventDefault();
      if (lock.current) return;
      lock.current = true; setBusy(true); setError("");
      try {
        await save(new FormData(event.currentTarget));
        dismiss(true);
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

  // Compact top-layer editor for actions that must never share the workshop footer.
  function MiniDialog({title,close,children,busy=false}) {
    const node=R.useRef(null),closeRef=R.useRef(close),busyRef=R.useRef(busy);
    closeRef.current=close;busyRef.current=busy;
    R.useLayoutEffect(()=>{
      const dialog=node.current,viewport=window.visualViewport;
      dialog.showModal();
      // Keep the compact editor inside Android's visible area when Gboard opens.
      const size=()=>{
        dialog.style.height=(viewport?.height||innerHeight)+"px";
        dialog.style.top=(viewport?.offsetTop||0)+"px";
      };
      size();
      viewport?.addEventListener("resize",size);
      viewport?.addEventListener("scroll",size);
      return ()=>{
        viewport?.removeEventListener("resize",size);
        viewport?.removeEventListener("scroll",size);
        if(dialog.open)dialog.close();
      };
    },[]);
    R.useEffect(()=>{
      if(!window.__rsNavigation)return;
      return window.__rsNavigation.registerLayer("record-mini",()=>{
        if(busyRef.current)return false;
        closeRef.current();return true;
      });
    },[]);
    const dismiss=()=>{if(!busyRef.current)closeRef.current();};
    return h("dialog",{ref:node,className:"record-mini-dialog","aria-label":title,
      onCancel:event=>{event.preventDefault();dismiss();},
      onClick:event=>{if(event.target===event.currentTarget)dismiss();}},
      h("div",{className:"record-mini-card"},
        h("header",{className:"record-mini-head"},h("h3",null,title),
          btn("×",dismiss,{className:"record-mini-close","aria-label":"창 닫기",disabled:busy})),
        children));
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
    const [deleteConfirm,setDeleteConfirm]=R.useState(false);
    const [deleting,setDeleting]=R.useState(false);
    const [deleteError,setDeleteError]=R.useState("");
    const deleteLock=R.useRef(false);
    const deleteRecord=async()=>{
      if(deleteLock.current||!row?.id)return;
      deleteLock.current=true;setDeleting(true);setDeleteError("");
      try {
        const deleted=await read(client.from("maintenance_logs").delete()
          .eq("id",row.id).eq("user_id",user.id).select("id"));
        if(!Array.isArray(deleted)||!deleted.some(record=>record.id===row.id))
          throw Error("삭제할 기록이 없어요. 목록을 다시 확인해 주세요.");
        changed({deletedId:row.id});
        setDeleteConfirm(false);close();
      }catch(err){setDeleteError(err?.message||"기록을 삭제하지 못했어요. 다시 시도해 주세요.");}
      finally{deleteLock.current=false;setDeleting(false);}
    };
    const selectedKeys = new Set(selected.map(x=>normalizePart(x).toLocaleLowerCase("ko-KR")));
    const partButton = name => btn(h(R.Fragment,null,
        h(PartIcon,{name,size:40}),
        h("span",{className:"record-part-name"},name),
        selectedKeys.has(normalizePart(name).toLocaleLowerCase("ko-KR")) &&
          h("span",{className:"record-part-check","aria-hidden":true},h(Icon,{name:"check",size:13}))),
      () => select(current => current.includes(name) ? current.filter(x=>x!==name) : [...current,name]),
      {key:name,className:"record-part", "aria-pressed":selected.includes(name),"aria-label":name});
    return h(R.Fragment,null,h(Sheet,{title:row?"정비 기록 수정":"정비 기록",subtitle:"교환한 부품을 선택하세요",close,
      footerExtra:row&&btn("정비 기록 삭제",()=>setDeleteConfirm(true),
        {className:"record-delete-open","aria-label":"정비 기록 삭제"}),
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
          next_due_km:row?.next_due_km??null,
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
        h("label",null,"메모",h("textarea",{name:"note",maxLength:500,rows:3,defaultValue:row?.note||""})))),
      deleteConfirm && h(MiniDialog,{title:"정비 기록을 삭제할까요?",close:()=>setDeleteConfirm(false),busy:deleting},
        h("p",{className:"record-mini-description"},
          itemsOf(row).join(" · ")+" · "+row.serviced_on+" 기록을 삭제합니다. 삭제 후 복구할 수 없어요."),
        deleteError && h("p",{className:"record-cycle-error",role:"alert"},deleteError),
        h("div",{className:"record-mini-actions"},
          btn("취소",()=>setDeleteConfirm(false),{className:"record-mini-cancel",disabled:deleting}),
          btn(deleting?"삭제 중…":"기록 삭제",deleteRecord,
            {className:"record-mini-delete",disabled:deleting}))));

  }

  function ServiceDetail({item,rows,cycles,reading,close,edit,add,user,changed}) {
    const [cycleEditing,setCycleEditing]=R.useState(false);
    const [cycleSaving,setCycleSaving]=R.useState(false);
    const [cycleError,setCycleError]=R.useState("");
    const [localCycle,setLocalCycle]=R.useState(null);
    const cycleLock=R.useRef(false);
    const historyRows = serviceRows(rows,item);
    const recent = historyRows[0], baseline = serviceBaseline(rows,item);
    const cycle = localCycle || cycles.find(c=>c.item_key===item);
    const due = serviceDue(baseline,cycle,reading?.[0]);
    const metric = (label,value) => h("div",{className:"record-detail-metric",key:label},
      h("small",null,label),h("strong",null,value));
    const dueText = due.next==null ? (cycle?.interval_days ? number(cycle.interval_days)+"일 기준" : "주기 미설정") : km(due.next);
    const parseInterval = (form,key,max) => {
      const raw=String(form.get(key)||"").trim();
      if(!raw)return null;
      if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)<1||Number(raw)>max)
        throw Error(key==="interval_km"?"교체 거리는 1~999,999 km로 입력해 주세요.":"교체 기간은 1~3,650일로 입력해 주세요.");
      return Number(raw);
    };
    const saveCycle = async event => {
      event.preventDefault();
      if(cycleLock.current)return;
      cycleLock.current=true;setCycleSaving(true);setCycleError("");
      try {
        const form=new FormData(event.currentTarget);
        const distance=parseInterval(form,"interval_km",999999);
        const days=parseInterval(form,"interval_days",3650);
        // Clearing both fields resets an existing cycle; an unset cycle does not need a DB write.
        if(distance!=null||days!=null||cycle) {
          await read(client.from("rider_maintenance_cycles").upsert([{
            user_id:user.id,item_key:item,interval_km:distance,interval_days:days
          }],{onConflict:"user_id,item_key"}).select("item_key"));
        }
        setLocalCycle({item_key:item,interval_km:distance,interval_days:days});
        setCycleEditing(false);
        changed();
      } catch(err){
        setCycleError(err?.message||"교체 주기를 저장하지 못했어요. 다시 시도해 주세요.");
      } finally {
        cycleLock.current=false;setCycleSaving(false);
      }
    };
    return h(R.Fragment,null,h(Sheet,{title:item+" 관리",detail:true,leading:h(PartIcon,{name:item,size:30}),
      subtitle:"교환 시점과 정비 이력을 확인하세요",close,
      action:{label:historyRows.length?"이 부품 정비 기록 추가":"첫 정비 기록 남기기",onClick:()=>add(item)}},
      h("div",{className:"record-detail-summary"},
        metric("최근 교환일",recent?.serviced_on || "이력 없음"),
        metric("최근 교환 거리",baseline ? km(baseline.odometer_km) : "거리 미입력"),
        metric("다음 교환 예정",dueText)),
      due.remaining!=null && h("p",{className:"record-due-status bike-state-"+due.state},
        due.state==="overdue" ? "교체 기준 "+number(-due.remaining)+" km 초과" :
        due.state==="soon" ? "교체 기준까지 "+number(due.remaining)+" km 남음" :
        "교체 기준까지 "+number(due.remaining)+" km 남음"),
      h("section",{className:"record-cycle-panel","aria-label":item+" 교체 주기"},
        h("div",{className:"record-cycle-heading"},
          h("strong",null,"교체 주기"),
          btn(cycle?.interval_km||cycle?.interval_days?"주기 수정":"주기 설정",()=>{
            if(cycleSaving)return;
            setCycleEditing(true);setCycleError("");
          },{className:"record-cycle-edit","aria-haspopup":"dialog",disabled:cycleSaving})),
        h("div",{className:"record-cycle-values"},
          h("span",null,"거리 ",h("b",null,cycle?.interval_km?number(cycle.interval_km)+" km":"미설정")),
          h("span",null,"기간 ",h("b",null,cycle?.interval_days?number(cycle.interval_days)+"일":"미설정"))),
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
          h("p",null,"첫 정비 기록을 남기면 여기서 바로 확인할 수 있어요."))),
      cycleEditing && h(MiniDialog,{title:item+" 교체 주기",close:()=>setCycleEditing(false),busy:cycleSaving},
        h("form",{className:"record-mini-form",onSubmit:saveCycle},
          h("p",{className:"record-mini-description"},"이 부품의 교체 간격만 설정합니다. 새 정비 기록은 생성되지 않아요."),
          field("교체 거리 (km)",{name:"interval_km",type:"number",inputMode:"numeric",
            min:1,max:999999,step:1,placeholder:"예: 40000",defaultValue:cycle?.interval_km??"",disabled:cycleSaving}),
          field("교체 기간 (일)",{name:"interval_days",type:"number",inputMode:"numeric",
            min:1,max:3650,step:1,placeholder:"선택 사항",defaultValue:cycle?.interval_days??"",disabled:cycleSaving}),
          h("p",{className:"record-cycle-note"},"거리 또는 기간 중 하나만 입력해도 돼요. 둘 다 비우면 주기가 해제됩니다."),
          cycleError&&h("p",{className:"record-cycle-error",role:"alert"},cycleError),
          h("div",{className:"record-mini-actions"},
            btn("취소",()=>setCycleEditing(false),{className:"record-mini-cancel",disabled:cycleSaving}),
            h("button",{className:"record-cycle-save",type:"submit",disabled:cycleSaving},
              cycleSaving?"저장 중…":"교체 주기 저장")))));
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

  function Bike({user,login,profile}) {
    const [data,setData] = R.useState(null),[error,setError]=R.useState(""),[revision,refresh]=R.useState(0);
    const [editor,setEditor]=R.useState(null),[detailItem,setDetailItem]=R.useState(null);
    const [vehicleEdit,setVehicleEdit]=R.useState(null);
    const changed = payload => {
      if (payload?.deletedId) setData(current => current ? {
        ...current,rows:current.rows.filter(row=>row.id!==payload.deletedId)
      } : current);
      else if (payload?.id) setData(current => current ? {
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
        h("h2",null,"소모품 현황")),
      h("div",{className:"bike-consumables","aria-label":"소모품 현황"},
        choices.map(item=>{
          const row=serviceBaseline(rows,item), cycle=cycles.find(c=>c.item_key===item);
          const due=serviceDue(row,cycle,reading?.[0]);
          // Keep detailed mileage/date in the existing detail sheet, not on the compact tile.
          const status=due.remaining!=null ?
            (due.state==="overdue"?"기준 "+number(-due.remaining)+" km 초과":number(due.remaining)+" km 남음") :
            !row?"기록 없음":
            due.next!=null?"다음 "+km(due.next):
            cycle?.interval_km&&row.odometer_km==null?"거리 미입력":
            cycle?.interval_days?number(cycle.interval_days)+"일 주기":"주기 미설정";
          return btn(h(R.Fragment,null,
            h("span",{className:"bike-tile-icon"},h(PartIcon,{name:item,size:46})),
            h("span",{className:"bike-tile-name"},item),
            h("span",{className:"bike-tile-status bike-state-"+due.state},status)),
          ()=>user?setDetailItem(item):login(),
          {key:item,className:"bike-consumable bike-tile","aria-label":item+" 관리"}); 
        })),
      h("div",{className:"bike-heading bike-history-head"},
        h("h2",null,h(Icon,{name:"history",size:19}),"전체 정비 이력"),
        h("small",null,rows.length+"건")),
      rows.length ? rows.map((row,i)=>h(R.Fragment,{key:row.id},
        (!i||rows[i-1].serviced_on?.slice(0,7)!==row.serviced_on?.slice(0,7)) &&
          h("h3",null,row.serviced_on.slice(0,7).replace("-","년 ")+"월"),
        btn(h(R.Fragment,null,
          h("span",{className:"bike-row-main"},
            h("span",{className:"bike-item-icon subtle"},h(PartIcon,{name:itemsOf(row)[0],size:36})),
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
      detailItem && h(ServiceDetail,{key:detailItem,item:detailItem,rows,cycles,reading,user,changed,
        close:()=>setDetailItem(null),edit:row=>edit({row}),add:item=>edit({item})}),
      editor && h(ServiceEditor,{...editor,user,choices,
        close:()=>setEditor(null),changed}));
  }

  return {Income,Bike};
}
