/* Pay page: /pay/?t=<pay_token>. Sends the customer to Stripe's secure payment page for whatever is owing now.
   The amount comes from the server, never from this page. Stripe sends them back here with ?s=<session>, and the
   server checks the payment with Stripe before marking anything paid (a webhook does the same if they never come back). */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var q = new URLSearchParams(location.search);
  var t = q.get('t') || '', back = q.get('s') || '';
  var info = null, busy = false;

  function show(id) { ['#payLoading', '#payError', '#payCard', '#payDone'].forEach(function (s) { $(s).hidden = s !== id; }); }
  function err(m) { $('#payError').innerHTML = '<p>' + AZ.esc(m) + '</p><p>Call or text Shaun at 236-304-4424.</p>'; show('#payError'); }
  function post(body) {
    return fetch(AZ.FN + 'pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ t: t }, body)) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || 'Something went wrong. Please try again.'); e.data = d; throw e; } return d; }); });
  }
  function done(text) {
    $('#payTitle').textContent = 'Thank you';
    $('#payLead').textContent = 'Your payment was successful.';
    $('#payDoneText').textContent = text;
    show('#payDone');
  }
  function paidText(kind, amount, what) {
    return 'We\'ve received your ' + AZ.money(amount) + (kind === 'balance' ? ' balance' : ' payment') + '. ' + (kind === 'balance' ? 'Your ' + (what || 'hot tub') + ' is paid in full.' : 'Your ' + (what || 'hot tub') + ' is on its way to being ordered.');
  }

  if (!t) return err('This payment link is missing its code. Please use the link from your email.');

  // Back from Stripe: confirm the payment first.
  if (back) {
    $('#payLead').textContent = 'Confirming your payment...';
    post({ action: 'confirm', session_id: back })
      .then(function (r) {
        history.replaceState(null, '', '/pay/?t=' + encodeURIComponent(t));
        return fetch(AZ.FN + 'pay?t=' + encodeURIComponent(t)).then(function (x) { return x.json(); }).then(function (d) { done(paidText(r.kind, r.amount, d.what)); });
      })
      .catch(function (e) { err(e.message); });
    return;
  }

  fetch(AZ.FN + 'pay?t=' + encodeURIComponent(t)).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (res) {
    if (!res.ok) return err(res.d.error || 'We couldn\'t load this payment.');
    info = res.d;
    $('#payTitle').textContent = 'Agreement #' + info.number;
    if (!info.due) {
      $('#payLead').textContent = info.first_name ? 'Thanks, ' + info.first_name + '.' : 'Thanks.';
      return done('There\'s nothing to pay on this agreement right now. If you think that\'s wrong, call or text Shaun at 236-304-4424.');
    }
    $('#payLead').textContent = (info.first_name ? 'Hi ' + info.first_name + '. ' : '') + 'Pay securely by card, right here on your own device.';
    $('#payWhat').textContent = (info.due.kind === 'balance' ? 'Balance for your ' : 'For your ') + info.what;
    $('#payAmount').textContent = AZ.money(info.due.amount);
    $('#payWhy').textContent = info.due.kind === 'balance'
      ? 'This is your remaining balance. Paying it two weeks before delivery means delivery day is only about getting you soaking.'
      : 'This is ' + info.due.label + '. Paying it confirms your order with AquaSolus so your ' + (info.what || 'hot tub') + ' can be built and shipped to us.';
    $('#payGo').textContent = 'Pay ' + AZ.money(info.due.amount) + ' by card';
    show('#payCard');
  }).catch(function () { err('We couldn\'t reach the server. Please check your connection and try again.'); });

  $('#payGo').addEventListener('click', function () {
    if (busy) return;
    busy = true;
    var btn = $('#payGo'); btn.disabled = true;
    $('#payMsg').textContent = 'Opening the secure payment page...';
    post({ action: 'start' }).then(function (r) { location.href = r.url; }).catch(function (e) {
      busy = false; btn.disabled = false;
      if (e.data && e.data.nothing_due) return done('There\'s nothing to pay on this agreement right now.');
      $('#payMsg').textContent = e.message;
    });
  });
  // Coming back with the browser's back button: let them press Pay again.
  window.addEventListener('pageshow', function (e) { if (e.persisted) { busy = false; $('#payGo').disabled = false; $('#payMsg').textContent = ''; } });
})();
