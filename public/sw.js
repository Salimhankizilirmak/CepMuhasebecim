// Uygulama kabuğunu önbelleğe alır; internet yokken de açılır. Veriler ve /api asla önbelleğe alınmaz.
const CACHE = 'cep-muhasebecim-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/engine.js', '/manifest.json', '/icons/icon.svg', '/icons/icon-192.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && url.pathname.startsWith('/api/')) return;
  if (!sameOrigin && !url.href.startsWith('https://cdn.jsdelivr.net/') && !url.hostname.endsWith('gstatic.com') && !url.hostname.endsWith('googleapis.com')) return;
  if (url.hostname.endsWith('supabase.co')) return;
  // Önce ağ, olmazsa önbellek (güncellemeler hemen gelsin)
  e.respondWith(fetch(req).then(res => {
    if (res.ok && (sameOrigin || res.type === 'cors' || res.type === 'opaque')) {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('/index.html') : Response.error()))));
});
