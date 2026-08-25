(function () {
  'use strict';

  var html = document.documentElement;


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


  var lockCount = 0;
  function lockScroll() { lockCount++; html.classList.add('scroll-locked'); }
  function unlockScroll() { lockCount = Math.max(0, lockCount - 1); if (lockCount === 0) html.classList.remove('scroll-locked'); }


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


  var nanonanLazy = (function initLazyImages() {
    var LAZY_SELECTOR = 'img[data-src]';
    var MAX_CONCURRENT_LOADS = 8;
    var EAGER_BATCH_SIZE = 8;

    var activeLoads = 0;
    var queue = [];

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
        img.classList.add('img-loaded');
        activeLoads--;
        drainQueue();
      }
      img.addEventListener('load', settle, { once: true });
      img.addEventListener('error', settle, { once: true });
      img.src = src;
    }

    function enqueue(img, eager) {
      try { img.fetchPriority = eager ? 'high' : 'low'; } catch (e) {  }
      if (eager) queue.unshift(img); else queue.push(img);
      drainQueue();
    }

    function loadImage(img, eager) {
      if (!img || img.dataset.loaded === '1') return;
      img.dataset.loaded = '1';
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
        else loadImage(imgs[i], false);
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

    observeAll(document);

    function preloadInitialPanel(panel) {
      var target = panel || document.querySelector('[data-cat-panel].active');
      if (!target) return;
      preloadPanelImages(target);
    }

    preloadInitialPanel();

    return { observeAll: observeAll, preloadPanelImages: preloadPanelImages, loadImage: loadImage, preloadInitialPanel: preloadInitialPanel };
  }());


  var navInner    = document.querySelector('.cat-nav');
  var catCards    = Array.prototype.slice.call(document.querySelectorAll('.cat-card'));
  var catSwitching = false;
  var catSwitchToken = 0;
  var catTimers = [];
  var viewSwitching = false;

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
    if (viewSwitching) return;
    var currentPanel = getActivePanel();
    var nextPanel = document.getElementById(targetId);
    if (!nextPanel || nextPanel === currentPanel) return;








    var myToken = ++catSwitchToken;
    clearCatTimers();
    catSwitching = true;






    nanonanLazy.preloadPanelImages(nextPanel);

    catCards.forEach(function (c) {
      var isActive = c === card;
      c.classList.toggle('active', isActive);
      c.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    centerCard(card);




    hardResetPanelAnim(currentPanel);
    hardResetPanelAnim(nextPanel);

    function playCascadeIn() {
      if (myToken !== catSwitchToken) return;
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


    card.addEventListener('click', function () { activateCategory(card.getAttribute('data-target'), card); });
  });


  (function initPreloader() {
    var preloader = document.getElementById('preloader');
    if (!preloader) { html.classList.add('app-ready'); nanonanLazy.preloadInitialPanel(); cascadeInitialCards(0); return; }

    lockScroll();

    var HOLD_AFTER_LOAD_MS = 5000;
    var HARD_TIMEOUT_MS    = 10000;
    var dissolveContainer  = document.getElementById('preloaderDissolve');
    var alreadyHidden      = false;


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
      nanonanLazy.preloadInitialPanel();
      cascadeInitialCards(520);
      setTimeout(function () {
        if (preloader.parentNode) preloader.parentNode.removeChild(preloader);
      }, 60);
    }

    function hidePreloader() {
      if (alreadyHidden) return;
      alreadyHidden = true;

      if (prefersReducedMotion()) { preloader.classList.add('is-hidden'); finishHide(); return; }

      var bubbles = spawnGooBubbles();
      preloader.classList.add('is-dissolving');

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          bubbles.forEach(function (b) { b.classList.add('pop'); });
        });
      });

      setTimeout(finishHide, 260  + 900  + 60 );
    }

    if (document.readyState === 'complete') setTimeout(hidePreloader, HOLD_AFTER_LOAD_MS);
    else window.addEventListener('load', function () { setTimeout(hidePreloader, HOLD_AFTER_LOAD_MS); });
    setTimeout(hidePreloader, HARD_TIMEOUT_MS);
  }());


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

        applyTheme();

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
        void card.offsetWidth;

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
        setTimeout(cleanup, 700);
      });
    }

    viewGridBtn.addEventListener('click', function () { setView('grid', true); });
    viewListBtn.addEventListener('click', function () { setView('list', true); });

    window.__nanonanSetView = setView;
  }());


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
        try { sheetImg.fetchPriority = 'high'; } catch (e) {  }
        sheetImg.addEventListener('load', function onLoad() {
          sheetImg.removeEventListener('load', onLoad);
          if (myToken !== sheetImgToken) return;
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





    document.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.menu-card') : null;
      if (card) openFromCard(card);
    });

    sheetEl.addEventListener('hidden.bs.offcanvas', function () {
      sheetImg.removeAttribute('src');
      sheetImg.classList.remove('img-loaded');
    });


    var DUR_SLOW = 440;
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


  try {
    var savedView = localStorage.getItem('nanonan-view');
    if ((savedView === 'list' || savedView === 'grid') && typeof window.__nanonanSetView === 'function') {
      window.__nanonanSetView(savedView, false);
    }
  } catch (e) {}

}());