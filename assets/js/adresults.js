/* Ad results (staff portal, Marketing): in plain words, how the ads are doing, Facebook vs Instagram, advice with
   one-tap Apply, the ad fund, and pause / turn on / daily budget controls.
   Server routes in the portal function: ads-stats, ads-control, ads-advice, ads-apply. */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var range = '7d', data = null, advice = null, applied = {}, bound = false, asking = false;
  var RANGE_NAME = { today: 'today', '7d': 'in the last 7 days', '30d': 'in the last 30 days', max: 'since you started' };
  var PLATFORM = { facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Other apps', messenger: 'Messenger', threads: 'Threads' };

  function money(n, cents) { return n == null || isNaN(n) ? '-' : '$' + Number(n).toLocaleString('en-CA', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }); }
  function int(n) { return Number(n || 0).toLocaleString('en-CA'); }
  function per(spend, n) { return n ? money(spend / n, true) : '-'; }
  function esc(s) { return AZ.esc(s == null ? '' : String(s)); }

  // Our own rule-of-thumb rating, so anyone can read it: how often people who see an ad tap it, what each tap costs,
  // whether it brings leads, and whether people have seen it too often.
  function rate(x, ourLeads) {
    var views = x.impressions || 0, taps = x.clicks || 0, spend = x.spend || 0, leads = ourLeads != null ? ourLeads : (x.leads || 0);
    if (views < 1000 && spend < 10) return { n: 0, word: 'Too early', tone: 'wait', say: 'Not enough people have seen it yet to judge. Give it a few days.' };
    var rateTap = views ? taps / views * 100 : 0, cost = taps ? spend / taps : null, n;
    n = rateTap >= 1.5 ? 4 : rateTap >= 0.9 ? 3 : rateTap >= 0.5 ? 2 : 1;
    if (cost != null && cost <= 1) n++;
    if (cost != null && cost > 3) n--;
    if (leads > 0) n++;
    if (x.frequency > 3.5) n--;
    n = Math.max(1, Math.min(5, n));
    var W = { 5: ['Excellent', 'ok'], 4: ['Great', 'ok'], 3: ['Good', 'ok'], 2: ['Weak', 'wait'], 1: ['Not working', 'bad'] };
    var say = n >= 4 ? 'People who see it want to know more. Keep it running.'
      : n === 3 ? 'Doing its job. Fresh wording could make it better.'
      : n === 2 ? 'Most people scroll past it. Try new wording or a new picture.'
      : 'Very few people tap it. Pause it and try something new.';
    if (x.frequency > 3.5) say += ' The same people have seen it ' + x.frequency.toFixed(1) + ' times, so it\'s getting tired.';
    return { n: n, word: W[n][0], tone: W[n][1], say: say };
  }
  function dots(n) { var h = ''; for (var i = 1; i <= 5; i++) h += '<i class="' + (i <= n ? 'on' : '') + '"></i>'; return '<span class="addots" aria-label="' + n + ' out of 5">' + h + '</span>'; }
  function badge(r) { return '<span class="adrate ' + r.tone + '">' + (r.n ? dots(r.n) : '') + esc(r.word) + '</span>'; }
  function state(eff) {
    var map = { ACTIVE: ['Running', 'ok'], PAUSED: ['Paused', 'off'], CAMPAIGN_PAUSED: ['Paused', 'off'], ADSET_PAUSED: ['Paused', 'off'],
      PENDING_REVIEW: ['Meta is reviewing it', 'wait'], IN_PROCESS: ['Getting ready', 'wait'], DISAPPROVED: ['Not approved by Meta', 'bad'], WITH_ISSUES: ['Has a problem', 'bad'], ARCHIVED: ['Archived', 'off'], DELETED: ['Deleted', 'off'] };
    var m = map[eff] || [String(eff || '').toLowerCase().replace(/_/g, ' '), 'off'];
    return '<span class="adstate ' + m[1] + '">' + esc(m[0]) + '</span>';
  }
  function tile(label, value, note) { return '<div class="adtile"><span>' + label + '</span><b>' + value + '</b>' + (note ? '<small>' + note + '</small>' : '') + '</div>'; }

  // ---------- Advice ----------
  var GRADE = { great: ['Great', 'ok'], good: ['Good', 'ok'], okay: ['Okay', 'wait'], poor: ['Needs work', 'bad'], too_early: ['Too early to tell', 'wait'] };
  var REC = { budget: 'Change the daily budget', pause: 'Pause', resume: 'Turn on', copy: 'Try new wording' };
  function adviceHtml() {
    var a = advice;
    var h = '<div class="card adadvice"><div class="adadvice-top"><div><h3>Advice</h3><p class="muted">Claude reads your results and suggests what to change. Nothing changes until you tap Apply.</p></div>' +
      '<button class="btn btn-gold btn-sm" type="button" id="adrAsk"' + (asking ? ' disabled' : '') + '>' + (asking ? 'Reading your results...' : a ? 'Get fresh advice' : 'Get advice') + '</button></div>';
    if (!a) return h + '</div>';
    var g = GRADE[a.grade] || GRADE.too_early;
    h += '<div class="adverdict"><span class="adrate ' + g[1] + '">' + esc(g[0]) + '</span><b>' + esc(a.headline) + '</b></div><p>' + esc(a.summary) + '</p>' +
      '<p class="muted adnote">From ' + esc(AZ.dateTime(a.at)) + ', looking at ' + esc(RANGE_NAME[a.range] || 'your results') + '.</p>';
    if (!a.recommendations.length) return h + '<p><b>No changes needed right now.</b></p></div>';
    h += '<ol class="adrecs">' + a.recommendations.map(function (r, i) {
      var k = a.at + i, done = applied[k];
      var detail = r.type === 'budget' ? '<p class="adrec-detail">New budget: <b>' + money(r.new_budget) + ' a day</b></p>'
        : r.type === 'copy' ? '<div class="adrec-copy"><span>New headline</span><b>' + esc(r.new_headline) + '</b><span>New text</span><p>' + esc(r.new_text) + '</p><small>Keeps the same picture. A new ad is made with this wording and the old one is paused.</small></div>' : '';
      return '<li class="adrec"><div class="adrec-top"><div><span class="adrec-type">' + esc(REC[r.type] || r.type) + '</span><b>' + esc(r.target_name) + '</b></div>' +
        (done ? '<span class="adstate ok">' + esc(done) + '</span>' : '<button class="btn btn-line btn-sm" type="button" data-apply="' + i + '">Apply</button>') + '</div>' +
        '<p>' + esc(r.why) + '</p>' + detail + '</li>';
    }).join('') + '</ol></div>';
    return h;
  }

  function render() {
    var box = $('#adrBody'), d = data;
    if (!d) return;
    if (d.configured === false) { box.innerHTML = '<div class="card"><h3>Meta isn\'t connected yet</h3><p class="muted">Connect the AquaZen ad account in Ad studio (an admin can do this), then come back here.</p></div>'; return; }
    if (d.error) { box.innerHTML = '<div class="card"><h3>Couldn\'t load results</h3><p class="muted">' + esc(d.error) + '</p></div>'; return; }
    if (!advice && d.advice) advice = d.advice;
    var t = d.totals, o = d.ours, f = d.fund, overall = rate(t, o.leads);

    // The big answer first.
    var h = '<div class="card adoverall"><div><span class="muted">How your ads are doing ' + esc(RANGE_NAME[d.range]) + '</span>' +
      '<div class="adoverall-word ' + overall.tone + '">' + (overall.n ? dots(overall.n) : '') + esc(overall.word) + '</div><p>' + esc(overall.say) + '</p></div>' +
      '<div class="adfund-left ' + (f.left < 0 ? 'neg' : '') + '"><span>Ad money left</span><b>' + money(f.left, true) + '</b></div></div>';

    h += '<div class="adtiles">' +
      tile('Money spent', money(t.spend, true), esc(RANGE_NAME[d.range])) +
      tile('People who saw your ads', int(t.reach), 'Each person counted once') +
      tile('Taps to your website', int(t.clicks), 'Each tap cost ' + per(t.spend, t.clicks)) +
      tile('New leads', int(o.leads), o.leads ? 'Each lead cost ' + per(t.spend, o.leads) : 'People who filled out Find your Zen') +
      tile('Sales', int(o.sales), o.sales ? 'Each sale cost ' + per(t.spend, o.sales) + ' in ads' : 'From people who came from an ad') +
      '</div>';

    h += adviceHtml();

    // Facebook vs Instagram
    var plats = (d.platforms || []).slice().sort(function (a, b) { return b.spend - a.spend; });
    if (plats.length) {
      var best = plats.filter(function (p) { return p.clicks >= 5; }).sort(function (a, b) { return a.spend / a.clicks - b.spend / b.clicks; })[0];
      var maxSpend = Math.max.apply(null, plats.map(function (p) { return p.spend; })) || 1;
      h += '<div class="card adplats"><h3>Facebook or Instagram?</h3><p class="muted">Where your money went and what it got you. Meta moves money toward whichever works better on its own.</p>' +
        plats.map(function (p) {
          var r = rate(p);
          return '<div class="adplat"><div class="adplat-name"><b>' + esc(PLATFORM[p.platform] || p.platform) + '</b>' + (best && best.platform === p.platform && plats.length > 1 ? ' <span class="adstate ok">Best value</span>' : '') + '</div>' +
            '<div class="adbar"><i style="width:' + Math.max(3, Math.round(p.spend / maxSpend * 100)) + '%"></i></div>' +
            '<div class="adplat-nums"><span><b>' + money(p.spend, true) + '</b> spent</span><span><b>' + int(p.clicks) + '</b> taps</span><span><b>' + per(p.spend, p.clicks) + '</b> each</span>' + badge(r) + '</div></div>';
        }).join('') + '</div>';
    }

    // Ad fund
    h += '<div class="card adfund"><h3>Ad fund</h3><p class="muted">' + money(f.perTub) + ' from every tub sold since ' + esc(AZ.date(f.start + 'T12:00:00')) + ', minus what we\'ve spent on ads since then.</p>' +
      '<p class="adfund-line">' + int(f.tubs) + ' tub' + (f.tubs === 1 ? '' : 's') + ' sold = ' + money(f.earned) + ' in · ' + money(f.spent, true) + ' spent · <b>' + money(f.left, true) + ' left</b></p>' +
      (f.canEdit ? '<details class="adfund-edit"><summary>Change the ad fund</summary><div class="form inline"><label>Per tub sold<input id="adrPer" type="number" min="0" step="50" value="' + f.perTub + '"></label><label>Starting from<input id="adrStart" type="date" value="' + esc(f.start) + '"></label><button class="btn btn-line btn-sm" type="button" id="adrFundSave">Save</button></div></details>' : '') +
      '</div>';

    // Each ad, rated
    var camps = (d.campaigns || []).filter(function (c) { return c.effective !== 'ARCHIVED' && c.effective !== 'DELETED'; });
    h += '<h3 class="adr-h">Your ads</h3>';
    if (!camps.length) h += '<div class="card"><p class="muted">No ads yet. Make one in Ad studio.</p></div>';
    camps.forEach(function (c) {
      var running = c.status === 'ACTIVE';
      h += '<article class="card adcamp"><div class="adcamp-top"><div><h4>' + esc(c.name) + '</h4>' + state(c.effective) + (c.budget ? ' <span class="muted">' + money(c.budget) + ' a day</span>' : '') + '</div>' +
        '<button class="btn btn-sm ' + (running ? 'btn-line' : 'btn-gold') + '" type="button" data-act="' + (running ? 'pause' : 'resume') + '" data-kind="campaign" data-id="' + c.id + '" data-name="' + esc(c.name) + '">' + (running ? 'Pause' : 'Turn on') + '</button></div>';
      (c.ads || []).forEach(function (a) {
        var r = rate(a), on = a.status === 'ACTIVE';
        h += '<div class="adone"><div class="adone-top"><div><b>' + esc(a.headline || a.name) + '</b> ' + state(a.effective) + '</div>' + badge(r) + '</div>' +
          '<p class="adone-say">' + esc(r.say) + '</p>' +
          '<div class="adone-nums"><span><b>' + money(a.spend, true) + '</b> spent</span><span><b>' + int(a.reach) + '</b> people saw it</span><span><b>' + int(a.clicks) + '</b> taps</span><span><b>' + per(a.spend, a.clicks) + '</b> each</span>' +
          '<button class="adlink" type="button" data-act="' + (on ? 'pause' : 'resume') + '" data-kind="ad" data-id="' + a.id + '" data-name="' + esc(a.headline || a.name) + '">' + (on ? 'Pause this ad' : 'Turn this ad on') + '</button></div></div>';
      });
      (c.adsets || []).forEach(function (x) {
        if (x.budget != null) h += '<div class="adset"><span>Daily budget</span><b>' + money(x.budget) + ' a day</b><button class="adlink" type="button" data-budget="' + x.id + '" data-now="' + x.budget + '" data-name="' + esc(x.name) + '">Change</button></div>';
      });
      h += '</article>';
    });

    // Leads from ads
    h += '<h3 class="adr-h">People who came from an ad</h3><div class="card">';
    h += o.list.length ? '<ul class="adleads">' + o.list.map(function (l) {
      return '<li><b>' + esc(l.name || 'Someone') + '</b><span>' + esc(AZ.dateTime(l.when)) + ' · ' + (l.where.indexOf('presentation') === 0 ? 'watched the presentation' : 'filled out Find your Zen') + '</span>' + (l.bought ? '<span class="adstate ok">Bought</span>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="muted">Nobody yet ' + esc(RANGE_NAME[d.range]) + '. When someone fills out Find your Zen after tapping an ad, they show up here.</p>';
    h += '</div><details class="adhelp"><summary>How the ratings work</summary><p>Every ad gets 1 to 5 dots from our own rule of thumb: how often people who see it tap it, what each tap costs, whether it brings leads, and whether people have seen it too many times. Under 1,000 views it says "Too early". It\'s a quick guide, not a law. Leads and sales always win.</p></details>' +
      '<p class="muted adnote"><a href="' + esc(d.manager) + '" target="_blank" rel="noopener">Open Ads Manager</a> for anything not here.</p>';
    box.innerHTML = h;
  }

  function load() {
    $('#adrBody').innerHTML = '<p class="muted">Loading results from Meta...</p>';
    Array.prototype.forEach.call(document.querySelectorAll('#adrRange .chip'), function (b) { b.setAttribute('aria-pressed', b.dataset.range === range ? 'true' : 'false'); });
    AZ.api('ads-stats?range=' + range, null, 'GET').then(function (r) { data = r; render(); })
      .catch(function (e) { data = { error: e.message }; render(); });
  }

  function twoTaps(b, label) {
    if (b.dataset.sure) { delete b.dataset.sure; return true; }
    b.dataset.sure = '1'; b.dataset.was = b.textContent; b.textContent = label;
    setTimeout(function () { if (b.dataset.sure) { delete b.dataset.sure; b.textContent = b.dataset.was; } }, 4000);
    return false;
  }

  function bind() {
    if (bound) return; bound = true;
    $('#adrRange').addEventListener('click', function (e) { var b = e.target.closest('[data-range]'); if (b) { range = b.dataset.range; load(); } });
    $('#adrRefresh').addEventListener('click', load);
    $('#adrBody').addEventListener('click', function (e) {
      if (e.target.id === 'adrAsk') {
        asking = true; render();
        AZ.api('ads-advice', { data: data }).then(function (r) { advice = r; applied = {}; })
          .catch(function (err) { AZ.toast(err.message); })
          .then(function () { asking = false; render(); });
        return;
      }
      var ap = e.target.closest('[data-apply]');
      if (ap) {
        var rec = advice.recommendations[Number(ap.dataset.apply)];
        if (!twoTaps(ap, 'Tap again to apply')) return;
        ap.disabled = true; ap.textContent = 'Applying...';
        AZ.api('ads-apply', { rec: rec }).then(function (r) {
          applied[advice.at + ap.dataset.apply] = 'Done'; AZ.toast(r.done || 'Done'); load();
        }).catch(function (err) { AZ.toast(err.message); ap.disabled = false; ap.textContent = 'Apply'; });
        return;
      }
      var b = e.target.closest('[data-act]');
      if (b) {
        if (!twoTaps(b, b.dataset.act === 'pause' ? 'Tap again to pause' : 'Tap again to turn on')) return;
        b.disabled = true; b.textContent = 'Saving...';
        AZ.api('ads-control', { kind: b.dataset.kind, id: b.dataset.id, action: b.dataset.act })
          .then(function () { AZ.toast((b.dataset.act === 'pause' ? 'Paused: ' : 'Turned on: ') + b.dataset.name); load(); })
          .catch(function (err) { AZ.toast(err.message); b.disabled = false; b.textContent = b.dataset.was; });
        return;
      }
      var g = e.target.closest('[data-budget]');
      if (g) {
        var v = prompt('New daily budget (dollars a day, $5 to $500):', g.dataset.now);
        if (v == null) return;
        var n = Math.round(Number(String(v).replace(/[^0-9.]/g, '')));
        if (!(n >= 5 && n <= 500)) { AZ.toast('Choose between $5 and $500 a day.'); return; }
        if (!confirm('Change the daily budget to $' + n + ' a day? Meta starts spending at the new rate right away.')) return;
        AZ.api('ads-control', { kind: 'adset', id: g.dataset.budget, budget: n }).then(function () { AZ.toast('Budget is now $' + n + ' a day'); load(); }).catch(function (err) { AZ.toast(err.message); });
        return;
      }
      if (e.target.id === 'adrFundSave') {
        AZ.api('ads-control', { fund: { per_tub: $('#adrPer').value, start: $('#adrStart').value } }).then(function () { AZ.toast('Ad fund saved'); load(); }).catch(function (err) { AZ.toast(err.message); });
      }
    });
  }

  window.AZAdResults = { open: function () { bind(); load(); } };
})();
