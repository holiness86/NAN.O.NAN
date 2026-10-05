(function () {
  'use strict';

  var doc = document;
  var html = doc.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var EASE = 'cubic-bezier(.32,.72,0,1)';
  var THEME_COLOR = { light: '#F6ECE5', dark: '#1B120C' };
  var PRELOADER_MIN_MS = 2400;
  var PRELOADER_MAX_MS = 8000;
  var VECTOR_RE = /\.svg(\?.*)?$/i;

  function byId(id) { return doc.getElementById(id); }

  function storage(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) {}
    return null;
  }

  var scrollLock = (function () {
    var count = 0;
    return {
      on: function () { count++; html.classList.add('scroll-locked'); },
      off: function () { count = Math.max(0, count - 1); if (!count) html.classList.remove('scroll-locked'); }
    };
  }());

  var menuMain = byId('menuMain');
  var catNav = byId('catNav');
  var panels = Array.prototype.slice.call(doc.querySelectorAll('[data-cat-panel]'));
  var currentPanel = doc.querySelector('[data-cat-panel].active');

  function playEnter(panel) {
    if (!panel || reduceMotion.matches) return;
    panel.classList.add('enter');
    clearTimeout(playEnter.timer);
    playEnter.timer = setTimeout(function () { panel.classList.remove('enter'); }, 520);
  }

  (function initImages() {
    function reveal(e) {
      var el = e.target;
      if (el.tagName === 'IMG' && el.classList.contains('lazy-img')) el.classList.add('img-loaded');
    }
    doc.addEventListener('load', reveal, true);
    doc.addEventListener('error', reveal, true);

    var imgs = doc.querySelectorAll('.lazy-img');
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].complete && imgs[i].naturalWidth) imgs[i].classList.add('img-loaded');
    }
  }());

  (function initCategories() {
    var nav = catNav && catNav.querySelector('.cat-nav');
    if (!nav || !panels.length) return;

    var cards = Array.prototype.slice.call(nav.querySelectorAll('.cat-card'));

    function setActiveCard(card) {
      for (var i = 0; i < cards.length; i++) {
        var on = cards[i] === card;
        cards[i].classList.toggle('active', on);
        cards[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }

    function keepScrollPosition() {
      var top = menuMain.getBoundingClientRect().top - catNav.offsetHeight;
      return top < 0 ? window.pageYOffset + top : null;
    }

    nav.addEventListener('click', function (e) {
      var card = e.target.closest('.cat-card');
      if (!card) return;
      var next = byId(card.getAttribute('data-target'));
      if (!next || next === currentPanel) return;

      var restoreY = keepScrollPosition();
      var prev = currentPanel;
      currentPanel = next;

      setActiveCard(card);
      prev.classList.remove('active', 'enter');
      next.classList.add('active');
      playEnter(next);

      if (restoreY !== null) window.scrollTo(0, restoreY);
      card.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    });
  }());

  (function initViewSwitcher() {
    var gridBtn = byId('viewGridBtn');
    var listBtn = byId('viewListBtn');
    if (!menuMain || !gridBtn || !listBtn) return;

    function syncButtons(view) {
      gridBtn.classList.toggle('active', view === 'grid');
      gridBtn.setAttribute('aria-pressed', view === 'grid' ? 'true' : 'false');
      listBtn.classList.toggle('active', view === 'list');
      listBtn.setAttribute('aria-pressed', view === 'list' ? 'true' : 'false');
    }

    function visibleCards() {
      var all = currentPanel ? currentPanel.querySelectorAll('.menu-card') : [];
      var vh = window.innerHeight;
      var out = [];
      for (var i = 0; i < all.length && out.length < 24; i++) {
        var r = all[i].getBoundingClientRect();
        if (r.bottom > -80 && r.top < vh + 80) out.push({ el: all[i], first: r });
      }
      return out;
    }

    function setView(view) {
      if (html.getAttribute('data-view') === view) return;

      var items = reduceMotion.matches ? [] : visibleCards();

      html.setAttribute('data-view', view);
      syncButtons(view);
      storage('nanonan-view', view);

      if (!items.length) return;

      var lasts = items.map(function (it) { return it.el.getBoundingClientRect(); });

      items.forEach(function (it, i) {
        var dx = it.first.left - lasts[i].left;
        var dy = it.first.top - lasts[i].top;
        if (!dx && !dy) return;
        it.el.animate(
          [{ transform: 'translate3d(' + dx + 'px,' + dy + 'px,0)' }, { transform: 'none' }],
          { duration: 280, easing: EASE, delay: Math.min(i, 8) * 10, fill: 'backwards' }
        );
      });
    }

    syncButtons(html.getAttribute('data-view') === 'list' ? 'list' : 'grid');
    gridBtn.addEventListener('click', function () { setView('grid'); });
    listBtn.addEventListener('click', function () { setView('list'); });
  }());

  (function initTheme() {
    var btn = byId('themeBtn');
    var icon = byId('themeIcon');
    var meta = doc.querySelector('meta[name="theme-color"]');
    if (!btn || !icon) return;

    var busy = false;

    function mode() { return html.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light'; }

    function paint(next) {
      html.setAttribute('data-bs-theme', next);
      icon.className = next === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
      if (meta) meta.setAttribute('content', THEME_COLOR[next]);
      storage('nanonan-theme', next);
    }

    function spinIcon() {
      if (reduceMotion.matches) return;
      icon.animate(
        [{ transform: 'rotate(-90deg) scale(.5)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 260, easing: EASE }
      );
    }

    icon.className = mode() === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
    if (meta) meta.setAttribute('content', THEME_COLOR[mode()]);

    btn.addEventListener('click', function () {
      if (busy) return;
      var next = mode() === 'dark' ? 'light' : 'dark';

      if (!doc.startViewTransition || reduceMotion.matches) {
        paint(next);
        spinIcon();
        return;
      }

      busy = true;
      var rect = btn.getBoundingClientRect();
      var x = rect.left + rect.width / 2;
      var y = rect.top + rect.height / 2;
      var radius = Math.ceil(Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)));

      var transition = doc.startViewTransition(function () { paint(next); });

      transition.ready.then(function () {
        html.animate(
          { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + radius + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 400, easing: EASE, pseudoElement: '::view-transition-new(root)' }
        );
        spinIcon();
      }).catch(function () {});

      function release() { busy = false; }
      transition.finished.then(release, release);
    });
  }());

  (function initStickyShadow() {
    var sentinel = byId('navSentinel');
    if (!sentinel || !catNav || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (entries) {
      catNav.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }).observe(sentinel);
  }());

  (function initBottomSheet() {
    var sheet = byId('productSheet');
    if (!sheet || !window.bootstrap || !window.bootstrap.Offcanvas) return;

    var offcanvas = window.bootstrap.Offcanvas.getOrCreateInstance(sheet, { backdrop: true, scroll: false, keyboard: true });

    var body = byId('sheetBody');
    var media = byId('sheetMedia');
    var handle = byId('sheetDragHandle');
    var img = byId('sheetImg');
    var placeholder = byId('sheetMediaPlaceholder');
    var catImg = byId('sheetCatImg');
    var catIcon = byId('sheetCatIcon');
    var catName = byId('sheetCatName');
    var nameEl = byId('sheetItemName');
    var priceEl = byId('sheetPrice');
    var descEl = byId('sheetDesc');
    var EMPTY_DESC = 'توضیحاتی برای این محصول ثبت نشده است.';
    var token = 0;

    function fillCategory(data) {
      catName.textContent = data.catName || '';
      if (data.catImg) {
        catImg.classList.toggle('is-vector', VECTOR_RE.test(data.catImg));
        catImg.src = data.catImg;
        catImg.hidden = false;
        catIcon.hidden = true;
      } else {
        catImg.hidden = true;
        catImg.removeAttribute('src');
        catIcon.className = 'bi ' + (data.catIcon || 'bi-grid');
        catIcon.hidden = false;
      }
    }

    function fillImage(card, name) {
      var full = card.getAttribute('data-full-img');
      var id = ++token;

      img.classList.remove('img-loaded');

      if (!full) {
        img.hidden = true;
        img.removeAttribute('src');
        placeholder.hidden = false;
        return;
      }

      placeholder.hidden = true;
      img.hidden = false;
      img.alt = name;

      var thumbEl = card.querySelector('.menu-card-img img');
      var thumb = thumbEl && thumbEl.complete && thumbEl.naturalWidth ? thumbEl.currentSrc : '';

      if (!thumb || thumb === full) {
        img.src = full;
        return;
      }

      img.src = thumb;
      var loader = new Image();
      loader.decoding = 'async';
      loader.onload = function () { if (id === token) img.src = full; };
      loader.src = full;
    }

    function open(card) {
      var name = card.querySelector('.menu-card-name').textContent;
      var desc = card.querySelector('.menu-card-desc');

      nameEl.textContent = name;
      priceEl.textContent = card.querySelector('.menu-card-price-num').textContent;
      descEl.textContent = desc ? desc.textContent : EMPTY_DESC;
      fillCategory(card.closest('[data-cat-panel]').dataset);
      fillImage(card, name);
      body.scrollTop = 0;
      offcanvas.show();
    }

    if (menuMain) {
      menuMain.addEventListener('click', function (e) {
        var card = e.target.closest('.menu-card');
        if (card) open(card);
      });
    }

    sheet.addEventListener('hidden.bs.offcanvas', function () {
      token++;
      img.removeAttribute('src');
      img.classList.remove('img-loaded');
      sheet.style.transition = '';
      sheet.style.transform = '';
    });

    var drag = null;
    var offsetY = 0;
    var frame = 0;

    function paintDrag() {
      frame = 0;
      sheet.style.transform = 'translate3d(0,' + offsetY + 'px,0)';
    }

    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = { startY: e.clientY, startedAt: performance.now() };
      offsetY = 0;
      sheet.style.transition = 'none';
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    }

    function onMove(e) {
      if (!drag) return;
      offsetY = Math.max(0, e.clientY - drag.startY);
      if (!frame) frame = requestAnimationFrame(paintDrag);
    }

    function onUp() {
      if (!drag) return;
      var velocity = offsetY / Math.max(1, performance.now() - drag.startedAt);
      var dismiss = offsetY > 110 || velocity > 0.6;
      drag = null;

      if (frame) { cancelAnimationFrame(frame); frame = 0; }

      sheet.style.transition = 'transform 260ms ' + EASE;

      if (dismiss) {
        sheet.style.transform = 'translate3d(0,100%,0)';
        offcanvas.hide();
        return;
      }

      sheet.style.transform = '';
      sheet.addEventListener('transitionend', function reset() {
        sheet.removeEventListener('transitionend', reset);
        sheet.style.transition = '';
      });
    }

    [handle, media].forEach(function (el) {
      if (!el) return;
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    });
  }());

  (function initPreloader() {
    var preloader = byId('preloader');
    if (!preloader) { playEnter(currentPanel); return; }

    scrollLock.on();

    var startedAt = performance.now();
    var left = false;

    function remove() {
      if (preloader.parentNode) preloader.parentNode.removeChild(preloader);
    }

    function leave() {
      if (left) return;
      left = true;
      scrollLock.off();
      playEnter(currentPanel);

      if (reduceMotion.matches) { remove(); return; }

      preloader.classList.add('is-leaving');
      preloader.addEventListener('transitionend', function done(e) {
        if (e.target !== preloader) return;
        preloader.removeEventListener('transitionend', done);
        remove();
      });
      setTimeout(remove, 700);
    }

    function schedule() {
      setTimeout(leave, Math.max(0, PRELOADER_MIN_MS - (performance.now() - startedAt)));
    }

    if (doc.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });

    setTimeout(leave, PRELOADER_MAX_MS);
  }());
}());