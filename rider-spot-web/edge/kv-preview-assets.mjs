/*
 * Rider Spot immutable preview asset server backed by Workers KV.
 *
 * This worker is intentionally separate from rider-spot production.
 * No GitHub Raw fetches and no inline app bundle inside the Worker source.
 * Future production releases should use Workers Static Assets directly once
 * the authenticated upload session is available.
 */
export const RELEASE_HASH="16c1eecf6bac";
export const STORAGE_PREFIX="rs-asset-v1::";
export const ALLOWED=new Set([
  "app.mjs","route-worker.mjs","native-gps.js","map-reports.js",
  "design-system.css","workspace-tools.js","tab-resume.js",
  "daily-timeline.css","weather-bar.js","weather-bar.css",
  "premium-shell.css"
]);
const PREFIX="/assets/rider-spot-"+RELEASE_HASH+"/";

export function assetKey(pathname) {
  if (pathname === "/" || pathname === "/index.html")
    return STORAGE_PREFIX+"/index.html";
  if (pathname === "/sw.js") return STORAGE_PREFIX+"/sw.js";
  if (pathname.startsWith(PREFIX)) {
    const name=pathname.slice(PREFIX.length);
    return ALLOWED.has(name) ? STORAGE_PREFIX+pathname : null;
  }
  if (/^\/mapdata\/(?:admin|government|manifest|t[0-9]+-[0-9]+)\.json$/.test(pathname))
    return STORAGE_PREFIX+pathname;
  return null;
}
function mime(pathname) {
  if (pathname.endsWith(".html") || pathname === "/") return "text/html; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/javascript; charset=utf-8";
}
export default {
  async fetch(request,env) {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed",{status:405,headers:{"allow":"GET, HEAD"}});
    const path=new URL(request.url).pathname;
    const key=assetKey(path);
    if (!key) return new Response("Not found",{status:404,headers:{"cache-control":"no-store"}});
    let body;
    try {
      body=await env.RS_ASSETS.get(key,"arrayBuffer");
    } catch {
      return new Response("Static asset storage temporarily unavailable",
        {status:503,headers:{"cache-control":"no-store"}});
    }
    if (body==null) {
      const critical=path === "/" || path === "/index.html" || path === "/sw.js" || path.startsWith(PREFIX);
      return new Response("Static asset missing",{
        status:critical?503:404,headers:{"cache-control":"no-store"}
      });
    }
    const immutable=path.startsWith(PREFIX);
    const cache=immutable ? "public, max-age=31536000, immutable"
      : path.startsWith("/mapdata/") ? "public, max-age=3600"
      : "no-store";
    return new Response(request.method === "HEAD" ? null : body,{
      status:200,
      headers:{
        "content-type":mime(path),
        "cache-control":cache,
        "x-content-type-options":"nosniff",
        "x-rs-preview-asset-origin":"workers-kv"
      }
    });
  }
};
