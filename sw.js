'use strict';
const CACHE = 'examenes-sca-v8';
const STATIC = [
  './index.html',
  './offline.html',
  './css/styles.css',
  './css/examenes.css',
  './js/config.js', './js/utils.js', './js/acceso.js',
  './js/student.js', './js/admin.js', './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      var toDelete = keys.filter(k => k !== CACHE);
      var wasUpdate = toDelete.length > 0;
      return Promise.all(toDelete.map(k => caches.delete(k)))
        .then(() => self.clients.claim())
        .then(() => {
          if (!wasUpdate) return;
          return self.clients.matchAll({ type: 'window' }).then(clients => {
            clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' }));
          });
        });
    })
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Supabase API — network only, no cache
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // CDN libraries — cache first, store on miss
  if (url.hostname.includes('cdnjs') || url.hostname.includes('jsdelivr')) {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );
    return;
  }
  // App files — cache first, network fallback, offline.html para navegación sin red
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => {
      if (e.request.mode === 'navigate') return caches.match('./offline.html');
    }))
  );
});
