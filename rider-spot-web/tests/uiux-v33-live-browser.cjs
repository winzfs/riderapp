const {chromium}=require("playwright");
const fs=require("node:fs");
const assert=require("node:assert/strict");
const origin=process.env.RIDER_VISUAL_URL;
if(!origin)throw Error("RIDER_VISUAL_URL is required");
(async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const widths=[320,360,390,412],labels=["지도","타임라인","동네","수익","내 바이크"];
 fs.mkdirSync("/tmp/rider-uiux-v33-live",{recursive:true});
 try{
  for(const width of widths){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,
    timezoneId:"Asia/Seoul",serviceWorkers:"block",
    permissions:["geolocation"],geolocation:{latitude:35.17,longitude:126.83}});
   const page=await context.newPage(),errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   const res=await page.goto(origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
   assert.equal(res.status(),200);
   const tabs=page.locator(".bottom-nav button");
   await tabs.first().waitFor({timeout:30000});
   assert.equal(await tabs.count(),5,"five tabs preserved");
   const html=await page.content();
   assert.ok(html.includes("rs-recovery-guard-v217"),"Android recovery guard retained");
   for(let i=0;i<5;i++){
    await tabs.nth(i).click();
    const data=await page.evaluate(()=>({
      width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,
      selected:document.querySelectorAll(".bottom-nav button.active").length
    }));
    assert.equal(data.selected,1,labels[i]+" active state");
    assert.ok(data.scroll<=width+3&&data.body<=width+3,labels[i]+" overflows "+JSON.stringify(data));
    if(i===1)await page.locator(".rs33-timeline").waitFor({timeout:10000});
    if(i===2)await page.locator(".rc-community").first().waitFor({timeout:10000});
    if(i===3)await page.locator(".finance-page").waitFor({timeout:10000});
    if(i===4){
      const board=page.locator(".bike-consumables.rs11-service-list");
      await board.waitFor({timeout:10000});
      const style=await board.evaluate(el=>({display:getComputedStyle(el).display,
        columns:getComputedStyle(el).gridTemplateColumns.split(" ").length}));
      assert.equal(style.display,"grid","3x2 board: display");
      assert.equal(style.columns,3,"3x2 board: columns");
    }
    if(width===390)await page.screenshot({path:"/tmp/rider-uiux-v33-live/"+labels[i]+".png"});
   }
   assert.deepEqual(errors,[],"JS errors on "+width+"px");
   console.log("UIUX_V33_LIVE_BROWSER_PASS",width,labels.join(","));
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
