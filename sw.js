// Офлайн: держим файлы приложения в кэше. При обновлении меняйте VERSION.
const VERSION = 'v3';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'library.json',
  'js/app.js', 'js/core.js', 'js/db.js', 'js/srs.js', 'js/session.js', 'js/gemini.js', 'js/speech.js', 'js/level.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Сначала сеть (чтобы обновления приходили сразу), без сети — из кэша.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
