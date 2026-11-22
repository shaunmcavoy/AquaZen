/* How we deliver Zen: one backyard at dusk sits behind the whole page. Each chapter opens with
   why it matters (the backyard), shows how it works (the drawing) and ends with what it means for you. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var main = document.querySelector('main.hz');
  if (!main) return;
  var scenes = Array.prototype.slice.call(document.querySelectorAll('[data-scene]'));
  var clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  var seg = function (p, a, b) { return clamp((p - a) / (b - a), 0, 1); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var $ = function (root, sel) { return root.querySelector(sel); };
  var $$ = function (root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
  var NS = 'http://www.w3.org/2000/svg';
  var el = function (tag, attrs, parent) { var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };

  /* ---------- What they want most ---------- */
  var USE = { sleep: 'sleep', muscles: 'recovery', together: 'family', escape: 'unwind' };
  var goal = '';
  try { goal = localStorage.getItem('az-goal') || ''; } catch (e) {}
  function setGoal(g) {
    goal = USE[g] ? g : '';
    if (goal) document.documentElement.setAttribute('data-goal', goal); else document.documentElement.removeAttribute('data-goal');
    $$(document, '.hz-goal').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.goal === goal ? 'true' : 'false'); });
    try { if (goal) localStorage.setItem('az-goal', goal); } catch (e) {}
  }
  setGoal(goal);
  $$(document, '.hz-goal').forEach(function (b) {
    b.addEventListener('click', function () { setGoal(goal === b.dataset.goal ? '' : b.dataset.goal); });
  });
  // Carry the choice into Find your Zen, including the floating button added later by menu.js.
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href*="/find-your-zen/"]');
    if (!a || !goal) return;
    try { var u = new URL(a.href, location.href); u.searchParams.set('use', USE[goal]); a.href = u.pathname + u.search; } catch (e) {}
  }, true);

  /* ---------- The backyard ---------- */
  var world = $(document, '.hz-world'), svg = world && $(world, '.w-svg'), snowSvg = world && $(world, '.w-snow');
  var layers = world ? $$(world, '.w-layer').map(function (g) { return { g: g, d: parseFloat(g.dataset.depth) }; }) : [];
  if (world) {
    var rnd = (function () { var x = 7; return function () { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; })();
    var stars = $(world, '.w-stars');
    for (var i = 0; i < 160; i++) el('circle', { cx: (rnd() * 4400 - 2200).toFixed(0), cy: (-1150 + rnd() * 900).toFixed(0), r: (0.6 + rnd() * 1.8).toFixed(1), opacity: (0.35 + rnd() * 0.65).toFixed(2) }, stars);
    var trees = $(world, '.w-trees'), tp = '';
    for (var x = -2700; x < 2700; x += 40 + rnd() * 60) {
      var h = 110 + rnd() * 170, w = h * 0.42, y0 = -90 - rnd() * 20;
      for (var t = 0; t < 3; t++) { var yb = y0 - t * h * 0.28, ww = w * (1 - t * 0.25); tp += 'M' + (x - ww / 2).toFixed(0) + ' ' + yb.toFixed(0) + 'L' + x.toFixed(0) + ' ' + (yb - h * 0.5).toFixed(0) + 'L' + (x + ww / 2).toFixed(0) + ' ' + yb.toFixed(0) + 'Z'; }
    }
    el('path', { d: tp }, trees);
    var bulbs = $(world, '.w-bulbs'); bulbs.parentNode.appendChild(bulbs);
    for (var b = 0; b <= 14; b++) {
      var q = b / 14, bx = (1 - q) * (1 - q) * -700 + 2 * (1 - q) * q * -80 + q * q * 640, by = (1 - q) * (1 - q) * -470 + 2 * (1 - q) * q * -300 + q * q * -430;
      el('circle', { cx: bx, cy: by + 14, r: 30, fill: 'url(#w-bulb)' }, bulbs);
      el('circle', { cx: bx, cy: by + 14, r: 6, fill: '#ffe2a8' }, bulbs);
    }
    var flakes = [];
    for (var f = 0; f < 110; f++) flakes.push({ x: rnd(), y: rnd(), r: 1 + rnd() * 2.6, v: 0.04 + rnd() * 0.08, s: rnd() * 6, n: el('circle', { r: 2 }, snowSvg) });
  }

  var DUSK = { sky1: [30, 42, 79], sky2: [138, 74, 106], sky3: [243, 154, 74], m1: [58, 51, 80], m2: [42, 36, 56], tree: [26, 26, 34], ground: [28, 26, 28], house: [36, 30, 34], deck: [58, 44, 36], cab: [43, 34, 28], shell: [205, 200, 192] };
  var NIGHT = { sky1: [2, 4, 11], sky2: [10, 20, 38], sky3: [24, 40, 62], m1: [18, 26, 42], m2: [11, 18, 32], tree: [7, 10, 16], ground: [10, 12, 16], house: [14, 15, 20], deck: [24, 19, 16], cab: [22, 18, 15], shell: [120, 140, 150] };
  var mix = function (a, b, t) { return 'rgb(' + a.map(function (v, i) { return Math.round(lerp(v, b[i], t)); }).join(',') + ')'; };

  var cur = { night: 0, tv: 1, lights: 0, person: 0, snow: 0, shade: 0.1, scrimL: 0, scrimT: 0.6, shift: 0, z: 0 };
  var tgt = Object.assign({}, cur);

  function renderWorld() {
    if (!world) return;
    var W = window.innerWidth, H = window.innerHeight, narrow = W / H < 0.8 || W < 700;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var base = narrow ? Math.min(H / 1150, W / 760) / Math.exp(cur.z * 0.25) : H / 1000;
    var fx = narrow ? W * 0.5 : W * lerp(0.5, 0.7, cur.shift), fy = H * (narrow ? 0.78 : 0.68);
    layers.forEach(function (l) { l.g.setAttribute('transform', 'translate(' + fx.toFixed(1) + ' ' + fy.toFixed(1) + ') scale(' + (base * Math.exp(cur.z * l.d * 0.4)).toFixed(4) + ')'); });
    var st = world.style;
    for (var k in DUSK) st.setProperty('--' + k, mix(DUSK[k], NIGHT[k], cur.night));
    st.setProperty('--night', cur.night.toFixed(3)); st.setProperty('--tv', cur.tv.toFixed(3));
    st.setProperty('--lights', cur.lights.toFixed(3)); st.setProperty('--person', cur.person.toFixed(3));
    st.setProperty('--snow', cur.snow.toFixed(3)); st.setProperty('--shade', cur.shade.toFixed(3));
    st.setProperty('--scrim-l', (narrow ? 0 : cur.scrimL).toFixed(3)); st.setProperty('--scrim-t', (narrow ? Math.max(cur.scrimT, cur.scrimL) : cur.scrimT).toFixed(3));
  }

  function snowTick(dt) {
    if (!world || cur.snow < 0.01) return;
    var W = window.innerWidth, H = window.innerHeight;
    snowSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    flakes.forEach(function (f) {
      f.y += f.v * dt; f.s += dt; if (f.y > 1.05) { f.y = -0.05; }
      f.n.setAttribute('cx', ((f.x + Math.sin(f.s * 0.8) * 0.01) * W).toFixed(1)); f.n.setAttribute('cy', (f.y * H).toFixed(1)); f.n.setAttribute('r', f.r);
    });
  }

  /* ---------- The chapters ---------- */
  var draw = {
    massage: function (s, p) {
      var open = seg(p, 0.45, 0.62), shower = seg(p, 0.74, 0.84);
      var w0 = lerp(4, 24, open), w1 = lerp(8, 92, open);
      $(s, '.m-jet').setAttribute('points', '264,' + (240 - w0) + ' 470,' + (240 - w1) + ' 470,' + (240 + w1) + ' 264,' + (240 + w0));
      $(s, '.m-thumb').style.transform = 'translate(0,' + (-160 * open) + 'px)';
      $(s, '.m-thumb').style.opacity = 1 - open;
      var itch = seg(p, 0.2, 0.3) * (1 - open);
      $(s, '.m-prickles').style.opacity = 0.35 + 0.65 * itch + (p < 0.2 ? 0.3 : 0) - open * 0.35;
      $(s, '.m-prickles').classList.toggle('on', p > 0.22 && open < 0.5);
      $(s, '.m-knots').style.opacity = 1 - open;
      $(s, '.m-warm').style.opacity = open;
      $$(s, '.m-wide').forEach(function (l) { l.style.opacity = open; });
      $(s, '.m-label').style.opacity = 1 - open;
      $(s, '.m-label-wide').style.opacity = open;
      $(s, '.m-hose').setAttribute('height', lerp(20, 44, open));
      $(s, '.m-hose').setAttribute('y', lerp(230, 218, open));
      $(s, '.m-hose-scene').style.opacity = 1 - shower;
      $(s, '.m-shower-scene').style.opacity = shower;
    },
    flow: function (s, p) {
      var a = seg(p, 0.3, 0.85);
      $(s, '.f-arc-aq').setAttribute('stroke-dasharray', (a * 100) + ' 100');
      $(s, '.f-arc-typ').setAttribute('stroke-dasharray', (a * 100 * 10 / 45) + ' 100');
      $(s, '.f-min-aq').textContent = a >= 1 ? 'Done' : Math.round(a * 10) + ' min';
      $(s, '.f-min-typ').textContent = Math.round(a * 10) + ' min';
      s._speed = p > 0.6 ? 4.5 : 1;
    },
    ozone: function (s, p) {
      var t = seg(p, 0.22, 0.5), clean = seg(p, 0.45, 0.72), uv = seg(p, 0.75, 0.85);
      $(s, '.o-count').textContent = Math.round(t * 45) + ' s';
      $$(s, '.o-specks > g').forEach(function (g, i) {
        var f = seg(clean, i * 0.15, i * 0.15 + 0.3);
        g.style.opacity = 1 - f * 0.85;
        if (!g.dataset.t) g.dataset.t = g.getAttribute('transform');
        g.setAttribute('transform', g.dataset.t + ' scale(' + (1 - f * 0.6) + ')');
      });
      var mix = function (c0, c1, t) { return 'rgb(' + c0.map(function (v, i) { return Math.round(lerp(v, c1[i], t)); }).join(',') + ')'; };
      $(s, '.o-water').setAttribute('fill', mix([61, 90, 79], [10, 90, 160], clean));
      $(s, '.o-pipe').setAttribute('stroke', mix([61, 90, 79], [10, 90, 160], clean));
      $(s, '.o-out').setAttribute('stroke', mix([61, 90, 79], [100, 210, 255], uv));
      $(s, '.o-uv').setAttribute('fill', mix([44, 44, 46], [191, 90, 242], uv));
      $(s, '.o-bubbles').classList.toggle('on', p > 0.18);
    },
    energy: function (s, p) {
      var press = seg(p, 0.2, 0.5);
      $(s, '.e-needle-48').setAttribute('transform', 'rotate(' + lerp(-70, 62, press) + ')');
      $(s, '.e-needle-56').setAttribute('transform', 'rotate(' + lerp(-70, -48, press) + ')');
      $(s, '.e-flow-48').classList.toggle('jitter', press > 0.5);
    },
    insulation: function (s, p) {
      var k = Math.min(5, Math.floor(p * 6 * 0.999));
      var show = function (sel, on) { $$(s, sel).forEach(function (g) { g.style.opacity = on ? 1 : 0; }); };
      show('.i-foam', k < 3);
      show('.i-leak', k === 1);
      show('.i-bay', k === 2);
      show('.i-aq10', k >= 3);
      show('.i-heat', k === 4 || k === 5);
      show('.i-frame', k >= 4);
      show('.i-six', k === 5);
      $(s, '.i-cover').setAttribute('fill', k === 5 ? '#f0bf33' : '#3a3a3c');
      $(s, '.i-cap').textContent = ['A typical full-foam cabinet', '', '', 'AQ10: every drop of water insulated, all the time', 'Pump heat stays in and warms the water', ''][k];
    }
  };

  var flow = document.querySelector('[data-scene="flow"]');
  if (flow) {
    var path = flow.querySelector('#f-loop'), dots = flow.querySelector('.f-dots');
    var len = path.getTotalLength(), n = 14, t0 = performance.now();
    for (var i = 0; i < n; i++) { var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('r', 6); dots.appendChild(c); }
    flow._speed = 1; var pos = 0, last = t0;
    var tick = function (now) {
      var dt = (now - last) / 1000; last = now;
      pos = (pos + dt * 60 * (flow._speed || 1)) % len;
      Array.prototype.forEach.call(dots.children, function (c, i) {
        var pt = path.getPointAtLength((pos + (i * len) / n) % len);
        c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y);
      });
      if (!reduce) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }


  function progress(s) {
    var r = s.getBoundingClientRect(), total = s.offsetHeight - window.innerHeight;
    return total <= 0 ? 1 : clamp(-r.top / total, 0, 1);
  }
  function tokens(str) { var o = {}; (str || '').split(/\s+/).forEach(function (t) { if (t) o[t] = 1; }); return o; }
  var NIGHTS = { evening: null, massage: 0.7, flow: 0.76, ozone: 0.82, energy: 0.9, insulation: 1, first: 0.92 };

  function setTarget(w, o) {
    tgt.tv = w.tv ? 1 : 0; tgt.lights = w.lights ? 1 : 0; tgt.person = w.person ? 1 : 0; tgt.snow = w.snow ? 1 : 0;
    for (var k in o) tgt[k] = o[k];
  }

  function update() {
    ticking = false;
    var H = window.innerHeight, mid = H * 0.5, found = false;
    scenes.forEach(function (s) {
      var p = progress(s), steps = $$(s, '.hz-step'), n = steps.length;
      var k = Math.min(n - 1, Math.floor(p * n * 0.999));
      steps.forEach(function (st, i) { st.classList.toggle('on', i === k); });
      var mood = steps[k].dataset.mood || 'why';
      s.classList.toggle('art', mood === 'how');
      var cue = $(s, '.hz-cue'); if (cue) cue.classList.toggle('off', p > 0.02);
      if (draw[s.dataset.scene]) {
        var hows = []; steps.forEach(function (st, i) { if (st.dataset.mood === 'how') hows.push(i); });
        var a = hows[0], b = hows[hows.length - 1];
        draw[s.dataset.scene](s, clamp((p * n - a) / (b - a + 1), 0, 1));
      }
      var r = s.getBoundingClientRect();
      if (!found && r.top <= mid && r.bottom >= mid) {
        found = true;
        var w = tokens(steps[k].dataset.w || s.dataset.world), name = s.dataset.scene;
        if (name === 'evening') setTarget(w, { night: lerp(0.04, 0.62, p), z: p, shift: 0, shade: 0.06, scrimL: 0, scrimT: 0.7 });
        else if (name === 'first') setTarget(w, { night: 0.92, z: 1 + p * 0.45, shift: 0, shade: 0.06, scrimL: 0, scrimT: 0.7 });
        else setTarget(w, { night: NIGHTS[name], z: 1.05, shift: 1, shade: mood === "how" ? 0.9 : 0.1, scrimL: mood === 'how' ? 0 : 1, scrimT: 0 });
      }
    });
    if (!found) {
      $$(main, '[data-world]').forEach(function (sec) {
        if (found || sec.dataset.scene) return;
        var r = sec.getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid) {
          found = true;
          var w = tokens(sec.dataset.world), dense = sec.classList.contains('hz-compare');
          setTarget(w, { night: w.snow ? 1 : 0.66, z: 1, shift: 1, shade: dense ? 0.82 : 0.5, scrimL: 0.8, scrimT: 0 });
        }
      });
    }
    if (!found) setTarget({ lights: 1, person: 1 }, { shade: 0.85 });
    if (world) world.classList.toggle('gone', main.getBoundingClientRect().bottom < H * 0.6);
    kick();
  }

  var running = false, lastT = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - (lastT || now)) / 1000); lastT = now;
    var moving = false;
    for (var k in tgt) {
      var rate = k === 'z' ? 0.18 : k === 'shade' || k === 'scrimL' || k === 'scrimT' ? 0.12 : 0.06;
      var d = tgt[k] - cur[k];
      if (Math.abs(d) > 0.0005) { cur[k] += d * rate; moving = true; } else cur[k] = tgt[k];
    }
    renderWorld(); snowTick(dt);
    if (moving || cur.snow > 0.01) requestAnimationFrame(frame); else { running = false; lastT = 0; }
  }
  function kick() { if (!running) { running = true; requestAnimationFrame(frame); } }

  if (reduce) {
    document.documentElement.classList.add('hz-static');
    scenes.forEach(function (s) { if (draw[s.dataset.scene]) draw[s.dataset.scene](s, s.dataset.scene === 'massage' ? 0.65 : 1); });
    cur = { night: 0.8, tv: 0, lights: 1, person: 1, snow: 0, shade: 0.72, scrimL: 0, scrimT: 0, shift: 1, z: 1 };
    renderWorld();
    window.addEventListener('resize', renderWorld);
    return;
  }
  function size() {
    scenes.forEach(function (s) { var n = $$(s, '.hz-step').length; s.style.height = (n * (s.classList.contains('hz-solo') ? 80 : 88) + 40) + 'vh'; });
  }
  size();
  var ticking = false;
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', function () { size(); update(); });
  update();
})();
