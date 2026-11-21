// Map-first interaction and non-overlap acceptance, using the real browser.
// Local preview proxies unchanged legacy scripts; no production data writes.
const {chromium}=require("playwright");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const origin=process.env.RIDER_MAP_URL||"http://127.0.0.1:8789";
const out="/tmp/riderspot-map-first-ui";
fs.mkdirSync(out,{recursive:true});
const records=[];
function intersect(a,b){
 return Math.min(a.r,b.r)-Math.max(a.l,b.l)>2&&Math.min(a.b,b.b)-Math.max(a.t,b.t)>2;
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try {
 for(const [width,height] of [[320,700],[360,760],[393,844],[412,890],[430,920],[390,520]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,
    timezoneId:"Asia/Seoul",serviceWorkers:"block",permissions:["geolocation"],
    geolocation:{latitude:35.17,longitude:126.83}});
  const page=await context.newPage();const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  const report={width,height,checks:[],errors};
  records.push(report);
  try {
   await page.addInitScript(()=>sessionStorage.setItem("rsMapUiBoots",
     String(Number(sessionStorage.getItem("rsMapUiBoots")||"0")+1)));
   const response=await page.goto(origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
   assert.equal(response.status(),200);
   await page.locator(".rs-map-v2>.rs-map-v2-header").waitFor({timeout:30000});
   await page.locator("#rs-presence-btn").waitFor({state:"attached",timeout:30000});
   await page.waitForTimeout(650);
   assert.equal(await page.locator(".rs-map-v2-actions #rs-sos-fab").count(),1);
   assert.equal(await page.locator(".rs-map-v2-report").count(),1);
   assert.equal(await page.locator(".rs-map-v2-share-chip[role=switch]").count(),1);
   assert.equal(await page.locator(".rs-map-v2 .rs-map-v2-gps").count(),0,
     "duplicate GPS locate button must not exist");
   assert.equal(await page.locator(".rs-map-v2 #rs-demo-toggle:visible").count(),0);
   assert.equal(await page.locator(".rs-map-v2 #rs-report-legend:visible").count(),0,
     "rider help notice cannot overlap legal attribution");
   assert.equal(await page.locator(".rs-map-v2 .rs-gps-state").count(),0,
     "old standalone GPS pill must be gone");
   const geometry=await page.evaluate(()=>{
     const rect=name=>{
       const e=document.querySelector(name);
       if(!e||!e.getClientRects().length||getComputedStyle(e).visibility==="hidden")return null;
       const x=e.getBoundingClientRect();
       return {l:x.left,r:x.right,t:x.top,b:x.bottom,w:x.width,h:x.height};
     };
     return {
       viewport:{width:innerWidth,documentWidth:document.documentElement.scrollWidth},
       top:rect(".rs-map-v2 .rs12-map-commandbar"),
       status:rect(".rs-map-v2-status-row"),
       shareChip:rect(".rs-map-v2-share-chip"),
       statusChip:rect(".rs-map-v2-status-trigger"),
       region:rect(".rs-map-v2 .rs33-region"),
       weather:rect(".rs-map-v2 .rs-weather-slot"),
       settingsButton:rect(".rs-map-v2 .rs12-map-tools-trigger"),
       zoom:rect(".rs-map-v2 .leaflet-control-zoom"),
       locate:rect(".rs-map-v2 .locate"),
       report:rect(".rs-map-v2-report>summary"),
       help:rect(".rs-map-v2-actions #rs-sos-fab"),
       attribution:rect(".rs-map-v2 .leaflet-control-attribution"),
       ride:rect(".nearby.nearby-full .ride-launch"),
       nav:rect(".bottom-nav")
     };
   });
   assert.ok(geometry.viewport.documentWidth<=width+2,"horizontal page overflow");
   for(const [name,r] of Object.entries(geometry)){
     if(!r||name==="viewport")continue;
     assert.ok(r.l>=-2&&r.r<=width+2,"offscreen "+name+" "+JSON.stringify(r));
   }
   for(const [a,b] of [["top","status"],["top","zoom"],["status","zoom"],
     ["shareChip","statusChip"],
     ["zoom","locate"],["report","help"],["report","attribution"],
     ["help","attribution"],["report","locate"],["help","locate"]]){
     if(geometry[a]&&geometry[b])
       assert.ok(!intersect(geometry[a],geometry[b]),a+"/"+b+" overlap "+JSON.stringify(geometry));
   }
   assert.ok(geometry.shareChip && geometry.statusChip && geometry.locate,
     "sharing, personal status and the sole locate control must be visible");
   assert.ok(geometry.status.l<=geometry.shareChip.l+1&&geometry.status.r>=geometry.statusChip.r-1,
     "status row must contain exactly two complete chips");
   assert.ok(geometry.top.w>width-28 && geometry.top.h<=54,
     "map command bar must be a compact full-width unified surface");
   assert.ok(geometry.region && geometry.weather && geometry.settingsButton,
     "region, weather and layer icon must belong to one command surface");
   assert.ok(geometry.report.h>=44&&geometry.help.h>=44,"minimum action targets");
   const sources=page.locator(".rs-map-v2 .leaflet-control-attribution");
   await sources.waitFor({state:"visible",timeout:12000});
   assert.ok((await sources.locator("a[href]").count())>0,"map provider attribution links retained");
   report.geometry=geometry;report.checks.push("map action dock, source credits, location and demo");
   if(height>560) {
     await page.locator(".rs-map-v2-settings>summary").click();
     const settings=page.locator(".rs-map-v2-settings");
     assert.equal(await settings.evaluate(x=>x.open),true);
     assert.equal(await settings.locator(".rs12-layer-options button").count(),3);
     assert.equal(await settings.locator(".rs12-share-control").count(),0,
       "sharing is controlled at top status row");
     await settings.locator("summary").click();
   }
   await page.locator(".rs-map-v2-status-trigger").click();
   const panel=page.locator("body>#rs-presence-panel.rs-map-v2-presence-sheet:not([hidden])");
   await panel.waitFor({timeout:10000});
   assert.equal(await panel.locator("[data-rs-presence-code]").count(),5);
   assert.equal(await panel.getAttribute("aria-modal"),"true");
   assert.equal(await page.locator(".rs-map-v2-status-scrim:not([hidden])").count(),1);
   assert.equal(await panel.evaluate(x=>getComputedStyle(x).position),"fixed");
   await page.screenshot({path:out+"/status-"+width+"x"+height+".png",fullPage:false});
   await panel.locator(".rs-presence-close").click();
   await panel.waitFor({state:"hidden"});
   report.checks.push("modal sheet with 5 preserved options, scrim, close");
   await page.locator(".rs-map-v2-report>summary").click();
   const reportMenu=page.locator(".rs-map-v2-report");
   assert.equal(await reportMenu.evaluate(x=>x.open),true);
   assert.equal(await reportMenu.locator("button").count(),2);
   assert.match(await reportMenu.innerText(),/도로 상황 제보/);
   assert.match(await reportMenu.innerText(),/편의시설 등록/);
   await reportMenu.locator("summary").click();
   await page.screenshot({path:out+"/map-"+width+"x"+height+".png",fullPage:false});
   report.checks.push("report menu two routes");
   if(width===393){
     await page.locator(".rs-map-v2-report>summary").click();
     await page.locator(".rs-map-v2-report").getByRole("button",{name:"편의시설 등록"}).click();
     const sheet=page.getByRole("dialog",{name:"편의시설 등록"});
     await sheet.waitFor({timeout:12000});
     await sheet.getByRole("button",{name:"상세 닫기"}).click();
     await page.locator(".rs-map-v2-actions #rs-sos-fab").click();
     await page.waitForFunction(()=>window.__rsNavigation?.tab==="tools",{timeout:12000});
     report.checks.push("real facility modal and SOS composition route");
   }
   assert.equal(await page.evaluate(()=>Number(sessionStorage.getItem("rsMapUiBoots"))),1,
     "full page reload is not acceptable");
   assert.deepEqual(errors,[],"No JavaScript page errors");
   report.passed=true;
   console.log("MAP_FIRST_PASS "+JSON.stringify(report));
  } catch(error){
    report.failed=String(error?.stack||error).slice(0,2800);
    try {await page.screenshot({path:out+"/FAILED-"+width+"x"+height+".png",fullPage:false});}catch{}
    console.error("MAP_FIRST_FAIL "+JSON.stringify(report));throw error;
  } finally {await context.close();}
 }
 }finally{
   await browser.close();
   fs.writeFileSync(out+"/report.json",JSON.stringify(records,null,2)+"\n");
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
