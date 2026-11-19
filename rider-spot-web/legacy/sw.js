// Do not force an installed update into an active delivery session.
// The waiting worker activates naturally after all previous clients close.
const CACHE='rider-spot-shell-2026-11-17-v52-stable-camera-raster';
const CORE=["/rider-spot-ui-v45.css?ui=v45","/rider-spot-ui-v44.css?ui=v44","/rider-spot-design-v40-teal-orange.css?ui=v44","/rider-gps-recovery-v42.css?gps=v42","/rider-gps-recovery-v42.js?gps=v50","/rider-spot-design-v40-teal-orange.css?route=v43","/rider-spot-shell-v40.js","/rider-polish-v36-d680adacb934.css?roads=v38","/rider-ui-v33-fc1cd4c61e8c.css","/","/index.html","/manifest.webmanifest","/offline.html","/pwa-init.js","/assets/index-b9c4c6ba2711.css","/icons/icon-192.png","/icons/icon-512.png","/rider-map-simple-v6-8ec9218b5889.css","/rider-tools-v5-79829d2f6700.css","/rider-map-v9-76a854d0dae4.css","/rider-gps-v10-7dcfaba9d0a9.css","/rider-layout-v11-1d337cefde23.css","/rider-map-reports-v36-fd33eca4ded1.js","/rider-map-reports-v12-07960e801d58.css","/rider-profile-v13-04339b888e70.css","/rider-profile-v13-68bbdb2f9c8d.js","/rider-maintenance-v40-teal-defaults.js","/rider-maintenance-v15-74e6999a7452.css","/rider-gps-health-v17-bb49409ed05f.css","/rider-trip-sync-v18-dd6d1ad2b601.css","/rider-trip-sync-v18-eee13da20fdf.js","/rider-workspace-v20-5f7470e0bd68.css","/rider-fuel-v22-200353670e28.css","/rider-finance-v23-b4471aa90f1e.js","/rider-finance-v23-be5cc11da1ac.css","/rider-presence-v24-3d3c7f94ff4a.js","/rider-presence-v24-72a035dc7c09.css","/rider-demo-v25-a736b7890f9c.css","/rider-demo-v26-d1f66164c3aa.js","/rider-tools-v35-e84f32f8a5e5.js","/assets/index-rider-v35-cb5dc21ec4b4.js?ui=v52-stable-raster-camera","/rider-community-v32-b76f58c3e673.css"];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('rider-spot-shell-')&&key!==CACHE).map(key=>caches.delete(key)))));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(navigate(event.request));
    return;
  }
  if(url.pathname.startsWith('/assets/')){
    event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
});
async function navigate(request) {
  let response;
  try {
    response = await fetch(request);
    if (response.status < 500) return response;
  } catch {
    // Fetch rejects when the connection drops. HTTP failures resolve normally.
  }
  try {
    const cache = await caches.open(CACHE);
    const shell = await cache.match('/index.html') || await cache.match('/offline.html');
    if (shell) return shell;
  } catch {
    // A browser can revoke storage access; keep the original network response.
  }
  return response || Response.error();
}
