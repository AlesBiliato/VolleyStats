const CACHE='volleytrack-shell-v2';
const ASSETS=['./','./index.html','./src/app.js','./src/domain.js','./src/statistics.js','./src/corrections.js','./src/storage.js','./src/styles.css','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(response=>response|| (event.request.mode==='navigate'?caches.match('./index.html'):Response.error()))));});
