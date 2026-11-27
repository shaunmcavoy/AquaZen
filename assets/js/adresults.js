/* Ad results (staff portal, Marketing): what Meta says, what really happened (leads and sales), the ad fund,
   and pause / resume / daily budget controls. Server: routes ads-stats and ads-control in the portal function. */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var range = '7d', data = null, bound = false;
  var RANGE_NAME = { today: 'today', '7d': 'the last 7 days', '30d': 'the last 30 days', max: 'all time' };

  function money(n, cents) { return n == null || isNaN(n) ? '-' : '$' + Number(n).toLocaleString('en-CA', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }); }
  function int(n) { return Number(n || 0).toLocaleString('en-CA'); }
  function per(spend, n) { return n ? money(spend / n, true) : '-'; }
  function state(eff) {
    var map = { ACTIVE: ['Running', 'ok'], PAUSED: ['Paused', 'off'], CAMPAIGN_PAUSED: ['Paused (campaign)', 'off'], ADSET_PAUSED: ['Paused (ad set)', 'off'],
      PENDING_REVIEW: ['In review', 'wait'], IN_PROCESS: ['Getting ready', 'wait'], DISAPPROVED: ['Not approved', 'bad'], WITH_ISSUES: ['Has an issue', 'bad'], ARCHIVED: ['Archived', 'off'], DELETED: ['Deleted', 'off'] };
    var m = map[eff] || [String(eff || '').toLowerCase().replace(/_/g, ' '), 'off'];
    return '<span class="adstate ' + m[1] + '">' + AZ.esc(m[0]) + '</span>';
  }
  function tile(label, value, note) { return '<div class="adtile"><span>' + label + '</span><b>' + value + '</b>' + (note ? '<small>' + note + '</small>' : '') + '</div>'; }

  function render() {
    var box = $('#adrBody'), d = data;
    if (!d) return;
    if (d.configured === false) { box.innerHTML = '<div class="card"><h3>Meta isn\'t connected yet</h3><p class="muted">Connect the AquaZen ad account in Ads (an admin can do this), then come back here.</p></div>'; return; }
    if (d.error) { box.innerHTML = '<div class="card"><h3>Couldn\'t load results</h3><p class="muted">' + AZ.esc(d.error) + '</p></div>'; return; }
    var t = d.totals, o = d.ours, f = d.fund;
    var h = '<div class="adtiles">' +
      tile('Spent', money(t.spend, true), RANGE_NAME[d.range]) +
      tile('People reached', int(t.reach), int(t.impressions) + ' views') +
      tile('Clicks to the website', int(t.clicks), 'Cost per click ' + per(t.spend, t.clicks)) +
      tile('Leads (Find your Zen)', int(o.leads), 'Cost per lead ' + per(t.spend, o.leads)) +
      tile('Sales from ads', int(o.sales), o.sales ? 'Cost per sale ' + per(t.spend, o.sales) + ' · ' + money(o.revenue) + ' sold' : 'No sales yet') +
      '</div>';
    if (t.leads && t.leads !== o.leads) h += '<p class="muted adnote">Meta counted ' + int(t.leads) + ' lead' + (t.leads === 1 ? '' : 's') + '. The number above is what actually arrived in Find your Zen from an ad link, which is the one to trust.</p>';

    // Ad fund
    h += '<div class="card adfund"><div class="adfund-top"><div><h3>Ad fund</h3><p class="muted">' + money(f.perTub) + ' from every tub sold since ' + AZ.esc(AZ.date(f.start + 'T12:00:00')) + ', minus what we\'ve spent on ads since then.</p></div>' +
      '<div class="adfund-left ' + (f.left < 0 ? 'neg' : '') + '"><span>Left to spend</span><b>' + money(f.left, true) + '</b></div></div>' +
      '<p class="adfund-line">' + int(f.tubs) + ' tub' + (f.tubs === 1 ? '' : 's') + ' sold = ' + money(f.earned) + ' in · ' + money(f.spent, true) + ' spent</p>' +
      (f.canEdit ? '<details class="adfund-edit"><summary>Change the ad fund</summary><div class="form inline"><label>Per tub sold<input id="adrPer" type="number" min="0" step="50" value="' + f.perTub + '"></label><label>Starting from<input id="adrStart" type="date" value="' + AZ.esc(f.start) + '"></label><button class="btn btn-line btn-sm" type="button" id="adrFundSave">Save</button></div></details>' : '') +
      '</div>';

    // Campaigns
    var camps = (d.campaigns || []).filter(function (c) { return c.effective !== 'ARCHIVED' && c.effective !== 'DELETED'; });
    h += '<h3 class="adr-h">Campaigns</h3>';
    if (!camps.length) h += '<div class="card"><p class="muted">No campaigns yet. Make one in Ads, or in Ads Manager.</p></div>';
    camps.forEach(function (c) {
      var running = c.status === 'ACTIVE';
      h += '<article class="card adcamp" data-camp="' + c.id + '">' +
        '<div class="adcamp-top"><div><h4>' + AZ.esc(c.name) + '</h4>' + state(c.effective) + (c.budget ? ' <span class="muted">' + money(c.budget) + ' a day</span>' : '') + '</div>' +
        '<button class="btn btn-sm ' + (running ? 'btn-line' : 'btn-gold') + '" type="button" data-act="' + (running ? 'pause' : 'resume') + '" data-kind="campaign" data-id="' + c.id + '" data-name="' + AZ.esc(c.name) + '">' + (running ? 'Pause' : 'Turn on') + '</button></div>' +
        '<div class="adcamp-stats"><span><b>' + money(c.spend, true) + '</b> spent</span><span><b>' + int(c.clicks) + '</b> clicks</span><span><b>' + per(c.spend, c.clicks) + '</b> per click</span><span><b>' + int(c.leads) + '</b> leads (Meta)</span></div>';
      (c.adsets || []).forEach(function (x) {
        h += '<div class="adset"><span>Ad set: ' + AZ.esc(x.name) + '</span>' + state(x.effective) +
          (x.budget != null ? '<span class="adbudget">' + money(x.budget) + ' a day <button class="adlink" type="button" data-budget="' + x.id + '" data-now="' + x.budget + '" data-name="' + AZ.esc(x.name) + '">Change</button></span>' : '') + '</div>';
      });
      if ((c.ads || []).length) {
        h += '<div class="tablewrap"><table class="saletable adtable"><thead><tr><th>Ad</th><th>Status</th><th class="num">Spent</th><th class="num">Reached</th><th class="num">Clicks</th><th class="num">Per click</th><th class="num">Seen (avg)</th><th></th></tr></thead><tbody>' +
          c.ads.map(function (a) {
            var on = a.status === 'ACTIVE', tired = a.frequency >= 3.5;
            return '<tr><td>' + AZ.esc(a.name) + '</td><td>' + state(a.effective) + '</td><td class="num">' + money(a.spend, true) + '</td><td class="num">' + int(a.reach) + '</td><td class="num">' + int(a.clicks) + '</td><td class="num">' + per(a.spend, a.clicks) + '</td><td class="num' + (tired ? ' warn' : '') + '" title="' + (tired ? 'People have seen this ad a lot. Time for a fresh one.' : '') + '">' + (a.frequency ? a.frequency.toFixed(1) + 'x' : '-') + '</td>' +
              '<td><button class="adlink" type="button" data-act="' + (on ? 'pause' : 'resume') + '" data-kind="ad" data-id="' + a.id + '" data-name="' + AZ.esc(a.name) + '">' + (on ? 'Pause' : 'Turn on') + '</button></td></tr>';
          }).join('') + '</tbody></table></div>';
      }
      h += '</article>';
    });

    // Leads from ads
    h += '<h3 class="adr-h">Leads from ads</h3><div class="card">';
    h += o.list.length ? '<ul class="adleads">' + o.list.map(function (l) {
      return '<li><b>' + AZ.esc(l.name || 'Someone') + '</b><span>' + AZ.esc(AZ.dateTime(l.when)) + ' · ' + (l.where.indexOf('presentation') === 0 ? 'after the presentation' : 'Find your Zen') + '</span>' + (l.bought ? '<span class="adstate ok">Bought</span>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="muted">No Find your Zen leads from an ad ' + RANGE_NAME[d.range] + ' yet. Ads must link with ?from=fbad to be counted here (the Ad studio does this for you).</p>';
    h += '</div><p class="muted adnote"><a href="' + AZ.esc(d.manager) + '" target="_blank" rel="noopener">Open Ads Manager</a> for targeting, creative and anything not here. Changes you make here show up there right away.</p>';
    box.innerHTML = h;
  }

  function load() {
    $('#adrBody').innerHTML = '<p class="muted">Loading results from Meta...</p>';
    $$('#adrRange .chip').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.range === range ? 'true' : 'false'); });
    AZ.api('ads-stats?range=' + range, null, 'GET').then(function (r) { data = r; render(); })
      .catch(function (e) { data = { error: e.message }; render(); });
  }

  function bind() {
    if (bound) return; bound = true;
    $('#adrRange').addEventListener('click', function (e) { var b = e.target.closest('[data-range]'); if (b) { range = b.dataset.range; load(); } });
    $('#adrRefresh').addEventListener('click', load);
    $('#adrBody').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (b) {
        // Two taps: the first asks, the second does it.
        if (!b.dataset.sure) {
          b.dataset.sure = '1'; b.dataset.was = b.textContent; b.textContent = (b.dataset.act === 'pause' ? 'Tap again to pause' : 'Tap again to turn on');
          setTimeout(function () { if (b.dataset.sure) { delete b.dataset.sure; b.textContent = b.dataset.was; } }, 4000);
          return;
        }
        delete b.dataset.sure; b.disabled = true; b.textContent = 'Saving...';
        AZ.api('ads-control', { kind: b.dataset.kind, id: b.dataset.id, action: b.dataset.act })
          .then(function () { AZ.toast((b.dataset.act === 'pause' ? 'Paused: ' : 'Turned on: ') + b.dataset.name); load(); })
          .catch(function (err) { AZ.toast(err.message); b.disabled = false; b.textContent = b.dataset.was; });
        return;
      }
      var g = e.target.closest('[data-budget]');
      if (g) {
        var v = prompt('New daily budget for "' + g.dataset.name + '" (dollars a day, $5 to $500):', g.dataset.now);
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
