// Cachea el "esqueleto" de la app para que abra sin internet.
// Los datos en sí viven en IndexedDB (ver web-api.js), no acá.
const CACHE_NAME = 'calendario-universitario-v1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './mobile.css',
  './app.js',
  './web-api.js',
  './mobile-nav.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Nunca cacheamos llamadas a Google (Drive/OAuth): siempre en vivo.
  if (url.origin.includes('google')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    })
  );
});
