const CACHE_PREFIX='plataforma-questoes-v56';
const SHELL_CACHE=CACHE_PREFIX+'-shell';
const DATA_CACHE=CACHE_PREFIX+'-data';

const SHELL=[
  './',
  './index.html',
  './assets/styles.css?v=tjdft-provas11',
  './assets/v2.css?v=platform-v2-1',
  './assets/app.js?v=platform-v2-4',
  './assets/cloud-progress.js',
  './assets/study-plan.js',
  './assets/ux-enhancements.js',
  './assets/canonical-editais.js',
  './assets/logo.svg',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './manifest.webmanifest'
];

const DATA_FILES=[
  './data/questions.json',
  './data/metadata.json',
  './data/competitions.json',
  './data/editais.json',
  './data/taxonomy-backlog.json',
  './data/tjdft-provas.json'
];
const DATA_PATHS=DATA_FILES.map(path=>new URL(path,self.registration.scope).pathname);

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('plataforma-questoes-')&&!key.startsWith(CACHE_PREFIX)).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

function canonicalDataRequest(request){
  const url=new URL(request.url);
  url.search='';
  return new Request(url.toString(),{method:'GET',headers:{Accept:'application/json'},credentials:'same-origin'});
}

async function dataNetworkFirst(request){
  const cache=await caches.open(DATA_CACHE);
  const key=canonicalDataRequest(request);
  try{
    const response=await fetch(request);
    if(response.ok)await cache.put(key,response.clone());
    return response;
  }catch(error){
    const cached=await cache.match(key);
    if(cached)return cached;
    throw error;
  }
}

async function navigationNetworkFirst(request){
  const cache=await caches.open(SHELL_CACHE);
  try{
    const response=await fetch(request);
    if(response.ok)await cache.put('./index.html',response.clone());
    return response;
  }catch{
    return (await cache.match('./index.html'))||(await cache.match('./'));
  }
}

async function staticStaleWhileRevalidate(request){
  const cache=await caches.open(SHELL_CACHE);
  const cached=await cache.match(request);
  const fresh=fetch(request).then(response=>{
    if(response.ok)cache.put(request,response.clone());
    return response;
  }).catch(()=>null);
  return cached||(await fresh)||Response.error();
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin){event.respondWith(fetch(request));return;}
  if(request.mode==='navigate'){event.respondWith(navigationNetworkFirst(request));return;}
  if(DATA_PATHS.includes(url.pathname)){event.respondWith(dataNetworkFirst(request));return;}
  event.respondWith(staticStaleWhileRevalidate(request));
});