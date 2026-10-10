// Entradas do campo "mal" que NÃO são temporadas (não têm nota/episódios):
//  - { spacer: true, text: "..." } -> divisor com espaço + texto
//  - { text: "..." }               -> só o texto, sem espaço extra
function isMalDividerEntry(entry) {
  if (!entry) return false;
  if (entry.spacer) return true;
  return !entry.label && typeof entry.text === 'string' && entry.text.trim() !== '';
}

if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  document.addEventListener("DOMContentLoaded", async function() {
    // ── Trava de scroll compartilhada por todos os drawers/lightbox ──
    // Importante: NUNCA muda "overflow" de html/body. Em vez disso, fixa o
    // body na posição atual (position:fixed + top negativo). Como a
    // propriedade "overflow" nunca é tocada, o navegador nunca recalcula a
    // presença/ausência da scrollbar nativa, então a largura da página
    // (e dos cards) nunca muda ao abrir/fechar um drawer, em nenhum navegador.
    let __scrollLockCount = 0;
    let __scrollLockY = 0;

    function lockBodyScroll() {
      if (__scrollLockCount === 0) {
        __scrollLockY = window.scrollY || window.pageYOffset || 0;
        document.body.style.position = 'fixed';
        document.body.style.top = (-__scrollLockY) + 'px';
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';
      }
      __scrollLockCount++;
    }

    function unlockBodyScroll(skipRestore) {
      __scrollLockCount = Math.max(0, __scrollLockCount - 1);
      if (__scrollLockCount === 0) {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        // Quando quem chamou já sabe que vai rolar a página pra outro lugar
        // em seguida (ex.: clique num resultado da busca que leva pra um
        // card específico), pular esse scrollTo evita uma corrida no
        // mobile: remover o position:fixed dispara um reflow que alguns
        // navegadores mobile aplicam de forma meio assíncrona, então esse
        // scrollTo "restaurando a posição antiga" às vezes só é efetivado
        // DEPOIS do scroll intencional pro card, cancelando ele e jogando
        // a página de volta pro topo da lista/categoria.
        if (!skipRestore) window.scrollTo(0, __scrollLockY);
      }
    }

    // Uma navegação intencional (busca/tag/calendário) vai definir uma
    // posição nova logo em seguida. Garante que nenhuma trava residual do
    // drawer ou lightbox continue segurando o body em fixed.
    function releaseBodyScrollForNavigation() {
      __scrollLockCount = 0;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
    }

    // Cache dos pôsteres verticais usados pelo poster lightbox. No mobile
    // os cards exibem thumbs horizontais leves; sem este aquecimento, o
    // arquivo vertical só começava a baixar depois do clique.
    const __lightboxPosterCache = new Map();

    function preloadLightboxPoster(src, priority = 'auto') {
      const cleanSrc = String(src || '').trim();
      if (!cleanSrc) return Promise.resolve(false);

      const cached = __lightboxPosterCache.get(cleanSrc);
      if (cached) {
        if (priority === 'high' && cached.image && 'fetchPriority' in cached.image) {
          cached.image.fetchPriority = 'high';
        }
        return cached.promise;
      }

      const image = new Image();
      image.decoding = 'async';
      if ('fetchPriority' in image) image.fetchPriority = priority;

      const entry = { image, loaded: false, promise: null };
      let settlePreload;
      entry.promise = new Promise(resolve => {
        settlePreload = resolve;
        image.onload = () => {
          entry.loaded = true;
          if (__lightboxPosterCache.size > 36) {
            for (const [key, older] of __lightboxPosterCache) {
              if (key !== cleanSrc && older.loaded) __lightboxPosterCache.delete(key);
              if (__lightboxPosterCache.size <= 36) break;
            }
          }
          resolve(true);
        };
        image.onerror = () => { __lightboxPosterCache.delete(cleanSrc); resolve(false); };
      });
      __lightboxPosterCache.set(cleanSrc, entry);
      image.src = cleanSrc;

      if (image.complete && image.naturalWidth > 0) {
        entry.loaded = true;
        queueMicrotask(() => settlePreload(true));
      }
      return entry.promise;
    }

    // Começa o download no pointerdown/touchstart, antes do evento click.
    // Mesmo quando ainda não der tempo de concluir, isso elimina uma parte
    // importante da latência de abertura em conexões móveis.
    document.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch') return;
      const item = event.target.closest('.anime-item');
      if (!item) return;
      const img = item.querySelector('.poster-wrap img.thumb');
      const src = img && img.getAttribute('data-poster-src');
      if (src) preloadLightboxPoster(src, 'high');
    }, { capture: true, passive: true });

    // ── Lightbox: amplia a imagem do card ao clicar nela ──
    (function initPosterLightbox() {
      const lightbox = document.getElementById('posterLightbox');
      const lightboxAmbient = document.getElementById('posterLightboxAmbient');
      const lightboxBanner = document.getElementById('posterLightboxBanner');
      const lightboxBannerImg = document.getElementById('posterLightboxBannerImg');
      const lightboxBannerImgBlur = document.getElementById('posterLightboxBannerImgBlur');
      const lightboxImg = document.getElementById('posterLightboxImg');
      const lightboxHeroRank = document.getElementById('posterLightboxHeroRank');
      const lightboxTitle = document.getElementById('posterLightboxTitle');
      const lightboxList = document.getElementById('posterLightboxList');
      const lightboxCharacters = document.getElementById('posterLightboxCharacters');
      const lightboxAnnounce = document.getElementById('posterLightboxAnnounce');
      const lightboxMeta = document.getElementById('posterLightboxMeta');
      const lightboxMal = document.getElementById('posterLightboxMal');
      const lightboxMoreInfo = document.getElementById('posterLightboxMoreInfo');
      const lightboxMediaWatchNow = document.getElementById('posterLightboxMediaWatchNow');
      const lightboxInfo = document.getElementById('posterLightboxInfo');
      const lightboxSimpleCategory = document.getElementById('posterLightboxSimpleCategory');
      const lightboxMediaCategory = document.getElementById('posterLightboxMediaCategory');
      const lightboxSimpleCaption = document.getElementById('posterLightboxSimpleCaption');
      const lightboxSimpleLink = document.getElementById('posterLightboxSimpleLink');
      const calendarBtn = document.getElementById('posterLightboxCalendar');
      const randomPlanBtn = document.getElementById('randomPlanBtn');
      const randomizerLightboxBtn = document.getElementById('posterLightboxRandomizer');
      const soundBtn = document.getElementById('posterLightboxSound');

      function updateStudioSeparators(list) {
        if (!list) return;
        const studioItem = list.closest('.rank-meta-item--studios');
        const allRows = Array.from(list.querySelectorAll('.rank-meta-studio-row'));
        const isExpanded = studioItem?.classList.contains('is-meta-expanded');

        // Recomeça do zero: mostra tudo antes de medir, senão a medição
        // herdaria o corte da rodada anterior.
        allRows.forEach(row => row.classList.remove('studio-row-hidden'));
        // Mede o overflow natural sem o indicador "+N" ocupando espaço.
        studioItem?.classList.remove('has-hidden-studio-rows');
        delete list.dataset.moreLabel;

        const naturallyOverflows =
          list.scrollHeight > list.clientHeight + 1 ||
          list.scrollWidth > list.clientWidth + 1;
        studioItem?.classList.toggle('has-hidden-studio-rows', naturallyOverflows);

        if (naturallyOverflows && !isExpanded) {
          // Mede da esquerda pra direita (independente do alinhamento
          // final) pra decidir quais estúdios cabem inteiros, com o
          // espaço do "MORE" já descontado. Qualquer um que não caiba
          // por completo some junto dos que vêm depois dele, em vez de
          // aparecer cortado no meio do nome.
          list.classList.add('studio-list-measuring');
          const listRect = list.getBoundingClientRect();
          const listPaddingRight = parseFloat(getComputedStyle(list).paddingRight) || 0;
          // Reserva o espaço do indicador "+N", que agora fica na mesma
          // linha dos estúdios (pill ~30px + gap de 10px).
          const MORE_PILL_RESERVE = 44;
          const availableRight = listRect.right - listPaddingRight - MORE_PILL_RESERVE - 4;
          let lastVisibleIndex = -1;
          allRows.forEach((row, idx) => {
            if (row.getBoundingClientRect().right <= availableRight) lastVisibleIndex = idx;
          });
          if (lastVisibleIndex === -1) lastVisibleIndex = 0;
          allRows.forEach((row, idx) => {
            row.classList.toggle('studio-row-hidden', idx > lastVisibleIndex);
          });
          list.classList.remove('studio-list-measuring');
          const hiddenCount = allRows.filter(row => row.classList.contains('studio-row-hidden')).length;
          list.dataset.moreLabel = hiddenCount > 0 ? `+${hiddenCount}` : '…';
        }

        const rows = allRows.filter(row =>
          !row.classList.contains('studio-row-hidden') && getComputedStyle(row).display !== 'none'
        );
        let previousCenterY = null;
        rows.forEach(row => {
          const rect = row.getBoundingClientRect();
          const centerY = rect.top + rect.height / 2;
          const sharesLineWithPrevious = previousCenterY !== null && Math.abs(centerY - previousCenterY) < 3;
          row.classList.toggle('has-inline-studio-separator', sharesLineWithPrevious);
          previousCenterY = centerY;
        });
      }

      const studioSeparatorResizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(entries => entries.forEach(entry => updateStudioSeparators(entry.target)))
        : null;

      function refreshStudioSeparators() {
        lightboxMeta?.querySelectorAll('.rank-meta-studio-list').forEach(list => updateStudioSeparators(list));
      }
      window.addEventListener('resize', () => requestAnimationFrame(refreshStudioSeparators), { passive: true });

      if (lightboxMeta) {
        lightboxMeta.addEventListener('click', (event) => {
          // Arrastar para selecionar/copiar não deve fechar o campo aberto.
          if (window.getSelection?.().toString()) return;

          const expandableItem = event.target.closest('.rank-meta-item--studio, .rank-meta-item--rewatch');
          const expandedItem = lightboxMeta.querySelector('.rank-meta-item.is-meta-expanded');

          // Retração animada: toca a animação de saída e só então remove as classes.
          const collapseMeta = (item) => {
            if (!item) {
              lightboxMeta.classList.remove('is-meta-expanded');
              requestAnimationFrame(refreshStudioSeparators);
              return;
            }
            if (item.classList.contains('is-meta-collapsing')) return;
            const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            if (reduceMotion) {
              lightboxMeta.classList.remove('is-meta-expanded');
              item.classList.remove('is-meta-expanded');
              requestAnimationFrame(refreshStudioSeparators);
              return;
            }
            item.classList.add('is-meta-collapsing');
            lightboxMeta.classList.add('is-meta-collapsing-all');
            setTimeout(() => {
              item.classList.remove('is-meta-collapsing', 'is-meta-expanded');
              lightboxMeta.classList.remove('is-meta-collapsing-all', 'is-meta-expanded');
              requestAnimationFrame(refreshStudioSeparators);
            }, 200);
          };

          if (lightboxMeta.classList.contains('is-meta-collapsing-all')) return;

          if (!expandableItem) {
            collapseMeta(expandedItem);
            return;
          }

          if (expandedItem === expandableItem) {
            collapseMeta(expandableItem);
            return;
          }

          expandedItem?.classList.remove('is-meta-expanded');
          expandableItem.classList.add('is-meta-expanded');
          lightboxMeta.classList.add('is-meta-expanded');
          requestAnimationFrame(refreshStudioSeparators);
        });
      }
      const searchBtn = document.getElementById('posterLightboxSearch');
      const closeBtn = document.getElementById('posterLightboxClose');
      const lightboxFigure = lightbox && lightbox.querySelector('.poster-lightbox-figure');
      const lightboxScrollIndicator = document.getElementById('posterLightboxScrollIndicator');
      if (!lightbox || !lightboxImg || !closeBtn) return;

      function updateLightboxScrollIndicator() {
        if (!lightboxScrollIndicator || !lightboxFigure) return;
        if (!window.matchMedia('(max-width: 760px)').matches || !lightbox.classList.contains('open') || lightbox.classList.contains('simple-mode')) {
          lightboxScrollIndicator.classList.remove('visible', 'at-bottom');
          return;
        }

        const remaining = lightboxFigure.scrollHeight - lightboxFigure.clientHeight - lightboxFigure.scrollTop;
        const hasMoreBelow = lightboxFigure.scrollHeight > lightboxFigure.clientHeight + 8;
        if (!hasMoreBelow) {
          lightboxScrollIndicator.classList.remove('visible', 'at-bottom');
          return;
        }

        lightboxScrollIndicator.classList.add('visible');
        lightboxScrollIndicator.classList.toggle('at-bottom', remaining <= 14);
      }

      if (lightboxFigure) {
        lightboxFigure.addEventListener('scroll', updateLightboxScrollIndicator, { passive: true });
      }
      window.addEventListener('resize', updateLightboxScrollIndicator, { passive: true });

      // ── Zoom da imagem no mobile: toca no pôster pequeno e ele aparece
      // ampliado, centralizado, por cima de tudo. Só liga no mobile
      // (ver check da media query dentro do listener de click). ──
      const lightboxImageWrap = lightbox.querySelector('.poster-lightbox-image-wrap');
      const lightboxZoom = document.getElementById('posterLightboxZoom');
      const lightboxZoomImg = document.getElementById('posterLightboxZoomImg');
      const MOBILE_QUERY = '(max-width: 760px)';

      function closeImageZoom() {
        if (!lightboxZoom) return;
        lightboxZoom.classList.remove('open');
        lightboxZoom.setAttribute('aria-hidden', 'true');
      }

      // Reutilizado pelos cards de True Characters: no mobile, tocar
      // somente na imagem mostra a mesma ampliação fullscreen do
      // pôster dentro do posterlightbox.
      window.__openPosterImageZoom = function(src, alt = '', isTrueCharacter = false) {
        if (!window.matchMedia(MOBILE_QUERY).matches || !lightboxZoom || !lightboxZoomImg || !src) return;
        lightboxZoomImg.src = src;
        lightboxZoomImg.alt = alt;
        lightboxZoom.classList.toggle('true-character-zoom', isTrueCharacter);
        lightboxZoom.classList.add('open');
        lightboxZoom.setAttribute('aria-hidden', 'false');
      };

      if (lightboxImageWrap && lightboxZoom && lightboxZoomImg) {
        lightboxImageWrap.addEventListener('click', function(e) {
          if (!window.matchMedia(MOBILE_QUERY).matches) return;
          if (!lightboxImg.src) return;
          e.preventDefault();
          e.stopPropagation();
          window.__openPosterImageZoom(lightboxImg.src, lightboxImg.alt);
        });

        lightboxZoom.addEventListener('click', function(e) {
          e.stopPropagation();
          closeImageZoom();
        });
      }

      let lastFocused = null;
      let currentItem = null;
      let sequelPosterDefaultSrc = '';
      let sequelPosterAltSrc = '';
      let sequelPosterActive = false;
      let sequelPosterToggleToken = 0;
      let randomPlanNavigation = false;
      // Quando o poster-lightbox é aberto pelo randomizer, ele fica
      // travado neste anime: sem navegação lateral por setas ou swipe.
      let randomPlanNavigationLocked = false;
      let randomPlanHistory = [];
      let randomPlanHistoryIndex = -1;
      const randomPlanCardCache = new Map();
      let pendingItem = null;
      let lightboxRenderToken = 0;

      function toggleSequelPoster(event) {
        if (!lightboxAnnounce?.classList.contains('is-sequel-toggle')) return;
        event.preventDefault();
        event.stopPropagation();
        const item = currentItem;
        const toggleToken = sequelPosterToggleToken;
        if (!item || !lightbox.classList.contains('open')) return;

        if (sequelPosterActive) {
          sequelPosterActive = false;
          lightboxAnnounce.classList.remove('is-sequel-active');
          lightboxAnnounce.setAttribute('aria-pressed', 'false');
          lightboxImg.src = sequelPosterDefaultSrc;
          updateAmbientFromPoster(sequelPosterDefaultSrc);
          return;
        }

        preloadLightboxPoster(sequelPosterAltSrc, 'high').then(loaded => {
          if (!loaded || currentItem !== item || toggleToken !== sequelPosterToggleToken
            || !lightbox.classList.contains('open')) return;
          sequelPosterActive = true;
          lightboxAnnounce.classList.add('is-sequel-active');
          lightboxAnnounce.setAttribute('aria-pressed', 'true');
          lightboxImg.src = sequelPosterAltSrc;
          updateAmbientFromPoster(sequelPosterAltSrc);
        });
      }

      if (lightboxAnnounce) {
        lightboxAnnounce.addEventListener('click', toggleSequelPoster);
        lightboxAnnounce.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          toggleSequelPoster(event);
        });
      }

      // ── Som especial ao abrir o poster-lightbox do Re:ZERO ──
      const rezeroSound = new Audio('assets/sounds/rdb-rezero.mp3');
      rezeroSound.loop = true;
      const REZERO_IDS = ['re-zero', 're-zero-4'];

      // ── Som especial ao abrir o poster-lightbox do JJK (sem loop) ──
      const jjkSound = new Audio('assets/sounds/yuta-jjk.mp3');
      jjkSound.loop = false;
      const JJK_IDS = ['jjk'];

      // ── Som especial ao abrir o poster-lightbox do AOT (sem loop) ──
      const aotSound = new Audio('assets/sounds/aot-roar.mp3');
      aotSound.loop = false;
      const AOT_IDS = ['aot', 'rw-aot'];

      // ── Som especial ao abrir o poster-lightbox do One Piece (sem loop) ──
      const onePieceSound = new Audio('assets/sounds/luffy-haki.mp3');
      onePieceSound.loop = false;
      const ONE_PIECE_IDS = ['one-piece'];

      // ── Controle global e persistente dos efeitos do poster lightbox ──
      const POSTER_SOUND_MUTED_KEY = 'posterLightboxSoundMuted';
      const posterSoundEffects = [rezeroSound, jjkSound, aotSound, onePieceSound];
      let posterSoundMuted = false;
      try {
        posterSoundMuted = localStorage.getItem(POSTER_SOUND_MUTED_KEY) === 'true';
      } catch (e) {}

      function itemHasPosterSound(item) {
        if (!item || !item.id) return false;
        return REZERO_IDS.includes(item.id)
          || JJK_IDS.includes(item.id)
          || AOT_IDS.includes(item.id)
          || ONE_PIECE_IDS.includes(item.id);
      }

      function updatePosterSoundButton() {
        posterSoundEffects.forEach(audio => { audio.muted = posterSoundMuted; });
        if (!soundBtn) return;
        const soundOnIcon = soundBtn.querySelector('.poster-lightbox-sound-on');
        const soundOffIcon = soundBtn.querySelector('.poster-lightbox-sound-off');
        if (soundOnIcon) soundOnIcon.style.display = posterSoundMuted ? 'none' : '';
        if (soundOffIcon) soundOffIcon.style.display = posterSoundMuted ? '' : 'none';
        soundBtn.setAttribute('aria-pressed', posterSoundMuted ? 'true' : 'false');
        soundBtn.setAttribute('aria-label', posterSoundMuted ? 'Enable Sound Effects ' : 'Turn Off Sound Effects ');
        soundBtn.dataset.tooltip = posterSoundMuted ? 'Enable  Sound Effects  (M)' : 'Turn Off Sound Effects  (M)';
      }

      function togglePosterSound() {
        posterSoundMuted = !posterSoundMuted;
        try {
          localStorage.setItem(POSTER_SOUND_MUTED_KEY, String(posterSoundMuted));
        } catch (e) {}
        updatePosterSoundButton();
      }

      updatePosterSoundButton();

      // ── Fade-out suave para os sound effects (usado ao fechar o lightbox) ──
      const _audioFadeTimers = new WeakMap();

      function fadeOutAudio(audio, duration = 1800) {
        if (!audio) return;
        const existingTimer = _audioFadeTimers.get(audio);
        if (existingTimer) {
          clearInterval(existingTimer);
          _audioFadeTimers.delete(audio);
        }
        if (audio.paused) return;
        const steps = 20;
        const stepTime = duration / steps;
        const startVolume = audio.volume > 0 ? audio.volume : 1;
        const volumeStep = startVolume / steps;
        let currentStep = 0;
        const timer = setInterval(() => {
          currentStep++;
          const newVolume = Math.max(0, startVolume - (volumeStep * currentStep));
          audio.volume = newVolume;
          if (currentStep >= steps || newVolume <= 0) {
            clearInterval(timer);
            _audioFadeTimers.delete(audio);
            audio.pause();
            audio.currentTime = 0;
            audio.volume = startVolume;
          }
        }, stepTime);
        _audioFadeTimers.set(audio, timer);
      }

      function stopAudioInstantly(audio) {
        if (!audio) return;
        const existingTimer = _audioFadeTimers.get(audio);
        if (existingTimer) {
          clearInterval(existingTimer);
          _audioFadeTimers.delete(audio);
        }
        audio.pause();
        audio.currentTime = 0;
        if (audio.volume === 0) audio.volume = 1;
      }

      // ── Sistema de notas (Story / Animation / Characters / Ending) ──
      const META_STORAGE_KEY = 'myanimerank_meta';
      const META_FIELDS = [
        { key: 'studio',  label: 'Studio',    placeholder: 'br' },
        { key: 'season',  label: 'Year', placeholder: 'br' },
        { key: 'rewatch', label: 'Rewatch',   placeholder: 'patapim' }
      ];

      // ── SCORE ao vivo do MyAnimeList ──
      // Campo extra que aparece à esquerda do Studio, só quando o anime
      // tem um "malUrl" cadastrado (Watching Now / Plan to Watch — ver
      // showItem/renderMeta). O número vem direto da API pública do
      // Jikan (api.jikan.moe, espelho não-oficial do MyAnimeList), então
      // se a nota mudar lá no MAL, ela muda sozinha aqui também — sem
      // precisar editar nada no site. O valor fica em cache (localStorage)
      // por algumas horas pra não bater na API toda hora à toa.
      const SCORE_FIELD = { key: 'score', label: 'MAL Score', placeholder: '–' };
      const MAL_SCORE_CACHE_KEY = 'myanimerank_mal_score_cache';
      const MAL_SCORE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas (nota já existe)
      // Quando o anime ainda não estreou (ou a nota do MAL ainda não
      // existe), o cache dura bem menos — assim, assim que ele ganhar
      // nota lá no MAL, o site pega isso rápido, sem ficar preso num
      // "sem nota" antigo por 6h.
      const MAL_SCORE_NULL_TTL_MS = 30 * 60 * 1000; // 30 minutos

      function extractMalId(malUrl) {
        if (!malUrl) return null;
        const m = String(malUrl).match(/myanimelist\.net\/anime\/(\d+)/i);
        return m ? m[1] : null;
      }

      function loadMalScoreCache() {
        try {
          return JSON.parse(localStorage.getItem(MAL_SCORE_CACHE_KEY) || '{}');
        } catch (e) {
          return {};
        }
      }

      function saveMalScoreCache(cache) {
        try {
          localStorage.setItem(MAL_SCORE_CACHE_KEY, JSON.stringify(cache));
        } catch (e) {}
      }

      function getCachedMalScore(malId) {
        if (!malId) return null;
        const cache = loadMalScoreCache();
        return cache[malId] || null;
      }

      function setCachedMalScore(malId, score) {
        if (!malId) return;
        const cache = loadMalScoreCache();
        cache[malId] = { score: score, ts: Date.now() };
        saveMalScoreCache(cache);
      }

      function formatMalScoreText(score) {
        return (typeof score === 'number' && !isNaN(score)) ? score.toFixed(2) : '–';
      }

      // ── Limite de requisições do Jikan ──
      // A API pública permite ~3 chamadas por segundo E ~60 por minuto.
      // Aqui as duas regras são respeitadas, com uma margem de segurança:
      //  • espaço mínimo entre chamadas;
      //  • teto de chamadas numa janela móvel de 60s;
      //  • se vier 429 (ou erro de servidor/rede), pausa TUDO e tenta de
      //    novo com espera crescente (respeita o Retry-After se existir);
      //  • a mesma nota nunca é pedida duas vezes ao mesmo tempo;
      //  • erro temporário NÃO apaga a nota que já estava no cache.
      const JIKAN_MIN_GAP_MS = 400;
      const JIKAN_MAX_PER_MINUTE = 50;
      const JIKAN_MAX_RETRIES = 2;
      const JIKAN_TIMEOUT_MS = 6000;
      let jikanQueueTail = Promise.resolve();
      let jikanRequestTimes = [];
      let jikanBlockedUntil = 0;
      const jikanInFlight = new Map();

      function jikanSleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }

      async function waitForJikanSlot() {
        for (;;) {
          const now = Date.now();
          jikanRequestTimes = jikanRequestTimes.filter(t => now - t < 60000);
          const last = jikanRequestTimes.length ? jikanRequestTimes[jikanRequestTimes.length - 1] : 0;
          const waits = [jikanBlockedUntil - now, last + JIKAN_MIN_GAP_MS - now];
          if (jikanRequestTimes.length >= JIKAN_MAX_PER_MINUTE) {
            waits.push(jikanRequestTimes[0] + 60000 - now);
          }
          const wait = Math.max(...waits, 0);
          if (wait <= 0) {
            jikanRequestTimes.push(now);
            return;
          }
          await jikanSleep(wait);
        }
      }

      // Executa as tarefas uma de cada vez, na ordem em que chegaram.
      function queueMalFetch(task) {
        const result = jikanQueueTail.then(task);
        jikanQueueTail = result.catch(() => {});
        return result;
      }

      // GET genérico no Jikan, já respeitando fila, limite e retry.
      // Resolve com o JSON, ou null se o recurso não existe (404).
      // Rejeita só quando a API está indisponível.
      //
      // Se a conexão DIRETA com api.jikan.moe falhar por rede (timeout,
      // DNS, provedor/firewall bloqueando — ex: ERR_CONNECTION_TIMED_OUT),
      // tenta o mesmo endereço por proxies CORS públicos. Quando um proxy
      // funciona, o site passa a usá-lo por 5 minutos antes de tentar a
      // conexão direta de novo. Para desligar: JIKAN_USE_PROXY_FALLBACK = false.
      const JIKAN_BASE = 'https://api.jikan.moe/v4';
      const JIKAN_USE_PROXY_FALLBACK = true;
      const JIKAN_PROXIES = [
        url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
        url => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url)
      ];
      const JIKAN_PROXY_STICKY_MS = 5 * 60 * 1000;
      let jikanPreferProxyUntil = 0;

      // Uma tentativa de GET com timeout. Devolve { ok, json, status }
      // (status = null quando não houve resposta: timeout/rede/bloqueio).
      async function jikanFetchOnce(url, requireData) {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), JIKAN_TIMEOUT_MS) : null;
        try {
          const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
          if (!res.ok) return { ok: false, json: null, status: res.status, res };
          const json = await res.json();
          // Proxies podem devolver páginas/erros em vez do JSON do Jikan.
          if (requireData && !(json && typeof json === 'object' && 'data' in json)) {
            return { ok: false, json: null, status: null };
          }
          return { ok: true, json, status: 200 };
        } catch (e) {
          return { ok: false, json: null, status: null };
        } finally {
          if (timer) clearTimeout(timer);
        }
      }

      async function jikanGetJson(path) {
        const directUrl = JIKAN_BASE + path;
        for (let attempt = 0; attempt <= JIKAN_MAX_RETRIES; attempt++) {
          await waitForJikanSlot();

          const tryDirect = () => jikanFetchOnce(directUrl, false);
          const tryProxies = async () => {
            if (!JIKAN_USE_PROXY_FALLBACK) return null;
            for (const build of JIKAN_PROXIES) {
              const pr = await jikanFetchOnce(build(directUrl), true);
              if (pr.ok) { jikanPreferProxyUntil = Date.now() + JIKAN_PROXY_STICKY_MS; return pr; }
            }
            return null;
          };

          let r;
          if (Date.now() < jikanPreferProxyUntil) {
            r = await tryProxies();
            if (!r) { jikanPreferProxyUntil = 0; r = await tryDirect(); }
          } else {
            r = await tryDirect();
            // Sem resposta nenhuma (rede/bloqueio): tenta pelos proxies.
            if (!r.ok && r.status === null) {
              const viaProxy = await tryProxies();
              if (viaProxy) r = viaProxy;
            }
          }
          if (r.ok) return r.json;

          window.__jikanLastError = {
            path,
            status: r.status === null ? 'sem resposta (timeout/rede/bloqueio)' : r.status,
            attempt: attempt + 1,
            at: new Date().toISOString()
          };
          try { console.warn('[MAL Score] falha ao consultar o Jikan:', window.__jikanLastError); } catch (e) {}
          if (r.status === 404) return null;
          // Outros 4xx (fora o 429) não adianta repetir.
          if (r.status !== null && r.status !== 429 && r.status < 500) break;
          const retryAfter = r.res ? parseInt(r.res.headers.get('Retry-After'), 10) : NaN;
          const backoff = Number.isFinite(retryAfter)
            ? retryAfter * 1000
            : Math.min(2000 * Math.pow(2, attempt), 15000);
          jikanBlockedUntil = Date.now() + backoff;
        }
        throw new Error('jikan unavailable');
      }

      // Resolve com número (nota) ou null (anime sem nota / não existe).
      async function fetchMalScoreFromApi(malId) {
        const json = await jikanGetJson(`/anime/${malId}`);
        const score = json && json.data ? json.data.score : null;
        return (typeof score === 'number') ? score : null;
      }

      // Quantos pedidos "do usuário" (nota do pôster aberto) estão na fila.
      // Tarefas de segundo plano (nomes alternativos) esperam isso zerar.
      let jikanForegroundPending = 0;
      function requestMalScore(malId) {
        if (jikanInFlight.has(malId)) return jikanInFlight.get(malId);
        jikanForegroundPending++;
        const promise = queueMalFetch(() => fetchMalScoreFromApi(malId))
          .finally(() => {
            jikanInFlight.delete(malId);
            jikanForegroundPending--;
          });
        jikanInFlight.set(malId, promise);
        return promise;
      }

      // Busca (com cache) a nota atual do MAL e atualiza o campo na tela
      // — só se o lightbox ainda estiver mostrando esse mesmo anime
      // quando a resposta chegar (evita atualizar o card errado depois
      // que o usuário já trocou de pôster).
      function updateLiveMalScore(animeId, malId, valueEl) {
        if (!malId || !valueEl) return;
        const cached = getCachedMalScore(malId);
        if (cached) {
          valueEl.textContent = formatMalScoreText(cached.score);
          valueEl.classList.toggle('empty', cached.score == null);
        }
        const ttl = (cached && cached.score == null) ? MAL_SCORE_NULL_TTL_MS : MAL_SCORE_CACHE_TTL_MS;
        const isFresh = cached && (Date.now() - cached.ts) < ttl;
        if (isFresh) return;
        const attemptFetch = (retriesLeft) => {
          requestMalScore(malId).then(score => {
            setCachedMalScore(malId, score);
            if (!currentItem || currentItem.id !== animeId) return;
            const liveEl = lightboxMeta && lightboxMeta.querySelector('.rank-meta-value[data-field="score"]');
            if (liveEl) {
              liveEl.textContent = formatMalScoreText(score);
              liveEl.classList.toggle('empty', score == null);
            }
          }).catch(() => {
            // API fora do ar ou limite estourado: mantém a nota antiga
            // (se houver) e tenta de novo em alguns segundos, enquanto
            // o pôster continuar aberto. Esgotadas as tentativas, troca
            // o "…" por "–" em vez de ficar carregando pra sempre.
            if (retriesLeft > 0) {
              setTimeout(() => {
                if (!currentItem || currentItem.id !== animeId) return;
                attemptFetch(retriesLeft - 1);
              }, 6000);
              return;
            }
            if (!currentItem || currentItem.id !== animeId) return;
            const liveEl = lightboxMeta && lightboxMeta.querySelector('.rank-meta-value[data-field="score"]');
            if (liveEl && !getCachedMalScore(malId)) {
              liveEl.textContent = formatMalScoreText(null);
              liveEl.classList.add('empty');
              const why = window.__jikanLastError;
              if (why) liveEl.title = 'Não foi possível buscar a nota (status: ' + why.status + ')';
            }
          });
        };
        attemptFetch(1);
      }

      function loadAllMeta() {
        try {
          return JSON.parse(localStorage.getItem(META_STORAGE_KEY) || '{}');
        } catch (e) {
          return {};
        }
      }

function getMetaFor(animeId) {
        const all = loadAllMeta();
        const staticMeta = (typeof ANIME_STATIC_META !== 'undefined' && ANIME_STATIC_META[animeId]) || {};
        return { ...staticMeta, ...(all[animeId] || {}) };
      }

      // Formato opcional no info.js para animes com estúdios diferentes
      // por temporada:
      // studios: [
      //   { season: '1ª temporada', name: 'MADHOUSE' },
      //   { season: '2ª e 3ª temporadas', name: 'J.C. Staff' }
      // ]
      // Também aceita um objeto { '1ª temporada': 'MADHOUSE' }.
      // O campo antigo "studio" continua sendo usado normalmente nos
      // animes que têm um único estúdio (ou a mesma equipe em todas).
      function normalizeStudioEntries(studios) {
        if (Array.isArray(studios)) {
          return studios.map(entry => {
            if (typeof entry === 'string') {
              const [season, ...name] = entry.split(':');
              return { season: season.trim(), name: name.join(':').trim() };
            }
            return {
              season: String(entry && (entry.season || entry.label || '')).trim(),
              name: String(entry && (entry.name || entry.studio || entry.value || '')).trim()
            };
          }).filter(entry => entry.season && entry.name);
        }
        if (studios && typeof studios === 'object') {
          return Object.entries(studios)
            .map(([season, name]) => ({ season: String(season).trim(), name: String(name).trim() }))
            .filter(entry => entry.season && entry.name);
        }
        return [];
      }

      function renderMeta(animeId, isWatchingNow, malUrl, allowLiveScore) {
        if (!lightboxMeta) return;
        // Somente leitura: os valores vêm direto do rawAnimeData (studio, airedSeason, rewatch).
        // Para alterar, edite o objeto correspondente no rawAnimeData pelo VSCode.
        const metaObj = getMetaFor(animeId);

        // No "Watching Now", o campo "Rewatch" não aparece em nenhum
        // Posterlight Box. Nos demais cards, continua sendo exibido normalmente.
        let fields = isWatchingNow
          ? META_FIELDS.filter(field => field.key !== 'rewatch')
          : META_FIELDS;

        // SCORE (nota ao vivo do MAL): só entra na frente do Studio
        // quando o card permite (Watching Now / Plan to Watch) e o
        // anime tem um "malUrl" cadastrado — ver showItem.
        const malId = allowLiveScore ? extractMalId(malUrl) : null;
        if (malId) {
          fields = [SCORE_FIELD, ...fields];
        }

        lightboxMeta.style.gridTemplateColumns = `repeat(${fields.length}, 1fr)`;

        const fieldsHtml = fields.map(field => {
          if (field.key === 'score') {
            const cached = getCachedMalScore(malId);
            const initialText = cached ? formatMalScoreText(cached.score) : '…';
            return `
            <div class="rank-meta-item rank-meta-item--score">
              <span class="rank-meta-label">${field.label}</span>
              <a class="rank-meta-value rank-meta-value--score" data-field="score" href="${escapeHtml(malUrl)}" target="_blank" rel="noopener">${initialText}</a>
            </div>`;
          }
          let rawValue = metaObj[field.key] || '';
          const isEmpty = !rawValue;
          const studioEntries = field.key === 'studio' ? normalizeStudioEntries(metaObj.studios) : [];
          if (studioEntries.length) {
            return `
              <div class="rank-meta-item rank-meta-item--studio rank-meta-item--studios">
                <span class="rank-meta-label">Studios</span>
                <span class="rank-meta-value rank-meta-studio-list" data-field="studio">
                  ${studioEntries.map(entry => `
                    <span class="rank-meta-studio-row">
                      <span class="rank-meta-studio-season">${escapeHtml(entry.season).replace(/\b([IVXLCDM]+)\b/g, '<span class="rank-mal-roman">$1</span>')}</span>
                      <span class="rank-meta-studio-name">${escapeHtml(entry.name)}</span>
                    </span>`).join('')}
                </span>
              </div>`;
          }
          // "rewatchs" (opcional no info.js) segue o mesmo formato de "studios":
          // rewatchs: [ { season: 'S1', name: 'One time' }, { season: 'S2', name: 'Two times' } ]
          const rewatchEntries = field.key === 'rewatch' ? normalizeStudioEntries(metaObj.rewatchs) : [];
          if (rewatchEntries.length) {
            return `
              <div class="rank-meta-item rank-meta-item--rewatch rank-meta-item--studios">
                <span class="rank-meta-label">Rewatch</span>
                <span class="rank-meta-value rank-meta-studio-list" data-field="rewatch">
                  ${rewatchEntries.map(entry => `
                    <span class="rank-meta-studio-row">
                      <span class="rank-meta-studio-season">${escapeHtml(entry.season).replace(/\b([IVXLCDM]+)\b/g, '<span class="rank-mal-roman">$1</span>')}</span>
                      <span class="rank-meta-studio-name">${escapeHtml(entry.name)}</span>
                    </span>`).join('')}
                </span>
              </div>`;
          }
          // O "!" no final de "season" é só um marcador interno e não deve
          // aparecer pro usuário no campo de Lançamento.
          if (field.key === 'season') {
            rawValue = rawValue.replace(/!$/, '');
            // Lançamentos ainda em exibição (ex: "1999-?", "2023-?") mostram
            // só o ano de início ("1999", "2023") — sem o "-?". Intervalos já
            // fechados (ex: "2006-2008") continuam aparecendo por completo.
            rawValue = rawValue.replace(/-\?$/, '');
          }
          // Quando há mais de um estúdio (ex: "Wit Studio/MAPPA" ou "PB
          // Animation, LAN Studio, ..."), a lista pode vir separada por
          // "/" ou por vírgula na origem — por isso quebramos por ambos
          // pra sempre extrair os nomes individuais. A partir daí, o
          // separador de exibição segue uma regra fixa: 2 estúdios usam
          // " and " (ex: "Studio 1 and Studio 2"); 3 ou mais usam vírgula
          // e "and" antes do último (ex: "Studio 1, Studio 2 and Studio 3").
          const studioParts = field.key === 'studio'
            ? rawValue.split(/[\/,]/).map(s => s.trim()).filter(Boolean)
            : [];
          const isMultiStudio = field.key === 'studio' && studioParts.length > 1;
          const studioSeparator = studioParts.length >= 3 ? ', ' : ' and\u00A0';
          const displayValueHtml = isMultiStudio
            ? (studioParts.length >= 3
                ? studioParts.slice(0, -1).map(s => escapeHtml(s)).join(studioSeparator) + ' and ' + escapeHtml(studioParts[studioParts.length - 1])
                : studioParts.map(s => escapeHtml(s)).join(studioSeparator))
            : escapeHtml(rawValue);
          const labelText = isMultiStudio ? field.label + 's' : field.label;
          const clampClass = (field.key === 'studio' || field.key === 'rewatch') ? ' rank-meta-value--clamp' : '';
          return `
            <div class="rank-meta-item rank-meta-item--${field.key}">
              <span class="rank-meta-label">${labelText}</span>
              <span class="rank-meta-value${isEmpty ? ' empty' : ''}${clampClass}"
                    data-field="${field.key}">${isEmpty ? escapeHtml(field.placeholder) : displayValueHtml}</span>
            </div>`;
        }).join('');

        studioSeparatorResizeObserver?.disconnect();
        lightboxMeta.innerHTML = fieldsHtml;
        lightboxMeta.classList.remove('is-meta-expanded');
        lightboxMeta.querySelectorAll('.rank-meta-studio-list').forEach(list => {
          studioSeparatorResizeObserver?.observe(list);
          requestAnimationFrame(() => updateStudioSeparators(list));
        });

        if (malId) {
          const scoreEl = lightboxMeta.querySelector('.rank-meta-value[data-field="score"]');
          updateLiveMalScore(animeId, malId, scoreEl);
        }
      }

      // ── Notas do MyAnimeList (por temporada) ──
      // Só aparece nos cards do "All Animes" (animeData) e somente quando o
      // item tiver um array "mal" preenchido, ex:
      //   mal: [ { label: "1ª temporada", episodes: 25, note: 8.42 }, ... ]
      // Basta editar o objeto correspondente lá no rawAnimeData.
      // Ícone de link externo (mesmo usado no botão do MyAnimeList),
      // reaproveitado nos botões do Anime-Planet e Crunchyroll.
      const EXTERNAL_LINK_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path></svg>`;

      // Ícone (•••) do botão que revela Crunchyroll/MyAnimeList escondidos
      // atrás do Anime-Planet — ver ".watch-now-toggle"/".watch-now-extra".
      const WATCH_NOW_TOGGLE_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

      // Link para a sua lista pessoal no MyAnimeList. Usado no logo do MAL
      // dentro do lightbox do "All Animes" — só é clicável no PC (ver CSS
      // ".rank-mal > .rank-mal-label--mal", regra @media min-width:761px);
      // no mobile o logo continua sendo só um ícone, sem ação.
      // Base da URL da sua lista pessoal no MyAnimeList. Cada card do
      // lightbox do "All Animes" usa essa base + o título do anime (via
      // "?s=") pra abrir a lista já filtrada por aquele anime específico.
      const MAL_PROFILE_LIST_BASE_URL = 'https://myanimelist.net/animelist/ptbr';

      function buildMalProfileSearchUrl(item) {
        if (!item) return MAL_PROFILE_LIST_BASE_URL;
        // "malSearch" é um termo de busca escrito à mão pra casos em que
        // o título completo (ou a parte antes dos ":") não bate direito
        // com o nome que aparece na sua lista do MAL — ex: "Re:ZERO"
        // (o ":" vem colado, sem espaço, então cortar nele vira só "Re")
        // ou "Danmachi" (que na sua lista aparece como "Is It Wrong...").
        // Quando não houver "malSearch", cai no padrão: usa a parte antes
        // de ": " (dois pontos seguido de espaço) — só corta aí porque
        // ":" colado numa palavra (tipo "Re:ZERO") normalmente é parte
        // do próprio nome, não um separador de subtítulo.
        if (item.malSearch) return `${MAL_PROFILE_LIST_BASE_URL}?s=${encodeURIComponent(item.malSearch)}&order=-14`;
        const title = item.title || '';
        const colonSplitIndex = title.indexOf(': ');
        const shortTitle = colonSplitIndex !== -1 ? title.slice(0, colonSplitIndex) : title;
        return `${MAL_PROFILE_LIST_BASE_URL}?s=${encodeURIComponent(shortTitle)}&order=-14`;
      }

      function buildAnimePlanetButtonHtml(url) {
        if (!url) return '';
        return `
          <a class="rank-mal-label rank-mal-label--anime-planet" href="${url}" target="_blank" rel="noopener">
            <span class="watch-now-more-info-text">LINKS ABOUT</span>
            <img class="anime-planet-btn-logo" src="assets/logos/anime-planet.webp" alt="Anime-Planet" loading="lazy" decoding="async">
            ${EXTERNAL_LINK_ICON_SVG}
          </a>`;
      }

      function buildCrunchyrollButtonHtml(url) {
        if (!url) return '';
        // Link normal do Crunchyroll: se o app estiver instalado no
        // celular, o próprio sistema (universal link / app link) abre
        // ele direto no app; sem o app, cai no site normalmente.
        // Quando o link é do YouTube (ex.: Golden Boy, que não tem no
        // Crunchyroll), troca a logo pra do YouTube.
        const isYoutube = /youtube\.com|youtu\.be/i.test(url);
        const logoSrc = isYoutube ? 'assets/logos/youtube.webp' : 'assets/logos/crunchyroll.webp';
        const logoAlt = isYoutube ? 'YouTube' : 'Crunchyroll';
        const logoClass = isYoutube ? 'crunchyroll-btn-logo crunchyroll-btn-logo--youtube' : 'crunchyroll-btn-logo';
        return `
          <a class="rank-mal-label rank-mal-label--crunchyroll" href="${url}" target="_blank" rel="noopener">
            <img class="${logoClass}" src="${logoSrc}" alt="${logoAlt}" loading="lazy" decoding="async">
            ${EXTERNAL_LINK_ICON_SVG}
          </a>`;
      }

      function buildNetflixButtonHtml(url) {
        if (!url) return '';
        return `
          <a class="rank-mal-label rank-mal-label--netflix" href="${url}" target="_blank" rel="noopener">
            <img class="netflix-btn-logo" src="assets/logos/netflix.webp" alt="Netflix" loading="lazy" decoding="async">
            ${EXTERNAL_LINK_ICON_SVG}
          </a>`;
      }

      function buildWatchNowMalButtonHtml(url) {
        if (!url) return '';
        return `
          <a class="rank-mal-label rank-mal-label--mal" href="${url}" target="_blank" rel="noopener">
            <img class="mal-btn-logo" src="assets/logos/myanimelist.webp" alt="MyAnimeList" loading="lazy" decoding="async">
            ${EXTERNAL_LINK_ICON_SVG}
          </a>`;
      }

      // Botão "LINKS ABOUT" do MyAnimeList usado no lightbox do "All
      // Animes" (myranks), acima das notas/temporadas — visual IDÊNTICO
      // ao botão "LINKS ABOUT" do Anime-Planet usado no Watching Now/
      // Plan to Watch (mesma marcação: texto "LINKS ABOUT" + logo +
      // ícone de link externo dentro de ".watch-now-links"), só que
      // aponta pra sua lista pessoal no MyAnimeList em vez do
      // Anime-Planet. Ver CSS ".rank-mal-label--links-about".
// Monta as linhas de "1ª temporada", "2ª temporada" etc. (sem nota)
      // pra um anime do Watching Now que ainda não tem entrada no Global
      // Ranking, reaproveitando os mesmos campos já usados na barra de
      // progresso (seasons/movieSeasons/movieDurations/cours) — ver
      // buildAnimeItemHtml, mais abaixo, onde esses campos também viram
      // os marcadores de temporada/filme/cour da barra.
      function buildWatchingSeasonEntries(watchItem) {
        if (!watchItem || !Array.isArray(watchItem.seasons) || !watchItem.seasons.length) return null;
        const movieIdxSet = new Set(Array.isArray(watchItem.movieSeasons) ? watchItem.movieSeasons : []);
        const courRomanNumerals = ['I', 'II', 'III', 'IV', 'V'];
        // Total de temporadas "de verdade" (exclui os índices que são
        // filme). Quando só existe UMA, o label vira "1 temporada" em vez
        // de "1ª temporada" — o ordinal só faz sentido quando há mais de
        // uma temporada pra numerar/diferenciar.
        const totalSeasons = watchItem.seasons.reduce(
          (count, _epCount, idx) => count + (movieIdxSet.has(idx) ? 0 : 1),
          0
        );
        let seasonNum = 0;
        const entries = [];
        watchItem.seasons.forEach((epCount, idx) => {
          if (movieIdxSet.has(idx)) {
            const duration = watchItem.movieDurations && watchItem.movieDurations[idx];
            // "movieLabels" (opcional): permite dar um nome específico ao
            // filme (ex: "Movie 5: The Dumpster Battle", "Movie: Legend of
            // Crimson") em vez do genérico "Filme". Usado quando o filme
            // tem um subtítulo próprio que vale a pena mostrar.
            const movieLabel = (watchItem.movieLabels && watchItem.movieLabels[idx]) || 'Filme';
            entries.push({ label: movieLabel, episodes: duration || epCount, noRating: true });
            return;
          }
          seasonNum++;
          const seasonWord = totalSeasons === 1 ? `${seasonNum} temporada` : `${seasonNum}ª temporada`;
          // Quando só existe UMA temporada ("1 temporada", sem ordinal),
          // trata a linha como "unwatched" (nome/episódios riscados,
          // nota "-/-") em vez de "noRating" — igual a uma temporada
          // anunciada/ainda não assistida, já que não há temporadas
          // anteriores já avaliadas pra "ancorar" essa linha como em
          // progresso. "allUnwatched" (opcional no watchItem) força esse
          // mesmo tratamento em TODAS as temporadas, mesmo quando há mais
          // de uma (ex: Mob Psycho 100).
          const singleSeasonFlag = (totalSeasons === 1 || watchItem.allUnwatched) ? { unwatched: true } : { noRating: true };
          const courSplit = Array.isArray(watchItem.cours) ? watchItem.cours[idx] : null;
          if (Array.isArray(courSplit) && courSplit.length > 1) {
            courSplit.forEach((courEpCount, cIdx) => {
              const courLabel = courRomanNumerals[cIdx] || String(cIdx + 1);
              entries.push({ label: `${seasonWord} ${courLabel}`, episodes: courEpCount, ...singleSeasonFlag });
            });
          } else {
            entries.push({ label: seasonWord, episodes: epCount, ...singleSeasonFlag });
          }
        });
        return entries;
      }

      // Monta, na MESMA ordem/granularidade usada acima (temporada por
      // temporada, respeitando "cours" e filmes intercalados), o total
      // ACUMULADO de episódios até o fim de cada linha. Isso permite
      // comparar com o progresso atual (barra +/- do Watching Now) e
      // decidir se aquela linha já foi "alcançada" pelo progresso —
      // usado logo abaixo pra tirar o "unwatched" dinamicamente conforme
      // o usuário avança na barra.
      function computeWatchingEntryBoundaries(watchItem) {
        if (!watchItem || !Array.isArray(watchItem.seasons) || !watchItem.seasons.length) return null;
        const movieIdxSet = new Set(Array.isArray(watchItem.movieSeasons) ? watchItem.movieSeasons : []);
        const boundaries = [];
        let acc = 0;
        watchItem.seasons.forEach((epCount, idx) => {
          if (movieIdxSet.has(idx)) {
            acc += epCount;
            boundaries.push(acc);
            return;
          }
          const courSplit = Array.isArray(watchItem.cours) ? watchItem.cours[idx] : null;
          if (Array.isArray(courSplit) && courSplit.length > 1) {
            courSplit.forEach(courEpCount => {
              acc += courEpCount;
              boundaries.push(acc);
            });
          } else {
            acc += epCount;
            boundaries.push(acc);
          }
        });
        return boundaries;
      }

      // Guarda se a seta do "watch now" (Crunchyroll/MyAnimeList) está
      // aberta, pra manter esse estado quando o usuário navega pro
      // próximo/anterior pôster do lightbox (renderMalScores é chamado de
      // novo a cada troca de item e, sem isso, sempre voltaria fechada).
      let watchNowExtraOpen = false;

      function renderMalScores(animeId, isWatchingNow, animePlanetUrl, crunchyrollUrl, watchNowMalUrl, netflixUrl, isPlanToWatch = false) {
        if (!lightboxMal) return;

        lightboxMal.classList.remove('all-unwatched');

        // Limpa a cópia embaixo da imagem a cada render; quem preenche
        // de novo (quando houver) é o final desta função — ver
        // "lightboxMediaWatchNow" mais abaixo.
        if (lightboxMediaWatchNow) lightboxMediaWatchNow.innerHTML = '';

        // Precisa do "item" (entrada do anime no Global Ranking) já
        // aqui em cima porque, fora do "Watching Now"/"Plan to Watch"
        // (myranks), o botão "LINKS ABOUT" usa a URL da lista pessoal
        // no MyAnimeList (buildMalProfileSearchUrl), que depende dele —
        // e esse botão agora entra no MESMO fluxo de botões (cópia
        // embaixo da imagem/acima do Studio) usado pelo Watching Now.
        const animeTitleForId = (typeof ANIME_TITLE_BY_ID !== 'undefined') ? ANIME_TITLE_BY_ID[animeId] : undefined;
        // Plan to Watch pode ter o mesmo anime também cadastrado no
        // rawAnimeData (ex.: um item movido de lista ou compartilhando
        // o mesmo ID). Nesse modo, a fonte do bloco de temporadas deve
        // ser SEMPRE o próprio rawPlanToWatchData; caso contrário, as
        // notas já dadas no My Ranks poderiam aparecer por engano.
        const planItem = isPlanToWatch && typeof planToWatchData !== 'undefined'
          ? planToWatchData.find(a => a.id === animeId)
          : null;
        const item = planItem || ((typeof animeData !== 'undefined')
          ? animeData.find(a => a.id === animeId || (isWatchingNow && !isPlanToWatch && animeTitleForId && a.title === animeTitleForId))
          : null);

        // Botões do Anime-Planet, Crunchyroll e MyAnimeList (sempre que
        // houver link) e, só em telas mobile (via CSS), também um botão
        // "Watch Now" que tenta abrir o anime direto no app do
        // Crunchyroll, quando existir link. Só aparecem nos cards do
        // "Watching Now"/"Plan to Watch".
        // Só o botão do Anime-Planet fica visível de cara; Crunchyroll e
        // MyAnimeList (quando existirem) ficam escondidos atrás da seta
        // e só aparecem com uma animação de expansão ao lado quando ela é
        // clicada — ver CSS ".watch-now-toggle"/".watch-now-extra" e o
        // listener delegado em "lightboxMal" (mais abaixo no JS).
        // Importante: no HTML, ".watch-now-extra" fica ANTES da seta (e
        // não depois). Como ela nasce com largura 0, a seta some coladinha
        // no Anime-Planet; quando abre, o crescimento da largura empurra a
        // seta pra direita até ela ficar do lado do MyAnimeList.
        //
        // Fora do "Watching Now"/"Plan to Watch" (ou seja, no myranks/
        // "All Animes"), não existem Anime-Planet/Crunchyroll/Netflix —
        // só o botão "LINKS ABOUT" do MyAnimeList, levando pra sua
        // lista pessoal (mesmo visual do "LINKS ABOUT" do Anime-Planet).
        const allWatchNowBtnsHtml = isWatchingNow
          ? [
              buildAnimePlanetButtonHtml(animePlanetUrl),
              buildCrunchyrollButtonHtml(crunchyrollUrl),
              buildNetflixButtonHtml(netflixUrl),
              buildWatchNowMalButtonHtml(watchNowMalUrl),
            ].filter(Boolean)
          : [];
        let watchNowButtonsHtml = '';
        if (allWatchNowBtnsHtml.length) {
          const [firstWatchNowBtnHtml, ...restWatchNowBtnsHtml] = allWatchNowBtnsHtml;
          // As setas agora aparecem sempre (mesmo quando só existe o
          // Anime-Planet, sem Crunchyroll/MyAnimeList pra revelar) — é só
          // decoração/consistência visual. Quando não há "extra" pra
          // mostrar, ".watch-now-extra" nem é criado, então o clique na
          // seta só alterna a classe "open" sem efeito visual nenhum, e o
          // clique no texto "ABOUT" continua navegando direto pro
          // Anime-Planet normalmente (ver "hasExtraToReveal" em
          // handleWatchNowAreaClick, que checa ".watch-now-extra" e não
          // mais a seta em si).
          const watchNowToggleHtml = `<button type="button" class="watch-now-toggle" aria-label="Mostrar mais opções" aria-expanded="${watchNowExtraOpen ? 'true' : 'false'}">${WATCH_NOW_TOGGLE_ICON_SVG}</button>`;
          const watchNowToggleLeftHtml = `<button type="button" class="watch-now-toggle watch-now-toggle--left" aria-label="Mostrar mais opções" aria-expanded="${watchNowExtraOpen ? 'true' : 'false'}">${WATCH_NOW_TOGGLE_ICON_SVG}</button>`;
          const watchNowExtraHtml = restWatchNowBtnsHtml.length
            ? `<span class="watch-now-extra">${restWatchNowBtnsHtml.join('')}</span>`
            : '';
          watchNowButtonsHtml = `${watchNowToggleLeftHtml}${firstWatchNowBtnHtml}${watchNowExtraHtml}${watchNowToggleHtml}`;
        }
        // Se a seta já estava aberta (ex: usuário abriu e foi pro próximo
        // pôster), a "open" precisa vir junto no próprio HTML gerado —
        // não dá pra confiar só na classe do container antigo, já que ele
        // é recriado do zero a cada render.
        const watchNowLinksHtml = watchNowButtonsHtml
          ? `<div class="watch-now-links${watchNowExtraOpen ? ' open' : ''}">${watchNowButtonsHtml}</div>`
          : '';

        // Cópia dos mesmos botões pra ficar embaixo da imagem — só
        // aparece no desktop (CSS esconde essa cópia no mobile e esconde
        // a de dentro do painel no desktop; ver ".poster-lightbox-media-
        // watchnow" e ".rank-mal .watch-now-links").
        if (lightboxMediaWatchNow) lightboxMediaWatchNow.innerHTML = watchNowLinksHtml;
        // Cópia extra usada no mobile (ver grid-area "moreinfo" no CSS).
        // No desktop essa cópia fica escondida, pois LINKS ABOUT aparece
        // diretamente embaixo da imagem pelo "lightboxMediaWatchNow".
        if (lightboxMoreInfo) lightboxMoreInfo.innerHTML = watchNowLinksHtml;

        // No "Watching Now", as notas por temporada (bloco abaixo) só
        // aparecem quando esse mesmo anime também tiver uma entrada na
        // lista principal (animeData / "All Animes") com um array "mal"
        // preenchido — ex: Mushoku Tensei, Re:Zero e Grand Blue, cujas
        // temporadas anteriores já foram assistidas e avaliadas lá. A
        // temporada em exibição agora entra nesse mesmo array marcada
        // como "unwatched: true" (ver rawAnimeData). Quando o anime só
        // existe no "Watching Now" (ex: Konosuba), não há notas: mostra
        // só os botões acima.
        let entries = item && Array.isArray(item.mal) ? item.mal : null;

        // No rawPlanToWatchData, o campo "mal" usa exatamente o mesmo
        // formato do rawAnimeData, mas o site força TODAS as entradas
        // para "unwatched". Assim não é necessário repetir
        // `unwatched: true` em cada temporada/filme e qualquer `note`
        // colocada por acidente é ignorada neste modo.
        if (isPlanToWatch && entries && entries.length) {
          entries = entries.map(entry => {
            if (!entry || isMalDividerEntry(entry)) return entry;
            const { note, noRating, unwatched, ...rest } = entry;
            return { ...rest, unwatched: true };
          });
        }

        // Fallback: quando o anime do "Watching Now" NÃO tiver uma entrada
        // correspondente no Global Ranking (animeData) — ex: My Teen
        // Romantic Comedy SNAFU, que só existe aqui no Watching Now —
        // ainda assim monta as linhas de "1ª temporada", "2ª temporada"
        // etc. a partir do próprio campo "seasons" (o mesmo usado na
        // barra de progresso), só que sem nota (já que nunca foi avaliado
        // lá no Global Ranking). Assim TODO anime do Watching Now passa a
        // mostrar a divisão de temporadas/episódios, não só os que também
        // estão no Global Ranking.
        if ((!entries || !entries.length) && isWatchingNow && !isPlanToWatch && typeof watchingData !== 'undefined') {
          const watchItem = watchingData.find(a => a.id === animeId);
          const builtEntries = buildWatchingSeasonEntries(watchItem);
          if (builtEntries && builtEntries.length) entries = builtEntries;
        }

        if (!entries || !entries.length) {
          lightboxMal.innerHTML = '';
          return;
        }

        // ── Sincroniza o "unwatched" com o progresso atual ──
        // No Watching Now, cada linha ("1ª temporada", "2ª temporada I"
        // etc.) corresponde a um trecho de episódios dentro do total
        // acumulado (mesma lógica da barra +/- do card). O progresso
        // atual (base + override, igual usado na própria barra) manda:
        // uma linha só aparece com nota/"assistida" quando o progresso
        // já alcançou o FIM daquele trecho. Enquanto não alcança, a
        // linha vira "unwatched" — mesmo que já tenha uma nota salva de
        // antes (ex: um rewatch que ainda começou do episódio 0 não deve
        // mostrar as notas antigas como se já tivesse revisto tudo de
        // novo). Assim que o progresso passa daquele trecho, a nota
        // antiga volta a aparecer normalmente (ou "-/-" se nunca teve
        // nota).
        if (isWatchingNow && !isPlanToWatch && typeof watchingData !== 'undefined') {
          const watchItem = watchingData.find(a => a.id === animeId);
          if (watchItem) {
            const baseProgress = parseWatchProgress(watchItem);
            const baseCur = baseProgress ? baseProgress.cur : 0;
            const override = getWatchProgressOverride(animeId);
            const cur = override !== null ? override : baseCur;
            const boundaries = computeWatchingEntryBoundaries(watchItem);
            const nonSpacerCount = entries.filter(entry => !isMalDividerEntry(entry)).length;
            if (boundaries && boundaries.length === nonSpacerCount && Number.isFinite(cur)) {
              let bIdx = 0;
              entries = entries.map(entry => {
                if (isMalDividerEntry(entry)) return entry;
                const boundary = boundaries[bIdx++];
                const reached = cur >= boundary;
                if (!reached) {
                  // Progresso ainda não chegou até aqui: força
                  // "unwatched", escondendo qualquer nota antiga.
                  const { note, noRating, ...rest } = entry;
                  return { ...rest, unwatched: true };
                }
                if (entry.unwatched) {
                  // Progresso já passou desse trecho, mas nunca teve
                  // nota: vira "sem nota ainda" (-/-, sem risco) em vez
                  // de "unwatched" (nome/nota riscados, vermelho).
                  const { unwatched, ...rest } = entry;
                  return { ...rest, noRating: true };
                }

                return entry;
              });
            }
          }
        }

        const ratedEntries = entries.filter(entry => !isMalDividerEntry(entry));
        lightboxMal.classList.toggle(
          'all-unwatched',
          ratedEntries.length > 0 && ratedEntries.every(entry => entry.unwatched)
        );

        const MAL_NAME_ARROW_SVG = `<svg class="rank-mal-name-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>`;

        const rowEntries = entries.map(entry => {
          // Só texto (sem "spacer"): mostra o título numa linha própria,
          // sem o espaço de divisor e sem quebrar o grupo de alinhamento.
          // margin-top/bottom (inline) equilibram o respiro: menos em cima,
          // mais embaixo, pro título ficar no meio entre a linha anterior
          // e a seguinte. Ajuste esses dois valores se quiser mais/menos.
          if (!entry.spacer && isMalDividerEntry(entry)) {
            const titleOnly = entry.text.trim();
            return {
              alignable: false,
              html: `
            <div class="rank-mal-row rank-mal-row-break rank-mal-title-only" style="margin-top: -8px; margin-bottom: 7px;">
              <span class="rank-mal-spacer-title${entry.watched === true ? ' watched' : ''}" style="color: ${entry.watched === true ? 'var(--text)' : 'rgba(255,255,255,0.25)'} !important;">${escapeHtml(titleOnly)}</span>
            </div>`
            };
          }
          if (entry.spacer) {
            const spacerTitle = typeof entry.text === 'string'
              ? entry.text.trim()
              : (typeof entry.label === 'string' ? entry.label.trim() : '');
            return {
              alignable: false,
              // O spacer também separa os grupos de colunas. Sem isso,
              // uma temporada anterior pode herdar a largura do nome
              // exibido depois do divisor (ex.: "Hunter x Hunter (1999)").
              groupBreak: true,
              html: `
            <div class="rank-mal-row rank-mal-row-break">
              <span class="rank-mal-spacer${spacerTitle ? ' rank-mal-spacer--with-title' : ''}">${spacerTitle ? `<span class="rank-mal-spacer-title${entry.watched === true ? ' watched' : ''}" style="color: ${entry.watched === true ? 'var(--text)' : 'rgba(255,255,255,0.25)'} !important;">${escapeHtml(spacerTitle)}</span>` : ''}</span>
            </div>`
            };
          }
          const seasonLabelInner = escapeHtml(entry.label || '')
            .replace(/\b([IVXLCDM]+)\b/g, '<span class="rank-mal-roman">$1</span>')
            // Labels podem ter um "\n" manual (ver dados do anime) pra
            // forçar a quebra de linha num ponto específico do nome, em
            // vez de deixar o navegador decidir onde quebrar.
            .replace(/\n/g, '<br class="rank-mal-linebreak">');
          // "malName" (opcional, por temporada): nome real/oficial dessa
          // temporada no MyAnimeList (ex: "Code Geass: Lelouch of the
          // Rebellion R2"), diferente do label curto ("2ª temporada")
          // usado no card. Quando presente, uma setinha aparece do lado
          // do label e, ao clicar, revela esse nome numa linha abaixo
          // (ver ".rank-mal-realname-row"/handleWatchNowAreaClick).
          // Também vale no Watching Now: assim a seta do logo do MAL
          // consegue abrir os nomes oficiais das temporadas ali.
          const malName = typeof entry.malName === 'string' ? entry.malName.trim() : '';
          const hasMalName = !!malName;
          const seasonLabel = hasMalName
            ? `<span class="rank-mal-season--toggleable" role="button" tabindex="0" aria-expanded="false" aria-label="Mostrar nome real da temporada no MyAnimeList">${seasonLabelInner}</span>`
            : seasonLabelInner;
          const realnameRowHtml = hasMalName
            ? `
            <div class="rank-mal-row rank-mal-row-break rank-mal-realname-row">
              <span class="rank-mal-realname">${escapeHtml(malName)}</span>
            </div>`
            : '';
          const isNumericEpisodes = typeof entry.episodes === 'number';
          // Só entra no grupo de alinhamento quando, além de numérico, o
          // label é "limpo" (sem ":" dentro dele). Labels com ":" no meio
          // (filmes, especiais, ou algo tipo "4ª temporada III: The Final
          // Chapters") tendem a ser bem mais longos e, se entrassem no
          // grupo, esticariam a coluna e desalinhariam as demais linhas.
          const isAlignable = isNumericEpisodes
            && !String(entry.label || '').includes(':');
          const epPart = (entry.episodes != null && entry.episodes !== '')
            ? (isNumericEpisodes
                ? `: ${escapeHtml(String(entry.episodes))} episódios`
                : `: ${escapeHtml(String(entry.episodes))}`)
            : '';
          const hasNote = entry.note != null && entry.note !== '';
          const isUnwatched = !!entry.unwatched;
          // "noRating": usado nas linhas geradas automaticamente pro
          // Watching Now (anime sem entrada no Global Ranking) — mostra
          // "-/-" na nota, igual a uma temporada "unwatched", mas SEM
          // riscar o nome/episódios da temporada, já que ela está sendo
          // assistida normalmente, só não tem nota ainda.
          const isNoRating = !!entry.noRating;
          const noteText = hasNote
            ? `${escapeHtml(String(entry.note))}<span class="rank-mal-note-max">/10</span>`
            : ((isUnwatched || isNoRating) ? '-/-' : '—');
          const noteValue = hasNote ? parseFloat(entry.note) : NaN;
          const tierClass = (() => {
            if (!hasNote || isNaN(noteValue)) return '';
            const bucket = Math.floor(noteValue);
            if (bucket >= 10) return ' tier-10';
            if (bucket <= 5) return ' tier-05';
            return ' tier-' + bucket; // tier-6, tier-7, tier-8, tier-9
          })();
          const noteClass = hasNote
            ? tierClass
            : ((isUnwatched || isNoRating) ? ' unwatched' : ' empty');
          return {
            alignable: isAlignable,
            html: `
            <div class="rank-mal-row${isUnwatched ? ' unwatched' : ''}${isAlignable ? '' : ' rank-mal-row-break'}">
              <span class="rank-mal-content"><span class="rank-mal-season">${seasonLabel}</span><span class="rank-mal-eps">${epPart}</span></span>
              <span class="rank-mal-score">
                <span class="rank-mal-dots" aria-hidden="true"></span>
                <span class="rank-mal-note${noteClass}">${noteText}</span>
              </span>
            </div>${realnameRowHtml}`
          };
        });


        // Agrupa as linhas em blocos de alinhamento. Um spacer inicia um
        // bloco novo: ele é um divisor visual e não deve fazer o ":" da
        // temporada anterior acompanhar nomes que vêm depois dele.
        // Linhas não-alinháveis recebem a classe "rank-mal-row-break",
        // ocupando a largura inteira do grid em vez de participar das
        // colunas.
        //
        // O limiar é ">= 1" (não ">= 2"): mesmo com só UMA linha
        // alinhável (ex: One Piece, que só tem "1 temporada" — o resto
        // é filme/especial com ":" no nome, que não conta), o card
        // ainda entra no grupo. Sem isso, o card inteiro cai fora do
        // grid e usa o row-gap de 16px do ".rank-mal-rows" (pensado só
        // pra separar visualmente itens de tipos diferentes) em vez do
        // row-gap de 6px do grid, deixando TODAS as linhas do card
        // (não só a do nome real) visivelmente mais espaçadas que em
        // cards com 2+ temporadas.
        const rowGroups = [[]];
        rowEntries.forEach(row => {
          rowGroups[rowGroups.length - 1].push(row);
          if (row.groupBreak) rowGroups.push([]);
        });
        const rowsHtml = rowGroups
          .filter(group => group.length)
          .map(group => group.some(row => row.alignable)
            ? `<div class="rank-mal-align-group">${group.map(row => row.html).join('')}</div>`
            : group.map(row => row.html).join(''))
          .join('');

        // No Watching Now/Plan to Watch, o logo do MyAnimeList aparece
        // no bloco de temporadas somente quando o anime também possui
        // uma entrada real no My Ranks. Entradas montadas apenas pelo
        // fallback de "seasons" recebem o mesmo fundo, mas sem o logo.
        // Plan to Watch usa o mesmo card de temporadas/episódios, mas
        // propositalmente sem o cabeçalho e sem a logo do MyAnimeList.
        // Os `malName` continuam opcionais e podem ser revelados pelas
        // setas individuais, exatamente como no rawAnimeData.
        if (isPlanToWatch) {
          lightboxMal.innerHTML = `<div class="rank-mal-rows">${rowsHtml}</div>`;
          return;
        }

        if (isWatchingNow) {
          const hasMyRanksEntry = !!(item && Array.isArray(item.mal) && item.mal.length);
          let watchingMyRanksHeaderHtml = '';
          if (hasMyRanksEntry) {
            const watchingMyRanksMalUrl = buildMalProfileSearchUrl(item);
            // A seta é um controle fixo do cabeçalho do MAL: aparece em
            // todos os cards, mesmo quando este anime ainda não possui
            // malName cadastrado em alguma temporada.
            const watchingToggleAllHtml = `<button type="button" class="rank-mal-toggle-all" aria-expanded="false" aria-label="Mostrar todos os nomes das temporadas no MyAnimeList">${MAL_NAME_ARROW_SVG}</button>`;
            watchingMyRanksHeaderHtml = watchingMyRanksMalUrl
              ? `<div class="rank-mal-myranks-header"><a class="rank-mal-label rank-mal-label--mal rank-mal-myranks-logo" href="${watchingMyRanksMalUrl}" target="_blank" rel="noopener" aria-label="Abrir no MyAnimeList"><img class="mal-btn-logo" style="height: 21px; width: auto;" src="assets/logos/myanimelist.webp" alt="MyAnimeList" loading="lazy" decoding="async"></a>${watchingToggleAllHtml}</div>`
              : '';
          }
          lightboxMal.innerHTML = `${watchingMyRanksHeaderHtml}<div class="rank-mal-rows">${rowsHtml}</div>`;
          return;
        }

        // No myranks, o antigo "LINKS ABOUT" some. O logo do
        // MyAnimeList fica diretamente acima das notas por temporada e
        // continua clicável, levando para a lista pessoal filtrada pelo anime.
        const myRanksMalUrl = buildMalProfileSearchUrl(item);
        // Mesmo comportamento no Global Ranking e nas demais listas.
        const toggleAllMalNamesHtml = `<button type="button" class="rank-mal-toggle-all" aria-expanded="false" aria-label="Mostrar todos os nomes das temporadas no MyAnimeList">${MAL_NAME_ARROW_SVG}</button>`;
        const myRanksMalHeaderHtml = myRanksMalUrl
          ? `<div class="rank-mal-myranks-header"><a class="rank-mal-label rank-mal-label--mal rank-mal-myranks-logo" href="${myRanksMalUrl}" target="_blank" rel="noopener" aria-label="Abrir no MyAnimeList"><img class="mal-btn-logo" style="height: 21px; width: auto;" src="assets/logos/myanimelist.webp" alt="MyAnimeList" loading="lazy" decoding="async"></a>${toggleAllMalNamesHtml}</div>`
          : '';
        lightboxMal.innerHTML = `${myRanksMalHeaderHtml}<div class="rank-mal-rows">${rowsHtml}</div>`;
      }

      function getVisibleItems() {
        return Array.from(document.querySelectorAll('.anime-item')).filter(
          it => !it.classList.contains('hidden-item') && it.offsetParent !== null
        );
      }

      function getAllPlanLightboxItems() {
        if (typeof planToWatchData === 'undefined' || !Array.isArray(planToWatchData)) return [];
        return planToWatchData.map((anime, index) => {
          const cacheKey = String(anime.id || index);
          if (randomPlanCardCache.has(cacheKey)) return randomPlanCardCache.get(cacheKey);
          const template = document.createElement('template');
          template.innerHTML = createAnimeCard(anime, 'plan', null, index).trim();
          const card = template.content.firstElementChild;
          if (card) {
            card.dataset.lightboxRank = String(index + 1);
            randomPlanCardCache.set(cacheKey, card);
          }
          return card;
        }).filter(Boolean);
      }

      function pickRandomPlanItem(excludeItem) {
        const candidates = getAllPlanLightboxItems().filter(item => item !== excludeItem);
        if (!candidates.length) return excludeItem || null;
        return candidates[Math.floor(Math.random() * candidates.length)];
      }

      function escapeHtml(str) {
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function getRankPosition(item) {
        const storedRank = Number(item && item.dataset && item.dataset.lightboxRank);
        if (Number.isFinite(storedRank) && storedRank > 0) return storedRank;
        const items = getVisibleItems();
        if (items.indexOf(item) === -1) return null;

        // Percorre os irmãos do DOM a partir do item, para trás, contando
        // quantos .anime-item visíveis existem até encontrar o .season-header
        // da divisão atual (ex: "Summer Season 2026"). Isso faz a posição
        // ser relativa à divisão, e não à lista inteira da página.
        let pos = 1;
        let sibling = item.previousElementSibling;
        while (sibling) {
          if (sibling.classList && sibling.classList.contains('season-header')) break;
          if (sibling.classList && sibling.classList.contains('anime-item') &&
              !sibling.classList.contains('hidden-item') && sibling.offsetParent !== null) {
            pos++;
          }
          sibling = sibling.previousElementSibling;
        }
        return pos;
      }

      // Acha o cabeçalho de divisão (.season-header) mais próximo que
      // precede o card na lista (ex: "Summer Season 2026", "Watched Animes").
      // Retorna TODAS as divisões/categorias às quais o anime pertence
      // (ex: "All Animes" + "Mecha/Cyberpunk"), não só a aba que está aberta.
      function getMembershipTags(animeId) {
        const tags = [];
        const allList = (typeof getFilteredData === 'function') ? getFilteredData('all') : [];
        if (allList.some(a => a.id === animeId)) {
          tags.push({ key: 'all', label: CATEGORY_LABEL.all, color: CATEGORY_HOVER_COLOR.all });
        }
        ['romance', 'isekai', 'sports', 'mecha', 'comedy'].forEach(key => {
          if (SUB_CATEGORY_SETS[key] && SUB_CATEGORY_SETS[key].has(animeId)) {
            tags.push({ key, label: CATEGORY_LABEL[key], color: CATEGORY_HOVER_COLOR[key] });
          }
        });
        // Posição do anime dentro de cada uma dessas listas (ex: #5 em Mecha/Cyberpunk).
        // "Incomplete" e "Announced Sequels" não são listas de ranking
        // (o "MyRanks"), então não fazem sentido com número de posição —
        // aparecem só com o nome, sem "#".
        const RANK_POSITION_KEYS = new Set(['all', 'romance', 'isekai', 'sports', 'mecha', 'comedy']);
        tags.forEach(t => {
          if (!RANK_POSITION_KEYS.has(t.key)) {
            t.position = null;
            return;
          }
          const list = (typeof getFilteredData === 'function') ? getFilteredData(t.key) : [];
          const idx = list.findIndex(a => a.id === animeId);
          t.position = idx === -1 ? null : idx + 1;
        });
        // Se o anime tiver um ou mais episódios na lista "Peak Episodes"
        // (favoriteEpisodesData), adiciona uma tag pra CADA um deles, com
        // a posição de cada um dentro dessa lista (ex: "#1 Peak Episodes"
        // e "#4 Peak Episodes", caso o anime tenha dois entries — usa
        // "animeId" pra ligar o episódio ao anime quando esse campo existe;
        // entries antigos sem "animeId" continuam comparando pelo próprio
        // "id", já que nesses casos id do episódio === id do anime).
        if (typeof favoriteEpisodesData !== 'undefined') {
          const favRanks = (typeof computeFavEpisodeRanks === 'function')
            ? computeFavEpisodeRanks(favoriteEpisodesData)
            : [];
          favoriteEpisodesData.forEach((entry, favIdx) => {
            const entryAnimeId = entry.animeId || entry.id;
            // Episódios com ID próprio (ex: "re-zero-2") precisam de
            // animeId para continuar vinculados ao anime no posterlightbox.
            // O fallback pelo id preserva o comportamento dos entries antigos.
            if (entryAnimeId !== animeId) return;
            const favRank = favRanks[favIdx] != null ? favRanks[favIdx] : favIdx + 1;
            tags.push({
              key: 'favEpisodes',
              label: CATEGORY_LABEL.favEpisodes,
              color: CATEGORY_HOVER_COLOR.favEpisodes,
              position: favRank,
              targetId: entry.id
            });
          });
        }
        // Além das categorias de gênero e do "Peak Episodes" (acima),
        // também confere se o anime pertence às listas "Incomplete" e
        // "Announced Sequels" — usa o próprio getFilteredData pra achar
        // a posição, então basta ver se o id aparece na lista de cada
        // uma. Fica depois do "Peak Episodes" de propósito, pra essa
        // tag aparecer antes do "Incomplete" (ex: "#10 Peak Episodes"
        // antes de "Incomplete").
        ['incomplete', 'plan', 'announced', 'watching'].forEach(key => {
          const list = (typeof getFilteredData === 'function') ? getFilteredData(key) : [];
          if (list.some(a => a.id === animeId)) {
            const label = String(CATEGORY_LABEL[key] || '').replace(/:\s*$/, '');
            tags.push({ key, label, color: CATEGORY_HOVER_COLOR[key] });
          }
        });
        // Ordem fixa das tags no poster lightbox:
        // All Animes -> rankings secundários -> Peak Episodes ->
        // Watching Now -> Plan to Watch -> Announced Sequels -> Incomplete.
        const LIGHTBOX_TAG_ORDER = {
          all: 0,
          romance: 10,
          isekai: 10,
          sports: 10,
          mecha: 10,
          comedy: 10,
          favEpisodes: 20,
          watching: 30,
          plan: 40,
          announced: 50,
          incomplete: 60
        };
        tags.sort((a, b) =>
          (LIGHTBOX_TAG_ORDER[a.key] ?? 999) - (LIGHTBOX_TAG_ORDER[b.key] ?? 999)
        );
        return tags;
      }

      function getDivisionInfo(item) {
        let el = item.previousElementSibling;
        while (el) {
          if (el.classList && el.classList.contains('season-header')) {
            const textEl = el.querySelector('.season-text');
            const text = textEl ? textEl.textContent.trim() : '';
            const color = el.style.getPropertyValue('--season-color') || null;
            return text ? { text, color } : null;
          }
          el = el.previousElementSibling;
        }
        return null;
      }

      // ── Ambient: o próprio poster (borrado via CSS) vira o wallpaper do fundo ──
      const lightboxAmbientImg = document.getElementById('posterLightboxAmbientImg');

      function updateAmbientFromPoster(src) {
        if (!lightboxAmbient || !lightboxAmbientImg) return;
        if (lightboxAmbientImg.src !== src) {
          lightboxAmbient.classList.remove('ready');
          lightboxAmbientImg.src = src;
        }
        // Só revela o wallpaper quando a imagem já carregou, evitando
        // mostrar o quadro em branco/anterior por um instante.
        if (lightboxAmbientImg.complete && lightboxAmbientImg.naturalWidth > 0) {
          lightboxAmbient.classList.add('ready');
        } else {
          lightboxAmbientImg.onload = () => lightboxAmbient.classList.add('ready');
        }
      }

      function primeLightboxVisual(item, forcedPosterSrc, forcedTitle) {
        if (!item) return null;
        const cardImg = item.querySelector('.poster-wrap img.thumb');
        if (!cardImg) return null;

        const posterSrc = forcedPosterSrc
          || cardImg.getAttribute('data-poster-src')
          || cardImg.currentSrc
          || cardImg.src
          || cardImg.getAttribute('data-src');
        const previewSrc = cardImg.currentSrc || cardImg.src || cardImg.getAttribute('data-src');
        const titleEl = item.querySelector('.title-anime');
        const title = forcedTitle != null
          ? forcedTitle
          : (titleEl ? titleEl.textContent : (cardImg.alt || ''));
        const cached = __lightboxPosterCache.get(posterSrc);
        const instantSrc = (cached && cached.loaded) || !previewSrc
          ? posterSrc
          : previewSrc;

        if (instantSrc) lightboxImg.src = instantSrc;
        lightboxImg.alt = title;
        if (lightboxTitle) lightboxTitle.textContent = title;
        return { posterSrc, instantSrc, title, cardImg };
      }

      function setLightboxPosterInstantly(item, posterSrc, title) {
        // Se o original já estiver pronto, usa-o direto. Caso contrário,
        // mostra imediatamente a thumb que já está na tela e troca pelo
        // pôster vertical assim que ele terminar, sem quadro vazio.
        const primed = primeLightboxVisual(item, posterSrc, title);
        if (!primed) return;
        updateAmbientFromPoster(primed.instantSrc || posterSrc);

        preloadLightboxPoster(posterSrc, 'high').then(loaded => {
          if (!loaded || currentItem !== item || !lightbox.classList.contains('open')) return;
          if (sequelPosterActive && currentItem === item) return;
          lightboxImg.src = posterSrc;
          updateAmbientFromPoster(posterSrc);
        });

        // Aquece também os vizinhos imediatos do carrossel. Assim as setas
        // e o swipe trocam de pôster sem aguardar rede/decodificação.
        const visibleItems = getVisibleItems();
        const index = visibleItems.indexOf(item);
        const mobileCarousel = window.matchMedia('(max-width: 760px)').matches;
        const neighborOffsets = mobileCarousel
          ? (navigator.connection?.saveData ? [] : [-1, 1])
          : [-2, -1, 1, 2];
        neighborOffsets.forEach(offset => {
          if (index < 0 || !visibleItems.length) return;
          const neighbor = visibleItems[(index + offset + visibleItems.length) % visibleItems.length];
          const neighborImg = neighbor && neighbor.querySelector('.poster-wrap img.thumb');
          const neighborSrc = neighborImg && neighborImg.getAttribute('data-poster-src');
          if (neighborSrc) preloadLightboxPoster(neighborSrc, mobileCarousel ? 'low' : (offset === -1 || offset === 1 ? 'high' : 'auto'));
          preloadBannerFor(bannerSourceForItem(neighbor), 'high');
        });
      }

      // Mesma lógica de ouro/prata/bronze usada na busca (ver
      // searchRankBadgeClass no drawer de busca) — duplicada aqui pois
      // aquela função vive numa IIFE separada e não é visível neste
      // escopo.
      function searchRankBadgeClass(rank) {
        const n = Number(rank);
        return n === 1 ? ' rank-gold' : n === 2 ? ' rank-silver' : n === 3 ? ' rank-bronze' : '';
      }

      // O banner é pedido sempre "fresco": um parâmetro único por carregamento
      // da página faz o service worker/cache do navegador tratarem a URL como
      // nova, então trocar a imagem do banner só exige um F5 (sem limpar
      // cookies/cache do site). O valor fica fixo durante a sessão da página,
      // então abrir/fechar o lightbox não rebaixa a imagem de novo.
      const BANNER_CACHE_BUST = String(Date.now());
      function bannerFreshUrl(src) {
        const url = String(src || '').trim();
        if (!url || /^(data|blob):/i.test(url)) return url;
        const hashIdx = url.indexOf('#');
        const base = hashIdx === -1 ? url : url.slice(0, hashIdx);
        const hash = hashIdx === -1 ? '' : url.slice(hashIdx);
        return base + (base.includes('?') ? '&' : '?') + 'banner-v=' + BANNER_CACHE_BUST + hash;
      }

      // ── Banner automático ──
      // Basta colocar a imagem na pasta de banners, com o MESMO nome do pôster:
      //   myranks-images/myranks-banner/<nome>.(jpg|png|webp...)
      //   watchingnow-images/watchingnow-banner/<nome>.*
      //   plantowatch-images/plantowatch-banner/<nome>.*
      // Se o item tiver "banner" no info.js, esse caminho tem prioridade.
      const BANNER_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
      const bannerResolvedCache = new Map(); // chave -> url que carregou ('' = não existe)
      let bannerRenderToken = 0;

      function bannerAutoCandidates(source) {
        if (!source || !source.img) return [];
        const path = String(source.img);
        const filename = path.split('/').pop().replace(/\.[^.]+$/, '');
        if (!filename) return [];
        let folder = 'myranks-images/myranks-banner';
        if (path.startsWith('watchingnow-images/')) folder = 'watchingnow-images/watchingnow-banner';
        else if (path.startsWith('plantowatch-images/')) folder = 'plantowatch-images/plantowatch-banner';
        return BANNER_EXTENSIONS.map(ext => `${folder}/${filename}.${ext}`);
      }

      function bannerCustomPath(source) {
        return source && source.banner ? String(source.banner) : '';
      }

      // ── Pré-carregamento dos banners ──
      // Problemas corrigidos aqui:
      //  1) As extensões eram testadas UMA POR VEZ (jpg → jpeg → png → webp…),
      //     cada tentativa errada custando uma ida e volta de rede (404). Agora
      //     todas são testadas em paralelo e a extensão que funcionou fica salva
      //     (localStorage), então nas próximas visitas não há mais tentativa.
      //  2) Os objetos Image do pré-carregamento eram descartados e o navegador
      //     mobile liberava a imagem decodificada da memória. Agora ficam
      //     retidos em "bannerImageStore" (limitado), já decodificados.
      //  3) O pré-carregamento só começava no toque. Agora roda em segundo
      //     plano (fila leve) para todos os itens e, ao abrir um pôster, os
      //     vizinhos (anterior/próximo) ganham prioridade.
      const BANNER_EXT_STORE_KEY = 'bannerResolvedExt:v1';
      let bannerExtStore = {};
      try { bannerExtStore = JSON.parse(localStorage.getItem(BANNER_EXT_STORE_KEY) || '{}') || {}; } catch (e) {}
      function persistBannerExt(key, url) {
        try {
          if (bannerExtStore[key] === url) return;
          bannerExtStore[key] = url;
          localStorage.setItem(BANNER_EXT_STORE_KEY, JSON.stringify(bannerExtStore));
        } catch (e) {}
      }

      const bannerImageStore = new Map(); // url -> { image, loaded, promise }
      const BANNER_STORE_LIMIT = 24;
      function loadBannerImage(url, priority = 'auto') {
        let entry = bannerImageStore.get(url);
        if (entry) {
          if (priority === 'high' && entry.image && 'fetchPriority' in entry.image) entry.image.fetchPriority = 'high';
          // reinsere para manter a ordem de uso recente (LRU)
          bannerImageStore.delete(url);
          bannerImageStore.set(url, entry);
          return entry.promise;
        }
        const image = new Image();
        image.decoding = 'async';
        if ('fetchPriority' in image) image.fetchPriority = priority;
        entry = { image, loaded: false, promise: null };
        entry.promise = new Promise(resolve => {
          image.onload = () => {
            entry.loaded = true;
            const done = () => resolve(true);
            if (image.decode) image.decode().then(done, done); else done();
          };
          image.onerror = () => { bannerImageStore.delete(url); resolve(false); };
        });
        bannerImageStore.set(url, entry);
        image.src = url;
        if (bannerImageStore.size > BANNER_STORE_LIMIT) {
          for (const [k, v] of bannerImageStore) {
            if (k !== url && v.loaded) bannerImageStore.delete(k);
            if (bannerImageStore.size <= BANNER_STORE_LIMIT) break;
          }
        }
        return entry.promise;
      }

      // Resolve qual candidato existe (todos em paralelo; vence a ordem de prioridade).
      const bannerResolving = new Map(); // key -> Promise<string>
      function resolveBannerUrl(cands, priority = 'auto') {
        const key = cands.join('|');
        const known = bannerResolvedCache.get(key);
        if (known !== undefined) return Promise.resolve(known);
        if (bannerResolving.has(key)) return bannerResolving.get(key);

        const saved = bannerExtStore[key];
        const p = (async () => {
          // 1) extensão já conhecida de visitas anteriores: tenta só ela
          if (saved && cands.includes(saved)) {
            const ok = await loadBannerImage(bannerFreshUrl(saved), priority);
            if (ok) { bannerResolvedCache.set(key, saved); return saved; }
          }
          // 2) descoberta em paralelo
          const results = await Promise.all(cands.map(c => loadBannerImage(bannerFreshUrl(c), priority)));
          const idx = results.findIndex(Boolean);
          if (idx === -1) { bannerResolvedCache.set(key, ''); return ''; }
          const winner = cands[idx];
          bannerResolvedCache.set(key, winner);
          persistBannerExt(key, winner);
          // libera da memória as variantes que não existiam (já falharam e foram removidas)
          return winner;
        })().finally(() => bannerResolving.delete(key));
        bannerResolving.set(key, p);
        return p;
      }

      const bannerPreloaded = new Set();
      function preloadBannerFor(source, priority = 'auto') {
        try {
          const cands = bannerCustomPath(source) ? [bannerCustomPath(source)] : bannerAutoCandidates(source);
          if (!cands.length) return;
          const key = cands.join('|');
          if (bannerResolvedCache.get(key) === '') return;
          if (bannerPreloaded.has(key) && priority !== 'high') return;
          bannerPreloaded.add(key);
          resolveBannerUrl(cands, priority);
        } catch (e) {}
      }

      // Fila em segundo plano: aquece os banners de todos os itens aos poucos,
      // sem competir com a abertura do pôster (1 por vez, em tempo ocioso).
      function warmAllBanners() {
        try {
          if (navigator.connection && navigator.connection.saveData) return;
          const all = [].concat(animeData, watchingData, planToWatchData);
          const queue = all.filter(Boolean);
          const idle = window.requestIdleCallback
            ? (fn) => window.requestIdleCallback(fn, { timeout: 2500 })
            : (fn) => setTimeout(fn, 400);
          const pump = () => {
            // Dá prioridade à rede para o que o usuário está vendo: pausa
            // enquanto a aba está oculta ou uma nota do MAL está sendo buscada.
            if (document.hidden || jikanForegroundPending > 0) { setTimeout(pump, 1500); return; }
            const batch = queue.splice(0, 1);
            if (!batch.length) return;
            const jobs = batch.map(src => {
              const cands = bannerCustomPath(src) ? [bannerCustomPath(src)] : bannerAutoCandidates(src);
              if (!cands.length) return Promise.resolve();
              const key = cands.join('|');
              if (bannerResolvedCache.get(key) !== undefined || bannerPreloaded.has(key)) return Promise.resolve();
              bannerPreloaded.add(key);
              return resolveBannerUrl(cands, 'low');
            });
            Promise.all(jobs).then(() => idle(pump), () => idle(pump));
          };
          idle(pump);
        } catch (e) {}
      }
      if (document.readyState === 'complete') setTimeout(warmAllBanners, 1200);
      else window.addEventListener('load', () => setTimeout(warmAllBanners, 1200), { once: true });

      function bannerSourceForItem(li) {
        if (!li || !li.id) return null;
        return animeData.find(a => a.id === li.id)
          || watchingData.find(a => a.id === li.id)
          || planToWatchData.find(a => a.id === li.id)
          || null;
      }

      ['pointerover', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, (e) => {
          const li = e.target && e.target.closest ? e.target.closest('li.anime-item') : null;
          const src = bannerSourceForItem(li);
          if (src) preloadBannerFor(src, 'high');
        }, { passive: true });
      });

      // ── Botão "nome em japonês" (あ) ──
      // Fica ao lado dos botões de busca/som/fechar. Ao clicar, troca o
      // título do anime pelo PRIMEIRO "malName" cadastrado (nome romanizado
      // do MyAnimeList, ex: "Code Geass: Hangyaku no Lelouch"); clicar de
      // novo volta ao título normal. Vale para todos os tipos de pôster
      // (inclusive o modo simples). Se não há malName, ou ele é igual ao
      // título, o botão nem aparece. Usa só o 1º malName (ignora separadores).
      const jpNameBtn = document.createElement('button');
      jpNameBtn.type = 'button';
      jpNameBtn.className = 'poster-lightbox-jpname';
      jpNameBtn.setAttribute('aria-pressed', 'false');
      jpNameBtn.setAttribute('aria-hidden', 'true');
      jpNameBtn.tabIndex = -1;
      (searchBtn && searchBtn.parentNode ? searchBtn.parentNode : lightbox)
        .insertBefore(jpNameBtn, searchBtn || null);

      let jpState = { id: '', title: '', jpName: '', active: false };
      // Animes que o usuário deixou em japonês (um por um, pelo id). Fica
      // só em memória: sobrevive a fechar/abrir o lightbox e a trocar de
      // anime, mas é zerado ao fechar ou recarregar o site. Ligar em um
      // anime NÃO afeta os outros.
      const jpActiveIds = new Set();

      function normalizeJpCompare(str) {
        return String(str || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      }

      function firstJpNameOf(source) {
        if (!source || !Array.isArray(source.mal)) return '';
        for (const m of source.mal) {
          if (!m || isMalDividerEntry(m)) continue;
          if (typeof m.malName === 'string' && m.malName.trim()) return m.malName.trim();
        }
        return '';
      }

      // Nome do MyAnimeList de um objeto de anime: o 1º "malName" da lista
      // "mal" ou, se não houver, um campo "malName" direto no objeto (dá pra
      // cadastrar assim em qualquer lista que não tenha o array "mal").
      function jpNameOfSource(source) {
        if (!source) return '';
        const fromMal = firstJpNameOf(source);
        if (fromMal) return fromMal;
        return (typeof source.malName === 'string' && source.malName.trim()) ? source.malName.trim() : '';
      }

      // Procura o nome em TODAS as listas, na ordem de preferência. Começa
      // pelas mesmas fontes usadas no bloco de temporadas (renderMalScores)
      // e depois tenta o mesmo id nas demais listas — assim Watching Now,
      // Plan to Watch, Announced Sequels etc. também acham o nome quando o
      // mesmo anime tem malName em outra lista.
      function jpNameFor(item) {
        if (!item || !item.id) return '';
        const id = item.id;
        const isPlan = item.hasAttribute('data-plan-to-watch');
        const isWatching = item.hasAttribute('data-watching-now');
        const titleForId = (typeof ANIME_TITLE_BY_ID !== 'undefined') ? ANIME_TITLE_BY_ID[id] : undefined;
        const inList = (list, pred) => (typeof list !== 'undefined' && Array.isArray(list)) ? list.find(pred) : null;
        const byId = a => a && a.id === id;
        const candidates = [
          isPlan ? inList(typeof planToWatchData !== 'undefined' ? planToWatchData : undefined, byId) : null,
          inList(typeof animeData !== 'undefined' ? animeData : undefined,
            a => a.id === id || (isWatching && !isPlan && titleForId && a.title === titleForId)),
          isWatching ? inList(typeof watchingData !== 'undefined' ? watchingData : undefined, byId) : null,
          inList(typeof animeData !== 'undefined' ? animeData : undefined, byId),
          inList(typeof watchingData !== 'undefined' ? watchingData : undefined, byId),
          inList(typeof planToWatchData !== 'undefined' ? planToWatchData : undefined, byId),
          inList(typeof trueCharactersData !== 'undefined' ? trueCharactersData : undefined, byId)
        ];
        for (const source of candidates) {
          const name = jpNameOfSource(source);
          if (name) return name;
        }
        return '';
      }

      // Encosta o botão à esquerda do botão mais à esquerda que estiver
      // visível (busca / randomizer / calendário / som / fechar). Calculado
      // na hora, pois as posições deles mudam conforme quais aparecem.
      function positionJpNameBtn() {
        if (!jpNameBtn.classList.contains('visible')) return;
        const toggled = [randomizerLightboxBtn, calendarBtn, soundBtn];
        let left = Infinity;
        let ref = null;
        [searchBtn, randomizerLightboxBtn, calendarBtn, soundBtn, closeBtn].forEach(b => {
          if (!b) return;
          if (toggled.includes(b) && !b.classList.contains('visible')) return;
          const cs = getComputedStyle(b);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          const r = b.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return;
          if (r.left < left) { left = r.left; ref = r; }
        });
        if (!ref) return;
        const vw = document.documentElement.clientWidth;
        jpNameBtn.style.width = ref.width + 'px';
        jpNameBtn.style.height = ref.height + 'px';
        jpNameBtn.style.top = ref.top + 'px';
        jpNameBtn.style.right = Math.round(vw - left + 6) + 'px';
      }
      function schedulePositionJpNameBtn() {
        requestAnimationFrame(() => {
          positionJpNameBtn();
          requestAnimationFrame(positionJpNameBtn);
        });
        setTimeout(positionJpNameBtn, 220);
      }
      window.addEventListener('resize', schedulePositionJpNameBtn, { passive: true });
      if (typeof MutationObserver !== 'undefined') {
        const jpObserver = new MutationObserver(schedulePositionJpNameBtn);
        [searchBtn, randomizerLightboxBtn, calendarBtn, soundBtn].forEach(b => {
          if (b) jpObserver.observe(b, { attributes: true, attributeFilter: ['class'] });
        });
      }

      // Aparência do botão conforme o modo: no normal mostra o ícone de idiomas (trocar
      // para japonês); com o nome em japonês ativo vira "EN" (trocar para
      // inglês). O tooltip usa o mesmo [data-tooltip] dos outros botões.
      // Ícone "idiomas" (traço, mesmo estilo dos botões de busca/som/fechar).
      const JP_NAME_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>';
      function setJpBtnMode(active) {
        const label = active ? 'Name in English' : 'Name in Japanese';
        jpNameBtn.innerHTML = '<span class="poster-lightbox-jpname-glyph">' + (active ? 'EN' : JP_NAME_ICON_SVG) + '</span>';
        jpNameBtn.dataset.tooltip = label;
        jpNameBtn.setAttribute('aria-label', label);
        jpNameBtn.removeAttribute('title');
        jpNameBtn.classList.toggle('is-active', active);
        jpNameBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
      setJpBtnMode(false);

      function applyJpTitle() {
        if (!lightboxTitle && !lightboxSimpleCaption) return;
        const shownTitle = jpState.active ? jpState.jpName : jpState.title;
        if (lightboxTitle) lightboxTitle.innerHTML = escapeHtml(shownTitle);
        // Modo simples (sem painel completo) mostra o nome na legenda.
        const simpleTitle = lightboxSimpleCaption && lightboxSimpleCaption.querySelector('.poster-lightbox-simple-title');
        if (simpleTitle) simpleTitle.textContent = shownTitle;
        setJpBtnMode(jpState.active);
      }

      function hideJpNameBtn() {
        jpState = { id: '', title: '', jpName: '', active: false };
        jpNameBtn.classList.remove('visible');
        setJpBtnMode(false);
        jpNameBtn.setAttribute('aria-hidden', 'true');
        jpNameBtn.tabIndex = -1;
      }

      // Chamado toda vez que o lightbox mostra um anime (já com o título
      // normal aplicado): volta sempre ao nome original e decide se o
      // botão deve aparecer.
      function updateJpNameButton(item, title) {
        hideJpNameBtn();
        // Episódios favoritos mostram o nome do episódio, não do anime.
        if (typeof currentCategory !== 'undefined' && currentCategory === 'favEpisodes') return;
        const jpName = jpNameFor(item);
        if (!jpName || normalizeJpCompare(jpName) === normalizeJpCompare(title)) return;
        jpState = { id: item.id, title, jpName, active: jpActiveIds.has(item.id) };
        if (jpState.active) applyJpTitle();
        jpNameBtn.classList.add('visible');
        jpNameBtn.setAttribute('aria-hidden', 'false');
        jpNameBtn.tabIndex = 0;
        schedulePositionJpNameBtn();
      }

      jpNameBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!jpState.jpName) return;
        jpState.active = !jpState.active;
        if (jpState.active) jpActiveIds.add(jpState.id); else jpActiveIds.delete(jpState.id);
        applyJpTitle();
      });

      function hideLightboxBanner() {
        lightbox.classList.remove('has-banner');
        lightboxBanner.classList.remove('ready');
        lightboxBannerImg.onload = null;
        lightboxBannerImg.onerror = null;
        lightboxBannerImg.removeAttribute('src');
        if (lightboxBannerImgBlur) lightboxBannerImgBlur.removeAttribute('src');
      }

      function applyLightboxBanner(source) {
        if (!lightboxBanner || !lightboxBannerImg) return;
        const token = ++bannerRenderToken;
        const candidates = bannerCustomPath(source)
          ? [bannerCustomPath(source)]
          : bannerAutoCandidates(source);
        const cacheKey = candidates.join('|');
        if (!candidates.length || bannerResolvedCache.get(cacheKey) === '') {
          hideLightboxBanner();
          return;
        }
        lightboxBannerImg.style.objectPosition = (source && source.bannerPosition) || '';
        lightboxBannerImg.style.transformOrigin = '';
        lightboxBannerImg.style.setProperty('--banner-shift-x', '');
        if (lightboxBannerImgBlur) lightboxBannerImgBlur.style.objectPosition = lightboxBannerImg.style.objectPosition;

        const show = (next) => {
          if (token !== bannerRenderToken) return;
          if (!next) { hideLightboxBanner(); return; }
          const url = bannerFreshUrl(next);
          const reveal = () => {
            if (token !== bannerRenderToken) return;
            if (lightboxBannerImgBlur && lightboxBannerImgBlur.getAttribute('src') !== url) lightboxBannerImgBlur.src = url;
            lightbox.classList.add('has-banner');
            lightboxBanner.classList.add('ready');
          };
          lightboxBannerImg.onerror = () => {
            if (token !== bannerRenderToken) return;
            bannerResolvedCache.set(cacheKey, '');
            hideLightboxBanner();
          };
          // Já exibindo essa mesma imagem: só garante a visibilidade.
          if (lightboxBannerImg.getAttribute('src') === url
              && lightboxBannerImg.complete && lightboxBannerImg.naturalWidth > 0) {
            reveal();
            return;
          }
          lightbox.classList.remove('has-banner');
          lightboxBanner.classList.remove('ready');
          lightboxBannerImg.onload = reveal;
          lightboxBannerImg.src = url;
          // Imagem em memória (pré-carregada e decodificada): mostra na hora.
          if (lightboxBannerImg.complete && lightboxBannerImg.naturalWidth > 0) reveal();
        };

        // Caminho rápido: URL já resolvida e imagem já em memória → síncrono.
        const known = bannerResolvedCache.get(cacheKey);
        if (known) { show(known); return; }

        // Caminho lento (primeira vez): resolve todas as extensões em paralelo
        // com prioridade alta, em vez de tentar uma por vez.
        lightbox.classList.remove('has-banner');
        lightboxBanner.classList.remove('ready');
        resolveBannerUrl(candidates, 'high').then(show);
      }

      function showItem(item) {
        if (!item) return;
        const posterWrap = item.querySelector('.poster-wrap');
        const img = posterWrap ? posterWrap.querySelector('.thumb') : null;
        if (!img) return;
        // No All Ranks desktop, o card pode estar usando um blob reduzido
        // para ficar tão leve quanto o Plan to Watch. O lightbox sempre
        // abre o data-src original, mantendo resolução e identificação
        // do MyRanks intactas.
        const cardSrc = img.currentSrc || img.src || img.getAttribute('data-src');
        // O card mobile usa a imagem horizontal "-search", mas o
        // posterlightbox precisa continuar usando o pôster original.
        // Separar as duas fontes também preserva a detecção de MyRanks,
        // responsável pelo painel completo (studio/ano/notas).
        const src = img.getAttribute('data-poster-src') || cardSrc;
        if (!src) return;

        sequelPosterToggleToken++;
        sequelPosterActive = false;
        sequelPosterDefaultSrc = src;
        const sequelAnimeSource = animeData.find(a => a.id === item.id)
          || watchingData.find(a => a.id === item.id)
          || planToWatchData.find(a => a.id === item.id);
        const sequelInfo = nextSeasonMap[item.id];
        // Banner: automático pela pasta (ou manual via "banner" no info.js)
        applyLightboxBanner(sequelAnimeSource);
        sequelPosterAltSrc = sequelInfo && sequelAnimeSource && sequelAnimeSource.img
          ? sequelsThumbSrc(sequelAnimeSource.img)
          : '';
        if (lightboxAnnounce) {
          const canToggleSequelPoster = Boolean(sequelInfo && sequelInfo.info && sequelPosterAltSrc);
          lightboxAnnounce.classList.toggle('is-sequel-toggle', canToggleSequelPoster);
          lightboxAnnounce.classList.remove('is-sequel-active');
          if (canToggleSequelPoster) {
            lightboxAnnounce.setAttribute('role', 'button');
            lightboxAnnounce.setAttribute('tabindex', '0');
            lightboxAnnounce.setAttribute('aria-pressed', 'false');
            lightboxAnnounce.setAttribute('aria-label', 'Alternar para a imagem da temporada anunciada');
          } else {
            lightboxAnnounce.removeAttribute('role');
            lightboxAnnounce.removeAttribute('tabindex');
            lightboxAnnounce.removeAttribute('aria-pressed');
            lightboxAnnounce.removeAttribute('aria-label');
          }
        }

        const titleEl = item.querySelector('.title-anime');
        const title = titleEl ? titleEl.textContent : (img.alt || '');
        const rankPos = getRankPosition(item);

        if (title) setPageTitle(`${DEFAULT_PAGE_TITLE} - ${title}`);

        // Modo simples: animes que NÃO usam myranks nem watchingnow/plan-
        // to-watch (ex: announced-unwatched, bestepisodes) mostram só a
        // imagem ampliada, com a categoria acima e a posição/nome abaixo.
        // Watching Now e Plan to Watch usam o painel completo (igual ao
        // myranks), com os botões de Anime-Planet/Crunchyroll/MAL no
        // lugar do bloco de notas do MyAnimeList (ver renderMalScores).
        const isWatchingNow = item.hasAttribute('data-watching-now');
        // Plan to Watch usa o mesmo painel completo do Watching Now (em
        // vez do modo simples, só com a imagem ampliada) — mostra os
        // botões de Anime-Planet/Crunchyroll/MAL e os campos de meta,
        // igual ao Watching Now (ver renderMeta/renderMalScores abaixo).
        const isPlanToWatch = item.hasAttribute('data-plan-to-watch');
        // "Unwatched or in Progress" (dentro de Announced Sequels) também
        // usa o painel completo (Studio/Lançamento + notas do MAL por
        // temporada), em vez do modo simples antigo (só pôster + tag de
        // anúncio) — ver atributo "data-rich-panel" no createAnimeCard.
        const isAnnouncedRichPanel = item.hasAttribute('data-rich-panel');
        const isRichPanel = isWatchingNow || isPlanToWatch || isAnnouncedRichPanel;
        // Aceita tanto a pasta original (myranks-images/myranks/) quanto
        // a pasta "-sequels" usada pelos cards "watched" de Announced
        // Sequels (ver sequelsThumbSrc), senão esses itens caíam no
        // modo simples por engano (perdendo Studio/Ano/notas do MAL).
        const isMyRanks = /myranks-images\/myranks(?:-sequels)?\//.test(src) && !isRichPanel;
        const animePlanetUrl = item.getAttribute('data-anime-planet-url')
          || item.getAttribute('data-watchnow-anime-planet-url');
        const crunchyrollUrl = item.getAttribute('data-crunchyroll-url');
        const netflixUrl = item.getAttribute('data-netflix-url');
        const watchNowMalUrl = item.getAttribute('data-watchnow-mal-url');
        lightbox.classList.toggle('simple-mode', !(isMyRanks || isRichPanel));
        lightbox.classList.toggle('watching-now-mode', isWatchingNow);
        lightbox.classList.toggle('plan-to-watch-mode', isPlanToWatch);
        lightbox.classList.toggle('announced-mode', currentCategory === 'announced');
        lightbox.classList.remove('plan-to-watch-carousel');

        const lightboxDivision = getDivisionInfo(item);
        const lightboxAccent = (lightboxDivision && lightboxDivision.color)
          || CATEGORY_HOVER_COLOR[currentCategory]
          || '#cbd5e1';
        lightbox.style.setProperty('--lb-accent', lightboxAccent);
        lightbox.style.setProperty('--lb-category', CATEGORY_HOVER_COLOR[currentCategory] || lightboxAccent);
        lightbox.style.setProperty('--lb-poster', `url("${String(src).replace(/"/g, '\\"')}")`);
        if (lightboxHeroRank) {
          // Watching Now / Plan to Watch / Incomplete / Announced usam apenas
          // a posição (01, 02, 03...), igual aos cards: sem # e sem Top 3 colorido.
          const plainNumberRank = ['watching', 'plan', 'incomplete', 'announced'].includes(currentCategory);
          lightboxHeroRank.className = `poster-lightbox-hero-rank${plainNumberRank ? '' : searchRankBadgeClass(rankPos)}`;
          lightboxHeroRank.innerHTML = rankPos != null
            ? `${plainNumberRank ? '' : '<span class="poster-lightbox-hero-rank-hash">#</span>'}<span>${String(rankPos).padStart(2, '0')}</span>`
            : `<span class="poster-lightbox-hero-rank-label">${escapeHtml(CATEGORY_LABEL[currentCategory] || 'ANIME')}</span>`;
        }

        if (lightboxSimpleLink) {
          lightboxSimpleLink.innerHTML = '';
        }

        if (lightboxSimpleCategory || lightboxMediaCategory) {
          const baseLabel = CATEGORY_LABEL[currentCategory] || '';
          const division = getDivisionInfo(item);
          const categoryHtml = division
            ? `${escapeHtml(baseLabel)} <span class="simple-category-division" style="color:${division.color || 'var(--text)'}">${escapeHtml(division.text)}</span>`
            : escapeHtml(baseLabel);
          if (lightboxSimpleCategory) lightboxSimpleCategory.innerHTML = categoryHtml;
          if (lightboxMediaCategory) lightboxMediaCategory.innerHTML = '';
        }
        if (lightboxSimpleCaption) {
          const plainNumberRank = ['watching', 'plan', 'incomplete', 'announced'].includes(currentCategory);
          lightboxSimpleCaption.innerHTML =
            (rankPos != null ? `<span class="poster-lightbox-rank">${plainNumberRank ? '' : '#'}${String(rankPos).padStart(2, '0')}</span>` : '') +
            `<span class="poster-lightbox-simple-title">${escapeHtml(title)}</span>`;
        }

        // O botão de volume só existe visualmente nos pôsteres que têm
        // efeito sonoro. O estado mudo, porém, é compartilhado por todos.
        if (randomizerLightboxBtn) {
          const showRandomizerButton = !!randomPlanNavigationLocked;
          randomizerLightboxBtn.classList.toggle('visible', showRandomizerButton);
          randomizerLightboxBtn.setAttribute('aria-hidden', showRandomizerButton ? 'false' : 'true');
          randomizerLightboxBtn.tabIndex = showRandomizerButton ? 0 : -1;
        }

        if (soundBtn) {
          const hasSoundEffect = itemHasPosterSound(item);
          soundBtn.classList.toggle('visible', hasSoundEffect);
          soundBtn.setAttribute('aria-hidden', hasSoundEffect ? 'false' : 'true');
          soundBtn.tabIndex = hasSoundEffect ? 0 : -1;
          updatePosterSoundButton();
        }

        const wasRezero = currentItem && REZERO_IDS.includes(currentItem.id);
        const isRezero = REZERO_IDS.includes(item.id);
        if (wasRezero && currentItem !== item) {
          // Trocando pra outro item com o mesmo som (ex: re-zero -> re-zero-4):
          // reinicia na hora, igual sempre foi. Trocando pra um item SEM
          // esse som: fade-out suave, igual ao que já acontecia ao fechar
          // o lightbox.
          isRezero ? stopAudioInstantly(rezeroSound) : fadeOutAudio(rezeroSound);
        }
        if (isRezero && currentItem !== item) {
          try {
            rezeroSound.play().catch(() => {});
          } catch (e) {}
        }

        const wasJjk = currentItem && JJK_IDS.includes(currentItem.id);
        const isJjk = JJK_IDS.includes(item.id);
        if (wasJjk && currentItem !== item) {
          isJjk ? stopAudioInstantly(jjkSound) : fadeOutAudio(jjkSound);
        }
        if (isJjk && currentItem !== item) {
          try {
            jjkSound.currentTime = 0;
            jjkSound.play().catch(() => {});
          } catch (e) {}
        }

        const wasAot = currentItem && AOT_IDS.includes(currentItem.id);
        const isAot = AOT_IDS.includes(item.id);
        if (wasAot && currentItem !== item) {
          isAot ? stopAudioInstantly(aotSound) : fadeOutAudio(aotSound);
        }
        if (isAot && currentItem !== item) {
          try {
            aotSound.currentTime = 0;
            aotSound.play().catch(() => {});
          } catch (e) {}
        }

        const wasOnePiece = currentItem && ONE_PIECE_IDS.includes(currentItem.id);
        const isOnePiece = ONE_PIECE_IDS.includes(item.id);
        if (wasOnePiece && currentItem !== item) {
          isOnePiece ? stopAudioInstantly(onePieceSound) : fadeOutAudio(onePieceSound);
        }
        if (isOnePiece && currentItem !== item) {
          try {
            onePieceSound.currentTime = 0;
            onePieceSound.play().catch(() => {});
          } catch (e) {}
        }

        currentItem = item;

        // Mostra o atalho do calendário somente para animes que fazem
        // parte do release calendar. O ID real do anime fica salvo no
        // próprio botão para o clique conseguir localizar calendar-<id>.
        if (calendarBtn) {
          const animeId = item.getAttribute('data-calendar-target') || item.id || '';
          const calendarItems = (typeof rawReleaseCalendarData !== 'undefined' && Array.isArray(rawReleaseCalendarData))
            ? rawReleaseCalendarData
            : [];
          const isInCalendar = !!animeId && calendarItems.some(calendarItem =>
            calendarItem && calendarItem.releaseDay && calendarItem.id === animeId
          );

          calendarBtn.classList.toggle('visible', isInCalendar);
          calendarBtn.dataset.animeId = isInCalendar ? animeId : '';
          calendarBtn.setAttribute('aria-hidden', isInCalendar ? 'false' : 'true');
          calendarBtn.tabIndex = isInCalendar ? 0 : -1;
        }

        setLightboxPosterInstantly(item, src, title);
        if (lightboxTitle) {
          lightboxTitle.innerHTML = escapeHtml(title);
        }
        updateJpNameButton(item, title);
        if (lightboxList) {
          const division = getDivisionInfo(item);
          const tags = getMembershipTags(item.id);
          const accentColor = (division && division.color) || (tags[0] && tags[0].color) || null;
          lightboxList.style.setProperty('--list-color', accentColor || 'var(--glow-accent)');

          // No card de "Announced Sequels", a subdivisão "Watched Animes" é
          // redundante (o próprio contexto já indica isso) e não deve
          // aparecer como tag verde no modal — some só ela, mantendo as
          // demais divisões (ex: "Summer Season 2026") normalmente.
          const hideDivision = division && division.text === ANNOUNCED_GROUP_LABELS.watched.text;
          // Quando a subdivisão é "Watching Now" (dentro de Announced
          // Sequels), o anime em questão já está sendo assistido (existe
          // uma entrada correspondente em "Watching Now") — nesse caso, em
          // vez do texto genérico e sem clique, funde a tag "Watching
          // Now" com a divisão de temporada dele lá na Watching Now
          // (ex: "Non-Seasonal Anime", "Summer Season 2026") num único
          // botão "Watching Now: <divisão>" (cada metade com sua cor),
          // que leva direto pro card correspondente.
          const isUnwatchedDivision = division && (division.text === ANNOUNCED_GROUP_LABELS.watching.text || division.text === ANNOUNCED_GROUP_LABELS.planning.text);

          // Se o mesmo ID também existe em Watching Now, a tag "Watching Now"
          // sempre carrega junto a temporada real dessa entrada, inclusive
          // quando o lightbox foi aberto pelo MyRanks. Assim, em vez de só
          // "WATCHING NOW", aparece por exemplo
          // "WATCHING NOW: SUMMER SEASON 2026", com o mesmo visual usado
          // no próprio poster lightbox do Watching Now.
          const watchingTag = tags.find(t => t.key === 'watching');
          let watchingEntry = watchingTag
            ? watchingData.find(a => a.id === item.id)
            : null;

          // Mantém o fallback por título no caso especial de Announced
          // Sequels, onde entradas antigas podem não compartilhar o ID.
          if (!watchingEntry && isUnwatchedDivision) {
            watchingEntry = watchingData.find(a => a.id === item.id)
              || watchingData.find(a => a.title === title);
          }

          let mergedWatchingTagHtml = '';
          let effectiveTags = tags;
          if (watchingEntry) {
            effectiveTags = tags.filter(t => t.key !== 'watching');
            const seasonKey = watchingEntry.season || null;
            const seasonLabel = seasonKey
              ? (WATCHING_SEASON_LABELS[seasonKey] || { text: seasonKey, color: 'var(--muted)' })
              : WATCHING_NO_SEASON_LABEL;
            const watchingColor = (watchingTag && watchingTag.color) || CATEGORY_HOVER_COLOR.watching || 'var(--glow-accent)';
            const seasonColor = seasonLabel.color || 'var(--glow-accent)';
            const mobileWatchingLabel = !seasonKey || String(seasonLabel.text).trim().toLowerCase() === 'non-seasonal anime'
              ? 'Watching Now'
              : seasonLabel.text;
            mergedWatchingTagHtml = `<button type="button" class="list-tag list-tag-split" data-mode="watching" data-target-id="${escapeHtml(watchingEntry.id)}" data-mobile-label="${escapeHtml(mobileWatchingLabel)}" style="--tag-color:${watchingColor};--tag-color-2:${seasonColor}"><span class="list-tag-part">Watching Now:</span><span class="list-tag-part">${escapeHtml(seasonLabel.text)}</span></button>`;
          } else if (watchingTag && division && !hideDivision) {
            // Fallback para o card aberto diretamente em Watching Now caso
            // a entrada não seja encontrada no array por algum motivo.
            effectiveTags = tags.filter(t => t.key !== 'watching');
            const watchingColor = watchingTag.color || CATEGORY_HOVER_COLOR.watching || 'var(--glow-accent)';
            const seasonColor = division.color || 'var(--glow-accent)';
            const divisionText = String(division.text || '').trim();
            const mobileWatchingLabel = divisionText.toLowerCase() === 'non-seasonal anime'
              ? 'Watching Now'
              : divisionText;
            mergedWatchingTagHtml = `<button type="button" class="list-tag list-tag-split" data-mode="watching" data-target-id="${escapeHtml(item.id)}" data-mobile-label="${escapeHtml(mobileWatchingLabel)}" style="--tag-color:${watchingColor};--tag-color-2:${seasonColor}"><span class="list-tag-part">Watching Now:</span><span class="list-tag-part">${escapeHtml(division.text)}</span></button>`;
          }

          const tagToHtml = t => `<button type="button" class="list-tag" data-mode="${t.key}" data-target-id="${escapeHtml(t.targetId || item.id)}" style="--tag-color:${t.color || 'var(--glow-accent)'}"><span class="list-tag-content">${t.position != null ? `<span class="list-tag-rank${t.key === 'all' ? ' list-tag-rank--all' : ''}">#${t.position}</span>` : ''}<span class="list-tag-name">${escapeHtml(t.label)}</span></span></button>`;

          // Peak Episodes: quando o mesmo anime tem dois (ou mais)
          // episódios favoritos, eles viram UMA única pill visual, com
          // largura equivalente à soma das pills que existiriam separadas.
          // Cada metade continua sendo um botão independente, preservando
          // o clique que leva exatamente ao episódio correspondente.
          const renderTagSequence = (tagList) => {
            const parts = [];
            let i = 0;
            while (i < tagList.length) {
              const tag = tagList[i];
              if (tag.key === 'favEpisodes') {
                const group = [];
                while (i < tagList.length && tagList[i].key === 'favEpisodes') {
                  group.push(tagList[i]);
                  i += 1;
                }
                if (group.length > 1) {
                  const count = group.length;
                  parts.push(
                    `<span class="list-tag list-tag-combined list-tag-combined--fav-episodes" style="--fav-count:${count};--tag-color:${group[0].color || 'var(--glow-accent)'}">` +
                    group.map(tagToHtml).join('') +
                    `</span>`
                  );
                } else {
                  parts.push(tagToHtml(group[0]));
                }
                continue;
              }
              parts.push(tagToHtml(tag));
              i += 1;
            }
            return parts.join('<span class="list-sep"></span>');
          };

          // O Watching Now mesclado com a temporada precisa respeitar a mesma
          // hierarquia das outras tags, em vez de ser forçado para o início.
          // Esta tabela fica local a este bloco porque LIGHTBOX_TAG_ORDER,
          // usado na coleta das tags, pertence ao escopo daquela função.
          const renderedLightboxTagOrder = {
            all: 0,
            romance: 10,
            isekai: 10,
            sports: 10,
            mecha: 10,
            comedy: 10,
            favEpisodes: 20,
            watching: 30,
            plan: 40,
            announced: 50,
            incomplete: 60
          };
          const watchingOrder = renderedLightboxTagOrder.watching;
          const beforeWatching = effectiveTags.filter(t =>
            (renderedLightboxTagOrder[t.key] ?? 999) < watchingOrder
          );
          const afterWatching = effectiveTags.filter(t =>
            (renderedLightboxTagOrder[t.key] ?? 999) >= watchingOrder
          );
          const orderedTagParts = [
            renderTagSequence(beforeWatching),
            ...(mergedWatchingTagHtml ? [mergedWatchingTagHtml] : []),
            renderTagSequence(afterWatching)
          ].filter(Boolean);
          const tagsHtml = orderedTagParts.join('<span class="list-sep"></span>');

          const divisionHtml = (division && !hideDivision && !isUnwatchedDivision && !watchingEntry && !mergedWatchingTagHtml)
            ? `<span class="list-sep"></span><span class="list-division"><span class="list-tag-name">${escapeHtml(division.text)}</span></span>`
            : '';

          lightboxList.classList.remove('no-division');
          // A lista fica duplicada (2 cópias idênticas lado a lado) pra
          // viabilizar o carrossel infinito só no mobile (ver CSS
          // ".poster-lightbox-list-track"): a animação anda exatamente
          // metade da largura (a largura de UMA cópia) e reinicia sem
          // deixar costura visível. No desktop a 2ª cópia (aria-hidden)
          // fica escondida via CSS e tudo continua igual a antes.
          // Plan to Watch: 1 tag = estática centralizada; 2+ tags = carrossel.
          const planToWatchTagCount = (mergedWatchingTagHtml ? 1 : 0) + effectiveTags.length;
          lightbox.classList.toggle('plan-to-watch-carousel', isPlanToWatch && planToWatchTagCount > 1);

          const listContent = tagsHtml + divisionHtml;
          lightboxList.innerHTML = listContent
            ? `<div class="poster-lightbox-list-track"><div class="poster-lightbox-list-group">${listContent}</div><div class="poster-lightbox-list-group" aria-hidden="true">${listContent}</div></div>`
            : '';

          // Mobile: quando existem exatamente 3 tags de ranking,
          // "All Animes" fica sempre sozinha em cima e as outras duas
          // dividem a linha inferior. A classe só ganha efeito dentro
          // do media query mobile, então o desktop permanece intacto.
          lightboxList.classList.remove('has-three-ranking-tags');
          lightboxList.querySelectorAll('.list-tag-mobile-wide').forEach(tag => {
            tag.classList.remove('list-tag-mobile-wide');
          });

          const primaryTagGroup = lightboxList.querySelector('.poster-lightbox-list-group:not([aria-hidden="true"])');
          const primaryRankingTags = primaryTagGroup
            ? Array.from(primaryTagGroup.querySelectorAll(':scope > .list-tag'))
            : [];

          if (primaryRankingTags.length === 3) {
            const allAnimesTagIndex = primaryRankingTags.findIndex(tag => tag.dataset.mode === 'all');

            if (allAnimesTagIndex !== -1) {
              lightboxList.classList.add('has-three-ranking-tags');
              lightboxList.querySelectorAll('.poster-lightbox-list-group').forEach(group => {
                const groupTags = Array.from(group.querySelectorAll(':scope > .list-tag'));
                if (groupTags[allAnimesTagIndex]) {
                  groupTags[allAnimesTagIndex].classList.add('list-tag-mobile-wide');
                }
              });
            }
          }
        }
        if (lightboxCharacters) {
          lightboxCharacters.innerHTML = '';
          if (typeof trueCharactersData !== 'undefined') {
            const sourceAnime = animeData.find(anime => anime.id === item.id)
              || animeData.find(anime => normalizeAnimeLookupTitle(anime.title) === normalizeAnimeLookupTitle(title));
            const related = trueCharactersData
              .map((character, index) => ({ character, position: index + 1 }))
              .filter(({ character }) => {
                const origin = findAllAnimeForCharacter(character.info);
                return origin && sourceAnime && origin.id === sourceAnime.id;
              });
            if (related.length) {
              lightboxCharacters.innerHTML = '<button type="button" class="poster-lightbox-characters-label" aria-label="Abrir lista True Characters">TRUE CHARACTERS</button>'
                + '<div class="poster-lightbox-characters-grid">'
                + related.map(({ character, position }) =>
                  `<button type="button" class="poster-lightbox-character-link${position === 1 ? ' rank-gold' : position === 2 ? ' rank-silver' : position === 3 ? ' rank-bronze' : ''}" data-character-id="${escapeHtml(character.id)}" aria-label="Ver ${escapeHtml(character.title)} em True Characters"><img class="poster-lightbox-character-img" src="${escapeHtml(character.img || '')}" alt="" loading="lazy" decoding="async"><span class="poster-lightbox-character-text"><span class="poster-lightbox-character-name">${escapeHtml(character.title)}</span></span><span class="poster-lightbox-character-rank" aria-hidden="true">#${String(position).padStart(2, '0')}</span></button>`
                ).join('') + '</div>';
            }
          }
        }
        if (lightboxAnnounce) {
          const ns = sequelInfo;
          if (ns && ns.info) {
            const lines = String(ns.info).split(/<\/br>|<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);
            lightboxAnnounce.innerHTML = `<span class="announce-line">${escapeHtml(lines.join('  •  '))}</span>`;
          } else {
            lightboxAnnounce.innerHTML = '';
          }
        }

        if (lightboxInfo) {
          const source = animeData.find(a => a.id === item.id)
            || watchingData.find(a => a.id === item.id)
            || planToWatchData.find(a => a.id === item.id);
          if (source && source.info) {
            const cleanedInfo = String(source.info)
              .replace(/[-–:]?\s*Progress:\s*(?:\d+|-)\s*\/\s*(?:\d+|-)\s*/gi, '')
              .trim();
            const infoLines = cleanedInfo.split(/<\/br>|<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);
            lightboxInfo.innerHTML = infoLines.map((line, index) => {
              if (index === 0) return line;
              const isMovieLine = /(?:^|\s)(?:\d+\s+)?Filmes?\b/i.test(line);
              const keepOnDesktopLine = isMovieLine && window.matchMedia('(min-width: 761px)').matches;
              return keepOnDesktopLine
                ? ` - ${line}`
                : `<span class="poster-lightbox-info-break"></span>${line}`;
            }).join('');
          } else {
            lightboxInfo.innerHTML = '';
          }
        }

        renderMeta(item.id, isRichPanel, watchNowMalUrl, isWatchingNow || isPlanToWatch);
        renderMalScores(item.id, isRichPanel, animePlanetUrl, crunchyrollUrl, watchNowMalUrl, netflixUrl, isPlanToWatch);
      }

      // ── Troca de item dentro do lightbox: 100% instantâneo ──
      // O conteúdo muda no mesmo frame do input, sem nenhuma
      // animação/fade por cima. Zero delay.
      function swapItem(nextItem) {
        closeImageZoom();
        // A troca precisa acontecer no próprio evento do clique/toque.
        // Esperar frames aqui deixava o lightbox aparentemente travado,
        // principalmente no mobile, quando o usuário passava rápido
        // pelas setas ou pelo swipe.
        pendingItem = null;
        ++lightboxRenderToken;
        showItem(nextItem);
        if (lightboxFigure) lightboxFigure.scrollTop = 0;
        requestAnimationFrame(updateLightboxScrollIndicator);
      }

      function navigate(step) {
        if (randomPlanNavigationLocked) return;
        if (randomPlanNavigation) {
          if (step < 0 && randomPlanHistoryIndex > 0) {
            randomPlanHistoryIndex--;
            swapItem(randomPlanHistory[randomPlanHistoryIndex]);
            return;
          }
          if (step > 0 && randomPlanHistoryIndex < randomPlanHistory.length - 1) {
            randomPlanHistoryIndex++;
            swapItem(randomPlanHistory[randomPlanHistoryIndex]);
            return;
          }
          const nextRandomItem = pickRandomPlanItem(pendingItem || currentItem);
          if (nextRandomItem) {
            randomPlanHistory = randomPlanHistory.slice(0, randomPlanHistoryIndex + 1);
            randomPlanHistory.push(nextRandomItem);
            randomPlanHistoryIndex++;
          }
          if (nextRandomItem) swapItem(nextRandomItem);
          return;
        }
        const items = getVisibleItems();
        const activeItem = pendingItem || currentItem;
        if (!items.length || !activeItem) return;
        const idx = items.indexOf(activeItem);
        if (idx === -1) return;
        const nextIdx = (idx + step + items.length) % items.length;
        swapItem(items[nextIdx]);
      }

      const DEFAULT_PAGE_TITLE = document.title;

      // ── Carrossel (marquee) no título da aba ──
      // Quando o nome do anime + prefixo passa do tamanho definido, o
      // título rola uma vez da esquerda pra direita (revelando o texto
      // até o fim) e depois para, voltando a ficar parado no começo.
      const TITLE_MARQUEE_MAX_LEN = 24;
      const TITLE_MARQUEE_GAP = '        '; // espaço em branco no fim, antes de parar
      const TITLE_MARQUEE_SPEED_MS = 350;
      let titleMarqueeInterval = null;

      function stopTitleMarquee() {
        if (titleMarqueeInterval) {
          clearInterval(titleMarqueeInterval);
          titleMarqueeInterval = null;
        }
      }

      function setPageTitle(fullTitle) {
        stopTitleMarquee();
        if (!fullTitle || fullTitle.length <= TITLE_MARQUEE_MAX_LEN) {
          document.title = fullTitle || DEFAULT_PAGE_TITLE;
          return;
        }
        const scrollText = fullTitle + TITLE_MARQUEE_GAP;
        const maxPos = scrollText.length - TITLE_MARQUEE_MAX_LEN;
        let pos = 0;
        document.title = scrollText.slice(0, TITLE_MARQUEE_MAX_LEN);
        titleMarqueeInterval = setInterval(() => {
          pos++;
          if (pos > maxPos) {
            stopTitleMarquee();
            document.title = fullTitle.slice(0, TITLE_MARQUEE_MAX_LEN);
            return;
          }
          document.title = scrollText.slice(pos, pos + TITLE_MARQUEE_MAX_LEN);
        }, TITLE_MARQUEE_SPEED_MS);
      }

      function openLightbox(item, options = {}) {
        // Renderiza a imagem e os dados antes de abrir a camada, evitando
        // qualquer quadro vazio ou atraso perceptível na abertura.
        randomPlanNavigation = options.randomPlan === true;
        randomPlanNavigationLocked = options.randomPlan === true;
        if (randomizerLightboxBtn && !randomPlanNavigationLocked) {
          randomizerLightboxBtn.classList.remove('visible');
          randomizerLightboxBtn.setAttribute('aria-hidden', 'true');
          randomizerLightboxBtn.tabIndex = -1;
        }
        if (!randomPlanNavigation) {
          randomPlanHistory = [];
          randomPlanHistoryIndex = -1;
        }
        showItem(item);
        lightbox.classList.remove('mobile-pull-dragging', 'mobile-pull-rebounding', 'mobile-pull-closing', 'mobile-pull-closing-active');
        lightbox.style.removeProperty('--lb-pull-y');
        lightbox.style.removeProperty('--lb-pull-opacity');
        lightbox.classList.add('open');
        lightbox.setAttribute('aria-hidden', 'false');
        if (lightboxFigure) lightboxFigure.scrollTop = 0;
        requestAnimationFrame(updateLightboxScrollIndicator);
        lockBodyScroll();
        lastFocused = document.activeElement;
        closeBtn.focus();
      }

      // API interna usada por contextos que representam um anime fora da
      // lista principal, como True Characters.
      window.__openPosterLightboxForAnime = openLightbox;

      // Reaplica o título padrão da aba. Usado depois do history.go() interno
      // da camada "voltar": o navegador restaura o título gravado na entrada
      // antiga do histórico ("myhtml - anime"), então precisamos sobrescrever.
      window.__resetPageTitleIfClosed = function() {
        if (lightbox.classList.contains('open')) return;
        stopTitleMarquee();
        document.title = DEFAULT_PAGE_TITLE + '​';
        document.title = DEFAULT_PAGE_TITLE;
      };

      function closeLightbox(skipScrollRestore) {
        lightboxRenderToken++;
        pendingItem = null;
        sequelPosterToggleToken++;
        sequelPosterActive = false;
        sequelPosterDefaultSrc = '';
        sequelPosterAltSrc = '';
        lightboxAnnounce?.classList.remove('is-sequel-toggle', 'is-sequel-active');
        lightboxAnnounce?.removeAttribute('aria-pressed');
        if (currentItem && REZERO_IDS.includes(currentItem.id)) {
          fadeOutAudio(rezeroSound);
        }
        if (currentItem && JJK_IDS.includes(currentItem.id)) {
          fadeOutAudio(jjkSound);
        }
        if (currentItem && AOT_IDS.includes(currentItem.id)) {
          fadeOutAudio(aotSound);
        }
        if (currentItem && ONE_PIECE_IDS.includes(currentItem.id)) {
          fadeOutAudio(onePieceSound);
        }
        stopTitleMarquee();
        document.title = DEFAULT_PAGE_TITLE;
        closeImageZoom();
        // Reseta a seta do "watch now" pra próxima vez que o lightbox for
        // aberto começar sempre fechada (o estado só deve "sobreviver"
        // enquanto o usuário navega de pôster em pôster dentro da MESMA
        // sessão do lightbox).
        watchNowExtraOpen = false;
        randomPlanNavigation = false;
        randomPlanNavigationLocked = false;
        randomPlanHistory = [];
        randomPlanHistoryIndex = -1;
        lightbox.classList.remove('mobile-pull-dragging', 'mobile-pull-rebounding', 'mobile-pull-closing', 'mobile-pull-closing-active');
        lightbox.style.removeProperty('--lb-pull-y');
        lightbox.style.removeProperty('--lb-pull-opacity');
        lightbox.classList.remove('open');
        lightbox.setAttribute('aria-hidden', 'true');
        lightboxScrollIndicator?.classList.remove('visible', 'at-bottom');
        hideJpNameBtn();
        if (randomizerLightboxBtn) {
          randomizerLightboxBtn.classList.remove('visible');
          randomizerLightboxBtn.setAttribute('aria-hidden', 'true');
          randomizerLightboxBtn.tabIndex = -1;
        }
        if (soundBtn) {
          soundBtn.classList.remove('visible');
          soundBtn.setAttribute('aria-hidden', 'true');
          soundBtn.tabIndex = -1;
        }
        unlockBodyScroll(skipScrollRestore);
        setTimeout(() => {
          lightboxImg.src = '';
          if (lightboxTitle) lightboxTitle.textContent = '';
          if (lightboxInfo) lightboxInfo.textContent = '';
          lightbox.classList.remove('simple-mode');
          if (calendarBtn) {
            calendarBtn.classList.remove('visible');
            calendarBtn.dataset.animeId = '';
            calendarBtn.setAttribute('aria-hidden', 'true');
            calendarBtn.tabIndex = -1;
          }
          if (lightboxAmbient) lightboxAmbient.classList.remove('ready');
          if (lightboxAmbientImg) lightboxAmbientImg.src = '';
          bannerRenderToken++;
          if (lightboxBanner && lightboxBannerImg) hideLightboxBanner();
          currentItem = null;
        }, 150);
        if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
      }

      // Fase de captura: intercepta o clique antes que ele chegue ao
      // listener do card (que abre link externo / troca de categoria).
      //
      // No "All Animes" (myranks, mode 'all') o card inteiro deve abrir o
      // poster lightbox — esses cards não têm nem data-anime-planet-url
      // (não são linkáveis) nem data-nav-all (não navegam pra outra aba),
      // então dá pra identificá-los só por essa ausência. Nas outras abas
      // o comportamento continua igual: só o poster-wrap (a imagem) abre.
      document.addEventListener('click', function(e) {
        if (e.target.closest('.watch-progress-inc') || e.target.closest('.watch-progress-dec')) return;

        const item = e.target.closest('.anime-item');
        if (!item) return;

        // O calendário reaproveita o visual dos cards do Watching Now,
        // mas não usa poster lightbox. O clique serve apenas para abrir
        // aquele anime dentro da lista Watching Now.
        if (item.closest('#releaseCalendarView')) return;

        // True Characters usa o mesmo card do All Animes, mas ainda sem
        // poster lightbox (a lista não tem os dados/metadados que o
        // lightbox espera) — clique nesses cards não faz nada por enquanto.
        if (currentCategory === 'trueCharacters') return;

        const isAllAnimesCard = !item.hasAttribute('data-anime-planet-url') && !item.hasAttribute('data-nav-all');
        const isPlanToWatchCard = item.hasAttribute('data-plan-to-watch');
        // Cards de "Unwatched or in Progress" (dentro de Announced
        // Sequels) usam o mesmo painel completo do Watching Now/Plan to
        // Watch — clicar em qualquer parte do card deve abrir o poster
        // lightbox, igual aos outros dois.
        const isRichPanelCard = item.hasAttribute('data-rich-panel');

        const trigger = (isAllAnimesCard || isPlanToWatchCard || isRichPanelCard) ? item : e.target.closest('.poster-wrap');
        if (!trigger || !item.contains(trigger)) return;

        // Se o usuário estava selecionando texto do card (pra copiar o
        // título, por exemplo), não abre o lightbox — só abre em um
        // clique "seco", sem seleção ativa.
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0 && item.contains(selection.anchorNode)) return;

        e.preventDefault();
        e.stopPropagation();

        openLightbox(item);
      }, true);

      if (soundBtn) {
        soundBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          togglePosterSound();
        });
      }

      if (calendarBtn) {
        calendarBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();

          const animeId = calendarBtn.dataset.animeId || '';
          if (!animeId) return;

          closeLightbox(true);

          // O calendário já expõe sua função de abertura globalmente.
          // Mantém o scroll durante a troca e, depois do render, leva
          // diretamente ao card correspondente dentro do dia correto.
          if (typeof window.__setReleaseCalendarMode === 'function') {
            window.__setReleaseCalendarMode(true, { keepScroll: true });
          }

          // No mobile, a retirada do position:fixed do lightbox e a
          // montagem do calendário podem terminar em frames diferentes.
          // Procura o card novamente pelo ID e usa o salto estabilizado;
          // no desktop preserva exatamente o comportamento anterior.
          const jumpToCalendarCard = (attemptsLeft) => {
            const target = document.getElementById(`calendar-${animeId}`);
            if (!target) {
              if (attemptsLeft > 0) setTimeout(() => jumpToCalendarCard(attemptsLeft - 1), 70);
              return;
            }

            scrollToElement(target);
          };

          requestAnimationFrame(() => requestAnimationFrame(() => jumpToCalendarCard(8)));
        });
      }

      if (randomPlanBtn) {
        randomPlanBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          const randomItem = pickRandomPlanItem();
          if (!randomItem) return;
          if (lightbox.classList.contains('open')) {
            randomPlanNavigation = true;
            randomPlanNavigationLocked = true;
            randomPlanHistory = [randomItem];
            randomPlanHistoryIndex = 0;
            swapItem(randomItem);
          } else {
            randomPlanHistory = [randomItem];
            randomPlanHistoryIndex = 0;
            openLightbox(randomItem, { randomPlan: true });
          }
        });
      }

      if (randomizerLightboxBtn) {
        randomizerLightboxBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (!lightbox.classList.contains('open') || !randomPlanNavigationLocked) return;
          const randomItem = pickRandomPlanItem(currentItem);
          if (!randomItem) return;
          randomPlanNavigation = true;
          randomPlanNavigationLocked = true;
          swapItem(randomItem);
        });
      }

      if (searchBtn) {
        searchBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();

          const titleEl = currentItem && currentItem.querySelector('.title-anime');
          let query = (titleEl ? titleEl.textContent : lightboxImg.alt || '').trim();
          // Modo japonês ligado (botão あ/EN) neste anime? Então a pesquisa
          // já abre com o nome em japonês (1º malName), em vez do título normal.
          // Lido ANTES do closeLightbox, que zera o jpState.
          if (currentItem && jpState.active && jpState.jpName && jpState.id === currentItem.id) {
            query = jpState.jpName.trim();
          }
          if (!query) return;

          // Guarda de onde o usuário veio ANTES de fechar o lightbox
          // (closeLightbox zera currentItem e as flags do randomizer).
          window.__posterReturnAfterSearch = {
            item: currentItem,
            scrollY: __scrollLockY,
            randomPlan: randomPlanNavigationLocked
          };

          closeLightbox(true);
          openDrawer('search', { focus: false });

          const searchInput = document.getElementById('searchDrawerInput');
          const searchBox = document.getElementById('searchBoxDrawer');
          if (!searchInput) return;
          searchInput.value = query;
          if (searchBox) searchBox.classList.add('has-value');
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          requestAnimationFrame(() => searchInput.focus());
        });
      }

      // Chamado pelo closeDrawer() quando o usuário sai da busca sem
      // escolher nada: reabre o posterlightbox do anime de origem.
      window.__reopenPosterAfterSearch = function(ret) {
        if (!ret || !ret.item) return;
        window.scrollTo(0, ret.scrollY || 0);
        openLightbox(ret.item, { randomPlan: !!ret.randomPlan });
      };

      closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeLightbox();
      });

      lightbox.addEventListener('click', function(e) {
        if (e.target === lightbox) closeLightbox();
      });

      if (lightboxList) {
        lightboxList.addEventListener('click', function(e) {
          const btn = e.target.closest('.list-tag');
          if (!btn) return;
          e.preventDefault();
          e.stopPropagation();
          const targetId = btn.getAttribute('data-target-id');
          const targetMode = btn.getAttribute('data-mode');
          closeLightbox(true);
          if (typeof navigateToAnimeInCategory === 'function') {
            navigateToAnimeInCategory(targetId, targetMode);
          }
        });
      }

      // ── Carrossel True Characters: arrastar com o mouse (PC). No touch o
      // scroll nativo já funciona. Clique logo após um arrasto é ignorado. ──
      if (lightboxCharacters) {
        let dragEl = null, startX = 0, startLeft = 0, moved = false;
        lightboxCharacters.addEventListener('pointerdown', function(e) {
          if (e.pointerType !== 'mouse' || e.button !== 0) return;
          const grid = e.target.closest('.poster-lightbox-characters-grid');
          if (!grid || grid.scrollWidth <= grid.clientWidth) return;
          dragEl = grid; startX = e.clientX; startLeft = grid.scrollLeft; moved = false;
        });
        window.addEventListener('pointermove', function(e) {
          if (!dragEl) return;
          const dx = e.clientX - startX;
          if (!moved && Math.abs(dx) > 5) { moved = true; dragEl.classList.add('is-dragging'); }
          if (moved) dragEl.scrollLeft = startLeft - dx;
        });
        const endDrag = function() {
          if (!dragEl) return;
          dragEl.classList.remove('is-dragging');
          dragEl = null;
          if (moved) setTimeout(function() { moved = false; }, 0);
        };
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
        // Remove o fade da direita quando a rolagem chega ao fim.
        lightboxCharacters.addEventListener('scroll', function(e) {
          const g = e.target;
          if (!g || !g.classList || !g.classList.contains('poster-lightbox-characters-grid')) return;
          g.classList.toggle('at-end', g.scrollLeft + g.clientWidth >= g.scrollWidth - 2);
        }, true);
        lightboxCharacters.addEventListener('click', function(e) {
          if (moved) { e.preventDefault(); e.stopPropagation(); }
        }, true);
      }

      if (lightboxCharacters) {

        lightboxCharacters.addEventListener('click', function(e) {
          if (e.target.closest('.poster-lightbox-characters-label')) {
            e.preventDefault();
            e.stopPropagation();
            closeLightbox(true);
            currentCategory = 'trueCharacters';
            render();
            window.scrollTo({ top: 0, behavior: 'instant' });
            return;
          }
          const link = e.target.closest('.poster-lightbox-character-link');
          if (!link) return;
          e.preventDefault();
          e.stopPropagation();
          closeLightbox(true);
          navigateToAnimeInCategory(link.dataset.characterId, 'trueCharacters');
        });
      }

      // ── Botão "MyAnimeList" dentro do lightbox: no mobile ele é só um
      // selo visual (sem navegar pra lugar nenhum); no desktop continua
      // funcionando normalmente como link pro MyAnimeList. Esse mesmo
      // handler cuida das DUAS cópias do bloco Anime-Planet/Crunchyroll/
      // MyAnimeList — a de dentro do painel (mobile) e a de baixo da
      // imagem (desktop) — ver "lightboxMal"/"lightboxMediaWatchNow". ──
      // Abre/fecha o ".watch-now-extra" (Crunchyroll/MyAnimeList) de um
      // container ".watch-now-links" — mesma lógica usada tanto pela seta
      // quanto pelo clique no texto "MORE INFO" (ver handleWatchNowAreaClick).
      function openWatchNowExtra(container, toggleBtn) {
        if (!container) return;
        const isOpen = container.classList.toggle('open');
        container.querySelectorAll('.watch-now-toggle').forEach(function(btn) {
          btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
        // Lembra o estado pra sobreviver ao próximo render (troca de
        // pôster no lightbox) — ver declaração no topo de
        // renderMalScores.
        watchNowExtraOpen = isOpen;
        // Trava a rolagem do painel durante a animação de largura
        // pra barra de rolagem não "piscar" no meio do caminho, e
        // destrava quando ela termina.
        const panel = container.closest('.poster-lightbox-panel');
        if (panel) {
          panel.classList.add('watch-now-animating');
          window.clearTimeout(panel._watchNowAnimTimeout);
          panel._watchNowAnimTimeout = window.setTimeout(function() {
            panel.classList.remove('watch-now-animating');
          }, 380);
        }
        // Sem auto-scroll ao abrir: como tudo fica numa linha só e o
        // container começa com scrollLeft 0, as duas setas (esquerda e
        // direita) ficam visíveis de cara. Se ainda assim não couber
        // tudo numa tela bem estreita, dá pra arrastar na horizontal
        // manualmente (ver CSS ".watch-now-links" overflow-x:auto).
        window.cancelAnimationFrame(container._watchNowScrollRaf);
        if (!isOpen) {
          container.scrollTo({ left: 0, behavior: 'smooth' });
        }
      }

      // Abre/fecha a linha com o nome real da temporada no MyAnimeList
      // (ver "malName" nos dados e ".rank-mal-season--toggleable" no
      // CSS) — a linha extra é sempre o PRÓXIMO elemento irmão da linha
      // clicada, já que são geradas juntas, uma logo após a outra (ver
      // "realnameRowHtml" em renderMalScores).
      function toggleMalRealnameRow(toggleEl) {
        const row = toggleEl.closest('.rank-mal-row');
        const nameRow = row && row.nextElementSibling;
        if (!nameRow || !nameRow.classList.contains('rank-mal-realname-row')) return;
        const isOpen = nameRow.classList.toggle('open');
        toggleEl.classList.toggle('open', isOpen);
        toggleEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      }

      // Setinha ao lado do logo do MyAnimeList: abre/fecha de uma vez só
      // TODAS as linhas de nome real das temporadas dentro do mesmo
      // ".rank-mal" — útil pra não precisar clicar temporada por
      // temporada quando há várias. O estado (aberto/fechado) do botão
      // decide a ação: se está fechado, abre tudo; se está aberto,
      // fecha tudo — mesmo que alguma temporada tenha sido aberta/
      // fechada individualmente nesse meio tempo.
      function toggleAllMalRealnameRows(btn) {
        const container = btn.closest('.rank-mal');
        if (!container) return;
        const isOpen = !btn.classList.contains('open');
        btn.classList.toggle('open', isOpen);
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        container.querySelectorAll('.rank-mal-season--toggleable').forEach(toggleEl => {
          const row = toggleEl.closest('.rank-mal-row');
          const nameRow = row && row.nextElementSibling;
          if (!nameRow || !nameRow.classList.contains('rank-mal-realname-row')) return;
          nameRow.classList.toggle('open', isOpen);
          toggleEl.classList.toggle('open', isOpen);
          toggleEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
      }

      function handleWatchNowAreaClick(e) {
        // No mobile, o logo acima das notas é apenas identificação
        // visual do MyAnimeList e nunca abre um site externo.
        const myRanksMalLogo = e.target.closest('a.rank-mal-myranks-logo');
        if (myRanksMalLogo && window.matchMedia('(max-width: 760px)').matches) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Setinha ao lado do logo do MyAnimeList: abre/fecha todas as
        // linhas de nome real de uma vez (ver "toggleAllMalRealnameRows").
        const toggleAllBtn = e.target.closest('.rank-mal-toggle-all');
        if (toggleAllBtn) {
          e.preventDefault();
          e.stopPropagation();
          toggleAllMalRealnameRows(toggleAllBtn);
          return;
        }
        // Setinha ao lado do nome da temporada (ex: "1ª temporada"):
        // revela/esconde o nome real dessa temporada no MyAnimeList,
        // numa linha logo abaixo — ver "malName" nos dados.
        const nameToggle = e.target.closest('.rank-mal-season--toggleable');
        if (nameToggle) {
          e.preventDefault();
          e.stopPropagation();
          toggleMalRealnameRow(nameToggle);
          return;
        }
        // Seta: revela/esconde Crunchyroll e MyAnimeList ao lado do
        // Anime-Planet, e ela mesma "anda" até ficar do lado do
        // MyAnimeList (ver CSS ".watch-now-toggle"/".watch-now-extra").
        const toggleBtn = e.target.closest('.watch-now-toggle');
        if (toggleBtn) {
          e.preventDefault();
          e.stopPropagation();
          openWatchNowExtra(toggleBtn.closest('.watch-now-links'), toggleBtn);
          return;
        }
        // "RESOURCES ABOUT": enquanto a seta está fechada, clicar no
        // texto sempre abre ela (nunca navega direto pro Anime-Planet,
        // mesmo quando não há Crunchyroll/MyAnimeList escondido pra
        // revelar — ver CSS ".watch-now-links:not(.open) .rank-mal-
        // label--anime-planet .anime-planet-btn-logo"/"svg", que
        // escondem o logo e o ícone de link externo enquanto fechada,
        // deixando só o texto visível). Só depois de aberta, com o
        // logo do Anime-Planet visível, é que clicar nele navega de
        // fato — isso já acontece sozinho: o "moreInfoText" não bate
        // mais (container já está "open"), então o clique cai no
        // comportamento padrão do link <a>.
        const moreInfoText = e.target.closest('.watch-now-more-info-text');
        if (moreInfoText) {
          const container = moreInfoText.closest('.watch-now-links');
          if (container && !container.classList.contains('open')) {
            e.preventDefault();
            e.stopPropagation();
            openWatchNowExtra(container, null);
            return;
          }
        }
        const btn = e.target.closest('a.rank-mal-label:not(.rank-mal-label--anime-planet):not(.rank-mal-label--crunchyroll):not(.rank-mal-label--netflix):not(.rank-mal-label--mal)');
        if (!btn) return;
        if (window.matchMedia('(max-width: 760px)').matches) {
          e.preventDefault();
        }
      }


      // Passar o mouse em cima de QUALQUER uma das duas setas (esquerda ou
      // direita) acende o hover nas duas ao mesmo tempo: em vez de estilizar
      // só o botão sob o cursor, marca o container ".watch-now-links" com
      // uma classe ("toggle-hover") e o CSS cuida de aplicar a cor de hover
      // nos dois botões ".watch-now-toggle" dentro dele (ver CSS).
      function handleWatchNowAreaMouseOver(e) {
        const toggleBtn = e.target.closest('.watch-now-toggle, .watch-now-more-info-text');
        if (!toggleBtn) return;
        const container = toggleBtn.closest('.watch-now-links');
        if (container) container.classList.add('toggle-hover');
      }

      function handleWatchNowAreaMouseOut(e) {
        const toggleBtn = e.target.closest('.watch-now-toggle, .watch-now-more-info-text');
        if (!toggleBtn) return;
        // Ignora quando o mouse só se moveu para dentro do próprio botão
        // (ex: do padding pro svg interno), pra não "piscar" o hover.
        if (toggleBtn.contains(e.relatedTarget)) return;
        const container = toggleBtn.closest('.watch-now-links');
        if (container) container.classList.remove('toggle-hover');
      }

      // Enter/Espaço na setinha (role="button", tabindex="0") também
      // abre/fecha o nome real da temporada, igual ao clique.
      function handleMalRealnameKeydown(e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        const nameToggle = e.target.closest('.rank-mal-season--toggleable');
        if (!nameToggle) return;
        e.preventDefault();
        toggleMalRealnameRow(nameToggle);
      }

      if (lightboxMal) {
        lightboxMal.addEventListener('click', handleWatchNowAreaClick);
        lightboxMal.addEventListener('keydown', handleMalRealnameKeydown);
        lightboxMal.addEventListener('mouseover', handleWatchNowAreaMouseOver);
        lightboxMal.addEventListener('mouseout', handleWatchNowAreaMouseOut);
      }
      if (lightboxMoreInfo) {
        lightboxMoreInfo.addEventListener('click', handleWatchNowAreaClick);
        lightboxMoreInfo.addEventListener('mouseover', handleWatchNowAreaMouseOver);
        lightboxMoreInfo.addEventListener('mouseout', handleWatchNowAreaMouseOut);
      }
      if (lightboxMediaWatchNow) {
        lightboxMediaWatchNow.addEventListener('click', handleWatchNowAreaClick);
        lightboxMediaWatchNow.addEventListener('mouseover', handleWatchNowAreaMouseOver);
        lightboxMediaWatchNow.addEventListener('mouseout', handleWatchNowAreaMouseOut);
      }

      document.addEventListener('keydown', function(e) {
        if (!lightbox.classList.contains('open')) return;

        if ((e.key === 'm' || e.key === 'M') && soundBtn && soundBtn.classList.contains('visible')) {
          e.preventDefault();
          e.stopPropagation();
          togglePosterSound();
        } else if (e.key === 'Escape') {
          if (lightboxZoom && lightboxZoom.classList.contains('open')) {
            closeImageZoom();
          } else {
            closeLightbox();
          }
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          if (!randomPlanNavigationLocked) navigate(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          if (!randomPlanNavigationLocked) navigate(-1);
        }
      }, true);

      // ── Swipe dentro do lightbox (mobile) — troca de card, igual às setas ──
      // Usa fase de captura + stopPropagation pra impedir que o swipe
      // "vaze" pro listener global e mude a lista/categoria do fundo.
      let lbTouchStartX = 0;
      let lbTouchStartY = 0;
      let lbTouchStartTime = 0;
      let lbSwiping = false;
      let lbPullToClose = false;
      let lbPullActive = false;
      let lbPullOffset = 0;
      let lbPullCloseTimer = 0;

      const LB_SWIPE_MIN_DISTANCE = 40;
      const LB_SWIPE_MAX_OFF_AXIS = 60;
      const LB_SWIPE_MAX_TIME = 600;
      const LB_PULL_TO_CLOSE_DISTANCE = 56;

      function resetMobilePull() {
        if (!lightbox) return;
        lightbox.classList.remove('mobile-pull-dragging', 'mobile-pull-closing', 'mobile-pull-closing-active');
        lightbox.classList.add('mobile-pull-rebounding');
        lightbox.style.removeProperty('--lb-pull-y');
        lightbox.style.removeProperty('--lb-pull-opacity');
        window.setTimeout(() => lightbox.classList.remove('mobile-pull-rebounding'), 240);
        lbPullActive = false;
        lbPullOffset = 0;
      }

      function closeFromMobilePull() {
        if (lbPullCloseTimer || !lightbox.classList.contains('open')) return;
        lbPullToClose = true;
        lbSwiping = false;
        lbPullActive = false;
        lightbox.classList.remove('mobile-pull-dragging', 'mobile-pull-rebounding');
        lightbox.classList.add('mobile-pull-closing');
        requestAnimationFrame(() => lightbox.classList.add('mobile-pull-closing-active'));
        lbPullCloseTimer = window.setTimeout(() => {
          lbPullCloseTimer = 0;
          closeLightbox();
        }, 290);
      }

      lightbox.addEventListener('touchstart', function(e) {
        if (!lightbox.classList.contains('open')) return;
        e.stopPropagation();

        // No mobile, o bloco de True Characters tem rolagem horizontal
        // própria. O toque iniciado nessa área deve permanecer na faixa
        // de personagens e nunca acionar a navegação do posterlightbox.
        if (
          window.matchMedia('(max-width: 760px)').matches &&
          e.target.closest('.poster-lightbox-characters')
        ) {
          lbSwiping = false;
          lbPullToClose = false;
          lbPullActive = false;
          lbPullOffset = 0;
          return;
        }

        if (e.touches.length !== 1) return;
        lbTouchStartX = e.touches[0].clientX;
        lbTouchStartY = e.touches[0].clientY;
        lbTouchStartTime = Date.now();
        lbSwiping = true;
        lbPullToClose = false;
        lbPullActive = false;
        lbPullOffset = 0;
      }, { capture: true, passive: true });

      lightbox.addEventListener('touchmove', function(e) {
        if (!lightbox.classList.contains('open')) return;
        e.stopPropagation();
        if (!window.matchMedia('(max-width: 760px)').matches || !lbSwiping) return;

        const touch = e.touches[0];
        if (!touch) return;
        const dx = touch.clientX - lbTouchStartX;
        const dy = touch.clientY - lbTouchStartY;
        const figureIsAtTop = !lightboxFigure || lightboxFigure.scrollTop <= 1;

        // No topo do posterlightbox, o gesto de puxar para atualizar é
        // convertido em fechar o modal. O preventDefault bloqueia o
        // pull-to-refresh nativo antes de ele alcançar a página.
        if (figureIsAtTop && dy > 0 && dy > Math.abs(dx)) {
          e.preventDefault();
          lbPullActive = true;
          lbPullOffset = Math.min(dy * 0.72, 112);
          lightbox.classList.remove('mobile-pull-rebounding');
          lightbox.classList.add('mobile-pull-dragging');
          lightbox.style.setProperty('--lb-pull-y', `${lbPullOffset}px`);
          lightbox.style.setProperty('--lb-pull-opacity', String(Math.max(0.72, 1 - lbPullOffset / 440)));
        }
      }, { capture: true, passive: false });

      lightbox.addEventListener('touchend', function(e) {
        if (!lightbox.classList.contains('open')) return;
        e.stopPropagation();
        if (lbPullActive) {
          if (lbPullOffset >= LB_PULL_TO_CLOSE_DISTANCE) closeFromMobilePull();
          else resetMobilePull();
          return;
        }
        if (lbPullToClose) {
          lbPullToClose = false;
          return;
        }
        if (!lbSwiping) return;
        lbSwiping = false;

        const touch = e.changedTouches[0];
        const dx = touch.clientX - lbTouchStartX;
        const dy = touch.clientY - lbTouchStartY;
        const dt = Date.now() - lbTouchStartTime;

        if (dt > LB_SWIPE_MAX_TIME) return;
        if (Math.abs(dy) > LB_SWIPE_MAX_OFF_AXIS) return;
        if (Math.abs(dx) < LB_SWIPE_MIN_DISTANCE) return;
        if (randomPlanNavigationLocked) return;

        if (dx < 0) {
          navigate(1);   // swipe pra esquerda = próximo card
        } else {
          navigate(-1);  // swipe pra direita = card anterior
        }
      }, { capture: true, passive: true });
    })();

    function normalizeTilde(infoStr) {
      if (!infoStr) return infoStr;
      return infoStr.replace(/\(\s*~{1,3}\s*\)/g, '<span class="pause-icon">⏸</span>');
    }


    // Notas do MyAnimeList (opcional, só pra itens do "All Animes"):
    // adicione um campo "mal" em qualquer item abaixo, assim:
    //   mal: [
    //     { label: "1ª temporada", episodes: 25, note: 8.42 },
    //     { label: "2ª temporada", episodes: 25, note: 8.91 }
    //   ]
    // Itens sem "mal" simplesmente não mostram essa seção no modal.

    const WATCHING_NO_SEASON_LABEL = { text: "Non-Seasonal Anime", color: "#7dd3fc" };
    const WATCHING_SEASON_ORDER = ["fall-2026", "summer-2026", "spring-2026", "winter-2026", "on-hold",];
    const WATCHING_SEASON_LABELS = {
      "fall-2026": { text: "Fall Season 2026", color: "#ef6a3a", url: "https://myanimelist.net/anime/season/2026/fall" }, // Laranja-avermelhado (outono)
      "summer-2026": { text: "Summer Season 2026", color: "#fbbf24", url: "https://myanimelist.net/anime/season/2026/summer" }, // Âmbar / Laranja Lighter
      "spring-2026": { text: "Spring Season 2026", color: "#f472b6", url: "https://myanimelist.net/anime/season/2026/spring" }, // Rosa Lighter
      "winter-2026": { text: "Winter Season 2026", color: "#FFFAFA", url: "https://myanimelist.net/anime/season/2026/winter" }, // Azul Claro Lighter
      "on-hold": { text: "On Hold", color: "#fb923c" }, // Laranja
    };

    const ANNOUNCED_GROUP_LABELS = {
      watched: { text: "Watched Animes", color: "#34d399", url: "https://www.anime-planet.com/users/ptbr/lists/announced-sequels-watched-animes-1484121" }, // Verde (mesma cor da categoria)
      watching: { text: "Watching Now", color: "#2dd4bf" }, // Verde-azulado (mesma cor da categoria Watching Now)
      planning: { text: "Plan to Watch", color: "#f59e0b" }, // Âmbar (mesma cor da categoria Plan to Watch)
    };
    

    const animeData = rawAnimeData.map(item => ({
      ...item,
      info: normalizeTilde(item.info)
    }));

    const planToWatchData = rawPlanToWatchData
      .map(item => ({
        ...item,
        info: normalizeTilde(item.info)
      }));

    // Posição de cada anime dentro do próprio rank do plan-to-watch,
    // exibida como número menor nos cards.
    const planRankMap = {};
    planToWatchData.forEach((anime, idx) => {
      planRankMap[anime.id] = idx + 1;
    });
    const watchingData = rawWatchingData.map(item => ({
      ...item,
      info: normalizeTilde(item.info)
    }));

    // Lista "True Characters" — mesma estrutura de objeto usada em
    // animeData (id/img/title/info/...), renderizada com o mesmo card do
    // All Animes, mas sem "studio"/"airedSeason" (não fazem sentido pra
    // personagem) e ainda sem poster lightbox.

    // Metadados (Studio / temporada) definidos direto no HTML/JS acima,
    // usados como valor padrão no modal de detalhes de cada anime.
    // Inclui "All Animes" (animeData), "Watching Now" (watchingData) e
    // "Plan to Watch" (planToWatchData) — basta adicionar "studio" e
    // "airedSeason" no objeto do anime dentro de qualquer uma dessas
    // listas que já aparece aqui.
    const ANIME_STATIC_META = {};
    [...animeData, ...watchingData, ...planToWatchData].forEach(a => {
      const meta = {};
      if (a.studio) meta.studio = a.studio;
      if (a.studios) meta.studios = a.studios;
      if (a.airedSeason) meta.season = a.airedSeason;
      if (a.rewatch) meta.rewatch = a.rewatch;
      if (a.rewatchs) meta.rewatchs = a.rewatchs;
      if (Object.keys(meta).length) {
        // O mesmo anime pode existir no MyRanks e no Watching Now.
        // Mescla os metadados para que a entrada do Watching Now não
        // apague o "rewatch" já informado no MyRanks/info.js.
        ANIME_STATIC_META[a.id] = {
          ...(ANIME_STATIC_META[a.id] || {}),
          ...meta
        };
      }
    });

    // Mapa id -> título, usado por renderMeta() para checar se um anime do
    // "Watching Now" também tem entrada na lista principal (animeData),
    // comparando por título (os ids costumam divergir entre as duas
    // listas, ex: "demon-slayer" vs "rw-demon-slayer", "re-zero" vs
    // "re-zero-4").
    const ANIME_TITLE_BY_ID = {};
    [...animeData, ...watchingData, ...planToWatchData].forEach(a => {
      ANIME_TITLE_BY_ID[a.id] = a.title;
    });

    const planIds = new Set(planToWatchData.map(a => a.id));

    const globalRankMap = {};
    animeData
      .filter(anime => !planIds.has(anime.id))
      .forEach((anime, idx) => {
        globalRankMap[anime.id] = idx + 1;
      });

    const SUB_RANK_MODES = new Set(['romance', 'isekai', 'sports', 'mecha', 'comedy']);

    const SUB_CATEGORY_SETS = {
      romance: new Set(romanceIds),
      isekai: new Set(isekaiIds),
      sports: new Set(sportsIds),
      comedy: new Set(comedyIds),
      mecha: new Set(mechaIds)
    };

    function getSubCategory(animeId) {
      if (SUB_CATEGORY_SETS.romance.has(animeId)) return 'romance';
      if (SUB_CATEGORY_SETS.isekai.has(animeId)) return 'isekai';
      if (SUB_CATEGORY_SETS.sports.has(animeId)) return 'sports';
      if (SUB_CATEGORY_SETS.comedy.has(animeId)) return 'comedy';
      if (SUB_CATEGORY_SETS.mecha.has(animeId)) return 'mecha';
      return null;
    }
    
    const container = document.getElementById('rankingContainer');
    const loadMoreContainer = document.querySelector('.load-more-container');
    const pageTitle = document.getElementById('pageTitle');
    const filterBtnText = document.getElementById('filterBtnText');
    const filterBtnEl = document.getElementById('filterBtn');
    const resetBtnEl = document.getElementById('resetBtn');
    const drawer = document.getElementById('categoryDrawer');
    const backdrop = document.getElementById('drawerBackdrop');
    const closeBtn = document.getElementById('drawerCloseBtn');
    const searchTriggerBtnEl = document.getElementById('searchTriggerBtn');
    const drawerItems = Array.from(document.querySelectorAll('.drawer-item:not([disabled])'));
    const mobileBottomNavEl = document.getElementById('mobileBottomNav');
    const mobileBottomNavButtons = mobileBottomNavEl
      ? Array.from(mobileBottomNavEl.querySelectorAll('.mobile-nav-btn'))
      : [];

    let currentCategory = 'watching';
    let isDrawerOpen = false;

    const hashMap = {
      all: '',
      romance: 'romance-drama',
      isekai: 'isekai-reincarnation',
      sports: 'sports-anime',
      comedy: 'comedy-anime',
      mecha: 'mecha-cyberpunk',
      watching: 'watching',
      incomplete: 'incomplete',
      plan: 'plan-to-watch',
      announced: 'announced-sequels',
      favEpisodes: 'favorite-episodes',
      trueCharacters: 'true-characters',
    };

    function getModeFromHash() {
      const h = (location.hash || '').replace('#', '').trim();
      if (!h) return 'all';
      for (const [mode, slug] of Object.entries(hashMap)) {
        if (slug && slug === h) return mode;
      }
      return 'all';
    }

    function makeFallbackLabel(title) {
      const clean = String(title || 'Anime').replace(/[^\p{L}\p{N}\s]+/gu, ' ').trim();
      if (!clean) return 'ANIME';
      const words = clean.split(/\s+/).filter(Boolean).slice(0, 2);
      return words.map(word => word[0]).join('').toUpperCase() || 'ANIME';
    }

    const __mobilePosterLoading = window.matchMedia('(max-width: 760px)').matches;

    // Antecipa aproximadamente uma tela. Assim as capas logo abaixo já
    // chegam prontas sem disputar conexão com dezenas de cards distantes.
    const __posterAheadMargin = Math.max(
      __mobilePosterLoading ? 600 : 950,
      Math.round(window.innerHeight * (__mobilePosterLoading ? 1.0 : 1.15))
    );
    const __posterBehindMargin = __mobilePosterLoading ? 300 : 400;

    const posterObserver = ('IntersectionObserver' in window)
      ? new IntersectionObserver((entries, observer) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.dataset.posterVisible = entry.boundingClientRect.bottom >= 0
                && entry.boundingClientRect.top <= window.innerHeight ? '1' : '0';
              startLoadingPoster(entry.target);
              observer.unobserve(entry.target);
            }
          });
        }, {
          rootMargin: `${__posterBehindMargin}px 0px ${__posterAheadMargin}px 0px`,
          threshold: 0
        })
      : null;

    // Pausa o wallpaper borrado (.anime-item-ambient) dos cards que estão
    // longe da tela (ver "ambient-offscreen" no CSS) e liga de volta
    // quando eles se aproximam. Ao contrário do posterObserver acima
    // (que só carrega a imagem uma vez e para de observar), este fica
    // observando pra sempre — a visibilidade muda toda hora conforme o
    // usuário rola a lista pra cima e pra baixo. Margem moderada em relação ao
    // poster (80px) porque aqui o objetivo é manter só uma vizinhança
    // pequena da tela com blur ativo ao mesmo tempo, não só antecipar o
    // carregamento da imagem.
    const ambientVisibilityObserver = ('IntersectionObserver' in window)
      ? new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            entry.target.classList.toggle('ambient-offscreen', !entry.isIntersecting);
          });
        }, { rootMargin: '400px 0px', threshold: 0 })
      : null;

    let __posterRenderGeneration = 0;
    const __cardPosterCache = new Map();
    const __ambientPosterCache = new Map();
    let __posterWorker = null;
    let __posterWorkerDisabled = false;
    let __posterWorkerId = 0;
    const __posterWorkerRequests = new Map();
    function getPosterWorker() {
      if (__posterWorker || __posterWorkerDisabled) return __posterWorker;
      if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) {
        __posterWorkerDisabled = true;
        return null;
      }
      try {
        const source = `
          self.onmessage = async ({data}) => {
            const {id, bitmap} = data;
            try {
              const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
              const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
              const ctx = canvas.getContext('2d', {alpha:false});
              ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
              const poster = scale < 1 ? await canvas.convertToBlob({type:'image/webp',quality:0.86}) : null;
              // Fundo em baixa resolução, com o blur já incorporado nos pixels.
              const glow = new OffscreenCanvas(192, 108);
              const gx = glow.getContext('2d', {alpha:false});
              let ambient = null;
              if ('filter' in gx) {
                gx.fillStyle = '#050505';
                gx.fillRect(0,0,192,108);
                gx.filter = 'blur(8px) brightness(0.55)';
                const cover = Math.max(224 / bitmap.width, 140 / bitmap.height);
                const w = bitmap.width * cover, h = bitmap.height * cover;
                gx.drawImage(bitmap, (192-w)/2, (108-h)/2, w, h);
                ambient = await glow.convertToBlob({type:'image/webp',quality:0.78});
              }
              self.postMessage({id, poster, ambient});
            } catch (error) { self.postMessage({id, error:String(error)}); }
            finally { bitmap.close(); }
          };
        `;
        const url = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
        try { __posterWorker = new Worker(url); } finally { URL.revokeObjectURL(url); }
        __posterWorker.onmessage = ({data}) => {
          const pending = __posterWorkerRequests.get(data.id);
          if (!pending) return;
          __posterWorkerRequests.delete(data.id);
          clearTimeout(pending.timer);
          if (data.error) pending.reject(new Error(data.error));
          else pending.resolve(data);
        };
        __posterWorker.onerror = () => {
          __posterWorkerDisabled = true;
          __posterWorker.terminate();
          __posterWorker = null;
          __posterWorkerRequests.forEach(pending => { clearTimeout(pending.timer); pending.reject(new Error('Worker indisponível')); });
          __posterWorkerRequests.clear();
        };
      } catch (error) { __posterWorkerDisabled = true; }
      return __posterWorker;
    }
    async function bakePosterInWorker(img) {
      const worker = getPosterWorker();
      if (!worker) return null;
      const bitmap = await createImageBitmap(img);
      const id = ++__posterWorkerId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { __posterWorkerRequests.delete(id); reject(new Error('Worker timeout')); }, 10000);
        __posterWorkerRequests.set(id, {resolve, reject, timer});
        try { worker.postMessage({id, bitmap}, [bitmap]); }
        catch (error) { clearTimeout(timer); __posterWorkerRequests.delete(id); bitmap.close(); reject(error); }
      });
    }
    const __posterLoadJobs = [];
    let __posterLoadFrame = 0;
    const __posterOptimizeJobs = [];
    let __posterOptimizeScheduled = false;
    let __posterOptimizePausedUntil = 0;
    let __posterOptimizeResumeTimer = 0;

    // O navegador agenda os downloads. Uma imagem lenta nunca segura as próximas.
    function queuePosterLoadStart(task, generation) {
      __posterLoadJobs.push({ task, generation });
      if (__posterLoadFrame) return;
      const drain = () => {
        __posterLoadFrame = 0;
        let started = 0;
        while (__posterLoadJobs.length && started < (__mobilePosterLoading ? 10 : 12)) {
          const job = __posterLoadJobs.shift();
          if (job.generation !== __posterRenderGeneration) continue;
          job.task();
          started++;
        }
        if (__posterLoadJobs.length) __posterLoadFrame = requestAnimationFrame(drain);
      };
      __posterLoadFrame = requestAnimationFrame(drain);
    }

    // Reduz texturas grandes somente depois de exibir a capa, uma por vez.
    // O cache da sessão evita converter a mesma capa em cada troca de lista.
    function schedulePosterOptimization(img) {
      if (img.dataset.cardOptimized === '1' || img.dataset.cardOptimizing === '1') return;
      img.dataset.cardOptimizing = '1';
      __posterOptimizeJobs.push({ img, generation: __posterRenderGeneration });
      runPosterOptimizationQueue();
    }
    function runPosterOptimizationQueue() {
      if (__posterOptimizeScheduled || !__posterOptimizeJobs.length) return;
      const wait = __posterOptimizePausedUntil - performance.now();
      if (wait > 0) {
        if (!__posterOptimizeResumeTimer) {
          __posterOptimizeResumeTimer = window.setTimeout(() => {
            __posterOptimizeResumeTimer = 0;
            runPosterOptimizationQueue();
          }, Math.ceil(wait));
        }
        return;
      }
      __posterOptimizeScheduled = true;
      const run = async () => {
        if (document.hidden || document.body.classList.contains('is-scrolling-ambient')) {
          __posterOptimizeScheduled = false;
          return;
        }
        const job = __posterOptimizeJobs.shift();
        try {
          if (job && job.img.isConnected && job.generation === __posterRenderGeneration) {
            await optimizeAllRankCardPoster(job.img);
          }
        } catch (e) {
          // Canvas pode ser bloqueado para uma imagem externa; a capa original continua visível.
          if (job) job.img.dataset.cardOptimized = '1';
        } finally {
          if (job) delete job.img.dataset.cardOptimizing;
          __posterOptimizeScheduled = false;
          runPosterOptimizationQueue();
        }
      };
      if ('requestIdleCallback' in window) requestIdleCallback(run);
      else setTimeout(run, 100);
    }
    document.addEventListener('myhtml:scroll-idle', runPosterOptimizationQueue);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) runPosterOptimizationQueue(); });

    async function optimizeAllRankCardPoster(img) {
      const src = img.getAttribute('data-src');
      img.dataset.cardOptimized = '1';
      if (__cardPosterCache.has(src)) { img.src = __cardPosterCache.get(src); img.__paintPoster?.(); return; }
      if (__cardPosterCache.size >= 240) return;
      const baked = await bakePosterInWorker(img);
      if (baked) {
        const poster = baked.poster ? URL.createObjectURL(baked.poster) : src;
        __cardPosterCache.set(src, poster);
        if (baked.ambient) __ambientPosterCache.set(src, URL.createObjectURL(baked.ambient));
        if (img.isConnected) { img.src = poster; img.__paintPoster?.(); }
        return;
      }
      // Compatibilidade: sem Worker/OffscreenCanvas mantém a capa original.
      // Não volta a converter arquivos grandes na thread do scroll.
    }

    // Capas reaproveitadas do cache (blob: já otimizado) podiam ficar
    // sem ser pintadas ao trocar de lista — o card ficava preto até o
    // hover (que ativa will-change). Simula esse mesmo "empurrão" por
    // alguns frames para forçar a nova camada a ser rasterizada.
    function kickThumbRepaint(img) {
      if (img.__kicking) return;
      img.__kicking = true;
      img.style.willChange = 'transform';
      img.style.backfaceVisibility = 'hidden';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        img.style.willChange = '';
        img.style.backfaceVisibility = '';
        img.__kicking = false;
      }));
    }

    function startLoadingPoster(wrap, immediate = false) {
      const img = wrap.querySelector('img.thumb');
      const fallback = wrap.querySelector('.poster-fallback');
      if (!img || !fallback) return;
      const src = String(img.getAttribute('data-src') || img.getAttribute('src') || '').trim();
      if (!img.__paintPoster) {
        const item = wrap.closest('.anime-item, .fav-ep-card');
        const ambient = item && item.querySelector('.anime-item-ambient, .fav-ep-ambient');
        img.__paintPoster = () => {
          if (!wrap.isConnected || !img.complete || !img.naturalWidth) return;
          wrap.classList.remove('has-fallback');
          wrap.classList.add('poster-loaded');
          img.style.display = 'block';
          img.classList.add('loaded');
          if (ambient) {
            // No carrossel dos Peak Episodes, a imagem visível pode mudar
            // sem recriar o card. Usa a origem ativa, não a capa inicial
            // capturada quando o card foi carregado.
            const ambientSource = img.dataset.ambientSource || src;
            const baked = __ambientPosterCache.get(ambientSource);
            const current = baked || img.currentSrc || img.src;
            if (ambient.dataset.paintedSource !== current) {
              ambient.dataset.paintedSource = current;
              ambient.style.backgroundImage = `url("${current}")`;
              ambient.classList.toggle('ambient-baked', !!baked);
              ambient.classList.add('ready');
            }
          }
          if (String(img.currentSrc || img.src || '').startsWith('blob:')) kickThumbRepaint(img);
          schedulePosterOptimization(img);
          // No mobile, baixa o pôster completo ao abrir o lightbox.
        };
        img.addEventListener('load', img.__paintPoster);
        img.addEventListener('error', () => {
          if (!wrap.isConnected) return;
          wrap.classList.add('has-fallback');
          wrap.classList.remove('poster-loaded');
          fallback.textContent = makeFallbackLabel(img.alt);
          img.style.display = 'none';
        });
      }
      if (img.getAttribute('src')) {
        const cached = __cardPosterCache.get(src);
        if (cached && img.getAttribute('src') !== cached) {
          img.dataset.cardOptimized = '1';
          img.src = cached;
        }
        img.__paintPoster();
        return;
      }
      if (img.__queuedGeneration === __posterRenderGeneration) return;
      img.__queuedGeneration = __posterRenderGeneration;
      const beginLoad = () => {
        if (!wrap.isConnected || !src) return;
        img.loading = 'eager';
        img.fetchPriority = wrap.dataset.posterVisible === '1' ? 'high' : 'low';
        const cached = __cardPosterCache.get(src);
        if (cached) img.dataset.cardOptimized = '1';
        img.src = cached || src;
        img.__paintPoster();
      };
      if (immediate) beginLoad();
      else queuePosterLoadStart(beginLoad, __posterRenderGeneration);
    }

    function initPosterImages(root = document) {
      // Capas já visíveis começam no mesmo frame, sem aguardar o callback
      // assíncrono do IntersectionObserver. As demais continuam lazy.
      const immediateBottom = window.innerHeight + 80;
      root.querySelectorAll('.poster-wrap').forEach(wrap => {
        const rect = wrap.getBoundingClientRect();
        const visibleNow = rect.bottom >= -80 && rect.top <= immediateBottom;
        if (visibleNow) {
          wrap.dataset.posterVisible = '1';
          startLoadingPoster(wrap, true);
        } else if (posterObserver) posterObserver.observe(wrap);
        else startLoadingPoster(wrap);
      });
      if (ambientVisibilityObserver) {
        root.querySelectorAll('li.anime-item').forEach(item => {
          item.classList.add('ambient-offscreen');
          ambientVisibilityObserver.observe(item);
        });
      }
    }

    // Cores de hover por categoria (mesmas cores usadas nos botões do drawer)
    const CATEGORY_HOVER_COLOR = {
      all: '#e2e8f0',
      romance: '#f472b6',
      isekai: '#a78bfa',
      sports: '#facc15',
      comedy: '#fb923c',
      mecha: '#38bdf8',
      watching: '#2dd4bf',
      plan: '#f59e0b',
      incomplete: '#f87171',
      announced: '#34d399',
      favEpisodes: '#7fb2ff',
      trueCharacters: '#f472b6',
    };

    // Nomes exibidos por categoria (mesmos textos usados no drawer)
    const CATEGORY_LABEL = {
      all: 'All Animes',
      romance: 'Romance Anime',
      isekai: 'Isekai & Reincarnation',
      sports: 'Sport Anime',
      comedy: 'Comedy Anime',
      mecha: 'Mecha/Cyberpunk',
      watching: 'Watching Now:',
      plan: 'Plan to Watch',
      incomplete: 'Incomplete',
      announced: 'Announced Sequels:',
      favEpisodes: 'Peak Episodes',
      trueCharacters: 'True Characters',
    };

    // Dado o progresso acumulado (cur/tot, somando todas as temporadas),
    // descobre em qual temporada o "cur" cai e retorna o progresso relativo
    // só àquela temporada (ex: cur=26 com seasons=[25,26,...] -> 1/26,
    // já que o episódio 26 é o 1ª da 2ª temporada). Se a temporada em
    // questão também for dividida em "cours" (campo "cours"), desce mais
    // um nível e retorna o progresso relativo ao cour atual em vez da
    // temporada inteira (ex: 2ª metade da temporada -> reinicia do 1).
    // ── Duração de filme (ex: "2h35m") convertida pra minutos ──
    // Usada pra dar uma largura visual proporcional ao filme na barra de
    // progresso, em vez de contar como "1 episódio" de largura (o que
    // ficava minúsculo perto do resto da barra).
    function parseDurationToMinutes(str) {
      if (!str) return null;
      const m = String(str).trim().match(/^(?:(\d+)h)?\s*(?:(\d+)m)?$/i);
      if (!m) return null;
      const h = m[1] ? parseInt(m[1], 10) : 0;
      const mi = m[2] ? parseInt(m[2], 10) : 0;
      if (!h && !mi) return null;
      return h * 60 + mi;
    }

    // 20 minutos "valem" 1 episódio de largura visual na barra.
    const MOVIE_MINUTES_PER_EPISODE_UNIT = 20;

    // Pesos visuais de cada posição do array "seasons": normalmente igual
    // ao próprio número de episódios, mas quando a posição é um filme
    // (ver "movieSeasons"), o peso vira a duração do filme (campo
    // "movieDurations", ex: {5: "2h35m"}) dividida por 20 — assim um
    // filme de 2h35m ocupa um espaço bem maior na barra do que os 20
    // minutos de "1 episódio" comum.
    function computeSeasonVisualWeights(anime) {
      const movieIdxSet = new Set(Array.isArray(anime.movieSeasons) ? anime.movieSeasons : []);
      const weights = anime.seasons.map((epCount, idx) => {
        if (movieIdxSet.has(idx)) {
          const durStr = anime.movieDurations && anime.movieDurations[idx];
          const minutes = parseDurationToMinutes(durStr);
          if (minutes) return Math.max(1, minutes / MOVIE_MINUTES_PER_EPISODE_UNIT);
        }
        return epCount;
      });
      const total = weights.reduce((a, b) => a + b, 0);
      return { weights, total };
    }

    // Mapeia o episódio atual ("cur", contagem real de cliques no +/-)
    // pra uma % de preenchimento que respeita os pesos visuais acima —
    // assim o preenchimento da barra sempre bate certinho com as
    // zonas/marcadores desenhados, mesmo quando um filme "pesa" mais que
    // as outras unidades da barra.
    function computeVisualFillPct(anime, cur) {
      const { weights, total } = computeSeasonVisualWeights(anime);
      if (!total) return 0;
      let acc = 0;
      let visAcc = 0;
      for (let i = 0; i < anime.seasons.length; i++) {
        const epCount = anime.seasons[i];
        const w = weights[i];
        if (cur <= acc + epCount) {
          const fracWithin = epCount > 0 ? Math.max(0, cur - acc) / epCount : 0;
          visAcc += fracWithin * w;
          return Math.max(0, Math.min(100, (visAcc / total) * 100));
        }
        acc += epCount;
        visAcc += w;
      }
      return Math.max(0, Math.min(100, (visAcc / total) * 100));
    }

    function getSeasonRelativeProgress(anime, cur) {
      if (!Array.isArray(anime.seasons) || anime.seasons.length < 1) return null;

      // Só faz sentido pular essa lógica se não há mais de 1 temporada E a
      // única temporada também não tiver divisão em cours (ex: anime de
      // temporada única e sem cour, tipo Frieren: aí cur/tot já basta).
      const hasMultipleSeasons = anime.seasons.length > 1;
      const hasAnyCourSplit = Array.isArray(anime.cours) && anime.cours.some(c => Array.isArray(c) && c.length > 1);
      if (!hasMultipleSeasons && !hasAnyCourSplit) return null;

      let acc = 0;
      for (let i = 0; i < anime.seasons.length; i++) {
        const epCount = anime.seasons[i];
        const isLastSeason = i === anime.seasons.length - 1;
        if (cur <= acc + epCount || isLastSeason) {
          const withinSeason = Math.max(0, cur - acc);

          const courSplit = Array.isArray(anime.cours) ? anime.cours[i] : null;
          if (Array.isArray(courSplit) && courSplit.length > 1) {
            let courAcc = 0;
            for (let c = 0; c < courSplit.length; c++) {
              const courEp = courSplit[c];
              const isLastCour = c === courSplit.length - 1;
              if (withinSeason <= courAcc + courEp || isLastCour) {
                return {
                  seasonIdx: i,
                  withinCur: Math.max(0, withinSeason - courAcc),
                  seasonTot: courEp,
                  isCour: true,
                  courIdx: c,
                };
              }
              courAcc += courEp;
            }
          }

          return { seasonIdx: i, withinCur: withinSeason, seasonTot: epCount, isCour: false };
        }
        acc += epCount;
      }
      return null;
    }

    function parseWatchProgress(anime) {
      if (!anime) return null;
      const infoStr = anime.info;
      const m = infoStr ? String(infoStr).match(/(?:Progress:\s*)?(\d+|-)\s*\/\s*(\d+|-)(?!\d)/i) : null;

      // Quando o anime já tem o campo "seasons", o total de episódios vem da
      // soma das temporadas — não precisa mais escrever "Progress: X/Y" no info.
      const seasonsTotal = (Array.isArray(anime.seasons) && anime.seasons.length)
        ? anime.seasons.reduce((a, b) => a + b, 0)
        : null;

      if (!m && seasonsTotal === null) return null;

      const curRaw = m ? m[1] : '0';
      const cur = curRaw === '-' ? 0 : parseInt(curRaw, 10);
      if (!Number.isFinite(cur)) return null;

      if (seasonsTotal !== null) {
        const pct = Math.max(0, Math.min(100, (cur / seasonsTotal) * 100));
        return { cur, tot: seasonsTotal, pct, curLabel: String(cur), indeterminate: false };
      }

      const totRaw = m[2];
      if (totRaw === '-') {
        // Total ainda não definido (ex: obra em andamento sem episódio final anunciado).
        // Não dá pra calcular %, então a barra usa um estado "indeterminado".
        return { cur, tot: null, pct: null, curLabel: String(cur), indeterminate: true };
      }
      const tot = parseInt(totRaw, 10);
      if (!Number.isFinite(tot) || tot <= 0) return null;
      const pct = Math.max(0, Math.min(100, (cur / tot) * 100));
      return { cur, tot, pct, curLabel: curRaw === '-' ? '-' : String(cur), indeterminate: false };
    }

    // ── Progresso de episódios assistidos (Watching Now) ──
    // Guardado no Supabase: clicar no "+"/"-" salva na nuvem, então o
    // progresso sincroniza entre celular, PC etc. Não altera o arquivo
    // index.html no GitHub — só os números guardados no banco de dados.
    const SUPABASE_URL = 'https://vtvdljmyvlrdokryjzfn.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_yemzUFwZDhwqs7DXGtKOqg_nMYGQO3u';
    let supabaseClient = null;
    let supabaseClientPromise = null;
    function getSupabaseClient() {
      if (supabaseClient) return Promise.resolve(supabaseClient);
      if (supabaseClientPromise) return supabaseClientPromise;
      supabaseClientPromise = new Promise((resolve, reject) => {
        const connect = () => {
          try {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            resolve(supabaseClient);
          } catch (error) { reject(error); }
        };
        if (window.supabase && window.supabase.createClient) { connect(); return; }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.async = true;
        const timeout = setTimeout(() => { script.remove(); reject(new Error('Tempo de conexão excedido')); }, 12000);
        script.onload = () => { clearTimeout(timeout); connect(); };
        script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('Falha ao carregar sincronização')); };
        document.head.appendChild(script);
      }).catch(error => { supabaseClientPromise = null; throw error; });
      return supabaseClientPromise;
    }

    // Cache local em memória, preenchido a partir do Supabase na inicialização.
    let watchProgressCache = {};
    const watchProgressEdits = new Set();
    let __watchProgressRevision = 0;
    try {
      const saved = JSON.parse(localStorage.getItem('myhtml_watch_progress_cache') || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) watchProgressCache = saved;
    } catch (e) {}
    function persistWatchProgressCache() {
      try { localStorage.setItem('myhtml_watch_progress_cache', JSON.stringify(watchProgressCache)); } catch (e) {}
    }

    async function loadWatchProgressOverrides() {
      try {
        const client = await getSupabaseClient();
        const { data, error } = await client
          .from('watching_progress')
          .select('anime_id, current_ep');
        if (error) throw error;
        const cache = {};
        (data || []).forEach(row => { cache[row.anime_id] = row.current_ep; });
        // Não deixa uma resposta antiga apagar cliques feitos enquanto sincronizava.
        watchProgressEdits.forEach(id => { cache[id] = watchProgressCache[id]; });
        const changed = Object.keys({...watchProgressCache, ...cache})
          .some(id => watchProgressCache[id] !== cache[id]);
        if (changed) __watchProgressRevision++;
        watchProgressCache = cache;
        persistWatchProgressCache();
        return changed;
      } catch (e) {
        console.error('Não foi possível carregar o progresso do Supabase:', e);
        return false;
      }
    }

    function getWatchProgressOverride(animeId) {
      const v = watchProgressCache[animeId];
      return Number.isFinite(v) ? v : null;
    }

    async function setWatchProgressOverride(animeId, value) {
      // Atualização otimista: já reflete localmente enquanto salva na nuvem.
      __watchProgressRevision++;
      watchProgressCache[animeId] = value;
      watchProgressEdits.add(animeId);
      persistWatchProgressCache();
      try {
        const client = await getSupabaseClient();
        const { error } = await client
          .from('watching_progress')
          .upsert({ anime_id: animeId, current_ep: value }, { onConflict: 'anime_id' });
        if (error) throw error;
      } catch (e) {
        console.error('Não foi possível salvar o progresso no Supabase:', e);
      }
    }

    // Mesma lógica de troca de pasta usada na busca (searchThumbSrc /
    // marqueeThumbSrc), só que pra pasta "-sequels" — usada nos cards
    // de "Announced Sequels" (mode 'announced' e 'announced-unwatched'),
    // que usam uma imagem diferente da original.
    function sequelsThumbSrc(originalPath) {
      if (!originalPath) return originalPath;
      const path = String(originalPath);
      const filename = path.split('/').pop();
      let baseFolder = 'myranks-images';
      let folder = 'myranks-sequels';
      if (path.startsWith('watchingnow-images/watchingnow/')) { baseFolder = 'watchingnow-images'; folder = 'watchingnow-sequels'; }
      else if (path.startsWith('plantowatch-images/plantowatch/')) { baseFolder = 'plantowatch-images'; folder = 'plantowatch-sequels'; }
      return `${baseFolder}/${folder}/${filename}`;
    }

    // Imagem horizontal usada pelos resultados da busca. No mobile ela
    // também vira o backdrop dos cards cinematográficos.
    function mobileCardSearchThumbSrc(originalPath) {
      if (!originalPath) return originalPath;
      const path = String(originalPath);
      if (path.startsWith('other-images/peakepisodes/') || path.startsWith('other-images/truecharacters/')) return path;
      const filename = path.split('/').pop();
      let baseFolder = 'myranks-images';
      let folder = 'myranks-search';
      if (path.startsWith('watchingnow-images/watchingnow/')) {
        baseFolder = 'watchingnow-images';
        folder = 'watchingnow-search';
      } else if (path.startsWith('plantowatch-images/plantowatch/')) {
        baseFolder = 'plantowatch-images';
        folder = 'plantowatch-search';
      }
      return baseFolder + '/' + folder + '/' + filename;
    }

    // As imagens de True Characters normalmente são substituídas mantendo
    // o mesmo nome de arquivo. Um identificador por carregamento evita que
    // o navegador/PWA reutilize a versão antiga após apenas atualizar a página.
    const trueCharacterImageRevision = Date.now().toString(36);
    function freshTrueCharacterImageSrc(originalPath) {
      if (!originalPath) return originalPath;
      const path = String(originalPath);
      if (!path.startsWith('other-images/truecharacters/')) return path;
      return path + (path.includes('?') ? '&' : '?') + 'v=' + trueCharacterImageRevision;
    }

    function createAnimeCard(anime, mode, seasonColor = null, rankIndex = null) {
      if (!anime) return '';
      let remainingInfo = anime.info ? String(anime.info).trim() : '';
      if (mode === 'watching' && remainingInfo) {
        remainingInfo = remainingInfo
          .replace(/[-–:]?\s*Progress:\s*(?:\d+|-)\s*\/\s*(?:\d+|-)\s*/i, '')
          .trim();
      }
      // OVAs não aparecem no "info" do card (só na barra de progresso/
      // posterlightbox) — remove qualquer linha (separada por <br>) que
      // mencione "OVA" antes de montar o texto exibido no card.
      // Linhas de "Filme" só são escondidas quando existe alguma linha
      // de temporada junto (ex: "3 temporadas: 31 episódios" + "Filme:
      // 1h30m") — nesse caso o filme fica só no poster-lightbox. Quando
      // o item é SÓ filme (sem nenhuma linha de temporada), a linha de
      // Filme continua aparecendo no card normalmente.
      if (remainingInfo) {
        const infoLinesArr = remainingInfo
          .split(/<\/br>|<br\s*\/?>/i)
          .map(s => s.trim())
          .filter(Boolean)
          .filter(line => !/\bOVA\b/i.test(line));
        const hasSeasonLine = infoLinesArr.some(line => !/\bFilmes?\b/i.test(line));
        remainingInfo = (hasSeasonLine
          ? infoLinesArr.filter(line => !/\bFilmes?\b/i.test(line))
          : infoLinesArr
        ).join('<br>');
      }
      const topRankClass = rankIndex === 0 ? ' rank-gold'
        : rankIndex === 1 ? ' rank-silver'
        : rankIndex === 2 ? ' rank-bronze'
        : '';
      const rankClass = ' rank';
      const rankAttrs = '';

      let secondaryRankHtml = '';
      if (SUB_RANK_MODES.has(mode)) {
        const globalRank = globalRankMap[anime.id];
        if (globalRank != null) {
          secondaryRankHtml = `<span class="rank-secondary">#${globalRank}</span>`;
        }
      }
      const ns = nextSeasonMap[anime.id];
      const nsLines = ns ? String(ns.info).split(/<\/br>|<br\s*\/?>/i).map(s => s.trim()).filter(Boolean) : [];
      const isMulti = nsLines.length > 1;

      const stripHtml = ns ? `
            <div class="announce-strip announce-strip--meta"${isMulti ? ` data-lines='${JSON.stringify(nsLines).replace(/'/g, "&apos;")}'` : ''}>
              <div class="announce-track"><span class="announce-line">${nsLines[0]}</span></div>
            </div>` : '';
      let subClass = '';
      if (mode === 'all') {
        const subCat = getSubCategory(anime.id);
        if (subCat) {
          subClass = ` sub-list sub-${subCat}`;
        }
      } else if (SUB_RANK_MODES.has(mode)) {
        subClass = ` sub-list sub-${mode}`;
      }

      const colorMode = mode === 'announced-unwatched' ? 'announced' : mode;
      const hoverColor = CATEGORY_HOVER_COLOR[colorMode] || seasonColor || null;
      const hoverStyle = hoverColor ? ` style="--item-hover-color: ${hoverColor};"` : '';
      const isLinkableMode = (mode === 'watching' || mode === 'plan' || mode === 'announced-unwatched');
      // Watching Now não usa data-anime-planet-url pro clique do card em
      // si (isso mudaria a área clicável do card inteiro pra só o
      // poster-wrap, igual acontece em plan/announced-unwatched) — usa um
      // atributo próprio, só pra alimentar o botão do Anime-Planet dentro
      // do lightbox (ver showItem/renderMalScores).
      const isAnimePlanetLinkable = (mode === 'plan' || mode === 'announced-unwatched');
      const urlAttr = (isAnimePlanetLinkable && anime.url) ? ` data-anime-planet-url="${anime.url}"` : '';
      const watchNowUrlAttr = (mode === 'watching' && anime.url) ? ` data-watchnow-anime-planet-url="${anime.url}"` : '';
      const watchNowMalUrlAttr = (isLinkableMode && anime.malUrl) ? ` data-watchnow-mal-url="${anime.malUrl}"` : '';
      const crAttr = (isLinkableMode && anime.crunchyroll) ? ` data-crunchyroll-url="${anime.crunchyroll}"` : '';
      const nfAttr = (isLinkableMode && anime.netflix) ? ` data-netflix-url="${anime.netflix}"` : '';
      const navAllAttr = (mode !== 'watching' && mode !== 'plan' && mode !== 'all' && mode !== 'announced-unwatched' && mode !== 'trueCharacters') ? ` data-nav-all="1"` : '';

      const isMobileCard = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
      const normalCardThumb = (mode === 'announced' || mode === 'announced-unwatched')
        ? sequelsThumbSrc(anime.img)
        : anime.img;
      let cardThumbSrc = isMobileCard && mode !== 'announced' && mode !== 'announced-unwatched'
        ? mobileCardSearchThumbSrc(anime.img)
        : normalCardThumb;
      if (mode === 'trueCharacters') cardThumbSrc = freshTrueCharacterImageSrc(cardThumbSrc);
      const ambientInlineStyle = mode === 'trueCharacters' && cardThumbSrc
        ? ` style="background-image:url('${String(cardThumbSrc).replace(/["'<>]/g, c => ({ '"': '%22', "'": '%27', '<': '%3C', '>': '%3E' })[c])}')"`
        : '';
      const characterOriginAttr = mode === 'trueCharacters' && anime.info
        ? ` data-character-origin="${String(anime.info)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')}"`
        : '';
      let progressHtml = '';
      if (mode === 'watching') {
        const progress = parseWatchProgress(anime);
        if (progress) {
          const override = getWatchProgressOverride(anime.id);
          if (progress.indeterminate) {
            if (override !== null) {
              progress.cur = Math.max(0, override);
              progress.curLabel = String(progress.cur);
            }
            const atMin = progress.cur <= 0;
            progressHtml = `
              <div class="watch-progress watch-progress--indeterminate" style="--item-hover-color: ${hoverColor || '#2dd4bf'};">
                <button type="button" class="watch-progress-dec" data-anime-id="${anime.id}" aria-label="Voltar um episódio assistido"${atMin ? ' disabled' : ''}>-</button>
                <div class="watch-progress-track">
                  <div class="watch-progress-fill watch-progress-fill--indeterminate"></div>
                </div>
                <span class="watch-progress-label">${progress.curLabel}/-</span>
                <button type="button" class="watch-progress-inc" data-anime-id="${anime.id}" aria-label="Marcar mais um episódio assistido">+</button>
              </div>`;
          } else {
            if (override !== null) {
              progress.cur = Math.max(0, Math.min(progress.tot, override));
              progress.pct = Math.max(0, Math.min(100, (progress.cur / progress.tot) * 100));
              progress.curLabel = String(progress.cur);
            }
            const atMax = progress.cur >= progress.tot;
            const atMin = progress.cur <= 0;
            // Se o anime tiver várias temporadas (campo "seasons"), desenha uma
            // linha divisória na barra em cada ponto onde uma temporada acaba,
            // já que a barra mostra o progresso somado de todas elas.
            let seasonMarksHtml = '';
            let seasonZonesHtml = '';
            let courMarksHtml = '';
            if (Array.isArray(anime.seasons) && anime.seasons.length >= 1) {
              let acc = 0;
              const seasonTotal = anime.seasons.reduce((a, b) => a + b, 0);
              if (anime.seasons.length > 1) {
                // Alguns animes intercalam um filme canônico entre as
                // temporadas dentro do próprio array "seasons" (ex: Konosuba
                // [10,10,1,11], onde o "1" é o filme). O array opcional
                // "movieSeasons" lista (0-indexado) quais posições desse
                // array são na verdade filmes, não temporadas — assim a
                // numeração ("1ª", "2ª"...) pula esses índices e o
                // marcador/zona mostra "Filme" em vez de virar uma
                // "temporada" de 1 episódio só.
                const movieIdxSet = new Set(Array.isArray(anime.movieSeasons) ? anime.movieSeasons : []);
                let seasonNum = 0;
                const seasonLabels = anime.seasons.map((epCount, idx) => {
                  if (movieIdxSet.has(idx)) return { isMovie: true, label: (anime.movieLabels && anime.movieLabels[idx]) || 'Filme' };
                  seasonNum++;
                  return { isMovie: false, label: `${seasonNum}ª temporada` };
                });

                // Larguras visuais: temporadas normais usam o nº de
                // episódios de sempre, mas filmes usam a duração real
                // (via "movieDurations") ao invés do "1 episódio" fake —
                // assim o pedaço do filme na barra fica do tamanho real
                // dele (ex: 2h35m ≈ 7-8 "episódios" de largura).
                const { weights: visualWeights, total: visualTotal } = computeSeasonVisualWeights(anime);

                let visAcc = 0;
                seasonMarksHtml = anime.seasons.slice(0, -1).map((epCount, idx) => {
                  visAcc += visualWeights[idx];
                  const markPct = Math.max(0, Math.min(100, (visAcc / visualTotal) * 100));
                  const { isMovie, label } = seasonLabels[idx];
                  return `<span class="watch-progress-season-mark" style="left:${markPct}%;" data-tooltip="Fim ${isMovie ? 'do' : 'da'} ${label}"></span>`;
                }).join('');

                let zoneAcc = 0;
                seasonZonesHtml = anime.seasons.map((epCount, idx) => {
                  const startPct = Math.max(0, Math.min(100, (zoneAcc / visualTotal) * 100));
                  zoneAcc += visualWeights[idx];
                  const endPct = Math.max(0, Math.min(100, (zoneAcc / visualTotal) * 100));
                  const widthPct = Math.max(0, endPct - startPct);
                  const { isMovie, label } = seasonLabels[idx];
                  const epLabel = epCount === 1 ? 'episódio' : 'episódios';
                  const durStr = isMovie && anime.movieDurations ? anime.movieDurations[idx] : null;
                  const zoneTitle = isMovie
                    ? `${label}: ${durStr || `${epCount} ${epLabel}`}`
                    : `${label}: ${epCount} ${epLabel}`;
                  return `<span class="watch-progress-season-zone" style="left:${startPct}%;width:${widthPct}%;" data-tooltip="${zoneTitle}"></span>`;
                }).join('');
              }

              // Marcadores finos e discretos para "cours": quando uma
              // temporada (campo "seasons") foi exibida em dois ou mais
              // blocos separados, o campo opcional "cours" (array paralelo
              // a "seasons") descreve como dividi-la, ex: cours[1] = [13,13]
              // divide a 2ª temporada ao meio. Diferente do marcador de
              // temporada, esse não encerra a barra em uma temporada nova.
              if (Array.isArray(anime.cours)) {
                let seasonAcc = 0;
                anime.cours.forEach((courSplit, sIdx) => {
                  const seasonEpCount = anime.seasons[sIdx] || 0;
                  if (Array.isArray(courSplit) && courSplit.length > 1) {
                    let courAcc = 0;
                    courMarksHtml += courSplit.slice(0, -1).map((courEpCount, cIdx) => {
                      courAcc += courEpCount;
                      const pct = Math.max(0, Math.min(100, ((seasonAcc + courAcc) / seasonTotal) * 100));
                      return `<span class="watch-progress-cour-mark" style="left:${pct}%;" data-tooltip="Fim do ${cIdx + 1}º cour (${sIdx + 1}ª temporada)"></span>`;
                    }).join('');
                  }
                  seasonAcc += seasonEpCount;
                });
              }

              // Recalcula o preenchimento da barra (pct) usando os mesmos
              // pesos visuais das zonas acima, senão o preenchimento
              // (baseado na contagem real de episódios) ficaria
              // desalinhado com a zona do filme, que agora é mais larga.
              if (anime.seasons.length > 1) {
                progress.pct = computeVisualFillPct(anime, progress.cur);
              }
            }
            const seasonRel = getSeasonRelativeProgress(anime, progress.cur);
            const labelHtml = atMax
              ? 'COMPLETED'
              : (seasonRel
                ? `${seasonRel.withinCur}/${seasonRel.seasonTot}<span class="watch-progress-label-total">${progress.cur}/${progress.tot}</span>`
                : `${progress.curLabel}/${progress.tot}`);
            progressHtml = `
              <div class="watch-progress" style="--item-hover-color: ${hoverColor || '#2dd4bf'};">
                <button type="button" class="watch-progress-dec" data-anime-id="${anime.id}" data-tot="${progress.tot}" aria-label="Voltar um episódio assistido"${atMin ? ' disabled' : ''}>-</button>
                <div class="watch-progress-track">
                  <div class="watch-progress-fill" style="width:${progress.pct}%;"></div>
                  ${seasonZonesHtml}
                  ${courMarksHtml}
                  ${seasonMarksHtml}
                </div>
                <span class="watch-progress-label${atMax ? ' watch-progress-label--completed' : ''}">${labelHtml}</span>
                <button type="button" class="watch-progress-inc" data-anime-id="${anime.id}" data-tot="${progress.tot}" aria-label="Marcar mais um episódio assistido"${atMax ? ' disabled' : ''}>+</button>
              </div>`;
          }
        }
      }

      return `
        <li class="anime-item${subClass}${topRankClass}${ns ? ' has-next-season' : ''}" id="${anime.id}"${hoverStyle}${urlAttr}${watchNowUrlAttr}${watchNowMalUrlAttr}${crAttr}${nfAttr}${navAllAttr}${characterOriginAttr}${mode === 'watching' ? ' data-watching-now="1"' : ''}${mode === 'plan' ? ' data-plan-to-watch="1"' : ''}${mode === 'announced-unwatched' ? ' data-rich-panel="1"' : ''}>
          <div class="anime-item-ambient" aria-hidden="true"${ambientInlineStyle}></div>
          <div class="anime-item-ambient-shade" aria-hidden="true"></div>
          <div class="rank-wrap">
            <span class="${rankClass.trim()}" aria-hidden="true"${rankAttrs}></span>
            ${secondaryRankHtml}
          </div>
          <div class="poster-wrap">
            <img class="thumb" data-list-mode="${mode}" data-src="${cardThumbSrc}" data-poster-src="${normalCardThumb}" alt="${anime.title}" decoding="async">
            <div class="poster-fallback" aria-hidden="true"></div>
          </div>
          <div class="meta">
            <div class="title-row">
              <h3 class="title-anime">${anime.title}</h3>
            </div>

            ${remainingInfo ? `<div class="info-row">
              <p class="info">${remainingInfo}</p>
            </div>` : ''}
            ${progressHtml}
            ${stripHtml}
          </div>
        </li>
      `;
    }

    // ── True Characters → preview do card correspondente no All Anime ──
    const trueCharacterAnimePreview = document.createElement('aside');
    trueCharacterAnimePreview.className = 'true-character-anime-preview';
    trueCharacterAnimePreview.setAttribute('aria-hidden', 'true');
    document.body.appendChild(trueCharacterAnimePreview);

    let activeTrueCharacterPreviewCard = null;

    function normalizeAnimeLookupTitle(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/\b(?:season|part)\s+\d+\b/g, ' ')
        .replace(/\(\s*\d{4}\s*\)/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    }

    function findAllAnimeForCharacter(originTitle) {
      const wanted = normalizeAnimeLookupTitle(originTitle);
      if (!wanted) return null;

      const available = animeData.filter(anime => !planIds.has(anime.id));
      return available.find(anime => normalizeAnimeLookupTitle(anime.title) === wanted)
        || available.find(anime => {
          const title = normalizeAnimeLookupTitle(anime.title);
          return title.startsWith(wanted + ' ') || wanted.startsWith(title + ' ');
        })
        || null;
    }

    function positionTrueCharacterPreview(sourceCard) {
      const cardRect = sourceCard.getBoundingClientRect();
      // A prévia substitui visualmente o card clicado. Assim ela fica
      // associada ao personagem sem criar espaços vazios na grade.
      trueCharacterAnimePreview.style.width = Math.round(cardRect.width) + 'px';
      trueCharacterAnimePreview.style.setProperty('--true-character-preview-height', Math.round(cardRect.height) + 'px');
      trueCharacterAnimePreview.style.left = Math.round(cardRect.left) + 'px';
      trueCharacterAnimePreview.style.top = Math.round(cardRect.top) + 'px';
    }

    function showTrueCharacterAnimePreview(sourceCard) {
      if (currentCategory !== 'trueCharacters') return;

      const anime = findAllAnimeForCharacter(sourceCard.dataset.characterOrigin);
      if (!anime) return;

      // True Characters abre a obra de origem no posterlightbox normal
      // do site. Isso preserva o clique, mas elimina a prévia flutuante
      // que competia visualmente com a própria grade.
      const rankIndex = Math.max(0, (globalRankMap[anime.id] || 1) - 1);
      const holder = document.createElement('ol');
      holder.className = 'ranking mode-true-characters category-all';
      holder.innerHTML = createAnimeCard(anime, 'all', null, rankIndex);
      const originItem = holder.querySelector('li.anime-item');
      if (originItem && typeof window.__openPosterLightboxForAnime === 'function') {
        originItem.dataset.lightboxRank = String(rankIndex + 1);
        window.__openPosterLightboxForAnime(originItem);
      }
      return;

      const cardMarkup = createAnimeCard(anime, 'all', null, rankIndex);
      trueCharacterAnimePreview.innerHTML = `
        <ol class="ranking mode-true-characters category-all" style="counter-reset:item ${rankIndex}">
          ${cardMarkup}
        </ol>`;

      const previewCard = trueCharacterAnimePreview.querySelector('li.anime-item');
      const previewImage = trueCharacterAnimePreview.querySelector('img.thumb');
      if (previewCard) {
        previewCard.removeAttribute('id');
        previewCard.removeAttribute('data-nav-all');
      }
      if (previewImage) {
        const previewWrap = previewImage.closest('.poster-wrap');
        if (previewWrap) startLoadingPoster(previewWrap, true);
      }

      if (activeTrueCharacterPreviewCard && activeTrueCharacterPreviewCard !== sourceCard) {
        activeTrueCharacterPreviewCard.setAttribute('aria-expanded', 'false');
      }
      activeTrueCharacterPreviewCard = sourceCard;
      sourceCard.setAttribute('aria-expanded', 'true');
      trueCharacterAnimePreview.classList.add('is-visible');
      trueCharacterAnimePreview.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => positionTrueCharacterPreview(sourceCard));
    }

    function hideTrueCharacterAnimePreview() {
      if (activeTrueCharacterPreviewCard) {
        activeTrueCharacterPreviewCard.setAttribute('aria-expanded', 'false');
      }
      activeTrueCharacterPreviewCard = null;
      trueCharacterAnimePreview.classList.remove('is-visible');
      trueCharacterAnimePreview.setAttribute('aria-hidden', 'true');
    }

    document.addEventListener('click', event => {
      // Mobile: tocar apenas na imagem do True Character a amplia em
      // tela cheia. O texto da obra continua reservado ao lightbox.
      const characterPoster = event.target.closest('ol.category-trueCharacters li.anime-item[data-character-origin] .poster-wrap');
      if (characterPoster && window.matchMedia('(max-width: 760px)').matches) {
        const image = characterPoster.querySelector('img.thumb');
        const src = image && (image.currentSrc || image.src || image.dataset.posterSrc || image.dataset.src);
        if (src && typeof window.__openPosterImageZoom === 'function') {
          event.preventDefault();
          event.stopPropagation();
          window.__openPosterImageZoom(src, image.alt || '', true);
          return;
        }
      }

      // No True Characters, só o nome da obra de origem abre o
      // posterlightbox. O restante do card fica apenas informativo.
      const originName = event.target.closest('ol.category-trueCharacters li.anime-item[data-character-origin] .info-row .info');
      if (originName) {
        const card = originName.closest('li.anime-item[data-character-origin]');
        if (card) showTrueCharacterAnimePreview(card);
        return;
      }
      if (activeTrueCharacterPreviewCard) hideTrueCharacterAnimePreview();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && activeTrueCharacterPreviewCard) {
        hideTrueCharacterAnimePreview();
      }
    });

    window.addEventListener('scroll', hideTrueCharacterAnimePreview, { passive: true });
    // A página pode rolar pela janela ou por um contêiner interno.
    // O capture detecta ambos; wheel/touchmove fecham imediatamente,
    // antes mesmo de o navegador aplicar o deslocamento visual.
    document.addEventListener('scroll', hideTrueCharacterAnimePreview, { passive: true, capture: true });
    document.addEventListener('wheel', hideTrueCharacterAnimePreview, { passive: true, capture: true });
    document.addEventListener('touchmove', hideTrueCharacterAnimePreview, { passive: true, capture: true });
    window.addEventListener('resize', hideTrueCharacterAnimePreview, { passive: true });

    function updatePageTexts() {
      const calendarBtn = document.getElementById('calendarBtn');
      const randomPlanBtn = document.getElementById('randomPlanBtn');
      if (calendarBtn) {
        // O calendário permanece no header do Watching Now em todas as
        // telas, inclusive no mobile.
        calendarBtn.hidden = currentCategory !== 'watching';
      }
      if (randomPlanBtn) randomPlanBtn.hidden = currentCategory !== 'plan';
      document.body.classList.toggle('mobile-watching-mode', currentCategory === 'watching');

      if (currentCategory === 'all') pageTitle.innerText = "ranking of all the anime I've watched";
      else if (currentCategory === 'romance') pageTitle.innerText = "romance anime ranking";
      else if (currentCategory === 'isekai') pageTitle.innerText = "isekai/reincarnation anime ranking";
      else if (currentCategory === 'incomplete') pageTitle.innerText = "anime that i have to finish watching";
      else if (currentCategory === 'plan') pageTitle.innerText = "animes i want to watch";
      else if (currentCategory === 'watching') pageTitle.innerText = "anime i'm watching right now";
      else if (currentCategory === 'sports') pageTitle.innerText = "sports anime ranking";
      else if (currentCategory === 'comedy') pageTitle.innerText = "comedy anime ranking";
      else if (currentCategory === 'mecha') pageTitle.innerText = "mecha/cyberpunk anime ranking";
      else if (currentCategory === 'announced') pageTitle.innerText = "anime with announced sequels or movies";
      else if (currentCategory === 'favEpisodes') pageTitle.innerText = "episodes that are absolute cinema for me";
      else if (currentCategory === 'trueCharacters') pageTitle.innerText = "characters that are absolutely peak";
    }

    function selectDrawerItem(mode) {
      drawerItems.forEach(item => item.classList.toggle('selected', item.getAttribute('data-mode') === mode));
    }

    function updateMobileBottomNav() {
      if (!mobileBottomNavButtons.length) return;
      const planCalendarButton = document.getElementById('mobilePlanCalendarBtn');

      if (planCalendarButton) {
        const planIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21 12 16.5 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"></path></svg>';
        // O quinto botão é sempre Plan to Watch; o calendário fica no header.
        planCalendarButton.removeAttribute('data-mobile-action');
        planCalendarButton.setAttribute('data-mobile-mode', 'plan');
        planCalendarButton.style.setProperty('--nav-color', '#f59e0b');
        planCalendarButton.setAttribute('aria-label', 'Abrir Plan to Watch');
        if (planCalendarButton.dataset.iconSet !== '1') {
          planCalendarButton.innerHTML = planIcon;
          planCalendarButton.dataset.iconSet = '1';
        }
        planCalendarButton.classList.remove('active');
      }

      const activePanel = document.querySelector('#categoryDrawer .drawer-panel.active');
      const activeTab = activePanel ? activePanel.getAttribute('data-panel') : '';
      let sideActiveButton = null;

      mobileBottomNavButtons.forEach(button => {
        const mode = button.getAttribute('data-mobile-mode');
        const action = button.getAttribute('data-mobile-action');
        const active = mode
          ? (!isDrawerOpen && mode === currentCategory)
          : action === 'search'
            ? (isDrawerOpen && activeTab === 'search')
            : action === 'menu'
              ? (isDrawerOpen && activeTab !== 'search')
              : action === 'calendar'
                ? (!isDrawerOpen && currentCategory === 'watching' && calendarMode)
              : false;

        button.classList.toggle('active', active);
        if (active) button.setAttribute('aria-current', mode ? 'page' : 'true');
        else button.removeAttribute('aria-current');
        if (action === 'menu') button.setAttribute('aria-expanded', isDrawerOpen && activeTab !== 'search' ? 'true' : 'false');
        if (active && action !== 'menu') sideActiveButton = button;
      });

      // O dock acompanha a cor da categoria atual também nas listas
      // abertas pelo drawer, que não têm um atalho lateral próprio.
      if (mobileBottomNavEl) {
        const categoryItem = drawerItems.find(item => item.getAttribute('data-mode') === currentCategory);
        const accent = sideActiveButton
          ? (sideActiveButton.style.getPropertyValue('--nav-color').trim() || '#e2e8f0')
          : !isDrawerOpen
            ? (categoryItem?.style.getPropertyValue('--cat-color').trim() || CATEGORY_HOVER_COLOR[currentCategory] || '#e2e8f0')
            : '';
        const hasAccent = !!accent;
        mobileBottomNavEl.classList.toggle('has-side-active', hasAccent);
        if (hasAccent) mobileBottomNavEl.style.setProperty('--mobile-nav-accent', accent);
        else mobileBottomNavEl.style.removeProperty('--mobile-nav-accent');
      }
    }

    function hexToRgb(hex) {
      const clean = hex.trim().replace('#', '');
      const full = clean.length === 3
        ? clean.split('').map(c => c + c).join('')
        : clean;
      const num = parseInt(full, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    }

    function updateGlowColor(mode) {
      const item = drawerItems.find(el => el.getAttribute('data-mode') === mode);
      const rawColor = item ? item.style.getPropertyValue('--cat-color').trim() : '';
      const color = rawColor || '#e2e8f0';

      try {
        const { r, g, b } = hexToRgb(color);
        const root = document.documentElement.style;

        // Cor pura (sem mistura) da categoria atual, usada em detalhes pontuais da UI
        // que devem acompanhar a lista ativa.
        root.setProperty('--current-cat-color', color);

        // Glow sutil sobre a base clara (bem menos opaco que no tema escuro original)
        // Glow visível sobre a base preta — as "partes coloridas" da categoria
        root.setProperty('--glow-1', `rgba(${r}, ${g}, ${b}, 0.38)`);
        root.setProperty('--glow-2', `rgba(${r}, ${g}, ${b}, 0.24)`);
        root.setProperty('--glow-3', `rgba(${r}, ${g}, ${b}, 0.16)`);

        // Glow mais forte, só para o drawer lateral (mantém o visual escuro original)
        root.setProperty('--drawer-glow-1', `rgba(${r}, ${g}, ${b}, 0.5)`);
        root.setProperty('--drawer-glow-2', `rgba(${r}, ${g}, ${b}, 0.3)`);
        root.setProperty('--drawer-glow-3', `rgba(${r}, ${g}, ${b}, 0.22)`);

        // Base quase preta, levemente tingida pela cor da categoria
        const mixWithBlack = (channel) => Math.round(channel * 0.17);
        const pr = mixWithBlack(r), pg = mixWithBlack(g), pb = mixWithBlack(b);
        root.setProperty('--page-base', `rgb(${pr}, ${pg}, ${pb})`);

        const mr = Math.round(r * 0.5 + 156 * 0.5);
        const mg = Math.round(g * 0.5 + 163 * 0.5);
        const mb = Math.round(b * 0.5 + 175 * 0.5);
        root.setProperty('--glow-accent', `rgb(${mr}, ${mg}, ${mb})`);
      } catch (e) {}
    }

    function updateFilterButtonText() {
      const selected = drawerItems.find(item => item.getAttribute('data-mode') === currentCategory);
      if (selected && filterBtnText) {
        filterBtnText.innerText = selected.querySelector('.label')?.innerText?.trim() || '';
      } else if (filterBtnText) {
        filterBtnText.innerText = 'All Anime';
      }
    }

    let drawerFrame = 0;
    let drawerUsesScrollLock = false;

    // ── Tabs do drawer único "You Decided That" (Ranks / Lists / Search) ──
    const drawerTabs = Array.from(document.querySelectorAll('.drawer-tab'));
    const drawerPanels = Array.from(document.querySelectorAll('.drawer-panel'));
    const drawerTitleEl = document.getElementById('drawerTitleEl');

    const DRAWER_TAB_TITLES = {
      ranks: "私のランキング",
      search: 'リサーチはここから始まります',
      lists: '自分用のリスト',
    };

    // Os ícones do header (filtro, busca) controlam o MESMO
    // drawer agora — este mapa decide qual ícone fica "aceso" conforme a
    // aba ativa dentro dele.
    const HEADER_TRIGGER_BY_TAB = {
      ranks: filterBtnEl,
      lists: filterBtnEl,
      search: searchTriggerBtnEl
    };

    function updateHeaderTriggerButtons(target) {
      [filterBtnEl, searchTriggerBtnEl].forEach(btn => {
        if (!btn) return;
        btn.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
      });
      if (!isDrawerOpen) return;
      const btn = HEADER_TRIGGER_BY_TAB[target];
      if (btn) {
        btn.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
      }
    }

    // ── Drawer expandido (desktop): botão que alterna entre o drawer
    // normal e a tela inteira com Ranks, Search e Lists lado a lado. ──
    const DRAWER_EXPANDED_KEY = 'myanimerank_drawerExpanded';
    const drawerExpandBtn = document.getElementById('drawerExpandBtn');

    function setDrawerExpanded(expanded, persist) {
      if (!drawer) return;
      drawer.classList.toggle('expanded', !!expanded);
      if (drawerExpandBtn) {
        drawerExpandBtn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
        drawerExpandBtn.setAttribute('aria-label', expanded ? 'Recolher' : 'Expandir');
        drawerExpandBtn.setAttribute('data-tooltip', expanded ? 'Collapse' : 'Expand');
      }
      if (expanded) { try { initSearchMarquee(); } catch (e) {} }
      if (persist) {
        try { localStorage.setItem(DRAWER_EXPANDED_KEY, expanded ? '1' : '0'); } catch (e) {}
      }
    }

    if (drawerExpandBtn) {
      drawerExpandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setDrawerExpanded(!drawer.classList.contains('expanded'), true);
      });
    }

    try {
      // Padrão: expandido no desktop. Se o usuário já escolheu recolher
      // (valor '0' salvo), essa escolha é respeitada.
      const savedExpanded = localStorage.getItem(DRAWER_EXPANDED_KEY);
      const isDesktopDrawer = window.matchMedia('(min-width: 1024px)').matches;
      if (savedExpanded === '1' || (savedExpanded === null && isDesktopDrawer)) setDrawerExpanded(true, false);
    } catch (e) {
      if (window.matchMedia('(min-width: 1024px)').matches) setDrawerExpanded(true, false);
    }

    const drawerActiveInit = drawerTabs.find(t => t.classList.contains('active'));
    if (drawer) drawer.setAttribute('data-active-tab', drawerActiveInit ? drawerActiveInit.getAttribute('data-tab') : 'ranks');

    function switchDrawerTab(target, opts) {
      if (target === 'search' || (drawer && drawer.classList.contains('expanded'))) {
        // No mobile a montagem do carrossel espera a animação terminar.
        if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) {
          setTimeout(() => { try { initSearchMarquee(); } catch (e) {} }, 300);
        } else initSearchMarquee();
      }
      const tab = drawerTabs.find(t => t.getAttribute('data-tab') === target);
      if (!tab) return;
      // Define a ordem das colunas no modo expandido (desktop).
      if (drawer) drawer.setAttribute('data-active-tab', target);
      // Por padrão, trocar de aba foca o campo de busca (quando a aba for
      // "search"). Mas quando isso é chamado internamente pela restauração
      // de estado salvo (reload da página), NÃO queremos roubar o foco
      // sozinho — foi isso que fazia o cursor de digitação da busca
      // "piscar"/aparecer sem o usuário ter clicado em nada. Passe
      // { focus: false } nesses casos.
      const shouldFocus = !opts || opts.focus !== false;
      drawerTabs.forEach(t => {
        const active = t === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      drawerPanels.forEach(p => p.classList.toggle('active', p.getAttribute('data-panel') === target));
      if (drawerTitleEl && DRAWER_TAB_TITLES[target]) {
        drawerTitleEl.textContent = DRAWER_TAB_TITLES[target];
      }
      updateHeaderTriggerButtons(target);
      updateMobileBottomNav();
      // Garante que a aba recém-ativada fique totalmente visível, mesmo
      // se a barra de abas estiver rolada.
      const isMobileDrawer = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
      tab.scrollIntoView({ behavior: isMobileDrawer ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
      // Efeito colateral da aba de busca, que agora vive dentro deste
      // mesmo drawer (exposto via window.__ pela sua própria
      // inicialização, chamada mais abaixo no script).
      if (target === 'search' && shouldFocus && window.__onSearchTabActive) window.__onSearchTabActive();
      saveDrawerStateSoon();
    }

    drawerTabs.forEach(t => {
      const active = t.getAttribute('data-tab') === 'ranks';
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    drawerPanels.forEach(p => p.classList.toggle('active', p.getAttribute('data-panel') === 'ranks'));

    function openDrawer(tab, opts) {
      if (!drawer || !backdrop) return;
      if (drawerFrame) cancelAnimationFrame(drawerFrame);
      // Novo sorteio da prévia a cada abertura do drawer.
      if (!isDrawerOpen && window.__resetSearchPreviewShuffle) window.__resetSearchPreviewShuffle();
      isDrawerOpen = true;
      if (tab) {
        switchDrawerTab(tab, opts);
      } else {
        const activeTab = drawerTabs.find(t => t.classList.contains('active'));
        updateHeaderTriggerButtons(activeTab ? activeTab.getAttribute('data-tab') : 'ranks');
      }
      drawer.setAttribute('aria-hidden', 'false');
      // Fixar o body no mobile dispara um reflow grande antes da animação.
      // O backdrop já bloqueia a interação/rolagem do conteúdo de trás.
      drawerUsesScrollLock = !(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
      if (drawerUsesScrollLock) lockBodyScroll();

      drawerFrame = requestAnimationFrame(() => {
        drawer.classList.add('show');
        backdrop.classList.add('show');
        updateMobileBottomNav();
        drawerFrame = 0;
      });

      saveDrawerStateSoon();
    }

    // ── Prévia dos pôsteres da lista sob o mouse (só expandido + desktop) ──
    // Comando de barra equivalente a cada lista (mostrado apagado na
    // barra de pesquisa enquanto a prévia da lista está na tela).
    const HOVER_PREVIEW_COMMANDS = {
      all: '/ranking', romance: '/romance', isekai: '/isekai', sports: '/sport',
      comedy: '/comedy', mecha: '/mecha', watching: '/watching', plan: '/planwatch',
      incomplete: '/incomplete', announced: '/announced',
      favEpisodes: '/episodes', trueCharacters: '/characters'
    };
    let hoverPreviewEl = null;
    let hoverPreviewMode = '';
    let hoverPreviewTimer = 0;

    function canShowHoverPreview() {
      return drawer && drawer.classList.contains('expanded')
        && window.matchMedia('(min-width: 1024px)').matches;
    }

    function getHoverPreviewEl() {
      if (hoverPreviewEl) return hoverPreviewEl;
      const stage = drawer && drawer.querySelector('.search-stage');
      if (!stage) return null;
      hoverPreviewEl = document.createElement('div');
      hoverPreviewEl.className = 'search-hover-preview';
      // Antes dos resultados/lista de comandos, que ficam por cima dela.
      const resultsEl = stage.querySelector('.search-drawer-results');
      stage.insertBefore(hoverPreviewEl, resultsEl || null);
      return hoverPreviewEl;
    }

    let hoverPreviewHideTimer = 0;
    function cancelHoverPreviewHide() { clearTimeout(hoverPreviewHideTimer); }
    // Esconde com uma folga: dá tempo de o mouse cruzar a coluna do meio
    // e chegar nos cards da prévia sem ela sumir. Também cancela uma
    // troca de prévia ainda pendente (passou rápido por cima de outro item).
    function scheduleHoverPreviewHide(delay) {
      clearTimeout(hoverPreviewTimer);
      clearTimeout(hoverPreviewHideTimer);
      hoverPreviewHideTimer = setTimeout(hideHoverPreview, delay == null ? 420 : delay);
    }

    function hideHoverPreview() {
      clearTimeout(hoverPreviewTimer);
      clearTimeout(hoverPreviewHideTimer);
      hoverPreviewMode = '';
      if (hoverPreviewEl) hoverPreviewEl.classList.remove('is-on');
      if (drawer) drawer.classList.remove('is-hover-previewing');
      if (typeof window.__setSearchPreviewGhost === 'function') window.__setSearchPreviewGhost('');
    }

    function showHoverPreview(mode) {
      if (!mode || !canShowHoverPreview()) { hideHoverPreview(); return; }
      cancelHoverPreviewHide();
      if (mode === hoverPreviewMode) return;
      clearTimeout(hoverPreviewTimer);
      hoverPreviewTimer = setTimeout(() => {
        const el = getHoverPreviewEl();
        if (!el || !canShowHoverPreview()) return;
        if (typeof window.__buildSearchPreview !== 'function') return;
        const count = window.__buildSearchPreview(mode, el, (mode === 'trueCharacters' || mode === 'announced') ? 12 : 9);
        if (!count) { hideHoverPreview(); return; }
        hoverPreviewMode = mode;
        el.classList.add('is-on');
        drawer.classList.add('is-hover-previewing');
        if (typeof window.__setSearchPreviewGhost === 'function') {
          window.__setSearchPreviewGhost(HOVER_PREVIEW_COMMANDS[mode] || '');
        }
      }, 90);
    }

    function setDrawerHoverGlow(item) {
      if (!drawer) return;
      if (!item) {
        ['1','2','3'].forEach(n => drawer.style.removeProperty('--drawer-glow-' + n));
        hideHoverPreview();
        return;
      }
      showHoverPreview(item.getAttribute('data-mode'));
      const color = item.style.getPropertyValue('--cat-color') || getComputedStyle(item).getPropertyValue('--cat-color');
      if (!color || !color.trim()) return;
      const { r, g, b } = hexToRgb(color);
      drawer.style.setProperty('--drawer-glow-1', `rgba(${r}, ${g}, ${b}, 0.5)`);
      drawer.style.setProperty('--drawer-glow-2', `rgba(${r}, ${g}, ${b}, 0.3)`);
      drawer.style.setProperty('--drawer-glow-3', `rgba(${r}, ${g}, ${b}, 0.22)`);
    }

    function closeDrawer(skipScrollRestore) {
      if (!drawer || !backdrop) return;
      setDrawerHoverGlow(null);
      hideHoverPreview();
      if (drawerFrame) cancelAnimationFrame(drawerFrame);
      isDrawerOpen = false;
      drawer.classList.remove('show');
      backdrop.classList.remove('show');
      drawer.setAttribute('aria-hidden', 'true');
      updateHeaderTriggerButtons(null);
      updateMobileBottomNav();
      if (drawerUsesScrollLock) unlockBodyScroll(skipScrollRestore);
      drawerUsesScrollLock = false;
      if (window.__cancelPendingSearchFocus) window.__cancelPendingSearchFocus();
      const input = document.getElementById('searchDrawerInput');
      if (input) input.blur();
      saveDrawerStateSoon();

      // Se o drawer foi aberto pelo botão de busca do posterlightbox e o
      // usuário saiu sem escolher um resultado, volta pro posterlightbox.
      const posterReturn = window.__posterReturnAfterSearch;
      window.__posterReturnAfterSearch = null;
      if (posterReturn && typeof window.__reopenPosterAfterSearch === 'function') {
        window.__reopenPosterAfterSearch(posterReturn);
      }
    }

    // ── Salvamento/restauração do estado do drawer (aberto/fechado, aba
    // ativa e texto de busca). Guardado em local + sessionStorage (mesmo
    // padrão do scroll) pra sobreviver a um reload/atualização do site: se
    // o usuário estava com o drawer aberto numa aba, ele reabre do mesmo
    // jeito depois que a página recarrega. ──
    const DRAWER_STATE_KEY = 'myanimerank_drawerState';

    // Grava o estado (localStorage síncrono) só depois da animação do drawer,
    // para não roubar tempo do frame de abertura/fechamento.
    let __drawerSaveTimer = 0;
    function saveDrawerStateSoon() {
      clearTimeout(__drawerSaveTimer);
      __drawerSaveTimer = setTimeout(saveDrawerStateNow, 450);
    }

    function saveDrawerStateNow() {
      try {
        const activePanel = drawerPanels.find(p => p.classList.contains('active'));
        const tabName = activePanel ? activePanel.getAttribute('data-panel') : 'ranks';
        const searchInputEl = document.getElementById('searchDrawerInput');
        const state = {
          open: isDrawerOpen,
          tab: tabName,
          query: searchInputEl ? searchInputEl.value : ''
        };
        const json = JSON.stringify(state);
        localStorage.setItem(DRAWER_STATE_KEY, json);
        sessionStorage.setItem(DRAWER_STATE_KEY, json);
      } catch (e) {}
    }

    // O drawer NÃO reabre mais ao recarregar/reabrir o site: ele sempre
    // começa fechado. Só limpamos qualquer estado antigo salvo.
    function restoreDrawerState() {
      try {
        localStorage.removeItem(DRAWER_STATE_KEY);
        sessionStorage.removeItem(DRAWER_STATE_KEY);
      } catch (e) {}
    }

    // Mapa de qual aba do drawer ("ranks" ou "lists") contém cada
    // modo/categoria — usado para abrir o drawer sempre na aba certa
    // pra lista que está sendo exibida no momento, em vez de reabrir
    // simplesmente a última aba que ficou marcada como "active" no DOM
    // (o que fazia, por ex., a Watching Now abrir o drawer em "Ranks").
    const MODE_TAB = {
      all: 'ranks', romance: 'ranks', isekai: 'ranks', sports: 'ranks', comedy: 'ranks', mecha: 'ranks',
      watching: 'lists', plan: 'lists', incomplete: 'lists', announced: 'lists',
      favEpisodes: 'lists', trueCharacters: 'lists'
    };

    function createDrawerController() {
      if (drawer) {
        drawer.addEventListener('mouseover', (e) => {
          const item = e.target.closest && e.target.closest('.drawer-item:not([disabled])');
          if (item && drawer.contains(item)) setDrawerHoverGlow(item);
        });
        drawer.addEventListener('mouseout', (e) => {
          const from = e.target.closest && e.target.closest('.drawer-item');
          if (!from) return;
          const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.drawer-item:not([disabled])');
          if (to && drawer.contains(to)) return;
          setDrawerHoverGlow(null);
        });
        drawer.addEventListener('click', (e) => {
          if (e.target.closest && e.target.closest('.drawer-item')) setTimeout(() => { setDrawerHoverGlow(null); hideHoverPreview(); }, 0);
        });
      }
      filterBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isDrawerOpen) {
          closeDrawer();
        } else {
          openDrawer(MODE_TAB[currentCategory] || 'ranks');
        }
      });

      closeBtn.addEventListener('click', () => closeDrawer());
      backdrop.addEventListener('click', () => closeDrawer());

      if (resetBtnEl) {
        resetBtnEl.addEventListener('click', () => {
          const changed = currentCategory !== 'all';
          if (!changed) return;
          window.__posterReturnAfterSearch = null;

          currentCategory = 'all';

          try {
            const kS = 'myanimerank_scrollY_' + currentCategory;
            const kE = 'myanimerank_expanded_' + currentCategory;
            localStorage.removeItem(kS);
            sessionStorage.removeItem(kS);
            localStorage.removeItem(kE);
            sessionStorage.removeItem(kE);
          } catch(e) {}

          if (isDrawerOpen) closeDrawer();
          render();
          window.scrollTo({ top: 0, behavior: 'instant' });
        });
      }

      drawerTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          switchDrawerTab(tab.getAttribute('data-tab'));
        });
      });

      // ── Swipe (só no celular, via eventos de touch) para trocar de aba
      // dentro do drawer "You Decided That": arrastar p/ esquerda vai pra
      // próxima aba, arrastar p/ direita volta pra anterior.
      (function initDrawerTabSwipe() {
        const drawerContent = document.querySelector('#categoryDrawer .drawer-content');
        if (!drawerContent || drawerTabs.length < 2) return;

        const SWIPE_MIN_DIST = 55;      // distância horizontal mínima (px)
        const SWIPE_MAX_OFF_AXIS = 65;   // tolerância de desvio vertical (px)

        let startX = 0;
        let startY = 0;
        let tracking = false;

        drawerContent.addEventListener('touchstart', (e) => {
          if (e.touches.length !== 1) { tracking = false; return; }
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
          tracking = true;
        }, { passive: true });

        drawerContent.addEventListener('touchend', (e) => {
          if (!tracking) return;
          tracking = false;
          const touch = e.changedTouches && e.changedTouches[0];
          if (!touch) return;

          const deltaX = touch.clientX - startX;
          const deltaY = touch.clientY - startY;

          if (Math.abs(deltaX) < SWIPE_MIN_DIST) return;
          if (Math.abs(deltaY) > SWIPE_MAX_OFF_AXIS) return;

          const currentIndex = drawerTabs.findIndex(t => t.classList.contains('active'));
          if (currentIndex === -1) return;

          let nextIndex;
          if (deltaX < 0) {
            // Arrastou pra esquerda -> próxima aba
            nextIndex = currentIndex + 1;
          } else {
            // Arrastou pra direita -> aba anterior
            nextIndex = currentIndex - 1;
          }

          if (nextIndex < 0 || nextIndex >= drawerTabs.length) return;
          switchDrawerTab(drawerTabs[nextIndex].getAttribute('data-tab'));
        }, { passive: true });
      })();

      // ── Puxar para baixo no topo fecha o drawer (mobile) ──
      (function initDrawerPullToClose() {
        const drawerContent = document.querySelector('#categoryDrawer .drawer-content');
        if (!drawer || !drawerContent) return;

        const PULL_CLOSE_DISTANCE = 56;
        let startX = 0;
        let startY = 0;
        let pulling = false;
        let pullOffset = 0;
        let closingTimer = 0;

        const clearPullStyles = () => {
          drawer.classList.remove('mobile-pull-dragging', 'mobile-pull-rebounding', 'mobile-pull-closing', 'mobile-pull-closing-active');
          drawer.style.removeProperty('--drawer-pull-y');
          drawer.style.removeProperty('--drawer-pull-opacity');
        };

        const rebound = () => {
          drawer.classList.remove('mobile-pull-dragging');
          drawer.classList.add('mobile-pull-rebounding');
          drawer.style.removeProperty('--drawer-pull-y');
          drawer.style.removeProperty('--drawer-pull-opacity');
          window.setTimeout(() => drawer.classList.remove('mobile-pull-rebounding'), 240);
        };

        drawer.addEventListener('touchstart', (e) => {
          if (!drawer.classList.contains('show') || !window.matchMedia('(max-width: 760px)').matches || e.touches.length !== 1) return;
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
          pulling = false;
          pullOffset = 0;
        }, { capture: true, passive: true });

        drawer.addEventListener('touchmove', (e) => {
          if (!drawer.classList.contains('show') || !window.matchMedia('(max-width: 760px)').matches || e.touches.length !== 1) return;
          const dx = e.touches[0].clientX - startX;
          const dy = e.touches[0].clientY - startY;
          if (drawerContent.scrollTop > 1 || dy <= 0 || dy <= Math.abs(dx)) return;

          e.preventDefault();
          e.stopPropagation();
          pulling = true;
          pullOffset = Math.min(dy * 0.72, 112);
          drawer.classList.remove('mobile-pull-rebounding');
          drawer.classList.add('mobile-pull-dragging');
          drawer.style.setProperty('--drawer-pull-y', `${pullOffset}px`);
          drawer.style.setProperty('--drawer-pull-opacity', String(Math.max(0.72, 1 - pullOffset / 440)));
        }, { capture: true, passive: false });

        drawer.addEventListener('touchend', (e) => {
          if (!pulling) return;
          e.stopPropagation();
          pulling = false;
          if (pullOffset < PULL_CLOSE_DISTANCE) {
            rebound();
            return;
          }
          if (closingTimer) return;
          drawer.classList.remove('mobile-pull-dragging', 'mobile-pull-rebounding');
          drawer.classList.add('mobile-pull-closing');
          requestAnimationFrame(() => drawer.classList.add('mobile-pull-closing-active'));
          closingTimer = window.setTimeout(() => {
            closingTimer = 0;
            clearPullStyles();
            closeDrawer();
          }, 290);
        }, { capture: true, passive: true });
      })();

      drawerItems.forEach(item => {
        item.addEventListener('click', () => {
          window.__posterReturnAfterSearch = null;
          const mode = item.getAttribute('data-mode');
          
          if (currentCategory !== mode) {
            if (window.__isReleaseCalendarMode && window.__isReleaseCalendarMode()) {
              window.__setReleaseCalendarMode(false, { keepScroll: true });
            }
            currentCategory = mode;
            
            try {
              const kS = 'myanimerank_scrollY_' + currentCategory;
              const kE = 'myanimerank_expanded_' + currentCategory;
              localStorage.removeItem(kS);
              sessionStorage.removeItem(kS);
              localStorage.removeItem(kE);
              sessionStorage.removeItem(kE);
            } catch(e) {}
            
            render();
            window.scrollTo({ top: 0, behavior: 'instant' });
          }
          closeDrawer();
        });
      });

      // Os três atalhos de lista reaproveitam exatamente o clique dos
      // itens correspondentes do drawer, mantendo hash, scroll e render.
      mobileBottomNavButtons
        .filter(button => button.hasAttribute('data-mobile-mode'))
        .forEach(button => {
          button.addEventListener('click', () => {
            const mode = button.getAttribute('data-mobile-mode');
            const targetItem = drawerItems.find(item => item.getAttribute('data-mode') === mode);
            if (targetItem) targetItem.click();
          });
        });

      // Search e Menu são tratados no próprio nav, em captura, para que
      // nenhum elemento interno do ícone/label intercepte o toque. A
      // decisão de alternar usa o estado VISUAL real do drawer, evitando
      // qualquer dessincronia da variável isDrawerOpen.
      if (mobileBottomNavEl) {
        mobileBottomNavEl.addEventListener('click', (event) => {
          const button = event.target.closest('.mobile-nav-btn[data-mobile-action]');
          if (!button || !mobileBottomNavEl.contains(button)) return;

          event.preventDefault();
          event.stopPropagation();

          const action = button.getAttribute('data-mobile-action');
          const drawerIsVisible = drawer.classList.contains('show')
            && drawer.getAttribute('aria-hidden') === 'false';
          const activePanel = document.querySelector('#categoryDrawer .drawer-panel.active');
          const activeTab = activePanel ? activePanel.getAttribute('data-panel') : '';

          if (action === 'search') {
            if (drawerIsVisible && activeTab === 'search') {
              closeDrawer();
            } else {
              openDrawer('search', { focus: true });
            }
            return;
          }

          if (action === 'calendar') {
            const calendarBtn = document.getElementById('calendarBtn');
            if (calendarBtn && currentCategory === 'watching') calendarBtn.click();
            return;
          }

          if (action === 'menu') {
            if (drawerIsVisible && activeTab !== 'search') {
              closeDrawer();
            } else {
              openDrawer(MODE_TAB[currentCategory] || 'ranks', { focus: false });
            }
          }
        }, true);
      }
    }

    const __filteredListCache = new Map();
    function getFilteredData(mode) {
      if (!__filteredListCache.has(mode)) __filteredListCache.set(mode, computeFilteredData(mode));
      return __filteredListCache.get(mode);
    }
    function computeFilteredData(mode) {
      if (mode === 'all') {
        return animeData.filter(a => !planIds.has(a.id));
      } else if (mode === 'romance') {
        const romanceSet = new Set(romanceIds);
        return animeData.filter(a => romanceSet.has(a.id) && !planIds.has(a.id));
      } else if (mode === 'isekai') {
        const isekaiSet = new Set(isekaiIds);
        return animeData.filter(a => isekaiSet.has(a.id) && !planIds.has(a.id));
      } else if (mode === 'incomplete') {
        return animeData.filter(anime => anime.info && anime.info.includes('⏸') && !planIds.has(anime.id));
      } else if (mode === 'plan') {
        return planToWatchData;
      } else if (mode === 'watching') {
        return watchingData;
      } else if (mode === 'sports') {
        const sportsSet = new Set(sportsIds);
        return animeData.filter(a => sportsSet.has(a.id) && !planIds.has(a.id));
      } else if (mode === 'comedy') {
        const comedySet = new Set(comedyIds);
        return animeData.filter(a => comedySet.has(a.id) && !planIds.has(a.id));
      } else if (mode === 'mecha') {
        const mechaSet = new Set(mechaIds);
        return animeData.filter(a => mechaSet.has(a.id) && !planIds.has(a.id));
      } else if (mode === 'announced') {
        const watchedAnnounced = animeData.filter(a => nextSeasonMap[a.id] && !planIds.has(a.id));
        // Quando o anime já existe no All Ranking, essa é a entrada
        // canônica para Announced Sequels. A temporada atual continua
        // normalmente em Watching Now, mas não duplica o card aqui
        // (casos como Kingdom e DanMachi).
        const watchedAnnouncedIds = new Set(watchedAnnounced.map(a => a.id));
        const watchingAnnounced = watchingData.filter(a =>
          nextSeasonMap[a.id] && !watchedAnnouncedIds.has(a.id)
        );
        const planAnnounced = planToWatchData.filter(a => nextSeasonMap[a.id]);
        // Ordena pela mesma sequência das chaves em nextSeasonMap, em vez
        // da ordem original de animeData/watchingData/planToWatchData.
        const nextSeasonOrder = Object.keys(nextSeasonMap);
        const byNextSeasonOrder = (a, b) => nextSeasonOrder.indexOf(a.id) - nextSeasonOrder.indexOf(b.id);
        watchedAnnounced.sort(byNextSeasonOrder);
        watchingAnnounced.sort(byNextSeasonOrder);
        planAnnounced.sort(byNextSeasonOrder);
        return [...watchedAnnounced, ...watchingAnnounced, ...planAnnounced];
      } else if (mode === 'favEpisodes') {
        return (typeof favoriteEpisodesData !== 'undefined' && Array.isArray(favoriteEpisodesData))
          ? favoriteEpisodesData
          : [];
      } else if (mode === 'trueCharacters') {
        return (typeof trueCharactersData !== 'undefined' && Array.isArray(trueCharactersData))
          ? trueCharactersData
          : [];
      }
      return [];
    }

    let __lastWarmCategory = '';
    function warmCategoryOnIntent(event) {
      const button = event.target.closest('.drawer-item[data-mode]');
      const mode = button && button.getAttribute('data-mode');
      if (!mode || mode === currentCategory || mode === __lastWarmCategory
          || mode === 'announced' || mode === 'favEpisodes') return;
      if (navigator.connection && navigator.connection.saveData) return;
      __lastWarmCategory = mode;
      const mobile = window.matchMedia('(max-width: 600px)').matches;
      // Todas as listas usam o mesmo aquecimento leve do Plan to Watch.
      getFilteredData(mode).slice(0, 6).forEach(anime => {
        const src = mobile ? mobileCardSearchThumbSrc(anime.img) : anime.img;
        if (src) preloadLightboxPoster(src, 'low');
      });
    }
    document.addEventListener('pointerover', warmCategoryOnIntent, { passive: true });
    document.addEventListener('pointerdown', warmCategoryOnIntent, { passive: true });

    function updateDrawerCounts() {
      document.querySelectorAll('[data-count-mode]').forEach(el => {
        const mode = el.getAttribute('data-count-mode');
        const n = getFilteredData(mode).length;
        el.textContent = n + (n === 1 ? ' item' : ' items');
      });
    }

    function renderWatchingList(data) {
      const groups = {};
      const noSeason = [];

      data.forEach(anime => {
        const key = anime.season || null;
        if (key) {
          (groups[key] = groups[key] || []).push(anime);
        } else {
          noSeason.push(anime);
        }
      });

      const seasonKeys = Object.keys(groups).sort((a, b) => {
        const ia = WATCHING_SEASON_ORDER.indexOf(a);
        const ib = WATCHING_SEASON_ORDER.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return -1;
        if (ib === -1) return 1;
        return ia - ib;
      });

      let html = '';

      if (noSeason.length) {
        html += `<li class="season-header season-header-novisual" data-season="__no-season__" style="--season-color: ${WATCHING_NO_SEASON_LABEL.color};">
                  <span class="season-text">${WATCHING_NO_SEASON_LABEL.text}</span>
                  <div class="season-line"></div>
                </li>`;
        html += noSeason.map(anime => createAnimeCard(anime, 'watching', WATCHING_NO_SEASON_LABEL.color)).join('');
      }

      seasonKeys.forEach(key => {
        const seasonObj = WATCHING_SEASON_LABELS[key] || { text: key, color: "var(--muted)" };
        // Nota: não dá pra usar escapeHtml() aqui — é local a outro
        // escopo do arquivo e não existe dentro de renderWatchingList
        // (mesmo bug documentado no escapeHtml duplicado da busca).
        const escSeason = str => String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        const seasonTextHtml = seasonObj.url
          ? `<a class="season-text season-text-link" href="${escSeason(seasonObj.url)}" target="_blank" rel="noopener">${escSeason(seasonObj.text)}</a>`
          : `<span class="season-text">${escSeason(seasonObj.text)}</span>`;
        html += `<li class="season-header" data-season="${key}" style="--season-color: ${seasonObj.color};">
                  ${seasonTextHtml}
                  <div class="season-line"></div>
                </li>`;
        html += groups[key].map(anime => createAnimeCard(anime, 'watching', seasonObj.color)).join('');
      });

      return html;
    }

    function renderAnnouncedList(data) {
      const watchedList = [];
      const watchingList = [];
      const planningList = [];

      data.forEach(anime => {
        // Classifica pela origem real do objeto, não apenas pelo ID.
        // Um anime pode ter o mesmo ID no MyRanks e no Watching Now
        // (como DanMachi): a entrada de 4 temporadas pertence ao
        // MyRanks, enquanto a de 5ª temporada pertence ao Watching Now.
        if (watchingData.includes(anime)) {
          watchingList.push(anime);
        } else if (planToWatchData.includes(anime)) {
          planningList.push(anime);
        } else {
          watchedList.push(anime);
        }
      });

      let html = '';

      if (watchedList.length) {
        const g = ANNOUNCED_GROUP_LABELS.watched;
        // Mesmo comportamento dos cabeçalhos de temporada do Watching Now:
        // se o grupo tem "url", o título vira um link que abre em nova aba.
        const watchedTextHtml = g.url
          ? `<a class="season-text season-text-link" href="${g.url}" target="_blank" rel="noopener">${g.text}</a>`
          : `<span class="season-text">${g.text}</span>`;
        html += `<li class="season-header" style="--season-color: ${g.color};">
                  ${watchedTextHtml}
                  <div class="season-line"></div>
                </li>`;
        html += watchedList.map(anime => createAnimeCard(anime, 'announced', g.color)).join('');
      }

      if (watchingList.length) {
        const g = ANNOUNCED_GROUP_LABELS.watching;
        html += `<li class="season-header" style="--season-color: ${g.color};">
                  <span class="season-text">${g.text}</span>
                  <div class="season-line"></div>
                </li>`;
        html += watchingList.map(anime => createAnimeCard(anime, 'announced-unwatched', g.color)).join('');
      }

      if (planningList.length) {
        const g = ANNOUNCED_GROUP_LABELS.planning;
        html += `<li class="season-header" style="--season-color: ${g.color};">
                  <span class="season-text">${g.text}</span>
                  <div class="season-line"></div>
                </li>`;
        html += planningList.map(anime => createAnimeCard(anime, 'announced-unwatched', g.color)).join('');
      }

      return html;
    }

    // ── Card diferenciado da lista "Peak Episodes" ──
    // "rank" aqui já vem calculado com empate considerado (ex: 1, 1, 3 —
    // ver renderFavoriteEpisodesList), não é mais o índice puro do array.
    function createFavoriteEpisodeCard(ep, rank = null, dataIndex = null) {
      if (!ep) return '';

      const topRankClass = rank === 1 ? ' rank-gold'
        : rank === 2 ? ' rank-silver'
        : rank === 3 ? ' rank-bronze'
        : '';

      // Galeria de imagens do carrossel: usa "ep.images" (array) se existir,
      // senão cai pra imagem única "ep.img". Com 2+ imagens, mostra as
      // mini-thumbnails com setas de navegação; com 1 só, mostra a imagem
      // grande sem carrossel.
      const gallery = Array.isArray(ep.images) && ep.images.length
        ? ep.images
        : (ep.img ? [ep.img] : []);
      const hasGallery = gallery.length > 1;
      const galleryAttr = hasGallery
        ? ` data-gallery='${JSON.stringify(gallery).replace(/'/g, "&apos;")}'`
        : '';

      // Índice inicial do carrossel: só marcamos uma miniatura como ativa
      // se a imagem grande (ep.img, ou gallery[0] na ausência dele) for
      // de fato uma das imagens do array "gallery". Muitas vezes ep.img é
      // uma capa/arte que não está entre as miniaturas — nesse caso nenhuma
      // fica marcada como selecionada até o usuário clicar numa.
      const initialSrc = ep.img || gallery[0] || '';
      const initialIndex = gallery.indexOf(initialSrc);

      const thumbsHtml = hasGallery
        ? gallery.map((src, i) => `
              <button type="button" class="fav-ep-thumb${i === initialIndex ? ' is-active' : ''}" data-index="${i}" aria-label="Ver imagem ${i + 1}">
                <img src="${src}" alt="" loading="lazy" decoding="async">
              </button>`).join('')
        : '';

      const thumbnavHtml = hasGallery ? `
            <div class="fav-ep-thumbnav">
              <button type="button" class="fav-ep-thumbnav-arrow fav-ep-thumbnav-prev" aria-label="Imagem anterior">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>
              </button>
              <div class="fav-ep-thumbstrip">${thumbsHtml}</div>
              <button type="button" class="fav-ep-thumbnav-arrow fav-ep-thumbnav-next" aria-label="Próxima imagem">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"></path></svg>
              </button>
            </div>` : '';

      // Contador "posição atual/total" sobreposto no canto da imagem grande,
      // ex: "1/5". Só aparece quando há um carrossel de fato (2+ imagens).
      const counterHtml = hasGallery
        ? `<span class="fav-ep-counter">${(initialIndex === -1 ? 1 : initialIndex + 1)}/${gallery.length}</span>`
        : '';

      // Selo de nota estilo IMDb — só aparece se "ep.rating" for definido.
      // Se "ep.imdbUrl" existir, o selo vira um link pra página do episódio no IMDb.
      const ratingInner = `<span class="fav-ep-rating-source">IMDb</span>
            <span class="fav-ep-rating-value">${ep.rating}<span class="fav-ep-rating-max">/10</span></span>`;
      const ratingHtml = (ep.rating !== undefined && ep.rating !== null && ep.rating !== '')
        ? (ep.imdbUrl
            ? `<a class="fav-ep-rating" href="${ep.imdbUrl}" target="_blank" rel="noopener">${ratingInner}</a>`
            : `<div class="fav-ep-rating">${ratingInner}</div>`)
        : '';

      // MNP = Minha Nota Pessoal
      // Selo com a nota pessoal (minha nota), sempre em /10, exibido antes do selo do IMDb.
      const myRatingHtml = (ep.myRating !== undefined && ep.myRating !== null && ep.myRating !== '')
        ? `<div class="fav-ep-my-rating">
            <span class="fav-ep-my-rating-source">MNP</span>
            <span class="fav-ep-my-rating-value">${ep.myRating}<span class="fav-ep-my-rating-max">/10</span></span>
          </div>`
        : '';

      // Botão do Crunchyroll, ao lado do selo do IMDb: no PC é só a logo,
      // no mobile a logo vem acompanhada do ícone de link externo (ver
      // CSS .fav-ep-crunchyroll-btn, que já cuida de esconder o svg no PC).
      const crunchyrollHtml = ep.crunchyrollUrl
        ? `<a class="fav-ep-crunchyroll-btn" href="${ep.crunchyrollUrl}" target="_blank" rel="noopener">
            <img class="fav-ep-crunchyroll-logo" src="assets/logos/crunchyroll.webp" alt="Crunchyroll" loading="lazy" decoding="async">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path></svg>
          </a>`
        : '';

      // Monta a linha de selos na ordem MNP -> IMDb -> Crunchyroll, sem separador "//" entre eles.
      const ratingRowParts = [myRatingHtml, ratingHtml, crunchyrollHtml].filter(Boolean);
      const ratingRowHtml = ratingRowParts.length
        ? `<div class="fav-ep-rating-row">${ratingRowParts.join('')}</div>`
        : '';

      return `
        <li class="fav-ep-card${topRankClass}" id="${ep.id || ''}" data-fav-ep-index="${dataIndex == null ? '' : dataIndex}"${galleryAttr} style="--item-hover-color: #3b82f6;">
          <div class="fav-ep-ambient" aria-hidden="true"></div>
          <div class="fav-ep-ambient-shade" aria-hidden="true"></div>
          <div class="fav-ep-media">
            <div class="poster-wrap fav-ep-media-main">
              <img class="thumb fav-ep-main-img" data-src="${ep.img || gallery[0] || ''}" alt="${ep.anime || ''} - ${ep.episodeLabel || ''}" decoding="async">
              <div class="poster-fallback" aria-hidden="true"></div>
              ${counterHtml}
            </div>
            ${thumbnavHtml}
          </div>
          <div class="fav-ep-content">
            <div class="fav-ep-heading">
              <h3 class="fav-ep-anime"><span class="fav-ep-rank" aria-label="Posição ${rank != null ? rank : ''}">${rank != null ? `#${rank}` : ''}</span>${ep.anime || ''}</h3>
              <span class="fav-ep-episode">${ep.episodeLabel || ''}</span>
            </div>
            ${ratingRowHtml}
            <p class="fav-ep-note">${ep.note ? `<span class="fav-ep-quote-mark" aria-hidden="true">&ldquo;</span>${ep.note}<span class="fav-ep-quote-mark fav-ep-quote-mark-end" aria-hidden="true">&rdquo;</span>` : ''}</p>
          </div>
        </li>
      `;
    }

    // Calcula a posição de cada episódio levando em conta empate de MNP
    // (minha nota pessoal): quando dois episódios seguidos têm a mesma
    // MNP, os dois recebem a mesma posição (ex: os dois em "#1"), e o
    // próximo episódio com nota diferente pula pra posição real dele
    // (ex: "#3", nunca "#2") — é o chamado ranking "1224".
    // Presume que "data" já está ordenado da maior MNP pra menor.
    function computeFavEpisodeRanks(data) {
      const ranks = [];
      let lastRating = null;
      let lastRank = 0;
      data.forEach((ep, idx) => {
        const rating = (ep.myRating !== undefined && ep.myRating !== null && ep.myRating !== '')
          ? ep.myRating
          : null;
        if (rating !== null && rating === lastRating) {
          ranks.push(lastRank);
        } else {
          const rank = idx + 1;
          ranks.push(rank);
          lastRank = rank;
          lastRating = rating;
        }
      });
      return ranks;
    }

    function renderFavoriteEpisodesList(data) {
      if (!data.length) {
        return `<li class="fav-ep-empty">
          Nenhum episódio favorito adicionado ainda.<br>
          Abra o <code>index.html</code> no VSCode e preencha o array
          <code>favoriteEpisodesData</code> com os seus.
        </li>`;
      }
      const ranks = computeFavEpisodeRanks(data);
      return data.map((ep, idx) => createFavoriteEpisodeCard(ep, ranks[idx], idx)).join('');
    }


    // ── Carrossel de mini-thumbnails do card de episódio favorito ──
    // Troca a imagem grande ao clicar nas setas ‹ › ou numa das thumbnails,
    // sem disparar o clique do card (que abre o link em outra aba).
    function attachFavEpisodeGalleryControls() {
      document.querySelectorAll('.fav-ep-card[data-gallery]').forEach(card => {
        if (card.dataset._galleryAttached === '1') return;
        card.dataset._galleryAttached = '1';

        let gallery = [];
        try { gallery = JSON.parse(card.getAttribute('data-gallery')); } catch (e) {}
        if (!Array.isArray(gallery) || gallery.length < 2) return;

        const mainImg = card.querySelector('.fav-ep-main-img');
        const counterEl = card.querySelector('.fav-ep-counter');
        const thumbs = Array.from(card.querySelectorAll('.fav-ep-thumb'));
        const thumbstrip = card.querySelector('.fav-ep-thumbstrip');
        const ambient = card.querySelector('.fav-ep-ambient');
        const activeIdx = thumbs.findIndex(t => t.classList.contains('is-active'));
        // -1 quando nenhuma thumb começa ativa (capa não faz parte da
        // galeria): assim a 1ª clicada em "próxima" cai no índice 0, e em
        // "anterior" cai na última — em vez de pular a 2ª imagem.
        let index = activeIdx;

        // Guarda a imagem "comprometida" (a que fica de fato selecionada,
        // por clique ou pela capa inicial) pra poder voltar pra ela quando
        // o mouse sai de uma miniatura, depois de um hover de preview.
        let committedSrc = mainImg ? mainImg.getAttribute('data-src') : '';

        // Troca o wallpaper borrado do card junto com a imagem principal.
        // Mantém o estado "ready" mesmo se o carrossel emitir um evento
        // de scroll ao centralizar a miniatura selecionada.
        function setAmbient(src) {
          if (!ambient || !src) return;
          ambient.dataset.paintedSource = src;
          ambient.classList.remove('ambient-baked');
          ambient.style.backgroundImage = `url("${src}")`;
          ambient.classList.add('ready');
        }

        function setMainImage(src) {
          if (!mainImg || !src) return;
          mainImg.setAttribute('data-src', src);
          mainImg.dataset.ambientSource = src;
          mainImg.src = src;
          setAmbient(src);
        }

        function goTo(i) {
          index = ((i % gallery.length) + gallery.length) % gallery.length;
          committedSrc = gallery[index];
          setMainImage(committedSrc);
          if (counterEl) counterEl.textContent = `${index + 1}/${gallery.length}`;
          thumbs.forEach((t, idx) => t.classList.toggle('is-active', idx === index));

          // Desliza a tira suavemente até a miniatura ativa quando ela
          // estiver fora da área visível, criando o efeito de carrossel.
          const activeThumb = thumbs[index];
          if (activeThumb && thumbstrip) {
            activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          }
        }

        thumbs.forEach((t, idx) => {
          t.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            goTo(idx);
          });

          // Preview ao passar o mouse: só troca a <img> grande, sem mexer
          // no índice/seleção nem na miniatura marcada como ativa.
          t.addEventListener('mouseenter', () => {
            setMainImage(gallery[idx]);
          });
          t.addEventListener('mouseleave', () => {
            setMainImage(committedSrc);
          });
        });

        const prevBtn = card.querySelector('.fav-ep-thumbnav-prev');
        const nextBtn = card.querySelector('.fav-ep-thumbnav-next');
        if (prevBtn) prevBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); goTo(index - 1); });
        if (nextBtn) nextBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); goTo(index + 1); });

        // ── Swipe (arrastar o dedo) na imagem grande — mobile ──
        // Arrastar pra esquerda avança pra próxima imagem, pra direita
        // volta pra anterior, igual às setas ‹ ›.
        const mediaMain = card.querySelector('.fav-ep-media-main');
        if (mediaMain) {
          const SWIPE_MIN_DISTANCE = 40;   // px mínimos no eixo X
          const SWIPE_MAX_OFF_AXIS = 60;   // tolerância no eixo Y
          const SWIPE_MAX_TIME = 600;      // ms
          let touchStartX = 0;
          let touchStartY = 0;
          let touchStartTime = 0;
          let touching = false;

          mediaMain.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
            touching = true;
          }, { passive: true });

          mediaMain.addEventListener('touchend', (e) => {
            if (!touching) return;
            touching = false;

            const touch = e.changedTouches[0];
            const dx = touch.clientX - touchStartX;
            const dy = touch.clientY - touchStartY;
            const dt = Date.now() - touchStartTime;

            if (dt > SWIPE_MAX_TIME) return;
            if (Math.abs(dy) > SWIPE_MAX_OFF_AXIS) return;
            if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return;

            e.preventDefault();
            e.stopPropagation();

            if (dx < 0) {
              goTo(index + 1); // arrastou pra esquerda = próxima imagem
            } else {
              goTo(index - 1); // arrastou pra direita = imagem anterior
            }
          });
        }
      });

      sizeAllFavEpThumbstrips();
    }

    // Trava a largura do carrossel de mini-thumbnails para caber SOMENTE
    // miniaturas inteiras — nunca deixa uma parcialmente cortada na borda.
    // Recalcula quantas thumbs (92px + 7px de gap, ou 62px no mobile) cabem
    // no espaço disponível e limita a largura do container a esse valor
    // exato, escondendo (via overflow) qualquer sobra incompleta.
    function sizeFavEpThumbstrip(strip) {
      const thumbs = strip.querySelectorAll('.fav-ep-thumb');
      if (thumbs.length < 2) return;

      // Libera a largura antes de medir, senão uma restrição aplicada
      // numa medição anterior distorceria a próxima leitura.
      strip.style.maxWidth = 'none';
      void strip.offsetWidth; // força reflow

      const thumbWidth = thumbs[0].getBoundingClientRect().width;
      const available = strip.clientWidth;
      if (!thumbWidth || !available) return;

      const cs = getComputedStyle(strip);
      const gap = parseFloat(cs.columnGap) || parseFloat(cs.gap) || 7;

      const count = Math.max(1, Math.floor((available + gap) / (thumbWidth + gap)));
      const exactWidth = count * thumbWidth + Math.max(0, count - 1) * gap;
      strip.style.maxWidth = exactWidth + 'px';
    }

    function sizeAllFavEpThumbstrips() {
      document.querySelectorAll('.fav-ep-thumbstrip').forEach(sizeFavEpThumbstrip);
    }

    let __favEpResizeTO = null;
    window.addEventListener('resize', () => {
      clearTimeout(__favEpResizeTO);
      __favEpResizeTO = setTimeout(sizeAllFavEpThumbstrips, 150);
    }, { passive: true });

    const __listDomCache = new Map();
    const __rankingInitialRenderLimit = 30;

    function balanceTrueCharacterCardLines(root = document) {
      root.querySelectorAll('ol.category-trueCharacters li.anime-item').forEach(card => {
        const characterName = card.querySelector('.title-anime');
        if (!characterName) return;

        // Mede o nome sem depender do tamanho fixo da fonte. Acima de
        // uma linha, a obra fica limitada a uma; caso contrário, pode
        // usar as duas linhas que sobraram.
        card.classList.remove('true-character-name-two-lines');
        const styles = getComputedStyle(characterName);
        const lineHeight = parseFloat(styles.lineHeight);
        const usesTwoLines = Number.isFinite(lineHeight)
          && characterName.getBoundingClientRect().height > lineHeight * 1.45;
        card.classList.toggle('true-character-name-two-lines', usesTwoLines);
      });
    }

    let __trueCharacterBalanceResizeTO = null;
    window.addEventListener('resize', () => {
      clearTimeout(__trueCharacterBalanceResizeTO);
      __trueCharacterBalanceResizeTO = setTimeout(() => {
        balanceTrueCharacterCardLines(document);
      }, 100);
    }, { passive: true });

    // ── Troca de "área de trabalho" entre todas as listas ──
    // A lista antiga desliza pra fora e a nova entra pelo lado oposto, como
    // trocar de desktop virtual. A direção segue a ordem das setas do teclado
    // (a mesma ordem do swipe no mobile).
    const WORKSPACE_MODES = ['all', 'watching', 'plan'];
    let __lastRenderedCategory = null;
    let __workspaceAnimCleanup = null;
    // Direção imposta por quem trocou a lista (seta/swipe): +1 = nova lista
    // entra pela direita (seta →), -1 = entra pela esquerda (seta ←).
    // Assim a direção segue sempre a tecla, mesmo quando a ordem dá a volta
    // (ex.: All → Plan com →). 0 = deduz pela ordem das listas (drawer/menu).
    let __forcedSlideDir = 0;

    function getWorkspaceSlideDirection(from, to) {
      if (!from || !to || from === to) return 0;
      // Entre as 3 listas principais vale a ordem das setas/swipe.
      if (WORKSPACE_MODES.includes(from) && WORKSPACE_MODES.includes(to)) {
        const order = window.matchMedia('(max-width: 760px)').matches
          ? MOBILE_SWIPE_NAV_ORDER
          : ARROW_NAV_ORDER;
        const a = order.indexOf(from), b = order.indexOf(to);
        if (a !== -1 && b !== -1) return b > a ? 1 : -1;
      }
      // Qualquer outra lista: segue a ordem em que aparecem no drawer
      // (para baixo = entra pela direita, para cima = pela esquerda).
      const drawerOrder = drawerItems.map(el => el.getAttribute('data-mode'));
      const a = drawerOrder.indexOf(from), b = drawerOrder.indexOf(to);
      if (a === -1 || b === -1) return 1;
      return b > a ? 1 : -1;
    }

    function playWorkspaceSwitch(oldList, newList, dir) {
      if (!oldList || !newList || !dir || !container.animate) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (__workspaceAnimCleanup) __workspaceAnimCleanup();

      const ghost = oldList.cloneNode(true);
      ghost.removeAttribute('id');
      ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      ghost.setAttribute('aria-hidden', 'true');
      ghost.setAttribute('inert', '');
      ghost.style.cssText += ';position:absolute;top:0;left:0;width:' + container.clientWidth + 'px;pointer-events:none;';

      const prevPosition = container.style.position;
      const prevOverflowX = container.style.overflowX;
      container.style.position = 'relative';
      container.style.overflowX = 'clip';
      container.appendChild(ghost);

      // Clone leve: descarta os cards que estão bem abaixo da área visível
      // (ninguém vê isso durante a animação) pra não pesar em listas grandes.
      try {
        const limitY = window.innerHeight + 300;
        const kids = Array.from(ghost.children);
        const tops = kids.map(k => k.getBoundingClientRect().top);
        for (let i = kids.length - 1; i >= 0 && tops[i] > limitY; i--) kids[i].remove();
      } catch (e) {}

      const opts = { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' };
      const outAnim = ghost.animate([
        { transform: 'translateX(0) scale(1)', opacity: 1 },
        { transform: `translateX(${-dir * 100}%) scale(0.96)`, opacity: 0 }
      ], opts);
      const inAnim = newList.animate([
        { transform: `translateX(${dir * 100}%) scale(0.96)`, opacity: 0 },
        { transform: 'translateX(0) scale(1)', opacity: 1 }
      ], opts);

      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        try { outAnim.cancel(); } catch (e) {}
        try { inAnim.cancel(); } catch (e) {}
        if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
        container.style.position = prevPosition;
        container.style.overflowX = prevOverflowX;
        if (__workspaceAnimCleanup === cleanup) __workspaceAnimCleanup = null;
      };
      __workspaceAnimCleanup = cleanup;
      inAnim.onfinish = cleanup;
      inAnim.oncancel = cleanup;
    }

    function render() {
      if (__cancelScrollRestore) __cancelScrollRestore();
      __posterRenderGeneration++;
      __posterLoadJobs.length = 0;
      __posterOptimizeJobs.forEach(job => { delete job.img.dataset.cardOptimizing; });
      __posterOptimizeJobs.length = 0;
      if (__posterOptimizeResumeTimer) {
        clearTimeout(__posterOptimizeResumeTimer);
        __posterOptimizeResumeTimer = 0;
      }
      // Todas as listas usam o mesmo processamento das capas.
      __posterOptimizePausedUntil = 0;
      if (posterObserver) posterObserver.disconnect();
      if (ambientVisibilityObserver) ambientVisibilityObserver.disconnect();
      const mobile = window.matchMedia('(max-width: 600px)').matches;
      const dynamic = currentCategory === 'watching' || currentCategory === 'announced';
      const key = currentCategory + ':' + mobile + ':' + (dynamic ? __watchProgressRevision : 0);
      let list = __listDomCache.get(key);
      const reused = !!list;
      if (reused) __listDomCache.delete(key);
      else {
        list = document.createElement('ol');
        list.id = 'animeRankingList';
        list.className = 'ranking ' + (currentCategory === 'favEpisodes' ? 'mode-fav-episodes' : 'mode-true-characters') + ' category-' + currentCategory;
        const data = getFilteredData(currentCategory);
        const usesStandardCards = currentCategory !== 'watching'
          && currentCategory !== 'announced'
          && currentCategory !== 'favEpisodes';
        const shouldDeferCards = usesStandardCards && data.length > __rankingInitialRenderLimit;
        if (shouldDeferCards) {
          list.__deferredRankingData = data;
          list.__deferredRankingMode = currentCategory;
        }
        const renderedData = shouldDeferCards
          ? data.slice(0, __rankingInitialRenderLimit)
          : data;
        list.innerHTML = currentCategory === 'watching' ? renderWatchingList(data)
          : currentCategory === 'announced' ? renderAnnouncedList(data)
          : currentCategory === 'favEpisodes' ? renderFavoriteEpisodesList(data)
          : renderedData.map((anime, idx) => createAnimeCard(anime, currentCategory, null, idx)).join('');
      }
      __listDomCache.set(key, list);
      while (__listDomCache.size > 4) __listDomCache.delete(__listDomCache.keys().next().value);
      const __prevList = container.firstElementChild;
      let __slideDir = getWorkspaceSlideDirection(__lastRenderedCategory, currentCategory);
      if (__slideDir !== 0 && __forcedSlideDir !== 0) __slideDir = __forcedSlideDir;
      __forcedSlideDir = 0;
      if (__workspaceAnimCleanup && __slideDir === 0) __workspaceAnimCleanup();
      if (container.firstElementChild !== list) container.replaceChildren(list);
      if (__slideDir && __prevList && __prevList !== list) playWorkspaceSwitch(__prevList, list, __slideDir);
      __lastRenderedCategory = currentCategory;
      updatePageTexts();
      selectDrawerItem(currentCategory);
      updateMobileBottomNav();
      updateFilterButtonText();
      updateGlowColor(currentCategory);
      updateURLForCategory(currentCategory);
      loadMoreContainer.style.display = 'flex';
      initLoadMore();
      initPosterImages(list);
      balanceTrueCharacterCardLines(list);
      if (!reused) {
        attachInternalLinks();
        attachCardClicks();
        attachFavEpisodeGalleryControls();
      }
      initAnnounceStrips();
      if (window.__refreshScrollFab) window.__refreshScrollFab();
    }

    function attachCardClicks() {
      document.querySelectorAll('.anime-item').forEach(item => {
        if (item.dataset._malAttached === '1') return;
        item.dataset._malAttached = '1';

        const animePlanetUrl = item.getAttribute('data-anime-planet-url');
        const isWatchingCard = !!animePlanetUrl;
        const canNavAll = item.hasAttribute('data-nav-all');
        const isTrueCharacterCard = item.hasAttribute('data-character-origin');

        item.style.cursor = isWatchingCard || canNavAll ? 'pointer' : 'default';
        if (isTrueCharacterCard) {
          item.removeAttribute('role');
          item.removeAttribute('tabindex');
          item.removeAttribute('aria-haspopup');
          item.removeAttribute('aria-expanded');
        }
        
        item.addEventListener('click', function(e) {
          if (e.target.closest('a') || e.target.closest('.watch-progress-inc') || e.target.closest('.watch-progress-dec')) return;

          const selection = window.getSelection();
          if (selection && selection.toString().length > 0) return;

          if (isWatchingCard) {
            window.open(animePlanetUrl, '_blank', 'noopener');
            return;
          }

          const animeId = this.id;

          if (canNavAll) {
            navigateToAnimeInCategory(animeId, 'all');
          }
        });
      });
    }

    // Lista compartilhada dos "announce strips" atualmente preparados —
    // junto com o listener de resize único abaixo, evita o bug de vazar um
    // novo `window.addEventListener('resize', ...)` a cada render() (cada
    // troca de categoria criava um listener novo que nunca era removido,
    // e cada um segurava referências aos elementos antigos na memória).
    let __announceStripsPrepared = [];
    let __announceResizeListenerAdded = false;
    let __announceResizeTO = null;

    function __measureAndStartAnnounceStrips() {
      // Descarta entradas de renders antigos cujo elemento já saiu do DOM.
      __announceStripsPrepared = __announceStripsPrepared.filter(({ strip }) => strip.isConnected);

      const PX_PER_SEC = 22;
      const widths = __announceStripsPrepared.map(({ track }) => track.children[0].getBoundingClientRect().width);

      __announceStripsPrepared.forEach(({ track }, i) => {
        const singleWidth = widths[i];
        if (!singleWidth) return;
        const duration = singleWidth / PX_PER_SEC;

        track.style.animation = 'none';
        track.style.setProperty('--marquee-distance', `-${singleWidth}px`);
        track.style.animationDuration = `${duration}s`;
      });

      requestAnimationFrame(() => {
        __announceStripsPrepared.forEach(({ track }, i) => {
          const singleWidth = widths[i];
          if (!singleWidth) return;
          const duration = singleWidth / PX_PER_SEC;
          track.style.animation = `announce-marquee ${duration}s linear infinite`;
        });
      });
    }

    function initAnnounceStrips() {
      const currentStrips = Array.from(document.querySelectorAll('.announce-strip[data-lines]'));
      __announceStripsPrepared = currentStrips.filter(strip => strip.dataset.rotateReady === '1')
        .map(strip => ({strip, track: strip.querySelector('.announce-track')})).filter(entry => entry.track);
      const strips = currentStrips.filter(strip => strip.dataset.rotateReady !== '1');

      if (strips.length) {
        strips.forEach(strip => {
          strip.dataset.rotateReady = '1';

          let lines;
          try { lines = JSON.parse(strip.getAttribute('data-lines')); } catch (e) { return; }
          if (!Array.isArray(lines) || lines.length < 2) return;

          const track = strip.querySelector('.announce-track');
          if (!track) return;

          const joined = lines.join('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;');
          track.innerHTML =
            `<span class="announce-line">${joined}</span>` +
            `<span class="announce-line">${joined}</span>`;

          __announceStripsPrepared.push({ strip, track });
        });

        __measureAndStartAnnounceStrips();
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(__measureAndStartAnnounceStrips);
        }
      }

      // Listener de resize registrado uma única vez, não a cada render().
      if (!__announceResizeListenerAdded) {
        __announceResizeListenerAdded = true;
        window.addEventListener('resize', () => {
          clearTimeout(__announceResizeTO);
          __announceResizeTO = setTimeout(__measureAndStartAnnounceStrips, 200);
        }, { passive: true });
      }
    }


    function setupFirstVisitButtonState() {
      filterBtnEl.classList.add('icon-only');
      if (filterBtnText) filterBtnText.style.display = 'none';
    }

    function initLoadMore() {
      const list = document.getElementById('animeRankingList');
      if (!list) return;

      let btn = document.getElementById('toggleBtn');
      let btnText = document.getElementById('btnText');
      const items = list.querySelectorAll('.anime-item');
      const deferredRankingData = Array.isArray(list.__deferredRankingData)
        ? list.__deferredRankingData
        : null;
      const deferredRankingMode = list.__deferredRankingMode || currentCategory;
      const totalItemCount = deferredRankingData ? deferredRankingData.length : items.length;

      const limit = 30;
      
      const isMobileLoadMore = window.matchMedia('(max-width: 600px)').matches;
      const expandedKey = 'myanimerank_expanded_' + (isMobileLoadMore ? 'mobile_' : 'desktop_') + currentCategory;
      let isExpanded = false;
      try {
        const savedExpanded = sessionStorage.getItem(expandedKey) ?? localStorage.getItem(expandedKey);
        isExpanded = savedExpanded === 'true';
      } catch(e) {}

      // Toda lista comum começa com o mesmo lote no refresh,
      // independentemente do estado antigo do botão Mostrar Tudo.
      if (deferredRankingData && items.length < totalItemCount && isExpanded) {
        isExpanded = false;
        try {
          sessionStorage.setItem(expandedKey, 'false');
          localStorage.setItem(expandedKey, 'false');
        } catch(e) {}
      }

      if (btn) btn.classList.remove('active');
      if (btnText) btnText.innerText = "Mostrar Tudo";

      function appendDeferredRankingItems() {
        if (!deferredRankingData) return;
        const renderedCount = list.querySelectorAll('.anime-item').length;
        if (renderedCount >= deferredRankingData.length) return;
        const html = deferredRankingData
          .slice(renderedCount)
          .map((anime, offset) => createAnimeCard(anime, deferredRankingMode, null, renderedCount + offset))
          .join('');
        list.insertAdjacentHTML('beforeend', html);
        attachInternalLinks();
        attachCardClicks();
        initPosterImages(list);
        initAnnounceStrips();
        balanceTrueCharacterCardLines(list);
      }

      function updateVisibility(animate = false) {
        if (isExpanded) appendDeferredRankingItems();
        const currentItems = list.querySelectorAll('.anime-item');
        const headers = list.querySelectorAll('.season-header');

        // O botão Mostrar Tudo/Mostrar Menos usa um corte fixo.
        // Fechado: mostra exatamente até o limite. Aberto: mostra todos.
        const cutoff = Math.min(limit, currentItems.length);

        currentItems.forEach((item, index) => {
          if (isExpanded) {
            item.classList.remove('hidden-item');
            if (animate && index >= cutoff && index < cutoff + 12) {
              item.classList.add('fade-in');
              item.addEventListener('animationend', () => item.classList.remove('fade-in'), { once: true });
            }
          } else {
            if (index < cutoff) {
              item.classList.remove('hidden-item');
            } else {
              item.classList.add('hidden-item');
              item.classList.remove('fade-in');
            }
          }
        });

        // Esconde o cabeçalho de temporada se nenhum item do grupo estiver visível.
        headers.forEach(header => {
          let sibling = header.nextElementSibling;
          let hasVisibleItem = false;
          while (sibling && !sibling.classList.contains('season-header')) {
            if (sibling.classList.contains('anime-item') && !sibling.classList.contains('hidden-item')) {
              hasVisibleItem = true;
              break;
            }
            sibling = sibling.nextElementSibling;
          }
          header.classList.toggle('hidden-item', !hasVisibleItem);
        });

        if (isExpanded) {
          if (btnText) btnText.innerText = "Mostrar Menos";
          if (btn) btn.classList.add('active');
        } else {
          if (btnText) btnText.innerText = "Mostrar Tudo";
          if (btn) btn.classList.remove('active');
        }
      }

      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      btn = newBtn;
      btnText = btn.querySelector('#btnText');

      if (currentCategory !== 'announced' && currentCategory !== 'watching' && totalItemCount > limit) {
        btn.style.display = 'flex';
        updateVisibility();
      } else {
        btn.style.display = 'none';
        isExpanded = true;
        updateVisibility();
      }

      btn.addEventListener('click', function() {
        isExpanded = !isExpanded;

        try {
          sessionStorage.setItem(expandedKey, isExpanded);
          localStorage.setItem(expandedKey, isExpanded);
        } catch(e) {}

        if (!isExpanded) {
          const btnRectBefore = btn.getBoundingClientRect().top;

          const htmlEl = document.documentElement;
          const bodyEl = document.body;
          const prevBehaviorHtml = htmlEl.style.scrollBehavior;
          const prevBehaviorBody = bodyEl.style.scrollBehavior;
          htmlEl.style.scrollBehavior = 'auto';
          bodyEl.style.scrollBehavior = 'auto';

          updateVisibility();

          requestAnimationFrame(() => {
            const btnRectAfter = btn.getBoundingClientRect().top;
            const delta = btnRectAfter - btnRectBefore;
            if (delta !== 0) {
              window.scrollBy(0, delta);
            }
            htmlEl.style.scrollBehavior = prevBehaviorHtml || '';
            bodyEl.style.scrollBehavior = prevBehaviorBody || '';
          });
        } else {
          updateVisibility();
        }
      });

      window.triggerExpand = function() {
        return new Promise((resolve) => {
          if (!isExpanded) {
            isExpanded = true;
            
            try {
              sessionStorage.setItem(expandedKey, isExpanded);
              localStorage.setItem(expandedKey, isExpanded);
            } catch(e) {}
            
            updateVisibility();
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          } else {
            resolve();
          }
        });
      }
    }

    let __scrollTimeoutId = null;

    function attachInternalLinks() {
      const internalLinks = document.querySelectorAll('a[href^="#"]');
      internalLinks.forEach(link => {
        if (link.dataset._internalAttached === '1') return;
        link.dataset._internalAttached = '1';

        link.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          const targetId = this.getAttribute('href').substring(1);
          if (!targetId) return;
          const targetEl = document.getElementById(targetId);
          if (!targetEl) return;

          if (__scrollTimeoutId) {
            clearTimeout(__scrollTimeoutId);
            __scrollTimeoutId = null;
          }

          const isHidden = targetEl.classList.contains('hidden-item') || getComputedStyle(targetEl).display === 'none';
          if (isHidden) {
            if (typeof window.triggerExpand === 'function') {
              window.triggerExpand().then(() => {
                __scrollTimeoutId = setTimeout(() => {
                  scrollToElement(targetEl);
                  __scrollTimeoutId = null;
                }, 60);
              });
            } else {
              __scrollTimeoutId = setTimeout(() => {
                scrollToElement(targetEl);
                __scrollTimeoutId = null;
              }, 60);
            }
          } else {
            __scrollTimeoutId = setTimeout(() => {
              scrollToElement(targetEl);
              __scrollTimeoutId = null;
            }, 10);
          }
        });
      });
    }

    let __mobileTargetScrollToken = 0;
    let __mobileOriginalScrollBehavior = null;

    function scrollToElementMobile(targetId) {
      if (!targetId) return;

      const token = ++__mobileTargetScrollToken;
      const htmlEl = document.documentElement;
      const bodyEl = document.body;

      // Guarda os valores originais somente no começo da primeira
      // navegação. Se outro clique substituir o anterior, ele reaproveita
      // o mesmo estado e apenas o salto mais recente pode restaurá-lo.
      if (!__mobileOriginalScrollBehavior) {
        __mobileOriginalScrollBehavior = {
          html: htmlEl.style.scrollBehavior,
          body: bodyEl.style.scrollBehavior,
        };
      }
      htmlEl.style.scrollBehavior = 'auto';
      bodyEl.style.scrollBehavior = 'auto';

      let highlighted = false;

      const centerCurrentTarget = () => {
        if (token !== __mobileTargetScrollToken) return false;

        // Busca de novo em TODA correção. O render do progresso, a troca
        // de categoria ou o calendário podem substituir o elemento no
        // DOM depois do primeiro scroll; usar a referência antiga era a
        // principal causa do salto parar no começo da lista no celular.
        const currentTarget = document.getElementById(targetId);
        if (!currentTarget || !currentTarget.isConnected) return false;
        if (bodyEl.style.position === 'fixed') {
          releaseBodyScrollForNavigation();
        }

        const style = getComputedStyle(currentTarget);
        if (style.display === 'none' || style.visibility === 'hidden') return false;

        const rect = currentTarget.getBoundingClientRect();
        if (!rect.height) return false;

        const visualViewport = window.visualViewport;
        const viewportCenter = visualViewport
          ? visualViewport.offsetTop + visualViewport.height / 2
          : (window.innerHeight || htmlEl.clientHeight) / 2;
        const delta = rect.top + rect.height / 2 - viewportCenter;
        const currentY = window.scrollY || window.pageYOffset || 0;
        // Em alguns navegadores mobile, html.scrollHeight ainda retorna
        // só a altura da tela logo após o body sair de position:fixed,
        // mesmo com a lista inteira já renderizada. Como o valor anterior
        // era usado para limitar o destino, ele virava maxY=0 e prendia o
        // salto exatamente no card 01 (o comportamento visto no vídeo).
        const fullScrollHeight = Math.max(
          htmlEl.scrollHeight || 0,
          bodyEl.scrollHeight || 0,
          document.scrollingElement ? document.scrollingElement.scrollHeight || 0 : 0
        );
        const maxY = Math.max(0, fullScrollHeight - (visualViewport ? visualViewport.height : window.innerHeight));
        const destination = Math.max(0, Math.min(maxY, currentY + delta));

        // Os dois caminhos juntos cobrem Chrome/Android e Safari/iOS,
        // inclusive logo depois de liberar um body que estava fixed.
        currentTarget.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
        // Se a altura total ainda estiver temporariamente incorreta, não
        // desfaz o scrollIntoView nativo mandando a página de volta a 0.
        if (maxY > 0) {
          if (document.scrollingElement) document.scrollingElement.scrollTop = destination;
          window.scrollTo({ top: destination, left: 0, behavior: 'auto' });
        }

        if (!highlighted) {
          highlighted = true;
          document.querySelectorAll('.highlight-active').forEach(el => el.classList.remove('highlight-active'));
          currentTarget.classList.add('highlight-active');
          setTimeout(() => {
            const latestTarget = document.getElementById(targetId);
            if (latestTarget) latestTarget.classList.remove('highlight-active');
          }, 3000);
        }
        return true;
      };

      // A primeira tentativa acontece já; as seguintes cobrem o fim da
      // animação do drawer/lightbox, expansão de "Mostrar Tudo", carga de
      // imagens e qualquer render tardio que troque o próprio card.
      const correctionDelays = [0, 40, 100, 180, 320, 520, 800, 1200, 1700];
      correctionDelays.forEach((delay, index) => {
        setTimeout(() => {
          if (token !== __mobileTargetScrollToken) return;
          requestAnimationFrame(() => {
            if (token !== __mobileTargetScrollToken) return;
            centerCurrentTarget();

            if (index === correctionDelays.length - 1 && __mobileOriginalScrollBehavior) {
              htmlEl.style.scrollBehavior = __mobileOriginalScrollBehavior.html;
              bodyEl.style.scrollBehavior = __mobileOriginalScrollBehavior.body;
              __mobileOriginalScrollBehavior = null;
            }
          });
        }, delay);
      });
    }

    function scrollToElement(targetEl) {
      // Busca, tags e calendário usam o mesmo caminho estável em qualquer
      // tela. Passar o ID permite sobreviver a re-renders da lista.
      if (targetEl && targetEl.id) {
        scrollToElementMobile(targetEl && targetEl.id);
        return;
      }

      // No mobile, o clique num resultado de busca costuma disparar várias
      // mudanças de layout ao mesmo tempo (fecha o drawer = tira o
      // position:fixed do body, às vezes troca de categoria = re-renderiza
      // a lista inteira, imagens carregando...). Se o navegador decidir
      // "corrigir" a posição de rolagem sozinho durante esse instante (ex.:
      // scroll anchoring, ou o reflow de tirar o position:fixed), essa
      // correção também herda o "scroll-behavior: smooth" global do CSS e
      // acaba brigando, quadro a quadro, com o scrollIntoView que pedimos
      // abaixo — o resultado, às vezes, é o clique simplesmente "não levar
      // pro card". Travar o scroll-behavior em "auto" durante essa janela
      // faz qualquer ajuste do navegador acontecer na hora (sem animação),
      // sobrando só a nossa rolagem pra realmente animar.
      const htmlEl = document.documentElement;
      const bodyEl = document.body;
      const prevHtmlBehavior = htmlEl.style.scrollBehavior;
      const prevBodyBehavior = bodyEl.style.scrollBehavior;
      htmlEl.style.scrollBehavior = 'auto';
      bodyEl.style.scrollBehavior = 'auto';
      const restoreScrollBehavior = () => {
        htmlEl.style.scrollBehavior = prevHtmlBehavior;
        bodyEl.style.scrollBehavior = prevBodyBehavior;
      };

      const targetCenterOffset = () => {
        const rect = targetEl.getBoundingClientRect();
        const viewportH = window.innerHeight || document.documentElement.clientHeight;
        return (rect.top + rect.height / 2) - (viewportH / 2);
      };

      // Não basta o card estar apenas visível: no mobile isso podia deixar
      // o anime encostado no topo/rodapé da tela e parecer que o salto foi
      // para o item errado. Considera concluído somente quando o CENTRO do
      // card coincide com o centro útil da tela (com pequena tolerância).
      const isLandedOnTarget = () => Math.abs(targetCenterOffset()) <= 18;

      const centerTarget = (behavior) => {
        const delta = targetCenterOffset();
        window.scrollTo({
          top: Math.max(0, (window.scrollY || window.pageYOffset || 0) + delta),
          behavior,
        });
      };

      centerTarget('smooth');

      // Assim como em restoreScrollPosition(), uma checagem única não basta
      // aqui: clicar num resultado de busca pode trocar de categoria E
      // expandir a lista inteira de uma vez (triggerExpand), revelando
      // dezenas de cards com pôsteres carregando de forma assíncrona.
      // Como a página desliga o "overflow-anchor" (ver comentário em
      // html,body no <style>, feito pra evitar OUTRO bug de scroll), o
      // navegador não recompensa sozinho a altura que essas imagens vão
      // adicionando acima/abaixo do card enquanto a rolagem suave ainda
      // está em andamento — então uma única correção aos 550ms quase
      // sempre chega cedo demais (ou tarde demais) e o card acaba saindo
      // do lugar de novo logo depois, sem mais nenhuma correção. Por
      // isso, em vez de checar uma vez, repete a correção por um tempo
      // e também re-corrige quando cada imagem pendente termina de
      // carregar (mesma lógica de restoreScrollPosition()).
      let __landAttempts = 0;
      const __maxLandAttempts = 20; // ~4s de correções (200ms cada)
      const __landIntervalId = setInterval(() => {
        __landAttempts++;
        if (!document.body.contains(targetEl)) {
          clearInterval(__landIntervalId);
          restoreScrollBehavior();
          return;
        }
        if (!isLandedOnTarget()) {
          centerTarget('auto');
        } else if (__landAttempts > 3) {
          // Já estabilizado por algumas checagens seguidas: encerra cedo.
          clearInterval(__landIntervalId);
          restoreScrollBehavior();
          return;
        }
        if (__landAttempts >= __maxLandAttempts) {
          clearInterval(__landIntervalId);
          restoreScrollBehavior();
        }
      }, 200);

      // Também recorrige quando as imagens ainda pendentes na lista
      // terminarem de carregar, já que é isso que mais desloca o card.
      const __pendingImgs = Array.from(document.querySelectorAll('#animeRankingList img'))
        .filter(img => !img.complete);
      if (__pendingImgs.length) {
        let __remaining = __pendingImgs.length;
        const __onImgDone = () => {
          __remaining--;
          if (document.body.contains(targetEl) && !isLandedOnTarget()) {
            centerTarget('auto');
          }
          if (__remaining <= 0) {
            clearInterval(__landIntervalId);
            restoreScrollBehavior();
          }
        };
        __pendingImgs.forEach(img => {
          img.addEventListener('load', __onImgDone, { once: true });
          img.addEventListener('error', __onImgDone, { once: true });
        });
      }

      document.querySelectorAll('.highlight-active').forEach(el => el.classList.remove('highlight-active'));        
      setTimeout(() => {
        targetEl.classList.add('highlight-active');
        const removeHighlight = () => {
          targetEl.classList.remove('highlight-active');
          targetEl.removeEventListener('mouseenter', removeHighlight);
        };
        targetEl.addEventListener('mouseenter', removeHighlight);
        setTimeout(() => {
          if (targetEl.classList.contains('highlight-active')) removeHighlight();
        }, 3000); 
      }, 500); 
    }

    // Troca de categoria (se preciso) e rola/realça o card de um anime
    // específico. Usado pela busca e pelas tags clicáveis do lightbox.
    function navigateToAnimeInCategory(targetId, targetCategory) {
      if (!targetId || !targetCategory) return;

      // Se a busca ou uma tag for usada enquanto o calendário está
      // aberto, fecha primeiro esse modo. O calendário aplica
      // display:none ao #rankingContainer; sem desligá-lo, a categoria
      // mudava corretamente, mas a lista do anime continuava invisível.
      if (window.__isReleaseCalendarMode && window.__isReleaseCalendarMode()) {
        window.__setReleaseCalendarMode(false, { keepScroll: true });
      }

      releaseBodyScrollForNavigation();

      // Encontra somente o card da lista principal. Usar apenas
      // document.getElementById podia selecionar uma cópia temporária de
      // outro componente quando o drawer/calendário ainda estava saindo.
      const findMainListTarget = () => {
        const rankingList = document.getElementById('animeRankingList');
        if (!rankingList) return null;
        return Array.from(rankingList.querySelectorAll('.anime-item'))
          .find(item => item.id === targetId) || null;
      };

      const forceRevealMainList = () => {
        const rankingList = document.getElementById('animeRankingList');
        if (!rankingList) return;
        rankingList.querySelectorAll('.anime-item.hidden-item, .season-header.hidden-item')
          .forEach(item => item.classList.remove('hidden-item'));
      };

      // Tenta achar o card algumas vezes antes de desistir: no mobile,
      // trocar de categoria (render() inteiro) e fechar o drawer podem
      // competir pelo mesmo frame, e o card às vezes ainda não está no DOM
      // no primeiro requestAnimationFrame — antes isso fazia a busca
      // simplesmente não levar a lugar nenhum, sem nenhum aviso. Insistindo
      // por um tempinho cobre esse caso sem atrasar o caminho normal (acha
      // de primeira na grande maioria das vezes).
      let requestedMissingExpansion = false;
      const findAndJump = (attemptsLeft) => {
        const targetEl = findMainListTarget();
        if (!targetEl) {
          if (!requestedMissingExpansion && typeof window.triggerExpand === 'function') {
            requestedMissingExpansion = true;
            window.triggerExpand().then(() => findAndJump(attemptsLeft));
            return;
          }
          if (attemptsLeft > 0) setTimeout(() => findAndJump(attemptsLeft - 1), 80);
          return;
        }
        if (typeof window.triggerExpand === 'function') {
          window.triggerExpand().then(() => {
            // Garantia adicional: mesmo que o estado interno do botão
            // "Mostrar Tudo" ainda esteja sendo atualizado, nenhum card
            // continua display:none antes de medirmos a posição.
            forceRevealMainList();
            releaseBodyScrollForNavigation();
            requestAnimationFrame(() => requestAnimationFrame(() => {
              scrollToElementMobile(targetId);
            }));
          });
        } else {
          forceRevealMainList();
          releaseBodyScrollForNavigation();
          requestAnimationFrame(() => requestAnimationFrame(() => {
            scrollToElementMobile(targetId);
          }));
        }
      };

      const jumpTo = () => {
        requestAnimationFrame(() => findAndJump(6));
      };

      if (currentCategory !== targetCategory) {
        currentCategory = targetCategory;
        render();
        jumpTo();
      } else {
        jumpTo();
      }
    }

    let __searchMarqueeInitialized = false;
    function initSearchMarquee() {
      if (__searchMarqueeInitialized) return;
      __searchMarqueeInitialized = true;
      const rowRight = document.getElementById('searchMarqueeRight');
      const rowLeft = document.getElementById('searchMarqueeLeft');
      const rowRight2 = document.getElementById('searchMarqueeRight2');
      if (!rowRight || !rowLeft || !rowRight2) return;

      const pool = [...animeData, ...watchingData, ...planToWatchData]
        .filter(a => a && a.img);

      if (!pool.length) return;

      // Mesma lógica de assets/<pasta>-search/ usada nos cards de resultado
      // de busca (16:9), pra intercalar esses thumbs no carrossel também.
      function marqueeThumbSrc(originalPath) {
        if (!originalPath) return originalPath;
        const path = String(originalPath);
        const filename = path.split('/').pop();
        let baseFolder = 'myranks-images';
        let folder = 'myranks-search';
        if (path.startsWith('watchingnow-images/watchingnow/')) { baseFolder = 'watchingnow-images'; folder = 'watchingnow-search'; }
        else if (path.startsWith('plantowatch-images/plantowatch/')) { baseFolder = 'plantowatch-images'; folder = 'plantowatch-search'; }
        return `${baseFolder}/${folder}/${filename}`;
      }

      // Embaralha uma cópia do pool pra cada fileira, sem mutar os dados originais.
      function shuffled(list) {
        const arr = list.slice();
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      }

      // Pega itens suficientes pra preencher a largura + duplica pra dar loop
      // infinito sem costura (a animação anda exatamente 50% da trilha).
      // De vez em quando entra um thumb 16:9 (mesmo estilo dos cards de
      // busca) no meio dos pôsteres normais, pra variar o carrossel.
      function buildRow(container, list, count) {
        const picks = shuffled(list).slice(0, count);
        const doubled = [...picks, ...picks];
        container.innerHTML = doubled
          .map((a, i) => {
            const isWide = i % 3 === 1;
            const cls = isWide ? 'search-marquee-poster search-marquee-poster--wide' : 'search-marquee-poster';
            const src = isWide ? marqueeThumbSrc(a.img) : a.img;
            return `<img class="${cls}" src="${src}" alt="" loading="lazy" decoding="async" fetchpriority="low">`;
          })
          .join('');
      }

      // No celular, 3 fileiras x 28 imagens (14 duplicadas pro loop) é
      // muito pra decodificar e animar de uma vez — usa bem menos.
      const __marqueeMobile = window.matchMedia('(max-width: 760px)').matches;
      const COUNT = Math.min(__marqueeMobile ? 6 : 14, pool.length);
      buildRow(rowRight, pool, COUNT);
      buildRow(rowLeft, pool, COUNT);
      buildRow(rowRight2, pool, COUNT);

    }

    function initSearch() {
      const searchPanelEl = document.querySelector('.search-panel-live');
      const searchBoxDrawer = document.getElementById('searchBoxDrawer');
      const searchInput = document.getElementById('searchDrawerInput');
      const searchResults = document.getElementById('searchDrawerResults');
      const searchClearBtn = document.getElementById('searchClearBtn');
      if (!searchInput || !searchResults) return;

      // Existe uma função escapeHtml em outro escopo do arquivo (fora do
      // alcance daqui), então precisamos da nossa própria cópia local.
      // Sem isso, renderEntries() quebra com "escapeHtml is not defined"
      // sempre que a busca não encontra nada, o que impede o innerHTML de
      // ser atualizado e deixa o card antigo "grudado" na tela, agora
      // dentro do container com a classe .is-empty-state (display:flex),
      // o que espreme o card e o cabeçalho lado a lado — esse é o bug do
      // card indo pro canto e do "GLOBAL RANKING" descendo pra esquerda.
      function escapeHtml(str) {
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      // Só troca o carrossel pelos cards de resultado depois desse número
      // de caracteres digitados (contando espaços nas pontas fora).
      const MIN_QUERY_LENGTH = 4;

      // Índice de busca combinando todas as fontes de dados. Um mesmo id pode
      // existir em mais de uma fonte (ex: uma temporada no watching e o anime
      // também rankeado no all anime) — nesse caso as duas entradas aparecem,
      // só evitamos duplicata dentro da mesma fonte.
      const searchIndex = [];
      const seenKeys = new Set();
      function addToIndex(list, tag) {
        list.forEach(anime => {
          const key = (tag || 'all') + '::' + anime.id;
          if (seenKeys.has(key)) return;
          seenKeys.add(key);
          searchIndex.push({ anime, tag });
        });
      }
      addToIndex(watchingData, 'watching');
      addToIndex(planToWatchData, 'plan');
      addToIndex(animeData, null);
      // True Characters (trueCharactersData) usa os mesmos nomes de campo
      // do "all animes" (id/img/title/info), então entra direto no índice
      // sem precisar de mapeamento — só a tag 'trueCharacters' muda pra
      // cair na seção própria em groupEntriesIntoSections() e navegar
      // pra categoria certa em categoryForResult().
      if (typeof trueCharactersData !== 'undefined') {
        addToIndex(trueCharactersData, 'trueCharacters');
      }
      // Peak Episodes (favoriteEpisodesData) usa nomes de campo diferentes
      // (anime/episodeLabel em vez de title/info) — mapeia pros nomes que
      // o resto da busca espera. Aqui o "title" (linha principal do card
      // de resultado) vira o episódio (ep.episodeLabel) e o "subtitle"
      // (linha de baixo) vira o nome do anime (ep.anime) — o oposto do
      // que os outros cards de busca fazem, já que aqui o que importa é
      // o episódio, não a série. "searchText" combina os dois pra
      // continuar achando o resultado buscando tanto pelo nome do anime
      // quanto pelo nome/número do episódio. "peakRank" é a posição do
      // episódio dentro do próprio ranking de Peak Episodes (considerando
      // empate de nota, igual ao "#N" mostrado no card) — nada a ver com
      // a posição do anime no Global Ranking (mesmo id pode coincidir
      // entre as duas listas, ex: "re-zero" existe nas duas).
      if (typeof favoriteEpisodesData !== 'undefined') {
        const favEpRanks = (typeof computeFavEpisodeRanks === 'function')
          ? computeFavEpisodeRanks(favoriteEpisodesData)
          : [];
        const favEpSearchData = favoriteEpisodesData.map((ep, idx) => ({
          id: ep.id,
          title: ep.episodeLabel,
          subtitle: ep.anime,
          searchText: `${ep.anime || ''} ${ep.episodeLabel || ''}`,
          img: ep.img,
          images: Array.isArray(ep.images) && ep.images.length ? ep.images : (ep.img ? [ep.img] : []),
          peakRank: favEpRanks[idx] != null ? favEpRanks[idx] : (idx + 1),
          favEpIndex: idx
        }));
        addToIndex(favEpSearchData, 'favep');
      }

      // Mapa id -> posição no ranking geral (1-based), na ordem de animeData,
      // usado só pra prefixar "#N " nos resultados da seção "Global Ranking".
      const globalRankById = new Map();
      animeData.forEach((anime, idx) => {
        if (!globalRankById.has(anime.id)) globalRankById.set(anime.id, idx + 1);
      });

      // Mesma ideia, mas pra True Characters — mapa próprio (em vez de
      // reaproveitar globalRankById) porque alguns ids colidem entre as
      // duas listas (ex: "shadow" existe tanto no anime "The Eminence in
      // Shadow" quanto no personagem Cid Kagenou), e usar o mesmo mapa
      // faria o personagem herdar por engano a posição do anime.
      const trueCharRankById = new Map();
      if (typeof trueCharactersData !== 'undefined') {
        trueCharactersData.forEach((c, idx) => {
          if (!trueCharRankById.has(c.id)) trueCharRankById.set(c.id, idx + 1);
        });
      }

      // Posições usadas no canto direito dos cards da busca. Mantemos o
      // próprio objeto como chave para diferenciar animes que aparecem em
      // mais de uma lista com o mesmo id.
      const searchSourceRankMaps = {
        watching: new Map(watchingData.map((anime, idx) => [anime, idx + 1])),
        plan: new Map(planToWatchData.map((anime, idx) => [anime, idx + 1]))
      };
      const searchCategoryRankMaps = new Map();
      [
        'romance', 'isekai', 'sports', 'comedy', 'mecha',
        'incomplete', 'announced'
      ].forEach(category => {
        searchCategoryRankMaps.set(
          category,
          new Map(getFilteredData(category).map((anime, idx) => [anime, idx + 1]))
        );
      });

      function buildSearchRankHtml(entry) {
        let rank = null;
        let usesHash = true;

        if (entry.tag === 'favep') {
          rank = entry.anime.peakRank;
        } else if (entry.tag === 'trueCharacters') {
          rank = trueCharRankById.get(entry.anime.id);
        } else if (entry.forcedCategory && searchCategoryRankMaps.has(entry.forcedCategory)) {
          rank = searchCategoryRankMaps.get(entry.forcedCategory).get(entry.anime);
          usesHash = !['incomplete', 'announced'].includes(entry.forcedCategory);
        } else if (entry.tag === 'watching' || entry.tag === 'plan') {
          rank = searchSourceRankMaps[entry.tag].get(entry.anime);
          usesHash = false;
        } else {
          rank = globalRankById.get(entry.anime.id);
        }

        if (rank == null) return '';
        const rankText = String(rank).padStart(2, '0');
        const colorClass = usesHash ? searchRankBadgeClass(rank) : ' rank-plain';
        return `<span class="search-result-rank${colorClass}">${usesHash ? '#' : ''}${rankText}</span>`;
      }

      function normalize(str) {
        return String(str || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();
      }

      // ── Busca "tolerante": não exige o título exato ──
      // Distância de Levenshtein simples (número mínimo de
      // inserções/remoções/trocas pra transformar uma string na outra),
      // usada abaixo pra aceitar pequenos erros de digitação.
      function levenshtein(a, b) {
        const al = a.length, bl = b.length;
        if (al === 0) return bl;
        if (bl === 0) return al;
        const dp = new Array(bl + 1);
        for (let j = 0; j <= bl; j++) dp[j] = j;
        for (let i = 1; i <= al; i++) {
          let prev = dp[0];
          dp[0] = i;
          for (let j = 1; j <= bl; j++) {
            const temp = dp[j];
            dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
            prev = temp;
          }
        }
        return dp[bl];
      }

      // Dá uma nota pro quão bem "query" combina com "title": aceita as
      // palavras em qualquer ordem, palavras parciais/abreviadas (ex:
      // "jujutsu k" acha "Jujutsu Kaisen") e pequenos erros de digitação
      // (ex: "wistoia" ainda acha "Wistoria"). Quanto maior a nota,
      // melhor o match; 0 significa "não bate".
      function fuzzyMatchScore(query, title) {
        const q = normalize(query);
        const t = normalize(title);
        if (!q) return 0;

        // Match direto (substring do título inteiro) continua sendo o
        // melhor resultado possível — mantém a busca "clássica" funcionando.
        if (t.includes(q)) {
          return t.startsWith(q) ? 1000 : 700;
        }

        const qTokens = q.split(/\s+/).filter(Boolean);
        const tTokens = t.split(/[\s:.,\-!?'"()]+/).filter(Boolean);
        if (!qTokens.length || !tTokens.length) return 0;

        let matchedTokens = 0;
        let penalty = 0;
        qTokens.forEach(qt => {
          let bestRatio = -1;
          tTokens.forEach(tt => {
            // Match exato do token inteiro sempre conta como perfeito.
            if (tt === qt) {
              if (bestRatio < 1) bestRatio = 1;
              return;
            }
            // "Contém"/prefixo só conta como match forte quando a palavra
            // digitada tem tamanho razoável (>=4). Sem esse mínimo,
            // partículas curtas tipo "no", "de", "to", "wa" combinavam
            // com qualquer palavra que as contivesse e infestavam a
            // busca de falsos positivos (ex: "shingeki no kyojin"
            // achando "Food Wars! Shokugeki no Soma" só pelo "no").
            if (qt.length >= 4 && (tt.includes(qt) || (tt.length >= 4 && qt.startsWith(tt)))) {
              if (bestRatio < 0.95) bestRatio = 0.95;
              return;
            }
            // Senão, tolera erro de digitação proporcional ao tamanho da
            // palavra (palavras curtas toleram menos erro, e o limiar
            // geral ficou mais rígido pra não deixar match fraco contar
            // como "cobertura" da query).
            const maxLen = Math.max(qt.length, tt.length);
            const dist = levenshtein(qt, tt);
            const ratio = 1 - dist / maxLen;
            const threshold = qt.length <= 3 ? 0.8 : 0.65;
            if (ratio >= threshold && ratio > bestRatio) bestRatio = ratio;
          });
          if (bestRatio >= 0) {
            matchedTokens++;
            penalty += (1 - bestRatio);
          }
        });

        // Exige que a maioria das palavras digitadas tenha achado par —
        // evita, por ex, "one two three" combinar com qualquer título só
        // porque uma palavra qualquer bateu por acaso. Pra queries com 3+
        // palavras a exigência é mais rígida (0.8) porque títulos/nomes
        // MAL longos têm muitas palavras — sem isso, 2 matches de 3+
        // palavras (uma delas uma partícula curta tipo "no") já passava.
        const coverage = matchedTokens / qTokens.length;
        const minCoverage = qTokens.length <= 1 ? 1 : (qTokens.length === 2 ? 0.75 : 0.8);
        if (coverage < minCoverage) return 0;

        return Math.round(coverage * 500 - penalty * 40);
      }

      // ── Nomes alternativos na busca ──
      // Permite achar um anime por outro nome (ex: "Attack on Titan" ->
      // "Shingeki no Kyojin"). Fontes, da mais precisa à menos:
      //  1. "aliases" nos dados (opcional, manual): aliases: ['SNK', 'AoT']
      //     (ou uma string só). Sempre tem prioridade e funciona offline.
      //  2. Nomes do MyAnimeList via Jikan, baixados em segundo plano:
      //     - animes com "malUrl" (Watching/Plan): pelo ID exato;
      //     - os demais: busca pelo título, aceita o resultado SÓ se algum
      //       nome dele bater com o título local (evita associar errado).
      // O resultado fica em cache (localStorage) por 90 dias, então o custo
      // de rede é só na primeira vez. Pra desligar a parte automática,
      // troque ALT_TITLES_AUTO_FETCH por false.
      const ALT_TITLES_AUTO_FETCH = true;
      const ALT_TITLES_CACHE_KEY = 'myhtml_alt_titles_v1';
      const ALT_TITLES_TTL_MS = 90 * 24 * 60 * 60 * 1000;
      const ALT_TITLES_MISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // não achou: tenta de novo em 14 dias
      const ALT_TITLES_CRAWL_BUDGET = 30;  // chamadas/min do segundo plano (sobra margem pra nota)
      const ALT_TITLES_MAX_PER_ANIME = 10;

      let altTitlesCache = (function () {
        try {
          const parsed = JSON.parse(localStorage.getItem(ALT_TITLES_CACHE_KEY) || '{}');
          return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
        } catch (e) {
          return {};
        }
      })();
      let altTitlesSaveTimer = null;
      function saveAltTitlesCacheSoon() {
        clearTimeout(altTitlesSaveTimer);
        altTitlesSaveTimer = setTimeout(() => {
          try { localStorage.setItem(ALT_TITLES_CACHE_KEY, JSON.stringify(altTitlesCache)); } catch (e) {}
        }, 1000);
      }

      function altTitleKey(anime) {
        return normalize(anime && anime.title);
      }

      function manualAliasesOf(anime) {
        const a = anime && anime.aliases;
        if (Array.isArray(a)) return a.filter(x => typeof x === 'string' && x.trim());
        return (typeof a === 'string' && a.trim()) ? [a] : [];
      }

      function altNamesFor(entry) {
        if (!entry || entry.tag === 'favep') return [];
        const manual = manualAliasesOf(entry.anime);
        if (entry.tag === 'trueCharacters') return manual; // personagens: só manual
        const cached = altTitlesCache[altTitleKey(entry.anime)];
        return (cached && Array.isArray(cached.t) && cached.t.length) ? manual.concat(cached.t) : manual;
      }

      // Todos os nomes que o MAL conhece pra um anime, só em alfabeto
      // latino (kanji não adianta: ninguém digita isso no teclado).
      function jikanTitlesOf(item) {
        const out = [];
        const push = t => {
          if (typeof t === 'string' && /[a-z]/.test(normalize(t))) out.push(t.trim());
        };
        if (!item) return out;
        push(item.title);
        push(item.title_english);
        (Array.isArray(item.titles) ? item.titles : []).forEach(x => {
          if (x && x.type !== 'Japanese') push(x.title);
        });
        (Array.isArray(item.title_synonyms) ? item.title_synonyms : []).forEach(push);
        return out;
      }

      function cleanAltTitleList(localTitle, names) {
        const own = normalize(localTitle);
        const seen = new Set([own]);
        const out = [];
        names.forEach(name => {
          const key = normalize(name);
          if (!key || seen.has(key)) return;
          seen.add(key);
          out.push(name);
        });
        return out.slice(0, ALT_TITLES_MAX_PER_ANIME);
      }

      async function fetchAltTitlesByMalId(malId) {
        const json = await jikanGetJson(`/anime/${malId}`);
        const data = json && json.data;
        if (!data) return { names: [], score: null };
        return { names: jikanTitlesOf(data), score: (typeof data.score === 'number') ? data.score : null };
      }

      async function fetchAltTitlesBySearch(localTitle) {
        const json = await jikanGetJson(`/anime?q=${encodeURIComponent(localTitle)}&limit=5`);
        const list = json && Array.isArray(json.data) ? json.data : [];
        const lt = normalize(localTitle);
        const namesOf = item => jikanTitlesOf(item).map(normalize);
        // 1º: algum nome igual ao título local. 2º: um começa com o outro.
        const hit = list.find(item => namesOf(item).includes(lt))
          || list.find(item => namesOf(item).some(n =>
               n.length >= 4 && lt.length >= 4 && (n.startsWith(lt) || lt.startsWith(n))));
        return hit ? jikanTitlesOf(hit) : [];
      }

      let altTitlesCrawlRunning = false;
      async function runAltTitlesCrawl() {
        if (!ALT_TITLES_AUTO_FETCH || altTitlesCrawlRunning) return;
        altTitlesCrawlRunning = true;
        try {
          const seen = new Set();
          const todo = [];
          const order = { watching: 0, plan: 1 };
          searchIndex
            .filter(e => e.tag !== 'favep' && e.tag !== 'trueCharacters')
            .sort((a, b) => (order[a.tag] ?? 2) - (order[b.tag] ?? 2))
            .forEach(e => {
              const key = altTitleKey(e.anime);
              if (!key || seen.has(key)) return;
              seen.add(key);
              const cached = altTitlesCache[key];
              const ttl = cached && cached.miss ? ALT_TITLES_MISS_TTL_MS : ALT_TITLES_TTL_MS;
              if (cached && (Date.now() - cached.ts) < ttl) return;
              todo.push(e.anime);
            });

          for (const anime of todo) {
            // Não atrapalha o uso normal: espera a aba ficar visível, a fila
            // de notas esvaziar e sobrar folga no limite por minuto.
            while (
              document.hidden
              || jikanForegroundPending > 0
              || jikanRequestTimes.filter(t => Date.now() - t < 60000).length >= ALT_TITLES_CRAWL_BUDGET
            ) {
              await jikanSleep(2000);
            }
            let names = [];
            const malId = extractMalId(anime.malUrl);
            if (malId) {
              const r = await queueMalFetch(() => fetchAltTitlesByMalId(malId));
              names = r.names;
              // Aproveita: a mesma resposta já traz a nota.
              if (r.score != null) setCachedMalScore(malId, r.score);
            } else {
              names = await queueMalFetch(() => fetchAltTitlesBySearch(anime.title));
            }
            const cleaned = cleanAltTitleList(anime.title, names);
            altTitlesCache[altTitleKey(anime)] = { t: cleaned, ts: Date.now(), miss: cleaned.length ? 0 : 1 };
            saveAltTitlesCacheSoon();
          }
        } catch (e) {
          // API fora do ar: para por agora; retoma na próxima vez que o site abrir.
        } finally {
          altTitlesCrawlRunning = false;
        }
      }

      if (ALT_TITLES_AUTO_FETCH) {
        // No celular (ou com economia de dados) espera bem mais antes de
        // começar, pra não disputar conexão e CPU com as capas da lista.
        // O resultado fica em cache por 90 dias, então só atrasa a 1ª vez.
        const __saveData = !!(navigator.connection && navigator.connection.saveData);
        const __altMobile = window.matchMedia('(max-width: 760px)').matches;
        const kickAltTitlesCrawl = () => {
          if (__saveData) return;
          setTimeout(runAltTitlesCrawl, __altMobile ? 60000 : 6000);
        };
        if (document.readyState === 'complete') kickAltTitlesCrawl();
        else window.addEventListener('load', kickAltTitlesCrawl, { once: true });
      }

      function categoryForResult(entry) {
        // Resultado veio de um comando de lista específica (ex: "/romance")
        // -> navega pra aquela página, não pro "all" genérico.
        if (entry.forcedCategory) return entry.forcedCategory;
        if (entry.tag === 'watching') return 'watching';
        if (entry.tag === 'plan') return 'plan';
        if (entry.tag === 'favep') return 'favEpisodes';
        if (entry.tag === 'trueCharacters') return 'trueCharacters';
        return 'all';
      }

      // Os cards de busca usam uma pasta de assets própria, diferente da
      // pasta original de cada imagem (myranks-images/myranks/, watchingnow-images/watchingnow/, plantowatch-images/plantowatch/).
      // Mantém só o nome do arquivo e troca a pasta pra assets/<pasta>-search/.
      // Barrinha de progresso "só leitura" pro card de busca (Watching Now):
      // mesma lógica de cálculo do progresso usada no card grande, mas sem
      // os botões de +/- (aqui não dá pra editar o progresso).
      function buildSearchProgressHtml(anime, color) {
        const progress = parseWatchProgress(anime);
        if (!progress) return '';
        const override = getWatchProgressOverride(anime.id);
        const colorStyle = ` style="--item-hover-color: ${color || '#2dd4bf'};"`;

        if (progress.indeterminate) {
          if (override !== null) {
            progress.cur = Math.max(0, override);
            progress.curLabel = String(progress.cur);
          }
          return `
            <div class="watch-progress search-result-progress watch-progress--indeterminate"${colorStyle}>
              <div class="watch-progress-track">
                <div class="watch-progress-fill watch-progress-fill--indeterminate"></div>
              </div>
              <span class="watch-progress-label">${progress.curLabel}/-</span>
            </div>`;
        }

        if (override !== null) {
          progress.cur = Math.max(0, Math.min(progress.tot, override));
          progress.pct = Math.max(0, Math.min(100, (progress.cur / progress.tot) * 100));
          progress.curLabel = String(progress.cur);
        }
        const seasonRel = getSeasonRelativeProgress(anime, progress.cur);
        const atMaxSearch = progress.cur >= progress.tot;
        const labelHtml = atMaxSearch
          ? 'COMPLETED'
          : (seasonRel
            ? `${seasonRel.withinCur}/${seasonRel.seasonTot}<span class="watch-progress-label-total">${progress.cur}/${progress.tot}</span>`
            : `${progress.curLabel}/${progress.tot}`);
        return `
          <div class="watch-progress search-result-progress"${colorStyle}>
            <div class="watch-progress-track">
              <div class="watch-progress-fill" style="width:${progress.pct}%;"></div>
            </div>
            <span class="watch-progress-label${atMaxSearch ? ' watch-progress-label--completed' : ''}">${labelHtml}</span>
          </div>`;
      }

      // A cada vez que um episódio de Peak Episodes aparece de novo nos
      // resultados da busca — ou seja, numa busca nova, depois de ter
      // sumido dos resultados (campo limpo, ou o usuário buscou outra
      // coisa antes) — mostra a próxima imagem da galeria dele (jjk-1,
      // depois jjk-2, depois jjk-3...), num loop. Enquanto o usuário só
      // vai completando a mesma busca (ex: "j" -> "jj" -> "jjk") e o
      // item continua aparecendo o tempo todo, a imagem NÃO muda — só
      // troca quando ele reaparece depois de ter saído da lista.
      const favEpThumbCycleIndex = new Map();
      const favEpCurrentThumbSrc = new Map();
      let favEpVisibleIdsLastRender = new Set();
      function getFavEpThumb(entry) {
        const images = entry.images && entry.images.length ? entry.images : (entry.img ? [entry.img] : []);
        if (!images.length) return entry.img || '';
        const id = entry.id;
        if (favEpVisibleIdsLastRender.has(id) && favEpCurrentThumbSrc.has(id)) {
          return favEpCurrentThumbSrc.get(id);
        }
        const cur = favEpThumbCycleIndex.has(id) ? favEpThumbCycleIndex.get(id) : 0;
        const src = images[cur % images.length];
        favEpThumbCycleIndex.set(id, cur + 1);
        favEpCurrentThumbSrc.set(id, src);
        return src;
      }

      function searchThumbSrc(originalPath) {
        if (!originalPath) return originalPath;
        const path = String(originalPath);
        // Peak Episodes (other-images/peakepisodes/) e True Characters
        // (other-images/truecharacters/) não têm uma pasta "-search"
        // otimizada dedicada — usa a imagem original direto. Sem esse
        // caso, True Characters caía no fallback "myranks-search" (pasta
        // que não existe pra essas imagens) e o thumb do resultado
        // simplesmente não carregava.
        if (path.startsWith('other-images/peakepisodes/') || path.startsWith('other-images/truecharacters/')) return path;
        const filename = path.split('/').pop();
        let baseFolder = 'myranks-images';
        let folder = 'myranks-search';
        if (path.startsWith('watchingnow-images/watchingnow/')) { baseFolder = 'watchingnow-images'; folder = 'watchingnow-search'; }
        else if (path.startsWith('plantowatch-images/plantowatch/')) { baseFolder = 'plantowatch-images'; folder = 'plantowatch-search'; }
        return `${baseFolder}/${folder}/${filename}`;
      }

      // Mesma lógica de ouro/prata/bronze usada no True Characters e nos
      // cards de rank (rank-gold/silver/bronze) — só que aplicada ao
      // selo "#N" dos resultados da busca.
      function searchRankBadgeClass(rank) {
        const n = Number(rank);
        return n === 1 ? ' rank-gold' : n === 2 ? ' rank-silver' : n === 3 ? ' rank-bronze' : '';
      }

      function highlightTitle(title, query) {
        if (!query) return title;
        const idxFull = title.toLowerCase().indexOf(query.toLowerCase());
        if (idxFull !== -1) {
          return title.slice(0, idxFull) + '<mark>' + title.slice(idxFull, idxFull + query.length) + '</mark>' + title.slice(idxFull + query.length);
        }
        // Sem match exato da frase inteira (busca tolerante encontrou o
        // título mesmo assim) — destaca cada palavra digitada que
        // aparecer isolada no título, em vez de não destacar nada.
        const tokens = query.split(/\s+/).filter(t => t.length >= 2);
        if (!tokens.length) return title;
        const escaped = tokens
          .slice()
          .sort((a, b) => b.length - a.length)
          .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const re = new RegExp('(' + escaped.join('|') + ')', 'ig');
        return title.replace(re, '<mark>$1</mark>');
      }

      // ── Rotação da ordem das seções do "Watching Now" no comando "/all" ──
      // A cada vez que o comando "/all" é acionado (isto é, cada vez que o
      // usuário "abre" o resultado com /all), a lista cíclica de 6 grupos
      // [Fall, Summer, Spring, Winter, On Hold, Non-Seasonal] gira uma posição
      // para trás: começa em Fall, depois em Non-Seasonal, depois em
      // On Hold, depois em Winter, depois em Spring, depois em Summer, e
      // volta pra Fall.
      const WATCHING_NO_SEASON_KEY = '__no-season__';
      const WATCHING_BASE_ORDER = [...WATCHING_SEASON_ORDER, WATCHING_NO_SEASON_KEY];
      const WATCHING_ROTATION_STORAGE_KEY = 'watchingAllRotationIndex';

      function getWatchingRotationIndex() {
        const stored = parseInt(localStorage.getItem(WATCHING_ROTATION_STORAGE_KEY), 10);
        return Number.isFinite(stored) ? ((stored % WATCHING_BASE_ORDER.length) + WATCHING_BASE_ORDER.length) % WATCHING_BASE_ORDER.length : 0;
      }

      function advanceWatchingRotationIndex() {
        const len = WATCHING_BASE_ORDER.length;
        const next = (getWatchingRotationIndex() + 1) % len;
        try { localStorage.setItem(WATCHING_ROTATION_STORAGE_KEY, String(next)); } catch (e) {}
      }

      function getWatchingSectionOrder(rotate) {
        if (!rotate) return WATCHING_BASE_ORDER.slice();
        const len = WATCHING_BASE_ORDER.length;
        const rotationIndex = getWatchingRotationIndex();
        const startIdx = ((0 - rotationIndex) % len + len) % len;
        return WATCHING_BASE_ORDER.slice(startIdx).concat(WATCHING_BASE_ORDER.slice(0, startIdx));
      }

      // Agrupa os resultados em seções com cabeçalho (em vez da tag por item):
      // - itens de "watching" são divididos por temporada, igual à lista principal
      //   (com a ordem dos grupos rotativa quando `rotateWatchingOrder` é true, ou
      //   seja, quando a busca veio do comando "/all")
      // - itens de "plan" caem numa seção única "Planejo Assistir"
      // - qualquer outro item (ranking geral) cai em "Ranking Geral"
      // - quando `forcedCategory` é passado (comando de lista específica,
      //   ex: "/romance"), a seção "Ranking Geral" usa o rótulo e a cor
      //   daquela categoria (ex: "Romance Anime") em vez do genérico
      //   "Global Ranking" — e cada item recebe entry.forcedCategory, usado
      //   depois em categoryForResult() pra navegar pra página certa.
      function groupEntriesIntoSections(entries, rotateWatchingOrder, forcedCategory, prioritizeSearchMatches) {
        const watchingEntries = entries.filter(e => e.tag === 'watching');
        const planEntries = entries.filter(e => e.tag === 'plan');
        const favEpEntries = entries.filter(e => e.tag === 'favep');
        const trueCharEntries = entries.filter(e => e.tag === 'trueCharacters');
        const otherEntries = entries.filter(e => e.tag !== 'watching' && e.tag !== 'plan' && e.tag !== 'favep' && e.tag !== 'trueCharacters');

        // Sempre (re)define forcedCategory nas entries desta renderização —
        // inclusive limpando (null) quando não há comando ativo — pra não
        // deixar "vazar" a categoria forçada de uma busca por comando
        // anterior (ex: "/romance") pra uma busca livre seguinte que
        // reaproveite o mesmo objeto de entry do índice.
        entries.forEach(e => { e.forcedCategory = forcedCategory || null; });

        const sections = [];

        // Announced Sequels: uma seção só, na ordem recebida (ordem da
        // lista), em vez de separar por Watching/Plan/Global.
        if (forcedCategory === 'announced') {
          const annEntries = entries.filter(e => e.tag !== 'favep' && e.tag !== 'trueCharacters');
          if (annEntries.length) {
            sections.push({
              text: CATEGORY_LABEL.announced || 'Announced Sequels',
              color: CATEGORY_HOVER_COLOR.announced || '#34d399',
              mode: 'announced',
              items: annEntries
            });
          }
          return sections;
        }

        if (watchingEntries.length) {
          const groups = {};
          watchingEntries.forEach(entry => {
            const key = entry.anime.season || WATCHING_NO_SEASON_KEY;
            (groups[key] = groups[key] || []).push(entry);
          });

          const labelFor = (key) => key === WATCHING_NO_SEASON_KEY
            ? WATCHING_NO_SEASON_LABEL
            : (WATCHING_SEASON_LABELS[key] || { text: key, color: CATEGORY_HOVER_COLOR.watching });

          const orderList = getWatchingSectionOrder(rotateWatchingOrder);
          orderList.forEach(key => {
            if (!groups[key]) return;
            const labelObj = labelFor(key);
            sections.push({ text: labelObj.text, color: labelObj.color, mode: 'watching', seasonKey: key, items: groups[key] });
          });

          // Fallback: qualquer temporada não prevista em WATCHING_BASE_ORDER
          // ainda aparece, só que depois das demais.
          Object.keys(groups).sort().forEach(key => {
            if (orderList.includes(key)) return;
            const labelObj = labelFor(key);
            sections.push({ text: labelObj.text, color: labelObj.color, mode: 'watching', seasonKey: key, items: groups[key] });
          });
        }

        if (planEntries.length) {
          sections.push({ text: 'Plan to Watch', color: CATEGORY_HOVER_COLOR.plan, mode: 'plan', items: planEntries });
        }

        // Global Ranking (e demais categorias forçadas) vem antes de Peak
        // Episodes e True Characters — essas duas são as de menor
        // importância na busca, então ficam por último.
        if (otherEntries.length) {
          const otherLabel = (forcedCategory && CATEGORY_LABEL[forcedCategory]) ? CATEGORY_LABEL[forcedCategory] : 'Global Ranking';
          const otherColor = (forcedCategory && CATEGORY_HOVER_COLOR[forcedCategory]) ? CATEGORY_HOVER_COLOR[forcedCategory] : '#7d8698';
          sections.push({ text: otherLabel, color: otherColor, mode: forcedCategory || 'all', items: otherEntries });
        }

        if (favEpEntries.length) {
          const favEpLabel = forcedCategory === 'favEpisodes' ? CATEGORY_LABEL.favEpisodes : 'Peak Episodes';
          sections.push({ text: favEpLabel, color: '#3b82f6', mode: 'favEpisodes', items: favEpEntries });
        }

        if (trueCharEntries.length) {
          sections.push({ text: CATEGORY_LABEL.trueCharacters, color: CATEGORY_HOVER_COLOR.trueCharacters, mode: 'trueCharacters', items: trueCharEntries });
        }

        // Em pesquisas normais, a relevância do título deve valer mais
        // que a ordem fixa das seções. Assim, ao buscar "Kingdom", a
        // seção que contém o título exato vem antes de uma seção com
        // "Tomb Raider King". Nos comandos (/watching, /all etc.), a
        // ordem original das listas continua intacta.
        if (prioritizeSearchMatches) {
          const sectionScore = section => Math.max(...section.items.map(item => item.__searchScore || 0));
          sections.sort((a, b) => sectionScore(b) - sectionScore(a));
        }

        return sections;
      }

      let activeIndex = -1;
      let currentMatches = [];
      const SEARCH_HISTORY_KEY = 'myhtml_search_history';
      const SEARCH_HISTORY_MAX = 50;

      // Ao expandir/recolher o drawer com resultados já na tela, o HTML
      // precisa ser remontado no layout certo (o expandido usa o wrapper
      // .search-groups + grid-row/grid-column inline; o recolhido, não).
      // Sem isso, o CSS do modo novo era aplicado em cima do HTML do modo
      // antigo e os cards ficavam bagunçados.
      (function watchDrawerLayoutChange() {
        const drawerEl = searchResults && searchResults.closest('.category-drawer');
        if (!drawerEl || !('MutationObserver' in window)) return;
        let wasExpanded = drawerEl.classList.contains('expanded');
        let settleTimer = 0;
        const relayoutNow = () => {
          if (!lastRenderedSections) return;
          if (searchResults.classList.contains('is-empty-state')) return;
          renderEntries(null, lastRenderedQuery, { relayout: true });
        };
        new MutationObserver(() => {
          const nowExpanded = drawerEl.classList.contains('expanded');
          if (nowExpanded === wasExpanded) return;
          wasExpanded = nowExpanded;
          relayoutNow();
          // Se o drawer anima a largura, a medição imediata pode estar
          // desatualizada: confere de novo depois da transição e só
          // remonta se a largura realmente mudou.
          clearTimeout(settleTimer);
          settleTimer = setTimeout(() => {
            if ((searchResults.clientWidth || 0) !== lastRenderedStageW) relayoutNow();
          }, 400);
        }).observe(drawerEl, { attributes: true, attributeFilter: ['class'] });
      })();

      function loadSearchHistory() {
        try {
          const parsed = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
          if (!Array.isArray(parsed)) return [];
          return parsed
            .filter(v => typeof v === 'string' && v.trim())
            .slice(-SEARCH_HISTORY_MAX);
        } catch (e) {
          return [];
        }
      }

      function saveSearchHistory() {
        try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory)); } catch (e) {}
      }

      const searchHistory = loadSearchHistory();
      let searchHistoryIndex = searchHistory.length;
      let searchHistoryDraft = '';

      function rememberSearchQuery(value) {
        const query = String(value || '').trim();
        if (query.length < MIN_QUERY_LENGTH || query.startsWith('/')) return;
        const existingIndex = searchHistory.indexOf(query);
        if (existingIndex !== -1) searchHistory.splice(existingIndex, 1);
        searchHistory.push(query);
        if (searchHistory.length > SEARCH_HISTORY_MAX) searchHistory.shift();
        searchHistoryIndex = searchHistory.length;
        searchHistoryDraft = '';
        saveSearchHistory();
      }

      function applySearchHistoryValue(value) {
        searchInput.value = value;
        searchInput.setSelectionRange(value.length, value.length);
        searchInput.dispatchEvent(new Event('input'));
      }

      function moveSearchHistory(direction) {
        if (!searchHistory.length) return false;
        if (searchHistoryIndex === -1 || searchHistoryIndex >= searchHistory.length) {
          searchHistoryIndex = searchHistory.length;
          searchHistoryDraft = searchInput.value;
        }
        const nextIndex = Math.max(0, Math.min(searchHistory.length, searchHistoryIndex + direction));
        if (nextIndex === searchHistoryIndex) return false;
        searchHistoryIndex = nextIndex;
        applySearchHistoryValue(
          searchHistoryIndex === searchHistory.length
            ? searchHistoryDraft
            : searchHistory[searchHistoryIndex]
        );
        return true;
      }

      function isSearchTabOpen() {
        return isDrawerOpen && !!document.querySelector('.drawer-tab[data-tab="search"].active');
      }

      function closeSearchDrawer(skipScrollRestore) {
        closeDrawer(skipScrollRestore);
      }

      function buildResultItemHtml(entry, i, acc, accGlow, query) {
            return `
              <div class="search-result-item${entry.tag === 'trueCharacters' ? ' search-result-item--tc' : ''}${(entry.forcedCategory === 'announced' && entry.tag !== 'favep' && entry.tag !== 'trueCharacters') ? ' search-result-item--ann' : ''}${(entry.tag !== 'favep' && entry.tag !== 'trueCharacters' && !nextSeasonMap[entry.anime.id]) ? ' search-result-item--no-ns' : ''}" data-idx="${i}" role="option" style="--acc: ${acc}; --acc-glow: ${accGlow};">
                <div class="search-result-card-inner">
                  <div class="search-result-ambient" aria-hidden="true"></div>
                  <div class="search-result-ambient-shade" aria-hidden="true"></div>
                  <div class="search-result-thumb-wrap">
                    <img class="search-result-thumb" data-src="${(entry.forcedCategory === 'announced' && entry.tag !== 'favep' && entry.tag !== 'trueCharacters' && typeof sequelsThumbSrc === 'function') ? sequelsThumbSrc(entry.anime.img) : searchThumbSrc(entry.tag === 'favep' ? getFavEpThumb(entry.anime) : entry.anime.img)}" alt="" loading="lazy">

                  </div>
                  <div class="search-result-info">
                    ${(entry.forcedCategory === 'announced' && entry.tag !== 'favep' && entry.tag !== 'trueCharacters') ? '<div class="search-result-title-row">' : ''}${buildSearchRankHtml(entry)}
                    <span class="search-result-title">${highlightTitle(entry.anime.title, query)}</span>${(entry.forcedCategory === 'announced' && entry.tag !== 'favep' && entry.tag !== 'trueCharacters') ? '</div>' : ''}
                    ${entry.__matchedAlias ? `<span class="search-result-alias">aka: ${escapeHtml(entry.__matchedAlias)}</span>` : ''}
                    ${(() => {
                      if (entry.tag === 'favep') {
                        return entry.anime.subtitle ? `<span class="search-result-meta">${entry.anime.subtitle}</span>` : '';
                      }
                      if (entry.tag !== 'watching') {
                        return entry.anime.info ? `<span class="search-result-meta">${String(entry.anime.info).split(/<br\s*\/?>/i)[0].trim()}</span>` : '';
                      }
                      const remaining = String(entry.anime.info || '')
                        .split(/<br\s*\/?>/i)[0]
                        .replace(/[-–:]?\s*Progress:\s*(?:\d+|-)\s*\/\s*(?:\d+|-)\s*/i, '')
                        .trim();
                      const metaHtml = remaining ? `<span class="search-result-meta">${remaining}</span>` : '';
                      return metaHtml + buildSearchProgressHtml(entry.anime, acc);
                    })()}
                  </div>
                    ${(() => {
                      // No card de Peak Episodes (favep) não mostramos a faixa de
                      // "nova temporada anunciada" — ela não faz sentido nesse
                      // contexto (o card é sobre um episódio específico, não sobre
                      // o anime como um todo).
                      if (entry.tag === 'favep') return '';
                      const ns = nextSeasonMap[entry.anime.id];
                      if (!ns) return '';
                      const nsLines = String(ns.info).split(/<\/br>|<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);
                      const isMulti = nsLines.length > 1;
                      return `<div class="announce-strip search-result-next-season"${isMulti ? ` data-lines='${JSON.stringify(nsLines).replace(/'/g, "&apos;")}'` : ''}>
                                <div class="announce-track"><span class="announce-line">${nsLines[0]}</span></div>
                              </div>`;
                    })()}
                </div>
                <svg class="search-result-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
              </div>`;
      }

      // Guarda as seções da última renderização pra poder remontar só o
      // LAYOUT (ao expandir/recolher o drawer) sem refazer a busca, sem
      // avançar a rotação do Watching Now e sem trocar as imagens.
      let lastRenderedSections = null;
      let lastRenderedQuery = '';
      let lastRenderedStageW = 0;

      function renderEntries(entries, query, opts) {
        const relayout = !!(opts && opts.relayout && lastRenderedSections);
        const cmd = getSlashCommand(query);
        const shouldRotateWatching = !!(cmd && SLASH_COMMANDS[cmd].rotateWatching);
        const forcedCategory = cmd ? (CATEGORY_FOR_COMMAND[cmd] || null) : null;
        const sections = relayout
          ? lastRenderedSections
          : groupEntriesIntoSections(entries, shouldRotateWatching, forcedCategory, !!normalize(query) && !cmd);
        // Só avança a rotação depois de já ter montado as seções desta
        // renderização, pra próxima vez que o comando for acionado começar
        // do próximo grupo da lista cíclica.
        if (shouldRotateWatching && !relayout) advanceWatchingRotationIndex();
        lastRenderedSections = sections.some(sec => sec.items.length) ? sections : null;
        lastRenderedQuery = query;
        currentMatches = sections.flatMap(section => section.items);
        activeIndex = -1;

        if (!currentMatches.length) {
          favEpVisibleIdsLastRender = new Set();
          searchResults.classList.add('is-empty-state');
          if (searchPanelEl) searchPanelEl.classList.toggle('is-no-results', !!query);
          searchResults.innerHTML = query
            ? `<div class="search-empty">
                <div class="search-empty-title search-empty-title--caps">NADA ENCONTRADO</div>
                <div class="search-empty-sub">Não achamos nenhum <mark>${escapeHtml(query)}</mark>. Tente outro nome ou revise a digitação.</div>
              </div>`
            : `<div class="search-empty">
                <div class="search-empty-title">Nada por aqui ainda</div>
              </div>`;
          return;
        }

        // Ids de Peak Episodes visíveis NESTA renderização — usado pelo
        // getFavEpThumb() acima pra saber se o item "continuou visível"
        // (mesma busca sendo completada, mantém a imagem) ou "sumiu e
        // voltou" (nova busca de fato, avança pra próxima imagem). Só
        // sobrescreve favEpVisibleIdsLastRender no final desta função,
        // depois que getFavEpThumb() já comparou com o estado anterior.
        const favEpIdsThisRender = new Set(
          currentMatches.filter(e => e.tag === 'favep').map(e => e.anime.id)
        );

        searchResults.classList.remove('is-empty-state');
        if (searchPanelEl) searchPanelEl.classList.remove('is-no-results');

        const accFor = (section) => {
          const acc = section.color || '#e2e8f0';
          let accGlow = 'transparent';
          try {
            const { r, g, b } = hexToRgb(acc);
            accGlow = `rgba(${r}, ${g}, ${b}, 0.35)`;
          } catch (e) {}
          return { acc, accGlow };
        };

        // ── Empacotamento das seções ──────────────────────────────
        // Só no drawer expandido (grade de 6 colunas; card normal = 2
        // colunas, True Characters = 3). Cada seção é quebrada em
        // "pedaços" de uma fileira; o 1º pedaço leva o título. Cada
        // categoria fica na(s) sua(s) própria(s) linha(s): nenhuma
        // seção divide linha com outra, mesmo que sobre espaço.
        const expandedLayout = !!searchResults.closest('.category-drawer.expanded');
        const stageW = searchResults.clientWidth || 0;
        lastRenderedStageW = stageW;
        const basePerRow = stageW && stageW <= 480 ? 1 : (stageW && stageW <= 760 ? 2 : 3);
        const pieces = [];
        if (expandedLayout) {
          const rows = [];
          // Tipo de cada linha ('tc' = True Characters, 'other' = o resto).
          // Personagens nunca dividem linha com animes/episódios (e vice-versa),
          // mesmo que sobre espaço — cada tipo fica na sua própria fileira.
          const rowKinds = [];
          sections.forEach(section => {
            const isTc = section.items.every(e => e.tag === 'trueCharacters');
            const kind = isTc ? 'tc' : 'other';
            const perRow = isTc ? Math.min(2, basePerRow) : basePerRow;
            const unit = 6 / perRow;
            let prevRow = -1;
            for (let k = 0, first = true; k < section.items.length; k += perRow, first = false) {
              const chunk = section.items.slice(k, k + perRow);
              const units = chunk.length * unit;
              // Cada categoria ocupa suas próprias linhas: nunca divide
              // linha com outra categoria (nem com sobras de outra), então
              // todo pedaço abre uma linha nova.
              rows.push(6); rowKinds.push(kind);
              const r = rows.length - 1;
              rows[r] -= units;
              prevRow = r;
              pieces.push({ section, items: chunk, row: r, span: units, head: first });
            }
          });
          // Ordem visual: por linha (estável) — assim as setas ↑/↓ e o
          // setActiveResult seguem exatamente o que aparece na tela.
          pieces.sort((x, y) => x.row - y.row);
        } else {
          sections.forEach(section => pieces.push({ section, items: section.items, row: 0, span: 0, head: true }));
        }
        currentMatches = pieces.flatMap(pc => pc.items);

        // Linhas que têm pelo menos um bloco com título. Nelas, os
        // blocos de continuação ganham um cabeçalho fantasma (só pra
        // alinhar os cards). Linhas SÓ de continuação ficam sem
        // cabeçalho e coladas na linha de cima (mesma categoria =
        // mais perto que o normal).
        const rowsWithHead = new Set(pieces.filter(p => p.head).map(p => p.row));
        let idxCounter = 0;
        const piecesHtml = pieces.map(pc => {
          const isCont = expandedLayout && !pc.head && !rowsWithHead.has(pc.row);
          const headerHtml = (pc.head || (expandedLayout && !isCont)) ? `
            <div class="search-section-header${pc.head ? '' : ' is-ghost'}${pc.head && pc.section.mode ? ' is-link' : ''}" style="--section-color: ${pc.section.color};"${pc.head ? (pc.section.mode ? ` data-mode="${pc.section.mode}"${pc.section.seasonKey ? ` data-season="${pc.section.seasonKey}"` : ''} role="link" tabindex="0"`: '') : ' aria-hidden="true"'}>
              <span class="search-section-text">${pc.section.text}</span>
              <div class="search-section-line"></div>
            </div>` : '';
          const { acc, accGlow } = accFor(pc.section);
          const itemsHtml = pc.items.map(entry => buildResultItemHtml(entry, idxCounter++, acc, accGlow, query)).join('');
          const style = expandedLayout
            ? ` style="grid-row: ${pc.row + 1}; grid-column: span ${pc.span}; --m: ${pc.items.length};"`
            : '';
          return `<div class="search-section-group${isCont ? ' is-cont' : ''}"${style}>${headerHtml}${itemsHtml}</div>`;
        }).join('');
        searchResults.innerHTML = expandedLayout
          ? `<div class="search-groups">${piecesHtml}</div>`
          : piecesHtml;

        favEpVisibleIdsLastRender = favEpIdsThisRender;

        initAnnounceStrips();

        searchResults.querySelectorAll('.search-result-thumb').forEach(img => {
          const src = img.getAttribute('data-src');
          if (!src) return;
          const item = img.closest('.search-result-item');
          const ambient = item ? item.querySelector('.search-result-ambient') : null;
          img.addEventListener('load', () => {
            if (ambient) {
              // Mesma URL do thumb, já em cache — usa como wallpaper borrado do card.
              ambient.style.backgroundImage = `url("${src}")`;
              ambient.classList.add('ready');
            }
          }, { once: true });
          img.src = src;
        });

        searchResults.querySelectorAll('.search-result-item').forEach(el => {
          el.addEventListener('click', (e) => {
            // Se o usuário estava selecionando texto (pra copiar o nome, por
            // exemplo), não navega — só navega em um clique "seco".
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0 && el.contains(selection.anchorNode)) return;
            const idx = parseInt(el.getAttribute('data-idx'), 10);
            selectResult(idx);
          });
        });
      }

      // Clicar no título de uma categoria nos resultados (ex: "Spring
      // Season 2026", "Plan to Watch", "Global Ranking", "Peak Episodes")
      // leva direto pra lista dessa categoria. Reaproveita o clique do
      // item correspondente do drawer (hash, scroll, render e fechar o
      // drawer ficam idênticos a escolher a categoria no menu).
      let __seasonJumpCancel = null;
      function scrollToWatchingSeason(seasonKey) {
        if (!seasonKey) return;
        if (__seasonJumpCancel) __seasonJumpCancel();
        const findHeader = () => {
          const list = document.getElementById('animeRankingList');
          return list && Array.from(list.querySelectorAll('.season-header[data-season]'))
            .find(h => h.getAttribute('data-season') === seasonKey);
        };
        const html = document.documentElement;
        const prevBehavior = html.style.scrollBehavior;
        html.style.scrollBehavior = 'auto';
        let stopped = false;
        let timer = 0;
        const stop = () => {
          if (stopped) return;
          stopped = true;
          clearInterval(timer);
          html.style.scrollBehavior = prevBehavior;
          ['wheel', 'touchstart', 'keydown'].forEach(t => window.removeEventListener(t, stop, true));
          __seasonJumpCancel = null;
        };
        __seasonJumpCancel = stop;
        // Se o usuário rolar/tocar por conta própria, para de corrigir.
        ['wheel', 'touchstart', 'keydown'].forEach(t => window.addEventListener(t, stop, { capture: true, passive: true }));
        const OFFSET = 90;
        let ticks = 0;
        const jump = () => {
          const header = findHeader();
          if (ticks === 0) console.log('[season-jump] temporada:', seasonKey, '| cabeçalho encontrado:', !!header);
          if (header) {
            if (document.body.style.position === 'fixed') releaseBodyScrollForNavigation();
            // scrollIntoView funciona com qualquer contêiner rolável; depois
            // sobe OFFSET px pra deixar o título respirando no topo.
            header.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' });
            window.scrollBy(0, -OFFSET);
          }
          // Corrige por ~3s: fechar o drawer restaura o scroll antigo e as
          // capas carregando mudam a altura da lista.
          if (++ticks >= 30) stop();
        };
        jump();
        timer = setInterval(jump, 100);
      }

      function openCategoryFromSearch(mode, seasonKey) {
        if (!mode) return;
        if (mode === 'watching' && seasonKey) {
          openCategoryFromSearch(mode);
          scrollToWatchingSeason(seasonKey);
          return;
        }
        const targetItem = (typeof drawerItems !== 'undefined' && Array.isArray(drawerItems))
          ? drawerItems.find(item => item.getAttribute('data-mode') === mode)
          : document.querySelector(`.drawer-item[data-mode="${mode}"]:not([disabled])`);
        if (targetItem) { targetItem.click(); return; }
        // Categoria sem item no drawer: troca direto.
        window.__posterReturnAfterSearch = null;
        releaseBodyScrollForNavigation();
        if (currentCategory !== mode) {
          currentCategory = mode;
          render();
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
        closeSearchDrawer();
      }

      // Hover dos títulos de categoria da busca: igual ao do título de
      // temporada do Watching Now — só o texto escurece (fade suave) e o
      // cursor vira mãozinha. A linha ao lado não muda. Injetado aqui
      // porque o CSS da página não faz parte deste arquivo.
      if (!document.getElementById('searchSectionHeaderHoverStyle')) {
        const hoverStyle = document.createElement('style');
        hoverStyle.id = 'searchSectionHeaderHoverStyle';
        hoverStyle.textContent = `
          .search-section-header.is-link .search-section-text {
            cursor: pointer;
            transition: opacity .2s ease;
          }
          .search-section-header.is-link .search-section-text:hover,
          .search-section-header.is-link:focus-visible .search-section-text {
            opacity: .75;
          }
          .search-section-header.is-link:focus-visible { outline: none; }
        `;
        document.head.appendChild(hoverStyle);
      }

      if (searchResults && !searchResults.__sectionHeaderLinks) {
        searchResults.__sectionHeaderLinks = true;
        const headerFromEvent = (e) => {
          const header = e.target.closest && e.target.closest('.search-section-header.is-link');
          return header && searchResults.contains(header) ? header : null;
        };
        searchResults.addEventListener('click', (e) => {
          const header = headerFromEvent(e);
          if (!header) return;
          // Só o texto do título é clicável (a linha ao lado não).
          if (!e.target.closest('.search-section-text')) return;
          const selection = window.getSelection();
          if (selection && selection.toString().length > 0 && header.contains(selection.anchorNode)) return;
          openCategoryFromSearch(header.getAttribute('data-mode'), header.getAttribute('data-season'));
        });
        searchResults.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          const header = headerFromEvent(e);
          if (!header || e.target !== header) return;
          e.preventDefault();
          openCategoryFromSearch(header.getAttribute('data-mode'), header.getAttribute('data-season'));
        });
      }

      // Volta o palco pro carrossel: some com os cards de resultado e some
      // com a classe que revela a grade (ver CSS de .has-min-query).
      function resetToCarouselStage() {
        searchResults.innerHTML = '';
        searchResults.classList.remove('is-empty-state');
        currentMatches = [];
        activeIndex = -1;
        favEpVisibleIdsLastRender = new Set();
        if (searchPanelEl) searchPanelEl.classList.remove('has-min-query');
        if (searchPanelEl) searchPanelEl.classList.remove('is-no-results');
      }

      // pré-definidos agrupados nas mesmas seções de sempre.
      // "/all"        -> tudo (Global Ranking + Watching Now + Plan to Watch)
      // "/ranking"    -> só Global Ranking
      // "/watching"   -> só Watching Now
      // "/planwatch"  -> só Plan to Watch
      // "/romance"    -> só a lista Romance Anime
      // "/isekai"     -> só a lista Isekai & Reincarnation
      // "/sport"      -> só a lista Sport Anime
      // "/comedy"     -> só a lista Comedy Anime
      // "/mecha"      -> só a lista Mecha/Cyberpunk
      // "/incomplete" -> só a lista Incomplete
      // "/announced"  -> só a lista Announced Sequels
      // "/peak"       -> só a lista Peak Episodes
      //
      // As últimas 7 usam os mesmos dados/critérios de getFilteredData()
      // (SUB_CATEGORY_SETS, planIds, nextSeasonMap), só que aplicados em
      // cima das entries do índice de busca (que já carregam a tag de
      // origem: 'watching' | 'plan' | 'favep' | null-para-animeData).
      function isSubCategoryEntry(entry, key) {
        // Mesma regra de getFilteredData(mode) pra romance/isekai/sports/mecha:
        // só conta quem vem do Global Ranking (tag null) e não está em Plan to Watch.
        return entry.tag === null
          && SUB_CATEGORY_SETS[key].has(entry.anime.id)
          && !planIds.has(entry.anime.id);
      }
      const ANNOUNCED_RANKED_IDS = new Set(
        animeData.filter(a => nextSeasonMap[a.id] && !planIds.has(a.id)).map(a => a.id)
      );
      const SLASH_COMMANDS = {
        '/all':         { filter: () => true,                         rotateWatching: true  },
        '/ranking':     { filter: entry => entry.tag !== 'watching' && entry.tag !== 'plan' && entry.tag !== 'favep' && entry.tag !== 'trueCharacters', rotateWatching: false },
        '/watching':    { filter: entry => entry.tag === 'watching',  rotateWatching: true  },
        '/planwatch':   { filter: entry => entry.tag === 'plan',      rotateWatching: false },
        '/romance':     { filter: entry => isSubCategoryEntry(entry, 'romance'), rotateWatching: false },
        '/isekai':      { filter: entry => isSubCategoryEntry(entry, 'isekai'),  rotateWatching: false },
        '/sport':       { filter: entry => isSubCategoryEntry(entry, 'sports'),  rotateWatching: false },
        '/comedy':      { filter: entry => isSubCategoryEntry(entry, 'comedy'),  rotateWatching: false },
        '/mecha':       { filter: entry => isSubCategoryEntry(entry, 'mecha'),   rotateWatching: false },
        '/incomplete':  { filter: entry => entry.tag === null && !!entry.anime.info && entry.anime.info.includes('⏸') && !planIds.has(entry.anime.id), rotateWatching: false },
        // Mesma regra da lista Announced Sequels: se o anime já está no All
        // Ranking, essa é a entrada canônica — a cópia do Watching Now não
        // aparece de novo (casos como Kingdom e DanMachi).
        '/announced':   { filter: entry => {
            const id = entry.anime.id;
            if (!nextSeasonMap[id]) return false;
            if (entry.tag === null) return !planIds.has(id);
            if (entry.tag === 'watching') return !ANNOUNCED_RANKED_IDS.has(id);
            return entry.tag === 'plan';
          }, rotateWatching: false },
        '/episodes':        { filter: entry => entry.tag === 'favep', rotateWatching: false },
        '/characters':      { filter: entry => entry.tag === 'trueCharacters', rotateWatching: false }
      };
      // Mapeia cada comando pra chave de categoria usada em CATEGORY_LABEL /
      // CATEGORY_HOVER_COLOR / navigateToAnimeInCategory, pra rotular a
      // seção de resultados corretamente e navegar pra página certa ao
      // clicar num item.
      const CATEGORY_FOR_COMMAND = {
        '/romance':    'romance',
        '/isekai':     'isekai',
        '/sport':      'sports',
        '/comedy':     'comedy',
        '/mecha':      'mecha',
        '/incomplete': 'incomplete',
        '/announced':  'announced',
        '/episodes':       'favEpisodes',
        '/characters':     'trueCharacters'
      };
      const SLASH_COMMAND_LIST = Object.keys(SLASH_COMMANDS);

      // ── Prévia (hover no drawer expandido): mesmos cards da busca ──
      // Monta o HTML dos primeiros cards da lista como se fosse o resultado
      // do comando (/comedy, /romance...), reaproveitando o template real.
      const PREVIEW_MODE_FILTER = {
        all:           entry => entry.tag === null && !planIds.has(entry.anime.id),
        romance:       SLASH_COMMANDS['/romance'].filter,
        isekai:        SLASH_COMMANDS['/isekai'].filter,
        sports:        SLASH_COMMANDS['/sport'].filter,
        comedy:        SLASH_COMMANDS['/comedy'].filter,
        mecha:         SLASH_COMMANDS['/mecha'].filter,
        watching:      SLASH_COMMANDS['/watching'].filter,
        plan:          SLASH_COMMANDS['/planwatch'].filter,
        incomplete:    SLASH_COMMANDS['/incomplete'].filter,
        announced:     SLASH_COMMANDS['/announced'].filter,
        favEpisodes:   SLASH_COMMANDS['/episodes'].filter,
        trueCharacters: SLASH_COMMANDS['/characters'].filter
      };
      const PREVIEW_MODE_FORCED = {
        romance: 'romance', isekai: 'isekai', sports: 'sports', comedy: 'comedy',
        mecha: 'mecha', incomplete: 'incomplete', announced: 'announced',
        favEpisodes: 'favEpisodes', trueCharacters: 'trueCharacters'
      };
      // Ordem aleatória da prévia: um valor sorteado por entrada, por modo.
      const __previewOrder = new Map();
      function previewRand(mode, entry) {
        let m = __previewOrder.get(mode);
        if (!m) { m = new Map(); __previewOrder.set(mode, m); }
        if (!m.has(entry)) m.set(entry, Math.random());
        return m.get(entry);
      }
      window.__resetSearchPreviewShuffle = function () { __previewOrder.clear(); };
      window.__buildSearchPreview = function (mode, target, limit) {
        const filter = PREVIEW_MODE_FILTER[mode];
        if (!filter || !target) return 0;
        const entries = searchIndex.filter(filter);
        // groupEntriesIntoSections grava forcedCategory nas entries; guarda
        // e restaura pra não interferir numa busca que esteja na tela.
        const saved = entries.map(e => e.forcedCategory);
        const sections = groupEntriesIntoSections(entries, false, PREVIEW_MODE_FORCED[mode] || null, false);
        // Em vez de seguir a ordem do ranking, sorteia quais cards aparecem.
        // O sorteio é guardado por modo e só é refeito quando o drawer é
        // aberto de novo (__resetSearchPreviewShuffle) — enquanto estiver
        // aberto, passar o mouse de volta numa lista mostra sempre os mesmos.
        const pairs = [];
        sections.forEach(section => section.items.forEach(entry => pairs.push({ section, entry })));
        pairs.sort((a, b) => previewRand(mode, a.entry) - previewRand(mode, b.entry));
        const picked = pairs.slice(0, limit);
        const html = [];
        let n = 0;
        picked.forEach(({ section, entry }) => {
          const acc = section.color || '#e2e8f0';
          let accGlow = 'transparent';
          try { const { r, g, b } = hexToRgb(acc); accGlow = `rgba(${r}, ${g}, ${b}, 0.35)`; } catch (e) {}
          html.push(buildResultItemHtml(entry, -1, acc, accGlow, ''));
          n++;
        });
        target.innerHTML = html.join('');
        entries.forEach((e, k) => { e.forcedCategory = saved[k]; });
        // Clique num card da prévia leva pro anime, igual ao resultado de busca.
        const shown = picked.map(p => p.entry);
        target.querySelectorAll('.search-result-item').forEach((el, k) => {
          const entry = shown[k];
          if (!entry) return;
          el.addEventListener('click', () => {
            const prevForced = entry.forcedCategory;
            entry.forcedCategory = PREVIEW_MODE_FORCED[mode] || null;
            const cat = categoryForResult(entry);
            entry.forcedCategory = prevForced;
            openSearchEntry(entry, cat);
          });
        });
        target.querySelectorAll('.search-result-thumb').forEach(img => {
          const src = img.getAttribute('data-src');
          if (!src) return;
          const item = img.closest('.search-result-item');
          const ambient = item ? item.querySelector('.search-result-ambient') : null;
          img.addEventListener('load', () => {
            if (ambient) {
              ambient.style.backgroundImage = `url("${src}")`;
              ambient.classList.add('ready');
            }
          }, { once: true });
          img.src = src;
        });
        initAnnounceStrips();
        return n;
      };

      function getSlashCommand(query) {
        const norm = normalize(query);
        return SLASH_COMMANDS[norm] ? norm : null;
      }

      // Primeiro "malName" cadastrado do anime: percorre a lista "mal" na
      // ordem, ignora separadores (spacer) e entradas sem malName, e devolve
      // o primeiro nome encontrado (normalmente o da 1ª temporada). Antes só
      // olhava mal[0], então falhava quando o primeiro item era um separador
      // ou não tinha malName. Os nomes das temporadas seguintes continuam
      // fora da busca, pra não gerar falsos positivos entre animes diferentes.
      function firstMalNameOf(anime) {
        if (!anime || !Array.isArray(anime.mal)) return '';
        for (const m of anime.mal) {
          if (!m || isMalDividerEntry(m)) continue;
          if (typeof m.malName === 'string' && m.malName.trim()) return m.malName.trim();
        }
        return '';
      }

      // ── Busca por anime também mostra os True Characters dele ──
      // Cada personagem em trueCharactersData guarda em "info" o título da
      // obra de origem. Aqui montamos (uma vez, sob demanda) um mapa
      // id do anime (em animeData) -> entradas de personagem do índice,
      // usando a mesma regra do poster lightbox (findAllAnimeForCharacter).
      let charactersByOriginIdCache = null;
      function getCharactersByOriginId() {
        if (charactersByOriginIdCache) return charactersByOriginIdCache;
        const map = new Map();
        searchIndex.forEach(entry => {
          if (entry.tag !== 'trueCharacters') return;
          let origin = null;
          try { origin = findAllAnimeForCharacter(entry.anime.info); } catch (e) {}
          if (!origin) return;
          if (!map.has(origin.id)) map.set(origin.id, []);
          map.get(origin.id).push(entry);
        });
        charactersByOriginIdCache = map;
        return map;
      }

      // Recebe os resultados da busca e acrescenta (sem duplicar) os
      // personagens das obras que apareceram bem colocadas. Os personagens
      // herdam uma nota logo abaixo da do anime, então a seção "True
      // Characters" fica logo depois da seção do anime.
      const ORIGIN_CHARACTERS_MIN_SCORE = 450;
      const ORIGIN_CHARACTERS_MAX_ANIME = 3;
      const ORIGIN_CHARACTERS_MAX_TOTAL = 12;
      function appendOriginCharacters(matches) {
        const byOrigin = getCharactersByOriginId();
        if (!byOrigin.size) return matches;
        const present = new Set(matches.map(e => e.tag + '::' + e.anime.id));
        const extra = [];
        let animeCount = 0;
        for (const entry of matches) {
          if (entry.tag !== null && entry.tag !== 'watching') continue;
          if ((entry.__searchScore || 0) < ORIGIN_CHARACTERS_MIN_SCORE) continue;
          const chars = byOrigin.get(entry.anime.id);
          if (!chars || !chars.length) continue;
          if (++animeCount > ORIGIN_CHARACTERS_MAX_ANIME) break;
          chars.forEach(c => {
            const key = c.tag + '::' + c.anime.id;
            if (present.has(key)) return;
            present.add(key);
            c.__matchedAlias = null;
            c.__searchScore = (entry.__searchScore || 0) - 1;
            extra.push(c);
          });
        }
        return matches.concat(extra.slice(0, ORIGIN_CHARACTERS_MAX_TOTAL));
      }

      function renderResults(query) {
        const cmd = getSlashCommand(query);
        if (cmd) {
          const entries = searchIndex.filter(SLASH_COMMANDS[cmd].filter);
          entries.forEach(e => { e.__matchedAlias = null; });
          // /announced: segue a ordem real da lista Announced Sequels
          // (01, 02, 03...), em vez da ordem do índice de busca.
          if (cmd === '/announced') {
            const annRanks = searchCategoryRankMaps.get('announced');
            const rankOf = e => {
              const r = annRanks && annRanks.get(e.anime);
              return r == null ? Infinity : r;
            };
            entries.sort((a, b) => rankOf(a) - rankOf(b));
          }
          renderEntries(entries, query);
          return;
        }

        const q = normalize(query);
        const matches = q
          ? searchIndex
              .map(entry => {
                const titleScore = fuzzyMatchScore(query, entry.anime.searchText || entry.anime.title);
                // Também busca pelo malName do 1º item de entry.anime.mal
                // (nome oficial/MAL da 1ª temporada) — só o primeiro, não
                // os das outras temporadas, pra não gerar falsos positivos
                // entre animes diferentes que compartilham palavras no MAL.
                const firstMalName = firstMalNameOf(entry.anime);
                const malScore = firstMalName ? fuzzyMatchScore(query, firstMalName) : 0;
                let score = Math.max(titleScore, malScore);
                entry.__matchedAlias = null;
                // Sem match direto no título? Tenta os nomes alternativos.
                // Valem um pouco menos (x0.9) pra o título real vir primeiro.
                if (score < 700) {
                  altNamesFor(entry).forEach(name => {
                    const aliasScore = Math.round(fuzzyMatchScore(query, name) * 0.9);
                    if (aliasScore > score) {
                      score = aliasScore;
                      entry.__matchedAlias = name;
                    }
                  });
                }
                entry.__searchScore = score;
                return { entry, score };
              })
              .filter(x => x.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 30)
              .map(x => x.entry)
          : [];

        renderEntries(appendOriginCharacters(matches), query);
      }

      function setActiveResult(idx) {
        const items = searchResults.querySelectorAll('.search-result-item');
        items.forEach(el => el.classList.remove('active'));
        const el = items[idx];
        if (el) {
          el.classList.add('active');
          el.scrollIntoView({ block: 'nearest' });
        }
      }

      function navigateToFavoriteEpisode(index) {
        if (!Number.isInteger(index) || index < 0) return;
        releaseBodyScrollForNavigation();
        if (currentCategory !== 'favEpisodes') {
          currentCategory = 'favEpisodes';
          render();
        }
        const reveal = typeof window.triggerExpand === 'function'
          ? Promise.resolve(window.triggerExpand())
          : Promise.resolve();
        reveal.then(() => {
          const attempts = 18;
          const findAndScroll = (left) => {
            const list = document.getElementById('animeRankingList');
            const card = list && list.querySelector(`.fav-ep-card[data-fav-ep-index="${index}"]`);
            if (card) {
              card.classList.remove('hidden-item');
              releaseBodyScrollForNavigation();
              requestAnimationFrame(() => {
                card.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
                document.querySelectorAll('.highlight-active').forEach(el => el.classList.remove('highlight-active'));
                card.classList.add('highlight-active');
                setTimeout(() => card.classList.remove('highlight-active'), 3000);
              });
              return;
            }
            if (left > 0) setTimeout(() => findAndScroll(left - 1), 80);
          };
          findAndScroll(attempts);
        });
      }

      function selectResult(idx) {
        const entry = currentMatches[idx];
        if (!entry) return;

        rememberSearchQuery(searchInput.value);
        openSearchEntry(entry, categoryForResult(entry));
      }

      function openSearchEntry(entry, targetCategory) {
        window.__posterReturnAfterSearch = null;
        const targetId = entry.anime.id;

        closeSearchDrawer(true);
        searchInput.value = '';
        searchBoxDrawer.classList.remove('has-value');
        resetToCarouselStage();
        updateGhostHint();
        hideSlashCommandList();

        if (entry.tag === 'favep') navigateToFavoriteEpisode(entry.anime.favEpIndex);
        else navigateToAnimeInCategory(targetId, targetCategory);
      }

      // Sugestão sutil dos comandos de barra: enquanto o usuário digita algo
      // que ainda pode virar um dos comandos (ex.: "/", "/a", "/al"...),
      // mostra o restante das letras em itálico apagado logo depois do
      // cursor, tipo o "Digite para Drawer" do menu de comandos do chat.
      const searchGhostHint = document.getElementById('searchGhostHint');

      // Comando sorteado quando o campo tem só "/" — sorteia de novo toda
      // vez que o usuário volta pro "/" sozinho (apaga tudo e digita "/"
      // de novo), pra não mostrar sempre "/all" como sugestão-fantasma.
      let ghostRandomPick = null;
      // Guarda se a última chamada já estava com o campo em "/" sozinho —
      // assim só sorteamos de novo na TRANSIÇÃO pra esse estado (usuário
      // apagou tudo e digitou "/" de novo), não em toda chamada subsequente
      // enquanto o campo continua só "/" (senão o Tab, que chama essa
      // função de novo, re-sorteava e completava outro comando diferente
      // do que estava sendo mostrado no ghost).
      let wasSlashOnly = false;
      function pickRandomSlashCommand(excludeCommand) {
        const pool = SLASH_COMMAND_LIST;
        if (!pool.length) return null;
        if (pool.length === 1) return pool[0];
        let candidate;
        do {
          candidate = pool[Math.floor(Math.random() * pool.length)];
        } while (candidate === excludeCommand);
        return candidate;
      }

      // Encontra o restante das letras do comando a sugerir. Enquanto o
      // campo é só "/", sorteia um comando aleatório entre todos; assim
      // que o usuário digita mais letras, mantém esse sorteio contanto
      // que ele ainda bata com o que foi digitado — senão cai pro
      // primeiro comando da lista que bater (completude normal).
      function getSlashCommandRemainder(val) {
        if (!val) { ghostRandomPick = null; wasSlashOnly = false; return ''; }
        const lower = val.toLowerCase();
        if (lower[0] !== '/') { ghostRandomPick = null; wasSlashOnly = false; return ''; }

        if (lower === '/') {
          // só re-sorteia se AINDA não tínhamos um pick pra essa "sessão"
          // de "/" sozinho (ou seja, é a primeira chamada depois de ter
          // chegado nesse estado) — chamadas repetidas (ex.: Tab logo em
          // seguida) mantêm o mesmo comando já mostrado no ghost.
          if (!wasSlashOnly || !ghostRandomPick) {
            ghostRandomPick = pickRandomSlashCommand(ghostRandomPick);
          }
          wasSlashOnly = true;
        } else {
          wasSlashOnly = false;
          if (!ghostRandomPick || !ghostRandomPick.startsWith(lower)) {
            ghostRandomPick = SLASH_COMMAND_LIST.find(c => c.startsWith(lower)) || null;
          }
        }

        if (!ghostRandomPick || ghostRandomPick.length <= val.length) return '';
        return ghostRandomPick.slice(val.length);
      }

      function updateGhostHint() {
        if (!searchGhostHint) return;
        const val = searchInput.value;
        const remainder = getSlashCommandRemainder(val);
        const isSlash = val[0] === '/';
        if (searchBoxDrawer) searchBoxDrawer.classList.toggle('slash-mode', isSlash);

        searchGhostHint.innerHTML = '';
        if (searchBoxDrawer) searchBoxDrawer.classList.remove('is-preview-ghost');

        if (isSlash) {
          // Overlay que espelha o texto já digitado — o input de verdade
          // fica com o texto transparente (ver .slash-mode no CSS) e é
          // esse overlay que aparece por baixo, só que com a "/" pintada
          // na cor do comando que está batendo (ghostRandomPick, setado
          // dentro de getSlashCommandRemainder logo acima).
          const typedSpan = document.createElement('span');
          typedSpan.className = 'ghost-typed';
          const slashSpan = document.createElement('span');
          slashSpan.className = 'ghost-typed-slash';
          slashSpan.textContent = '/';
          const style = ghostRandomPick ? SLASH_COMMAND_STYLE[ghostRandomPick] : null;
          if (style && style.color) slashSpan.style.color = style.color;
          typedSpan.appendChild(slashSpan);
          typedSpan.appendChild(document.createTextNode(val.slice(1)));
          searchGhostHint.appendChild(typedSpan);
        }

        if (remainder) {
          const suggestionSpan = document.createElement('span');
          suggestionSpan.className = 'ghost-suggestion';
          suggestionSpan.textContent = remainder;
          searchGhostHint.appendChild(suggestionSpan);
        }
      }

      // Prévia (hover numa lista no drawer expandido): mostra o comando da
      // lista (ex.: /mecha) apagado na barra, só enquanto o campo está vazio.
      let previewGhostCmd = '';
      window.__setSearchPreviewGhost = function (cmd) {
        if (!searchGhostHint || !searchInput || !searchBoxDrawer) return;
        if (searchInput.value) { previewGhostCmd = ''; return; }
        previewGhostCmd = cmd || '';
        searchGhostHint.innerHTML = '';
        searchBoxDrawer.classList.toggle('is-preview-ghost', !!cmd);
        if (!cmd) return;
        const span = document.createElement('span');
        span.className = 'ghost-preview';
        span.textContent = cmd;
        searchGhostHint.appendChild(span);
      };

      // Dropdown com TODOS os comandos de barra que batem com o que já foi
      // digitado — diferente do ghost hint (que só completa um único
      // comando), aqui o usuário vê e pode escolher entre /all, /ranking,
      // /watching, /planwatch etc.
      const SLASH_COMMAND_DESCRIPTIONS = {
        '/all':         'everyone from the site here',
        '/ranking':     'global ranking',
        '/watching':    'watching now anime',
        '/planwatch':   'plan to watch anime',
        '/romance':     'romance anime',
        '/isekai':      'isekai/reincarnation anime',
        '/sport':       'sport anime',
        '/comedy':      'comedy anime',
        '/mecha':       'mecha/cyberpunk anime',
        '/incomplete':  'dropped/on hold animes',
        '/announced':   'anime with annouced sequels',
        '/episodes':    'best episodes watched',
        '/characters':  'characters that are peak'
      };
      // Cor e ícone próprios de cada comando, pra cada linha do dropdown
      // ter identidade visual em vez de tudo cinza igual. As cores das
      // listas de categoria reaproveitam CATEGORY_HOVER_COLOR, pra ficar
      // consistente com a cor usada no drawer de filtros.
      const SLASH_COMMAND_STYLE = {
        '/all':         { color: '#e2e8f0', icon: '<path d="M12 2 2 7l10 5 10-5-10-5Z"></path><path d="m2 17 10 5 10-5"></path><path d="m2 12 10 5 10-5"></path>' },
        '/ranking':     { color: '#f8fafc', icon: '<path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"></path><path d="M17 5h2.5a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3"></path><path d="M7 5H4.5a1 1 0 0 0-1 1v1a3 3 0 0 0 3 3"></path>' },
        '/watching':    { color: '#2dd4bf', icon: '<circle cx="12" cy="12" r="10"></circle><path d="M10 8.5v7l6-3.5-6-3.5Z"></path>' },
        '/planwatch':   { color: '#f59e0b', icon: '<path d="M19 21 12 16.5 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"></path>' },
        '/romance':     { color: CATEGORY_HOVER_COLOR.romance, icon: '<path d="M12 21s-6.7-4.35-9.3-8.2C1 10 1.6 6.6 4.4 5.2 6.6 4.1 9 4.9 12 8c3-3.1 5.4-3.9 7.6-2.8 2.8 1.4 3.4 4.8 1.7 7.6C18.7 16.65 12 21 12 21Z"></path>' },
        '/isekai':      { color: CATEGORY_HOVER_COLOR.isekai, icon: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 16h5v5"></path>' },
        '/sport':       { color: CATEGORY_HOVER_COLOR.sports, icon: '<circle cx="12" cy="12" r="9"></circle><path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18"></path>' },
        '/comedy':      { color: CATEGORY_HOVER_COLOR.comedy, icon: '<circle cx="12" cy="12" r="9"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line>' },
        '/mecha':       { color: CATEGORY_HOVER_COLOR.mecha, icon: '<path d="M12 8V4H8"></path><rect x="4" y="8" width="16" height="12" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path>' },
        '/incomplete':  { color: CATEGORY_HOVER_COLOR.incomplete, icon: '<circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path>' },
        '/announced':   { color: CATEGORY_HOVER_COLOR.announced, icon: '<rect x="3" y="4" width="18" height="17" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>' },
        '/episodes':    { color: CATEGORY_HOVER_COLOR.favEpisodes, icon: '<rect x="2.5" y="5" width="19" height="13" rx="2"></rect><path d="M8 21h8"></path><path d="M12 18v3"></path>' },
        '/characters':  { color: CATEGORY_HOVER_COLOR.trueCharacters, icon: '<path d="M20 21a8 8 0 0 0-16 0"></path><circle cx="12" cy="8" r="5"></circle>' }
      };
      const slashCommandListEl = document.getElementById('slashCommandList');
      const searchDrawerInputWrapEl = document.querySelector('.search-drawer-input-wrap');

      // Calcula, em JS, quanto de altura sobra entre o fim da barra de
      // busca e o fim de fato do drawer — e aplica isso como max-height
      // do dropdown, pra ele "encostar" no final do drawer em vez de
      // parar num valor fixo (vh/px) que ora sobra, ora falta, dependendo
      // do tamanho da tela e de quantos comandos batem com o que foi
      // digitado.
      function updateSlashCommandListHeight() {
        // Preenchimento agora é 100% via CSS: o dropdown vive dentro de
        // .search-stage com "inset: 0", então já ocupa o espaço inteiro
        // até o rodapé do drawer sem depender de cálculo em JS. Função
        // mantida (no-op) só pra não quebrar as chamadas existentes.
      }
      window.addEventListener('resize', () => {
        if (slashCommandListEl && slashCommandListEl.classList.contains('visible')) {
          updateSlashCommandListHeight();
        }
      }, { passive: true });

      function hideSlashCommandList() {
        if (!slashCommandListEl) return;
        slashCommandListEl.innerHTML = '';
        slashCommandListEl.classList.remove('visible');
        slashCommandListEl.style.height = '';
        slashCommandListEl.style.maxHeight = '';
        slashActiveIndex = -1;
        if (searchDrawerInputWrapEl) searchDrawerInputWrapEl.classList.remove('dropdown-open');
      }

      function chooseSlashCommand(cmd) {
        searchInput.value = cmd;
        searchBoxDrawer.classList.add('has-value');
        updateGhostHint();
        hideSlashCommandList();
        searchInput.dispatchEvent(new Event('input'));
        searchInput.focus();
      }

      function renderSlashCommandItemHtml(c, typed) {
        const style = SLASH_COMMAND_STYLE[c] || {};
        const allGradient = c === '/all'
          ? '<defs><linearGradient id="cmd-all-static-rgb" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff4d6d"></stop><stop offset="34%" stop-color="#facc15"></stop><stop offset="67%" stop-color="#2dd4bf"></stop><stop offset="100%" stop-color="#a78bfa"></stop></linearGradient></defs>'
          : '';
        const iconStroke = c === '/all' ? 'url(#cmd-all-static-rgb)' : 'currentColor';
        // Divide o nome do comando em duas partes: o que o usuário já
        // digitou (ex: "/inco") e o resto (ex: "mplete"). Só a parte já
        // digitada ganha a cor do comando.
        const typedLen = (typed || '').length;
        const typedPart = c.slice(0, typedLen);
        const restPart = c.slice(typedLen);
        const nameHtml = `<span class="cmd-name-typed">${typedPart}</span>${restPart}`;
        return `
          <div class="slash-command-item" data-cmd="${c}" role="option" style="--cmd-color: ${style.color || ''}">
            <svg class="cmd-icon" viewBox="0 0 24 24" fill="none" stroke="${iconStroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${allGradient}${style.icon || ''}</svg>
            <span class="cmd-text">
              <span class="cmd-name">${nameHtml}</span>
              <span class="cmd-desc">${SLASH_COMMAND_DESCRIPTIONS[c] || ''}</span>
            </span>
          </div>`;
      }

      function updateSlashCommandList(val) {
        if (!slashCommandListEl) return;
        const lower = (val || '').toLowerCase();
        // Só mostra enquanto o comando ainda não foi completamente digitado
        // (uma vez completo, o próprio resultado da busca já aparece).
        if (!lower.startsWith('/') || SLASH_COMMANDS[lower]) {
          hideSlashCommandList();
          return;
        }
        const matches = SLASH_COMMAND_LIST.filter(c => c.startsWith(lower));
        if (!matches.length) {
          hideSlashCommandList();
          return;
        }

        const html = matches.map(c => renderSlashCommandItemHtml(c, lower)).join('');

        slashCommandListEl.innerHTML = html;
        slashCommandListEl.classList.add('expanded');
        slashCommandListEl.classList.add('visible');
        slashActiveIndex = -1;
        if (searchDrawerInputWrapEl) searchDrawerInputWrapEl.classList.add('dropdown-open');
        updateSlashCommandListHeight();
        // Remede no próximo frame: a classe "dropdown-open" tira o
        // padding-bottom da search-box (ver CSS), o que muda a altura do
        // wrap; medir de novo depois do reflow evita ficar com a medida
        // "velha", de antes dessa mudança de padding, aplicada.
        requestAnimationFrame(updateSlashCommandListHeight);

        slashCommandListEl.querySelectorAll('.slash-command-item').forEach(el => {
          el.addEventListener('mouseenter', () => {
            const items = getVisibleSlashItems();
            const idx = items.indexOf(el);
            if (idx >= 0) setSlashActive(idx);
          });
          el.addEventListener('click', (e) => {
            // click (em vez de mousedown) pra não bloquear a seleção de
            // texto por arraste dentro do item — chooseSlashCommand já
            // devolve o foco pro input no final, então não precisa mais
            // disparar antes do blur.
            e.preventDefault();
            chooseSlashCommand(el.getAttribute('data-cmd'));
          });
        });

      }

      let debounceId = null;
      let slashActiveIndex = -1;

      // Só os itens realmente visíveis (offsetParent !== null).
      function getVisibleSlashItems() {
        if (!slashCommandListEl) return [];
        return Array.from(slashCommandListEl.querySelectorAll('.slash-command-item'))
          .filter(el => el.offsetParent !== null);
      }

      function setSlashActive(index) {
        const items = getVisibleSlashItems();
        if (!items.length) { slashActiveIndex = -1; return; }
        slashActiveIndex = Math.max(0, Math.min(index, items.length - 1));
        items.forEach((el, i) => el.classList.toggle('active', i === slashActiveIndex));
        items[slashActiveIndex].scrollIntoView({ block: 'nearest' });
      }

      searchInput.addEventListener('input', () => {
        const val = searchInput.value;
        searchBoxDrawer.classList.toggle('has-value', val.length > 0);
        updateGhostHint();
        updateSlashCommandList(val);
        clearTimeout(debounceId);
        debounceId = setTimeout(() => {
          // Só troca o carrossel pelos resultados quando o usuário já
          // digitou pelo menos MIN_QUERY_LENGTH caracteres (contando sem
          // espaços nas pontas). Antes disso, o carrossel continua ali.
          if (val.trim().length >= MIN_QUERY_LENGTH) {
            if (searchPanelEl) searchPanelEl.classList.add('has-min-query');
            renderResults(val);
          } else {
            resetToCarouselStage();
          }
          saveDrawerStateNow();
        }, 120);
      });

      searchInput.addEventListener('focus', () => {
        updateSlashCommandList(searchInput.value);
      });

      searchInput.addEventListener('blur', () => {
        // pequeno delay pra permitir que o mousedown do item do dropdown
        // dispare antes da lista sumir
        setTimeout(hideSlashCommandList, 120);
      });

      function completePreviewCommand() {
        if (!previewGhostCmd || searchInput.value) return false;
        const cmd = previewGhostCmd;
        previewGhostCmd = '';
        searchInput.value = cmd;
        searchBoxDrawer.classList.add('has-value');
        updateGhostHint();
        searchInput.dispatchEvent(new Event('input'));
        return true;
      }

      // Mesmo com o foco fora do campo (ex.: depois de clicar numa área
      // do drawer), o Tab durante a prévia completa o comando.
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
        if (document.activeElement === searchInput) return;
        if (!previewGhostCmd || !isDrawerOpen) return;
        if (completePreviewCommand()) {
          e.preventDefault();
          searchInput.focus();
        }
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          hideSlashCommandList();
          closeSearchDrawer();
          return;
        }
        if (e.key === 'Tab') {
          // Prévia de uma lista na tela: Tab completa o comando mostrado
          // apagado na barra (ex.: /mecha).
          if (completePreviewCommand()) { e.preventDefault(); return; }
          const remainder = getSlashCommandRemainder(searchInput.value);
          if (remainder) {
            e.preventDefault();
            searchInput.value = searchInput.value.toLowerCase() + remainder;
            searchBoxDrawer.classList.add('has-value');
            updateGhostHint();
            searchInput.dispatchEvent(new Event('input'));
            return;
          }
        }

        // Enquanto o dropdown de comandos "/" está aberto, as setas e o
        // Enter navegam nele, não nos resultados de busca por trás.
        const slashOpen = slashCommandListEl && slashCommandListEl.classList.contains('visible');
        if (slashOpen) {
          const items = getVisibleSlashItems();
          if (e.key === 'ArrowDown') {
            if (!items.length) return;
            e.preventDefault();
            setSlashActive(slashActiveIndex < 0 ? 0 : slashActiveIndex + 1);
            return;
          }
          if (e.key === 'ArrowUp') {
            if (!items.length) return;
            e.preventDefault();
            setSlashActive(slashActiveIndex < 0 ? items.length - 1 : slashActiveIndex - 1);
            return;
          }
          if (e.key === 'Enter') {
            if (items.length) {
              e.preventDefault();
              const idx = slashActiveIndex >= 0 ? slashActiveIndex : 0;
              const chosen = items[idx];
              if (chosen) chooseSlashCommand(chosen.getAttribute('data-cmd'));
              return;
            }
          }
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (currentMatches.length) {
            activeIndex = activeIndex < 0
              ? 0
              : Math.min(activeIndex + 1, currentMatches.length - 1);
            setActiveResult(activeIndex);
            return;
          }
          moveSearchHistory(1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (currentMatches.length && activeIndex >= 0) {
            activeIndex = Math.max(activeIndex - 1, 0);
            setActiveResult(activeIndex);
            return;
          }
          moveSearchHistory(-1);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (activeIndex >= 0 && currentMatches[activeIndex]) {
            selectResult(activeIndex);
          } else if (currentMatches.length) {
            selectResult(0);
          }
        }
      });

      searchClearBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        searchInput.value = '';
        searchBoxDrawer.classList.remove('has-value');
        resetToCarouselStage();
        updateGhostHint();
        hideSlashCommandList();
        searchInput.focus();
        saveDrawerStateNow();
      });

      // Expõe para o handler global de Escape/clique-fora poder fechar este drawer também,
      // e para o switchDrawerTab poder focar o input ao trocar de aba pelo próprio drawer.
      window.__closeSearchDrawer = () => { if (isSearchTabOpen()) closeSearchDrawer(); };
      window.__isSearchOpen = isSearchTabOpen;
      // IMPORTANTE: focar o campo de busca ENQUANTO o painel ainda está no
      // meio da animação de abrir (transform ainda em transição) é o que
      // fazia o navegador (principalmente no celular) desenhar o cursor de
      // texto "grudado" na posição errada, flutuando por cima do resto da
      // página, inclusive depois do painel já ter fechado. Um delay fixo
      // (setTimeout) é um chute que pode cair no meio da transição CSS.
      // Em vez disso, esperamos o evento "transitionend" real do painel
      // (ou um fallback de segurança) e SÓ ENTÃO focamos — e só se o
      // painel ainda estiver de fato aberto e visível naquele momento.
      let searchFocusPending = false;
      window.__onSearchTabActive = () => {
        const drawerEl = document.getElementById('categoryDrawer');
        if (!drawerEl || searchFocusPending) return;
        searchFocusPending = true;

        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          searchFocusPending = false;
          drawerEl.removeEventListener('transitionend', onTransitionEnd);
          if (drawerEl.classList.contains('show')) {
            searchInput.focus();
          }
        };
        const onTransitionEnd = (e) => {
          if (e.target === drawerEl && e.propertyName === 'transform') finish();
        };
        drawerEl.addEventListener('transitionend', onTransitionEnd);
        // Fallback: se por algum motivo o transitionend não disparar
        // (ex.: "reduzir movimento" ativado no sistema), foca mesmo assim
        // depois de um tempo generoso, sempre revalidando se ainda está aberto.
        setTimeout(finish, 320);
      };
      window.__cancelPendingSearchFocus = () => {
        searchFocusPending = false;
      };

      resetToCarouselStage();
    }

    // ── Fecha o drawer ao clicar fora dele ──
    // Usa o alvo do "mousedown" (início do clique/arrasto), não o do
    // "click" (que reflete onde o mouse soltou). Isso evita fechar o
    // drawer quando o usuário está selecionando texto da busca rápido
    // demais (ex.: arrastando da direita pra esquerda) e o cursor acaba
    // saindo por cima da área do drawer no momento de soltar o botão.
    let pointerDownInsideDrawer = false;
    document.addEventListener('mousedown', (e) => {
      pointerDownInsideDrawer = !!(
        e.target.closest('.filter-wrapper') ||
        e.target.closest('.category-drawer') ||
        e.target.closest('.search-wrapper')
      );
    }, true);

    document.addEventListener('click', (e) => {
      if (pointerDownInsideDrawer) return;
      if (!e.target.closest('.filter-wrapper') && !e.target.closest('.category-drawer') && !e.target.closest('.search-wrapper')) {
        closeDrawer();
      }
    });

    // ── +/- da barra de progresso (Watching Now) ──
    // Clique rápido continua alterando 1 episódio. Ao SEGURAR o botão,
    // começa a repetir depois de um pequeno atraso e acelera gradualmente.
    // A atualização continua sendo feita só naquele card, sem re-renderizar
    // a lista inteira, para manter o scroll e a resposta instantânea.
    function changeWatchProgress(btn, direction) {
      if (!btn || btn.disabled) return false;

      const animeId = btn.getAttribute('data-anime-id');
      if (!animeId) return false;

      const totRaw = btn.getAttribute('data-tot');
      const tot = totRaw !== null ? parseInt(totRaw, 10) : null;
      const isIndeterminate = tot === null || !Number.isFinite(tot);

      const anime = watchingData.find(a => a.id === animeId);
      const base = anime ? parseWatchProgress(anime) : null;
      const baseCur = base ? base.cur : 0;
      const override = getWatchProgressOverride(animeId);
      const current = override !== null ? override : baseCur;

      const next = direction > 0
        ? (isIndeterminate ? current + 1 : Math.min(tot, current + 1))
        : Math.max(0, current - 1);

      // Já chegou no limite: não há mais nada para alterar.
      if (next === current) return false;

      setWatchProgressOverride(animeId, next);

      const card = btn.closest('.anime-item');
      if (card) {
        const label = card.querySelector('.watch-progress-label');
        const incBtn = card.querySelector('.watch-progress-inc');
        const decBtn = card.querySelector('.watch-progress-dec');

        if (isIndeterminate) {
          if (label) label.textContent = `${next}/-`;
        } else {
          const fill = card.querySelector('.watch-progress-fill');
          const pct = Math.max(0, Math.min(100, (next / tot) * 100));
          if (fill) fill.style.width = pct + '%';

          const isCompleted = next >= tot;
          if (label) {
            if (isCompleted) {
              label.textContent = 'COMPLETED';
            } else {
              const seasonRel = anime ? getSeasonRelativeProgress(anime, next) : null;
              label.innerHTML = seasonRel
                ? `${seasonRel.withinCur}/${seasonRel.seasonTot}<span class="watch-progress-label-total">${next}/${tot}</span>`
                : `${next}/${tot}`;
            }
            label.classList.toggle('watch-progress-label--completed', isCompleted);
          }

          if (incBtn) incBtn.disabled = isCompleted;
        }

        if (decBtn) decBtn.disabled = next <= 0;
      }

      return true;
    }

    // Clique normal = +/- 1 episódio.
    // Quando houve repetição por hold, o click gerado ao soltar é ignorado
    // para não acrescentar mais um episódio acidentalmente.
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.watch-progress-inc, .watch-progress-dec');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      if (btn.dataset.holdConsumed === '1') {
        delete btn.dataset.holdConsumed;
        return;
      }

      changeWatchProgress(btn, btn.classList.contains('watch-progress-inc') ? 1 : -1);
    });

    // Segurar = repetição acelerada.
    // 0–420 ms: ainda conta como clique normal.
    // Depois disso começa em ~125 ms por episódio e acelera até ~42 ms.
    let watchProgressHold = null;

    function stopWatchProgressHold() {
      if (!watchProgressHold) return;
      clearTimeout(watchProgressHold.startTimer);
      clearTimeout(watchProgressHold.repeatTimer);

      if (watchProgressHold.didRepeat && watchProgressHold.btn) {
        watchProgressHold.btn.dataset.holdConsumed = '1';
        // Segurança: caso o navegador não gere click depois do pointerup,
        // remove a flag sozinho para não engolir um clique futuro.
        const heldBtn = watchProgressHold.btn;
        setTimeout(() => {
          if (heldBtn.dataset.holdConsumed === '1') delete heldBtn.dataset.holdConsumed;
        }, 500);
      }

      watchProgressHold = null;
    }

    function scheduleWatchProgressRepeat() {
      if (!watchProgressHold) return;

      const state = watchProgressHold;
      if (!state.btn.isConnected || state.btn.disabled) {
        stopWatchProgressHold();
        return;
      }

      const changed = changeWatchProgress(state.btn, state.direction);
      if (!changed) {
        stopWatchProgressHold();
        return;
      }

      state.didRepeat = true;
      state.repeatCount += 1;

      // Aceleração progressiva: 125ms -> 42ms conforme continua segurando.
      const delay = Math.max(42, 125 - state.repeatCount * 7);
      state.repeatTimer = setTimeout(scheduleWatchProgressRepeat, delay);
    }

    document.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.watch-progress-inc, .watch-progress-dec');
      if (!btn || btn.disabled) return;

      // Só botão principal do mouse; touch/pen também entram normalmente.
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      stopWatchProgressHold();

      watchProgressHold = {
        btn,
        pointerId: e.pointerId,
        direction: btn.classList.contains('watch-progress-inc') ? 1 : -1,
        didRepeat: false,
        repeatCount: 0,
        startTimer: null,
        repeatTimer: null,
      };

      // Captura o pointer para continuar recebendo o pointerup mesmo se o
      // cursor/dedo sair alguns pixels do botão enquanto ele está segurado.
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}

      watchProgressHold.startTimer = setTimeout(() => {
        if (!watchProgressHold || watchProgressHold.btn !== btn) return;
        scheduleWatchProgressRepeat();
      }, 420);
    }, { passive: true });

    document.addEventListener('pointerup', stopWatchProgressHold, true);
    document.addEventListener('pointercancel', stopWatchProgressHold, true);
    window.addEventListener('blur', stopWatchProgressHold);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') stopWatchProgressHold();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeDrawer();
      }
    });

    // Ctrl+F (ou Cmd+F no Mac) abre a busca do site em vez do "find" nativo do navegador.
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        e.stopPropagation();
        const posterLightbox = document.getElementById('posterLightbox');
        if (posterLightbox?.classList.contains('open')) {
          document.getElementById('posterLightboxClose')?.click();
        }
        openDrawer('search', { focus: true });
      }
    });

    // Com o drawer aberto, a tecla "/" vai direto pra barra de pesquisa
    // (aba Search) e já digita a "/" lá, abrindo os comandos (/romance,
    // /isekai...). Se o foco já estiver num campo de texto, não interfere.
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!isDrawerOpen) return;
      const t = e.target;
      const tag = (t && t.tagName) || '';
      if (t && (t.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return;
      const input = document.getElementById('searchDrawerInput');
      if (!input) return;
      e.preventDefault();
      switchDrawerTab('search', { focus: false });
      input.focus();
      input.value = '/';
      try { input.setSelectionRange(1, 1); } catch (err) {}
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Com o drawer aberto, "T" ou "F" expande/recolhe o drawer (o mesmo botão
    // de Expand/Collapse). Não interfere se o foco estiver num campo de texto.
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return;
      const k = (e.key || '').toLowerCase();
      if (k !== 't' && k !== 'f') return;
      if (!isDrawerOpen) return;
      const t = e.target;
      const tag = (t && t.tagName) || '';
      if (t && (t.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return;
      // O botão de expandir só existe no desktop.
      if (!drawerExpandBtn || drawerExpandBtn.offsetParent === null) return;
      e.preventDefault();
      setDrawerExpanded(!drawer.classList.contains('expanded'), true);
    });

    const ARROW_NAV_ORDER = ['plan', 'watching', 'all'];
    const MOBILE_SWIPE_NAV_ORDER = ['all', 'watching', 'plan'];

    function switchCategory(step, navigationOrder = ARROW_NAV_ORDER) {
      if (window.__isReleaseCalendarMode && window.__isReleaseCalendarMode()) {
        window.__setReleaseCalendarMode(false, { keepScroll: true });
      }

      const idx = navigationOrder.indexOf(currentCategory);
      const base = idx === -1 ? 0 : idx;
      const nextIdx = (base + step + navigationOrder.length) % navigationOrder.length;
      const mode = navigationOrder[nextIdx];
      if (mode === currentCategory) return;

      currentCategory = mode;

      // Quando a troca de lista acontece pelas setas ou pelo swipe com o
      // drawer aberto, mantém a aba e o título do drawer sincronizados
      // com a nova categoria. Sem isso, por exemplo, Watching Now podia
      // continuar mostrando o título da aba Ranks.
      if (isDrawerOpen) {
        const nextDrawerTab = MODE_TAB[mode] || 'ranks';
        const activeDrawerTab = drawerTabs.find(t => t.classList.contains('active'));
        const activeDrawerTabName = activeDrawerTab?.getAttribute('data-tab') || '';
        if (activeDrawerTabName !== nextDrawerTab) {
          switchDrawerTab(nextDrawerTab, { focus: false });
        } else if (drawerTitleEl && DRAWER_TAB_TITLES[nextDrawerTab]) {
          drawerTitleEl.textContent = DRAWER_TAB_TITLES[nextDrawerTab];
        }
      }

      try {
        const kS = 'myanimerank_scrollY_' + currentCategory;
        const kE = 'myanimerank_expanded_' + currentCategory;
        localStorage.removeItem(kS);
        sessionStorage.removeItem(kS);
        localStorage.removeItem(kE);
        sessionStorage.removeItem(kE);
      } catch(e) {}

      __forcedSlideDir = step > 0 ? 1 : -1;
      render();
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      const isEditable = e.target && (e.target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA');
      if (isEditable) return;

      const lightboxEl = document.getElementById('posterLightbox');
      if (lightboxEl && lightboxEl.classList.contains('open')) return;

      const isMobileListNavigation = window.matchMedia('(max-width: 760px)').matches;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        switchCategory(1, isMobileListNavigation ? MOBILE_SWIPE_NAV_ORDER : ARROW_NAV_ORDER);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        switchCategory(-1, isMobileListNavigation ? MOBILE_SWIPE_NAV_ORDER : ARROW_NAV_ORDER);
      }
    });

    document.addEventListener('mousedown', () => document.body.classList.add('using-mouse'));
    document.addEventListener('keydown', () => document.body.classList.remove('using-mouse'));

    // ── Navegação por swipe (mobile) — equivalente às setas esquerda/direita ──
    (function initSwipeNavigation() {
      let touchStartX = 0;
      let touchStartY = 0;
      let touchStartTime = 0;
      let swiping = false;

      const mobileSwipeOnly = () => window.matchMedia('(max-width: 760px)').matches;

      const SWIPE_MIN_DISTANCE = 60;   // px mínimos no eixo X
      const SWIPE_MAX_OFF_AXIS = 60;   // tolerância no eixo Y
      const SWIPE_MAX_TIME = 600;      // ms

      document.addEventListener('touchstart', (e) => {
        // No desktop a troca de listas é exclusivamente pelas setas do
        // teclado, mesmo em trackpads ou telas que emulem touch.
        if (!mobileSwipeOnly()) { swiping = false; return; }
        swiping = false;
        if (e.target.closest('.category-drawer') || e.target.closest('.filter-wrapper') || e.target.closest('.fav-ep-media') || e.target.closest('.poster-lightbox-zoom.open')) return;
        const lightboxEl = document.getElementById('posterLightbox');
        if (lightboxEl && lightboxEl.classList.contains('open')) return;
        if (e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
        swiping = true;
      }, { passive: true });

      document.addEventListener('touchend', (e) => {
        if (!mobileSwipeOnly()) { swiping = false; return; }
        if (!swiping) return;
        swiping = false;

        const lightboxEl = document.getElementById('posterLightbox');
        if (lightboxEl && lightboxEl.classList.contains('open')) return;

        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        const dt = Date.now() - touchStartTime;

        if (dt > SWIPE_MAX_TIME) return;
        if (Math.abs(dy) > SWIPE_MAX_OFF_AXIS) return;
        if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return;

        if (dx < 0) {
          switchCategory(1, MOBILE_SWIPE_NAV_ORDER);  // esquerda: All → Watching → Plan
        } else {
          switchCategory(-1, MOBILE_SWIPE_NAV_ORDER); // direita: ciclo inverso
        }
      }, { passive: true });
    })();

    function saveScrollPositionNow() {
      try {
        const y = window.scrollY || window.pageYOffset || 0;
        const key = 'myanimerank_scrollY_' + currentCategory;
        sessionStorage.setItem(key, String(y));
        localStorage.setItem(key, String(y));
      } catch (e) {}
    }

    let __scrollSaveTimeout = null;
    function saveScrollPosition() {
      // localStorage é síncrono. Gravar a cada 150 ms enquanto a roda do
      // mouse está em movimento causava pequenas pausas; agora a gravação
      // acontece somente depois que a rolagem sossega.
      if (__scrollSaveTimeout) clearTimeout(__scrollSaveTimeout);
      __scrollSaveTimeout = setTimeout(() => {
        saveScrollPositionNow();
        __scrollSaveTimeout = null;
      }, 240);
    }

    // Eventos de saída/recarregamento da página: salvam IMEDIATAMENTE (sem
    // debounce), pois a página pode fechar/recarregar antes do timeout do
    // debounce disparar, o que fazia a posição às vezes não ser salva.
    window.addEventListener('beforeunload', saveScrollPositionNow, { passive: true });
    window.addEventListener('pagehide', saveScrollPositionNow, { passive: true });
    window.addEventListener('beforeunload', saveDrawerStateNow, { passive: true });
    window.addEventListener('pagehide', saveDrawerStateNow, { passive: true });
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        saveScrollPositionNow();
        saveDrawerStateNow();
      }
    });
    // Scroll contínuo: mantém o debounce para não gravar no storage a cada frame.
    window.addEventListener('scroll', saveScrollPosition, { passive: true });

    function updateURLForCategory(mode) {
      try {
        const slug = hashMap[mode] || '';
        const newUrl = slug
          ? `${location.pathname}${location.search}#${slug}`
          : `${location.pathname}${location.search}`;
        history.replaceState(null, '', newUrl);
      } catch (e) {}
    }

    let __cancelScrollRestore = null;
    function restoreScrollPosition() {
      if (__cancelScrollRestore) __cancelScrollRestore();
      try {
        const key = 'myanimerank_scrollY_' + currentCategory;
        const saved = sessionStorage.getItem(key) || localStorage.getItem(key);
        const y = Math.max(0, parseInt(saved, 10) || 0);
        if (!y) return;
        const category = currentCategory;
        let frame = 0, attempts = 0, stopped = false;
        const stop = () => {
          stopped = true;
          cancelAnimationFrame(frame);
          ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(type => window.removeEventListener(type, stop, true));
          __cancelScrollRestore = null;
        };
        __cancelScrollRestore = stop;
        ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(type => window.addEventListener(type, stop, { capture: true, passive: true }));
        const restore = () => {
          if (stopped || currentCategory !== category) { stop(); return; }
          window.scrollTo({ top: y, behavior: 'instant' });
          attempts++;
          if (attempts >= 4 || (attempts >= 2 && Math.abs(window.scrollY - y) < 2)) { stop(); return; }
          frame = requestAnimationFrame(restore);
        };
        restore();
      } catch (e) { if (__cancelScrollRestore) __cancelScrollRestore(); }
    }


    // ── Calendário semanal de lançamentos ──
    function initReleaseCalendar() {
      const calendarBtn = document.getElementById('calendarBtn');
      const calendarView = document.getElementById('releaseCalendarView');
      const pageTitleEl = document.getElementById('pageTitle');
      if (!calendarBtn || !calendarView || !pageTitleEl) return;

      const baseDayOrder = [
        { key: 'monday', label: 'Monday' },
        { key: 'tuesday', label: 'Tuesday' },
        { key: 'wednesday', label: 'Wednesday' },
        { key: 'thursday', label: 'Thursday' },
        { key: 'friday', label: 'Friday' },
        { key: 'saturday', label: 'Saturday' },
        { key: 'sunday', label: 'Sunday' },
      ];

      const jsDayToKey = {
        0: 'sunday',
        1: 'monday',
        2: 'tuesday',
        3: 'wednesday',
        4: 'thursday',
        5: 'friday',
        6: 'saturday',
      };

      const calendarIconSvg = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2"></rect>
          <path d="M16 3v4M8 3v4M3 10h18"></path>
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"></path>
        </svg>
      `;

      const closeIconSvg = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18"></path>
        </svg>
      `;

      let calendarMode = false;

      function escapeCalendarHtml(value) {
        return String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

function getCalendarItems() {
        return (typeof rawReleaseCalendarData !== 'undefined' && Array.isArray(rawReleaseCalendarData))
          ? rawReleaseCalendarData.filter(item => item && item.releaseDay)
          : [];
      }

      function getRotatedDayOrder(todayKey) {
        const startIndex = baseDayOrder.findIndex(day => day.key === todayKey);
        if (startIndex < 0) return baseDayOrder;
        return [
          ...baseDayOrder.slice(startIndex),
          ...baseDayOrder.slice(0, startIndex),
        ];
      }

      function renderReleaseCalendar() {
        const items = getCalendarItems();
        const todayKey = jsDayToKey[new Date().getDay()];
        const dayOrder = getRotatedDayOrder(todayKey);
        const groups = {};

        baseDayOrder.forEach(day => { groups[day.key] = []; });

        items.forEach(item => {
          if (groups[item.releaseDay]) groups[item.releaseDay].push(item);
        });

        calendarView.innerHTML = dayOrder
          .filter(day => (groups[day.key] || []).length > 0)
          .map(day => {
            const dayItems = groups[day.key];

            const cards = dayItems.map(calendarItem => {
              const sourceAnime =
                (typeof watchingData !== 'undefined' && Array.isArray(watchingData)
                  ? watchingData.find(anime => anime.id === calendarItem.id)
                  : null) || calendarItem;

              const anime = { ...sourceAnime, ...calendarItem };
              let cardHtml = createAnimeCard(anime, 'watching', null);

              // Evita IDs duplicados enquanto o calendário está aberto e
              // guarda o anime real como destino do clique.
              cardHtml = cardHtml.replace(
                `id="${escapeCalendarHtml(anime.id)}"`,
                `id="calendar-${escapeCalendarHtml(anime.id)}" data-calendar-target="${escapeCalendarHtml(anime.id)}"`
              );

              return cardHtml;
            }).join('');

            return `
              <section class="release-day-section" data-release-day="${day.key}">
                <div class="release-day-header">
                  <h2 class="release-day-name">${day.label}</h2>
                  <span class="release-day-line" aria-hidden="true"></span>
                </div>
                <ol class="ranking mode-true-characters release-calendar-list">${cards}</ol>
              </section>
            `;
          }).join('');

        if (typeof initPosterImages === 'function') initPosterImages();
        if (typeof initAnnounceStrips === 'function') initAnnounceStrips();
      }

      function setCalendarMode(enabled, options = {}) {
        if (calendarBtn.disabled) return;
        calendarMode = !!enabled;
        document.body.classList.toggle('release-calendar-mode', calendarMode);
        calendarBtn.classList.toggle('active', calendarMode);
        calendarBtn.setAttribute('aria-pressed', calendarMode ? 'true' : 'false');
        const calendarTooltip = calendarMode ? 'Close' : 'Seasonal Anime Calendar';
        calendarBtn.setAttribute('data-tooltip', calendarTooltip);
        calendarBtn.setAttribute('title', calendarTooltip);
        calendarBtn.setAttribute('aria-label', calendarTooltip);
        calendarBtn.innerHTML = calendarMode ? closeIconSvg : calendarIconSvg;

        // Mantém o quinto atalho do menu inferior sincronizado com o
        // estado do calendário quando ele é aberto ou fechado.
        if (typeof updateMobileBottomNav === 'function') updateMobileBottomNav();

        calendarView.hidden = !calendarMode;
        calendarView.setAttribute('aria-hidden', calendarMode ? 'false' : 'true');

        if (calendarMode) {
          pageTitleEl.innerText = 'anime release calendar';
          renderReleaseCalendar();
          if (!options.keepScroll) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        } else {
          updatePageTexts();
        }

        if (window.__refreshScrollFab) {
          requestAnimationFrame(() => window.__refreshScrollFab());
        }
      }

      calendarBtn.addEventListener('click', () => setCalendarMode(!calendarMode));

      calendarView.addEventListener('click', (e) => {
        const card = e.target.closest('.anime-item[data-calendar-target]');
        if (!card || !calendarView.contains(card)) return;

        e.preventDefault();
        e.stopPropagation();

        const animeId = card.getAttribute('data-calendar-target');
        if (!animeId) return;

        setCalendarMode(false, { keepScroll: true });

        // Reaproveita o mesmo fluxo robusto da busca e das tags. Ele
        // expande a Watching Now se necessário, encontra o card real e
        // continua corrigindo a posição enquanto o calendário fecha.
        navigateToAnimeInCategory(animeId, 'watching');
      });

      window.__refreshReleaseCalendar = renderReleaseCalendar;
      window.__setReleaseCalendarMode = setCalendarMode;
      window.__isReleaseCalendarMode = () => calendarMode;
    }


    currentCategory = getModeFromHash() || 'all';

    updateDrawerCounts();
    setupFirstVisitButtonState();
    createDrawerController();
    initSearch();
    render();
    initReleaseCalendar();
    updatePageTexts();
    restoreScrollPosition();
    restoreDrawerState();

    // O conteúdo principal aparece primeiro. Carrosséis decorativos e a
    // sincronização do progresso começam depois, sem bloquear o primeiro
    // render nem disputar a conexão com os pôsteres visíveis.
    const startDeferredStartupWork = () => {
      loadWatchProgressOverrides().then(changed => {
        if (!changed) return;
        // Atualiza só as barras: mantém imagens, listeners e posição da lista.
        document.querySelectorAll('.anime-item[data-watching-now="1"]').forEach(card => {
          const anime = watchingData.find(a => a.id === card.id);
          const progress = card.querySelector('.watch-progress');
          if (!anime || !progress) return;
          const template = document.createElement('template');
          template.innerHTML = createAnimeCard(anime, 'watching');
          const replacement = template.content.querySelector('.watch-progress');
          if (replacement) progress.replaceWith(replacement);
        });
      });
    };
    if ('requestIdleCallback' in window) {
      requestIdleCallback(startDeferredStartupWork, { timeout: 900 });
    } else {
      setTimeout(startDeferredStartupWork, 180);
    }

    // ── Desliga o wallpaper borrado dos cards (.anime-item-ambient) durante
    // rolagem ativa (ver a regra "body.is-scrolling-ambient" no CSS) —
    // mesma ideia já usada no preview do "Watched This Month". Isso tira
    // o custo de recompor dezenas de camadas com filter: blur() a cada
    // frame, que é o que mais pesa em listas grandes tipo Myranks/"All"
    // (~270 itens) comparado com listas menores tipo Plan to Watch
    // (~120 itens). O blur volta a aparecer pouco depois que a rolagem
    // para de verdade (debounce), sem precisar de nenhum RAF contínuo.
    (function initAmbientScrollSuppression() {
      let ambientScrollTimeout = null;
      let ambientScrollFrame = 0;

      function finishAmbientScrolling() {
        if (ambientScrollFrame) {
          cancelAnimationFrame(ambientScrollFrame);
          ambientScrollFrame = 0;
        }
        if (ambientScrollTimeout) {
          clearTimeout(ambientScrollTimeout);
          ambientScrollTimeout = null;
        }
        document.body.classList.remove('is-scrolling-ambient');
        document.dispatchEvent(new CustomEvent('myhtml:scroll-idle'));
      }

      function markAmbientScrolling() {
        // No máximo uma alteração de classe por frame, mesmo em trackpads
        // que emitem muitos eventos de scroll no mesmo instante.
        if (!ambientScrollFrame) {
          ambientScrollFrame = requestAnimationFrame(() => {
            ambientScrollFrame = 0;
            document.body.classList.add('is-scrolling-ambient');
          });
        }
        if (ambientScrollTimeout) clearTimeout(ambientScrollTimeout);
        ambientScrollTimeout = setTimeout(finishAmbientScrolling, 120);
      }
      window.addEventListener('scroll', markAmbientScrolling, { passive: true });
      if ('onscrollend' in window) {
        window.addEventListener('scrollend', finishAmbientScrolling, { passive: true });
      }
    })();

    // ── Botão flutuante: topo <-> final da página ──
    (function initScrollFab() {
      const scrollFab = document.getElementById('scrollFab');
      if (!scrollFab) return;

      const SCROLLED_THRESHOLD = 300;
      let lastScrolled = null;
      let refreshFrame = 0;
      function updateDirection() {
        const scrolled = (window.scrollY || 0) > SCROLLED_THRESHOLD;
        if (scrolled === lastScrolled) return;
        lastScrolled = scrolled;
        scrollFab.classList.toggle('scrolled', scrolled);
        scrollFab.setAttribute('aria-label', scrolled ? 'Ir para o topo da página' : 'Ir para o final da página');
      }
      function update() {
        updateDirection();
        if (refreshFrame) return;
        refreshFrame = requestAnimationFrame(() => {
          refreshFrame = 0;
          scrollFab.classList.toggle('visible', document.documentElement.scrollHeight - window.innerHeight > 80);
        });
      }
      window.addEventListener('scroll', updateDirection, {passive:true});
      window.addEventListener('resize', update, {passive:true});
      window.__refreshScrollFab = update;
      if ('ResizeObserver' in window) new ResizeObserver(update).observe(container);

      scrollFab.addEventListener('click', () => {
        if (scrollFab.classList.contains('scrolled')) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        }
      });

      update();
    })();

    // Usado pela camada do botão "voltar": depois de um history.go() interno,
    // a URL volta pra da categoria antiga; isso a realinha com a categoria atual.
    window.__syncCategoryUrl = () => updateURLForCategory(currentCategory);

    window.addEventListener('hashchange', () => {
      // Ignora hashchange causado pelo history.go() interno da camada "voltar"
      // (fechar drawer/lightbox), senão a lista volta pra categoria anterior.
      if (Date.now() < (window.__suppressHashChangeUntil || 0)) return;
      const mode = getModeFromHash();
      if (mode && mode !== currentCategory) {
        currentCategory = mode;
        render();
        restoreScrollPosition();
      }
    });

  });
// ── Botão "voltar" do celular ──
// Com o posterlightbox, o zoom da imagem ou o drawer abertos, o "voltar" fecha
// a camada (uma por vez) em vez de sair do site. Na lista de animes (nada
// aberto) o comportamento normal do navegador continua.
(function setupBackButtonLayers() {
  if (!window.history || !history.pushState) return;
  const layers = [
    { key: 'zoom', el: () => document.getElementById('posterLightboxZoom') || document.querySelector('.poster-lightbox-zoom'),
      isOpen: el => !!el && el.classList.contains('open'),
      close: el => el.click() },
    { key: 'lightbox', el: () => document.getElementById('posterLightbox'),
      isOpen: el => !!el && el.classList.contains('open'),
      close: () => document.getElementById('posterLightboxClose')?.click() },
    { key: 'drawer', el: () => document.getElementById('categoryDrawer'),
      // O openDrawer() só adiciona a classe "show" no próximo frame
      // (requestAnimationFrame), mas já define aria-hidden="false" na hora.
      // Ao abrir a busca a partir do posterlightbox, o lightbox fecha e o
      // drawer abre no mesmo instante; se aqui só olhássemos "show", por um
      // frame nenhuma camada parecia aberta, o histórico era desfeito
      // (history.go) e logo depois refeito (pushState), e essa corrida
      // deixava o "voltar" sem entrada própria, fechando o app. Usando
      // aria-hidden, a troca lightbox -> drawer é vista como uma
      // substituição, sem mexer no histórico.
      isOpen: el => !!el && (el.classList.contains('show') || el.getAttribute('aria-hidden') === 'false'),
      close: () => document.getElementById('drawerCloseBtn')?.click() }
  ];
  const stack = [];      // camadas abertas, da mais antiga para a mais recente
  let depth = 0;         // entradas de histórico criadas por nós
  let ignorePops = 0;    // popstates causados por nossos próprios history.go()

  function sync() {
    const open = layers.filter(l => l.isOpen(l.el()));
    const openKeys = open.map(l => l.key);
    for (let i = stack.length - 1; i >= 0; i--) {
      if (!openKeys.includes(stack[i])) stack.splice(i, 1);
    }
    openKeys.forEach(k => { if (!stack.includes(k)) stack.push(k); });
    while (depth < stack.length) {
      try { history.pushState({ __layer: stack[depth] }, '', location.href); } catch (e) {}
      depth++;
    }
    if (depth > stack.length) {
      const extra = depth - stack.length;
      depth = stack.length;
      ignorePops++;
      window.__suppressHashChangeUntil = Date.now() + 800;
      history.go(-extra);
    }
  }

  window.addEventListener('popstate', () => {
    if (ignorePops > 0) {
      ignorePops--;
      // A URL voltou pra da categoria antiga: realinha com a categoria atual.
      if (typeof window.__syncCategoryUrl === 'function') window.__syncCategoryUrl();
      if (typeof window.__resetPageTitleIfClosed === 'function') {
        window.__resetPageTitleIfClosed();
        setTimeout(window.__resetPageTitleIfClosed, 60);
      }
      return;
    }
    if (depth <= 0 || !stack.length) { depth = 0; return; }
    depth--;
    const key = stack[stack.length - 1];
    const layer = layers.find(l => l.key === key);
    const el = layer && layer.el();
    if (layer && layer.isOpen(el)) layer.close(el);
    // Se a camada não fechou (ex.: o clique foi ignorado), reequilibra.
    setTimeout(sync, 0);
  });

  const observer = new MutationObserver(sync);
  function attach() {
    layers.forEach(l => {
      const el = l.el();
      if (el) observer.observe(el, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
    });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();