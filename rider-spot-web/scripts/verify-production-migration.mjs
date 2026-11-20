import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeFileSync} from "node:fs";

const live="https://rider-spot.jazzhjm.workers.dev";
const tested="https://rider-spot-static-preview.jazzhjm.workers.dev";
const expectedRelease="/assets/rider-spot-16c1eecf6bac/";
const report={startedAt:new Date().toISOString(),live,reference:tested,checks:[],passed:false};
const sha=body=>createHash("sha256").update(body).digest("hex");
const check=(name,ok,data={})=>{report.checks.push({name,passed:!!ok,...data});assert.ok(ok, name+" "+JSON.stringify(data))};
const get=async(base,path,headers={})=>{
  const r=await fetch(base+path,{redirect:"manual",headers:{"cache-control":"no-cache",...headers},signal:AbortSignal.timeout(25000)});
  return {status:r.status,body:await r.text(),mime:(r.headers.get("content-type")||"").split(";")[0],headers:r.headers};
};
try {
  const [a,b]=await Promise.all([get(live,"/"),get(tested,"/")]);
  check("live frontend and test HTML 200",a.status===200&&b.status===200,{live:a.status,test:b.status});
  check("current release references pinned CSS and JS",a.body.includes(expectedRelease+"app.mjs")&&a.body.includes(expectedRelease+"premium-shell.css"));
  check("native recovery guard included only once",a.body.includes("rs-recovery-guard-v217")&&(a.body.match(/id="rs-recovery-guard-v217"/g)||[]).length===1);
  check("HTML matches vetted staging version",sha(a.body)===sha(b.body));
  check("no-cache on HTML",a.headers.get("cache-control")?.includes("no-store"));
  for(const path of ["/sw.js",expectedRelease+"app.mjs",expectedRelease+"premium-shell.css",
    "/rider-spot-shell-v40.js","/rider-gps-recovery-v42.js?gps=v50",
    "/assets/rider-spot-06a4d2f6010a/premium-shell.css","/mapdata/manifest.json"]){
    const [liveRes,testRes]=await Promise.all([get(live,path),get(tested,path)]);
    check("HTTP status and byte parity "+path,liveRes.status===200&&testRes.status===200&&sha(liveRes.body)===sha(testRes.body),
      {path,liveStatus:liveRes.status,testStatus:testRes.status,liveSize:liveRes.body.length});
    if(path==="/sw.js")check("no forced activation or skipped pending client",!liveRes.body.includes("skipWaiting("));
  }
  const nonce="a".repeat(32);
  const oauth=await get(live,"/",{cookie:"rs_android_oauth="+nonce});
  check("native login callback and app deep link are intact",
    oauth.status===200&&oauth.body.includes("riderspot-oauth://signin/callback")&&!oauth.body.includes("rs-recovery-guard-v217"));
  check("native login callback is uncached and clears nonce",
    oauth.headers.get("cache-control")?.includes("no-store")&&oauth.headers.get("set-cookie")?.includes("Max-Age=0"));
  for(const [path,status] of [["/api/weather?lat=0&lon=0",400],["/api/route-match",405]]){
    const [res,expected]=await Promise.all([get(live,path),get(tested,path)]);
    check("API negative validation parity "+path,res.status===status&&expected.status===status&&sha(res.body)===sha(expected.body),
      {path,liveStatus:res.status,testStatus:expected.status});
  }
  const news=await get(live,"/api/industry-news");
  let json;try{json=JSON.parse(news.body)}catch{json=null}
  check("news endpoint valid JSON including transient upstream error", 
    [200,502].includes(news.status)&&Array.isArray(json?.items),{status:news.status});
  report.passed=true;
} catch(e) {report.error=String(e?.stack||e).slice(0,1600);process.exitCode=1}
finally{
  writeFileSync("production-migration-qa.json",JSON.stringify(report,null,2)+"\n");
  console.log("RIDER_PRODUCTION_MIGRATION_QA "+JSON.stringify(report));
}
