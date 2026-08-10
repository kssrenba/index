// Service worker simples: só existe pra deixar o site instalável como app
// e dar um cache básico offline. Usa "network first": sempre tenta buscar
// a versão mais nova online e só usa o cache se estiver sem internet.

const CACHE_NAME = 'myhtml-cache-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

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