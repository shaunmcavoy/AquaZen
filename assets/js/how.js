/* How we deliver Zen: each chapter pins while its picture plays out as you scroll. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var scenes = Array.prototype.slice.call(document.querySelectorAll('[data-scene]'));
  if (!scenes.length) return;
  var clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  var seg = function (p, a, b) { return clamp((p - a) / (b - a), 0, 1); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var $ = function (root, sel) { return root.querySelector(sel); };
  var $$ = function (root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };

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

  // Water moving around the loop in chapter 2.
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

  function progress(el) {
    var r = el.getBoundingClientRect(), total = el.offsetHeight - window.innerHeight;
    return total <= 0 ? 1 : clamp(-r.top / total, 0, 1);
  }

  function update() {
    ticking = false;
    scenes.forEach(function (s) {
      var p = progress(s), steps = $$(s, '.hz-step');
      var k = Math.min(steps.length - 1, Math.floor(p * steps.length * 0.999));
      steps.forEach(function (st, i) { st.classList.toggle('on', i === k); });
      draw[s.dataset.scene](s, p);
    });
  }

  if (reduce) {
    document.documentElement.classList.add('hz-static');
    scenes.forEach(function (s) { draw[s.dataset.scene](s, s.dataset.scene === 'massage' ? 0.65 : 1); });
    return;
  }
  var ticking = false;
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();
