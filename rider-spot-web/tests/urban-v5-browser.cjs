const {chromium}=require("playwright");
const fs=require("node:fs");
const assert=require("node:assert/strict");
const origin=process.env.RIDER_VISUAL_URL||"https://rider-spot-static-preview.jazzhjm.workers.dev";
const cssPath="/rider-spot-visual-v2-20261121.css";
const report={origin,at:new Date().toISOString(),screens:[],passed:false};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.RIDER_CHROME_CHANNEL||undefined,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  fs.mkdirSync("/tmp/rider-spot-urban-v5",{recursive:true});
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
    assert.equal(css.headers()["x-rs-design"],"urban-v5-20261121");
    const body=await css.text();
    assert.ok(body.length>12000&&body.includes("URBAN EDITORIAL v5"));
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
    assert.equal(await page.locator(".app>header").evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(23, 38, 34)");
    row.checks.push("stylesheet loaded","editorial flat selected state");
    for(let i of [0,1,2,3,4]){
      await nav.nth(i).click();
      await page.waitForTimeout(240);
      const v=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
      assert.ok(v.scroll<=width+2&&v.body<=width+2,"horizontal overflow "+JSON.stringify(v));
      if(width===393) await page.screenshot({path:"/tmp/rider-spot-urban-v5/"+["map","timeline","community","finance","bike"][i]+".png",fullPage:false});
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
 fs.writeFileSync("/tmp/rider-spot-urban-v5/report.json",JSON.stringify(report,null,2)+"\n");
 console.log("RIDER_URBAN_V5_QA "+JSON.stringify(report));
 if(!report.passed)process.exitCode=1;
});