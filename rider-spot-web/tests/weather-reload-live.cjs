/* Live-only diagnostics: no account credentials, location or ride records. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.RS_DIAG_URL || 'https://rider-spot.jazzhjm.workers.dev/';
(async() => {
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const results=[];
  try {
    for (const config of [
      {name:'live-normal',weather:true,serviceWorkers:'allow'},
      {name:'live-weather-off',weather:false,serviceWorkers:'block'},
      {name:'live-sw-off',weather:true,serviceWorkers:'block'}
    ]) {
      const context=await browser.newContext({viewport:{width:393,height:830},deviceScaleFactor:3,isMobile:true,hasTouch:true,serviceWorkers:config.serviceWorkers,locale:'ko-KR',timezoneId:'Asia/Seoul'});
      const page=await context.newPage();
      const log={scenario:config.name,navigation:0,boot:0,crashes:0,errors:[],weatherRequests:0,weatherFailures:0,httpFailures:[],events:[],weatherVisible:false,assets:[]};
      page.on('framenavigated',f=>{if(f===page.mainFrame())log.navigation++});
      page.on('crash',()=>log.crashes++);
      page.on('pageerror',e=>{if(log.errors.length<10)log.errors.push(e.message.slice(0,260))});
      page.on('console',m=>{if(m.type()==='error' && log.errors.length<10)log.errors.push('console:'+m.text().slice(0,220))});
      page.on('request',r=>{if(r.url().includes('/api/weather'))log.weatherRequests++});
      page.on('requestfailed',r=>{if(r.url().includes('/api/weather'))log.weatherFailures++});
      page.on('response',resp=>{if(resp.status()>=400 && log.httpFailures.length<15) {
        const u=new URL(resp.url());log.httpFailures.push({status:resp.status(),path:u.pathname,host:u.hostname});
      }});
      await page.addInitScript(() => {
        window.__rsTestBoot = (window.__rsTestBoot || 0)+1;
        const save=(name)=>{try{const rows=JSON.parse(sessionStorage.getItem('__rsQAEvents')||'[]');rows.push({name,t:Date.now()});sessionStorage.setItem('__rsQAEvents',JSON.stringify(rows.slice(-100)))}catch{}};
        save('boot:'+String(performance.getEntriesByType('navigation')?.[0]?.type||'unknown'));
        window.addEventListener('beforeunload',()=>save('beforeunload'));
        window.addEventListener('pagehide',()=>save('pagehide'));
        window.addEventListener('pageshow',()=>save('pageshow'));
        window.addEventListener('popstate',()=>save('popstate'));
        window.addEventListener('riderspot:screen',()=>save('screen:'+String(window.__rsActiveTab||'')));
      });
      if (!config.weather) await page.route(/\/weather-bar\.js(?:\?|$)/,route=>route.fulfill({status:200,contentType:'application/javascript',body:'/* weather isolated for diagnosis */'}));
      try {
        await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForTimeout(6000);
        log.weatherVisible=await page.locator('#rs-weather-hud').count()>0;
        log.assets=await page.locator('script[src*="weather"],script[src*="app.mjs"]').evaluateAll(nodes=>nodes.map(n=>n.src.split('/').slice(-2).join('/'))).catch(()=>[]);
        // Reproduce map/tab switches, rapid WebGL unmounts, return, popup + resume.
        const pairs=[['타임라인','지도'],['동네','지도'],['내 바이크','지도'],['수익','지도']];
        for(const pair of pairs){
          for(const tab of pair){
            const item=page.locator('nav[aria-label="주 메뉴"] button').filter({hasText:tab}).first();
            if(await item.count()) await item.click({timeout:2000}).catch(()=>{});
            await page.waitForTimeout(1100);
          }
        }
        if(config.weather && await page.locator('#rs-weather-hud').count()) {
          await page.locator('#rs-weather-hud').click({timeout:2500}).catch(()=>{});
          await page.waitForTimeout(2000);
          if(await page.locator('.rs-weather-sheet .close').count()) await page.locator('.rs-weather-sheet .close').click().catch(()=>{});
        }
        await page.waitForTimeout(config.name==='live-normal' ? 70000 : 10000);
        const diagnostic=await page.evaluate(()=>({
          weatherVisible:!!document.querySelector('#rs-weather-hud'),
          activeTab:window.__rsActiveTab||null,
          basemap:document.querySelector('.leaflet-container')?.dataset?.rsBasemap||null,
          pwa:!!navigator.serviceWorker?.controller,
          heap:performance.memory?.usedJSHeapSize||null,
          events:JSON.parse(sessionStorage.getItem('__rsQAEvents')||'[]').map(x=>x.name)
        })).catch(e=>({error:e.message}));
        Object.assign(log,diagnostic);
      } catch(e){log.error=e.message}
      console.log('SCENARIO',JSON.stringify(log));
      results.push(log);
      await context.close();
    }
    assert.ok(results.every(x=>x.events.filter(e=>e.startsWith('boot:')).length===1 && !x.events.includes('beforeunload')), 'document reload detected in a scenario');
    console.log('DIAGNOSTICS_COMPLETE');
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
