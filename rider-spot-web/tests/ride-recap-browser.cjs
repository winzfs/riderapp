"use strict";
const { chromium }=require("playwright");
const http=require("node:http");
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const mime=filename=>filename.endsWith(".mjs")?"application/javascript; charset=utf-8":"text/html; charset=utf-8";
(async()=>{
  const server=http.createServer((request,response)=>{
    const requested=new URL(request.url,"http://localhost").pathname;
    const filename=requested==="/mapdata/admin.json"?
      path.resolve(root,"data/korean-map/admin.json"):path.resolve(root,"."+requested);
    if(requested==="/"){response.writeHead(200,{"content-type":mime("index.html")});response.end("<!doctype html><html lang='ko'><head><meta charset='utf-8'><link rel='stylesheet' href='https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css'></head><body><canvas id='recap'></canvas></body></html>");return;}
    if(!filename.startsWith(root+path.sep)||(!filename.endsWith(".mjs")&&!filename.endsWith("admin.json"))){response.writeHead(404);response.end();return;}
    fs.readFile(filename,(error,data)=>{
      if(error){response.writeHead(404);response.end();return;}
      response.writeHead(200,{"content-type":filename.endsWith(".json")?"application/json; charset=utf-8":mime(filename),"cache-control":"no-store"});
      response.end(data);
    });
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
    const page=await browser.newPage({viewport:{width:1150,height:1600},timezoneId:"Asia/Seoul"});
    const errors=[];page.on("pageerror",error=>errors.push(error.message));
    await page.goto(base+"/",{waitUntil:"load"});
    const evidence=await page.evaluate(async()=>{
      const {buildRecapSnapshot,renderRecapCanvas}=await import("/src/ride-recap.mjs");
      const date="2026-11-21";
      const hist=[{
        id:"qa-ride",started_at:"2026-11-21T10:00:00Z",
        ended_at:"2026-11-21T15:15:00Z",distance_km:65.4,
        points:[{lat:35.169,lng:126.812,t:1795255200000},
          {lat:35.176,lng:126.825,t:1795255300000},
          {lat:35.19,lng:126.834,t:1795255400000},
          {lat:35.171,lng:126.856,t:1795255500000}]
      }];
      const finance={earnings:[{work_date:date,platform:"쿠팡이츠",gross_won:112500,deliveries:20,expenses_won:2000,expense_scope:"other_only"}],
        fuel:[{fueled_on:date,cost_won:6000}],maintenance:[],extras:[]};
      const recap=buildRecapSnapshot(hist,date,finance),canvas=document.querySelector("canvas");
      const summaries=[];
      for(const [mode,ratio,theme] of [["all","4:5","light"],["route","9:16","mist"],["finance","1:1","night"]]){
        renderRecapCanvas(canvas,recap,{mode,ratio,theme,showRoute:true,showIncome:true});
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
        const pixels=canvas.getContext("2d").getImageData(5,5,1,1).data;
        summaries.push({mode,ratio,theme,width:canvas.width,height:canvas.height,size:blob?.size||0,alpha:pixels[3]});
      }
      renderRecapCanvas(canvas,recap,{mode:"all",ratio:"4:5",showRoute:false,showIncome:false});
      const privatePng=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
      return {summaries,privateSize:privatePng?.size||0,cost:recap.cost,net:recap.net};
    });
    assert.deepEqual(evidence.summaries.map(x=>[x.width,x.height]),[[1080,1350],[1080,1920],[1080,1080]]);
    assert.ok(evidence.summaries.every(x=>x.size>20000&&x.alpha===255),"Invalid PNG data");
    assert.ok(evidence.privateSize>15000);
    assert.equal(evidence.cost,8000);assert.equal(evidence.net,104500);
    assert.deepEqual(errors,[]);
    const dir=process.env.RIDER_RECAP_SCREENSHOTS||"/tmp/rider-spot-recap";
    fs.mkdirSync(dir,{recursive:true});
    // Ten independent PNGs, not mocked CSS captures. Each variant uses the
    // production Canvas drawing function and a source-accurate GPS history.
    const cases=["same-place","nearby","far-away","complex-route","no-deliveries",
      "no-earnings","zero-cost","recorded-cost","private-income","no-gps"];
    for(const scenario of cases){
      const report=await page.evaluate(async scenario=>{
        const {buildRecapSnapshot,renderRecapCanvas}=await import("/src/ride-recap.mjs");
        const day="2026-11-21",t=Date.parse("2026-11-21T10:00:00Z");
        const p=(lat,lng,n)=>({lat,lng,t:t+n*100000});
        let points=[
          p(35.169,126.812,0),p(35.181,126.835,1),p(35.185,126.856,2)
        ];
        if(scenario==="same-place")points.push(p(35.169,126.812,3));
        if(scenario==="nearby")points.push(p(35.16914,126.81205,3));
        if(scenario==="complex-route")points=Array.from({length:45},(_,i)=>({
          lat:35.17+0.009*Math.sin(i*.33),lng:126.82+0.012*Math.cos(i*.30),
          t:t+i*45000
        }));
        if(scenario==="no-gps")points=[];
        const trip={id:"qa-"+scenario,started_at:"2026-11-21T10:00:00Z",
          ended_at:"2026-11-21T11:00:00Z",distance_km:scenario==="no-gps"?0:16.3,points};
        const money={work_date:day,platform:"쿠팡이츠",gross_entered:true,
          gross_won:112500,deliveries:scenario==="no-deliveries"?undefined:18,
          expense_scope:"other_only",expenses_won:scenario==="recorded-cost"?2500:0};
        const finance=scenario==="no-earnings"?null:{
          earnings:[money],fuel:scenario==="recorded-cost"?[{fueled_on:day,cost_won:3500}]:[],
          maintenance:[],extras:[]};
        const recap=buildRecapSnapshot([trip],day,finance);
        const canvas=document.querySelector("#recap");
        renderRecapCanvas(canvas,recap,{mode:"all",ratio:"4:5",theme:"light",
          showRoute:true,showIncome:scenario!=="private-income"});
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
        return {width:canvas.width,height:canvas.height,bytes:blob?.size||0,
          segments:recap.segments.length,deliveries:recap.deliveries,
          gross:recap.gross,cost:recap.cost,costKnown:recap.costKnown};
      },scenario);
      assert.deepEqual([report.width,report.height],[1080,1350],scenario);
      assert.ok(report.bytes>18000,"Small/empty PNG "+scenario+": "+JSON.stringify(report));
      if(scenario==="no-earnings")assert.equal(report.gross,null);
      if(scenario==="no-deliveries")assert.equal(report.deliveries,null);
      if(scenario==="no-gps")assert.equal(report.segments,0);
      if(scenario==="zero-cost")assert.equal(report.cost,0);
      if(scenario==="recorded-cost")assert.equal(report.cost,6000);
      const png=await page.locator("#recap").screenshot({path:path.join(dir,"scenario-"+scenario+".png")});
      assert.equal(png.readUInt32BE(16),1080);
      assert.equal(png.readUInt32BE(20),1350);
      console.log("RECAP_SCENARIO_PNG_PASS",scenario,JSON.stringify(report));
    }
    await page.locator("canvas").screenshot({path:path.join(dir,"privacy-preview.png")});
    const mapEvidence=await page.evaluate(async()=>{
      const {loadRideRecapBasemap}=await import("/src/ride-recap-map.mjs");
      const {renderRecapCanvas,buildRecapSnapshot}=await import("/src/ride-recap.mjs");
      const samples=[
        {lat:35.169,lng:126.812,t:1795255200000},
        {lat:35.176,lng:126.825,t:1795255300000},
        {lat:35.19,lng:126.834,t:1795255400000},
        {lat:35.171,lng:126.856,t:1795255500000},
      ];
      const ride=buildRecapSnapshot([{id:"qa",started_at:"2026-11-21T10:00:00Z",
        ended_at:"2026-11-21T15:15:00Z",distance_km:65.4,points:samples}],"2026-11-21");
      const snapshot=await loadRideRecapBasemap(ride.segments,{width:920,height:920});
      const canvas=document.querySelector("canvas");
      renderRecapCanvas(canvas,ride,{mode:"all",ratio:"4:5",mapSnapshot:snapshot});
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
      return {hasBasemap:snapshot?.hasBasemap,labels:snapshot?.labels?.map(x=>x.name)||[],
        mapWidth:snapshot?.image?.naturalWidth,bytes:blob?.size};
    });
    assert.ok(mapEvidence.hasBasemap,"Real OpenFreeMap export required");
    assert.ok(mapEvidence.mapWidth>500,"Basemap render too narrow");
    assert.ok(mapEvidence.labels.some(name=>name.endsWith("동")),"Korean administrative dong labels missing");
    assert.ok(mapEvidence.bytes>25000,"Real map PNG too small");
    await page.locator("canvas").screenshot({path:path.join(dir,"real-korean-map-recap.png")});
    console.log("RECAP_REAL_MAP_AND_DONG_PASS",JSON.stringify(mapEvidence));
    console.log("RECAP_BROWSER_PNG_PASS",JSON.stringify(evidence));
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
