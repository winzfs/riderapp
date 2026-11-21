/*
 * Rider Spot URBAN FLOW v11: pinned, read-only immutable release gateway.
 * No GPS or trip mutation. Preserve previous asset generations so an Android
 * WebView mid-session cannot lose its already fetched hashed assets.
 */
export const RELEASE_HASH="d42cbe2bbf4d";
export const PINNED_COMMIT="c6f5355ce76ade3796df5d78b42322928a53da4c";
const ROOT="https://raw.githubusercontent.com/winzfs/riderapp/";
const ROOT_DIR="/rider-spot-web/prebuilt/";
const RAW=ROOT+PINNED_COMMIT+ROOT_DIR;
const PREFIX="/assets/rider-spot-"+RELEASE_HASH+"/";
const CURRENT_KEY="rs-asset-v11::";
const MAP_DATA_KEY="rs-asset-v1::";
const STATIC=["app.mjs","route-worker.mjs","native-gps.js","map-reports.js",
 "design-system.css","workspace-tools.js","tab-resume.js","daily-timeline.css",
 "weather-bar.js","weather-bar.css","premium-shell.css","renewal-layout.css"];
const ASSETS=new Set([...STATIC,"curated-v9.css"]);
const PREVIOUS=[
 {hash:"66179994a862",commit:"5396983c08640b47c82593faeb52eadc1d4b270c",key:"rs-asset-v10::",css:"curated-v9.css"},
 {hash:"83bc9b4b6cf8",commit:"5ba17964ff068961badc3b738372c85547e55560",key:"rs-asset-v10::",css:"curated-v9.css"},
 {hash:"a42623dd9d1b",commit:"e643eadf39e0c3c8d6aae88a9d29816516140661",key:"rs-asset-v9::",css:"curated-v9.css"},
 {hash:"7ba6f9cb1359",commit:"f7ae89197b740f47afb0d8f388fbd7e5607ae89e",key:"rs-asset-v8::",css:"atelier-v8.css"},
 {hash:"bbd2531a1e8d",commit:"a4a2173abd52739ce9051e4c404e20c8fbb2c79a",key:"rs-asset-v7::",css:"editorial-v7.css"},
 {hash:"7d1f0f0bb6bc",commit:"339bd3b10f885e2430145e6da3c09cfa9cbc47b2",key:"rs-asset-v7::",css:"editorial-v7.css"},
 {hash:"73e1a8532289",commit:"41eb55bc82dc6096d145896db57c4d34828398c3",key:"rs-asset-v7::",css:"editorial-v7.css"},
 {hash:"e30517cbf40f",commit:"3a010f4866f18098b5ddf9a35eed06e7261067fd",key:"rs-asset-v6::",css:"urban-editorial-v6.css"},
 {hash:"3305352a56bc",commit:"761432d6af30232b06e983a84c535d33236d043c",key:"rs-asset-v5::",css:"urban-editorial-v5.css"},
 {hash:"8eb44596629f",commit:"b715913001e0b55f2d29cbc17acdb72d35a025aa",key:"rs-asset-v4::",css:null}
];
function lookup(path){
 if(path==="/"||path==="/index.html")return {key:CURRENT_KEY+"shell/"+RELEASE_HASH+"/index.html",file:"index.html"};
 if(path==="/sw.js")return {key:CURRENT_KEY+"shell/"+RELEASE_HASH+"/sw.js",file:"sw.js"};
 if(path.startsWith(PREFIX)){
  const file=path.slice(PREFIX.length);
  return ASSETS.has(file)?{key:CURRENT_KEY+path,file,immutable:true}:null;
 }
 for(const previous of PREVIOUS){
  const prefix="/assets/rider-spot-"+previous.hash+"/";
  if(path.startsWith(prefix)){
   const file=path.slice(prefix.length);
   return STATIC.includes(file)||file===previous.css ?
    {key:previous.key+path,file,immutable:true,raw:ROOT+previous.commit+ROOT_DIR,release:previous.hash}:null;
  }
 }
 if(/^\/mapdata\/(?:admin|government|manifest|t\d+-\d+)\.json$/.test(path))
  return {key:MAP_DATA_KEY+path,mapData:true};
 return null;
}
function contentType(path){
 if(path==="/"||path.endsWith(".html"))return "text/html; charset=utf-8";
 if(path.endsWith(".css"))return "text/css; charset=utf-8";
 if(path.endsWith(".json"))return "application/json; charset=utf-8";
 return "application/javascript; charset=utf-8";
}
export default {
 async fetch(request,env,ctx){
  if(request.method!=="GET"&&request.method!=="HEAD")
   return new Response("Method not allowed",{status:405,headers:{allow:"GET, HEAD"}});
  const path=new URL(request.url).pathname,entry=lookup(path);
  if(!entry)return new Response("Not found",{status:404,headers:{"cache-control":"no-store"}});
  let bytes;
  try {bytes=await env.RS_ASSETS.get(entry.key,"arrayBuffer");}
  catch {return new Response("Asset KV temporarily unavailable",{status:503,headers:{"cache-control":"no-store"}});}
  if(bytes===null&&entry.mapData)return new Response("Map dataset not found",{status:404,headers:{"cache-control":"no-store"}});
  if(bytes===null){
   let remote;
   try {remote=await fetch((entry.raw||RAW)+entry.file,{headers:{accept:"*/*"},redirect:"follow"});}
   catch {return new Response("Immutable asset upstream unavailable",{status:503,headers:{"cache-control":"no-store"}});}
   if(!remote.ok)return new Response("Immutable asset not found",{status:503,headers:{"cache-control":"no-store"}});
   bytes=await remote.arrayBuffer();
   if(!bytes.byteLength||bytes.byteLength>4_000_000)
    return new Response("Unexpected immutable asset size",{status:503,headers:{"cache-control":"no-store"}});
   if(entry.file==="index.html"&&!new TextDecoder().decode(bytes).includes(PREFIX+"app.mjs"))
    return new Response("Unexpected immutable app shell",{status:503,headers:{"cache-control":"no-store"}});
   ctx.waitUntil(env.RS_ASSETS.put(entry.key,bytes).catch(()=>{}));
  }
  const headers=new Headers({
   "content-type":contentType(path),
   "cache-control":entry.immutable?"public, max-age=31536000, immutable":entry.mapData?"public, max-age=3600":"no-store",
   "x-content-type-options":"nosniff",
   "x-rs-preview-asset-origin":"workers-kv",
   "x-rs-release":entry.release||RELEASE_HASH
  });
  return new Response(request.method==="HEAD"?null:bytes,{status:200,headers});
 }
};