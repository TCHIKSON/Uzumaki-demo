// public/sw.js
const VERSION = 'v2';
const RUNTIME = `runtime-${VERSION}`;
const PRECACHE = `precache-${VERSION}`;

// tu peux ajuster la liste; PAS grave si un fichier manque
const PRECACHE_URLS = [
  '/', '/streamApp.html', '/player.css',
  '/vendor/hls.min.js', '/vendor/dash.all.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    // ne pas utiliser addAll → on fetch individuellement
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res && res.ok) await cache.put(url, res.clone());
      } catch (_) { /* on ignore les ratés */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![PRECACHE, RUNTIME].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isAPI = url.pathname.startsWith('/api/');
  const isData = url.pathname.startsWith('/data/');
  const isImg  = /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(url.pathname);

  if (isData || isImg) return event.respondWith(staleWhileRevalidate(req));
  if (isAPI)          return event.respondWith(networkFirst(req));
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const net = fetch(request).then(res => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || net;
}
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('Network failed and no cache');
  }
}
