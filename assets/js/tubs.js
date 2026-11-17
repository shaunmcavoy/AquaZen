/* AquaZen hot tub pages: scroll scenes, rails and the photo lightbox. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  function progress(el) {
    var r = el.getBoundingClientRect();
    var total = el.offsetHeight - window.innerHeight;
    if (total <= 0) return r.top < 0 ? 1 : 0;
    return clamp(-r.top / total, 0, 1);
  }

  var hero = document.querySelector('.s-hero');
  var tilts = Array.prototype.slice.call(document.querySelectorAll('[data-tilt]'));
  var orbits = Array.prototype.slice.call(document.querySelectorAll('[data-orbit]')).map(function (el) {
    el.classList.add('js');
    return {
      el: el,
      imgs: el.querySelectorAll('.orbit-img'),
      caps: el.querySelectorAll('.orbit-cap'),
      dots: el.querySelectorAll('.orbit-dots span'),
      last: -1
    };
  });

  // Each overhead photo tips up from flat, turns slowly and settles as you scroll,
  // then hands over to the next model.
  function orbit(o) {
    var n = o.imgs.length;
    var p = progress(o.el);
    var pos = p * n;
    var idx = clamp(Math.floor(pos), 0, n - 1);
    for (var i = 0; i < n; i++) {
      var t = pos - i;                      // 0..1 while this model is on stage
      var vis = t > -0.25 && t < 1.25;
      var op = n === 1 ? 1 : clamp(Math.min((t + 0.25) / 0.35, (1.25 - t) / 0.35), 0, 1);
      if (i === 0 && t < 0) op = 1;
      if (i === n - 1 && t > 1) op = 1;
      var tc = clamp(t, 0, 1);
      var rx = (1 - Math.min(tc * 1.6, 1)) * 42;   // tilt back like a page lying down
      var rz = -14 + tc * 28;                      // slow turn
      var sc = 0.82 + Math.min(tc * 1.4, 1) * 0.18;
      var img = o.imgs[i];
      img.style.opacity = vis ? op : 0;
      img.style.transform = 'rotateX(' + rx.toFixed(2) + 'deg) rotateZ(' + rz.toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')';
    }
    if (idx !== o.last) {
      o.last = idx;
      o.caps.forEach(function (c, i) { c.classList.toggle('on', i === idx); });
      o.dots.forEach(function (d, i) { d.classList.toggle('on', i === idx); });
    }
  }

  var ticking = false;
  function update() {
    ticking = false;
    if (hero) hero.style.setProperty('--p', progress(hero).toFixed(4));
    tilts.forEach(function (t) {
      var r = t.getBoundingClientRect();
      var v = clamp(1 - (r.top - window.innerHeight * 0.15) / (window.innerHeight * 0.75), 0, 1);
      t.style.setProperty('--t', v.toFixed(4));
    });
    orbits.forEach(orbit);
  }
  if (!reduce) {
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  } else {
    orbits.forEach(function (o) { o.el.classList.remove('js'); });
  }

  // Sideways rails
  document.querySelectorAll('.highlights').forEach(function (sec) {
    var rail = sec.querySelector('[data-rail]');
    if (!rail) return;
    var step = function (dir) {
      var card = rail.firstElementChild;
      var w = card ? card.getBoundingClientRect().width + 20 : 400;
      rail.scrollBy({ left: dir * w, behavior: reduce ? 'auto' : 'smooth' });
    };
    var prev = sec.querySelector('[data-rail-prev]');
    var next = sec.querySelector('[data-rail-next]');
    if (prev) prev.addEventListener('click', function () { step(-1); });
    if (next) next.addEventListener('click', function () { step(1); });
  });

  // Tap a photo to see it large
  var lb = document.getElementById('lightbox');
  if (lb) {
    var lbImg = lb.querySelector('img');
    var lastBtn = null;
    var close = function () { lb.hidden = true; document.body.style.overflow = ''; if (lastBtn) lastBtn.focus(); };
    document.querySelectorAll('.gal-item').forEach(function (b) {
      b.addEventListener('click', function () {
        lastBtn = b;
        lbImg.src = b.getAttribute('data-full');
        lb.hidden = false;
        document.body.style.overflow = 'hidden';
        lb.querySelector('.lb-close').focus();
      });
    });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lb-close')) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !lb.hidden) close(); });
  }
})();
