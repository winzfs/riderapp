import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir=dirname(fileURLToPath(import.meta.url));
const token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!token||!account)throw new Error("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID");
const html=readFileSync(join(dir,"index.html"),"utf8");
const worker=`export default { async fetch(request,env) {
  const url=new URL(request.url);
  if(url.pathname==="/api/status"){
    let status=0,reachable=false;
    try {
      const result=await env.RIDER_SPOT.fetch("https://rider-spot.jazzhjm.workers.dev/",{method:"GET",redirect:"follow",signal:AbortSignal.timeout(6000)});
      status=result.status;reachable=result.ok;if(result.body)result.body.cancel();
    } catch(_) {}
    return new Response(JSON.stringify({reachable,status,checked_at:new Date().toISOString(),method:"GET"}),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  }
  if(url.pathname!=="/"&&url.pathname!=="/index.html")return new Response("Not Found",{status:404});
  return new Response(${JSON.stringify(html)},{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-cache","x-robots-tag":"noindex, nofollow","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
} }`;
const form=new FormData();
form.append("metadata",new Blob([JSON.stringify({main_module:"worker.js",compatibility_date:"2026-11-01",bindings:[{type:"service",name:"RIDER_SPOT",service:"rider-spot",environment:"production"}]})],{type:"application/json"}));
form.append("worker.js",new Blob([worker],{type:"application/javascript+module"}),"worker.js");
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/rider-spot-qa`;
const headers={Authorization:`Bearer ${token}`};
async function send(url,method,body){
  const response=await fetch(url,{method,headers:body?headers:{...headers,"Content-Type":"application/json"},body});
  const result=await response.json();
  if(!response.ok||result.success===false)throw Error(JSON.stringify(result.errors||result));
  return result;
}
console.log("Uploading rider-spot-qa...");
await send(base,"PUT",form);
await send(base+"/subdomain","POST",JSON.stringify({enabled:true,previews_enabled:true}));
console.log("Deployed https://rider-spot-qa.jazzhjm.workers.dev/");
