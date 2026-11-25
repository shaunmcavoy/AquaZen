/* How we deliver Zen. One backyard sits behind the whole page. Every block of words carries the
   scene it belongs to (data-s), and the scene is blended between blocks exactly as you scroll, so
   the words and the picture always move together. In the chapters the tub opens into a cutaway. */
(function () {
  var main = document.querySelector('main.hz');
  if (!main) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var $ = function (root, sel) { return root.querySelector(sel); };
  var $$ = function (root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
  var NS = 'http://www.w3.org/2000/svg';
  var el = function (tag, attrs, parent) { var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };

  /* ---------- The welcome screen: a warmer hello for people Noah sent ---------- */
  var from = '';
  try { from = new URLSearchParams(location.search).get('from') || ''; } catch (e) {}
  if (/^(noah|messenger|instagram)$/.test(from)) {
    var eye = $(main, '.hz-cover-eye'); if (eye) eye.textContent = 'Noah sent you? Welcome.';
  }
  var go = function (sel) {
    var t = $(document, sel); if (!t) return;
    t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  $$(main, '.hz-start').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); go(a.getAttribute('href')); });
  });

  // Arriving with a chapter in the link (Start on the homepage goes to #why): land there once the scene has laid out.
  if (location.hash && /^#[a-z-]+$/.test(location.hash)) {
    var land = function () { var t = $(document, location.hash); if (t) t.scrollIntoView({ block: 'start' }); };
    if (document.readyState === 'complete') setTimeout(land, 60); else window.addEventListener('load', function () { setTimeout(land, 60); });
  }

  /* ---------- The chapter bar: where they are in the presentation ---------- */
  (function () {
    var bar = $(main, '.hz-progress'), cover = $(main, '.hz-cover'), fz = $(main, '#find-your-zen');
    if (!bar || !cover || !fz) return;
    var fill = $(bar, '.hz-progress-bar span');
    var links = $$(bar, '[data-t]').map(function (a) { return { a: a, t: $(document, a.getAttribute('data-t')) }; }).filter(function (l) { return l.t; });
    var cur = -1, ticking = false;
    function update() {
      ticking = false;
      var y = window.scrollY, H = window.innerHeight;
      var start = cover.offsetTop + cover.offsetHeight * 0.6, end = fz.offsetTop - H * 0.3;
      bar.hidden = y < start;
      fill.style.width = (clamp((y - start) / Math.max(1, end - start), 0, 1) * 100).toFixed(1) + '%';
      var i = -1;
      links.forEach(function (l, k) { if (l.t.getBoundingClientRect().top < H * 0.45) i = k; });
      if (i !== cur) {
        cur = i;
        links.forEach(function (l, k) {
          if (k === i) l.a.setAttribute('aria-current', 'step'); else l.a.removeAttribute('aria-current');
          l.a.classList.toggle('done', k < i);
        });
        if (i > -1 && links[i].a.scrollIntoView && !bar.hidden) {
          var ol = links[i].a.parentNode.parentNode, a = links[i].a;
          ol.scrollTo({ left: a.offsetLeft - ol.clientWidth / 2 + a.offsetWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
        }
      }
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  })();

  /* ---------- Find your Zen is built into the end of the page ---------- */
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href*="/find-your-zen/"], a[href="#find-your-zen"]');
    if (!a || !$(document, '#fzForm')) return;
    try { if (new URL(a.href, location.href).searchParams.get('model')) return; } catch (e) {}
    ev.preventDefault();
    go('#find-your-zen');
  }, true);

  /* ---------- What they want most ---------- */
  var USE = { sleep: 'sleep', muscles: 'recovery', together: 'family', escape: 'unwind', all: ['unwind', 'family', 'recovery', 'sleep'] };
  var goal = '';
  try { goal = localStorage.getItem('az-goal') || ''; } catch (e) {}
  function setGoal(g) {
    goal = USE[g] ? g : '';
    if (goal) document.documentElement.setAttribute('data-goal', goal); else document.documentElement.removeAttribute('data-goal');
    $$(document, '.hz-goal').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.goal === goal ? 'true' : 'false'); });
    try { if (goal) localStorage.setItem('az-goal', goal); else localStorage.removeItem('az-goal'); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent('az-goal', { detail: USE[goal] || '' })); } catch (e) {}
  }
  setGoal(goal);

  /* ---------- Christmas: the December 1 cutoff disappears once it has passed ---------- */
  if (Date.now() > Date.parse('2026-12-02T08:00:00Z')) $$(document, '.hz-xmas').forEach(function (n) { n.remove(); });

  /* ---------- The last question: do you believe AquaZen can give you what you picked? ---------- */
  var GOALSAY = {
    sleep: 'better sleep', muscles: 'relief for your sore muscles', together: 'more time together',
    escape: 'a quiet escape every night', all: 'all of it: better sleep, relief for sore muscles, time together and a quiet escape'
  };
  var askGoal = $(main, '.hz-ask-goal'), fzSec = $(main, '#find-your-zen');
  function sayGoal() { if (askGoal) askGoal.textContent = GOALSAY[goal] || 'a place of peace at home'; }
  sayGoal();
  document.addEventListener('az-goal', sayGoal);
  if (fzSec) {
    fzSec.classList.add('asking');
    $$(fzSec, '[data-ans]').forEach(function (b) {
      b.addEventListener('click', function () {
        var yes = b.dataset.ans === 'yes';
        fzSec.dataset.ans = b.dataset.ans;
        $$(fzSec, '[data-ans]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        $(fzSec, '.hz-ask-say').textContent = yes
          ? 'Then let\u2019s find yours. A few quick questions about who\u2019s soaking, how often and where, and we\u2019ll show you the two hot tubs that fit you best, with why. Then we\u2019ll call to book a quiet visit so you can sit in the one that fits you.'
          : 'That\u2019s honest, and it\u2019s exactly why we don\u2019t ask you to take our word for it. A few quick questions, and we\u2019ll show you the two hot tubs that fit you best. Then come sit in one and feel it for yourself.';
        fzSec.classList.remove('asking');
        fzSec.classList.add('answered');
        var r = $(fzSec, '.hz-ask-reply');
        if (r) r.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      });
    });
  }
  $$(document, '.hz-goal').forEach(function (b) {
    b.addEventListener('click', function () { setGoal(goal === b.dataset.goal ? '' : b.dataset.goal); });
  });

  /* ---------- Build the backyard ---------- */
  var world = $(document, '.hz-world');
  if (!world) return;
  var svg = $(world, '.w-svg'), snowSvg = $(world, '.w-snow');
  var layers = $$(world, '.w-layer').map(function (g) { return { g: g, d: parseFloat(g.dataset.depth) }; });
  var rnd = (function () { var x = 7; return function () { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; })();
  var stars = $(world, '.w-stars');
  for (var i = 0; i < 160; i++) el('circle', { cx: (rnd() * 4400 - 2200).toFixed(0), cy: (-1150 + rnd() * 900).toFixed(0), r: (0.6 + rnd() * 1.8).toFixed(1), opacity: (0.35 + rnd() * 0.65).toFixed(2) }, stars);
  var tp = '';
  for (var x = -2700; x < 2700; x += 40 + rnd() * 60) {
    var h = 110 + rnd() * 170, w = h * 0.42, y0 = -90 - rnd() * 20;
    for (var t = 0; t < 3; t++) { var yb = y0 - t * h * 0.28, ww = w * (1 - t * 0.25); tp += 'M' + (x - ww / 2).toFixed(0) + ' ' + yb.toFixed(0) + 'L' + x.toFixed(0) + ' ' + (yb - h * 0.5).toFixed(0) + 'L' + (x + ww / 2).toFixed(0) + ' ' + yb.toFixed(0) + 'Z'; }
  }
  el('path', { d: tp }, $(world, '.w-trees'));
  var bulbs = $(world, '.w-bulbs');
  for (var b = 0; b <= 14; b++) {
    var q = b / 14, bx = (1 - q) * (1 - q) * -700 + 2 * (1 - q) * q * -80 + q * q * 640, by = (1 - q) * (1 - q) * -470 + 2 * (1 - q) * q * -300 + q * q * -430;
    el('circle', { cx: bx, cy: by + 14, r: 30, fill: 'url(#w-bulb)' }, bulbs);
    el('circle', { cx: bx, cy: by + 14, r: 6, fill: '#ffe2a8' }, bulbs);
  }
  var flakes = [];
  for (var f = 0; f < 110; f++) flakes.push({ x: rnd(), y: rnd(), r: 1 + rnd() * 2.6, v: 0.04 + rnd() * 0.08, s: rnd() * 6, n: el('circle', { r: 2 }, snowSvg) });
  var loop = $(world, '.w-pipe:not(.w-pipe-bg)'), loopLen = loop.getTotalLength(), dotsG = $(world, '.w-dots'), dots = [];
  for (var d = 0; d < 26; d++) dots.push(el('circle', { r: 3.2 }, dotsG));
  var pipes = $$(world, '.w-pipe'), jet = $(world, '.w-jet'), jlines = $$(world, '.w-jl'), wet = $(world, '.w-wet'), motor = $(world, '.w-motor'), pump = $(world, '.w-pump');

  /* ---------- Scenes ---------- */
  var DEF = { night: .7, tv: 0, lights: 1, person: 1, snow: 0, shade: .12, scrim: 1, top: 0, z: 1.1, cx: 0, cy: 0, fx: .68, cut: 0, pw: 1, jet: 1, knots: 0, prick: 0, warm: 0, labels: 0, flow: 0, speed: 1, murk: 0, bub: 0, specks: 0, uv: 0, big: 1, press: 0, hot: 0, foam: 0, leak: 0, cold: 0, aq: 0, heat: 0, six: 0, car: 0, buzz: 0, door: 0, xmas: 0, van: 0, truck: 0, load: 0, gift: 0, chem: 0, bill: 0 };
  var beats = $$(main, '[data-s]').map(function (n) {
    var s = Object.assign({}, DEF);
    n.dataset.s.split(/\s+/).forEach(function (kv) { var p = kv.split(':'); if (p.length === 2) s[p[0]] = parseFloat(p[1]); });
    return { n: n, s: s, inner: $(n, '.b-in'), cnt: $$(n, '.cnt') };
  });

  var DUSK = { sky1: [30, 42, 79], sky2: [138, 74, 106], sky3: [243, 154, 74], m1: [58, 51, 80], m2: [42, 36, 56], tree: [26, 26, 34], ground: [28, 26, 28], house: [36, 30, 34], deck: [58, 44, 36], cab: [43, 34, 28], shell: [205, 200, 192] };
  var NIGHT = { sky1: [2, 4, 11], sky2: [10, 20, 38], sky3: [24, 40, 62], m1: [18, 26, 42], m2: [11, 18, 32], tree: [7, 10, 16], ground: [10, 12, 16], house: [14, 15, 20], deck: [24, 19, 16], cab: [22, 18, 15], shell: [120, 140, 150] };
  var mixc = function (a, b, t) { return 'rgb(' + a.map(function (v, i) { return Math.round(lerp(v, b[i], t)); }).join(',') + ')'; };
  var VARS = ['night', 'tv', 'lights', 'person', 'snow', 'shade', 'cut', 'knots', 'prick', 'warm', 'labels', 'flow', 'murk', 'bub', 'specks', 'uv', 'press', 'hot', 'foam', 'leak', 'cold', 'aq', 'heat', 'six', 'car', 'buzz', 'door', 'xmas', 'van', 'truck', 'load', 'gift', 'chem', 'bill'];

  // Where we are: blend the two blocks either side of the middle of the screen.
  function state() {
    var H = window.innerHeight, mid = H / 2, centres = beats.map(function (b) { var r = b.n.getBoundingClientRect(); b.r = r; return r.top + r.height / 2; });
    var i = 0;
    while (i < beats.length - 1 && centres[i + 1] <= mid) i++;
    if (i === beats.length - 1 || centres[i] > mid) return Object.assign({}, beats[i].s);
    var a = beats[i], c = beats[i + 1];
    // Hold each scene while its words are in the middle, then move between them.
    var t = smooth(0.2, 0.8, (mid - centres[i]) / (centres[i + 1] - centres[i]));
    var o = {};
    for (var k in DEF) o[k] = lerp(a.s[k], c.s[k], t);
    return o;
  }

  var time = 0, flowPos = 0, last = 0;
  function render(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now; time += dt;
    var W = window.innerWidth, H = window.innerHeight, narrow = W / H < 0.8 || W < 700;
    var s = state();
    if (reduce) { s.z = Math.min(s.z, 1.6); s.cx = 0; s.cy = s.cut > 0.5 ? 140 : 0; }

    // Camera
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var base = narrow ? W / 1000 : H / 1000, kz = narrow ? 0.5 : 0.4;
    var fx = narrow ? W * 0.5 : W * s.fx, fy = H * (narrow ? 0.72 : 0.64);
    if (!narrow && s.fx < 0.6 && s.top > 0.5) fy = H * 0.68;
    layers.forEach(function (l) {
      var sc = base * Math.exp(s.z * l.d * kz);
      l.g.setAttribute('transform', 'translate(' + fx.toFixed(1) + ' ' + fy.toFixed(1) + ') scale(' + sc.toFixed(4) + ') translate(' + (-s.cx * l.d).toFixed(1) + ' ' + (-s.cy * l.d).toFixed(1) + ')');
    });

    // Light, weather and what is shown
    var st = world.style;
    for (var k in DUSK) st.setProperty('--' + k, mixc(DUSK[k], NIGHT[k], s.night));
    VARS.forEach(function (k) { st.setProperty('--' + k, s[k].toFixed(3)); });
    st.setProperty('--scrim-l', (narrow ? 0 : s.scrim).toFixed(3));
    st.setProperty('--scrim-t', (narrow ? Math.max(s.top, s.scrim) : s.top).toFixed(3));
    world.classList.toggle('gone', main.getBoundingClientRect().bottom < H * 0.6);

    // Plumbing: skinny to wide, calm blue or straining under pressure
    var pw = lerp(3.5, 11, s.pw);
    var pc = mixc([100, 210, 255], [255, 120, 60], s.press);
    pipes.forEach(function (p, j) { p.setAttribute('stroke-width', (j === 0 ? pw + 4 : pw).toFixed(2)); if (j) p.setAttribute('stroke', pc); });
    var jitter = s.press > 0.5 && !reduce ? Math.sin(time * 70) * 0.8 * s.press : 0;
    pump.setAttribute('transform', 'translate(' + jitter.toFixed(2) + ' 0)');
    wet.setAttribute('r', lerp(13, 21, s.big).toFixed(2));
    motor.setAttribute('width', lerp(48, 64, s.big).toFixed(1)); motor.setAttribute('x', lerp(122, 104, s.big).toFixed(1));

    // The jet: a thin sharp stream or a wide warm one
    var a0 = lerp(1.2, 5, s.jet), a1 = lerp(1.6, 24, s.jet);
    jet.setAttribute('points', '-234,' + (110 - a0) + ' -154,' + (110 - a1) + ' -154,' + (110 + a1) + ' -234,' + (110 + a0));
    jet.setAttribute('opacity', (0.55 * s.cut).toFixed(2));
    jlines.forEach(function (l) { l.setAttribute('y2', (110 + parseFloat(l.dataset.k) * a1 * 0.7).toFixed(1)); l.style.opacity = s.jet; });

    // Water moving around the loop
    if (s.flow > 0.01 || s.cut > 0.01) {
      flowPos = (flowPos + dt * 70 * s.speed * (reduce ? 0 : 1)) % loopLen;
      dots.forEach(function (c, j) { var pt = loop.getPointAtLength((flowPos + j * loopLen / dots.length) % loopLen); c.setAttribute('cx', pt.x.toFixed(1)); c.setAttribute('cy', pt.y.toFixed(1)); });
    }

    // Snow
    if (s.snow > 0.01) {
      snowSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      flakes.forEach(function (f) {
        if (!reduce) { f.y += f.v * dt; f.s += dt; if (f.y > 1.05) f.y = -0.05; }
        f.n.setAttribute('cx', ((f.x + Math.sin(f.s * 0.8) * 0.01) * W).toFixed(1)); f.n.setAttribute('cy', (f.y * H).toFixed(1)); f.n.setAttribute('r', f.r);
      });
    }

    // Words: each block fades with its distance from the middle, and counters run as it arrives
    beats.forEach(function (b) {
      if (!b.inner) return;
      var r = b.r, c = r.top + r.height / 2, dist = Math.abs(c - H / 2) / H;
      b.inner.style.opacity = reduce ? 1 : (1 - smooth(0.22, 0.5, dist)).toFixed(3);
      b.cnt.forEach(function (n) {
        var ab = n.dataset.count.split('-'), u = clamp((H * 0.95 - r.top) / (H * 0.45), 0, 1);
        n.textContent = Math.round(lerp(+ab[0], +ab[1], reduce ? 1 : u));
      });
    });
    $$(main, '.b-cue').forEach(function (n) { n.classList.toggle('off', window.scrollY > 40); });

    requestAnimationFrame(render);
  }
  if (reduce) document.documentElement.classList.add('hz-still');
  requestAnimationFrame(render);
})();
