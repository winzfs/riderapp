const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const origin = "https://rider-spot-static-preview.jazzhjm.workers.dev/";
const report={at:new Date().toISOString(),origin,screens:[],passed:false};
(async()=>{
  const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  try {
    for(const width of [320,393,412]) {
      const ctx=await browser.newContext({
        viewport:{width,height:844},isMobile:true,hasTouch:true,
        timezoneId:"Asia/Seoul",serviceWorkers:"block",
        permissions:["geolocation"],geolocation:{latitude:35.17,longitude:126.83},
      });
      await ctx.addInitScript(()=>{
        if(window===window.top)sessionStorage.setItem("rs_static_preview_boots",String(Number(sessionStorage.getItem("rs_static_preview_boots")||0)+1));
      });
      const page=await ctx.newPage();
      const errors=[];
      page.on("pageerror",e=>errors.push(e.message));
      const screen={width,steps:[],errors:[]};
      report.screens.push(screen);
      try {
        await page.goto(origin,{waitUntil:"domcontentloaded",timeout:45000});
        const nav=page.locator(".bottom-nav button");
        await nav.first().waitFor({timeout:50000});
        assert.equal(await nav.count(),5,"five bottom tabs");
        screen.steps.push("five bottom tabs");
        const cssSource=await page.request.get(origin+"assets/rider-spot-16c1eecf6bac/premium-shell.css");
        assert.equal(cssSource.status(),200,"KV CSS HTTP status");
        assert.equal(cssSource.headers()["x-rs-preview-asset-origin"],"workers-kv","KV asset gateway proof");
        screen.steps.push("styles loaded from Cloudflare KV");
        const css=page.locator('link[href*="premium-shell.css"]');
        assert.equal(await css.count(),1,"one premium style reference");
        screen.steps.push("premium CSS linked");
        for(const idx of [1,2,3,4,0]){
          await nav.nth(idx).click();
          await page.waitForTimeout(280);
          const dims=await page.evaluate(()=>({outer:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
          assert.ok(dims.html<=width+2&&dims.body<=width+2,"horizontal overflow "+JSON.stringify(dims));
        }
        screen.steps.push("five tabs functional and no horizontal overflow");
        await nav.nth(3).click();
        await page.waitForTimeout(450);
        const graph=page.locator(".finance-page .fin-chart-point");
        if(await graph.count()){
          await graph.first().click();
          const state=await graph.first().evaluate(el=>{
            const track=el.querySelector(".fin-chart-track");
            const css=track?getComputedStyle(track):null;
            return {selected:el.classList.contains("selected"),outlineWidth:css?.outlineWidth};
          });
          assert.ok(state.selected,"chart selection does not activate");
          assert.equal(state.outlineWidth,"0px","selected graph has old outline");
          screen.steps.push("finance chart selection outline removed");
        }else screen.steps.push("finance graph not displayed for anonymous session");
        await page.waitForTimeout(1400);
        assert.equal(await page.evaluate(()=>Number(sessionStorage.getItem("rs_static_preview_boots"))),1,"full-document reload");
        screen.steps.push("no unexpected full-document reload");
        assert.deepEqual(errors,[],"uncaught JS errors");
        await page.screenshot({path:"/tmp/rider-static-preview-"+width+".png",fullPage:false});
        screen.passed=true;
      }catch(e){screen.passed=false;screen.error=String(e?.stack||e).slice(0,1200);}
      screen.errors=errors.slice(0,10);
      await ctx.close();
      if(!screen.passed)break;
    }
    report.passed=report.screens.length===3&&report.screens.every(x=>x.passed);
  }finally{await browser.close();}
})().catch(e=>{report.error=String(e?.stack||e).slice(0,1000);})
.finally(()=>{
  fs.writeFileSync("docs/static-preview-browser-qa.json",JSON.stringify(report,null,2)+"\n");
  console.log("STATIC_BROWSER_QA",JSON.stringify(report));
  if(!report.passed)process.exitCode=1;
});
