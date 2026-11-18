(function () {
  var $ = function (s) { return document.querySelector(s); };
  var t = new URLSearchParams(location.search).get('t') || '';
  var pad = null, kindNoun = 'hot tub';
  function row(label, value) { return value ? '<div><dt>' + label + '</dt><dd>' + AZ.esc(value) + '</dd></div>' : ''; }
  function err(m) { $('#signLoading').hidden = true; var e = $('#signError'); e.innerHTML = '<p>' + AZ.esc(m) + '</p><p>Call or text Shaun at 236-304-4424.</p>'; e.hidden = false; }
  if (!t) return err('This signing link is missing its code. Please use the link from your email.');

  fetch(AZ.FN + 'signing?t=' + encodeURIComponent(t)).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (res) {
    if (!res.ok) return err(res.d.error || 'We couldn\'t load this agreement.');
    var a = res.d, c = a.customer, kind = a.product_type || 'hot_tub', isSauna = kind === 'sauna', noun = AZ.noun(a); kindNoun = noun;
    var pic = AZ.productFor(kind, isSauna ? a.sauna_model : a.tub_model);
    $('#signTitle').textContent = 'Agreement #' + a.number;
    var photo = pic ? '<img class="signphoto" src="/assets/img/' + pic.img + '.webp" alt="The ' + AZ.esc(pic.n) + ' ' + noun + '" width="560" height="560">' : '';
    var sub = Number(a.hot_tub_value) + Number(a.sauna_total) + Number(a.extras_total || 0) + Number(a.delivery_fee);
    var ex = Array.isArray(a.extras) ? a.extras : [], save = Number(a.msrp) > Number(a.hot_tub_value) && !isSauna ? Number(a.msrp) - Number(a.hot_tub_value) : 0;
    $('#agreement').innerHTML =
      '<div class="card agree">' + photo +
      '<h2>' + AZ.esc([!isSauna && a.tub_model && ((a.tub_make ? a.tub_make + ' ' : '') + a.tub_model + ' ' + noun), a.sauna_model && ((isSauna && a.sauna_make ? a.sauna_make + ' ' : '') + a.sauna_model + ' sauna')].filter(Boolean).join(' and ')) + '</h2>' +
      '<p class="muted">Prepared by ' + AZ.esc(a.rep_name) + ' on ' + AZ.esc(a.sale_date) + '</p>' +
      '<h3>Your details</h3><dl class="kv">' + row('Name', c.name) + row('Address', [c.address, c.city_pc].filter(Boolean).join(', ')) + row('Cell', c.cell) + row('Email', c.email) + '</dl>' +
      (!isSauna && a.tub_model ? '<h3>' + AZ.cap(noun) + '</h3><dl class="kv">' + row('Make', a.tub_make) + row('Model', a.tub_model) + row('Shell colour', a.shell_colour) + row('Siding', a.siding) + row('Water care', a.water_care) + row('Stereo', a.stereo) + row('Starter kit', a.starter_kit) + row('Steps', a.steps) + row('Lifter', a.lifter) + row('Cover', a.spa_cover) + row('Other', a.other) + row('Delivery notes', a.est_delivery) + '</dl>' : '') +
      (a.sauna_model ? '<h3>Sauna</h3><dl class="kv">' + row('Make', a.sauna_make) + row('Model', a.sauna_model) + row('Electrical', a.sauna_electrical) + (isSauna ? row('Other', a.other) + row('Delivery notes', a.est_delivery) : '') + '</dl>' : '') +
      (a.notes ? '<h3>Notes</h3><p>' + AZ.esc(a.notes) + '</p>' : '') +
      '<h3>Price</h3>' + (save ? '<p class="zenprice">MSRP <s>' + AZ.money(a.msrp) + '</s> &nbsp; Your Zen price <b>' + AZ.money(a.hot_tub_value) + '</b> &nbsp; You save <b>' + AZ.money(save) + '</b></p>' : '') + '<dl class="sums">' +
      [[AZ.cap(isSauna ? 'sauna' : noun), isSauna ? a.sauna_total : a.hot_tub_value], [isSauna ? '' : 'Sauna', isSauna ? 0 : a.sauna_total]].concat(ex.map(function (x) { return [AZ.esc(x.name), x.price]; })).concat([['Delivery', a.delivery_fee], ['Subtotal', sub], [Number(a.tax_rate) === 0.12 ? 'GST 5% + PST 7%' : 'Tax (' + Math.round(a.tax_rate * 100) + '%)', a.tax], ['Total', a.total, 1], [a.payment_type === 'full' ? 'Paid in full on signing' : 'Paid online on signing', a.deposit], ['Balance ' + ({ cash: 'paid in cash', cheque: 'paid by cheque', financing: 'through financing' }[a.balance_method] || 'due before delivery'), a.balance, 1]])
        .filter(function (r) { return r[2] || Number(r[1]) > 0 || r[0] === 'Subtotal'; })
        .map(function (r) { return '<div' + (r[2] ? ' class="strong"' : '') + '><dt>' + r[0] + '</dt><dd>' + AZ.money(r[1]) + '</dd></div>'; }).join('') + '</dl>' +
      '<p class="muted small">Payment ' + ({ card: 'by credit card', bank: 'by bank transfer' }[a.pay_methods] || 'by card or bank transfer') + ' through a secure QuickBooks link, sent to you once you sign.</p>' +
      '<h3>Terms</h3><p class="terms">' + AZ.esc(a.terms.delivery_terms) + '</p><p class="terms">' + AZ.esc(a.terms.purchase_terms) + '</p></div>';
    $('#signLoading').hidden = true; $('#agreement').hidden = false; $('#signForm').hidden = false;
    $('#typedName').value = c.name || '';
    // Delivery window: ASAP or a two-week window.
    $('#delWin').insertAdjacentHTML('beforeend', (a.windows || []).map(function (w, i) {
      var asap = w.value === 'asap';
      return '<label><input type="radio" name="delwin" value="' + AZ.esc(w.value) + '"' + (a.delivery_window === w.value ? ' checked' : '') + '><span>' + AZ.esc(asap ? 'As soon as possible' : w.label) +
        '<small>' + (asap ? 'Under two weeks, if your base and power are ready' : 'Shaun will call to set the exact day') + '</small></span></label>';
    }).join(''));
    pad = AZ.signaturePad($('#custSig'));
  }).catch(function () { err('We couldn\'t reach the server. Check your connection and refresh.'); });

  $('#custSigClear').addEventListener('click', function () { pad && pad.clear(); });
  $('#signForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var m = $('#signForm .formmsg'), name = $('#typedName').value.trim();
    var win = $('input[name=delwin]:checked');
    if (!win) { m.textContent = 'Please choose when you\'d like your delivery.'; $('#delWin').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (!$('#agree').checked) { m.textContent = 'Please tick the box to confirm you agree.'; return; }
    if (name.length < 2) { m.textContent = 'Please type your full name.'; return; }
    if (!pad || pad.isEmpty()) { m.textContent = 'Please draw your signature in the box.'; return; }
    var b = $('#signForm button[type=submit]'); b.disabled = true; m.textContent = 'Signing...';
    fetch(AZ.FN + 'signing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: t, agree: true, typed_name: name, signature: pad.toDataURL(), delivery_window: win.value }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { m.textContent = res.d.error || 'Something went wrong.'; b.disabled = false; return; }
        $('#agreement').hidden = true; $('#signForm').hidden = true; $('#signDone').hidden = false;
        var d = res.d;
        if (d.window) $('#doneWin').textContent = 'Your delivery window: ' + d.window + '. Shaun will call to set the exact day.';
        if (d.pay_link) {
          $('#payWhy').textContent = (d.full
            ? 'Your total of ' + AZ.money(d.amount) + ' is paid in full, as we agreed. Paying it now confirms your order with AquaSolus so your ' + kindNoun + ' can be built and shipped to us, and there\'s nothing left to pay on delivery day.'
            : 'Your deposit of ' + AZ.money(d.amount) + ', as we agreed, confirms your order with AquaSolus so it can be built and shipped to us. Your remaining balance of ' + AZ.money(d.balance) + ' is due before delivery.') +
            ' You can pay ' + d.how + '.';
          $('#payBtn').href = d.pay_link; $('#payBtn').textContent = d.pay_label + ' now';
          $('#payNow').hidden = false;
        }
        $('#signTitle').textContent = 'Signed. Thank you.'; window.scrollTo(0, 0);
      })
      .catch(function () { m.textContent = 'We couldn\'t reach the server. Please try again.'; b.disabled = false; });
  });
})();
