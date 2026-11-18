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
