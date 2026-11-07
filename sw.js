// Offline cache: the app's own files network-first (so updates arrive), fonts cache-first.
const C = 'sistema-v7';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  'src/main.js', 'src/game.js', 'src/i18n.js', 'src/en.js', 'src/store.js', 'src/sound.js', 'src/fx.js'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    e.respondWith(fetch(r).then((res) => { const cp = res.clone(); caches.open(C).then((c) => c.put(r, cp)); return res; })
      .catch(() => caches.match(r).then((m) => m || caches.match('index.html'))));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { const cp = res.clone(); caches.open(C).then((c) => c.put(r, cp)); return res; })));
  }
});
