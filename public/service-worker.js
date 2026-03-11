/* global caches, self */

const CACHE_VERSION = 'aionios-shell-v1';
const SHELL_CACHE_URLS = [
  '/',
  '/site.webmanifest',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/favicon-white-16x16.png',
  '/favicon-white-32x32.png',
  '/apple-touch-icon.png',
  '/apple-touch-icon-white.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-white-192x192.png',
  '/icons/icon-white-512x512.png'
];

function isCacheableRequest(request) {
  if (!request || request.method !== 'GET') {
    return false;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return false;
  }

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) {
    return false;
  }

  if (request.mode === 'navigate') {
    return true;
  }

  return ['document', 'font', 'image', 'manifest', 'script', 'style'].includes(
    request.destination
  );
}

async function cacheShellAssets() {
  const cache = await caches.open(CACHE_VERSION);
  await cache.addAll(SHELL_CACHE_URLS);
}

async function fetchAndCache(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    if (request.mode === 'navigate') {
      const fallback = await cache.match('/');
      if (fallback) {
        return fallback;
      }
    }
    throw error;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    cacheShellAssets().then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (!isCacheableRequest(event.request)) {
    return;
  }
  event.respondWith(fetchAndCache(event.request));
});
