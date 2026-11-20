/*
 * Rider Spot v4 / read-only release asset gateway.
 * Never touches trip, GPS, Supabase or WebView state.
 * Pins a fully tested immutable GitHub commit and isolates KV keys from v3.
 */
export const RELEASE_HASH="8eb44596629f";
export const PINNED_COMMIT="b715913001e0b55f2d29cbc17acdb72d35a025aa";
const RAW="https://raw.githubusercontent.com/winzfs/riderapp/"+PINNED_COMMIT+"/rider-spot-web/prebuilt/";
const PREFIX="/assets/rider-spot-"+RELEASE_HASH+"/";
const KEY_PREFIX="rs-asset-v4::";
const PREVIOUS_KEY_PREFIX="rs-asset-v1::";
const ASSETS=new Set([
 "app.mjs","route-worker.mjs","native-gps.js","map-reports.js",
 "design-system.css","workspace-tools.js","tab-resume.js",
 "daily-timeline.css","weather-bar.js","weather-bar.css",
 "premium-shell.css","renewal-layout.css"
]);
function lookup(path){
 if(path==="/"||path==="/index.html") return {key:KEY_PREFIX+"/index.html",file:"index.html",critical:true};
 if(path==="/sw.js") return {key:KEY_PREFIX+"/sw.js",file:"sw.js",critical:true};
 if(path.startsWith(PREFIX)){
  const file=path.slice(PREFIX.length);
  return ASSETS.has(file)?{key:KEY_PREFIX+path,file,critical:true,immutable:true}:null;
 }
 if(/^\/mapdata\/(?:admin|government|manifest|t\d+-\d+)\.json$/.test(path))
  return {key:PREVIOUS_KEY_PREFIX+path,previous:true,critical:false};
 return null;
}
function type(path){
 if(path==="/"||path.endsWith(".html"))return "text/html; charset=utf-8";
 if(path.endsWith(".css"))return "text/css; charset=utf-8";
 if(path.endsWith(".json"))return "application/json; charset=utf-8";
 return "application/javascript; charset=utf-8";
}
export default {
 async fetch(request,env,context){
  if(request.method!=="GET"&&request.method!=="HEAD")
   return new Response("Method not allowed",{status:405,headers:{allow:"GET, HEAD"}});
  const path=new URL(request.url).pathname,entry=lookup(path);
  if(!entry)return new Response("Not found",{status:404,headers:{"cache-control":"no-store"}});
  let contents;
  try {contents=await env.RS_ASSETS.get(entry.key,"arrayBuffer");}
  catch {return new Response("Asset KV unavailable",{status:503,headers:{"cache-control":"no-store"}});}
  if(contents===null && entry.previous)
   return new Response("Map tile not found",{status:404,headers:{"cache-control":"no-store"}});
  if(contents===null){
   // Retrieve only files from the pinned verified release. No visitor input
   // becomes a URL path, and never send upstream GitHub security headers.
   let result;
   try{
    result=await fetch(RAW+entry.file,{headers:{accept:"*/*"},redirect:"follow"});
   }catch{return new Response("Immutable asset fetch failed",{status:503});}
   if(!result.ok)return new Response("Immutable asset unavailable",{status:503});
   contents=await result.arrayBuffer();
   if(!contents.byteLength||contents.byteLength>4_000_000)
    return new Response("Immutable asset invalid",{status:503});
   if(entry.file==="index.html"&&!new TextDecoder().decode(contents).includes(PREFIX+"app.mjs"))
    return new Response("Unexpected app shell",{status:503});
   context.waitUntil(env.RS_ASSETS.put(entry.key,contents).catch(()=>{}));
  }
  const headers=new Headers({
   "content-type":type(path),
   "cache-control":entry.immutable?"public, max-age=31536000, immutable":
     entry.previous?"public, max-age=3600":"no-store",
   "x-content-type-options":"nosniff",
   "x-rs-preview-asset-origin":"workers-kv",
   "x-rs-release":RELEASE_HASH
  });
  return new Response(request.method==="HEAD"?null:contents,{status:200,headers});
 }
};
