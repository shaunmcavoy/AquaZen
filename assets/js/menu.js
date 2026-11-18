/* AquaZen header: Apple-style dropdowns on desktop, a full menu on phones. */
(function () {
  var header = document.querySelector('header.nav');
  if (!header) return;
  var drops = Array.prototype.slice.call(header.querySelectorAll('.nav-drop'));
  var hoverable = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var closeTimer = null;
  var openBtn = null;
  var openedAt = 0;

  function panel(btn) { return document.getElementById(btn.getAttribute('aria-controls')); }

  function open(btn) {
    clearTimeout(closeTimer);
    if (openBtn === btn) return;
    if (openBtn) shut(openBtn);
    openBtn = btn;
    openedAt = Date.now();
    btn.setAttribute('aria-expanded', 'true');
    var p = panel(btn);
    p.hidden = false;
    requestAnimationFrame(function () { p.classList.add('on'); });
    header.classList.add('mega-open');
  }
  function shut(btn) {
    btn.setAttribute('aria-expanded', 'false');
    var p = panel(btn);
    p.classList.remove('on');
    p.hidden = true;
    if (openBtn === btn) openBtn = null;
    if (!openBtn) header.classList.remove('mega-open');
  }
  function shutAll() { drops.forEach(function (b) { if (b.getAttribute('aria-expanded') === 'true') shut(b); }); }
  function later() { clearTimeout(closeTimer); closeTimer = setTimeout(shutAll, 180); }

  drops.forEach(function (btn) {
    var p = panel(btn);
    btn.addEventListener('click', function () {
      // A hover just opened it: a click right after should keep it open, not close it.
      if (btn.getAttribute('aria-expanded') === 'true') { if (Date.now() - openedAt > 400) shut(btn); } else open(btn);
    });
    if (hoverable) {
      btn.addEventListener('mouseenter', function () { open(btn); });
      btn.addEventListener('mouseleave', later);
      p.addEventListener('mouseenter', function () { clearTimeout(closeTimer); });
      p.addEventListener('mouseleave', later);
    }
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); open(btn); var f = p.querySelector('a'); if (f) f.focus(); }
    });
    p.addEventListener('focusout', function (e) {
      if (!p.contains(e.relatedTarget) && e.relatedTarget !== btn) shut(btn);
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (openBtn) { var b = openBtn; shut(b); b.focus(); }
    if (burger && burger.getAttribute('aria-expanded') === 'true') toggleMenu(false);
  });
  document.addEventListener('click', function (e) { if (openBtn && !header.contains(e.target)) shutAll(); });

  // Phone menu
  var burger = header.querySelector('.nav-burger');
  var mmenu = document.getElementById('mmenu');
  function toggleMenu(show) {
    burger.setAttribute('aria-expanded', show ? 'true' : 'false');
    burger.setAttribute('aria-label', show ? 'Close menu' : 'Open menu');
    mmenu.hidden = !show;
    header.classList.toggle('mmenu-open', show);
    document.body.style.overflow = show ? 'hidden' : '';
  }
  if (burger && mmenu) {
    burger.addEventListener('click', function () { toggleMenu(burger.getAttribute('aria-expanded') !== 'true'); });
    mmenu.addEventListener('click', function (e) { if (e.target.closest('a')) toggleMenu(false); });
  }
})();

/* Find your Zen, always one tap away. Shows once you've scrolled past the top,
   steps aside when a full Find your Zen section is already on screen. */
(function () {
  if (/^\/find-your-zen\//.test(location.pathname)) return;
  var src = document.querySelector('.find .pill[href*="find-your-zen"]');
  var href = src ? src.getAttribute('href') : '/find-your-zen/';
  var bar = document.createElement('div');
  bar.className = 'zen-float';
  bar.innerHTML = '<a href="' + href + '"><span class="zf-mark" aria-hidden="true"></span><span class="zf-text"><b>Find your Zen</b><small>We&rsquo;ll help you find the perfect model</small></span><span class="zf-go" aria-hidden="true">Start</span></a>';
  document.body.appendChild(bar);
  var finds = Array.prototype.slice.call(document.querySelectorAll('.find'));
  var inView = 0;
  function update() {
    var show = window.scrollY > window.innerHeight * 0.6 && inView === 0;
    bar.classList.toggle('on', show);
  }
  if ('IntersectionObserver' in window && finds.length) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { en.target._zin = en.isIntersecting; });
      inView = finds.filter(function (f) { return f._zin; }).length;
      update();
    }, { threshold: 0.15 });
    finds.forEach(function (f) { io.observe(f); });
  }
  window.addEventListener('scroll', update, { passive: true });
  update();
})();
