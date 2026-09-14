const CACHE='plataforma-questoes-v6-20260914';
const SHELL=['./','./index.html','./assets/styles.css?v=tjdft-provas2','./assets/app.js?v=tjdft-provas2','./assets/logo.svg','./manifest.webmanifest','./data/questions.json','./data/metadata.json','./data/competitions.json','./data/editais.json','./data/tjdft-provas.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));});
