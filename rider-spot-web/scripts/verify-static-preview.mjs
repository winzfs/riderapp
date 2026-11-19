import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.env.RIDER_PREVIEW_URL || "https://rider-spot-static-preview.jazzhjm.workers.dev";
const rel=JSON.parse(readFileSync("prebuilt/release.json","utf8"));
const report={at:new Date().toISOString(),origin:root,releaseHash:rel.hash,checks:[],passed:false};
const expectedAssets=new Set(rel.files);
function check(name,condition,details="") {
  report.checks.push({name,passed:!!condition,details:String(details).slice(0,250)});
  assert.ok(condition,name+": "+details);
}
async function get(path) {
  const res=await fetch(root+path,{headers:{"cache-control":"no-cache"},signal:AbortSignal.timeout(35000)});
  const txt=await res.text();
  check("HTTP 200 "+path,res.status===200,"HTTP "+res.status+" "+txt.slice(0,180));
  return txt;
}
try {
  const html=await get("/");
  check("new hashed HTML",html.includes("/assets/rider-spot-"+rel.hash+"/app.mjs"));
  check("new premium stylesheet reference",html.includes("/assets/rider-spot-"+rel.hash+"/premium-shell.css"));
  check("existing native recovery guard preserved",html.includes("rs-recovery-guard-v217"));
  check("single app root",html.includes('id="root"'));
  const css=await get("/assets/rider-spot-"+rel.hash+"/premium-shell.css");
  check("finance selected graph outline removed",css.includes("outline:0!important")&&css.includes("v219 visual refinement"));
  check("CSS equals GitHub verified release",css===readFileSync("prebuilt/premium-shell.css","utf8"));
  const app=await get("/assets/rider-spot-"+rel.hash+"/app.mjs");
  check("native UI module loaded",app.length>1_000_000,"size "+app.length);
  const design=await get("/assets/rider-spot-"+rel.hash+"/design-system.css");
  check("design system loaded",design.length>100_000,"size "+design.length);
  const serviceWorker=await get("/sw.js");
  check("current no-forced-reload service worker",serviceWorker.includes("rider-spot-shell-"+rel.hash));
  check("no immediate skipWaiting introduced",!serviceWorker.includes("skipWaiting("));
  const previousCss=await get("/assets/rider-spot-06a4d2f6010a/premium-shell.css");
  check("previous release immutable assets still accessible",previousCss.length>1000);
  const legacy=await get("/rider-spot-shell-v40.js");
  check("legacy static route kept",legacy.includes("rs-native-shell")&&legacy.length>100,"size "+legacy.length);
  // Read-only parity test for one existing API. No trips, riders or records are mutated.
  const [oldAPI,newAPI]=await Promise.all([
    fetch("https://rider-spot.jazzhjm.workers.dev/api/industry-news",{signal:AbortSignal.timeout(35000)}),
    fetch(root+"/api/industry-news",{signal:AbortSignal.timeout(35000)})
  ]);
  check("read-only API response status parity",oldAPI.status===newAPI.status,
    "original "+oldAPI.status+" candidate "+newAPI.status);
  check("read-only API content type parity",
    (oldAPI.headers.get("content-type")||"").split(";")[0]===(newAPI.headers.get("content-type")||"").split(";")[0]);
  const manifest=await get("/mapdata/manifest.json");
  const json=JSON.parse(manifest);
  check("existing public map data loaded",!!json.counts);
  check("built manifest keeps CSS",expectedAssets.has("/assets/rider-spot-"+rel.hash+"/premium-shell.css"));
  report.passed=true;
} catch(error) {
  report.error=String(error?.stack||error).slice(0,1300);
  process.exitCode=1;
} finally {
  writeFileSync(resolve("docs/static-preview-qa.json"),JSON.stringify(report,null,2)+"\n");
  console.log("PREVIEW QA",JSON.stringify(report));
}
