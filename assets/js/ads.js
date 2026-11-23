/* Ad studio (staff portal, admins). Draws on-brand ads on a canvas from our photos, logo and colours,
   so the text is always crisp and every ad looks like AquaZen. Hooks are ours, edited by hand, or written by AI
   through the portal function's ads-write route. */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var C = { black: '#000000', ink: '#1d1d1f', paper: '#f5f5f7', muted: '#6e6e73', sand: '#a1a1a6', gold: '#f0bf33',
    stripes: ['#d8432f', '#f78800', '#f0bf33', '#c5cf99', '#6eaa8f', '#347c6e'] };
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
      { h: '56-frame pumps. Not 48.', s: 'We never hold back on equipment. Your best soak starts on day one.', cta: 'Learn more', post: 'Some stores hold back on equipment. We do the opposite, because the best experience is what keeps you using your hot tub. See how we deliver Zen at aquazen.ca.' },
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

  var S = { photo: 0, size: '4:5', set: 0, variants: [], aiHooks: null, opened: false, motion: false };
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
    var list = [['800', 'normal'], ['600', 'normal'], ['400', 'normal']].map(function (w) {
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
    return Promise.all([fonts(), load(ph.src), logos.light, logos.dark, logos.word]).then(function (r) {
      var img = r[1], logoLight = r[2], logoDark = r[3], word = r[4];
      var M = 72, tall = H / W, bottomSafe = size === '9:16' ? 300 : 0, topSafe = size === '9:16' ? 220 : 0;
      ctx.clearRect(0, 0, W, H); track(ctx, 0);
      ZOOM = t == null ? 1 : 1 + 0.09 * ease(T / DUR) ;

      if (v.layout === 'bleed') {
        cover(ctx, img, 0, 0, W, H, ph.fx, ph.fy);
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(0.22, 'rgba(0,0,0,0)');
        g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.88)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        show(0.2, function () { ctx.drawImage(word, M, M + topSafe, 250, 250 * word.height / word.width); });
        var bottom = H - M - bottomSafe;
        ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24;
        show(2.1, function () { contact(ctx, M, bottom, 28, 'rgba(255,255,255,.75)'); });
        var cta = show(1.7, function () { return pill(ctx, hook.cta, M, bottom - 64 - 75, 30, C.gold, C.black); });
        ctx.fillStyle = 'rgba(255,255,255,.88)';
        var sf = fit(ctx, hook.s, '400', W - M * 2, 2, 40, 32);
        var sh = sf.lines.length * sf.size * 1.3;
        var sy = bottom - 64 - cta.h - 40 - sh + sf.size;
        show(1.2, function () { drawLines(ctx, sf, M, sy, 1.3); });
        track(ctx, -2);
        var hf = fit(ctx, hook.h, '800', W - M * 2, 3, tall > 1.5 ? 118 : 104, 64);
        ctx.fillStyle = '#fff';
        var hh = hf.lines.length * hf.size * 1.04;
        show(0.6, function () { drawLines(ctx, hf, M, sy - sf.size - 30 - hh + hf.size, 1.04); });
        track(ctx, 0); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
        stripes(ctx, 0, H - 14, W * (t == null ? 1 : ease(T / 1.2)), 14, true);
      }

      else if (v.layout === 'split') {
        var split = Math.round(H * (size === '1:1' ? 0.5 : 0.55));
        ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);
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
          track(ctx, 0); sf2 = fit(ctx, hook.s, '400', W - M * 2, 2, 38, 30);
          track(ctx, -2); hf2 = fit(ctx, hook.h, '800', W - M * 2, 3, hMax, 48);
          blockH = hf2.lines.length * hf2.size * 1.04 + 26 + sf2.lines.length * sf2.size * 1.3 + 36 + 75;
          hMax -= 4;
        } while (blockH > room && hMax >= 48);
        var y = split + 36 + (H - bottomSafe - split - 36 - blockH) / 2;
        ctx.fillStyle = '#fff';
        var y0 = y; y += show(0.6, function () { return drawLines(ctx, hf2, M, y0 + hf2.size * 0.82, 1.04); });
        track(ctx, 0);
        ctx.font = '400 ' + sf2.size + 'px ' + FONT;
        ctx.fillStyle = C.sand;
        var y1 = y; y += 26 + show(1.2, function () { return drawLines(ctx, sf2, M, y1 + 26 + sf2.size * 0.82, 1.3); });
        var py = y + 36;
        show(1.7, function () { pill(ctx, hook.cta, M, py, 30, C.gold, C.black); });
        show(2.1, function () { contact(ctx, W - M, py + 47, 26, C.sand, 'right'); });
      }

      else if (v.layout === 'statement') {
        ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);
        var lw = 300, lh = lw * logoLight.height / logoLight.width;
        var top = M + topSafe;
        show(0.1, function () { ctx.drawImage(logoLight, (W - lw) / 2, top, lw, lh); });
        track(ctx, -3);
        var hf3 = fit(ctx, hook.h, '800', W - M * 2, 3, size === '1:1' ? 92 : 112, 60);
        ctx.fillStyle = sunsetText(ctx, M, W - M);
        var hy = top + lh + 60 + hf3.size;
        var used = show(0.5, function () { return drawLines(ctx, hf3, W / 2, hy, 1.04, 'center'); });
        track(ctx, 0);
        var sf3 = fit(ctx, hook.s, '400', W - M * 2.5, 2, 36, 28);
        ctx.fillStyle = 'rgba(255,255,255,.82)';
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
        show(1.9, function () { pill(ctx, hook.cta, W / 2, ctaY, 30, C.gold, C.black, 'center'); });
        show(2.2, function () { contact(ctx, W / 2, H - M - bottomSafe + 4, 26, C.sand, 'center'); });
      }

      else { // light
        ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
        var dw = 190, dh = dw * logoDark.height / logoDark.width;
        show(0.1, function () { ctx.drawImage(logoDark, M, M + topSafe, dw, dh); });
        track(ctx, -2);
        var hf4 = fit(ctx, hook.h, '800', W - M * 2, 3, size === '1:1' ? 80 : 96, 56);
        ctx.fillStyle = C.ink;
        var y4 = M + topSafe + dh + 54 + hf4.size;
        var u4 = show(0.5, function () { return drawLines(ctx, hf4, M, y4, 1.04); });
        track(ctx, 0);
        var sf4 = fit(ctx, hook.s, '400', W - M * 2, 2, 36, 28);
        ctx.fillStyle = C.muted;
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
        show(2.2, function () { contact(ctx, W - M, foot - 28, 26, C.muted, 'right'); });
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
    return '<article class="card advar' + (v.approved ? ' approved' : '') + '" data-i="' + i + '">' +
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

    $('#adAiForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target, msg = $('#adAiMsg'), btn = form.querySelector('button[type="submit"]');
      var file = form.ref.files[0];
      if (!file && !form.goal.value.trim()) { msg.textContent = "Add a screenshot of an ad you like, or say what this ad is for."; return; }
      btn.disabled = true; msg.textContent = file ? 'Studying that ad and writing yours...' : 'Writing...';
      (file ? shrink(file, 1400) : Promise.resolve(null)).then(function (ref) {
        return AZ.api('ads-write', { goal: form.goal.value, offer: form.offer.value, image: ref, photo: photoAt(S.photo).n,
          photos: PHOTOS.map(function (p) { return p.n; }), layouts: LAYOUTS.map(function (l) { return l.k + ': ' + l.n; }) });
      }).then(function (r) {
        if (!r.hooks || !r.hooks.length) throw new Error('Nothing came back. Please try again.');
        S.aiHooks = r.hooks.slice(0, 4); buildSets(); freshVariants();
        // The AI can pick a layout and one of our photos for each ad, to match the ad being copied.
        S.variants.forEach(function (v, i) {
          var hk = S.aiHooks[i % S.aiHooks.length];
          if (hk.layout && LAYOUTS.some(function (l) { return l.k === hk.layout; })) v.layout = hk.layout;
          if (typeof hk.photo === 'number' && hk.photo >= 0 && hk.photo < PHOTOS.length) v.photo = hk.photo;
        });
        buildVariants();
        msg.textContent = 'Done. Edit anything on the ads below.';
      }).catch(function (err) { msg.textContent = err.message; })
        .then(function () { btn.disabled = false; });
    });
  }

  window.AZAds = {
    open: function () {
      if (S.opened) { if (S.motion) startLoop(); else S.variants.forEach(function (v, i) { draw(i); }); return; }
      S.opened = true;
      logos.light = load('/assets/img/logo-full.png');
      logos.dark = load('/assets/img/logo-dark.png');
      logos.word = load('/assets/img/logo-word.png');
      buildPhotos(); buildSets(); freshVariants(); buildVariants(); wire();
    },
    _render: render, _state: S
  };
})();
