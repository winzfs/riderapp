const {chromium} = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const {sampleTrip,userId} = require("./fixtures.cjs");
const origin="https://rider-spot.jazzhjm.workers.dev";
const date="2026-11-16";
const local=path.resolve(__dirname,"../dist");
const shots=process.env.RIDER_SCREENSHOTS;
const trips=[sampleTrip(120,{started:Date.parse(date+"T00:00Z")}),sampleTrip(120,{id:"22222222-2222-4222-8222-222222222222",started:Date.parse(date+"T14:59Z")})];
const user={id:userId,role:"authenticated",aud:"authenticated",email:"demo@example.test",user_metadata:{nickname:"라이더"},app_metadata:{provider:"email"}};
const jwt="eyJhbGciOiJIUzI1NiJ9."+Buffer.from(JSON.stringify({sub:userId,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url")+".fixture";
async function run(browser,width,height){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,timezoneId:"Asia/Seoul",serviceWorkers:"block",permissions:["geolocation"],geolocation:{latitude:35.17,longitude:126.83}});
  const session={access_token:jwt,token_type:"bearer",refresh_token:"fixture",expires_at:Math.floor(Date.now()/1000)+3600,user};
  await context.addInitScript(({session,trips,userId})=>{
    localStorage.setItem("sb-qkcqzhkvfbymzjdktshp-auth-token",JSON.stringify(session));
    localStorage.setItem("rs:trips:"+userId,JSON.stringify(trips));
  },{session,trips,userId});
  const records=[{id:"11111111-1111-4111-8111-111111111113",serviced_on:date,item:"엔진오일",odometer_km:24500,cost_won:24000,user_id:userId}];
  const totals={};let fail=true;
  await context.routeWebSocket("**/realtime/**",socket=>socket.close());
  await context.route("**/*",async route=>{
    const url=new URL(route.request().url()),table=url.pathname.split("/").pop();
    if(url.hostname.endsWith(".supabase.co")){
      if(table==="set_rider_daily_income"){
        if(fail){fail=false;return route.fulfill({status:503,json:{message:"테스트 연결 오류"}});}
        const data=route.request().postDataJSON();assert.equal(data.p_date,date);Object.assign(totals,data.p_values);return route.fulfill({status:204});
      }
      if(table==="maintenance_logs" && route.request().method()==="POST"){
        const data=route.request().postDataJSON(),idx=records.findIndex(r=>r.id===data.id);
        if(idx<0) records.push(data); else records[idx]=data;
        return route.fulfill({json:{id:data.id}});
      }
      const data={user,trips,maintenance_logs:[...records].sort((a,b)=>b.serviced_on.localeCompare(a.serviced_on)),
        rider_earnings:Object.entries(totals).map(([platform,amount])=>({platform,gross_won:amount||0,gross_entered:amount!=null})),
        rider_vehicle_profiles:{vehicle_name:"PCX125"},rider_maintenance_cycles:[{item_key:"엔진오일",interval_km:3000}]}[table]??[];
      return route.fulfill({json:data});
    }
    if(["tiles.openfreemap.org","cdn.jsdelivr.net","tile.openstreetmap.org"].includes(url.hostname))return route.continue();
    if(url.origin!==origin)return route.abort();
    if(table==="industry-news")return route.fulfill({json:{items:[]}});
    if(table==="route-match")return route.fulfill({json:{lines:[]}});
    const file=url.pathname==="/"?"index.html":url.pathname.slice(1);
    for(const base of [local,process.env.RIDER_BASELINE_DIR].filter(Boolean)){
      const target=path.join(base,file);
      if(fs.existsSync(target)&&fs.statSync(target).isFile())return route.fulfill({path:target,contentType:/\.m?js$/.test(file)?"application/javascript":undefined});
    }
    if(route.request().method()==="GET" && /^\/(?:rider-|pwa-init|icons\/|mapdata\/)/.test(url.pathname))return route.continue();
    return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(8000);
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  const shot=async name=>{if(shots){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,width+"-"+name+".png")});}};
  const nav=name=>page.locator(".bottom-nav").getByRole("button",{name,exact:true}).click();
  try {
    await page.goto(origin,{waitUntil:"domcontentloaded"});
    await page.locator(".ride-launch button").waitFor();
    assert.deepEqual(await page.locator(".bottom-nav button").allTextContents(),["운행","타임라인","동네","내 바이크"]);
    await page.locator(".ride-launch button").scrollIntoViewIfNeeded();await shot("ride");await nav("내 바이크");await page.getByText("24,500 km",{exact:true}).first().waitFor();
    await shot("bike");await page.getByRole("button",{name:"＋ 정비 기록",exact:true}).click();
    const dialog=page.getByRole("dialog");
    await dialog.getByRole("button",{name:"앞 타이어",exact:true}).click();
    await dialog.getByLabel("정비 날짜").fill("2026-11-15");
    await dialog.getByRole("button",{name:"정비 기록 저장"}).click();
    await page.getByText("비용 미입력",{exact:true}).waitFor();
    await page.getByRole("button",{name:"＋ 정비 기록",exact:true}).click();
    for(const name of ["앞 타이어","뒤 타이어"])await dialog.getByRole("button",{name,exact:true}).click();
    await dialog.getByLabel("총비용").fill("150000");await dialog.getByLabel("계기판").fill("25000");
    await shot("service");await dialog.getByRole("button",{name:"정비 기록 저장"}).click();
    await page.getByRole("button",{name:/앞 타이어 · 뒤 타이어.*150,000원/}).click();
    await dialog.getByLabel("총비용").fill("140000");await dialog.getByRole("button",{name:"정비 기록 저장"}).click();
    await page.getByText("140,000원",{exact:true}).waitFor();assert.equal(records.length,3);
    await nav("타임라인");await page.getByRole("button",{name:date+" 운행 2회",exact:true}).click();
    await page.locator(".rs56-day-map").waitFor();await page.locator(".rs-course-end-pin").first().waitFor();
    const clocks=page.locator(".rs56-day-map .rs33-stamp-label:not(.stop)");
    const count=await clocks.count();assert.ok(count>0);
    await page.evaluate(()=>window.__rsMap.setZoom(9));await page.waitForTimeout(300);
    assert.equal(await clocks.count(),count);assert.equal(await page.evaluate(()=>window.__rsMap.getZoom()),9);
    await page.getByRole("button",{name:"전체 경로 맞춤",exact:true}).click();
    await page.waitForFunction(()=>window.__rsMap.getZoom()>9);
    await page.locator(".rs-game-recap").scrollIntoViewIfNeeded();await shot("timeline");
    await page.locator(".record-income").click();
    const coupang=dialog.getByLabel("쿠팡이츠"),baemin=dialog.getByLabel("배민");
    await coupang.fill("50000");await coupang.press("Enter");assert.equal(await baemin.evaluate(el=>el===document.activeElement),true);
    await baemin.fill("0");await shot("income");await dialog.getByRole("button",{name:"50,000원 저장"}).click();
    await dialog.getByRole("alert").waitFor();assert.equal(await coupang.inputValue(),"50,000");
    await dialog.getByRole("button",{name:"50,000원 저장"}).click();await page.locator(".record-income").filter({hasText:"50,000원"}).waitFor();
    await page.locator(".record-income").click();await coupang.fill("120000");await baemin.fill("");
    await dialog.getByRole("button",{name:"120,000원 저장"}).click();await page.locator(".record-income").filter({hasText:"120,000원"}).waitFor();
    await page.locator(".rs56-ride-choice").first().click();
    await page.getByLabel("경로 재생 배속").first().selectOption("20");
    await page.getByRole("button",{name:"경로 재생 시작"}).first().click();
    await page.getByRole("button",{name:"‹ 하루 전체"}).click();await page.locator(".rs56-day-map").waitFor();
    assert.deepEqual(totals,{"쿠팡이츠":120000,"배민":null});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
    console.log("PASS mobile forms, retry, history and timeline",width,height);
  } finally {await context.close();}
}
(async()=>{const browser=await chromium.launch({executablePath:process.env.RIDER_CHROMIUM,args:["--no-sandbox"]});
try{await run(browser,412,892);await run(browser,360,400);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
