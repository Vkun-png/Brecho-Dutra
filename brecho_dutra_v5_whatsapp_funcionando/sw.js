/* Brechó Dutra — cache apenas dos arquivos locais do aplicativo.
   Para atualizar o PWA, mude o número na constante CACHE_NAME. */
const CACHE_NAME = 'brecho-dutra-pwa-v5';
const APP_FILES = [
  './', './index.html', './css/style.css?v=5', './js/app.js?v=5',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key.startsWith('brecho-dutra-pwa-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});

// Navegação e recursos alterados com frequência: rede primeiro.
// Isso evita rodar JavaScript antigo após publicar uma versão nova do PWA.
// Sem rede, usamos os arquivos locais previamente salvos.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const freshFirst = event.request.mode === 'navigate' || /\.(js|css)$/.test(url.pathname);
  if (freshFirst) {
    event.respondWith(
      fetch(event.request).then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      })
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => {
    if (cached) return cached;
    return fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
      }
      return response;
    });
  }));
});
