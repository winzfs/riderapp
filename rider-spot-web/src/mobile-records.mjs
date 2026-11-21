import { rs33ISO } from "./timeline-dates.mjs";
import {saveIncomeDay,financeWriteError} from "./finance-storage.mjs";
import scooter from "./scooter.svg";
import { bikeArtSource } from "./bike-model-art.mjs";
import { icons } from "./ui.mjs";
import { maintenanceIcon } from "./maintenance-icons.mjs";
import {bikeModels,bikeBrands,findBikeModel,inferBikeModel,modelLabel,modelParts,
  modelDefaults,resolveMaintenance,costLabel,won} from "./bike-model-catalog.mjs";
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
  const PartIcon = ({name,size=28}) => h("span",{className:"bike-part-svg","data-graphic-version":"neo-flat-original-v197",style:{width:size,height:size,...maintenanceIcon(name)},"aria-hidden":true});
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
        h("button",{className:"record-primary",type:"submit",disabled:busy},busy?"저장 중…":submit),footerExtra);
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
        try{
          await saveIncomeDay(client,{userId:user.id,day,draft,previous:values});
          refresh(n=>n+1);
        }catch(error){
          throw Error(financeWriteError(error));
        }
      }},platforms.map((p,i)=>field(p+" (원)",{key:p,name:p,inputMode:"numeric",enterKeyHint:i?"done":"next",placeholder:"미입력",value:draft[p]===""?"":number(draft[p]),
        onKeyDown:event=>{if(!i && event.key==="Enter"){event.preventDefault();event.target.form.elements.namedItem(platforms[1]).focus();}},
        onChange:event=>{const digits=event.target.value.replace(/,/g,""); if(/^\d{0,9}$/.test(digits)&&Number(digits)<=100000000) edit({...draft,[p]:digits});}}))));
  }

  function ServiceEditor({row,item,choices,user,close,changed,model}) {
    const [selected,select] = R.useState(() => row ? itemsOf(row) : item ? [item] : []);
    const [customOpen,setCustomOpen] = R.useState(false);
    const [customName,setCustomName] = R.useState("");
    const [customError,setCustomError] = R.useState("");
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
    const customParts = selected.filter(name=>!standardParts.includes(name));
    const addCustomPart = () => {
      const name=normalizePart(customName);
      if(name.length<2||name.length>40){setCustomError("부품명을 2~40자로 입력해 주세요.");return;}
      const combined=composeServiceItems([...selected,name]);
      select(combined);
      setCustomOpen(false);setCustomName("");setCustomError("");
    };
    const suggestion = !row && selected.length===1 ? modelDefaults(model,selected[0]):null;
    const partButton = name => btn(h(R.Fragment,null,
        h(PartIcon,{name,size:40}),
        h("span",{className:"record-part-name"},name),
        selectedKeys.has(normalizePart(name).toLocaleLowerCase("ko-KR")) &&
          h("span",{className:"record-part-check","aria-hidden":true},h(Icon,{name:"check",size:13}))),
      () => select(current => current.includes(name) ? current.filter(x=>x!==name) : [...current,name]),
      {key:name,className:"record-part", "aria-pressed":selected.includes(name),"aria-label":name});
    return h(R.Fragment,null,h(Sheet,{title:row?"정비 기록 수정":"정비 기록",close,
      footerExtra:row&&btn("정비 기록 삭제",()=>setDeleteConfirm(true),
        {className:"record-delete-open","aria-label":"정비 기록 삭제"}),
      submit:row?"변경사항 저장":"정비 기록 저장",save:async form=>{
        const items = composeServiceItems(selected);
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
        h("legend",null,"교환 부품",h("small",null,"복수 선택")),
        btn("＋ 기타 부품",()=>{setCustomError("");setCustomOpen(true);},
          {className:"record-custom-trigger","aria-label":"기타 부품 추가"}),
        h("div",{className:"record-parts-grid"},standardParts.filter(name=>choices.includes(name)).map(partButton)),
        customParts.length>0&&h("div",{className:"record-custom-chips","aria-label":"추가한 기타 부품"},
          customParts.map(name=>btn(name+" ×",()=>select(current=>current.filter(x=>x!==name)),
            {key:name,className:"record-custom-chip","aria-label":name+" 제거"})))),
      h("div",{className:"record-pair record-measures"},
        field("계기판 거리 (km)",{type:"text",inputMode:"numeric",name:"km",placeholder:"미입력",
          defaultValue:row?.odometer_km??"",autoComplete:"off"}),
        field("총비용 (원)",{type:"text",inputMode:"numeric",name:"cost",
          placeholder:suggestion?.estimated_cost_won?number(suggestion.estimated_cost_won)+"원 (참고)":"미입력",
          defaultValue:row?.cost_won??"",autoComplete:"off"})),
      suggestion && h("p",{className:"record-help"},
        "정비 예상 비용: "+costLabel({...suggestion,source:"default"})+" · 실제 지불한 금액만 저장하세요."),
      h("details",{className:"record-extra",open:row?.workshop||row?.note?true:undefined},
        h("summary",null,"정비소 · 메모",h(Icon,{name:"chevron",size:17})),
        field("정비소",{name:"shop",maxLength:100,defaultValue:row?.workshop||""}),
        h("label",null,"메모",h("textarea",{name:"note",maxLength:500,rows:3,defaultValue:row?.note||""})))),
      customOpen && h(MiniDialog,{title:"기타 부품 추가",close:()=>setCustomOpen(false)},
        h("p",{className:"record-mini-description"},"목록에 없는 부품만 입력하세요. 추가한 부품은 정비 기록에 함께 저장됩니다."),
        h("label",{className:"record-custom-field"},"부품명",
          h("input",{type:"text",value:customName,maxLength:40,autoComplete:"off",autoFocus:true,
            placeholder:"예: 미션오일",onChange:event=>{setCustomName(event.target.value);setCustomError("");},
            onKeyDown:event=>{if(event.key==="Enter"){event.preventDefault();addCustomPart();}}})),
        customError && h("p",{role:"alert",className:"record-cycle-error"},customError),
        h("div",{className:"record-mini-actions"},
          btn("취소",()=>setCustomOpen(false),{className:"record-mini-cancel"}),
          btn("추가",addCustomPart,{className:"record-cycle-save"}))),
      deleteConfirm && h(MiniDialog,{title:"정비 기록을 삭제할까요?",close:()=>setDeleteConfirm(false),busy:deleting},
        h("p",{className:"record-mini-description"},
          itemsOf(row).join(" · ")+" · "+row.serviced_on+" 기록을 삭제합니다. 삭제 후 복구할 수 없어요."),
        deleteError && h("p",{className:"record-cycle-error",role:"alert"},deleteError),
        h("div",{className:"record-mini-actions"},
          btn("취소",()=>setDeleteConfirm(false),{className:"record-mini-cancel",disabled:deleting}),
          btn(deleting?"삭제 중…":"기록 삭제",deleteRecord,
            {className:"record-mini-delete",disabled:deleting}))));

  }

  function ServiceDetail({item,rows,cycles,model,modelSettings,explicitModel,reading,close,edit,add,user,changed}) {
    const [cycleEditing,setCycleEditing]=R.useState(false);
    const [cycleSaving,setCycleSaving]=R.useState(false);
    const [cycleError,setCycleError]=R.useState("");
    const [localCycle,setLocalCycle]=R.useState(null);
    const cycleLock=R.useRef(false);
    const historyRows = serviceRows(rows,item);
    const recent = historyRows[0], baseline = serviceBaseline(rows,item);
    const cycle = localCycle || resolveMaintenance(model,item,modelSettings,cycles,explicitModel)
      || cycles.find(c=>c.item_key===item);
    const modelDefault = modelDefaults(model,item);
    const due = serviceDue(baseline,cycle,reading?.[0]);
    const metric = (label,value) => h("div",{className:"record-detail-metric",key:label},
      h("small",null,label),h("strong",null,value));
    const dueText = due.next!=null ? km(due.next) :
      cycle?.interval_km ? "교환 거리 미입력" :
      cycle?.interval_days ? number(cycle.interval_days)+"일 기준" : "주기 미설정";
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
        const priceRaw=String(form.get("estimated_cost_won")??"").replace(/,/g,"").trim();
        if(priceRaw && (!/^\d+$/.test(priceRaw)||!Number.isSafeInteger(Number(priceRaw))||Number(priceRaw)>2000000))
          throw Error("예상 비용은 0~2,000,000원 사이로 입력해 주세요.");
        const price=priceRaw===""?null:Number(priceRaw);
        if(model) {
          await read(client.from("rider_model_maintenance_settings").upsert([{
            user_id:user.id,model_key:model.key,item_key:item,interval_km:distance,
            interval_days:days,estimated_cost_won:price
          }],{onConflict:"user_id,model_key,item_key"}).select("item_key"));
        } else if(distance!=null||days!=null||cycle) {
          await read(client.from("rider_maintenance_cycles").upsert([{
            user_id:user.id,item_key:item,interval_km:distance,interval_days:days
          }],{onConflict:"user_id,item_key"}).select("item_key"));
        }
        setLocalCycle({item_key:item,model_key:model?.key,
          interval_km:distance,interval_days:days,
          estimated_cost_won:price,source:model?"personal":"legacy"});
        setCycleEditing(false);
        changed();
      } catch(err){
        setCycleError(err?.message||"교체 주기를 저장하지 못했어요. 다시 시도해 주세요.");
      } finally {
        cycleLock.current=false;setCycleSaving(false);
      }
    };
    return h(R.Fragment,null,h(Sheet,{title:item+" 관리",detail:true,leading:h(PartIcon,{name:item,size:30}),
      close,
      action:{label:"＋ 부품 기록",onClick:()=>add(item)}},
      h("div",{className:"record-detail-summary"},
        metric("최근 교환일",recent?.serviced_on || "이력 없음"),
        metric("최근 교환 거리",baseline ? km(baseline.odometer_km) : "거리 미입력"),
        metric("다음 교환 예정",dueText)),
      due.remaining!=null && h("p",{className:"record-due-status bike-state-"+due.state},
        due.state==="overdue" ? "교체 기준 "+number(-due.remaining)+" km 초과" :
        due.state==="soon" ? "교체 기준까지 "+number(due.remaining)+" km 남음" :
        "교체 기준까지 "+number(due.remaining)+" km 남음"),
      h("section",{className:"record-cycle-panel","aria-label":item+" 교체 주기"},
        model && h("p",{className:"bike-model-default-hint"},
          cycle?.source==="personal"?"내가 설정한 정비 기준":
          cycle?.interval_source==="manual"?"제조사 설명서 기준 · 연식 확인":
          "배달 운행 참고 기준 · 정비 상태를 먼저 확인하세요"),
        h("div",{className:"record-cycle-heading"},
          h("strong",null,"추천 점검·교체 주기"),
          btn(cycle?.interval_km||cycle?.interval_days?"주기 수정":"주기 설정",()=>{
            if(cycleSaving)return;
            setCycleEditing(true);setCycleError("");
          },{className:"record-cycle-edit","aria-haspopup":"dialog",disabled:cycleSaving})),
        h("p",{className:"bike-safety-message"},"거리 기준은 예상치입니다. 실제 마모·균열·제동 상태와 설명서를 먼저 확인하세요."),
        h("div",{className:"record-cycle-values"},
          h("span",null,"거리 ",h("b",null,cycle?.interval_km?number(cycle.interval_km)+" km":"미설정")),
          h("span",null,"기간 ",h("b",null,cycle?.interval_days?number(cycle.interval_days)+"일":"미설정"))),
        model && modelDefault?.interval_km && h("p",{className:"bike-reference-cycle"},
          "모델 기본 추천: "+number(modelDefault.interval_km)+" km"+
          (modelDefault.interval_source==="manual"?" · 제조사 설명서 참고":" · 일반 점검 참고값"),
          cycle?.source==="personal"?" · 내 설정을 우선 적용 중":"")),
      model && h("section",{className:"bike-model-cost","aria-label":item+" 예상 교체 비용"},
        h("div",{className:"bike-model-cost-heading"},h("strong",null,"예상 교체 비용"),
          h("small",null,cycle?.source==="personal"?"내 설정":"국내 정비소 참고 시세")),
        h("b",null,costLabel(cycle)),
        h("p",null,"부품·공임 포함 추정치이며 실제 견적과 다를 수 있어요.")),
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
          h("p",{className:"record-mini-description"},"이 부품의 교체 간격과 예상 비용만 설정합니다. 정비 기록에는 영향을 주지 않아요."),
          field("교체 거리 (km)",{name:"interval_km",type:"number",inputMode:"numeric",
            min:1,max:999999,step:1,placeholder:"예: 40000",defaultValue:cycle?.interval_km??"",disabled:cycleSaving}),
          field("교체 기간 (일)",{name:"interval_days",type:"number",inputMode:"numeric",
            min:1,max:3650,step:1,placeholder:"선택 사항",defaultValue:cycle?.interval_days??"",disabled:cycleSaving}),
          model && field("예상 교체 비용 (원)",{name:"estimated_cost_won",type:"number",
            inputMode:"numeric",min:0,max:2000000,step:1000,
            placeholder:"예상 비용",defaultValue:cycle?.estimated_cost_won??"",disabled:cycleSaving}),
          h("p",{className:"record-cycle-note"},
            model ? "교환 기준과 예상 비용은 이 모델에만 적용돼요. 실제 교체 여부는 부품 상태와 설명서를 확인하세요." :
            "거리 또는 기간 중 하나만 입력해도 돼요. 둘 다 비우면 주기가 해제됩니다."),
          cycleError&&h("p",{className:"record-cycle-error",role:"alert"},cycleError),
          h("div",{className:"record-mini-actions"},
            btn("취소",()=>setCycleEditing(false),{className:"record-mini-cancel",disabled:cycleSaving}),
            h("button",{className:"record-cycle-save",type:"submit",disabled:cycleSaving},
              cycleSaving?"저장 중…":model?"주기·비용 저장":"교체 주기 저장")),
          model && cycle?.source==="personal" && btn("모델 기본값으로 복원",async()=>{
            if(cycleLock.current)return;
            cycleLock.current=true;setCycleSaving(true);setCycleError("");
            try{
              const removed=await read(client.from("rider_model_maintenance_settings").delete()
                .eq("user_id",user.id).eq("model_key",model.key).eq("item_key",item)
                .select("item_key"));
              if(!Array.isArray(removed)||!removed.some(x=>x.item_key===item))
                throw Error("복원할 설정을 찾지 못했어요.");
              setLocalCycle(modelDefaults(model,item));
              setCycleEditing(false);changed();
            }catch(e){setCycleError(e?.message||"기본값을 복원하지 못했어요.");}
            finally{cycleLock.current=false;setCycleSaving(false);}
          },{className:"bike-model-reset",disabled:cycleSaving}))));
  }

  function ModelPicker({user,vehicle,cycles,settings,close,changed}) {
    const [query,setQuery]=R.useState("");
    const [custom,setCustom]=R.useState(false);
    const [customName,setCustomName]=R.useState(vehicle?.vehicle_name||"");
    const [brand,setBrand]=R.useState("all");
    const [busy,setBusy]=R.useState(false);
    const [error,setError]=R.useState("");
    const lock=R.useRef(false);
    const currentModel=findBikeModel(vehicle?.model_key)||inferBikeModel(vehicle?.vehicle_name);
    const cleaned=value=>String(value||"").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g,"");
    const term=cleaned(query);
    const available=bikeModels.filter(m=>(brand==="all"||m.brand===brand)&&
      (!term||cleaned(m.brandLabel+" "+m.name+" "+m.aliases.join(" ")).includes(term)));
    const saveCustom=async()=>{
      const name=customName.trim();
      if(!name||name.length>40){setError("차량명을 1~40자로 입력해 주세요.");return;}
      if(lock.current)return;
      lock.current=true;setBusy(true);setError("");
      try{
        const record={user_id:user.id,vehicle_name:name,model_key:null};
        await read(client.from("rider_vehicle_profiles").upsert(record,
          {onConflict:"user_id"}).select("user_id").single());
        changed();close();
      }catch(err){setError(err?.message||"차량 이름을 저장하지 못했어요.");}
      finally{lock.current=false;setBusy(false);}
    };
    const choose=async model=>{
      if(lock.current)return;
      lock.current=true;setBusy(true);setError("");
      try {
        // Preserve pre-catalog personal intervals under the OLD model. Never
        // overwrite/delete the historic global cycles or service entries.
        const legacyModel=!vehicle?.model_key && inferBikeModel(vehicle?.vehicle_name);
        const previous=legacyModel&&cycles.filter(c=>
          (c.interval_km!=null || c.interval_days!=null) &&
          !settings.some(x=>x.model_key===legacyModel.key&&x.item_key===c.item_key))
          .map(c=>({user_id:user.id,model_key:legacyModel.key,item_key:c.item_key,
            interval_km:c.interval_km,interval_days:c.interval_days,
            estimated_cost_won:modelDefaults(legacyModel,c.item_key)?.estimated_cost_won??null}));
        if(previous?.length)await read(client.from("rider_model_maintenance_settings")
          .upsert(previous,{onConflict:"user_id,model_key,item_key",ignoreDuplicates:true})
          .select("item_key"));
        await read(client.from("rider_vehicle_profiles")
          .upsert({user_id:user.id,vehicle_name:modelLabel(model),model_key:model.key},
            {onConflict:"user_id"}).select("user_id").single());
        changed();close();
      }catch(e){setError(e?.message||"모델을 저장하지 못했어요. 다시 시도해 주세요.");}
      finally{lock.current=false;setBusy(false);}
    };
    return h(MiniDialog,{title:"바이크 모델 선택",close,busy},
      h("div",{className:"bike-model-picker"},
        h("p",{className:"record-mini-description"},
          "모델을 선택하면 기본 정비 주기와 예상 비용이 표시됩니다. 기존 기록과 계기판은 유지됩니다."),
        h("div",{className:"bike-model-filters"},
          h("input",{type:"search",value:query,onChange:e=>setQuery(e.target.value),
            placeholder:"예: PCX125, NMAX, UHR125",autoComplete:"off","aria-label":"모델 검색"}),
          h("select",{value:brand,onChange:e=>setBrand(e.target.value),"aria-label":"제조사 필터"},
            h("option",{value:"all"},"전체 제조사"),
            bikeBrands.map(b=>h("option",{key:b.key,value:b.key},b.name)))),
        h("div",{className:"bike-model-count"},available.length+"개 모델"),
        h("div",{className:"bike-model-list",role:"listbox","aria-label":"선택할 바이크 모델"},
          available.map(m=>btn(h(R.Fragment,null,
            bikeArtSource(m)&&h("img",{className:"bike-model-option-art",src:bikeArtSource(m),alt:"",width:110,height:66,loading:"lazy",decoding:"async","aria-hidden":true}),
            h("span",{className:"bike-model-list-name"},h("b",null,m.name),
              h("small",null,m.brandLabel+" · "+m.cc+"cc"+(m.kind==="electric"?" · 전기":""))),
            currentModel?.key===m.key&&h("span",{className:"bike-model-selected"},"선택됨")),
            ()=>choose(m),{key:m.key,className:"bike-model-option",
              "aria-label":modelLabel(m)+" 선택","aria-selected":currentModel?.key===m.key,
              disabled:busy})),
          !available.length&&h("p",{className:"record-help"},"일치하는 모델이 없어요. 아래에서 직접 입력해 주세요.")),
        error&&h("p",{role:"alert",className:"record-cycle-error"},error),
        busy&&h("p",{className:"record-cycle-note"},"모델 설정을 저장하는 중…"),
        !custom?btn("목록에 없는 차량 직접 입력",()=>setCustom(true),
          {className:"bike-model-custom",disabled:busy}):
          h("div",{className:"bike-model-custom-editor"},
            h("label",null,"차량명",
              h("input",{type:"text",maxLength:40,value:customName,
                onChange:e=>setCustomName(e.target.value),"aria-label":"차량명"})),
            btn("차량명 저장",saveCustom,{className:"bike-model-custom-save",disabled:busy})),
        ));
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
        // Absolute manual correction supersedes earlier unfinished syncs.
        await read(client.rpc("set_rider_manual_odometer",{p_km:distance}));
        window.dispatchEvent(new Event("riderspot:odometer-retry"));
        changed();
        return;
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
          h("p",{className:"record-help"},"직접 입력한 계기판 숫자가 우선합니다. 이전 운행을 나중에 중복 합산하지 않아요."))
      : h(R.Fragment,null,
          field("차량명",{name:"vehicle_name",type:"text",required:true,maxLength:40,
            placeholder:"예: PCX125",defaultValue:vehicle?.vehicle_name||""}),
          h("p",{className:"record-help"},"차량명만 바꾸면 기존 계기판 거리와 입력일은 유지됩니다.")));
  }

  function Bike({user,login,profile}) {
    const [data,setData] = R.useState(null),[error,setError]=R.useState(""),[revision,refresh]=R.useState(0);
    const [editor,setEditor]=R.useState(null),[detailItem,setDetailItem]=R.useState(null);
    const [vehicleEdit,setVehicleEdit]=R.useState(null);
    const [modelPicker,setModelPicker]=R.useState(false);
    const [showAllHistory,setShowAllHistory]=R.useState(false);
    const changed = payload => {
      if (payload?.deletedId) setData(current => current ? {
        ...current,rows:current.rows.filter(row=>row.id!==payload.deletedId)
      } : current);
      else if (payload?.id) setData(current => current ? {
        ...current,rows:serviceRows([
          {...(current.rows.find(row=>row.id===payload.id)||{created_at:new Date().toISOString()}),...payload},
          ...current.rows.filter(row=>row.id!==payload.id)])
      } : current);
      window.dispatchEvent(new CustomEvent("riderspot:finance-changed",{detail:{userId:user.id}}));
      refresh(n=>n+1);
    };
    R.useEffect(()=>{
      if(!user)return;
      const reload=()=>refresh(n=>n+1);
      const financeReload=e=>{if(e?.detail?.userId===user.id)reload();};
      window.addEventListener("riderspot:odometer-updated",reload);
      window.addEventListener("riderspot:finance-changed",financeReload);
      return ()=>{window.removeEventListener("riderspot:odometer-updated",reload);
        window.removeEventListener("riderspot:finance-changed",financeReload);};
    },[user?.id]);
    R.useEffect(()=>{
      let active=true; setError("");
      if(user){
        const table=name=>client.from(name).select("*").eq("user_id",user.id);
        Promise.all([pages(()=>table("maintenance_logs").order("serviced_on",{ascending:false}).order("created_at",{ascending:false}).order("id")),
          read(table("rider_vehicle_profiles").maybeSingle()),read(table("rider_maintenance_cycles")),
          read(table("rider_fuel_logs").not("odometer_km","is",null).order("fueled_on",{ascending:false}).order("created_at",{ascending:false}).limit(1)),
          read(table("rider_model_maintenance_settings"))])
          .then(([rows,vehicle,cycles,fuel,modelSettings])=>{
            if(active)setData({rows:serviceRows(rows),vehicle,cycles,fuel:fuel[0],modelSettings});
          })
          .catch(()=>{if(active)setError("정비 이력을 불러오지 못했어요.");});
      }
      return ()=>{active=false;};
    },[user?.id,revision]);
    R.useEffect(()=>{
      const pending=window.__rsFinanceMaintenance;
      if(!user||!data||!pending||pending.userId!==user.id)return;
      // Resolve by original record UUID after the bike view finishes loading.
      const record=data.rows.find(row=>row.id===pending.id);
      window.__rsFinanceMaintenance=null;
      if(!record)return;
      if(pending.mode==="edit")setEditor({row:record});
      else setDetailItem(itemsOf(record)[0]||record.item);
    },[user?.id,data]);
    const rows=data?.rows||[],vehicle=data?.vehicle,cycles=data?.cycles||[];
    const modelSettings=data?.modelSettings||[];
    const model=findBikeModel(vehicle?.model_key)||inferBikeModel(vehicle?.vehicle_name);
    const explicitModel=!!vehicle?.model_key;
    const defaults=model?modelParts(model):standardParts;
    const effectiveCycle=item=>resolveMaintenance(model,item,modelSettings,cycles,explicitModel)
      ||cycles.find(c=>c.item_key===item);
    const choices=[...new Set([...defaults,...rows.flatMap(itemsOf),
      ...(!explicitModel?cycles.map(c=>c.item_key):[]),
      ...modelSettings.filter(x=>x.model_key===model?.key).map(x=>x.item_key)])];
    const latest=rows.find(r=>r.odometer_km!=null),fuel=data?.fuel;
    const historyReadings=[[latest?.odometer_km,latest?.serviced_on],[fuel?.odometer_km,fuel?.fueled_on]]
      .filter(([distance,date])=>distance!=null&&date).sort((a,b)=>b[1].localeCompare(a[1])||b[0]-a[0]);
    const manual=vehicle?.odometer_km!=null;
    const reading=manual?[vehicle.odometer_km,vehicle.odometer_recorded_on||"입력일 미기록"]:historyReadings[0];
    const tool=name=>window.__rsOpenTool?.(name);
    const edit=value=>user?setEditor(value):login();
    const vehicleAction=kind=>user?setVehicleEdit(kind):login();
    const urgentParts=choices.map(item=>{
      const row=serviceBaseline(rows,item),cycle=effectiveCycle(item);
      const due=serviceDue(row,cycle,reading?.[0]);
      return {item,remaining:due.remaining,state:due.state};
    }).filter(x=>x.state==="overdue"||x.state==="soon");
    return h("section",{className:"bike-page page narrow"},
      h("div",{className:"bike-heading"},
        h("h1",null,"내 바이크"),
        btn(h(R.Fragment,null,h(Icon,{name:"settings",size:17}),"프로필·설정"),profile,
          {className:"bike-quiet-action","aria-label":"프로필·설정"})),
      h("section",{className:"rs6-garage-stage rs8-bike-hero"},
        h("div",{className:"bike-vehicle rs8-bike-feature"},
          h("div",{className:"bike-vehicle-data"},
            h("span",{className:"rs8-bike-kicker"},"내 차고"),
            h("h2",null,vehicle?.vehicle_name||"내 오토바이"),
            h("span",{className:"rs8-odo-label"},"현재 계기판"),
            h("strong",{className:"bike-distance"},
              reading?.[0]==null?"거리 미입력":h(R.Fragment,null,
                h("span",null,number(reading[0]))," ",h("small",null,"km"))),
            h("small",{className:"rs8-odo-updated"},reading?.[1]||"입력일 미기록",
              !manual&&reading?" · 정비·주유 기록 기준":"")),
          bikeArtSource(model)
            ?h("img",{className:"bike-vehicle-art",src:bikeArtSource(model),
              alt:modelLabel(model)+" 바이크 이미지",width:1100,height:660,decoding:"async"})
            :h("img",{className:"bike-vehicle-art",src:scooter,alt:"기본 스쿠터 일러스트",width:130,height:82})),
        h("div",{className:"rs8-bike-feature-bottom"},
          h("span",null,model?modelLabel(model):"모델 미설정"),
          h("details",{className:"rs8-bike-settings"},
            h("summary",null,"차량 설정"),
            h("div",{className:"bike-vehicle-actions bike-vehicle-tools"},
              btn(h(R.Fragment,null,h(Icon,{name:"gauge",size:18}),"계기판 입력"),
                ()=>vehicleAction("odometer"),
                {className:"bike-outline-action","aria-label":"계기판 입력",disabled:!!user&&!data}),
              btn(h(R.Fragment,null,h(Icon,{name:"edit",size:18}),"모델 선택"),
                ()=>user?setModelPicker(true):login(),
                {className:"bike-outline-action","aria-label":"모델 선택",disabled:!!user&&!data})))),
        h("div",{className:"bike-actions rs8-quickservice"},
          btn(h(R.Fragment,null,h(Icon,{name:"shops",size:19}),"정비 기록"),
            ()=>edit({}),{className:"record-primary",disabled:!!user&&!data,"aria-label":"＋ 정비 기록"}),
          btn(h(R.Fragment,null,h(Icon,{name:"fuel",size:19}),"주유 기록"),
            ()=>{window.__rsFinanceAction="fuel";window.__rsGoToTab?.("earnings");}))),
      !!urgentParts.length&&h("aside",{className:"rs8-service-alerts",role:"status"},
        h("div",{className:"rs8-alerts-head"},
          h("strong",null,"점검 필요"),
          h("span",null,urgentParts.length+"개 소모품")),
        h("div",{className:"rs8-alerts-items"},
          urgentParts.map(({item,state})=>
            btn(h(R.Fragment,null,item,h("span",null,state==="overdue"?"교체 주기 초과":"교체 임박")),
              ()=>user?setDetailItem(item):login(),
              {key:item,className:"rs8-alert-chip","aria-label":item+" 관리 열기"})))),
      error && h("p",{role:"alert"},error,btn("다시 조회",changed)),
      h("section",{className:"rs6-service-board"},
      h("div",{className:"bike-section-head"},
        h("h2",null,"소모품"),h("small",{className:"rs6-service-count"},choices.length+"개 관리 중")),
      h("details",{className:"bike-safety-detail"},
        h("summary",null,"교체 기준 안내"),
        h("p",{className:"bike-safety-message"},
          model ? "추천 주기는 참고값입니다. 실제 마모 상태와 제조사 설명서를 확인하세요." :
            "일반 125cc 참고 주기입니다. 모델 및 실제 부품 상태를 확인하세요.")),
      h("div",{className:"bike-consumables","aria-label":"소모품 현황"},
        choices.map(item=>{
          const row=serviceBaseline(rows,item), cycle=effectiveCycle(item);
          const due=serviceDue(row,cycle,reading?.[0]);
          const status=due.remaining!=null ?
            (due.state==="overdue"?number(-due.remaining)+" km 초과":number(due.remaining)+" km 남음") :
            row?"거리 미입력":"기록 없음";
          return btn(h(R.Fragment,null,
            h("span",{className:"bike-tile-icon"},h(PartIcon,{name:item,size:46})),
            h("span",{className:"bike-tile-name"},item),
            h("span",{className:"bike-tile-status bike-state-"+due.state},status)),
          ()=>user?setDetailItem(item):login(),
          {key:item,className:"bike-consumable bike-tile","aria-label":item+" 관리"}); 
        })),
      ),
      h("section",{className:"rs6-history-board"},
      h("div",{className:"bike-heading bike-history-head"},
        h("h2",null,h(Icon,{name:"history",size:19}),"정비 이력"),
        h("small",null,rows.length+"건 · 최신순")),
      rows.length ? (showAllHistory?rows:rows.slice(0,3)).map((row,i)=>h(R.Fragment,{key:row.id},
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
      rows.length>3&&btn(showAllHistory?"이력 접기":"정비 이력 "+(rows.length-3)+"건 더 보기",
        ()=>setShowAllHistory(v=>!v),{className:"bike-history-more","aria-expanded":showAllHistory}),
      ),
      vehicleEdit && h(VehicleEditor,{kind:vehicleEdit,user,vehicle,
        close:()=>setVehicleEdit(null),changed}),
      modelPicker && h(ModelPicker,{user,vehicle,cycles,settings:modelSettings,
        close:()=>setModelPicker(false),changed}),
      detailItem && h(ServiceDetail,{key:detailItem,item:detailItem,rows,cycles,model,
        modelSettings,explicitModel,reading,user,changed,
        close:()=>setDetailItem(null),edit:row=>edit({row}),add:item=>edit({item})}),
      editor && h(ServiceEditor,{...editor,user,model,choices,
        close:()=>setEditor(null),changed}));
  }

  return {Income,Bike};
}
