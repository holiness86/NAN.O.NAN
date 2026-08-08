/* =========================================================================
   🥐 نان و نان — NAN.O.NAN — Menu interactions
   Vanilla JS, no framework, built to sit on top of Bootstrap 5 RTL.
   -------------------------------------------------------------------------
   Sections
     1. Utilities
     2. Scroll lock
     3. Shared DOM refs & helpers (cards / active panel)
     4. Lazy image loading (custom IntersectionObserver + eager panel preload)
     5. Category switcher (fall-out exit + rain-in enter)
     6. Preloader (cafe photo + goo/bubble dissolve, 5s hold after full load)
     7. Theme toggle (dynamic-radius liquid bubble)
     8. View switcher — Grid ⇄ List (vanilla FLIP)
     9. Sticky category-bar shadow
     10. Product bottom sheet (Bootstrap Offcanvas + drag-to-dismiss + full-size swap)
     11. Boot: restore saved preferences
   ========================================================================= */
(function () {
  'use strict';

  var html = document.documentElement;

  /* =======================================================================
     1. UTILITIES
     ======================================================================= */
  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function readCssVar(name) {
    return getComputedStyle(html).getPropertyValue(name).trim();
  }

  function syncMetaThemeColor(mode) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute('content', readCssVar(mode === 'dark' ? '--cream-dark-value' : '--cream-light-value'));
  }

  /* =======================================================================
     2. SCROLL LOCK — reference-counted so the preloader and any future
     caller can both hold a lock without stepping on each other.
     ======================================================================= */
  var lockCount = 0;
  function lockScroll() { lockCount++; html.classList.add('scroll-locked'); }
  function unlockScroll() { lockCount = Math.max(0, lockCount - 1); if (lockCount === 0) html.classList.remove('scroll-locked'); }

  /* =======================================================================
     3. SHARED DOM REFS & HELPERS
     ======================================================================= */
  var menuMain = document.getElementById('menuMain');
  var panels   = Array.prototype.slice.call(document.querySelectorAll('[data-cat-panel]'));

  function cardsOf(panel) {
    return panel ? Array.prototype.slice.call(panel.querySelectorAll('.menu-card')) : [];
  }
  function getActivePanel() {
    for (var i = 0; i < panels.length; i++) { if (panels[i].classList.contains('active')) return panels[i]; }
    return null;
  }

  var STAGGER_MS = 45;

  /* =======================================================================
     4. LAZY IMAGE LOADING
     Category icons (cat-nav strip + cat-panel headers) are NOT part of this
     system anymore — they're tiny, few, and rendered with a plain eager
     <img src> straight in the HTML (see index.ejs), so the browser's own
     preload scanner starts fetching them before any JS even runs. That's
     the fastest anything can possibly load.

     Product images are the expensive part (15-20 per category, real photos).
     Two problems had to be solved together:
       - "دیر لود میشه"  → what's actually on screen must win the race.
       - "لگ نباشه"      → but firing all 15-20 requests/decodes on the same
                            frame is what caused the jank in the first place.
     So instead of either "native lazy" (too late, then bursts) or "load the
     whole panel at once" (fast but janky), every image goes through one
     small priority queue with a hard concurrency cap:
       - preloadPanelImages() is called the instant a category tab is
         clicked (before the panel is even visible) and marks the first
         EAGER_BATCH_SIZE images "eager": high fetch priority + jump to the
         front of the queue, so the part of the grid the user actually sees
         first is what the limited concurrency slots work on first.
       - Everything else (rest of that panel + any panel reached by
         scrolling, via the IntersectionObserver, rootMargin 200px) is
         queued normally and drains through the same MAX_CONCURRENT_LOADS
         slots as capacity frees up — so total simultaneous decode/paint
         work is always bounded, no matter how big the category is.
     ======================================================================= */
  var nanonanLazy = (function initLazyImages() {
    var LAZY_SELECTOR = 'img[data-src]';
    var MAX_CONCURRENT_LOADS = 8; // hard cap on simultaneous fetch+decode — this is what kills the jank
    var EAGER_BATCH_SIZE = 8;     // first N images of a clicked category race to the front of the queue

    var activeLoads = 0;
    var queue = []; // FIFO of <img> elements waiting for a free slot

    function drainQueue() {
      while (activeLoads < MAX_CONCURRENT_LOADS && queue.length) {
        startLoad(queue.shift());
      }
    }

    function startLoad(img) {
      var src = img.getAttribute('data-src');
      img.removeAttribute('data-src');
      if (!src) { img.classList.add('img-loaded'); return; }

      activeLoads++;
      var settled = false;
      function settle() {
        if (settled) return;
        settled = true;
        img.removeEventListener('load', settle);
        img.removeEventListener('error', settle);
        img.classList.add('img-loaded'); // fade-in trigger, even on error → never stuck at opacity:0
        activeLoads--;
        drainQueue();
      }
      img.addEventListener('load', settle, { once: true });
      img.addEventListener('error', settle, { once: true });
      img.src = src;
    }

    function enqueue(img, eager) {
      try { img.fetchPriority = eager ? 'high' : 'low'; } catch (e) { /* unsupported browsers: harmless no-op */ }
      if (eager) queue.unshift(img); else queue.push(img);
      drainQueue();
    }

    function loadImage(img, eager) {
      if (!img || img.dataset.loaded === '1') return;
      img.dataset.loaded = '1'; // reserve immediately — never queued/fetched twice
      enqueue(img, !!eager);
    }

    var observer = ('IntersectionObserver' in window)
      ? new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            loadImage(entry.target, false);
            observer.unobserve(entry.target);
          });
        }, { root: null, rootMargin: '200px 0px', threshold: 0.01 })
      : null;

    function observeAll(root) {
      var scope = (root && root.querySelectorAll) ? root : document;
      var imgs = scope.querySelectorAll(LAZY_SELECTOR);
      for (var i = 0; i < imgs.length; i++) {
        if (imgs[i].dataset.loaded === '1') continue;
        if (observer) observer.observe(imgs[i]);
        else loadImage(imgs[i], false); // no IO support → just queue it, no lazy story to tell
      }
    }

    function preloadPanelImages(panel) {
      if (!panel) return;
      var imgs = panel.querySelectorAll(LAZY_SELECTOR);
      for (var i = 0; i < imgs.length; i++) {
        if (observer) observer.unobserve(imgs[i]);
        loadImage(imgs[i], i < EAGER_BATCH_SIZE);
      }
    }

    observeAll(document); // the first (server-rendered "active") panel's product images

    return { observeAll: observeAll, preloadPanelImages: preloadPanelImages, loadImage: loadImage };
  }());

  /* =======================================================================
     5. CATEGORY SWITCHER
     Exit: current cards fall down & fade (staggered).
     Enter: next category's cards rain in from above (staggered).
     Single set of DOM nodes per category — the grid/list layout is a pure
     CSS concern driven by menuMain[data-view], so switching category never
     duplicates or re-fetches product images.
     ======================================================================= */
  var navInner    = document.querySelector('.cat-nav');
  var catCards    = Array.prototype.slice.call(document.querySelectorAll('.cat-card'));
  var catSwitching = false;
  var catSwitchToken = 0; // bumped on every activateCategory call — lets a newer click cancel an older one mid-animation
  var catTimers = [];     // pending setTimeout ids from the in-flight fall-out/cascade-in, cleared on interruption
  var viewSwitching = false; // declared here, used by both §4 and §7 as a mutual guard

  function clearCatTimers() {
    catTimers.forEach(function (id) { clearTimeout(id); });
    catTimers = [];
  }

  function hardResetPanelAnim(panel) {
    if (!panel) return;
    cardsOf(panel).forEach(function (el) {
      el.classList.remove('card-fall-out', 'card-cascade-in');
      el.style.removeProperty('--fall-delay');
      el.style.removeProperty('--cascade-delay');
    });
  }

  function centerCard(card) {
    if (!navInner || !card) return;
    var r = card.getBoundingClientRect();
    var nr = navInner.getBoundingClientRect();
    var delta = (r.left + r.width / 2) - (nr.left + nr.width / 2);
    if (Math.abs(delta) > 1) navInner.scrollBy({ left: delta, behavior: 'smooth' });
  }

  function cascadeInitialCards(startDelayMs) {
    var panel = getActivePanel();
    if (!panel) return;
    var cards = cardsOf(panel);
    if (!cards.length) return;
    var base = startDelayMs || 0;
    cards.forEach(function (el, i) {
      el.style.setProperty('--cascade-delay', (base + Math.min(i, 10) * STAGGER_MS) + 'ms');
      el.classList.add('card-cascade-in');
    });
    var total = base + Math.min(cards.length, 10) * STAGGER_MS + 600;
    setTimeout(function () {
      cards.forEach(function (el) { el.classList.remove('card-cascade-in'); el.style.removeProperty('--cascade-delay'); });
    }, total);
  }

  function activateCategory(targetId, card) {
    if (viewSwitching) return; // still guard against the grid⇄list FLIP measuring mid-transition
    var currentPanel = getActivePanel();
    var nextPanel = document.getElementById(targetId);
    if (!nextPanel || nextPanel === currentPanel) return;

    // Every click gets its own token. A click that arrives while the
    // previous switch is still mid fall-out/cascade-in no longer has to
    // wait — it bumps the token, which makes every pending timeout /
    // callback from the older switch a silent no-op, and snaps whatever
    // was mid-flight back to a clean resting state before starting fresh.
    // That's what makes rapid tab-tapping actually feel instant instead of
    // being ignored for ~1-1.5s per switch.
    var myToken = ++catSwitchToken;
    clearCatTimers();
    catSwitching = true;

    // Kick off the new category's product images right now, while the panel
    // is still display:none and the old one is mid fall-out — the first
    // EAGER_BATCH_SIZE race to the front of the priority queue so the part
    // of the grid the user is about to see loads first, capped concurrency
    // keeps the rest from bursting all at once.
    nanonanLazy.preloadPanelImages(nextPanel);

    catCards.forEach(function (c) {
      var isActive = c === card;
      c.classList.toggle('active', isActive);
      c.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    centerCard(card);

    // Snap anything left mid-animation from an interrupted switch straight
    // to its resting state so the new transition starts clean rather than
    // stacking on top of half-finished transforms.
    hardResetPanelAnim(currentPanel);
    hardResetPanelAnim(nextPanel);

    function playCascadeIn() {
      if (myToken !== catSwitchToken) return; // a newer click already took over
      nextPanel.classList.add('active');
      var cards = cardsOf(nextPanel);
      cards.forEach(function (el, i) {
        el.style.setProperty('--cascade-delay', Math.min(i, 10) * STAGGER_MS + 'ms');
        el.classList.add('card-cascade-in');
      });
      var settleAfter = Math.min(cards.length, 10) * STAGGER_MS + 580;
      catTimers.push(setTimeout(function () {
        if (myToken !== catSwitchToken) return;
        cards.forEach(function (el) { el.classList.remove('card-cascade-in'); el.style.removeProperty('--cascade-delay'); });
        catSwitching = false;
      }, settleAfter));
    }

    if (currentPanel) {
      var outCards = cardsOf(currentPanel);
      if (!outCards.length) {
        currentPanel.classList.remove('active');
        playCascadeIn();
        return;
      }
      outCards.forEach(function (el, i) {
        el.style.setProperty('--fall-delay', Math.min(i, 10) * (STAGGER_MS * 0.6) + 'ms');
        el.classList.add('card-fall-out');
      });
      var fallTotal = Math.min(outCards.length, 10) * (STAGGER_MS * 0.6) + 440;
      catTimers.push(setTimeout(function () {
        if (myToken !== catSwitchToken) return;
        currentPanel.classList.remove('active');
        hardResetPanelAnim(currentPanel);
        playCascadeIn();
      }, fallTotal));
    } else {
      playCascadeIn();
    }
  }

  catCards.forEach(function (card) {
    // .cat-card is a real <button> — Enter/Space already dispatch a native
    // 'click' for us, so a single listener covers mouse, touch and keyboard.
    card.addEventListener('click', function () { activateCategory(card.getAttribute('data-target'), card); });
  });

  /* =======================================================================
     6. PRELOADER
     Holds for exactly 5s after the page has *fully* finished loading
     (window 'load' — all images/fonts/etc. included), then dissolves: the
     screen is covered by a grid of overlapping circles (goo-filtered into
     one seamless liquid sheet), which then shrink away with randomized
     timing — reading as the loading screen dissolving into bubbles rather
     than a flat fade.
     ======================================================================= */
  (function initPreloader() {
    var preloader = document.getElementById('preloader');
    if (!preloader) { html.classList.add('app-ready'); cascadeInitialCards(0); return; }

    lockScroll();

    var HOLD_AFTER_LOAD_MS = 5000;  // دقیقاً ۵ ثانیه بعد از لود کامل تمام ریسورس‌ها
    var HARD_TIMEOUT_MS    = 10000; // سقف ایمنی برای اتصال‌های خیلی کند (اگر رویداد load هرگز شلیک نشود)
    var dissolveContainer  = document.getElementById('preloaderDissolve');
    var alreadyHidden      = false;

    /* Grid of jittered, overlapping circles sized to fully tile the
       viewport (so at rest — scale(1) — the sheet is seamless), which the
       inline SVG "goo" filter blends into one liquid surface. */
    function spawnGooBubbles() {
      if (!dissolveContainer) return [];
      var vw = window.innerWidth, vh = window.innerHeight;
      var cols = Math.max(3, Math.round(vw / 200));
      var rows = Math.max(3, Math.round(vh / 200));
      var cellW = vw / cols, cellH = vh / rows;
      var diameter = Math.max(cellW, cellH) * 2.3;
      var frag = document.createDocumentFragment();
      var bubbles = [];
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var cx = cellW * (c + 0.5) + (Math.random() - 0.5) * cellW * 0.6;
          var cy = cellH * (r + 0.5) + (Math.random() - 0.5) * cellH * 0.6;
          var b = document.createElement('span');
          b.className = 'preloader-bubble';
          b.style.width = diameter.toFixed(0) + 'px';
          b.style.height = diameter.toFixed(0) + 'px';
          b.style.left = (cx - diameter / 2).toFixed(0) + 'px';
          b.style.top = (cy - diameter / 2).toFixed(0) + 'px';
          b.style.setProperty('--bubble-dur', (560 + Math.random() * 340).toFixed(0) + 'ms');
          b.style.transitionDelay = (Math.random() * 260).toFixed(0) + 'ms';
          frag.appendChild(b);
          bubbles.push(b);
        }
      }
      dissolveContainer.appendChild(frag);
      return bubbles;
    }

    function finishHide() {
      preloader.classList.add('is-hidden');
      unlockScroll();
      html.classList.add('app-ready');
      cascadeInitialCards(520); // let the top-bar/nav slide-in lead, then rain the first products in
      setTimeout(function () {
        if (preloader.parentNode) preloader.parentNode.removeChild(preloader);
      }, 60);
    }

    function hidePreloader() {
      if (alreadyHidden) return;
      alreadyHidden = true;

      if (prefersReducedMotion()) { preloader.classList.add('is-hidden'); finishHide(); return; }

      var bubbles = spawnGooBubbles();
      preloader.classList.add('is-dissolving'); // base bg drops out; bubbles (same color) keep full coverage → zero flash

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          bubbles.forEach(function (b) { b.classList.add('pop'); });
        });
      });

      setTimeout(finishHide, 260 /* max stagger delay */ + 900 /* max bubble duration */ + 60 /* buffer */);
    }

    if (document.readyState === 'complete') setTimeout(hidePreloader, HOLD_AFTER_LOAD_MS);
    else window.addEventListener('load', function () { setTimeout(hidePreloader, HOLD_AFTER_LOAD_MS); });
    setTimeout(hidePreloader, HARD_TIMEOUT_MS);
  }());

  /* =======================================================================
     7. THEME TOGGLE — liquid bubble grown from the exact click point.
     The radius is computed from the button's position against the actual
     viewport size, so the bubble always fully covers the screen — including
     on wide desktop monitors, not just phones.
     ======================================================================= */
  (function initThemeToggle() {
    var themeBtn = document.getElementById('themeBtn');
    var themeIcon = document.getElementById('themeIcon');
    if (!themeBtn || !themeIcon) return;

    function currentMode() { return html.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light'; }
    function syncIcon(mode) { themeIcon.className = mode === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill'; }

    syncIcon(currentMode());
    syncMetaThemeColor(currentMode());

    var switching = false;

    themeBtn.addEventListener('click', function () {
      if (switching) return;
      switching = true;

      var rect = themeBtn.getBoundingClientRect();
      var x = rect.left + rect.width / 2;
      var y = rect.top + rect.height / 2;
      var next = currentMode() === 'dark' ? 'light' : 'dark';

      function applyTheme() {
        html.setAttribute('data-bs-theme', next);
        try { localStorage.setItem('nanonan-theme', next); } catch (e) {}
        syncIcon(next);
        syncMetaThemeColor(next);
        themeBtn.classList.remove('spinning');
        void themeBtn.offsetWidth;
        themeBtn.classList.add('spinning');
      }

      if (prefersReducedMotion()) { applyTheme(); switching = false; return; }

      var vw = window.innerWidth, vh = window.innerHeight;
      var dx = Math.max(x, vw - x), dy = Math.max(y, vh - y);
      var radius = Math.ceil(Math.sqrt(dx * dx + dy * dy)) + 12;

      var bubble = document.createElement('div');
      bubble.className = 'theme-bubble';
      bubble.setAttribute('aria-hidden', 'true');
      bubble.style.setProperty('--bubble-x', x + 'px');
      bubble.style.setProperty('--bubble-y', y + 'px');
      bubble.style.setProperty('--bubble-radius', radius + 'px');
      bubble.style.setProperty('--bubble-color-rgb', readCssVar(next === 'dark' ? '--cream-dark-rgb' : '--cream-light-rgb'));
      document.body.appendChild(bubble);

      requestAnimationFrame(function () { bubble.classList.add('expanding'); });

      bubble.addEventListener('transitionend', function onExpandEnd(ev) {
        if (ev.propertyName !== 'transform') return;
        bubble.removeEventListener('transitionend', onExpandEnd);

        applyTheme(); // swap the real theme while the bubble is at full blur/coverage, masking the change

        bubble.classList.remove('expanding');
        bubble.classList.add('retreating');
        bubble.addEventListener('transitionend', function onRetreatEnd(ev2) {
          if (ev2.propertyName !== 'transform') return;
          bubble.removeEventListener('transitionend', onRetreatEnd);
          bubble.remove();
          switching = false;
        });
      });
    });
  }());

  /* =======================================================================
     8. VIEW SWITCHER — Grid ⇄ List, vanilla FLIP
     First: record each visible card's rect. Toggle the layout (Last).
     Invert: jump each card back to its first position with transitions
     off. Play: clear the offset with transitions on, so the browser
     animates the *position* change. Never scales the box, so text and
     images are never distorted — only translated into their new slot.
     ======================================================================= */
  (function initViewSwitcher() {
    var viewGridBtn = document.getElementById('viewGridBtn');
    var viewListBtn = document.getElementById('viewListBtn');
    if (!menuMain || !viewGridBtn || !viewListBtn) return;

    function setView(view, animate) {
      if (view !== 'grid' && view !== 'list') return;
      if (catSwitching || viewSwitching) return;
      if (menuMain.getAttribute('data-view') === view) return;

      var activePanel = getActivePanel();
      var cards = (animate && activePanel && !prefersReducedMotion()) ? cardsOf(activePanel) : [];
      var firstRects = cards.map(function (c) { return c.getBoundingClientRect(); });

      menuMain.setAttribute('data-view', view);
      viewGridBtn.classList.toggle('active', view === 'grid');
      viewGridBtn.setAttribute('aria-pressed', view === 'grid' ? 'true' : 'false');
      viewListBtn.classList.toggle('active', view === 'list');
      viewListBtn.setAttribute('aria-pressed', view === 'list' ? 'true' : 'false');
      try { localStorage.setItem('nanonan-view', view); } catch (e) {}

      if (!cards.length) return;

      viewSwitching = true;
      var pending = cards.length;
      function settle() { pending -= 1; if (pending <= 0) viewSwitching = false; }

      cards.forEach(function (card, i) {
        var first = firstRects[i];
        var last = card.getBoundingClientRect();
        var dx = first.left - last.left;
        var dy = first.top - last.top;

        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) { settle(); return; }

        card.style.transition = 'none';
        card.style.transitionDelay = '0ms';
        card.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
        card.classList.add('is-flip-fade');
        void card.offsetWidth; // flush the above before re-enabling transitions

        requestAnimationFrame(function () {
          card.style.transitionDelay = Math.min(i, 12) * 12 + 'ms';
          card.classList.add('is-flipping');
          card.classList.remove('is-flip-fade');
          card.style.transform = '';
        });

        var cleaned = false;
        function cleanup(ev) {
          if (ev && ev.propertyName && ev.propertyName !== 'transform') return;
          if (cleaned) return;
          cleaned = true;
          card.removeEventListener('transitionend', cleanup);
          card.classList.remove('is-flipping');
          card.style.transform = '';
          card.style.transition = '';
          card.style.transitionDelay = '';
          settle();
        }
        card.addEventListener('transitionend', cleanup);
        setTimeout(cleanup, 700); // safety net in case transitionend never fires
      });
    }

    viewGridBtn.addEventListener('click', function () { setView('grid', true); });
    viewListBtn.addEventListener('click', function () { setView('list', true); });

    window.__nanonanSetView = setView; // exposed for the boot step below
  }());

  /* =======================================================================
     9. STICKY CATEGORY BAR — shadow once it has actually docked to the top
     ======================================================================= */
  (function initStickyShadow() {
    var wrapper = document.getElementById('catNav');
    if (!wrapper || !wrapper.parentNode || !('IntersectionObserver' in window)) return;
    var sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:relative;height:1px;margin-top:-1px;pointer-events:none;';
    wrapper.parentNode.insertBefore(sentinel, wrapper);
    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { wrapper.classList.toggle('is-stuck', !entry.isIntersecting); });
    }, { threshold: 0 }).observe(sentinel);
  }());

  /* =======================================================================
     10. PRODUCT BOTTOM SHEET — Bootstrap Offcanvas (offcanvas-bottom) skin,
     plus a custom drag-to-dismiss layer on the handle + image header.
     Bootstrap already provides show/hide, backdrop, ESC-to-close, focus
     trap and scroll-lock — this only supplies content + the drag gesture.
     ======================================================================= */
  (function initBottomSheet() {
    var sheetEl = document.getElementById('productSheet');
    if (!sheetEl || !window.bootstrap || !window.bootstrap.Offcanvas) return;

    var offcanvas = window.bootstrap.Offcanvas.getOrCreateInstance(sheetEl, { backdrop: true, scroll: false, keyboard: true });

    var sheetBody     = sheetEl.querySelector('.offcanvas-body');
    var mediaEl       = sheetEl.querySelector('.sheet-media');
    var dragHandle    = document.getElementById('sheetDragHandle');
    var sheetImg      = document.getElementById('sheetImg');
    var sheetMediaPh  = document.getElementById('sheetMediaPlaceholder');
    var sheetCatVisual = document.getElementById('sheetCatVisual');
    var sheetCatName  = document.getElementById('sheetCatName');
    var sheetItemName = document.getElementById('sheetItemName');
    var sheetPrice    = document.getElementById('sheetPrice');
    var sheetDesc     = document.getElementById('sheetDesc');

    // همان منطق isVectorIcon سمت سرور (index.ejs) — فقط برای انتخاب object-fit
    // مناسب (وکتور را کامل و بدون بریدگی نشان می‌دهد، عکس واقعی را کادر پر می‌کند).
    // خودِ تصویر/آیکون دقیقاً همان فایلی است که در پنل ادمین انتخاب شده — بدون تغییر رنگ.
    function isVectorIconUrl(url) { return !!url && /\.svg(\?.*)?$/i.test(url); }
    function renderCatVisual(container, imgUrl, iconClass) {
      container.textContent = '';
      var node;
      if (imgUrl) {
        node = document.createElement('img');
        node.className = 'lazy-img' + (isVectorIconUrl(imgUrl) ? ' is-vector' : '');
        node.alt = '';
        // Tiny (22px) badge icon, always needed the moment the sheet opens —
        // no observer needed, but it still fades in on load like every
        // other image so nothing pops in abruptly.
        node.addEventListener('load', function onLoad() {
          node.removeEventListener('load', onLoad);
          node.classList.add('img-loaded');
        }, { once: true });
        node.src = imgUrl;
      } else {
        node = document.createElement('i');
        node.className = 'bi ' + (iconClass || 'bi-grid');
        node.setAttribute('aria-hidden', 'true');
      }
      container.appendChild(node);
    }

    // Bump every time the sheet is (re)opened so a slow-loading image from a
    // previously opened product can never land on top of the one the user
    // is currently looking at (classic race when tapping cards quickly).
    var sheetImgToken = 0;

    function fillSheet(data) {
      sheetItemName.textContent = data.name || '';
      sheetPrice.textContent = Number(data.price || 0).toLocaleString('fa-IR');
      sheetDesc.textContent = (data.desc && data.desc.trim()) ? data.desc : 'توضیحاتی برای این محصول ثبت نشده است.';
      sheetCatName.textContent = data.cat || '';
      renderCatVisual(sheetCatVisual, data.catImg, data.catIcon);

      // Grid thumbnails are the lightweight version; the sheet always shows
      // the full-quality image, only fetched now that it's actually needed.
      var fullImg = data.fullImg || data.img;
      var myToken = ++sheetImgToken;

      sheetImg.classList.remove('img-loaded');

      if (fullImg) {
        sheetImg.alt = data.name || '';
        sheetImg.style.display = 'block';
        sheetMediaPh.style.display = 'none';
        try { sheetImg.fetchPriority = 'high'; } catch (e) { /* unsupported browsers: harmless no-op */ }
        sheetImg.addEventListener('load', function onLoad() {
          sheetImg.removeEventListener('load', onLoad);
          if (myToken !== sheetImgToken) return; // a newer product opened before this one finished
          sheetImg.classList.add('img-loaded');
        }, { once: true });
        sheetImg.src = fullImg;
      } else {
        sheetImg.removeAttribute('src');
        sheetImg.style.display = 'none';
        sheetMediaPh.style.display = 'flex';
      }
      if (sheetBody) sheetBody.scrollTop = 0;
    }

    function openFromCard(card) { fillSheet(card.dataset); offcanvas.show(); }

    // .menu-card is a real <button> — Enter/Space already dispatch a native
    // 'click', so a single delegated listener covers mouse, touch and
    // keyboard. Cards are re-rendered/animated constantly, so we delegate
    // from document rather than binding per-card.
    document.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.menu-card') : null;
      if (card) openFromCard(card);
    });

    sheetEl.addEventListener('hidden.bs.offcanvas', function () {
      sheetImg.removeAttribute('src'); // stop holding the decoded image once closed
      sheetImg.classList.remove('img-loaded');
    });

    /* --- drag-to-dismiss --- */
    var DUR_SLOW = 440; // keep in sync with --dur-slow in style.css
    var dragState = null;

    function onDragStart(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragState = { startY: e.clientY, lastY: e.clientY, startedAt: Date.now() };
      sheetEl.classList.add('is-dragging');
      if (e.currentTarget.setPointerCapture) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {} }
    }
    function onDragMove(e) {
      if (!dragState) return;
      dragState.lastY = e.clientY;
      var delta = Math.max(0, Math.min(dragState.lastY - dragState.startY, window.innerHeight * 1.2));
      sheetEl.style.transform = 'translate3d(-50%,' + delta + 'px,0)';
    }
    function onDragEnd() {
      if (!dragState) return;
      var delta = dragState.lastY - dragState.startY;
      var elapsed = Math.max(1, Date.now() - dragState.startedAt);
      var velocity = delta / elapsed;
      var dismiss = delta > 120 || velocity > 0.55;
      dragState = null;
      sheetEl.classList.remove('is-dragging');

      if (dismiss) {
        sheetEl.style.transition = 'transform ' + DUR_SLOW + 'ms var(--ease-std)';
        sheetEl.style.transform = 'translate3d(-50%,100%,0)';
        sheetEl.addEventListener('transitionend', function done() {
          sheetEl.removeEventListener('transitionend', done);
          sheetEl.style.transition = '';
          sheetEl.style.transform = '';
          offcanvas.hide();
        }, { once: true });
      } else {
        sheetEl.style.transition = 'transform ' + DUR_SLOW + 'ms var(--ease)';
        sheetEl.style.transform = '';
        sheetEl.addEventListener('transitionend', function done() {
          sheetEl.removeEventListener('transitionend', done);
          sheetEl.style.transition = '';
        }, { once: true });
      }
    }

    [dragHandle, mediaEl].forEach(function (el) {
      if (!el) return;
      el.addEventListener('pointerdown', onDragStart);
      el.addEventListener('pointermove', onDragMove);
      el.addEventListener('pointerup', onDragEnd);
      el.addEventListener('pointercancel', onDragEnd);
    });
  }());

  /* =======================================================================
     11. BOOT — restore the visitor's saved view preference (no animation
     on first paint since there is nothing to FLIP *from* yet).
     ======================================================================= */
  try {
    var savedView = localStorage.getItem('nanonan-view');
    if ((savedView === 'list' || savedView === 'grid') && typeof window.__nanonanSetView === 'function') {
      window.__nanonanSetView(savedView, false);
    }
  } catch (e) {}

}());