import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeFileSync} from "node:fs";

const production="https://rider-spot.jazzhjm.workers.dev";
const staging="https://rider-spot-static-preview.jazzhjm.workers.dev";
const report={at:new Date().toISOString(),production,staging,checks:[],warnings:[],passed:false};
const check=(label,ok,info="")=>{report.checks.push({label,passed:!!ok,info:String(info).slice(0,180)});assert.ok(ok,label+": "+info);};
const get=async(base,path)=>{const res=await fetch(base+path,{headers:{"cache-control":"no-cache"},signal:AbortSignal.timeout(30000)});return {status:res.status,type:(res.headers.get("content-type")||"").split(";")[0],body:await res.text()};};
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
 const [oldApi,currentApi]=await Promise.all([get(production,"/api/industry-news"),get(staging,"/api/industry-news")]);
 check("read-only API status/type parity",oldApi.status===currentApi.status&&oldApi.type===currentApi.type,oldApi.status+"/"+currentApi.status);
 if(oldApi.status>=500)report.warnings.push("Both APIs returned "+oldApi.status+"; parity is not health.");
 report.passed=true;
}catch(e){report.error=String(e?.stack||e).slice(0,1400);process.exitCode=1;}
finally{
 writeFileSync("backend-staging-qa.json",JSON.stringify(report,null,2)+"\n");
 console.log("BACKEND_STAGING_QA "+JSON.stringify(report));
}
