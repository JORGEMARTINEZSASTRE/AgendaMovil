/* DepiMóvil — service worker mínimo.
   Estrategia: red primero, caché sólo como respaldo si no hay internet.
   Así la operadora nunca ve una versión vieja de la app. */
const CACHE = 'depimovil-app-v1';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(['./', './manifest.webmanifest', './icon-192.png']).catch(function () {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function (r) {
      var copia = r.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copia); }).catch(function () {});
      return r;
    }).catch(function () {
      return caches.match(e.request).then(function (r) { return r || caches.match('./'); });
    })
  );
});
