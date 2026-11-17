const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const url=process.env.RIDER_UI_URL||'https://fa3ef33e-rider-spot.jazzhjm.workers.dev/';
const output=process.env.RIDER_SCREENSHOTS||'/tmp/rider-v62-viewports';
fs.mkdirSync(output,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    for(const width of [320,768,1024]){
      const ctx=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:width<761,serviceWorkers:'block',timezoneId:'Asia/Seoul'});
      await ctx.route('**/*',async route=>{
        const u=new URL(route.request().url());
        if(u.hostname.endsWith('.supabase.co')){
          if(u.pathname.includes('/auth/'))return route.fulfill({status:401,json:{message:'no QA user'}});
          return route.fulfill({json:[]});
        }
        if(u.pathname==='/api/industry-news')return route.fulfill({json:{items:[]}});
        return route.continue();
      });
      const page=await ctx.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.stack||e.message));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});
      await page.locator('header a.brand').waitFor();
      const nav=width<761?'.bottom-nav':'.desktop-nav';
      for(const [label,slug] of [['지도','nearby'],['타임라인','trips'],['업무','tools'],['커뮤니티','community'],['내 정보','account']]){
        const button=page.locator(nav+' button').filter({hasText:label}).first();
        if(slug!=='nearby')await button.click({timeout:12000});
        await page.waitForTimeout(380);
        const info=await page.evaluate(()=>({
          width:innerWidth,html:document.documentElement.scrollWidth,
          body:document.body.scrollWidth,
          header:document.querySelector('header')?.getBoundingClientRect().top,
          nav:document.querySelector('.bottom-nav')?.getBoundingClientRect().top
        }));
        assert.ok(info.html<=width+1&&info.body<=width+1,slug+' horizontal overflow '+JSON.stringify(info));
        assert.ok(info.header>=-1,slug+' header outside viewport');
        await page.screenshot({path:path.join(output,width+'-'+slug+'.png'),fullPage:false});
      }
      assert.deepEqual(errors,[],'page JS errors '+width);
      await ctx.close();
      console.log('PASS width '+width+' all 5 tabs, no horizontal overflow or page exceptions');
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
