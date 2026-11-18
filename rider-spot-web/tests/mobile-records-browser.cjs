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
  const totals={};let fail=true,failVehicle=true,failMaintenance=true,failCycle=true,failDelete=true;
  const cycleWrites=[];
  const vehicle={user_id:userId,vehicle_name:"MY125",odometer_km:24500,odometer_recorded_on:"2026-11-15"};
  const cycles=[{user_id:userId,item_key:"엔진오일",interval_km:3000,interval_days:null}];
  const modelSettings=[];
  const vehicleChanges=[];
  await context.routeWebSocket("**/realtime/**",socket=>socket.close());
  await context.route("**/*",async route=>{
    const url=new URL(route.request().url()),table=url.pathname.split("/").pop();
    if(url.hostname.endsWith(".supabase.co")){
      if(table==="set_rider_manual_odometer"){
        const {p_km}=route.request().postDataJSON();
        if(failVehicle){failVehicle=false;return route.fulfill({status:503,json:{message:"테스트 계기판 저장 실패"}});}
        vehicle.odometer_km=p_km;
        vehicle.odometer_recorded_on="2026-11-17";
        return route.fulfill({json:p_km});
      }
      if(table==="apply_rider_trip_odometer")return route.fulfill({json:vehicle.odometer_km});
      if(table==="rider_vehicle_profiles" && route.request().method()!=="GET"){
        const payload=route.request().postDataJSON();
        vehicleChanges.push(payload);
        if(failVehicle){failVehicle=false;return route.fulfill({status:503,json:{message:"테스트 계기판 저장 실패"}});}
        if(payload.odometer_km!==undefined && payload.odometer_km!==vehicle.odometer_km)
          vehicle.odometer_recorded_on="2026-11-17";
        Object.assign(vehicle,payload);
        return route.fulfill({json:{user_id:userId}});
      }
      if(table==="rider_model_maintenance_settings" && route.request().method()!=="GET"){
         if(route.request().method()==="DELETE"){
           const key=url.searchParams.get("model_key")?.replace("eq.","");
           const part=url.searchParams.get("item_key")?.replace("eq.","");
           const index=modelSettings.findIndex(x=>x.model_key===key&&x.item_key===part);
           return route.fulfill({json:index<0?[]:modelSettings.splice(index,1)});
         }
         const incoming=route.request().postDataJSON();
         for(const row of (Array.isArray(incoming)?incoming:[incoming])){
           const index=modelSettings.findIndex(x=>x.model_key===row.model_key&&x.item_key===row.item_key);
           if(index<0)modelSettings.push(row);else modelSettings[index]={...modelSettings[index],...row};
         }
         return route.fulfill({json:modelSettings});
       }
       if(table==="rider_maintenance_cycles" && route.request().method()!=="GET"){
        if(failCycle){failCycle=false;return route.fulfill({status:503,json:{message:"테스트 주기 저장 실패"}});}
        for(const payload of route.request().postDataJSON()){
          cycleWrites.push(payload);
          const old=cycles.find(x=>x.item_key===payload.item_key);
          if(old)Object.assign(old,payload);else cycles.push(payload);
        }
        return route.fulfill({json:cycles});
      }
      if(table==="set_rider_daily_income"){
        if(fail){fail=false;return route.fulfill({status:503,json:{message:"테스트 연결 오류"}});}
        const data=route.request().postDataJSON();assert.equal(data.p_date,date);Object.assign(totals,data.p_values);return route.fulfill({status:204});
      }
      if(table==="maintenance_logs" && route.request().method()==="DELETE"){
         if(failDelete){failDelete=false;return route.fulfill({status:503,json:{message:"테스트 삭제 실패"}});}
         const id=url.searchParams.get("id")?.replace("eq.","");
         const owner=url.searchParams.get("user_id")?.replace("eq.","");
         const index=records.findIndex(x=>x.id===id && x.user_id===owner);
         if(index<0)return route.fulfill({json:[]});
         records.splice(index,1);
         return route.fulfill({json:[{id}]});
       }
       if(table==="maintenance_logs" && route.request().method()==="POST"){
        if(failMaintenance){failMaintenance=false;return route.fulfill({status:503,json:{message:"테스트 정비 저장 실패"}});}
        const data=route.request().postDataJSON(),idx=records.findIndex(r=>r.id===data.id);
        if(idx<0) records.push(data); else records[idx]=data;
        return route.fulfill({json:{id:data.id}});
      }
      const data={user,trips,maintenance_logs:[...records].sort((a,b)=>b.serviced_on.localeCompare(a.serviced_on)),
        rider_earnings:Object.entries(totals).map(([platform,amount])=>({platform,gross_won:amount||0,gross_entered:amount!=null})),
        rider_vehicle_profiles:vehicle,rider_maintenance_cycles:cycles,
         rider_model_maintenance_settings:modelSettings}[table]??[];
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
    try { await page.locator(".ride-launch button").waitFor(); }
    catch(e){
      console.error("BOOT DIAGNOSTICS",{errors,body:(await page.locator("body").innerText()).slice(0,700),
        title:await page.title(),nav:await page.locator(".bottom-nav button").allTextContents()});
      throw e;
    }
    assert.deepEqual(await page.locator(".bottom-nav button").allTextContents(),["운행","타임라인","동네","내 바이크"]);
    await page.locator(".ride-launch button").scrollIntoViewIfNeeded();await shot("ride");await nav("내 바이크");await page.getByText("24,500 km",{exact:true}).first().waitFor();
    await shot("bike");
    assert.equal(await page.evaluate(()=>window.__rsNavigation?.tab),"bike","native and browser routing controller initialized");
    await page.goBack();
    await page.locator(".ride-launch button").waitFor();
    assert.equal(await page.evaluate(()=>window.__rsNavigation?.tab),"nearby","hardware/browser Back restores the preceding tab");
    await nav("내 바이크");await page.locator(".bike-consumables").waitFor();
    const grid=page.locator(".bike-consumables"),cards=grid.locator(".bike-consumable");
    assert.equal(await cards.count(),6,"six standard parts form the first 3-by-2 grid");
    const layout=await grid.evaluate(node=>{
      const el=[...node.querySelectorAll(".bike-consumable")].map(x=>x.getBoundingClientRect());
      return {cols:getComputedStyle(node).gridTemplateColumns.split(" ").length,
        first:el.slice(0,3).map(x=>Math.round(x.y)),second:el.slice(3,6).map(x=>Math.round(x.y)),
        width:el.map(x=>x.width),outer:node.getBoundingClientRect().width};
    });
    assert.equal(layout.cols,3,"exactly three columns on mobile");
    assert.ok(layout.first.every(y=>y===layout.first[0]),"first three cards share first row");
    assert.ok(layout.second.every(y=>y===layout.second[0])&&layout.second[0]>layout.first[0],"next three cards share second row");
    assert.ok(layout.width.every(w=>w>72&&w<layout.outer/2),"cards fit without horizontal overflow");
    assert.doesNotMatch(await cards.first().innerText(),/24,500 km|2026-11-16/,"dates and mileage stay in detail");
    assert.ok(await page.locator(".bike-tile-icon .bike-part-svg").count()>=6,"maintenance vector icons render");
    const svgIcon=page.locator(".bike-tile-icon .bike-part-svg").first();
    assert.match(await svgIcon.evaluate(el => getComputedStyle(el).backgroundImage), /data:image\/svg\+xml,/,
      "simplified vector icon set renders without a raster atlas");
    const dialog=page.getByRole("dialog");
    await page.getByRole("button",{name:"계기판 입력",exact:true}).click();
    await dialog.getByLabel("현재 계기판 (km)").fill("25700");
    await dialog.getByRole("button",{name:"계기판 저장"}).click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(await dialog.getByLabel("현재 계기판 (km)").inputValue(),"25700");
    await dialog.getByRole("button",{name:"계기판 저장"}).click();
    await page.getByText("25,700 km",{exact:true}).first().waitFor();
    assert.equal(vehicle.odometer_recorded_on,"2026-11-17");
    await page.getByRole("button",{name:"모델 선택",exact:true}).click();
    const picker=page.getByRole("dialog",{name:"바이크 모델 선택"});
    await picker.getByRole("button",{name:"목록에 없는 차량 직접 입력"}).click();
    await picker.getByLabel("차량명").fill("PCX125 라이더");
    await picker.getByRole("button",{name:"차량명 저장"}).click();
    await picker.waitFor({state:"hidden"});
    await page.getByRole("heading",{name:"PCX125 라이더"}).waitFor();
    assert.equal(vehicle.odometer_km,25700);
    assert.equal(vehicle.odometer_recorded_on,"2026-11-17","renaming preserves odometer date");
    assert.deepEqual(vehicleChanges.at(-1),{user_id:userId,vehicle_name:"PCX125 라이더",model_key:null},
      "custom manual bike name does not imply a verified model identity");
    assert.equal(await page.getByRole("button",{name:"교체 주기 설정",exact:true}).count(),0,
      "global replacement cycle editor is removed");
    await page.getByRole("button",{name:"엔진오일 관리",exact:true}).click();
    const oilDetail=page.getByRole("dialog",{name:"엔진오일 관리"});
    await oilDetail.getByRole("button",{name:"주기 수정",exact:true}).click();
    const oilCycle=page.getByRole("dialog",{name:"엔진오일 교체 주기"});
    await oilCycle.waitFor();
    const miniWidth=await oilCycle.locator(".record-mini-card").evaluate(el=>el.getBoundingClientRect().width);
    assert.ok(miniWidth<400,"cycle editor should be a compact separate window");
    assert.equal(await oilDetail.locator(".record-cycle-form").count(),0,"no inline form inside details");
    await oilCycle.getByLabel("교체 거리 (km)").fill("4000");
    await oilCycle.getByRole("button",{name:"교체 주기 저장"}).click();
    await oilCycle.getByRole("alert").waitFor();
    assert.equal(await oilCycle.getByLabel("교체 거리 (km)").inputValue(),"4000","failed save keeps entered interval");
    await oilCycle.getByRole("button",{name:"교체 주기 저장"}).click();
    await oilCycle.waitFor({state:"hidden"});console.log("PASS compact cycle editor",width);
    await oilDetail.getByText("28,500 km",{exact:true}).waitFor();
    await oilDetail.getByText("4,000 km",{exact:true}).waitFor();
    await shot("bike-detail");
    assert.equal(await oilDetail.locator(".record-cycle-form").count(),0,"saving the interval collapses the inline form");
    assert.equal(cycles[0].interval_km,4000);
    assert.deepEqual(cycleWrites.map(c=>c.item_key),["엔진오일"],
      "only the selected part interval was updated");
    await oilDetail.getByRole("button",{name:"닫기"}).click();
    await page.locator(".bike-consumable").filter({hasText:"엔진오일"})
      .getByText("2,800 km 남음",{exact:true}).waitFor();
    await page.getByRole("button",{name:"앞 타이어 관리",exact:true}).click();
    const tireDetail=page.getByRole("dialog",{name:"앞 타이어 관리"});
    await tireDetail.getByRole("button",{name:"주기 수정",exact:true}).click();
    const tireCycle=page.getByRole("dialog",{name:"앞 타이어 교체 주기"});
    await tireCycle.getByLabel("교체 기간 (일)").fill("90");
    await tireCycle.getByRole("button",{name:"교체 주기 저장"}).click();
    await tireCycle.waitFor({state:"hidden"});
    await tireDetail.getByText("90일",{exact:true}).waitFor();
    assert.equal(cycles.find(c=>c.item_key==="앞 타이어")?.interval_days,90,"save only front tire interval");
    assert.equal(cycles.find(c=>c.item_key==="엔진오일")?.interval_km,4000,"other parts unaffected");
    await tireDetail.getByRole("button",{name:"닫기"}).click();
    await shot("bike-updated");
    await page.getByRole("button",{name:"＋ 정비 기록",exact:true}).click();
    await dialog.getByRole("button",{name:"앞 타이어",exact:true}).click();
    await dialog.getByLabel("정비 날짜").fill("2026-11-15");
    await dialog.getByRole("button",{name:"정비 기록 저장"}).click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(await dialog.getByRole("button",{name:"앞 타이어",exact:true}).getAttribute("aria-pressed"),"true");
    await dialog.getByRole("button",{name:"정비 기록 저장"}).click();
    await page.getByText("비용 미입력",{exact:true}).waitFor();
    await page.getByRole("button",{name:"＋ 정비 기록",exact:true}).click();
    for(const name of ["앞 타이어","뒤 타이어"])await dialog.getByRole("button",{name,exact:true}).click();
    await dialog.getByLabel("총비용").fill("150000");await dialog.getByLabel("계기판").fill("25000");
    await shot("service");await dialog.getByRole("button",{name:"정비 기록 저장"}).click();
    await page.getByRole("button",{name:/앞 타이어 · 뒤 타이어.*150,000원/}).click();
    await dialog.getByLabel("총비용").fill("140000");await dialog.getByRole("button",{name:"변경사항 저장"}).click();
    await page.getByText("140,000원",{exact:true}).waitFor();assert.equal(records.length,3);
    await page.getByRole("button",{name:"＋ 정비 기록",exact:true}).click();
    await dialog.getByRole("button",{name:"엔진오일",exact:true}).click();await dialog.getByLabel("정비 날짜").fill("2026-11-10");
    await dialog.getByLabel("계기판").fill("22000");await dialog.getByRole("button",{name:"정비 기록 저장"}).click();
    await page.getByRole("button",{name:/엔진오일.*2026-11-10.*비용 미입력/}).click();
    await dialog.getByLabel("계기판").fill("21000");await dialog.getByRole("button",{name:"변경사항 저장"}).click();
    await page.locator(".bike-history-row").filter({hasText:"21,000 km"}).waitFor();
    assert.doesNotMatch(await page.locator(".bike-consumable").filter({hasText:"엔진오일"}).innerText(),/24,500 km/,"grid tile omits historic mileage");
    await page.getByRole("button",{name:"엔진오일 관리",exact:true}).click();
    await page.getByRole("dialog",{name:"엔진오일 관리"}).locator(".record-detail-summary").getByText("24,500 km",{exact:true}).waitFor();
    await page.getByRole("dialog",{name:"엔진오일 관리"}).getByRole("button",{name:"닫기"}).click();
    await page.getByRole("button",{name:"뒤 타이어 관리",exact:true}).click();
    assert.equal(await page.getByRole("dialog",{name:"뒤 타이어 관리"}).locator(".record-log").count(),1);
    await page.getByRole("dialog",{name:"뒤 타이어 관리"}).locator(".record-log").first().click();
    await page.goBack();
    await page.getByRole("dialog",{name:"정비 기록 수정"}).waitFor({state:"hidden"});
    await page.getByRole("dialog",{name:"뒤 타이어 관리"}).waitFor();
    assert.equal(await page.locator(".bottom-nav button.active").innerText(),"내 바이크",
      "Back from nested edit preserves the underlying part detail");
    await page.getByRole("dialog",{name:"뒤 타이어 관리"}).locator(".record-log").first().click();
    assert.equal(await page.getByRole("dialog",{name:"정비 기록 수정"}).getByRole("button",{name:"앞 타이어"}).getAttribute("aria-pressed"),"true");
    assert.equal(await page.getByRole("dialog",{name:"정비 기록 수정"}).getByRole("button",{name:"뒤 타이어"}).getAttribute("aria-pressed"),"true");
    await page.getByRole("dialog",{name:"정비 기록 수정"}).getByLabel("총비용").fill("0");
    await page.getByRole("dialog",{name:"정비 기록 수정"}).getByLabel("계기판").fill("40000");
    await page.getByRole("dialog",{name:"정비 기록 수정"}).getByRole("button",{name:"변경사항 저장"}).click();
    const rear=page.getByRole("dialog",{name:"뒤 타이어 관리"});
    await rear.getByText("0원").waitFor();
    await rear.getByText("40,000 km",{exact:true}).first().waitFor();
    await rear.getByRole("button",{name:"주기 수정",exact:true}).click();
    const rearCycle=page.getByRole("dialog",{name:"뒤 타이어 교체 주기"});
    await rearCycle.getByLabel("교체 거리 (km)").fill("40000");
    await rearCycle.getByRole("button",{name:"교체 주기 저장"}).click();
    await rearCycle.waitFor({state:"hidden"});
    await rear.getByText("80,000 km",{exact:true}).waitFor();console.log("PASS 40000km interval + 40000km replacement",width);
    await shot("bike-detail-updated");
    await rear.getByRole("button",{name:"닫기"}).click();
    await page.getByRole("button",{name:"계기판 입력",exact:true}).click();
    await dialog.getByLabel("현재 계기판 (km)").fill("60300");
    await dialog.getByRole("button",{name:"계기판 저장"}).click();
    await page.getByText("60,300 km",{exact:true}).first().waitFor();
    await page.locator(".bike-consumable").filter({hasText:"뒤 타이어"})
      .getByText("19,700 km 남음",{exact:true}).waitFor();console.log("PASS 60300km current odometer, 19700km remaining",width);
    await page.getByRole("button",{name:/앞 타이어 · 뒤 타이어.*0원/}).click();
    const editForDelete=page.getByRole("dialog",{name:"정비 기록 수정"});
    await editForDelete.getByRole("button",{name:"정비 기록 삭제"}).click();
    const confirmDelete=page.getByRole("dialog",{name:"정비 기록을 삭제할까요?"});
    await confirmDelete.getByRole("button",{name:"취소"}).click();
    await confirmDelete.waitFor({state:"hidden"});
    assert.equal(records.length,4,"cancel preserves the service record");
    await editForDelete.getByRole("button",{name:"정비 기록 삭제"}).click();
    await confirmDelete.getByRole("button",{name:"기록 삭제",exact:true}).click();
    await confirmDelete.getByRole("alert").waitFor();
    assert.equal(records.length,4,"failed delete preserves the service record");
    await confirmDelete.getByRole("button",{name:"기록 삭제",exact:true}).click();
    await confirmDelete.waitFor({state:"hidden"});
    await editForDelete.waitFor({state:"hidden"});
    assert.equal(records.length,3,"delete removes exactly the selected service record");console.log("PASS single record deletion",width);
    await page.locator(".bike-consumable").filter({hasText:"뒤 타이어"}).getByText("40,000 km 참고",{exact:true}).waitFor();
    assert.equal(cycles.find(c=>c.item_key==="뒤 타이어").interval_km,40000,"deleting a record leaves its cycle intact");
    await page.getByRole("button",{name:"브레이크 패드 관리",exact:true}).click();
    const swipeDialog=page.getByRole("dialog",{name:"브레이크 패드 관리"});
    const handle=swipeDialog.locator(".record-heading");
    const rect=await handle.boundingBox();
    assert.ok(rect,"draggable sheet handle has visible geometry");
    const x=rect.x+rect.width/2,y=rect.y+Math.min(45,rect.height/2);
    const sheetBefore=await swipeDialog.locator(".record-sheet").evaluate(el=>el.getBoundingClientRect().top);
    await page.mouse.move(x,y);await page.mouse.down();
    await page.mouse.move(x,y+78,{steps:8});
    const sheetDuring=await swipeDialog.locator(".record-sheet").evaluate(el=>el.getBoundingClientRect().top);
    assert.ok(sheetDuring-sheetBefore>40,"sheet must visibly track the finger BEFORE release, not jump on dismissal");
    await page.mouse.move(x,y+170,{steps:8});await page.mouse.up();
    await swipeDialog.waitFor({state:"hidden"});
    await shot("bike-after-swipe");
    await nav("타임라인");await page.getByRole("button",{name:date+" 운행 2회",exact:true}).click();
    await page.locator(".rs56-day-map").waitFor();await page.locator(".rs-course-end-pin").first().waitFor();
    const clocks=page.locator(".rs56-day-map .rs33-stamp-label:not(.stop)");
    await page.getByRole("button",{name:"전체 경로 맞춤",exact:true}).click();
    await clocks.first().waitFor({state:"attached"});
    const count=await clocks.count();
    await page.evaluate(()=>{window.__rsMap.setZoom(9);});await page.waitForTimeout(300);
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
    await page.locator(".rs33-trip-detail").waitFor();
    await page.goBack();
    await page.locator(".rs56-ride-choice").first().waitFor();
    assert.equal(await page.locator(".rs33-trip-detail").count(),0,
      "hardware Back from individual ride returns to full-day timeline");
    await page.locator(".rs56-ride-choice").first().click();
    await page.getByLabel("경로 재생 배속").first().selectOption("20");
    await page.getByRole("button",{name:"경로 재생 시작"}).first().click();
    await page.getByRole("button",{name:"‹ 하루 전체"}).click();await page.locator(".rs56-day-map").waitFor();
    assert.deepEqual(totals,{"쿠팡이츠":120000,"배민":null});
    await page.evaluate(()=>window.__rsOpenTool("maintenance"));
    await page.locator(".bike-vehicle").waitFor();
    assert.equal(await page.locator("section#rs-tools:not([hidden])").count(),0,"legacy maintenance route is redirected");
    // A 2025 PCX manufacturer interval and model-specific budget appear without
    // writing fictitious maintenance or overriding the current odometer.
    await nav("내 바이크");
    const countBefore=records.length,odometerBefore=vehicle.odometer_km;
    await page.getByRole("button",{name:"모델 선택",exact:true}).click();
    const chooseModel=page.getByRole("dialog",{name:"바이크 모델 선택"});
    await chooseModel.getByLabel("모델 검색").fill("PCX125");
    await chooseModel.getByRole("button",{name:"혼다 PCX125 (2021~) 선택"}).click();
    await chooseModel.waitFor({state:"hidden"});
    assert.equal(vehicle.model_key,"honda-pcx125");
    assert.equal(vehicle.odometer_km,odometerBefore,"model selection must preserve odometer");
    assert.equal(records.length,countBefore,"model selection cannot create fake repairs");
    await page.getByRole("button",{name:"엔진오일 관리",exact:true}).click();
    const modelOil=page.getByRole("dialog",{name:"엔진오일 관리"});
    await modelOil.getByText("6,000 km",{exact:true}).waitFor();
    await modelOil.getByRole("button",{name:"주기 수정"}).click();
    const modelOilCycle=page.getByRole("dialog",{name:"엔진오일 교체 주기"});
    assert.equal(await modelOilCycle.getByLabel("교체 거리 (km)").inputValue(),"6000");
    assert.ok(Number(await modelOilCycle.getByLabel("예상 교체 비용 (원)").inputValue())>0,
      "estimated price is prefilled in the model editor");
    await modelOilCycle.getByLabel("교체 거리 (km)").fill("2600");
    await modelOilCycle.getByLabel("예상 교체 비용 (원)").fill("24000");
    await modelOilCycle.getByRole("button",{name:"주기·비용 저장"}).click();
    await modelOilCycle.waitFor({state:"hidden"});
    assert.equal(modelSettings.find(x=>x.model_key==="honda-pcx125"&&x.item_key==="엔진오일").interval_km,2600);
    await modelOil.getByRole("button",{name:"닫기"}).click();
    await page.getByRole("button",{name:"모델 선택",exact:true}).click();
    await chooseModel.getByLabel("모델 검색").fill("NMAX125");
    await chooseModel.getByRole("button",{name:"야마하 NMAX125 선택"}).click();
    await chooseModel.waitFor({state:"hidden"});
    assert.equal(vehicle.model_key,"yamaha-nmax125");
    assert.equal(modelSettings.find(x=>x.model_key==="honda-pcx125"&&x.item_key==="엔진오일").interval_km,2600,
      "previous bike edits remain scoped to previous model");
    await page.getByRole("button",{name:"구동벨트 관리"}).click();
    const nmaxBelt=page.getByRole("dialog",{name:"구동벨트 관리"});
    await nmaxBelt.getByText("18,000 km",{exact:true}).waitFor();
    await nmaxBelt.getByRole("button",{name:"닫기"}).click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
    console.log("PASS mobile forms, retry, history and timeline",width,height);
  } finally {await context.close();}
}
(async()=>{const watchdog=setTimeout(()=>{console.error("mobile browser test timed out");process.exit(2);},150000);const browser=await chromium.launch({executablePath:process.env.RIDER_CHROMIUM,args:["--no-sandbox"]});
try{await run(browser,412,892);await run(browser,360,400);}finally{clearTimeout(watchdog);await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
