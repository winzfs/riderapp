import assert from "node:assert/strict";
import { readFileSync,writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename,join } from "node:path";
const origin=process.env.RIDER_PREVIEW_URL||"https://rider-spot-static-preview.jazzhjm.workers.dev";
const manifest=JSON.parse(readFileSync("prebuilt/release.json","utf8"));
const report={at:new Date().toISOString(),origin,hash:manifest.hash,checked:0,total:manifest.files.length,errors:[],passed:false};
const digest=b=>createHash("sha256").update(b).digest("hex");
const err=(path,message)=>report.errors.push({path,message:String(message).slice(0,450)});
async function verify(path) {
  try{
    const res=await fetch(origin+path,{headers:{"cache-control":"no-cache"},signal:AbortSignal.timeout(35000)});
    assert.equal(res.status,200,"HTTP "+res.status);
    assert.equal(res.headers.get("x-rs-preview-asset-origin"),"workers-kv",
      "not served by Workers KV");
    let actual=Buffer.from(await res.arrayBuffer());
    const expectedFile=path.startsWith("/mapdata/")?"data/korean-map/"+basename(path):
      path.startsWith("/assets/")?"prebuilt/"+basename(path):
      path==="/index.html"?"prebuilt/index.html":"prebuilt/sw.js";
    if(path==="/index.html") {
      const html=actual.toString("utf8");
      assert.ok(html.includes("rs-recovery-guard-v217"),"missing native recovery guard");
      actual=Buffer.from(html.replace(/<script id="rs-recovery-guard-v217">[\s\S]*?<\/script>/,""),"utf8");
    }
    const expected=readFileSync(expectedFile);
    assert.equal(digest(actual),digest(expected),
      "bytes changed between pinned build and Worker KV");
    report.checked++;
  }catch(e){err(path,e.message||e)}
}
for(let i=0;i<manifest.files.length;i+=5){
  await Promise.all(manifest.files.slice(i,i+5).map(verify));
}
report.passed=report.errors.length===0&&report.checked===report.total;
writeFileSync("docs/static-preview-bundle-qa.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report));
if(!report.passed)process.exitCode=1;
