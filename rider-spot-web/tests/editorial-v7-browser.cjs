const {chromium}=require("playwright");
const fs=require("node:fs");
const assert=require("node:assert/strict");
const origin=process.env.RIDER_VISUAL_URL||"https://rider-spot-static-preview.jazzhjm.workers.dev";
const cssPath="/rider-spot-visual-v2-20261121.css";
const report={origin,at:new Date().toISOString(),screens:[],passed:false};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.RIDER_CHROME_CHANNEL||undefined,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  fs.mkdirSync("/tmp/rider-spot-editorial-v7",{recursive:true});
  for(const width of [320,393,412]){
   const ctx=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,
    timezoneId:"Asia/Seoul",serviceWorkers:"block",
    permissions:["geolocation"],geolocation:{latitude:35.17,longitude:126.83}});
   const page=await ctx.newPage();const errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   const row={width,checks:[],errors:[]};report.screens.push(row);
   try{
    await page.addInitScript(()=>sessionStorage.setItem("visualV2Boots",String(Number(sessionStorage.getItem("visualV2Boots")||"0")+1)));
    const r=await page.goto(origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
    assert.equal(r.status(),200);
    const nav=page.locator(".bottom-nav button");
    await nav.first().waitFor({timeout:50000});
    assert.equal(await nav.count(),5);
    const link=page.locator('link[href^="'+cssPath+'"]');
    assert.equal(await link.count(),1,"visual link present once");
    const css=await page.request.get(origin+cssPath,{timeout:20000});
    assert.equal(css.status(),200,"visual stylesheet status");
    assert.equal(css.headers()["x-rs-design"],"editorial-v7-20261121");
    const body=await css.text();
    assert.ok(body.length>12000&&body.includes("EDITORIAL V7"));
    const applied=await page.evaluate(()=>{
      const nav=document.querySelector(".bottom-nav");
      const active=document.querySelector(".bottom-nav button.active");
      return {navBg:getComputedStyle(nav).backgroundColor,
        activeBg:getComputedStyle(active).backgroundImage,
        navTop:getComputedStyle(nav).borderTopColor,
        boots:Number(sessionStorage.getItem("visualV2Boots")),
        cssLoaded:[...document.styleSheets].some(x=>x.href?.includes("rider-spot-visual-v2-20261121.css"))};
    });
    assert.ok(applied.cssLoaded);
    assert.ok(applied.activeBg==="none", "active navigation must not use gradient: "+applied.activeBg);
    assert.equal(await page.locator(".app>header").evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(28, 40, 35)");
    row.checks.push("stylesheet loaded","editorial flat selected state");
    for(let i of [0,1,2,3,4]){
      await nav.nth(i).click();
      await page.waitForTimeout(240);
      const v=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
      assert.ok(v.scroll<=width+2&&v.body<=width+2,"horizontal overflow "+JSON.stringify(v));
      if(i===0){
        const mapbar=page.locator(".rs6-map-stage>.rs33-map-bar");
        await mapbar.waitFor({timeout:12000});
        const mode=await mapbar.evaluate(el=>getComputedStyle(el).position);
        assert.equal(mode,"absolute","map controls must float over live map");
        assert.equal(await page.locator(".rs6-map-stage>.map").count(),1);
        assert.equal(await page.locator(".rs7-map-controls .rs-weather-slot").count(),1,"weather is in the concise first row");
        assert.equal(await page.locator(".rs7-map-controls .rs7-share-chip").count(),1,"sharing remains accessible");
        assert.equal(await page.locator(".rs7-map-controls .rs33-map-filters button[aria-pressed]").count(),3,"all map layer switches remain");
      }
      if(i===1){
        await page.locator(".rs6-timeline-controller").waitFor({timeout:10000});
        const order=await page.evaluate(()=>{
          const recap=document.querySelector(".rs33-timeline .rs-game-recap");
          const map=document.querySelector(".rs33-timeline .rs-renewal-route");
          return {recap:recap?.compareDocumentPosition(map),label:document.querySelector(".rs33-timeline .rs7-map-label")?.innerText};
        });
        if(order.recap!=null)assert.ok(order.recap&4,"Daily recap must precede the route map");
        assert.ok(!document.querySelector(".rs6-timeline-date-title"),"decorative English timeline counter removed");
      }
      if(i===2){
        await page.locator(".rs6-community-deck").waitFor({timeout:10000});
        await page.locator(".rs6-community-feed-head").waitFor();
        const feed=page.locator(".rc-feed-renewal .rc-feed-row");
        if(await feed.count()){
          const style=await feed.first().evaluate(el=>({
            background:getComputedStyle(el).backgroundColor,
            radius:getComputedStyle(el).borderRadius
          }));
          assert.equal(style.radius,"0px","v7 feed must not use rounded cards");
          assert.equal(style.background,"rgba(0, 0, 0, 0)","v7 feed rows must be transparent");
        }
      }
      if(i===3){
        await page.locator(".finance-page").waitFor({timeout:10000});
        const stage=page.locator(".rs6-finance-stage");
        if(await stage.count()){
          assert.equal(await stage.locator(".fin-period").count(),1,"period is INSIDE earnings stage");
          assert.equal(await stage.locator(".fin-quick").count(),1,"edit actions belong to the stage");
          assert.equal(await stage.locator(".rs6-finance-stage-id").count(),0,"decorative English finance label gone");
        }
      }
      if(i===4){
        await page.locator(".rs6-garage-stage").waitFor({timeout:10000});
        assert.equal(await page.locator(".rs6-garage-stage .bike-actions").count(),1);
        assert.equal(await page.locator(".rs6-service-board .bike-consumables").count(),1);
        const grid=await page.locator(".rs6-service-board .bike-consumables").evaluate(el=>getComputedStyle(el).gridTemplateColumns);
        assert.equal(grid.split(" ").length,2,"maintenance must render as redesigned 2-column instruments");
        assert.equal(await page.locator(".rs6-history-board").count(),1);
        assert.equal(await page.locator(".bike-model-banner").count(),0,"duplicated model banner must be gone");
        assert.equal(await page.locator(".bike-vehicle-tools button").count(),2,"vehicle controls remain accessible");
        assert.equal(await page.locator(".rs6-garage-id").count(),0,"decorative numbered badge removed");
      }
      if(width===393) await page.screenshot({path:"/tmp/rider-spot-editorial-v7/"+["map","timeline","community","finance","bike"][i]+".png",fullPage:false});
    }
    assert.equal(await page.evaluate(()=>Number(sessionStorage.getItem("visualV2Boots"))),1);
    assert.deepEqual(errors,[]);
    row.computed=applied;row.checks.push("5 navigation tabs","no overflow","no full reload","no JS page errors");
    row.passed=true;
   }catch(e){row.passed=false;row.error=String(e?.stack||e).slice(0,900)}
   row.errors=errors.slice(0,5);await ctx.close();
   if(!row.passed)break;
  }
  report.passed=report.screens.length===3&&report.screens.every(x=>x.passed);
 }finally{await browser.close()}
})().catch(e=>{report.error=String(e?.stack||e).slice(0,900)})
.finally(()=>{
 fs.writeFileSync("/tmp/rider-spot-editorial-v7/report.json",JSON.stringify(report,null,2)+"\n");
 console.log("RIDER_EDITORIAL_V7_QA "+JSON.stringify(report));
 if(!report.passed)process.exitCode=1;
});