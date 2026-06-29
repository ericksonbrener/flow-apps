// FinFlow PWA — service worker
// Estratégia: cache-first para a "casca" do app; runtime cache para fontes Google.
const CACHE = 'finflow-v4';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './libs/chart.umd.min.js',
  './libs/xlsx.full.min.js',
  './libs/papaparse.min.js',
  './libs/chartjs-plugin-datalabels.min.js',
  './icons/finflow-192.png',
  './icons/finflow-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isFont = url.hostname.includes('fonts.googleapis.com') ||
                 url.hostname.includes('fonts.gstatic.com');

  // Fontes Google: stale-while-revalidate (cacheia na primeira vez com internet).
  if (isFont) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req).then((res) => {
          cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Casca do app: cache-first com atualização em segundo plano.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
