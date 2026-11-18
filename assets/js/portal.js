(function () {
  var $ = function (s) { return document.querySelector(s); };
  var STEPS = [
    ['signed', 'Agreement signed', 'Your signed copy and how to get your spot ready were emailed to you.'],
    ['deposit_paid', 'Deposit received', 'Thank you. Your order is in with AquaSolus.'],
    ['delivery_scheduled', 'Delivery booked', 'Make sure your base, power and access are ready for the day.'],
    ['delivered', 'Delivered', 'Enjoy your Zen Time. Your serial number is on file for warranty.']
  ];
  var ORDER = ['signed', 'deposit_paid', 'delivery_scheduled', 'delivered'];
  function dl(label, v) { return v ? '<div><dt>' + label + '</dt><dd>' + AZ.esc(v) + '</dd></div>' : ''; }

  function render(me, sales) {
    var first = (me.profile.full_name || '').split(' ')[0];
    $('#portalHello').textContent = first ? 'Welcome, ' + first : 'Welcome';
    if (!sales.length) {
      $('#portalBody').innerHTML = '<div class="card"><h2>Nothing here yet</h2><p>Once your agreement is signed, your tub will show up here. Questions? Call or text Shaun at 236-304-4424.</p></div>';
      return;
    }
    $('#portalBody').innerHTML = sales.map(function (s) {
      var kind = s.product_type || 'hot_tub', isSauna = kind === 'sauna', noun = AZ.noun(s);
      var tub = kind === 'hot_tub' ? AZ.tubFor(s.tub_model) : null, pic = AZ.productFor(kind, isSauna ? s.sauna_model : s.tub_model), idx = ORDER.indexOf(s.status);
      var steps = STEPS.map(function (st, i) {
        var state = idx >= i ? 'done' : (idx + 1 === i ? 'next' : '');
        var label = st[0] === 'deposit_paid' && s.payment_type === 'full' ? 'Payment received' : st[1];
        return '<li class="' + state + '"><b>' + label + '</b><span>' + (idx >= i || idx + 1 === i ? st[2] : '') + '</span></li>';
      }).join('');
      return '<article class="card mytub">' +
        '<div class="mytub-top">' +
          (pic ? '<img src="/assets/img/' + pic.img + '.webp" alt="Your ' + AZ.esc(pic.n) + ' ' + noun + '" width="560" height="560">' : '') +
          '<div><p class="eyebrow teal">Your ' + AZ.esc(kind === 'hot_tub' && s.tub_line ? s.tub_line + ' line ' : '') + noun + '</p>' +
          '<h2>' + AZ.esc(isSauna ? 'The ' + (s.sauna_model || 'sauna') : (s.tub_model ? 'The ' + s.tub_model : 'Your purchase')) + '</h2>' +
          (!isSauna && s.sauna_model ? '<p class="muted">Plus the ' + AZ.esc(s.sauna_model) + ' sauna</p>' : '') +
          (tub ? '<p class="muted">Seats ' + AZ.esc(tub.seats) + ' · ' + tub.jets + ' jets · ' + AZ.esc(tub.power) + '</p>' : '') +
          '<dl class="kv">' + (isSauna ? dl('Make', s.sauna_make) + dl('Electrical', s.sauna_electrical) : dl('Shell colour', s.shell_colour) + dl('Siding', s.siding) + dl('Water care', s.water_care) + dl('Cover', s.spa_cover) + dl('Steps', s.steps) + dl('Lifter', s.lifter)) + dl('Serial number', s.serial_number) + dl('Agreement', '#' + s.number) + '</dl>' +
          '<div class="formactions"><button class="btn btn-gold" type="button" data-pdf="' + s.id + '">Download my agreement</button></div></div>' +
        '</div>' +
        '<h3>Where things stand</h3><ol class="steps-v">' + steps + '</ol>' +
        (s.delivery_window || s.delivery_date ? '<h3>Delivery</h3><dl class="kv">' + dl('You asked for', AZ.windowLabel(s.delivery_window)) + dl('Booked for', AZ.dayLabel(s.delivery_date)) + '</dl>' : '') +
        (Number(s.balance) > 0 && !s.balance_paid_at && s.qb_balance_link ? '<h3>Your balance</h3><p class="muted">Your remaining balance of ' + AZ.money(s.balance) + ' is due before delivery, so delivery day is only about getting you soaking.</p><div class="formactions"><a class="btn btn-gold" href="' + AZ.esc(s.qb_balance_link) + '" rel="noopener">Pay my balance</a></div>' : '') +
        (s.status === 'signed' && s.qb_invoice_link && !s.deposit_paid_at ? '<h3>Your ' + (s.payment_type === 'full' ? 'payment' : 'deposit') + '</h3><p class="muted">Paying it confirms your order with AquaSolus so your ' + noun + ' can be built and shipped to us.</p><div class="formactions"><a class="btn btn-gold" href="' + AZ.esc(s.qb_invoice_link) + '" rel="noopener">Pay now</a></div>' : '') +
        '<h3>Getting your spot ready</h3><p class="muted">A solid, level base, a dedicated circuit run by a licensed electrician and a clear path from the street. Getting these right is what makes delivery day smooth and protects your warranty. Not sure about something? Send Shaun a photo of the spot.</p>' +
        '<h3>Questions?</h3><p>Call or text Shaun directly at <b>236-304-4424</b>, or email <b>shaun@aquazen.ca</b>. He answers his own phone.</p>' +
      '</article>';
    }).join('');
    document.querySelectorAll('[data-pdf]').forEach(function (b) {
      b.addEventListener('click', function () {
        AZ.api('agreement-pdf', { sale_id: b.dataset.pdf }).then(function (r) { location.href = r.url; }).catch(function (e) { AZ.toast(e.message); });
      });
    });
  }

  AZ.requireRole(['customer', 'admin', 'staff']).then(function (me) {
    $('#signOut').addEventListener('click', AZ.signOut);
    AZ.sb.from('customers').select('id').eq('user_id', me.user.id).then(function (c) {
      var ids = (c.data || []).map(function (x) { return x.id; });
      if (!ids.length) return render(me, []);
      AZ.sb.from('sales').select('*').in('customer_id', ids).neq('status', 'cancelled').neq('status', 'draft').order('created_at', { ascending: false })
        .then(function (r) { render(me, r.data || []); });
    });
  });
})();
