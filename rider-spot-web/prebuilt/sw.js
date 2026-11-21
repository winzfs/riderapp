// Do not force an installed update into an active delivery session.
// The waiting worker activates naturally after all previous clients close.
const CACHE='rider-spot-shell-e474de407246';
const CORE=["/assets/rider-spot-e474de407246/native-gps.js","/rider-spot-shell-v40.js","/","/index.html","/manifest.webmanifest","/offline.html","/pwa-init.js","/icons/icon-192.png","/icons/icon-512.png","/assets/rider-spot-e474de407246/map-reports.js","/rider-profile-v13-68bbdb2f9c8d.js","/rider-maintenance-v40-teal-defaults.js","/rider-finance-v23-b4471aa90f1e.js","/rider-presence-v24-3d3c7f94ff4a.js","/rider-demo-v26-d1f66164c3aa.js","/assets/rider-spot-e474de407246/workspace-tools.js","/assets/rider-spot-e474de407246/app.mjs","/assets/rider-spot-e474de407246/design-system.css","/assets/rider-spot-e474de407246/workspace-tools.js","/assets/rider-spot-e474de407246/route-worker.mjs","/assets/rider-spot-e474de407246/tab-resume.js","/assets/rider-spot-e474de407246/daily-timeline.css","/assets/rider-spot-e474de407246/weather-bar.css","/assets/rider-spot-e474de407246/premium-shell.css","/assets/rider-spot-e474de407246/renewal-layout.css","/assets/rider-spot-e474de407246/curated-v9.css","/assets/rider-spot-e474de407246/weather-bar.js"];
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
