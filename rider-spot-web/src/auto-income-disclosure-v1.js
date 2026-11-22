
/* Native auto-income panel presentation only: no capture, RPC, finance, or GPS changes. */
(function installRiderAutoIncomeDisclosure(win) {
  "use strict";
  if (!win || win.__rsIncomeDisclosureReady) return;
  win.__rsIncomeDisclosureReady = true;
  const PANEL_ID = "rs-native-income-panel-v1";
  const WRAPPER_ID = "rs-auto-income-disclosure-v1";
  const STYLE_ID = "rs-auto-income-disclosure-style-v1";
  const PREF_KEY = "riderspot:auto-income:expanded:v1";
  let pageObserver = null;
  let panelObserver = null;
  let observedPage = null;
  let observedPanel = null;
  const document = win.document;
  const isExpanded = () => {
    try { return win.sessionStorage.getItem(PREF_KEY) === "1"; }
    catch { return false; }
  };
  const remember = value => {
    try { win.sessionStorage.setItem(PREF_KEY, value ? "1" : "0"); }
    catch { /* Private mode */ }
  };
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#" + WRAPPER_ID + "{display:block;margin:12px 0 18px;background:#fff;border:1px solid #e5e9ed;border-radius:15px;overflow:hidden;box-shadow:0 2px 10px rgba(27,45,58,.025);color:#263548}",
      "#" + WRAPPER_ID + ">summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:58px;padding:11px 15px;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent}",
      "#" + WRAPPER_ID + ">summary::-webkit-details-marker{display:none}",
      "#" + WRAPPER_ID + ">summary:focus-visible{outline:2px solid #416FB5;outline-offset:-2px}",
      "#" + WRAPPER_ID + " .rs-auto-fold-main{display:flex;flex-direction:column;gap:5px;min-width:0}",
      "#" + WRAPPER_ID + " .rs-auto-fold-title{font-size:13px;line-height:1.3;font-weight:770;letter-spacing:-.04em;color:#23374e}",
      "#" + WRAPPER_ID + " .rs-auto-fold-meta{font-size:11px;line-height:1.35;color:#788792;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:250px}",
      "#" + WRAPPER_ID + " .rs-auto-fold-right{display:flex;gap:8px;align-items:center;flex:none;font-size:11px;font-weight:700;color:#566b81}",
      "#" + WRAPPER_ID + " .rs-auto-fold-chevron{display:inline-flex;justify-content:center;align-items:center;font-size:16px;transform:rotate(0deg);transition:transform .18s ease;line-height:1}",
      "#" + WRAPPER_ID + "[open] .rs-auto-fold-chevron{transform:rotate(180deg)}",
      "#" + WRAPPER_ID + "[open]>summary{border-bottom:1px solid #eef1f2}",
      "#" + WRAPPER_ID + " #"+PANEL_ID+"{display:block!important;position:static!important;transform:none!important;margin:0!important;padding:15px!important;border:0!important;box-shadow:none!important;border-radius:0!important;background:transparent!important}",
      "#" + WRAPPER_ID + " #"+PANEL_ID+">.rsai-head{display:none!important}",
      "#" + WRAPPER_ID + " #"+PANEL_ID+" .rsai-desc{line-height:1.55}",
      "@media (prefers-reduced-motion:reduce){#" + WRAPPER_ID + " .rs-auto-fold-chevron{transition:none}}"
    ].join("\n");
    document.head.appendChild(style);
  }
  function updateSummary(panel, wrapper) {
    const metadata = wrapper.querySelector(".rs-auto-fold-meta");
    if (!metadata) return;
    const status = panel.querySelector(".rsai-chip")?.textContent?.trim();
    const amount = panel.querySelector(".rsai-value")?.textContent?.trim();
    const details = [status, amount].filter(Boolean).join(" · ");
    metadata.textContent = details || "수집 상태 및 건별 내역";
  }
  function installPanelObserver(panel,wrapper) {
    if (observedPanel===panel && panelObserver) return;
    panelObserver?.disconnect();
    observedPanel=panel;
    panelObserver=new MutationObserver(() => {
      if(!panel.isConnected) { panelObserver?.disconnect();observedPanel=null;return; }
      updateSummary(panel, wrapper);
    });
    panelObserver.observe(panel,{childList:true,subtree:true,characterData:true});
    updateSummary(panel,wrapper);
  }
  function adopt(page) {
    if(!page?.isConnected) return;
    const panel = document.getElementById(PANEL_ID);
    if(!panel || !page.contains(panel)) return;
    ensureStyle();
    let wrapper = document.getElementById(WRAPPER_ID);
    if(!wrapper || !page.contains(wrapper)) {
      wrapper = document.createElement("details");
      wrapper.id=WRAPPER_ID;
      wrapper.open=isExpanded();
      wrapper.setAttribute("aria-label","배달 수익 자동수집 접기 및 펼치기");
      const summary=document.createElement("summary");
      const main=document.createElement("span");
      main.className="rs-auto-fold-main";
      const title=document.createElement("strong");
      title.className="rs-auto-fold-title";
      title.textContent="배달 수익 자동수집";
      const metadata=document.createElement("span");
      metadata.className="rs-auto-fold-meta";
      metadata.textContent="수집 상태 및 건별 내역";
      main.append(title,metadata);
      const right=document.createElement("span");
      right.className="rs-auto-fold-right";
      const indicator=document.createElement("span");
      indicator.className="rs-auto-fold-indicator";
      indicator.textContent=wrapper.open?"접기":"펼치기";
      const chevron=document.createElement("span");
      chevron.className="rs-auto-fold-chevron";
      chevron.setAttribute("aria-hidden","true");
      chevron.textContent="⌄";
      right.append(indicator,chevron);
      summary.append(main,right);
      wrapper.appendChild(summary);
      wrapper.addEventListener("toggle",() => {
        remember(wrapper.open);
        indicator.textContent=wrapper.open?"접기":"펼치기";
      });
    }
    // Android's native module retains the same #PANEL_ID and replaces only its
    // children every few seconds. Keep its full functionality inside <details>.
    if(panel.parentElement!==wrapper) wrapper.appendChild(panel);
    const anchor=page.querySelector(".fin-subnav") || page.querySelector(".fin-page-head");
    if(anchor?.parentElement===page && wrapper.previousElementSibling!==anchor)
      anchor.insertAdjacentElement("afterend",wrapper);
    else if(!wrapper.isConnected) page.prepend(wrapper);
    installPanelObserver(panel,wrapper);
  }
  function syncScreen(){
    const page=document.querySelector(".finance-page");
    if(page!==observedPage){
      pageObserver?.disconnect();
      pageObserver=null;
      observedPage=page;
      panelObserver?.disconnect();
      panelObserver=null;
      observedPanel=null;
      if(page) {
        pageObserver=new MutationObserver(() => adopt(page));
        pageObserver.observe(page,{childList:true});
      }
    }
    if(page) adopt(page);
  }
  const schedule=() => win.requestAnimationFrame(syncScreen);
  win.addEventListener("riderspot:screen",schedule);
  win.addEventListener("riderspot:tab-restored",schedule);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule,{once:true});
  else schedule();
})(typeof window==="undefined"?null:window);
