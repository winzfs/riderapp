// Map-first UI adapter. Only external legacy-owned nodes are relocated.
// React owns the map chips/actions. This adapter never touches React children,
// GPS listeners, route state, camera, user settings or the auth client.
import { iconMarkup } from "./ui.mjs";

const statusIcon={
  none:"status-none",chat:"status-chat",working:"status-working",
  break:"status-break",help:"status-help",
};
let nativeButton=null, statusPanel=null, backdrop=null, panelObserver=null;
let sheetOpen=false, priorFocus=null, appInert=null, unregisterNavigation=null;
const mapTrigger=()=>document.querySelector(".rs-map-v2-status-trigger");

function getBackdrop(){
  if(backdrop?.isConnected)return backdrop;
  backdrop=document.createElement("div");
  backdrop.className="rs-map-v2-status-scrim";
  backdrop.hidden=true;
  backdrop.setAttribute("aria-hidden","true");
  backdrop.addEventListener("click",closeStatus);
  document.body.append(backdrop);
  return backdrop;
}
function closeStatus(){
  if(statusPanel&&!statusPanel.hidden)
    statusPanel.querySelector(".rs-presence-close")?.click();
}
function clearLayer(){
  if(!sheetOpen)return;
  sheetOpen=false;
  backdrop && (backdrop.hidden=true);
  document.body.classList.remove("rs-map-v2-sheet-open");
  const app=document.querySelector(".app");
  if(app&&appInert!==null)app.inert=appInert;
  appInert=null;
  unregisterNavigation?.();
  unregisterNavigation=null;
  if(priorFocus?.isConnected)priorFocus.focus({preventScroll:true});
  priorFocus=null;
}
function syncStatus(){
  const visible=!!statusPanel?.isConnected&&!statusPanel.hidden&&!!nativeButton?.isConnected;
  const chip=mapTrigger();
  if(chip&&nativeButton){
    chip.title=nativeButton.textContent?.trim()||"내 상태 설정";
    chip.setAttribute("aria-expanded",String(visible));
  }
  if(visible===sheetOpen)return;
  if(!visible){clearLayer();return;}
  priorFocus=chip||document.activeElement;
  // One active overlay: close map layers, reports and other map sheets.
  document.querySelectorAll(".rs-map-v2-settings[open],.rs-map-v2-report[open]")
    .forEach(details=>{details.open=false;});
  document.querySelector(".rs-sheet-backdrop .close")?.click();
  getBackdrop().hidden=false;
  const app=document.querySelector(".app");
  appInert=app?.inert??false;
  if(app)app.inert=true;
  document.body.classList.add("rs-map-v2-sheet-open");
  sheetOpen=true;
  unregisterNavigation=window.__rsNavigation?.registerLayer?.("presence-sheet",closeStatus)||null;
  statusPanel.querySelector(".rs-presence-close")?.focus({preventScroll:true});
}
function detachOld(){
  clearLayer();
  panelObserver?.disconnect();
  panelObserver=null;
  statusPanel?.remove();
  statusPanel=null;
  nativeButton=null;
}
function enhancePresence(button,panel){
  if(button===nativeButton&&panel===statusPanel)return;
  if(statusPanel&&statusPanel!==panel)detachOld();
  nativeButton=button;
  statusPanel=panel;
  button.classList.add("rs-map-v2-native-trigger");
  button.tabIndex=-1;
  button.setAttribute("aria-hidden","true");
  panel.classList.add("rs-map-v2-presence-sheet");
  panel.setAttribute("aria-modal","true");
  panel.setAttribute("aria-label","내 상태");
  const heading=panel.querySelector(".rs-presence-heading");
  if(heading){
    const kicker=heading.querySelector("span");
    if(kicker)kicker.textContent="라이더 상태";
    const title=heading.querySelector("h2");
    if(title)title.textContent="내 상태";
    const subtitle=heading.querySelector("p");
    if(subtitle)subtitle.textContent="지도에 표시할 내 상태를 선택하세요";
    if(!panel.querySelector(".rs-map-v2-grab")){
      const handle=document.createElement("div");
      handle.className="rs-map-v2-grab";
      handle.setAttribute("aria-hidden","true");
      panel.prepend(handle);
      let startY=0;
      for(const node of [handle,heading]){
        node.addEventListener("touchstart",event=>{
          startY=event.touches[0]?.clientY??0;
        },{passive:true});
        node.addEventListener("touchend",event=>{
          const dy=(event.changedTouches[0]?.clientY??0)-startY;
          if(dy>78&&panel.scrollTop<10)closeStatus();
        },{passive:true});
      }
    }
  }
  for(const row of panel.querySelectorAll("[data-rs-presence-code]")){
    const node=row.querySelector(".rs-presence-emoji");
    const icon=statusIcon[row.dataset.rsPresenceCode];
    if(node&&icon)node.innerHTML=iconMarkup(icon,20);
  }
  // The panel is owned by the legacy adapter, not React. Portal it to body to
  // escape .map-wrap's overflow/stacking context without recreating listeners.
  if(panel.parentElement!==document.body)document.body.append(panel);
  getBackdrop();
  panelObserver?.disconnect();
  panelObserver=new MutationObserver(syncStatus);
  panelObserver.observe(panel,{attributes:true,attributeFilter:["hidden"]});
  syncStatus();
}
function wireMenu(menu){
  if(!menu||menu.dataset.mapV2Wired==="1")return;
  menu.dataset.mapV2Wired="1";
  menu.addEventListener("toggle",()=>{
    if(!menu.open)return;
    const other=menu.matches(".rs-map-v2-report")?
      document.querySelector(".rs-map-v2-settings"):
      document.querySelector(".rs-map-v2-report");
    if(other)other.open=false;
    closeStatus();
  });
}
function enhance(){
  const wrap=document.querySelector(".nearby.nearby-full .map-wrap.rs-map-v2");
  const button=wrap?.querySelector("#rs-presence-btn");
  const newPanel=wrap?.querySelector("#rs-presence-panel");
  // A live status panel is portaled to body; the original button stays inside
  // the map so legacy install() keeps the same instance and saves correctly.
  if(!button&&nativeButton&&!nativeButton.isConnected)detachOld();
  if(button && newPanel)enhancePresence(button,newPanel);
  wireMenu(wrap?.querySelector(".rs-map-v2-report"));
  wireMenu(wrap?.querySelector(".rs-map-v2-settings"));
  if(button&&statusPanel)syncStatus();
}
function closeDetails(event){
  const target=event.target;
  for(const details of document.querySelectorAll(".rs-map-v2-report[open],.rs-map-v2-settings[open]")){
    if(!details.contains(target))details.open=false;
  }
}
function keyboard(event){
  if(event.key==="Escape"){
    if(sheetOpen){
      event.preventDefault();event.stopImmediatePropagation();
      closeStatus();return;
    }
    closeDetails({target:null});
  }
  if(event.key!=="Tab"||!sheetOpen||!statusPanel)return;
  const items=Array.from(statusPanel.querySelectorAll(
    'button:not(:disabled):not([hidden]),a[href],input:not(:disabled),select:not(:disabled)'
  )).filter(item=>item.getClientRects().length>0);
  if(!items.length)return;
  const first=items[0],last=items[items.length-1];
  if(event.shiftKey&&document.activeElement===first){
    event.preventDefault();last.focus();
  } else if(!event.shiftKey&&document.activeElement===last){
    event.preventDefault();first.focus();
  }
}
function boot(){
  const params=new URLSearchParams(window.location.search);
  document.documentElement.classList.toggle("rs-map-qa-mode",params.get("rs_qa")==="1");
  enhance();
  // Once per page, only structural observation. No setInterval/route changes.
  const observer=new MutationObserver(()=>{
    if(nativeButton&&!nativeButton.isConnected)detachOld();
    enhance();
  });
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener("pointerdown",closeDetails,{capture:true});
  document.addEventListener("keydown",keyboard,{capture:true});
  window.addEventListener("riderspot:screen",closeStatus);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
else boot();
