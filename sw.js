// Service Worker — Tower Defense on the Space
// Estratégia: network-first para o jogo (sempre atualizado), cache para assets estáticos

const CACHE_NAME = 'arena-space-v1';
const CACHE_STATIC = 'arena-static-v1';

// Assets que podem ser servidos do cache quando offline
const PRECACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/sound/musicarcade.mp3',
];

// Instala e pré-cacheou os assets essenciais
self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_STATIC).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

// Ativa e limpa caches antigos
self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== CACHE_STATIC).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first para JS/HTML (jogo sempre atualizado), cache-first para imagens/sons
self.addEventListener('fetch', evt => {
  const url = new URL(evt.request.url);

  // Ignora requisições de WebSocket e API
  if (evt.request.url.startsWith('ws') || url.pathname.startsWith('/api/')) return;

  // Imagens e sons: cache-first (não mudam com frequência)
  if (/\.(png|jpg|jpeg|svg|mp3|ogg|wav|webp)$/.test(url.pathname)) {
    evt.respondWith(
      caches.match(evt.request).then(cached => {
        if (cached) return cached;
        return fetch(evt.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then(c => c.put(evt.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // JS, HTML, CSS: network-first — garante que o jogo está sempre atualizado
  evt.respondWith(
    fetch(evt.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(evt.request, clone));
      }
      return res;
    }).catch(() => caches.match(evt.request))
  );
});
