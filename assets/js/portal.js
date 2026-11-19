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


  // Delivery photos, serial number and service history for each tub.
  var TOPIC = { water: 'Water care', heating: 'Heating or temperature', jets: 'Jets or pumps', leak: 'A leak', controls: 'Controls or error code', cover: 'Cover or lifter', other: 'Something else' };
  function loadDetails(s) {
    AZ.api('portal-details', { sale_id: s.id }).then(function (r) {
      var el = document.querySelector('[data-details="' + s.id + '"]'); if (!el) return;
      var html = '';
      if (r.photos && r.photos.length) html += '<h3>Delivery day</h3><p class="muted">Photos our team took of your ' + AZ.esc(AZ.noun(s)) + ' in place' + (s.serial_number ? ', with serial number <b>' + AZ.esc(s.serial_number) + '</b> on file' : '') + '. They’re kept here for your warranty, so you never have to go looking.</p><div class="deliv-photos">' +
        r.photos.map(function (u) { return '<a href="' + AZ.esc(u) + '" target="_blank" rel="noopener"><img src="' + AZ.esc(u) + '" alt="Your tub on delivery day"></a>'; }).join('') + '</div>';
      if (r.requests && r.requests.length) html += '<h3>Your service requests</h3><ul class="svchist">' + r.requests.map(function (q) {
        return '<li><b>#' + q.number + ' ' + AZ.esc(TOPIC[q.topic] || q.topic) + '</b> <span class="pill ' + (q.status === 'done' ? 'pill-green' : q.status === 'booked' ? 'pill-gold' : '') + '">' + ({ new: 'Received', booked: 'Booked' + (q.booked_for ? ' for ' + AZ.dayLabel(q.booked_for) : ''), done: 'Done' }[q.status]) + '</span><span class="muted small">' + AZ.date(q.created_at) + '</span></li>';
      }).join('') + '</ul>';
      el.innerHTML = html;
    }).catch(function () {});
  }
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { reject(new Error('One of the photos couldn’t be read. Try a JPG or PNG.')); };
      img.src = url;
    });
  }
  function sendService(e) {
    e.preventDefault();
    var f = e.target, m = f.querySelector('.formmsg'), btn = f.querySelector('button[type=submit]');
    if (f.message.value.trim().length < 5) { m.textContent = 'Tell us a little about what’s going on.'; return; }
    var files = Array.prototype.slice.call(f.photos.files || []).slice(0, 4);
    btn.disabled = true; m.textContent = 'Sending...';
    Promise.all(files.map(shrink)).then(function (photos) {
      return AZ.api('service-request', { sale_id: f.dataset.svcform, topic: f.topic.value, message: f.message.value, photos: photos });
    }).then(function (r) {
      f.reset(); m.textContent = 'Sent. Request #' + r.number + ' is in, and Shaun will be in touch within one business day. We emailed you a copy.';
      loadDetails({ id: f.dataset.svcform });
    }).catch(function (err) { m.textContent = err.message; }).finally(function () { btn.disabled = false; });
  }

  // Water care: a few minutes a week keeps the water clear and soft, so the tub stays a place to relax.
  var GUIDE = '<article class="card guide" id="water-care"><p class="eyebrow teal">Water care</p><h2>Clear, soft water in a few minutes a week</h2>' +
    '<p class="muted">Your AquaSolus cleans the water for you all day: every drop runs through the filter and the double ozonator, ozone then UV, again and again. Your part is a quick check each week, so the water stays clear, soft and comfortable on your skin, and your time in the tub is just for relaxing.</p>' +
    '<div class="guide-cols">' +
      '<div><h3>Every time you soak</h3><ul><li>Rinse off first. Lotions, makeup and deodorant are what cloud water fastest.</li><li>Afterwards, add 1 teaspoon of chlorine granules with the jets running. Your double ozonator does the rest, so that\u2019s all the sanitizer you need.</li><li>Put the cover back on and lock it. It keeps heat in, leaves and rain out, and little ones safe.</li></ul></div>' +
      '<div><h3>Once a week</h3><ul><li>Test the water with a strip and adjust sanitizer and pH so they sit in the ranges on your test kit. Balanced water is gentle on skin and protects the equipment.</li><li>Rinse the filter. A clean filter lets the water move freely, which is what keeps it clear.</li><li>Wipe the waterline so nothing builds up.</li></ul></div>' +
      '<div><h3>Every month</h3><ul><li>Check calcium hardness. Our soft water needs a little help to stay gentle on the heater and jets.</li><li>Check the water level. Keep it above the highest jets.</li></ul></div>' +
      '<div><h3>Every few months</h3><ul><li>Drain and refill with fresh water, and give the filter a deep clean.</li><li>Clean and condition the cover so it stays light and keeps sealing well.</li></ul></div>' +
    '</div><div class="formactions"><a class="btn btn-gold" href="/assets/docs/aquazen-owners-manual.pdf" target="_blank" rel="noopener">Owner\u2019s manual</a><a class="btn btn-line" href="/assets/docs/aquazen-pre-delivery-guide.pdf" target="_blank" rel="noopener">Pre-delivery guide</a></div>' +
    '<p class="muted small">Not sure what a test result means? Snap a photo of the strip next to the bottle and send it with a service request. We’re happy to help.</p></article>';

  var FAQS = [
    ['How hot should I keep it?', 'Most people love it somewhere between 100 and 104°F. Start around 100 and nudge it up until it feels right. Keeping it at the same temperature all the time is more efficient than heating it up for each soak.'],
    ['Should I leave it running all the time?', 'Yes. Your tub filters and heats on its own schedule, and with the cover on and AQ10 insulation keeping 100% of the water insulated, it isn’t working hard to do it. Turning it off and reheating uses more power, not less.'],
    ['The water looks cloudy. What do I do?', 'Test it first. Cloudy water usually means the sanitizer is low or the filter needs a rinse. Rinse the filter, adjust the water to your test kit’s ranges and run the jets for a bit. If it doesn’t clear in a day, send us a service request.'],
    ['How often should I change the water?', 'About every three to four months is a good rhythm, sooner if the tub gets a lot of use or the water starts to feel tired. Fresh water is the easiest way to keep things simple.'],
    ['The power went out, or the breaker tripped.', 'Reset the breaker or the GFCI at the disconnect. If it trips again right away, leave it off and send us a service request or call. That’s your tub telling us something needs a look. In cold weather, keep the cover on tight to hold the heat in.'],
    ['There’s a code on the control panel.', 'Write it down or take a photo, then send a service request with the code. Most codes are simple, like a low water level or a filter that needs a rinse, and the code tells us exactly where to look.'],
    ['How do I make a warranty claim?', 'Send a service request. Your serial number and delivery photos are already on file, so you don’t need to find anything. We’ll take it from there.'],
    ['Can I use my own chemicals?', 'Hot tub chemicals only, never pool chemicals, and chlorine, not bromine. We don\u2019t recommend bromine in our tubs. Add one thing at a time with the jets running. If you’re not sure about a product, ask us first. It’s an easy way to protect your warranty.']
  ];
  var FAQ = '<article class="card faq" id="faq"><p class="eyebrow teal">Questions</p><h2>What new owners ask most</h2>' +
    FAQS.map(function (q) { return '<details><summary>' + q[0] + '</summary><p>' + q[1] + '</p></details>'; }).join('') +
    '<p class="muted small">Still wondering about something? Call or text Shaun at 236-304-4424.</p></article>';

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
          (pic ? '<img src="/assets/img/' + (pic.top || pic.img) + '.webp" alt="Your ' + AZ.esc(pic.n) + ' ' + noun + '" width="560" height="560">' : '') +
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
        '<div data-details="' + s.id + '"></div>' +
        '<h3>Need service?</h3><p class="muted">Something not quite right? Tell us here and it comes straight to Shaun. The sooner we hear about something, the smaller it usually is.</p>' +
        '<form class="form svcform" data-svcform="' + s.id + '" novalidate><div class="grid2">' +
          '<label>What\u2019s it about?<select name="topic"><option value="water">Water care</option><option value="heating">Heating or temperature</option><option value="jets">Jets or pumps</option><option value="leak">A leak</option><option value="controls">Controls or an error code</option><option value="cover">Cover or lifter</option><option value="other" selected>Something else</option></select></label>' +
          '<label>Photos <span class="opt">(optional, up to 4)</span><input type="file" name="photos" accept="image/*" multiple></label>' +
          '<label class="span2">Tell us what\u2019s going on<textarea name="message" rows="4" placeholder="What are you noticing, and when did it start? If there\u2019s a code on the control panel, include it."></textarea></label></div>' +
          '<div class="formactions"><button class="btn btn-gold" type="submit">Send to Shaun</button><p class="formmsg" role="status" aria-live="polite"></p></div></form>' +
        (s.status !== 'delivered' ? '<h3>Getting your spot ready</h3><p class="muted">A solid, level base, a dedicated circuit run by a licensed electrician and a clear path from the street. Getting these right is what makes delivery day smooth and protects your warranty. Not sure about something? Send Shaun a photo of the spot.</p>' : '') +
        '<h3>Questions?</h3><p>Call or text Shaun directly at <b>236-304-4424</b>, or email <b>shaun@aquazen.ca</b>. He answers his own phone.</p>' +
      '</article>';
    }).join('') + GUIDE + FAQ;
    sales.forEach(loadDetails);
    document.querySelectorAll('[data-svcform]').forEach(function (f) { f.addEventListener('submit', sendService); });
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
