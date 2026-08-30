// Service worker simples: só existe pra deixar o site instalável como app
// e dar um cache básico offline. Usa "network first": sempre tenta buscar
// a versão mais nova online e só usa o cache se estiver sem internet.

const CACHE_NAME = 'myhtml-cache-v3';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

async function createVersionedManifest(request) {
  let response;

  try {
    response = await fetch('./manifest.json', { cache: 'no-store' });
  } catch (error) {
    response = await caches.match('./manifest.json');
  }

  if (!response) return new Response('', { status: 503 });

  try {
    const manifest = await response.clone().json();
    const version = new URL(request.url).searchParams.get('iconVersion');

    if (version && Array.isArray(manifest.icons)) {
      manifest.icons = manifest.icons.map((icon) => {
        const iconUrl = new URL(icon.src, request.url);
        iconUrl.searchParams.set('iconVersion', version);
        return { ...icon, src: iconUrl.href };
      });
    }

    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/manifest+json; charset=utf-8');
    headers.set('Cache-Control', 'no-store, max-age=0');

    return new Response(JSON.stringify(manifest), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (error) {
    return response;
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (requestUrl.pathname.endsWith('/manifest.json')) {
    event.respondWith(createVersionedManifest(event.request));
    return;
  }

  event.respondWith(
    // "cache: no-store" ignora o cache HTTP do navegador e força uma busca
    // de verdade no servidor. Sem isso, mesmo esse fetch "network first"
    // podia devolver uma resposta antiga guardada pelo próprio navegador
    // (ex.: uma imagem que teve o conteúdo trocado no Git mas manteve o
    // mesmo nome de arquivo — o navegador não tinha motivo pra desconfiar
    // que o conteúdo mudou e continuava servindo a versão velha).
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
