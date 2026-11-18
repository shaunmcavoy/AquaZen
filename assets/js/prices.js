/* MSRP and Zen price on model pages and cards. Prices come live from the back office and only
   show when an admin has switched website prices on in Products. */
(function () {
  var slots = Array.prototype.slice.call(document.querySelectorAll('[data-price]'));
  if (!slots.length || !window.fetch) return;
  var URL_ = 'https://zfqzajshbjfmflbttabq.supabase.co', KEY = 'sb_publishable_Eao54p2Rys-aF9nmwptL1Q_w8vkQsLz';
  var fmt = function (n) { return '$' + Math.round(n).toLocaleString('en-CA'); };
  fetch(URL_ + '/rest/v1/rpc/public_prices', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: '{}' })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) {
      var by = {}; (rows || []).forEach(function (r) { by[r.key] = r; });
      slots.forEach(function (el) {
        var p = by[el.getAttribute('data-price')]; if (!p || !p.zen_price) return;
        var save = p.msrp && p.msrp > p.zen_price ? p.msrp - p.zen_price : 0;
        el.innerHTML = (save ? '<span class="zp-msrp">MSRP <s>' + fmt(p.msrp) + '</s></span>' : '') +
          '<span class="zp-zen">Zen price ' + fmt(p.zen_price) + '</span>' +
          (save ? '<span class="zp-save">You save ' + fmt(save) + '</span>' : '');
        el.hidden = false;
      });
    })
    .catch(function () {});
})();
