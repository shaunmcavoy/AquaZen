/* Ad studio (staff portal, admins). Draws on-brand ads on a canvas from our photos, logo and colours,
   so the text is always crisp and every ad looks like AquaZen. Hooks are ours, edited by hand, or written by AI
   through the portal function's ads-write route. */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var C = { black: '#000000', ink: '#1d1d1f', paper: '#f5f5f7', muted: '#6e6e73', sand: '#a1a1a6', gold: '#f0bf33', sage: '#c5cf99',
    stripes: ['#ca3432', '#f78800', '#f0bf33', '#c5cf99', '#6eaa8f', '#347c6e'] };
  var SUNSET = ['#f78800', '#f0bf33', '#c5cf99', '#6eaa8f'];
  var SIZES = { '1:1': [1080, 1080], '4:5': [1080, 1350], '9:16': [1080, 1920] };
  var SIZE_NAME = { '1:1': 'square', '4:5': 'feed', '9:16': 'story' };
  var LAYOUTS = [
    { k: 'bleed', n: 'Full photo' },
    { k: 'split', n: 'Photo and panel' },
    { k: 'statement', n: 'Big headline' },
    { k: 'light', n: 'Light and clean' }
  ];
  // fx, fy: where to keep the subject when a photo is cropped (0 to 1).
  var PHOTOS = [
    { src: '/assets/img/aquazen-serenity-quarter.webp', n: 'Dusk backyard', fx: 0.4, fy: 0.6 },
    { src: '/assets/img/aquazen-eden-quarter.webp', n: 'Mountain patio', fx: 0.65, fy: 0.55 },
    { src: '/assets/img/aquazen-zenith-quarter.webp', n: 'Garden terrace', fx: 0.4, fy: 0.6 },
    { src: '/assets/img/aquazen-cove-quarter.webp', n: 'Deck', fx: 0.55, fy: 0.6 },
    { src: '/assets/img/aquazen-aspen-lifestyle.webp', n: 'Modern home', fx: 0.6, fy: 0.6 },
    { src: '/assets/img/aquazen-solstice-low.webp', n: 'Mountain view', fx: 0.45, fy: 0.65 },
    { src: '/assets/img/aquazen-vacation-treehouse.webp', n: 'Treehouse', fx: 0.6, fy: 0.5 },
    { src: '/assets/img/aquazen-inside-corner.webp', n: 'Jets close up', fx: 0.5, fy: 0.5 },
    { src: '/assets/img/aquazen-aspen-waterfall.webp', n: 'Waterfall', fx: 0.4, fy: 0.5 },
    { src: '/assets/img/aquazen-interior.webp', n: 'Seats', fx: 0.5, fy: 0.5 }
  ];

  // Our own hooks, in Shaun's voice. h: headline, s: supporting line, cta: button, post: text above the ad on Facebook.
  var SETS = [
    { n: 'Zen Time', hooks: [
      { h: 'Your Zen is calling.', s: 'A place of peace, right in your own backyard.', cta: 'Find your Zen', post: 'Some evenings you need somewhere to land. A hot tub gives you that every night, right at home. Find the one that fits you at aquazen.ca.' },
      { h: 'Choose a better evening.', s: 'Put the phone down. Twenty minutes of Zen Time is waiting.', cta: 'Find your Zen', post: 'Twenty minutes, warm water and nowhere else to be. That is Zen Time. Answer a few quick questions and we will show you the hot tubs that fit your life.' },
      { h: 'Disconnect on purpose.', s: 'Warm water, a real massage and nowhere else to be.', cta: 'Book a visit', post: 'The best part of the day can be the part where nothing is asking for you. Come sit in one at our Burnaby showroom, by appointment.' },
      { h: 'The massage you keep putting off.', s: 'Now it waits for you at home, every night.', cta: 'Find your Zen', post: 'You know you need it. A hot tub with the right jets in the right places means you never have to book it. Find yours at aquazen.ca.' }
    ] },
    { n: 'Built better', hooks: [
      { h: '56-frame pumps. Not 48.', s: 'We never cut corners. Your best soak starts on day one.', cta: 'Learn more', post: 'Some stores cut corners and skip the best options. We do the opposite, because the best experience is what keeps you using your hot tub. See how we deliver Zen at aquazen.ca.' },
      { h: 'Built for BC winters.', s: 'AQ10 keeps 100% of the water insulated, 100% of the time.', cta: 'Learn more', post: 'Full foam leaves the pumps, heater and lines bare, so heat escapes at the weakest point. AQ10 keeps all of the water insulated, all of the time. Here is why that matters in a BC winter.' },
      { h: 'Healthy water, made simple.', s: 'A double ozonator does the work. One teaspoon after each soak.', cta: 'Learn more', post: 'Owning a hot tub shouldn\'t mean a shelf full of chemicals. A double ozonator and one teaspoon of chlorine after each soak keeps the water clean and easy.' },
      { h: 'Handmade for the massage you came for.', s: 'AquaSolus hot tubs, sold and delivered by AquaZen.', cta: 'Find your Zen', post: 'Every AquaSolus hot tub is built by hand around one idea: health through water. Find the one that fits you at aquazen.ca.' }
    ] },
    { n: 'Local', hooks: [
      { h: 'Delivered from Whistler to Hope.', s: 'By our own crew, from our Burnaby showroom.', cta: 'Book a visit', post: 'We deliver with our own crew anywhere from Whistler to Hope. Come see the hot tubs in Burnaby, by appointment.' },
      { h: 'Come sit in one first.', s: 'Visit us in Burnaby by appointment and feel the difference.', cta: 'Book a visit', post: 'A screen can\'t tell you how a seat fits or how the jets feel. Book a visit to our Burnaby showroom and try them for yourself.' },
      { h: 'Not sure which hot tub fits?', s: 'Answer a few quick questions. We will show you the best two.', cta: 'Find your Zen', post: 'Seats, jets, power, space. It is a lot to sort out. Answer a few quick questions at aquazen.ca and we will show you the two hot tubs that fit you best.' },
      { h: 'Twenty years of hot tubs. One honest answer.', s: 'Call or text Shaun at 236-304-4424.', cta: 'Call or text', post: 'I have spent over twenty years in this industry. Ask me anything about hot tubs and you will get a straight answer. Call or text 236-304-4424.' }
    ] }
  ];

  var S = { photo: 0, size: '4:5', set: 0, variants: [], aiHooks: null, opened: false, motion: false, look: 'brand', style: 'modern' };
  // Design styles: headline weight (hw), tracking (ht), size (hs), line height (lh), capitals (up), supporting weight (sw), sunset headline (sunset).
  var STYLES = [
    { k: 'modern', n: 'Modern', d: 'Clean and confident: bold type, tight spacing.', hw: '800', ht: -2, hs: 1, lh: 1.04, sw: '400' },
    { k: 'contemporary', n: 'Contemporary', d: 'Lighter, airier and current.', hw: '600', ht: -1, hs: 0.95, lh: 1.08, sw: '400' },
    { k: 'elegant', n: 'Elegant', d: 'Light type and calm space.', hw: '300', ht: -0.5, hs: 0.92, lh: 1.14, sw: '300' },
    { k: 'expressive', n: 'Expressive', d: 'Sunset colour in the headline and more energy.', hw: '800', ht: -2, hs: 1.06, lh: 1.02, sw: '400', sunset: true },
    { k: 'bold', n: 'Bold', d: 'Huge capitals that stop the scroll.', hw: '900', ht: -1, hs: 1.14, lh: 0.98, up: true, sw: '600' }
  ];
  function styleOf(k) { return STYLES.filter(function (x) { return x.k === k; })[0] || STYLES[0]; }
  var imgCache = {};
  var logos = {};

  function load(src) {
    if (imgCache[src]) return imgCache[src];
    imgCache[src] = new Promise(function (res, rej) {
      var i = new Image(); i.decoding = 'async';
      i.onload = function () { res(i); }; i.onerror = function () { rej(new Error('Could not load ' + src)); };
      i.src = src;
    });
    return imgCache[src];
  }

  // Inter is loaded into the canvas so every ad looks the same on any phone or computer.
  var fontsReady = null;
  function fonts() {
    if (fontsReady) return fontsReady;
    var base = 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.1.0/files/inter-latin-';
    var list = [['900', 'normal'], ['800', 'normal'], ['600', 'normal'], ['400', 'normal'], ['300', 'normal']].map(function (w) {
      var f = new FontFace('AZ Inter', 'url(' + base + w[0] + '-normal.woff2) format("woff2")', { weight: w[0], style: w[1] });
      return f.load().then(function (ff) { document.fonts.add(ff); }).catch(function () { /* fall back to system font */ });
    });
    fontsReady = Promise.all(list);
    return fontsReady;
  }
  var FONT = '"AZ Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';

  // ---------- Drawing helpers ----------
  var ZOOM = 1; // set per frame: motion ads slowly push in on the photo
  function cover(ctx, img, x, y, w, h, fx, fy) {
    var r = Math.max(w / img.width, h / img.height) * ZOOM;
    var sw = w / r, sh = h / r;
    var sx = Math.min(Math.max(img.width * (fx == null ? 0.5 : fx) - sw / 2, 0), img.width - sw);
    var sy = Math.min(Math.max(img.height * (fy == null ? 0.5 : fy) - sh / 2, 0), img.height - sh);
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function wrap(ctx, text, maxW) {
    var words = String(text || '').split(/\s+/).filter(Boolean), lines = [], line = '';
    words.forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }
  // Largest headline size (from max down to min) that fits in maxLines.
  function fit(ctx, text, weight, maxW, maxLines, max, min) {
    for (var size = max; size >= min; size -= 2) {
      ctx.font = weight + ' ' + size + 'px ' + FONT;
      var lines = wrap(ctx, text, maxW);
      if (lines.length <= maxLines && lines.every(function (l) { return ctx.measureText(l).width <= maxW; })) return { size: size, lines: lines };
    }
    ctx.font = weight + ' ' + min + 'px ' + FONT;
    return { size: min, lines: wrap(ctx, text, maxW) };
  }
  function drawLines(ctx, f, x, y, lh, align) {
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    f.lines.forEach(function (l, i) { ctx.fillText(l, x, y + i * f.size * lh); });
    return f.lines.length * f.size * lh;
  }
  function track(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }
  function stripes(ctx, x, y, w, h, vertical) {
    var n = C.stripes.length;
    C.stripes.forEach(function (c, i) {
      ctx.fillStyle = c;
      if (vertical) ctx.fillRect(x + (w / n) * i, y, Math.ceil(w / n), h);
      else ctx.fillRect(x, y + (h / n) * i, w, Math.ceil(h / n));
    });
  }
  function pill(ctx, text, x, y, size, bg, fg, align) {
    ctx.font = '600 ' + size + 'px ' + FONT; track(ctx, 0);
    var tw = ctx.measureText(text).width, padX = size * 1.1, h = size * 2.5, w = tw + padX * 2;
    var left = align === 'center' ? x - w / 2 : x;
    ctx.fillStyle = bg; rr(ctx, left, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, left + w / 2, y + h / 2 + size * 0.04);
    ctx.textBaseline = 'alphabetic';
    return { w: w, h: h };
  }
  function contact(ctx, x, y, size, color, align) {
    ctx.font = '600 ' + size + 'px ' + FONT; track(ctx, 0);
    ctx.fillStyle = color; ctx.textAlign = align || 'left';
    ctx.fillText('aquazen.ca  ·  236-304-4424', x, y);
  }
  function sunsetText(ctx, x0, x1) {
    var g = ctx.createLinearGradient(x0, 0, x1, 0);
    SUNSET.forEach(function (c, i) { g.addColorStop(i / (SUNSET.length - 1), c); });
    return g;
  }

  // ---------- Layouts ----------
  // t: seconds into a motion ad. Leave it out for the finished still.
  var DUR = 8, ENTER = 0.7;
  function ease(p) { p = Math.min(Math.max(p, 0), 1); return 1 - Math.pow(1 - p, 3); }
  function render(canvas, v, size, t) {
    var dim = SIZES[size], W = dim[0], H = dim[1];
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    var ctx = canvas.getContext('2d');
    var T = t == null ? 99 : t;
    // Each piece fades and rises into place from its start time. Measurements still run while hidden.
    function show(start, fn) {
      var p = ease((T - start) / ENTER);
      ctx.save(); ctx.globalAlpha = p; ctx.translate(0, (1 - p) * 40);
      var r = fn(); ctx.restore(); return r;
    }
    var ph = photoAt(v.photo), hook = v.hook;
    var st = styleOf(S.style), cr = S.look === 'creative';
    var HEAD = st.up ? String(hook.h || '').toUpperCase() : hook.h;
    // Headline helpers that follow the chosen style.
    function headFit(maxW, lines, max, min) { track(ctx, st.ht); return fit(ctx, HEAD, st.hw, maxW, lines, Math.round(max * st.hs), min); }
    function subFit(maxW, max, min) { track(ctx, 0); return fit(ctx, hook.s, st.sw, maxW, 2, max, min); }
    function warm(x0, x1, stops) {
      var g = ctx.createLinearGradient(x0, 0, x1, 0), c = stops || SUNSET;
      c.forEach(function (s, i) { g.addColorStop(i / (c.length - 1), s); });
      return g;
    }
    return Promise.all([fonts(), load(ph.src), logos.light, logos.dark, logos.word]).then(function (r) {
      var img = r[1], logoLight = r[2], logoDark = r[3], word = r[4];
      var M = 72, tall = H / W, bottomSafe = size === '9:16' ? 300 : 0, topSafe = size === '9:16' ? 220 : 0;
      ctx.clearRect(0, 0, W, H); track(ctx, 0);
      ZOOM = t == null ? 1 : 1 + 0.09 * ease(T / DUR);

      if (v.layout === 'bleed') {
        cover(ctx, img, 0, 0, W, H, ph.fx, ph.fy);
        if (cr) {
          // Creative: a warm sunset wash over the photo.
          ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.75;
          var wg = ctx.createLinearGradient(0, 0, W, H);
          wg.addColorStop(0, '#f78800'); wg.addColorStop(0.5, '#ca3432'); wg.addColorStop(1, '#347c6e');
          ctx.fillStyle = wg; ctx.fillRect(0, 0, W, H); ctx.restore();
        }
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(0.22, 'rgba(0,0,0,0)');
        g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.88)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        show(0.2, function () { ctx.drawImage(word, M, M + topSafe, 250, 250 * word.height / word.width); });
        var bottom = H - M - bottomSafe;
        ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24;
        show(2.1, function () { contact(ctx, M, bottom, 28, 'rgba(255,255,255,.75)'); });
        var cta = show(1.7, function () { return pill(ctx, hook.cta, M, bottom - 64 - 75, 30, C.gold, C.black); });
        var sf = subFit(W - M * 2, 40, 32);
        ctx.fillStyle = 'rgba(255,255,255,.88)';
        var sh = sf.lines.length * sf.size * 1.3;
        var sy = bottom - 64 - cta.h - 40 - sh + sf.size;
        show(1.2, function () { drawLines(ctx, sf, M, sy, 1.3); });
        var hf = headFit(W - M * 2, 3, tall > 1.5 ? 118 : 104, 60);
        ctx.fillStyle = st.sunset ? warm(M, W - M) : '#fff';
        var hh = hf.lines.length * hf.size * st.lh;
        show(0.6, function () { drawLines(ctx, hf, M, sy - sf.size - 30 - hh + hf.size, st.lh); });
        track(ctx, 0); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
        stripes(ctx, 0, H - 14, W * (t == null ? 1 : ease(T / 1.2)), 14, true);
      }

      else if (v.layout === 'split') {
        var split = Math.round(H * (size === '1:1' ? 0.5 : 0.55));
        var panel = cr ? '#347c6e' : C.black;
        ctx.fillStyle = panel; ctx.fillRect(0, 0, W, H);
        cover(ctx, img, 0, 0, W, split, ph.fx, ph.fy);
        var tg = ctx.createLinearGradient(0, 0, 0, split * 0.35);
        tg.addColorStop(0, 'rgba(0,0,0,.5)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = tg; ctx.fillRect(0, 0, W, split * 0.35);
        show(0.2, function () { ctx.drawImage(word, M, M * 0.8 + topSafe, 210, 210 * word.height / word.width); });
        stripes(ctx, 0, split, W * (t == null ? 1 : ease(T / 1.2)), 36, false);
        // Measure the text block, shrink the headline until it fits the panel, then centre it.
        var room = H - bottomSafe - (split + 36) - 2 * (size === '1:1' ? 50 : 70);
        var sf2, hf2, blockH, hMax = size === '1:1' ? 80 : 96;
        do {
          sf2 = subFit(W - M * 2, 38, 30);
          hf2 = headFit(W - M * 2, 3, hMax, 44);
          blockH = hf2.lines.length * hf2.size * st.lh + 26 + sf2.lines.length * sf2.size * 1.3 + 36 + 75;
          hMax -= 4;
        } while (blockH > room && hMax >= 44);
        var y = split + 36 + (H - bottomSafe - split - 36 - blockH) / 2;
        ctx.fillStyle = st.sunset ? (cr ? C.gold : warm(M, W - M)) : (cr ? '#fbf7e6' : '#fff');
        var y0 = y; y += show(0.6, function () { return drawLines(ctx, hf2, M, y0 + hf2.size * 0.82, st.lh); });
        track(ctx, 0);
        ctx.font = st.sw + ' ' + sf2.size + 'px ' + FONT;
        ctx.fillStyle = cr ? 'rgba(255,255,255,.85)' : C.sand;
        var y1 = y; y += 26 + show(1.2, function () { return drawLines(ctx, sf2, M, y1 + 26 + sf2.size * 0.82, 1.3); });
        var py = y + 36;
        show(1.7, function () { pill(ctx, hook.cta, M, py, 30, C.gold, C.black); });
        show(2.1, function () { contact(ctx, W - M, py + 47, 26, cr ? 'rgba(255,255,255,.8)' : C.sand, 'right'); });
      }

      else if (v.layout === 'statement') {
        // Creative turns the page deep evergreen; every stripe in the logo still shows.
        var dark = true;
        ctx.fillStyle = cr ? '#14322c' : C.black; ctx.fillRect(0, 0, W, H);
        var lg = logoLight;
        var lw = 300, lh = lw * lg.height / lg.width;
        var top = M + topSafe;
        show(0.1, function () { ctx.drawImage(lg, (W - lw) / 2, top, lw, lh); });
        var hf3 = headFit(W - M * 2, 3, size === '1:1' ? 92 : 112, 56);
        ctx.fillStyle = dark ? warm(M, W - M) : (st.sunset ? warm(M, W - M, ['#ca3432', '#a8410c']) : C.ink);
        var hy = top + lh + 60 + hf3.size;
        var used = show(0.5, function () { return drawLines(ctx, hf3, W / 2, hy, st.lh, 'center'); });
        var sf3 = subFit(W - M * 2.5, 36, 28);
        ctx.fillStyle = dark ? 'rgba(255,255,255,.82)' : 'rgba(29,29,31,.85)';
        var sy3 = hy - hf3.size + used + 18 + sf3.size;
        var sUsed = show(1.1, function () { return drawLines(ctx, sf3, W / 2, sy3, 1.3, 'center'); });
        var ctaY = H - M - bottomSafe - 75 - 60;
        var cardTop = sy3 - sf3.size + sUsed + 36;
        var cardH = ctaY - 44 - cardTop;
        if (cardH > 140) {
          show(1.4, function () {
            ctx.save(); rr(ctx, M, cardTop, W - M * 2, cardH, 36); ctx.clip();
            cover(ctx, img, M, cardTop, W - M * 2, cardH, ph.fx, ph.fy); ctx.restore();
          });
        }
        show(1.9, function () { pill(ctx, hook.cta, W / 2, ctaY, 30, dark ? C.gold : C.ink, dark ? C.black : '#fff', 'center'); });
        show(2.2, function () { contact(ctx, W / 2, H - M - bottomSafe + 4, 26, dark ? C.sand : 'rgba(29,29,31,.75)', 'center'); });
      }

      else { // light
        ctx.fillStyle = cr ? '#f3e8d2' : C.paper; ctx.fillRect(0, 0, W, H);
        var dw = 190, dh = dw * logoDark.height / logoDark.width;
        show(0.1, function () { ctx.drawImage(logoDark, M, M + topSafe, dw, dh); });
        var hf4 = headFit(W - M * 2, 3, size === '1:1' ? 80 : 96, 52);
        ctx.fillStyle = st.sunset ? warm(M, W - M, ['#ca3432', '#c25e00']) : C.ink;
        var y4 = M + topSafe + dh + 54 + hf4.size;
        var u4 = show(0.5, function () { return drawLines(ctx, hf4, M, y4, st.lh); });
        var sf4 = subFit(W - M * 2, 36, 28);
        ctx.fillStyle = cr ? 'rgba(29,29,31,.78)' : C.muted;
        var s4 = y4 - hf4.size + u4 + 24 + sf4.size;
        var su4 = show(1.0, function () { return drawLines(ctx, sf4, M, s4, 1.3); });
        var foot = H - M - bottomSafe;
        var ct = s4 - sf4.size + su4 + 40, ch = foot - 75 - 44 - ct;
        if (ch > 140) {
          show(1.4, function () {
            ctx.save(); rr(ctx, M, ct, W - M * 2, ch, 40); ctx.clip();
            cover(ctx, img, M, ct, W - M * 2, ch, ph.fx, ph.fy);
            stripes(ctx, M, ct + ch - 12, W - M * 2, 12, true); ctx.restore();
          });
        }
        show(1.9, function () { pill(ctx, hook.cta, M, foot - 75, 30, C.ink, '#fff'); });
        show(2.2, function () { contact(ctx, W - M, foot - 28, 26, cr ? 'rgba(29,29,31,.75)' : C.muted, 'right'); });
      }
      return canvas;
    });
  }

  function photoAt(i) { var all = PHOTOS.concat(S.own || []); return all[((i % all.length) + all.length) % all.length]; }
  function hooks() { return S.aiHooks || SETS[S.set].hooks; }

  // ---------- Screen ----------
  function buildPhotos() {
    var all = PHOTOS.concat(S.own || []);
    $('#adPhotos').innerHTML = all.map(function (p, i) {
      return '<button type="button" role="radio" aria-checked="' + (i === S.photo) + '" data-i="' + i + '" title="' + AZ.esc(p.n) + '"><img src="' + p.src + '" alt="' + AZ.esc(p.n) + '" loading="lazy"></button>';
    }).join('');
  }
  function buildSets() {
    var html = SETS.map(function (s, i) { return '<button class="chip" type="button" data-set="' + i + '" aria-pressed="' + (!S.aiHooks && i === S.set) + '">' + AZ.esc(s.n) + '</button>'; }).join('');
    if (S.aiHooks) html += '<button class="chip" type="button" data-set="ai" aria-pressed="true">Written by AI</button>';
    $('#adSets').innerHTML = html;
  }
  function freshVariants() {
    var hs = hooks();
    S.variants = LAYOUTS.map(function (l, i) {
      return { layout: l.k, photo: S.photo, hook: Object.assign({}, hs[i % hs.length]), approved: false };
    });
  }

  function cardHtml(v, i) {
    return '<article class="card advar' + (v.approved ? ' approved' : '') + (v.painting ? ' painting' : '') + '" data-i="' + i + '">' +
      '<div class="adcanvas"><canvas aria-label="Ad preview ' + (i + 1) + '"></canvas></div>' +
      '<div class="adctl">' + (v.hook.principle ? '<p class="adprin">SCP: ' + AZ.esc(v.hook.principle) + '</p>' : '') +
        '<label>Layout<select data-f="layout">' + LAYOUTS.map(function (l) { return '<option value="' + l.k + '"' + (l.k === v.layout ? ' selected' : '') + '>' + l.n + '</option>'; }).join('') + '</select></label>' +
        '<div class="adbtns"><button class="btn btn-line btn-sm" type="button" data-act="prev" aria-label="Previous photo">&larr; Photo</button><button class="btn btn-line btn-sm" type="button" data-act="next" aria-label="Next photo">Photo &rarr;</button></div>' +
        '<label>Headline<input data-f="h" value="' + AZ.esc(v.hook.h) + '" maxlength="70"></label>' +
        '<label>Supporting line<input data-f="s" value="' + AZ.esc(v.hook.s) + '" maxlength="110"></label>' +
        '<label>Button<input data-f="cta" value="' + AZ.esc(v.hook.cta) + '" maxlength="22"></label>' +
        '<label>Post text <span class="muted">(goes above the ad)</span><textarea data-f="post" rows="3">' + AZ.esc(v.hook.post || '') + '</textarea></label>' +
        '<div class="adbtns"><button class="btn btn-line btn-sm" type="button" data-act="copy">Copy post text</button><button class="btn btn-sm ' + (v.approved ? 'btn-ink' : 'btn-gold') + '" type="button" data-act="approve" aria-pressed="' + v.approved + '">' + (v.approved ? 'Approved' : 'Approve') + '</button></div>' +
      '</div></article>';
  }
  function buildVariants() {
    $('#adVariants').innerHTML = S.variants.map(cardHtml).join('');
    $$('#adVariants .advar').forEach(function (el) { draw(+el.dataset.i); });
    count();
  }
  var pending = {};
  function draw(i) {
    if (S.motion) return; // the motion loop is already redrawing every frame
    // Redraw at most once per frame while someone types.
    if (pending[i]) return;
    pending[i] = true;
    requestAnimationFrame(function () {
      pending[i] = false;
      var el = $('#adVariants .advar[data-i="' + i + '"]'); if (!el) return;
      var cv = el.querySelector('canvas');
      el.querySelector('.adcanvas').style.aspectRatio = SIZES[S.size][0] + ' / ' + SIZES[S.size][1];
      render(cv, S.variants[i], S.size).catch(function (e) { console.error(e); AZ.toast('A photo did not load. Try another one.'); });
    });
  }
  function count() {
    var n = S.variants.filter(function (v) { return v.approved; }).length;
    $('#adCount').textContent = n ? n + ' approved.' : 'Tap Approve on the ads you like.';
    $('#adSave').disabled = !n;
    if ($('#metaPostBtn')) { $('#metaPostBtn').disabled = !n || !META.ok; $('#metaAdBtn').disabled = !n || !META.ok; }
    if ($('#metaAdList')) adList();
  }

  // ---------- Run it as an ad: where each ad goes, its button, and who sees it ----------
  var DESTS = [['zen', 'How we deliver Zen presentation'], ['messages', 'Messenger chat with Noah'], ['visit', 'Book a visit page'], ['quiz', 'Find your Zen quiz'], ['home', 'aquazen.ca home page']];
  // Meta's button choices. Website ads and Messenger ads allow different ones.
  var WEB_CTAS = [['LEARN_MORE', 'Learn more'], ['SHOP_NOW', 'Shop now'], ['BOOK_TRAVEL', 'Book now'], ['GET_QUOTE', 'Get quote'], ['CONTACT_US', 'Contact us'], ['SIGN_UP', 'Sign up'], ['GET_OFFER', 'Get offer'], ['APPLY_NOW', 'Apply now'], ['SUBSCRIBE', 'Subscribe']];
  var MSG_CTAS = [['MESSAGE_PAGE', 'Send message'], ['LEARN_MORE', 'Learn more'], ['SHOP_NOW', 'Shop now']];
  var AUD = { age_min: 30, age_max: 65, showroom_km: 60, cities: [], exclude: [] };
  function opts(list, val) { return list.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); }
  function adList() {
    var box = $('#metaAdList'), ads = S.variants.filter(function (v) { return v.approved; });
    if (!ads.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<p class="abl">Each approved ad</p>' + ads.map(function (v) {
      var i = S.variants.indexOf(v);
      if (!v.dest) v.dest = $('#metaLink').value;
      var msg = v.dest === 'messages', list = msg ? MSG_CTAS : WEB_CTAS;
      if (!v.cta || !list.some(function (o) { return o[0] === v.cta; })) v.cta = msg ? 'MESSAGE_PAGE' : 'LEARN_MORE';
      return '<div class="metaadrow" data-vi="' + i + '"><b>' + AZ.esc(v.hook.h) + '</b><div class="form abrow">' +
        '<label>Goes to<select data-f="dest">' + opts(DESTS, v.dest) + '</select></label>' +
        '<label>Button<select data-f="cta">' + opts(list, v.cta) + '</select></label></div>' +
        (msg ? '<p class="muted small">Opens a Messenger chat with the AquaZen Page, where Noah answers. Keep Noah switched on.</p>' : '') + '</div>';
    }).join('');
  }
  function audRead() {
    AUD.age_min = Math.max(18, Math.min(65, +$('#audMin').value || 30));
    AUD.age_max = Math.max(AUD.age_min, Math.min(65, +$('#audMax').value || 65));
    AUD.showroom_km = Math.max(0, Math.min(80, +$('#audKm').value || 0));
    audShow();
  }
  function audShow() {
    $('#audCities').innerHTML = AUD.cities.map(function (c, i) {
      return '<span class="audcity">' + AZ.esc(c.name) + ' <select data-ci="' + i + '" aria-label="Distance around ' + AZ.esc(c.name) + '">' + [17, 25, 40, 60, 80].map(function (k) { return '<option value="' + k + '"' + (k === c.radius ? ' selected' : '') + '>' + k + ' km</option>'; }).join('') + '</select><button type="button" data-cx="' + i + '" aria-label="Remove ' + AZ.esc(c.name) + '">&times;</button></span>';
    }).join('');
    $('#audNot').innerHTML = AUD.exclude.map(function (c, i) { return '<span class="audcity audnot">Not ' + AZ.esc(c.name) + '<button type="button" data-nx="' + i + '" aria-label="Stop leaving out ' + AZ.esc(c.name) + '">&times;</button></span>'; }).join('');
    var where = [AUD.showroom_km ? AUD.showroom_km + ' km around the Burnaby showroom' : ''].concat(AUD.cities.map(function (c) { return c.radius + ' km around ' + c.name; })).filter(Boolean);
    var not = AUD.exclude.length ? ', leaving out ' + AUD.exclude.map(function (c) { return c.name.split(',')[0]; }).join(', ') : '';
    $('#audSummary').textContent = where.length ? 'Ages ' + AUD.age_min + ' to ' + (AUD.age_max === 65 ? '65 and up' : AUD.age_max) + ', ' + where.join(', ') + not + '. This becomes the starting audience next time too.' : 'Choose at least one place: the area around the showroom or a city.';
  }
  var geoTimer = null;
  function wireAudience() {
    ['#audMin', '#audMax', '#audKm'].forEach(function (id) { $(id).addEventListener('change', audRead); });
    $('#audQ').addEventListener('input', function () {
      clearTimeout(geoTimer); var q = $('#audQ').value.trim();
      if (q.length < 2) { $('#audResults').innerHTML = ''; return; }
      geoTimer = setTimeout(function () {
        AZ.api('meta-geo?q=' + encodeURIComponent(q), null, 'GET').then(function (r) {
          $('#audResults').innerHTML = (r.places || []).map(function (p) { return '<button type="button" class="chip" data-key="' + p.key + '" data-name="' + AZ.esc(p.name) + '">' + AZ.esc(p.name) + '</button>'; }).join('') || '<span class="muted small">No Canadian city by that name.</span>';
        }).catch(function (e) { $('#audResults').textContent = e.message; });
      }, 300);
    });
    $('#audResults').addEventListener('click', function (e) {
      var b = e.target.closest('[data-key]'); if (!b) return;
      if (!AUD.cities.some(function (c) { return c.key === b.dataset.key; })) AUD.cities.push({ key: b.dataset.key, name: b.dataset.name, radius: 25 });
      $('#audQ').value = ''; $('#audResults').innerHTML = ''; audShow();
    });
    var notTimer = null;
    $('#audNotQ').addEventListener('input', function () {
      clearTimeout(notTimer); var q = $('#audNotQ').value.trim();
      if (q.length < 2) { $('#audNotResults').innerHTML = ''; return; }
      notTimer = setTimeout(function () {
        AZ.api('meta-geo?q=' + encodeURIComponent(q), null, 'GET').then(function (r) {
          $('#audNotResults').innerHTML = (r.places || []).map(function (p) { return '<button type="button" class="chip" data-key="' + p.key + '" data-name="' + AZ.esc(p.name) + '">' + AZ.esc(p.name) + '</button>'; }).join('') || '<span class="muted small">No Canadian city by that name.</span>';
        }).catch(function (e) { $('#audNotResults').textContent = e.message; });
      }, 300);
    });
    $('#audNotResults').addEventListener('click', function (e) {
      var b = e.target.closest('[data-key]'); if (!b) return;
      if (!AUD.exclude.some(function (c) { return c.key === b.dataset.key; })) AUD.exclude.push({ key: b.dataset.key, name: b.dataset.name });
      $('#audNotQ').value = ''; $('#audNotResults').innerHTML = ''; audShow();
    });
    $('#audNot').addEventListener('click', function (e) { var x = e.target.closest('[data-nx]'); if (x) { AUD.exclude.splice(+x.dataset.nx, 1); audShow(); } });
    $('#audCities').addEventListener('click', function (e) { var x = e.target.closest('[data-cx]'); if (x) { AUD.cities.splice(+x.dataset.cx, 1); audShow(); } });
    $('#audCities').addEventListener('change', function (e) { var c = e.target.closest('[data-ci]'); if (c) { AUD.cities[+c.dataset.ci].radius = +c.value; audShow(); } });
    $('#metaAdList').addEventListener('change', function (e) {
      var row = e.target.closest('[data-vi]'); if (!row) return;
      var v = S.variants[+row.dataset.vi];
      if (e.target.dataset.f === 'dest') { v.dest = e.target.value; v.cta = ''; adList(); }
      if (e.target.dataset.f === 'cta') v.cta = e.target.value;
    });
    $('#metaLink').addEventListener('change', function () { S.variants.forEach(function (v) { if (v.approved) { v.dest = $('#metaLink').value; v.cta = ''; } }); adList(); });
  }

  // ---------- Motion ----------
  var loopStart = 0, lastFrame = 0;
  function loop(now) {
    if (!S.motion || !$('#view-ads') || $('#view-ads').hidden) { S.looping = false; return; }
    S.looping = true;
    // About 30 frames a second is plenty for a preview and kinder to phones.
    if (now - lastFrame > 32) {
      lastFrame = now;
      var t = ((now - loopStart) / 1000) % (DUR + 1);
      $$('#adVariants .advar').forEach(function (el) {
        var i = +el.dataset.i;
        el.querySelector('.adcanvas').style.aspectRatio = SIZES[S.size][0] + ' / ' + SIZES[S.size][1];
        render(el.querySelector('canvas'), S.variants[i], S.size, Math.min(t, DUR)).catch(function () {});
      });
    }
    requestAnimationFrame(loop);
  }
  function startLoop() { loopStart = performance.now(); if (!S.looping) requestAnimationFrame(loop); }

  function videoType() {
    if (!window.MediaRecorder) return null;
    var list = ['video/mp4;codecs=avc1.42E01F', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return null;
  }
  // Plays the ad once on a hidden canvas and records it. Runs in real time, so it takes as long as the ad.
  function videoOf(v, size, type) {
    var cv = document.createElement('canvas'), dim = SIZES[size];
    cv.width = dim[0]; cv.height = dim[1];
    return render(cv, v, size, 0).then(function () {
      return new Promise(function (res, rej) {
        var stream = cv.captureStream(30), chunks = [];
        var rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8000000 });
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = function () { res(new Blob(chunks, { type: type.split(';')[0] })); };
        rec.onerror = function (e) { rej(e.error || new Error('Recording failed')); };
        var t0 = performance.now(), track0 = stream.getVideoTracks()[0];
        rec.start(250);
        (function frame() {
          var t = (performance.now() - t0) / 1000;
          render(cv, v, size, Math.min(t, DUR)).then(function () {
            if (track0.requestFrame) track0.requestFrame();
            if (t < DUR + 0.5) setTimeout(frame, 1000 / 30); else rec.stop();
          });
        })();
      });
    });
  }

  // ---------- Saving ----------
  function blobOf(v, size) {
    var cv = document.createElement('canvas');
    return render(cv, v, size).then(function () { return new Promise(function (res) { cv.toBlob(res, 'image/png'); }); });
  }
  // Runs fn over items, at most n at a time, keeping the order.
  function pool(items, n, fn) {
    var out = new Array(items.length), next = 0;
    function worker() {
      if (next >= items.length) return Promise.resolve();
      var i = next++;
      return fn(items[i]).then(function (r) { out[i] = r; return worker(); });
    }
    var ws = []; for (var k = 0; k < Math.min(n, items.length); k++) ws.push(worker());
    return Promise.all(ws).then(function () { return out; });
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'ad'; }
  function save() {
    var sizes = $('#adAllSizes').checked ? Object.keys(SIZES) : [S.size];
    var jobs = [];
    S.variants.forEach(function (v, i) {
      if (!v.approved) return;
      sizes.forEach(function (sz) { jobs.push({ v: v, sz: sz, name: 'AquaZen-' + (i + 1) + '-' + slug(v.hook.h) + '-' + SIZE_NAME[sz] + '.png' }); });
    });
    var btn = $('#adSave'); btn.disabled = true;
    var type = S.motion ? videoType() : null;
    if (S.motion && !type) { AZ.toast("This browser can't record video. Try Chrome or Safari."); count(); return; }
    var ext = type && type.indexOf('mp4') > -1 ? '.mp4' : '.webm';
    var secs = Math.ceil(jobs.length / 3) * Math.ceil(DUR + 1);
    btn.textContent = S.motion ? 'Recording ' + jobs.length + (jobs.length === 1 ? ' video' : ' videos') + ', about ' + secs + ' seconds...' : 'Getting them ready...';
    pool(jobs, S.motion ? 3 : 12, function (j) {
      if (S.motion) return videoOf(j.v, j.sz, type).then(function (b) { return new File([b], j.name.replace(/\.png$/, ext), { type: b.type }); });
      return blobOf(j.v, j.sz).then(function (b) { return new File([b], j.name, { type: 'image/png' }); });
    })
      .then(function (files) {
        // Phones: share sheet, so they can go straight to Photos. Computers: download each.
        if (navigator.canShare && /iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare({ files: files })) {
          return navigator.share({ files: files }).catch(function (e) { if (e.name !== 'AbortError') downloadAll(files); });
        }
        downloadAll(files);
      })
      .catch(function (e) { console.error(e); AZ.toast("Couldn't make the files. Please try again."); })
      .then(function () { btn.textContent = 'Save approved ads'; count(); });
  }
  function downloadAll(files) {
    files.forEach(function (f, i) {
      setTimeout(function () {
        var a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      }, i * 350);
    });
    AZ.toast(files.length + (files.length === 1 ? ' ad saved' : ' ads saved'));
  }

  // ---------- Images from the user's device ----------
  function shrink(file, max) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), i = new Image();
      i.onload = function () {
        var r = Math.min(1, max / Math.max(i.width, i.height));
        var cv = document.createElement('canvas'); cv.width = Math.round(i.width * r); cv.height = Math.round(i.height * r);
        cv.getContext('2d').drawImage(i, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        res(cv.toDataURL('image/jpeg', 0.88));
      };
      i.onerror = function () { rej(new Error("That photo couldn't be opened.")); };
      i.src = url;
    });
  }

  // ---------- Events ----------
  function wire() {
    $('#adPhotos').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      S.photo = +b.dataset.i;
      $$('#adPhotos button').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
      S.variants.forEach(function (v, i) { v.photo = S.photo; draw(i); });
    });
    $('#adOwnPhoto').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      shrink(f, 2400).then(function (src) {
        S.own = (S.own || []).concat([{ src: src, n: 'Your photo', fx: 0.5, fy: 0.5 }]);
        S.photo = PHOTOS.length + S.own.length - 1;
        buildPhotos();
        S.variants.forEach(function (v, i) { v.photo = S.photo; draw(i); });
      }).catch(function (err) { AZ.toast(err.message); });
      e.target.value = '';
    });
    $('#adSets').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.dataset.set === 'ai') return;
      S.aiHooks = null; S.set = +b.dataset.set; buildSets(); freshVariants(); buildVariants();
    });
    $('#adSizes').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      S.size = b.dataset.size;
      $$('#adSizes .chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      S.variants.forEach(function (v, i) { draw(i); });
    });
    var box = $('#adVariants');
    box.addEventListener('input', function (e) {
      var card = e.target.closest('.advar'), f = e.target.dataset.f; if (!card || !f) return;
      var v = S.variants[+card.dataset.i];
      if (f === 'layout') v.layout = e.target.value; else v.hook[f] = e.target.value.replace(/\s*[—–]\s*/g, ', ');
      if (f !== 'post') draw(+card.dataset.i);
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]'); if (!b) return;
      var card = b.closest('.advar'), i = +card.dataset.i, v = S.variants[i];
      if (b.dataset.act === 'next' || b.dataset.act === 'prev') { v.photo += b.dataset.act === 'next' ? 1 : -1; draw(i); }
      else if (b.dataset.act === 'approve') {
        v.approved = !v.approved; card.classList.toggle('approved', v.approved);
        b.textContent = v.approved ? 'Approved' : 'Approve'; b.className = 'btn btn-sm ' + (v.approved ? 'btn-ink' : 'btn-gold');
        b.setAttribute('aria-pressed', String(v.approved)); count();
      }
      else if (b.dataset.act === 'copy') {
        var t = v.hook.post || '';
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { AZ.toast('Post text copied'); }, function () { AZ.toast('Select the text and copy it'); });
      }
    });
    $('#adSave').addEventListener('click', save);
    $('#adMotion').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      S.motion = b.dataset.motion === 'on';
      $$('#adMotion .chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      $('#adSaveNote').textContent = S.motion
        ? 'Each ad saves as an 8 second video. Recording happens live, so keep this page open until they save.'
        : 'Each ad saves as a PNG, ready to upload to Facebook and Instagram. On a phone, choose Save Image to put them in Photos.';
      if (S.motion) startLoop(); else S.variants.forEach(function (v, i) { draw(i); });
    });

    wireBrief();
  }

  // ---------- The Ad Brief ----------
  var PURPOSES = [
    { k: 'visit', n: 'Book a visit' }, { k: 'quiz', n: 'Find your Zen quiz' }, { k: 'offer', n: 'Promote an offer' },
    { k: 'trust', n: 'Build trust' }, { k: 'other', n: 'Something else' }
  ];
  // fact: what the factor needs to stay honest (asked for when the factor is picked).
  var FACTORS = [
    { k: 'emotional', n: 'Emotional connection', d: 'They picture their life better with it, and acting feels natural.' },
    { k: 'loss', n: 'Fear of loss', d: 'Losses loom larger than gains. Shows what waiting costs.', fact: "What's genuinely limited?", ph: 'Example: Only two Series Two Cascades left before the January price increase' },
    { k: 'urgency', n: 'Sense of urgency', d: 'A real reason to act now: a deadline, their own goal, or momentum.', fact: "What's the real timing?", ph: 'Example: Order by Dec 5 to be in the water for Christmas' },
    { k: 'jones', n: 'Jones effect', d: 'Nobody wants to be first, everyone wants to be next.', fact: 'The real pattern or customer', ph: 'Example: Most of our Series Two buyers choose the Harmony' },
    { k: 'greed', n: 'Greed (value)', d: 'They feel like a savvy buyer: anchor first, then the offer, or a free bonus.', fact: 'The real value', ph: 'Example: MSRP $14,999, our price $11,499, cover lifter included' },
    { k: 'indifference', n: 'Indifference', d: 'Calm, unattached confidence. The prize, not the pest.' },
    { k: 'reciprocity', n: 'Reciprocity', d: 'Give a genuinely useful tip first.' },
    { k: 'authority', n: 'Authority', d: 'Lead like the expert, with a clear recommendation.' },
    { k: 'consistency', n: 'Consistency', d: "Connect to what they already believe, so acting is staying true to it." },
    { k: 'suggestion', n: 'Power of suggestion', d: 'Take away the burden of choice with one clear path.' }
  ];
  var TECHS = [
    { k: 'interrupt', n: 'Pattern interrupt', d: 'Act One. Breaks the scroll with something unexpected, sincere and good to receive.' },
    { k: 'why', n: 'Inside-out WHY', d: 'Our purpose meets their reason, before any product.' },
    { k: 'empathy', n: 'Empathy bridge', d: 'Reflects what they want changed, and why we care.' },
    { k: 'story', n: 'Company story', d: 'The founding problem: stores cut corners. We don\'t.' },
    { k: 'howproof', n: 'HOW as proof', d: 'Anchor, decision, distinction.' },
    { k: 'shortcut', n: 'Standard vs shortcut', d: 'The easy way, then the way we chose, and what it costs us.' },
    { k: 'what', n: 'WHAT as proof', d: 'One feature tied to their life, plus a shield for a worry.' },
    { k: 'ownership', n: 'Ownership picture', d: 'They picture it already theirs.' },
    { k: 'reframe', n: 'Challenger reframe', d: 'Hook, reframe a common belief, connect it to them.' },
    { k: 'thirdvoice', n: 'Third voice', d: 'A truth told through a real customer\'s story.' },
    { k: 'identity', n: 'Identity', d: 'Reflects who they\'re becoming.' },
    { k: 'connect', n: 'A-C-A Connect', d: 'Names what their interest says about them.' }
  ];
  var STAGES = [
    { k: 'uncertainty', n: 'Just curious' }, { k: 'curiosity', n: 'Looking around' },
    { k: 'excitement', n: 'Excited' }, { k: 'anxiety', n: 'Close to deciding' }
  ];
  var MODES = [
    { k: 'same', n: 'Same recipe, four ways', d: 'All four use your factors and technique, each with a different opener and angle.' },
    { k: 'test', n: 'Test the factors', d: 'Same purpose and technique, a different impulse factor on each, so Facebook shows you which one wins. Pick up to four factors.' }
  ];
  var IMAGERY = [{ k: 'photos', n: 'Our photos' }, { k: 'ai', n: 'AI images' }, { k: 'mix', n: 'Mix, AI decides' }];
  var B = { purpose: 'visit', factors: [], techniques: [], facts: {}, stage: 'curiosity', mode: 'same', imagery: 'photos', plan: null };

  function chips(el, list, sel, key) {
    $(el).innerHTML = list.map(function (o) {
      return '<button class="chip" type="button" data-' + key + '="' + o.k + '" aria-pressed="' + (sel.indexOf ? sel.indexOf(o.k) > -1 : sel === o.k) + '">' + AZ.esc(o.n) + '</button>';
    }).join('');
  }
  function maxFactors() { return B.mode === 'test' ? 4 : 2; }
  function buildBrief() {
    chips('#abPurpose', PURPOSES, B.purpose, 'v');
    chips('#abFactors', FACTORS, B.factors, 'v');
    chips('#abTech', TECHS, B.techniques, 'v');
    chips('#abStage', STAGES, B.stage, 'v');
    chips('#abMode', MODES, B.mode, 'v');
    chips('#abImagery', IMAGERY, B.imagery, 'v');
    var fd = FACTORS.filter(function (f) { return B.factors.indexOf(f.k) > -1; });
    $('#abFactorHelp').textContent = fd.length ? fd.map(function (f) { return f.n + ': ' + f.d; }).join(' ') : 'Pick up to ' + maxFactors() + '. Leave them empty and the AI chooses ones that need no outside facts.';
    var td = TECHS.filter(function (t) { return B.techniques.indexOf(t.k) > -1; });
    $('#abTechHelp').textContent = td.length ? td.map(function (t) { return t.n + ': ' + t.d; }).join(' ') : 'Leave empty and the AI chooses.';
    $('#abModeHelp').textContent = MODES.filter(function (m) { return m.k === B.mode; })[0].d;
    $('#abStoryBox').hidden = B.techniques.indexOf('thirdvoice') < 0 && B.factors.indexOf('jones') < 0;
    // A box for each factor that needs a real fact, keeping anything already typed.
    var box = $('#abFacts');
    box.innerHTML = fd.filter(function (f) { return f.fact; }).map(function (f) {
      return '<label>' + AZ.esc(f.n) + ': ' + AZ.esc(f.fact) + ' <span class="muted">(required, only if true)</span><input data-fact="' + f.k + '" maxlength="300" placeholder="' + AZ.esc(f.ph) + '" value="' + AZ.esc(B.facts[f.k] || '') + '"></label>';
    }).join('');
  }
  function toggle(list, k, max) {
    var i = list.indexOf(k);
    if (i > -1) list.splice(i, 1);
    else { if (list.length >= max) list.shift(); list.push(k); }
  }
  function briefBody() {
    return {
      purpose: B.purpose, idea: $('#abIdea').value, offer: $('#abOffer').value, audience: $('#abAudience').value,
      factors: B.factors.slice(), techniques: B.techniques.slice(), facts: B.facts, story: $('#abStory').value,
      stage: B.stage, mode: B.mode, imagery: B.imagery, look: S.look === 'creative' ? 'creative' : 'brand', style: S.style,
      photos: PHOTOS.map(function (p) { return p.n; }), layouts: LAYOUTS.map(function (l) { return l.k + ': ' + l.n; })
    };
  }
  function nameOf(list, k) { var o = list.filter(function (x) { return x.k === k; })[0]; return o ? o.n : k; }
  function showPlan(p) {
    B.plan = p;
    $('#abAngle').innerHTML = '<b>' + AZ.esc(p.angle) + '</b>' + (p.reader ? '<br><span class="muted">' + AZ.esc(p.reader) + '</span>' : '');
    $('#abPlanAds').innerHTML = p.ads.map(function (a) {
      var img = a.imagePrompt ? 'AI image: ' + a.imagePrompt : 'Photo: ' + ((PHOTOS[a.photo] || {}).n || 'ours');
      return '<li><span class="adprin">' + AZ.esc(nameOf(FACTORS, a.factor)) + ' + ' + AZ.esc(nameOf(TECHS, a.technique)) + '</span>' +
        AZ.esc(a.idea) + '<br><span class="muted small">' + AZ.esc(nameOf(LAYOUTS.map(function (l) { return { k: l.k, n: l.n }; }), a.layout)) + ' · ' + AZ.esc(img) + '</span></li>';
    }).join('');
    $('#abPlan').hidden = false;
    $('#abPlan').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  var refImage = null;
  function plan() {
    var msg = $('#abMsg'), btn = $('#abPlanBtn');
    var missing = FACTORS.filter(function (f) { return f.fact && B.factors.indexOf(f.k) > -1 && !(B.facts[f.k] || '').trim(); });
    if (missing.length) { msg.textContent = missing[0].n + ' needs a real fact to be honest. Add it, or pick a different factor.'; return; }
    if (B.techniques.indexOf('thirdvoice') > -1 && !$('#abStory').value.trim()) { msg.textContent = 'Third voice needs a real customer story. Add one, or pick a different technique.'; return; }
    btn.disabled = true; msg.textContent = 'Planning your ads...';
    var f = $('#abRef').files[0];
    (f ? shrink(f, 1400) : Promise.resolve(null)).then(function (ref) {
      refImage = ref;
      return AZ.api('ads-write', { action: 'plan', brief: briefBody(), image: ref });
    }).then(function (r) { showPlan(r.plan); msg.textContent = ''; })
      .catch(function (e) { msg.textContent = e.message; })
      .then(function () { btn.disabled = false; });
  }
  function write() {
    var msg = $('#abWriteMsg'), btn = $('#abWriteBtn');
    btn.disabled = true; msg.textContent = 'Writing and designing...';
    AZ.api('ads-write', { action: 'write', brief: briefBody(), plan: B.plan, note: $('#abNote').value, image: refImage }).then(function (r) {
      if (!r.hooks || !r.hooks.length) throw new Error('Nothing came back. Please try again.');
      S.aiHooks = r.hooks.slice(0, 4); buildSets(); freshVariants();
      S.variants.forEach(function (v, i) {
        var hk = S.aiHooks[i % S.aiHooks.length];
        if (hk.layout && LAYOUTS.some(function (l) { return l.k === hk.layout; })) v.layout = hk.layout;
        if (typeof hk.photo === 'number' && hk.photo >= 0 && hk.photo < PHOTOS.length) v.photo = hk.photo;
        v.painting = !!hk.imagePrompt;
      });
      buildVariants();
      $('#adVariants').scrollIntoView({ behavior: 'smooth', block: 'start' });
      var jobs = S.variants.map(function (v, i) { return { v: v, i: i, prompt: S.aiHooks[i % S.aiHooks.length].imagePrompt }; }).filter(function (j) { return j.prompt; });
      msg.textContent = jobs.length ? 'Painting ' + jobs.length + (jobs.length === 1 ? ' AI image' : ' AI images') + '...' : 'Done. Edit anything on the ads below.';
      return pool(jobs, 2, function (j) {
        return AZ.api('ads-image', { prompt: j.prompt }).then(function (res) {
          S.own = (S.own || []).concat([{ src: res.image, n: 'AI image', fx: 0.5, fy: 0.5 }]);
          j.v.photo = PHOTOS.length + S.own.length - 1; j.v.painting = false;
          buildPhotos(); refreshCard(j.i);
        }, function (err) { j.v.painting = false; refreshCard(j.i); throw err; });
      }).then(function () { if (jobs.length) msg.textContent = 'Done. Edit anything on the ads below.'; });
    }).catch(function (e) { msg.textContent = e.message; })
      .then(function () { btn.disabled = false; });
  }
  function refreshCard(i) {
    var el = $('#adVariants .advar[data-i="' + i + '"]'); if (!el) return;
    el.classList.toggle('painting', !!S.variants[i].painting);
    draw(i);
  }
  function wireBrief() {
    buildBrief();
    $('#adStyle').innerHTML = STYLES.map(function (st) { return '<button class="chip" type="button" data-style="' + st.k + '" aria-pressed="' + (st.k === S.style) + '" title="' + AZ.esc(st.d) + '">' + AZ.esc(st.n) + '</button>'; }).join('');
    $('.adbrief').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      var g = b.parentNode.id, k = b.dataset.v;
      if (g === 'abPurpose') B.purpose = k;
      else if (g === 'abFactors') toggle(B.factors, k, maxFactors());
      else if (g === 'abTech') toggle(B.techniques, k, 2);
      else if (g === 'abStage') B.stage = k;
      else if (g === 'abMode') { B.mode = k; while (B.factors.length > maxFactors()) B.factors.shift(); }
      else if (g === 'abImagery') B.imagery = k;
      buildBrief();
    });
    $('#abFacts').addEventListener('input', function (e) { if (e.target.dataset.fact) B.facts[e.target.dataset.fact] = e.target.value; });
    $('#abPlanBtn').addEventListener('click', plan);
    $('#abReplanBtn').addEventListener('click', plan);
    $('#abWriteBtn').addEventListener('click', write);
    $('#adLook').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      S.look = b.dataset.look; $$('#adLook .chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      S.variants.forEach(function (v, i) { draw(i); });
    });
    $('#adStyle').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      S.style = b.dataset.style; $$('#adStyle .chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      S.variants.forEach(function (v, i) { draw(i); });
    });
  }

  // ---------- Send to Meta ----------
  var META = { ok: false };
  function metaLoad() {
    var st = $('#metaStatus');
    AZ.api('meta-status', null, 'GET').then(function (r) {
      if (!r.configured) { st.textContent = "Not connected yet. Once the Meta app's token is saved in Supabase, you can post and create ads from here."; return; }
      if (r.error) { st.textContent = r.error; return; }
      META = { ok: true, pages: r.pages, acts: r.adAccounts, chosen: r.chosen };
      if (r.audience) { AUD = { age_min: r.audience.age_min, age_max: r.audience.age_max, showroom_km: r.audience.showroom_km, cities: r.audience.cities || [], exclude: r.audience.exclude || [] }; $('#audMin').value = AUD.age_min; $('#audMax').value = AUD.age_max; $('#audKm').value = AUD.showroom_km; audShow(); }
      $('#metaPage').innerHTML = r.pages.map(function (p) { return '<option value="' + p.id + '"' + (p.id === r.chosen.page ? ' selected' : '') + '>' + AZ.esc(p.name) + (p.ig ? ' (Instagram @' + AZ.esc(p.ig.username) + ')' : ' (no Instagram linked)') + '</option>'; }).join('') || '<option value="">No Pages found</option>';
      $('#metaAct').innerHTML = r.adAccounts.map(function (a) { return '<option value="' + a.id + '"' + (a.id === r.chosen.adAccount ? ' selected' : '') + '>' + AZ.esc(a.name) + ' (' + AZ.esc(a.currency) + ')' + (a.active ? '' : ', not active') + '</option>'; }).join('') || '<option value="">No ad accounts found</option>';
      var pg = r.pages.filter(function (p) { return p.id === r.chosen.page; })[0];
      st.textContent = pg ? 'Connected to ' + pg.name + (pg.ig ? ' and Instagram @' + pg.ig.username : ', with no Instagram account linked to the Page yet') + '.' : 'Connected. Pick your Page and ad account.';
      $('#metaPick').hidden = false; $('#metaActions').hidden = false;
      count();
    }).catch(function (e) { st.textContent = e.message; });
  }
  function metaSave() {
    var pg = META.pages.filter(function (p) { return p.id === $('#metaPage').value; })[0];
    AZ.api('meta-status', { page_id: $('#metaPage').value, ig_id: pg && pg.ig ? pg.ig.id : '', ad_account: $('#metaAct').value }).then(function () { metaLoad(); });
  }
  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); })); }
  // Upload the feed version of an ad (and its video when Motion is on) to the private "ads" bucket.
  function uploadAd(v) {
    var dir = uuid(), base = slug(v.hook.h);
    return blobOf(v, '4:5').then(function (png) {
      var img = dir + '/' + base + '.png';
      return AZ.sb.storage.from('ads').upload(img, png, { contentType: 'image/png' }).then(function (r) {
        if (r.error) throw new Error("Couldn't upload the ad: " + r.error.message);
        if (!S.motion) return { image: img };
        var type = videoType();
        if (!type || type.indexOf('mp4') < 0) return { image: img };
        return videoOf(v, '4:5', type).then(function (b) {
          var vid = dir + '/' + base + '.mp4';
          return AZ.sb.storage.from('ads').upload(vid, b, { contentType: 'video/mp4' }).then(function (r2) {
            if (r2.error) throw new Error("Couldn't upload the video: " + r2.error.message);
            return { image: img, video: vid };
          });
        });
      });
    });
  }
  var postArmed = false, adArmed = false;
  function metaPost() {
    var ads = S.variants.filter(function (v) { return v.approved; }), btn = $('#metaPostBtn'), msg = $('#metaMsg');
    var fb = $('#metaFb').checked, ig = $('#metaIg').checked;
    if (!fb && !ig) { msg.textContent = 'Tick Facebook, Instagram or both.'; return; }
    // Posting is public, so it takes a second tap to confirm.
    if (!postArmed) { postArmed = true; btn.textContent = 'Tap again to post ' + ads.length + (ads.length === 1 ? ' ad' : ' ads') + ' publicly'; setTimeout(function () { postArmed = false; btn.textContent = 'Post on my Page'; }, 6000); return; }
    postArmed = false; btn.disabled = true; btn.textContent = 'Posting...';
    var out = [];
    pool(ads, 1, function (v) {
      return uploadAd(v).then(function (m) {
        return AZ.api('meta-post', { image: m.image, video: m.video, caption: v.hook.post, headline: v.hook.h, facebook: fb, instagram: ig });
      }).then(function (r) {
        var bits = [];
        if (r.done.facebook) bits.push('Facebook posted'); if (r.done.instagram) bits.push('Instagram posted');
        Object.keys(r.failed || {}).forEach(function (k) { bits.push(k + ': ' + r.failed[k]); });
        out.push('"' + v.hook.h + '": ' + bits.join(', '));
      }, function (e) { out.push('"' + v.hook.h + '": ' + e.message); });
    }).then(function () { msg.textContent = out.join(' | '); btn.textContent = 'Post on my Page'; count(); });
  }
  function metaAd() {
    var ads = S.variants.filter(function (v) { return v.approved; }), btn = $('#metaAdBtn'), msg = $('#metaMsg');
    audRead();
    if (!AUD.showroom_km && !AUD.cities.length) { msg.textContent = 'Choose at least one place for the audience.'; return; }
    var budget = Math.max(5, Math.min(500, Math.round(+$('#metaBudget').value || 20)));
    // Starting spends money, so it takes a second tap that says what it will cost.
    if (!adArmed) {
      adArmed = true;
      btn.textContent = 'Tap again to start: ' + ads.length + (ads.length === 1 ? ' ad' : ' ads') + ' at $' + budget + ' a day' + (ads.length > 1 ? ' each ($' + budget * ads.length + ' a day)' : '');
      setTimeout(function () { if (adArmed) { adArmed = false; btn.textContent = 'Start ad campaign'; } }, 7000);
      return;
    }
    adArmed = false;
    btn.disabled = true; btn.textContent = 'Starting your ads...';
    var out = [], last = '';
    pool(ads, 1, function (v) {
      return uploadAd(v).then(function (m) {
        return AZ.api('meta-ad', { image: m.image, video: m.video, headline: v.hook.h, caption: v.hook.post, link: v.dest || $('#metaLink').value, cta: v.cta, budget: budget, audience: AUD, start: true });
      }).then(function (r) { last = r.manager; out.push('"' + v.hook.h + '": ' + (r.started ? 'started' : 'set up but not started (' + (r.startError || 'turn it on in Ad results') + ')') + (v.dest === 'messages' ? ', goes to Messenger' : '')); }, function (e) { out.push('"' + v.hook.h + '": ' + e.message); });
    }).then(function () {
      msg.innerHTML = AZ.esc(out.join(' | ')) + (last ? ' <a href="' + last + '" target="_blank" rel="noopener">Open Ads Manager</a>' : '');
      msg.innerHTML += ' <a href="#adresults">See them in Ad results</a>';
      btn.textContent = 'Start ad campaign'; count();
    });
  }
  function wireMeta() {
    $('#metaPage').addEventListener('change', metaSave);
    $('#metaAct').addEventListener('change', metaSave);
    $('#metaPostBtn').addEventListener('click', metaPost);
    $('#metaAdBtn').addEventListener('click', metaAd);
    // Default the ad's destination to the brief's purpose.
    $('#abPurpose').addEventListener('click', function () { $('#metaLink').value = B.purpose === 'quiz' ? 'quiz' : B.purpose === 'visit' ? 'visit' : 'zen'; });
    wireAudience(); audShow();
    metaLoad();
  }

  window.AZAds = {
    open: function () {
      if (S.opened) { if (S.motion) startLoop(); else S.variants.forEach(function (v, i) { draw(i); }); return; }
      S.opened = true;
      logos.light = load('/assets/img/logo-full.png');
      logos.dark = load('/assets/img/logo-dark.png');
      logos.word = load('/assets/img/logo-word.png');
      buildPhotos(); buildSets(); freshVariants(); buildVariants(); wire(); wireMeta();
    },
    _render: render, _state: S
  };
})();
