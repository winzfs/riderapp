const {chromium}=require("playwright");
const fs=require("node:fs");
const assert=require("node:assert/strict");
const origin=process.env.RIDER_VISUAL_URL||"http://127.0.0.1:8840";
const cssPath="/curated-v9.css";
const report={origin,at:new Date().toISOString(),screens:[],passed:false};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.RIDER_CHROME_CHANNEL||undefined,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  fs.mkdirSync("/tmp/rider-spot-urban-flow-v11",{recursive:true});
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
    const link=page.locator('link[href$="'+cssPath+'"]');
    assert.equal(await link.count(),1,"visual link present once");
    const cssHref=await link.first().getAttribute("href");
    const css=await page.request.get(origin+cssHref,{timeout:20000});
    assert.equal(css.status(),200,"visual stylesheet status");
    assert.ok(css.headers()["content-type"]?.includes("css"));
    const body=await css.text();
    assert.ok(body.length>12000&&body.includes("URBAN FLOW v11"));
    const applied=await page.evaluate(()=>{
      const nav=document.querySelector(".bottom-nav");
      const active=document.querySelector(".bottom-nav button.active");
      return {navBg:getComputedStyle(nav).backgroundColor,
        activeBg:getComputedStyle(active).backgroundImage,
        navTop:getComputedStyle(nav).borderTopColor,
        boots:Number(sessionStorage.getItem("visualV2Boots")),
        cssLoaded:[...document.styleSheets].some(x=>x.href?.includes("curated-v9.css"))};
    });
    assert.ok(applied.cssLoaded);
    assert.ok(applied.activeBg==="none", "active navigation must not use gradient: "+applied.activeBg);
    assert.match(await page.locator(".app>header").evaluate(el=>getComputedStyle(el).backgroundColor),/^rgba\(247, 248, 246, 0\.98\d\)$/,"v12 header remains light and opaque");
    row.checks.push("URBAN EDITORIAL v12 stylesheet loaded","editorial flat selected state");
    for(let i of [0,1,2,3,4]){
      await nav.nth(i).click();
      await page.waitForTimeout(240);
      const v=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
      assert.ok(v.scroll<=width+2&&v.body<=width+2,"horizontal overflow "+JSON.stringify(v));
      if(i===0){
        const overlay=page.locator(".rs6-map-stage>.rs8-map-overlay");
        await overlay.waitFor({timeout:12000});
        assert.equal(await overlay.evaluate(x=>getComputedStyle(x).position),"absolute");
        assert.equal(await page.locator(".rs6-map-stage>.map").count(),1);
        assert.equal(await overlay.locator(".rs-weather-slot").count(),1);
        assert.equal(await overlay.locator(".rs11-map-commandbar>.rs8-map-tools").count(),1,"map controls share one real command bar");
        const drawer=overlay.locator(".rs8-map-tools");
        assert.equal(await drawer.evaluate(el=>el.open),false,"tools closed by default");
        await drawer.locator("summary").click();
        assert.equal(await drawer.evaluate(el=>el.open),true);
        assert.equal(await drawer.locator(".rs12-layer-options button").count(),3,"existing 3 exclusive map layers retained");
         const privacy=drawer.locator(".rs12-share-control[role=switch]");
         assert.equal(await privacy.count(),1,"privacy is separate from layer controls");
         assert.equal(await privacy.getAttribute("aria-checked"),"false","location remains private in the anonymous fixture");
        const bounds=await drawer.locator(".rs33-map-filters").evaluate(el=>({
          parent:el.getBoundingClientRect().toJSON(),
          children:[...el.querySelectorAll("button")].map(x=>x.getBoundingClientRect().toJSON())
        }));
        assert.ok(bounds.children.every(x=>x.left>=bounds.parent.left-1&&x.right<=bounds.parent.right+1),"no clipped map tools");
        await drawer.locator("summary").click();
      }
      if(i===1){
        await page.locator(".rs6-timeline-controller").waitFor({timeout:10000});
        const order=await page.evaluate(()=>{
          const recap=document.querySelector(".rs33-timeline .rs-game-recap");
          const map=document.querySelector(".rs33-timeline .rs-renewal-route");
          return {recap:recap&&map?recap.compareDocumentPosition(map):null,label:document.querySelector(".rs33-timeline .rs7-map-label")?.innerText};
        });
        if(order.recap!=null)assert.ok(order.recap&4,"Daily ride summary must precede the route map");
        assert.equal(await page.locator(".rs6-timeline-date-title").count(),0,"decorative English timeline counter removed");
      }
      if(i===2){
        await page.locator(".rs6-community-deck").waitFor({timeout:10000});
        await page.locator(".rs6-community-feed-head").waitFor();
        const tools=page.locator(".rs8-community-tools");
        assert.equal(await tools.evaluate(x=>x.open),false);
        await tools.locator("summary").click();
        assert.equal(await tools.evaluate(x=>x.open),true);
        await tools.locator("summary").click();
        const feed=page.locator(".rc-feed-renewal .rc-feed-row");
        if(await feed.count()){
          const style=await feed.first().evaluate(el=>({
            background:getComputedStyle(el).backgroundColor,
            radius:getComputedStyle(el).borderRadius
          }));
          assert.equal(style.radius,"0px","editorial feed must not use rounded cards");
          assert.equal(style.background,"rgba(0, 0, 0, 0)","feed rows must be transparent");
        }
      }
      if(i===3){
        await page.locator(".finance-page").waitFor({timeout:10000});
        const console=page.locator(".rs8-income-console");
        if(await console.count()){
          assert.equal(await console.evaluate(el=>getComputedStyle(el).backgroundColor),"rgba(0, 0, 0, 0)","finance overview is light and editorial");
          assert.equal(await console.locator(".rs8-console-value strong").count(),1,"income is a strong large figure");
          assert.equal(await page.locator(".rs11-income-chart").count(),1,"chart is its own panel");
          assert.equal(await page.locator(".rs11-finance-shortcuts button").count(),2,"income and expense actions preserved");
        }
      }
      if(i===4){
        await page.locator(".rs6-garage-stage").waitFor({timeout:10000});
        assert.equal(await page.locator(".rs6-garage-stage .bike-actions").count(),1);
        assert.equal(await page.locator(".rs6-service-board .bike-consumables").count(),1);
        const layout=await page.locator(".rs6-service-board .bike-consumables").evaluate(el=>getComputedStyle(el).display);
        assert.equal(layout,"flex","maintenance is an ordered vertical service list");
        assert.equal(await page.locator(".rs6-history-board").count(),1);
        assert.ok((await page.locator(".rs11-service-list .rs11-part-row").count())>=6,"vehicle parts remain available");
        assert.equal(await page.locator(".bike-model-banner").count(),0,"duplicated model banner must be gone");
        assert.equal(await page.locator(".rs8-bike-hero").count(),1);
        assert.ok((await page.locator(".rs8-bike-hero").evaluate(el=>getComputedStyle(el).backgroundImage)).includes("gradient"),"bike showcase uses a soft blue gradient, never a black card");
        assert.equal(await page.locator(".rs8-bike-settings").count(),1);
        await page.locator(".rs8-bike-settings summary").click();
        assert.equal(await page.locator(".bike-vehicle-tools button").count(),2,"odometer and model actions preserved");
        await page.locator(".rs8-bike-settings summary").click();
        assert.equal(await page.locator(".rs6-garage-id").count(),0,"decorative numbered badge removed");
      }
      if(width===393) await page.screenshot({path:"/tmp/rider-spot-urban-flow-v11/"+["map","timeline","community","finance","bike"][i]+".png",fullPage:false});
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
 fs.writeFileSync("/tmp/rider-spot-urban-flow-v11/report.json",JSON.stringify(report,null,2)+"\n");
 console.log("RIDER_URBAN_FLOW_V11_QA "+JSON.stringify(report));
 if(!report.passed)process.exitCode=1;
});