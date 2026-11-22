const {chromium}=require("playwright");
const fs=require("node:fs");
const assert=require("node:assert/strict");
const origin=process.env.RIDER_VISUAL_URL;
if(!origin)throw new Error("RIDER_VISUAL_URL is required");
const screens=[["지도",".nearby"],["타임라인",".rs34-timeline"],["동네",".rs34-community"],["수익",".rs34-finance-page"],["내 바이크",".rs34-bike-page"]];
(async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const widths=[320,360,390,412];
 const target="/tmp/rs34-visual-evidence";
 fs.mkdirSync(target,{recursive:true});
 try{
  for(const width of widths){
   const ctx=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,
     timezoneId:"Asia/Seoul",serviceWorkers:"block",
     permissions:["geolocation"],geolocation:{latitude:35.17,longitude:126.83}});
   const page=await ctx.newPage(),errors=[];
   page.on("pageerror",error=>errors.push(error.message));
   const response=await page.goto(origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
   assert.equal(response.status(),200);
   const tabs=page.locator(".bottom-nav button");
   await tabs.first().waitFor({timeout:30000});
   assert.equal(await tabs.count(),5,"five tabs stay visible");
   for(let i=0;i<screens.length;i++){
    const [label,selector]=screens[i];
    await tabs.nth(i).click();
    await page.locator(selector).first().waitFor({timeout:15000});
    await page.waitForTimeout(250);
    const dims=await page.evaluate(()=>({width:innerWidth,
      scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,
      selected:document.querySelectorAll(".bottom-nav button.active").length}));
    assert.equal(dims.selected,1,label+" active tab");
    assert.ok(dims.scroll<=width+3&&dims.body<=width+3,
      label+" overflow at "+width+"px "+JSON.stringify(dims));
    if(i===0){
      await page.locator(".rs34-ride-dock-status").waitFor({state:"visible"});
    }
    if(i===1){
      assert.equal(await page.locator(".rs34-timeline .rs34-ride-main-action").count(),1);
    }
    if(i===2){
      const categories=page.locator(".rs34-community .rc-category-wrap");
      await categories.waitFor({state:"visible"});
      assert.ok(await categories.locator("button").count()>1,"visible community category navigation");
      const filters=page.locator(".rs34-community-filters");
      assert.equal(await filters.getAttribute("open"),null,"search controls collapsed independently");
    }
    if(i===4){
      const grid=page.locator(".rs34-bike-page .bike-consumables.rs11-service-list");
      await grid.waitFor({state:"visible"});
      const style=await grid.evaluate(el=>({display:getComputedStyle(el).display,
        columns:getComputedStyle(el).gridTemplateColumns.split(" ").length}));
      assert.equal(style.display,"grid");
      assert.equal(style.columns,3,"garage grid stays 3x2 at "+width);
      assert.equal(await page.locator(".rs34-odo-action").count(),1,"direct odometer edit");
    }
    if(width===390)await page.screenshot({path:target+"/"+String(i+1)+"-"+label+".png"});
   }
   assert.deepEqual(errors,[],"console errors at "+width);
   console.log("V34_BROWSER_5_TABS_PASS",width);
   await ctx.close();
  }
 } finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
