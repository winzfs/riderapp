import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeFileSync} from "node:fs";

const production="https://rider-spot.jazzhjm.workers.dev";
const staging="https://rider-spot-static-preview.jazzhjm.workers.dev";
const report={at:new Date().toISOString(),production,staging,checks:[],warnings:[],passed:false};
const check=(label,ok,info="")=>{report.checks.push({label,passed:!!ok,info:String(info).slice(0,180)});assert.ok(ok,label+": "+info);};
const get=async(base,path,headers={})=>{const res=await fetch(base+path,{headers:{"cache-control":"no-cache",...headers},redirect:"manual",signal:AbortSignal.timeout(30000)});return {status:res.status,type:(res.headers.get("content-type")||"").split(";")[0],body:await res.text(),cookie:res.headers.get("set-cookie")||"",cache:res.headers.get("cache-control")||""};};
const hash=s=>createHash("sha256").update(s).digest("hex");
try{
 const [live,preview]=await Promise.all([get(production,"/"),get(staging,"/")]);
 check("both shells return HTTP 200",live.status===200&&preview.status===200,live.status+"/"+preview.status);
 check("native recovery guard is preserved",live.body.includes("rs-recovery-guard-v217")&&preview.body.includes("rs-recovery-guard-v217"));
 check("pinned candidate app present",preview.body.includes("/assets/rider-spot-16c1eecf6bac/app.mjs"));
 check("single application root",(preview.body.match(/id="root"/g)||[]).length===1);
 const sw=await get(staging,"/sw.js");
 check("service worker preserved; no forced activation",sw.status===200&&sw.body.includes("rider-spot-shell-16c1eecf6bac")&&!sw.body.includes("skipWaiting("));
 const css=await get(staging,"/assets/rider-spot-16c1eecf6bac/premium-shell.css");
 check("new CSS is available",css.status===200&&css.body.includes("outline:0!important"));
 const map=await get(staging,"/mapdata/manifest.json");
 check("public map data available",map.status===200&&!!JSON.parse(map.body).counts);
 for(const path of ["/rider-spot-shell-v40.js","/rider-gps-recovery-v42.js?gps=v50","/assets/rider-spot-06a4d2f6010a/premium-shell.css"]){
  const [old,current]=await Promise.all([get(production,path),get(staging,path)]);
  check("legacy file parity "+path,old.status===200&&current.status===200&&hash(old.body)===hash(current.body),old.status+"/"+current.status);
 }
 // End-to-end callback checks use a synthetic nonce; no user token or data are touched.
 const nonce="a".repeat(32);
 const [authOld,authNew]=await Promise.all([
   get(production,"/",{cookie:"rs_android_oauth="+nonce}),
   get(staging,"/",{cookie:"rs_android_oauth="+nonce})
 ]);
 check("native OAuth callback HTTP and deep-link parity",authOld.status===200&&authNew.status===200&&
   authOld.body.includes("riderspot-oauth://signin/callback")&&authNew.body.includes("riderspot-oauth://signin/callback"));
 check("native OAuth nonce cookie invalidated",authOld.cookie.includes("Max-Age=0")&&authNew.cookie.includes("Max-Age=0"));
 check("native OAuth callback never cached",authOld.cache.includes("no-store")&&authNew.cache.includes("no-store"));
 for(const path of ["/api/weather?lat=0&lon=0","/api/route-match"]){
   const [old,next]=await Promise.all([get(production,path),get(staging,path)]);
   check("API validation parity "+path,old.status===next.status&&old.type===next.type&&hash(old.body)===hash(next.body),
     old.status+"/"+next.status);
 }
 const [oldApi,currentApi]=await Promise.all([get(production,"/api/industry-news"),get(staging,"/api/industry-news")]);
 const okNews=entry=>[200,502].includes(entry.status)&&entry.type==="application/json"&&
   Array.isArray(JSON.parse(entry.body).items);
 check("news endpoint shape and compatible status",okNews(oldApi)&&okNews(currentApi),oldApi.status+"/"+currentApi.status);
 if(oldApi.status>=500||currentApi.status>=500)
   report.warnings.push("Industry-news upstream returned "+oldApi.status+"/"+currentApi.status+"; status may vary by request, not API health.");
 report.passed=true;
}catch(e){report.error=String(e?.stack||e).slice(0,1400);process.exitCode=1;}
finally{
 writeFileSync("backend-staging-qa.json",JSON.stringify(report,null,2)+"\n");
 console.log("BACKEND_STAGING_QA "+JSON.stringify(report));
}
