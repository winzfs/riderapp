const CACHE='rider-spot-shell-d185627697bc';
const CORE=["/assets/rider-spot-d185627697bc/native-gps.js","/rider-spot-shell-v40.js","/","/index.html","/manifest.webmanifest","/offline.html","/pwa-init.js","/icons/icon-192.png","/icons/icon-512.png","/assets/rider-spot-d185627697bc/map-reports.js","/rider-profile-v13-68bbdb2f9c8d.js","/rider-maintenance-v40-teal-defaults.js","/rider-finance-v23-b4471aa90f1e.js","/rider-presence-v24-3d3c7f94ff4a.js","/rider-demo-v26-d1f66164c3aa.js","/assets/rider-spot-d185627697bc/workspace-tools.js","/assets/rider-spot-d185627697bc/app.mjs","/assets/rider-spot-d185627697bc/design-system.css","/assets/rider-spot-d185627697bc/workspace-tools.js","/assets/rider-spot-d185627697bc/route-worker.mjs","/assets/rider-spot-d185627697bc/tab-resume.js","/assets/rider-spot-d185627697bc/daily-timeline.css"];
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