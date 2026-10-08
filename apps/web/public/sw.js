const CACHE="spatial-shell-v1";
const SHELL=["/","/manifest.webmanifest","/icon.svg"];
self.addEventListener("install",(event)=>event.waitUntil(caches.open(CACHE).then((cache)=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",(event)=>event.waitUntil(self.clients.claim()));
self.addEventListener("fetch",(event)=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=="GET"||url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
  event.respondWith(
    fetch(request).then((response)=>{
      if(response.ok){const clone=response.clone();void caches.open(CACHE).then((cache)=>cache.put(request,clone));}
      return response;
    }).catch(()=>caches.match(request).then((cached)=>cached||caches.match("/")))
  );
});
