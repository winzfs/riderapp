const CACHE='rider-spot-shell-c0e9aab3fdf9';
const CORE=["/assets/rider-spot-c0e9aab3fdf9/native-gps.js","/rider-spot-shell-v40.js","/","/index.html","/manifest.webmanifest","/offline.html","/pwa-init.js","/icons/icon-192.png","/icons/icon-512.png","/assets/rider-spot-c0e9aab3fdf9/map-reports.js","/rider-profile-v13-68bbdb2f9c8d.js","/rider-maintenance-v40-teal-defaults.js","/rider-finance-v23-b4471aa90f1e.js","/rider-presence-v24-3d3c7f94ff4a.js","/rider-demo-v26-d1f66164c3aa.js","/assets/rider-spot-c0e9aab3fdf9/workspace-tools.js","/assets/rider-spot-c0e9aab3fdf9/app.mjs","/assets/rider-spot-c0e9aab3fdf9/design-system.css","/assets/rider-spot-c0e9aab3fdf9/workspace-tools.js","/assets/rider-spot-c0e9aab3fdf9/route-worker.mjs","/assets/rider-spot-c0e9aab3fdf9/tab-resume.js","/assets/rider-spot-c0e9aab3fdf9/daily-timeline.css"];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('rider-spot-shell-')&&key!==CACHE).map(key=>caches.delete(key))))]));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(async()=>await caches.match('/index.html')||await caches.match('/offline.html')));
    return;
  }
  if(url.pathname.startsWith('/assets/')){
    event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
});