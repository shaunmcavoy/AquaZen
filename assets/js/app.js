/* Shared code for the login, staff, signing and customer portal pages. */
(function () {
  var URL_ = 'https://zfqzajshbjfmflbttabq.supabase.co';
  var KEY = 'sb_publishable_Eao54p2Rys-aF9nmwptL1Q_w8vkQsLz';
  var FN = URL_ + '/functions/v1/portal/';
  var sb = window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });

  var AZ = window.AZ = { sb: sb, FN: FN };

  AZ.money = function (n) { return '$' + Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  AZ.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  AZ.date = function (d) { return d ? new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : ''; };
  AZ.dateTime = function (d) { return d ? new Date(d).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : ''; };

  // Call a portal route. Sends the signed-in user's token when there is one.
  AZ.api = function (route, body, method) {
    return sb.auth.getSession().then(function (r) {
      var headers = { 'Content-Type': 'application/json' };
      var s = r.data && r.data.session;
      if (s) headers.Authorization = 'Bearer ' + s.access_token;
      var opts = { method: method || 'POST', headers: headers };
      if (body && (method || 'POST') !== 'GET') opts.body = JSON.stringify(body);
      return fetch(FN + route, opts).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          if (!res.ok) { var e = new Error(d.error || 'Something went wrong. Please try again.'); e.data = d; e.status = res.status; throw e; }
          return d;
        });
      });
    });
  };

  // Current user + profile, or null.
  AZ.me = function () {
    return sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (!s) return null;
      return sb.from('profiles').select('*').eq('id', s.user.id).maybeSingle().then(function (p) {
        // Remember the role so the public site's header can link straight to the right portal.
        try { if (p.data) localStorage.setItem('az_role', p.data.role); } catch (e) { /* storage blocked */ }
        return p.data ? { user: s.user, profile: p.data } : null;
      });
    });
  };

  AZ.requireRole = function (roles) {
    return AZ.me().then(function (me) {
      if (!me || roles.indexOf(me.profile.role) < 0) {
        location.replace('/login/?next=' + encodeURIComponent(location.pathname + location.hash));
        return new Promise(function () {});
      }
      return me;
    });
  };

  AZ.signOut = function () { try { localStorage.removeItem('az_role'); } catch (e) { /* ignore */ } sb.auth.signOut().then(function () { location.href = '/login/'; }); };

  AZ.toast = function (msg) {
    var t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.hidden = false; clearTimeout(AZ.toast.t);
    AZ.toast.t = setTimeout(function () { t.hidden = true; }, 2600);
  };

  AZ.copy = function (text) {
    try { navigator.clipboard.writeText(text).then(function () { AZ.toast('Copied'); }, function () { AZ.toast(text); }); }
    catch (e) { AZ.toast(text); }
  };

  // Signature pad on a <canvas>. Returns {isEmpty, clear, toDataURL}.
  AZ.signaturePad = function (canvas) {
    var ctx = canvas.getContext('2d'), drawing = false, empty = true, last = null;
    function size() {
      var r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      var keep = empty ? null : canvas.toDataURL();
      canvas.width = Math.round(r.width * d); canvas.height = Math.round(r.height * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1d1d1f';
      if (keep) { var img = new Image(); img.onload = function () { ctx.drawImage(img, 0, 0, r.width, r.height); }; img.src = keep; }
    }
    function pt(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    canvas.addEventListener('pointerdown', function (e) { drawing = true; last = pt(e); canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
    canvas.addEventListener('pointermove', function (e) {
      if (!drawing) return; var p = pt(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; empty = false; e.preventDefault();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { canvas.addEventListener(ev, function () { drawing = false; }); });
    window.addEventListener('resize', size); size();
    return {
      isEmpty: function () { return empty; },
      clear: function () { ctx.clearRect(0, 0, canvas.width, canvas.height); empty = true; },
      toDataURL: function () {
        // Export at a modest fixed size so the PNG stays small.
        var out = document.createElement('canvas'); out.width = 600; out.height = 200;
        out.getContext('2d').drawImage(canvas, 0, 0, 600, 200);
        return out.toDataURL('image/png');
      }
    };
  };

  AZ.STATUS = {
    draft: ['Draft', 'grey'], awaiting_customer: ['Waiting for customer', 'amber'], signed: ['Signed', 'teal'],
    deposit_paid: ['Deposit received', 'teal'], delivery_scheduled: ['Delivery booked', 'gold'], delivered: ['Delivered', 'green'], cancelled: ['Cancelled', 'grey']
  };
  AZ.pill = function (st) { var s = AZ.STATUS[st] || [st, 'grey']; return '<span class="pill pill-' + s[1] + '">' + AZ.esc(s[0]) + '</span>'; };

  // Product types on a sale. Hot tubs, swim spas and mini pools use the tub_* fields; a sauna on its own uses sauna_*.
  AZ.NOUN = { hot_tub: 'hot tub', swim_spa: 'swim spa', mini_pool: 'mini pool', sauna: 'sauna' };
  AZ.noun = function (s) { return AZ.NOUN[(s && s.product_type) || 'hot_tub'] || 'hot tub'; };
  AZ.cap = function (t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; };
  // What was sold, in words: "Aspen hot tub", "Solara swim spa".
  AZ.what = function (s) {
    var main = s.product_type === 'sauna' ? '' : (s.tub_model ? s.tub_model + ' ' + AZ.noun(s) : '');
    return [main, s.sauna_model && s.sauna_model + ' sauna'].filter(Boolean).join(' + ');
  };
  // Photo for a model in a category, from the product list the build writes into the page.
  AZ.productFor = function (type, model) {
    var cat = (window.AZ_PRODUCTS || {})[type || 'hot_tub'], m = String(model || '').toLowerCase().trim();
    if (!cat || !m) return null;
    for (var g = 0; g < cat.groups.length; g++) for (var i = 0; i < cat.groups[g].items.length; i++) {
      var it = cat.groups[g].items[i]; if (it.n.toLowerCase() === m) return it;
    }
    return null;
  };

  // Delivery window chosen at signing: 'asap' or the first day of a two-week window.
  function day(d, year) { return d.toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'long', day: 'numeric', year: year ? 'numeric' : undefined }); }
  AZ.windowLabel = function (w) {
    if (!w) return '';
    if (w === 'asap') return 'As soon as possible (under two weeks)';
    var a = new Date(w + 'T00:00:00Z'); if (isNaN(a)) return '';
    return day(a) + ' to ' + day(new Date(a.getTime() + 13 * 86400000), true);
  };
  AZ.dayLabel = function (d) { return d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-CA', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }) : ''; };

  // Match a model name like "Aspen" to its photo and series.
  AZ.tubFor = function (model) {
    var m = String(model || '').toLowerCase().replace(/hot tub/, '').trim();
    var list = window.AZ_TUBS || [];
    for (var i = 0; i < list.length; i++) if (list[i].n.toLowerCase() === m) return list[i];
    return null;
  };
})();
