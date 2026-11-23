/* RiderSpot / timeline map action placement (v4)
 * Proxy preserves the existing React image-export handler. No state/data writes.
 * Original source button stays in DOM, hidden only when a route map exists.
 */
(function installTimelineLayoutV4(win) {
  "use strict";
  if (!win || win.__rsTimelineLayoutV4) return;
  win.__rsTimelineLayoutV4 = "4.0";
  const doc=win.document;
  let queued=false;
  let lastScan=0;
  let delayed=null;

  function attach(overview) {
    if (!overview?.isConnected) return;
    const original=overview.querySelector(":scope > .rs12-map-heading .rs12-recap-action");
    const toolbar=overview.querySelector(":scope > .rs56-day-course .rs12-route-actions");
    if (!original || !toolbar) return;
    // When React eventually ships this arrangement natively, do not duplicate it.
    if (toolbar.querySelector(".rs12-recap-action:not(.rs-tl-save-proxy)")) return;

    let save=toolbar.querySelector(".rs-tl-save-proxy");
    if (!save) {
      save=doc.createElement("button");
      save.type="button";
      save.className="rs-tl-save-proxy";
      save.title="라이딩 이미지 저장";
      const glyph=doc.createElement("span");
      glyph.className="rs-tl-save-glyph";
      glyph.setAttribute("aria-hidden","true");
      glyph.textContent="↗";
      const title=doc.createElement("span");
      title.textContent="저장";
      save.append(glyph,title);
      save.addEventListener("click",event=>{
        event.preventDefault();
        event.stopPropagation();
        // Always locate the current date's button, not a stale closure.
        const section=save.closest(".rs11-route-first");
        const target=section?.querySelector(":scope > .rs12-map-heading .rs12-recap-action");
        if (!target || !target.isConnected || target.disabled) return;
        target.click();
      });
      toolbar.appendChild(save);
    }
    const label=original.getAttribute("aria-label") || "라이딩 이미지 저장";
    if (save.getAttribute("aria-label")!==label)save.setAttribute("aria-label",label);
    if (save.disabled!==original.disabled)save.disabled=original.disabled;
  }
  function scan(){
    queued=false;
    delayed=null;
    lastScan=Date.now();
    if (!doc.querySelector(".rs33-timeline")) return;
    doc.querySelectorAll(".rs33-timeline .rs11-route-first").forEach(attach);
  }
  function schedule(){
    if (queued || delayed!==null) return;
    const elapsed=Date.now()-lastScan;
    if(elapsed<300) {
      delayed=win.setTimeout(()=>{
        delayed=null;
        if(!queued){queued=true;win.requestAnimationFrame(scan);}
      },300-elapsed);
    } else {
      queued=true;win.requestAnimationFrame(scan);
    }
  }
  function init(){
    scan();
    const observer=new MutationObserver(schedule);
    observer.observe(doc.body,{subtree:true,childList:true});
    win.addEventListener("riderspot:screen",schedule);
    win.addEventListener("riderspot:tab-restored",schedule);
  }
  if(doc.readyState==="loading")doc.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})(typeof window==="undefined"?null:window);
