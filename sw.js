// Service Worker — Tower Defense Space
// Estratégia: network-first para o jogo (sempre atualizado), cache para assets estáticos

const APP_VERSION = '2.3.4';
const CACHE_NAME = `arena-space-${APP_VERSION}`;
const CACHE_STATIC = `arena-static-${APP_VERSION}`;

// Assets que podem ser servidos do cache quando offline
const PRECACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/version.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/sound/musicarcade.mp3',
];

// Instala e pré-cacheia os assets essenciais — falhas individuais não travam a instalação
self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_STATIC).then(cache =>
      Promise.allSettled(PRECACHE.map(url =>
        cache.add(url).catch(() => {}) // ignora 404s durante install
      ))
    ).then(() => self.skipWaiting())
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

  // Ignora POST, WebSocket e API — só cacheia GET
  if (evt.request.method !== 'GET') return;
  if (evt.request.url.startsWith('ws') || url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/version.json') {
    evt.respondWith(fetch(evt.request, { cache: 'no-store' }));
    return;
  }

  // Imagens e sons: cache-first (não mudam com frequência)
  if (/\.(png|jpg|jpeg|svg|mp3|ogg|wav|webp)$/.test(url.pathname)) {
    evt.respondWith(
      caches.match(evt.request).then(cached => {
        if (cached) return cached;
        return fetch(evt.request).then(res => {
          if (res.ok && res.status !== 206) {
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
      if (res.ok && res.status !== 206 && evt.request.method === 'GET') {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(evt.request, clone));
      }
      return res;
    }).catch(() => caches.match(evt.request))
  );
});
