// Presentation-only map control enhancements. No location watchers or trip state.
import { iconMarkup } from "./ui.mjs";

const iconForStatus={none:"status-none",chat:"status-chat",working:"status-working",break:"status-break",help:"status-help"};
function enhance(){
  const panel=document.getElementById("rs-presence-panel");
  if(panel && panel.dataset.rsPolished!=="1"){
    panel.dataset.rsPolished="1";
    const kicker=panel.querySelector(".rs-presence-heading span");
    if(kicker)kicker.textContent="라이더 상태";
    const subtitle=panel.querySelector(".rs-presence-heading p");
    if(subtitle)subtitle.textContent="지도에 표시할 내 상태를 선택하세요";
    for(const row of panel.querySelectorAll("[data-rs-presence-code]")){
      const name=iconForStatus[row.dataset.rsPresenceCode];
      const emoji=row.querySelector(".rs-presence-emoji");
      if(name && emoji)emoji.innerHTML=iconMarkup(name,19);
    }
    // Preserve the legacy status saving and visibility rules.
    const heading=panel.querySelector(".rs-presence-heading");
    if(heading){
      let start=0;
      heading.addEventListener("touchstart",e=>{start=e.changedTouches[0]?.clientY||0},{passive:true});
      heading.addEventListener("touchend",e=>{
        const delta=(e.changedTouches[0]?.clientY||0)-start;
        if(delta>85 && !panel.hidden)panel.querySelector(".rs-presence-close")?.click();
      },{passive:true});
    }
  }
  const report=document.querySelector(".rs-map-report");
  const settings=document.querySelector(".rs12-map-settings");
  for(const element of [report,settings]){
    if(!element || element.dataset.rsDetailsPolished==="1")continue;
    element.dataset.rsDetailsPolished="1";
    element.addEventListener("toggle",()=>{
      if(!element.open)return;
      for(const other of [report,settings])if(other&&other!==element)other.open=false;
      if(panel && !panel.hidden)panel.querySelector(".rs-presence-close")?.click();
    });
  }
}
function closePopovers(event){
  const panel=document.getElementById("rs-presence-panel");
  const trigger=document.getElementById("rs-presence-btn");
  if(panel && !panel.hidden && !panel.contains(event.target) && !trigger?.contains(event.target))
    panel.querySelector(".rs-presence-close")?.click();
  for(const menu of document.querySelectorAll(".rs-map-report[open],.rs12-map-settings[open]")){
    if(!menu.contains(event.target))menu.open=false;
  }
}
function boot(){
  enhance();
  // Observe only structural changes, not every GPS attribute update.
  const observer=new MutationObserver(mutations=>{
    if(mutations.some(item=>item.addedNodes.length))enhance();
  });
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener("pointerdown",closePopovers,{capture:true});
  document.addEventListener("keydown",event=>{
    if(event.key!=="Escape")return;
    closePopovers({target:null});
  });
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
else boot();
