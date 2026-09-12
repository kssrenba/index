// myhtml — cache imediato de imagens e atualização de conteúdo em segundo plano.
// Versões e caches pertencem apenas ao diretório deste site no GitHub Pages.
const SCOPE_URL = new URL(self.registration.scope);
const CACHE_PREFIX = 'myhtml-' + encodeURIComponent(SCOPE_URL.pathname) + '-';
const APP_CACHE = CACHE_PREFIX + 'app-v4';
const IMAGE_CACHE = CACHE_PREFIX + 'images-v4';
const MAX_IMAGES = 400;
const IMAGE_RECHECK_MS = 6 * 60 * 60 * 1000;
const checkedImages = new Map();
const pendingFetches = new Map();
let imageWrites = 0;
let trimming = null;

async function safePut(cacheName, request, response) {
  if (!response || !response.ok || response.status === 206 || response.type === 'opaque') return;
  if (/\bno-store\b/i.test(response.headers.get('Cache-Control') || '')) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    if (cacheName === IMAGE_CACHE && ++imageWrites % 16 === 1 && !trimming) {
      trimming = cache.keys().then(keys => Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_IMAGES)).map(key => cache.delete(key))))
        .catch(() => {}).finally(() => { trimming = null; });
      await trimming;
    }
  } catch (error) {
    // Cache indisponível/cheio não impede uma resposta válida da rede.
  }
}

function refresh(request, cacheName) {
  const key = cacheName + ':' + request.url;
  if (pendingFetches.has(key)) return pendingFetches.get(key).then(response => response.clone());
  const work = fetch(request, { cache: 'no-cache' }).then(async response => {
    await safePut(cacheName, request, response);
    return response;
  });
  pendingFetches.set(key, work);
  work.finally(() => pendingFetches.delete(key)).catch(() => {});
  return work.then(response => response.clone());
}

async function findCached(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached && cached.ok) return cached;
    // Reaproveita capas baixadas pela versão anterior, sem apagar caches de outros sites.
    if (cacheName === IMAGE_CACHE) {
      const legacy = await caches.open('myhtml-cache-v3');
      const previous = await legacy.match(request);
      if (previous && previous.ok) return previous;
    }
  } catch (error) {}
  return null;
}

// Cria a promessa de manutenção durante o evento (antes de qualquer await).
function cachedResponse(event, cacheName, image = false) {
  let finishMaintenance;
  const maintenance = new Promise(resolve => { finishMaintenance = resolve; });
  event.waitUntil(maintenance);
  return (async () => {
    const request = event.request;
    const cached = await findCached(request, cacheName);
    const forced = request.cache === 'reload' || request.cache === 'no-cache';
    const checkedAt = checkedImages.get(request.url) || 0;
    const shouldRefresh = !image || !cached || forced || Date.now() - checkedAt > IMAGE_RECHECK_MS;
    if (!shouldRefresh) { finishMaintenance(); return cached; }
    if (image) {
      if (checkedImages.size >= 800) checkedImages.delete(checkedImages.keys().next().value);
      checkedImages.set(request.url, Date.now());
    }
    const network = refresh(request, cacheName);
    network.then(finishMaintenance, finishMaintenance);
    if (cached && !forced) return cached;
    try {
      const response = await network;
      return response.ok || !cached ? response : cached;
    } catch (error) {
      if (image) checkedImages.delete(request.url);
      return cached || Response.error();
    }
  })().catch(() => { finishMaintenance(); return Response.error(); });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await Promise.allSettled(['./', './index.html', './info.js', './manifest.json'].map(async path => {
      const request = new Request(new URL(path, SCOPE_URL));
      await refresh(request, APP_CACHE);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== APP_CACHE && key !== IMAGE_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function createVersionedManifest(request) {
  const plainRequest = new Request(new URL('manifest.json', SCOPE_URL));
  let response;
  try { response = await refresh(plainRequest, APP_CACHE); }
  catch (error) { response = await findCached(plainRequest, APP_CACHE); }
  if (!response || !response.ok) return response || Response.error();
  try {
    const manifest = await response.clone().json();
    const version = new URL(request.url).searchParams.get('iconVersion');
    if (version && Array.isArray(manifest.icons)) {
      manifest.icons = manifest.icons.map(icon => {
        const url = new URL(icon.src, request.url);
        url.searchParams.set('iconVersion', version);
        return { ...icon, src: url.href };
      });
    }
    return new Response(JSON.stringify(manifest), { headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-cache'
    }});
  } catch (error) { return response; }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE_URL.origin || !url.pathname.startsWith(SCOPE_URL.pathname)) return;
  if (url.pathname.endsWith('/manifest.json')) {
    event.respondWith(createVersionedManifest(request));
    return;
  }
  if (request.destination === 'image' || /\.(?:webp|avif|png|jpe?g|gif|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(cachedResponse(event, IMAGE_CACHE, true));
    return;
  }
  if (request.mode === 'navigate' || /\.(?:html|js|css|woff2?)$/i.test(url.pathname)) {
    event.respondWith(cachedResponse(event, APP_CACHE));
  }
});
