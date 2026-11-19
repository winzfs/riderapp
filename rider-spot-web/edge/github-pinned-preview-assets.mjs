/*
 * RIDER SPOT PREVIEW ONLY — read-only GitHub source for pinned UI files.
 * Does not modify rider-spot production and must not be used as the
 * long-term production asset host. Replace with Workers Static Assets once
 * a permitted asset-upload flow is available.
 */
const RELEASE = "16c1eecf6bac";
const PINNED_COMMIT = "6e6bd2d905db57d34408b22aa1b4292e01d92d37";
const RAW = "https://raw.githubusercontent.com/winzfs/riderapp/" + PINNED_COMMIT + "/rider-spot-web/";
const CURRENT = new Set([
  "app.mjs","route-worker.mjs","native-gps.js","map-reports.js",
  "design-system.css","workspace-tools.js","tab-resume.js",
  "daily-timeline.css","weather-bar.js","weather-bar.css","premium-shell.css"
]);
const TYPES = {
  ".html":"text/html; charset=utf-8", ".js":"application/javascript; charset=utf-8",
  ".mjs":"application/javascript; charset=utf-8",".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8"
};
export function sourcePath(path) {
  if (path === "/" || path === "/index.html") return "prebuilt/index.html";
  if (path === "/sw.js") return "prebuilt/sw.js";
  const prefix="/assets/rider-spot-" + RELEASE + "/";
  if (path.startsWith(prefix)) {
    const file=path.slice(prefix.length);
    return CURRENT.has(file) ? "prebuilt/" + file : null;
  }
  if (/^\/mapdata\/(?:admin|government|manifest|t\d+-\d+)\.json$/.test(path))
    return "data/korean-map/" + path.slice("/mapdata/".length);
  return null;
}
export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed",{status:405});
    const path=new URL(request.url).pathname;
    const rel=sourcePath(path);
    if (!rel) return new Response("Not found",{status:404});
    const type=Object.entries(TYPES).find(([suffix])=>rel.endsWith(suffix))?.[1] || "application/octet-stream";
    const cache=new Request("https://rider-spot-static-assets.invalid/" + rel);
    const cached=await caches.default.match(cache);
    if (cached) return request.method === "HEAD" ? new Response(null,cached) : cached;
    const res=await fetch(RAW + rel, { headers: { accept:"*/*" }, redirect:"follow" });
    if (!res.ok) return new Response("Static candidate source unavailable",{
      status:503,headers:{"cache-control":"no-store"}
    });
    const headers=new Headers(res.headers);
    headers.set("content-type",type);
    headers.set("cache-control",path.startsWith("/assets/") ? "public, max-age=86400, immutable" : "public, max-age=60");
    headers.delete("content-encoding");
    headers.delete("content-length");
    const output=new Response(res.body,{status:200,headers});
    // Cache only validated immutable file responses. Source pinned to commit.
    if(path.startsWith("/assets/")) {
      await caches.default.put(cache,output.clone()).catch(()=>{});
    }
    return request.method === "HEAD" ? new Response(null,output) : output;
  }
};
