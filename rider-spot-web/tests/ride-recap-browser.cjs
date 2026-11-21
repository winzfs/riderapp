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
    const filename=path.resolve(root,"."+requested);
    if(requested==="/"){response.writeHead(200,{"content-type":mime("index.html")});response.end("<!doctype html><html lang='ko'><head><meta charset='utf-8'></head><body><canvas id='recap'></canvas></body></html>");return;}
    if(!filename.startsWith(root+path.sep)||!filename.endsWith(".mjs")){response.writeHead(404);response.end();return;}
    fs.readFile(filename,(error,data)=>{
      if(error){response.writeHead(404);response.end();return;}
      response.writeHead(200,{"content-type":mime(filename),"cache-control":"no-store"});
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
          {lat:35.176,lng:126.825,t:1795255500000},
          {lat:35.19,lng:126.834,t:1795255800000},
          {lat:35.171,lng:126.856,t:1795256100000}]
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
    await page.locator("canvas").screenshot({path:path.join(dir,"privacy-preview.png")});
    console.log("RECAP_BROWSER_PNG_PASS",JSON.stringify(evidence));
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
