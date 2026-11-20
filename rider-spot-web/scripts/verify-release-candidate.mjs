import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const candidate = process.env.RIDER_CANDIDATE_URL || "https://f764543b-rider-spot.jazzhjm.workers.dev";
const staging = "https://rider-spot-static-preview.jazzhjm.workers.dev";
const production = "https://rider-spot.jazzhjm.workers.dev";
const out = {checkedAt:new Date().toISOString(),candidate,staging,production,tests:[],passed:false};
const check=(name,ok,details={})=>{
  out.tests.push({name,passed:!!ok,...details});
  assert.ok(ok,name+" "+JSON.stringify(details).slice(0,250));
};
const get=async(origin,path,headers={})=>{
  const response=await fetch(origin+path,{method:"GET",headers:{accept:"*/*",...headers},redirect:"manual",signal:AbortSignal.timeout(25000)});
  const body=await response.text();
  return {status:response.status,body,contentType:(response.headers.get("content-type")||"").split(";")[0],
    cookie:response.headers.get("set-cookie")||"",cache:response.headers.get("cache-control")||""};
};
const sha=(s)=>createHash("sha256").update(s).digest("hex");
try{
  const [staged,cand]=await Promise.all([get(staging,"/"),get(candidate,"/")]);
  check("candidate shell and staging return HTTP 200",staged.status===200&&cand.status===200,{staged:staged.status,candidate:cand.status});
  check("native recovery guard remains attached",staged.body.includes("rs-recovery-guard-v217")&&cand.body.includes("rs-recovery-guard-v217"));
  check("candidate release hash",cand.body.includes("/assets/rider-spot-16c1eecf6bac/app.mjs"));
  check("single app root",(cand.body.match(/id="root"/g)||[]).length===1);
  const paths=[
    ["/sw.js",200],
    ["/assets/rider-spot-16c1eecf6bac/premium-shell.css",200],
    ["/rider-spot-shell-v40.js",200],
    ["/rider-gps-recovery-v42.js?gps=v50",200],
    ["/assets/rider-spot-06a4d2f6010a/premium-shell.css",200],
    ["/mapdata/manifest.json",200],
    ["/api/weather?lat=0&lon=0",400],
    ["/api/route-match",405]
  ];
  for (const [path,status] of paths) {
    const [live,preview,version]=await Promise.all([
      get(production,path),get(staging,path),get(candidate,path)
    ]);
    const originalExpected=path.includes("/assets/rider-spot-16c1eecf6bac/") ? 404 : status;
    check("candidate path parity "+path,version.status===status&&preview.status===status&&live.status===originalExpected,{
      path,original:live.status,staging:preview.status,candidate:version.status});
    check("candidate payload parity "+path,sha(version.body)===sha(preview.body),{path,bytes:version.body.length});
  }
  const nonce="a".repeat(32);
  const [login,versionLogin]=await Promise.all([
    get(staging,"/",{cookie:"rs_android_oauth="+nonce}),
    get(candidate,"/",{cookie:"rs_android_oauth="+nonce})
  ]);
  check("OAuth callback bypasses SPA guard",versionLogin.status===200&&
    versionLogin.body.includes("riderspot-oauth://signin/callback")&&!versionLogin.body.includes("rs-recovery-guard-v217"));
  check("OAuth callback matches staging",sha(login.body)===sha(versionLogin.body));
  check("OAuth nonce cookie expires and callback is uncached",
    versionLogin.cookie.includes("Max-Age=0")&&versionLogin.cache.includes("no-store"));
  const news=await get(candidate,"/api/industry-news");
  let parsed;try{parsed=JSON.parse(news.body)}catch{parsed=null}
  check("news endpoint retains supported response shape",
    [200,502].includes(news.status)&&news.contentType==="application/json"&&Array.isArray(parsed?.items),
    {status:news.status,items:parsed?.items?.length});
  if(news.status===502)out.warning="Industry news upstream unavailable; endpoint responds with safe JSON fallback.";
  out.passed=true;
}catch(e){out.error=String(e?.stack||e).slice(0,1600);process.exitCode=1}
finally{
  writeFileSync("release-candidate-qa.json",JSON.stringify(out,null,2)+"\n");
  console.log("RIDER_RELEASE_CANDIDATE_QA "+JSON.stringify(out));
}
