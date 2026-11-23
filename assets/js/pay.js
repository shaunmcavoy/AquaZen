/* Pay page: /pay/?t=<pay_token>. Opens Helcim's secure card form (HelcimPay.js) for whatever is owing now.
   The amount comes from the server, never from this page. On SUCCESS the result goes back to the server,
   which checks the transaction with Helcim before marking anything paid. */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var t = new URLSearchParams(location.search).get('t') || '';
  var info = null, busy = false;

  function show(id) { ['#payLoading', '#payError', '#payCard', '#payDeclined', '#payDone'].forEach(function (s) { $(s).hidden = s !== id; }); }
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

  if (!t) return err('This payment link is missing its code. Please use the link from your email.');

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
      ? 'This is your remaining balance. Paying it before delivery means delivery day is only about getting you soaking.'
      : 'This is ' + info.due.label + '. Paying it confirms your order with AquaSolus so your ' + (info.what || 'hot tub') + ' can be built and shipped to us.';
    $('#payGo').textContent = 'Pay ' + AZ.money(info.due.amount) + ' by card';
    show('#payCard');
  }).catch(function () { err('We couldn\'t reach the server. Please check your connection and try again.'); });

  function open() {
    if (busy) return;
    busy = true;
    var btn = $('#payGo'); btn.disabled = true;
    $('#payMsg').textContent = 'Opening the secure card form...';
    show('#payCard');
    post({ action: 'start' }).then(function (r) {
      var token = r.checkout_token, key = 'helcim-pay-js-' + token;
      function onMsg(ev) {
        if (!ev.data || ev.data.eventName !== key) return;
        var status = ev.data.eventStatus, message = ev.data.eventMessage;
        if (status === 'SUCCESS') {
          window.removeEventListener('message', onMsg);
          closeFrame();
          $('#payMsg').textContent = 'Confirming your payment...';
          post({ action: 'confirm', checkout_token: token, message: message })
            .then(function () { done('We\'ve received your ' + AZ.money(r.amount) + (r.kind === 'balance' ? ' balance' : ' payment') + '. ' + (r.kind === 'balance' ? 'Your ' + info.what + ' is paid in full.' : 'Your ' + info.what + ' is on its way to being ordered.')); })
            .catch(function (e) { $('#payMsg').textContent = e.message; busy = false; btn.disabled = false; });
        } else if (status === 'ABORTED') {
          window.removeEventListener('message', onMsg);
          closeFrame();
          post({ action: 'declined', checkout_token: token, message: message }).catch(function () { /* still show the customer what to do */ });
          busy = false; btn.disabled = false; $('#payMsg').textContent = '';
          show('#payDeclined');
        } else if (status === 'HIDE') {
          window.removeEventListener('message', onMsg);
          busy = false; btn.disabled = false; $('#payMsg').textContent = '';
        }
      }
      window.addEventListener('message', onMsg);
      if (typeof window.appendHelcimPayIframe !== 'function') throw new Error('The secure card form didn\'t load. Please refresh the page and try again.');
      window.appendHelcimPayIframe(token, true);
      $('#payMsg').textContent = '';
    }).catch(function (e) {
      busy = false; btn.disabled = false;
      if (e.data && e.data.nothing_due) return done('There\'s nothing to pay on this agreement right now.');
      $('#payMsg').textContent = e.message;
    });
  }
  function closeFrame() { var f = document.getElementById('helcimPayIframe'); if (f) f.remove(); }

  $('#payGo').addEventListener('click', open);
  $('#payRetry').addEventListener('click', open);
})();
