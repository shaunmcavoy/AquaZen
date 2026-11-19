(function () {
  var sb = AZ.sb, me = null, current = null, filter = 'open', pad = null;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var form = $('#saleForm');
  var CUST = ['name', 'email', 'cell', 'heard_about', 'address', 'city_pc'];
  // Product fields (category, model, make, electrical, prices) are handled by the product picker below.
  var SALE = ['sale_date', 'est_delivery', 'shell_colour', 'siding', 'water_care', 'stereo', 'starter_kit', 'steps', 'lifter', 'spa_cover', 'other', 'notes', 'payment_type', 'pay_methods', 'balance_method'];
  var WATER = ['shell_colour', 'siding', 'water_care', 'stereo', 'starter_kit', 'steps', 'lifter', 'spa_cover'];
  var MONEY = ['delivery_fee', 'deposit'];
  var TAX = 0.12; // BC: GST 5% + PST 7%

  // ---------- Product picker: category first, then the models in it ----------
  var P = window.AZ_PRODUCTS || {};
  var prodType = $('#prodType'), prodModel = $('#prodModel'), prodOther = $('#prodModelOther'), prodMake = $('#prodMake');
  var addonModel = $('#addonModel'), addonOther = $('#addonModelOther'), addonMake = $('#addonMake');
  function modelOptions(type, none) {
    var cat = P[type]; if (!cat) return '';
    return '<option value="">' + none + '</option>' + cat.groups.map(function (g) {
      var o = g.items.map(function (it) { return '<option value="' + AZ.esc(it.n) + '">' + AZ.esc(it.n) + '</option>'; }).join('');
      return g.name ? '<optgroup label="' + AZ.esc(g.name) + '">' + o + '</optgroup>' : o;
    }).join('') + '<option value="__other">Other model (type it in)...</option>';
  }
  function setModelSel(sel, other, v) {
    var listed = !v || !!$('option[value="' + CSS.escape(v) + '"]', sel);
    sel.value = listed ? (v || '') : '__other';
    other.hidden = listed; other.value = listed ? '' : v;
  }
  function modelVal(sel, other) { return sel.value === '__other' ? (other.value.trim() || null) : (sel.value || null); }
  function applyType(keepModel) {
    var t = prodType.value, cat = P[t] || {}, sauna = t === 'sauna';
    var prev = keepModel ? modelVal(prodModel, prodOther) : null;
    prodModel.innerHTML = modelOptions(t, 'Choose a ' + AZ.NOUN[t] + '...');
    setModelSel(prodModel, prodOther, prev);
    if (!keepModel || !prodMake.value) prodMake.value = cat.make || '';
    $$('#saleForm .water').forEach(function (l) { l.hidden = sauna; });
    $$('#saleForm .saunaonly').forEach(function (l) { l.hidden = !sauna; });
    $('#addonCard').hidden = true; // AquaZen doesn't sell saunas
    $('#mainPriceLabel .lbl').textContent = sauna ? 'Sauna price' : AZ.cap(AZ.NOUN[t]) + ' value';
    $('#addonPriceLabel').hidden = true;
    sums();
  }
  addonModel.innerHTML = modelOptions('sauna', 'No sauna');
  prodType.addEventListener('change', function () { applyType(false); });
  [[prodModel, prodOther], [addonModel, addonOther]].forEach(function (p) {
    p[0].addEventListener('change', function () { p[1].hidden = p[0].value !== '__other'; if (!p[1].hidden) p[1].focus(); });
  });
  addonModel.addEventListener('change', function () { if (addonModel.value && !addonMake.value) addonMake.value = ''; });

  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function sums() {
    var tub = num(form.hot_tub_value.value), sauna = prodType.value === 'sauna' ? 0 : num(form.sauna_total.value), del = num(form.delivery_fee.value), ex = extrasTotal();
    var sub = tub + sauna + ex + del, tax = Math.round(sub * TAX * 100) / 100, tot = Math.round((sub + tax) * 100) / 100;
    var full = form.payment_type.value === 'full';
    // Paid in full: the amount due on signing is the whole total, so the deposit box follows it.
    if (full) form.deposit.value = tot ? tot.toFixed(2) : '';
    form.deposit.readOnly = full;
    form.deposit.closest('label').firstChild.textContent = full ? 'Amount due on signing' : 'Paid online on signing';
    $('#balanceMethodLabel').hidden = full;
    var dep = num(form.deposit.value);
    $('#sums').innerHTML = [['Products', tub + sauna]].concat(ex ? [['Add-ons', ex]] : []).concat([['Delivery', del], ['Subtotal', sub], ['GST 5% + PST 7%', tax], ['Total', tot, 1], [full ? 'Paid in full' : 'Paid online on signing', dep], ['Balance' + (full ? '' : ' (' + ({ cash: 'cash', cheque: 'cheque', financing: 'financing' }[form.balance_method.value] || 'before delivery') + ')'), tot - dep, 1]])
      .map(function (r) { return '<div' + (r[2] ? ' class="strong"' : '') + '><dt>' + r[0] + '</dt><dd>' + AZ.money(r[1]) + '</dd></div>'; }).join('');
    deal();
  }
  MONEY.forEach(function (k) { form[k].addEventListener('input', sums); });
  form.payment_type.addEventListener('change', sums);
  ['hot_tub_value', 'sauna_total'].forEach(function (k) { form[k].addEventListener('input', sums); });
  form.balance_method.addEventListener('change', sums);


  // ---------- Deal builder: add-ons, MSRP and Zen price, GP and commission, the hidden floor ----------
  // Salespeople only ever get sales cost (true cost + pad) through sales_catalogue()/sales_addons().
  var cat = null, extrasCat = [], dealSet = { commission_pct: 25 }, floorAt = null, floorTimer = null, snap = null;
  var isDelivery = function (a) { return /deliver/i.test(a.name); };
  function loadDealData() {
    if (cat) return Promise.resolve();
    return Promise.all([sb.rpc('sales_catalogue'), sb.rpc('sales_addons'), sb.rpc('pricing_settings')]).then(function (r) {
      cat = r[0].data || []; extrasCat = r[1].data || []; if (r[2].data) dealSet = r[2].data;
    });
  }
  function catItem() {
    var m = (modelVal(prodModel, prodOther) || '').toLowerCase();
    return (cat || []).filter(function (c) { return c.product_type === prodType.value && c.model.toLowerCase() === m; })[0] || null;
  }
  // Add-ons, delivery included, are all extras on the sale. Each can be at its regular price, discounted, or included free.
  // Older sales kept delivery in delivery_fee; those are shown as the Delivery add-on and moved over on the next save.
  function drawExtras(saved, legacyDelivery) {
    var by = {}; (saved || []).forEach(function (x) { by[x.id] = x; });
    var list = extrasCat.slice();
    (saved || []).forEach(function (x) { if (!list.some(function (a) { return a.id === x.id; })) list.push({ id: x.id, name: x.name, sale_price: x.list != null ? x.list : x.price, sales_cost: 0 }); });
    $('#extrasList').innerHTML = list.length ? list.map(function (a) {
      var legacy = isDelivery(a) && !by[a.id] && legacyDelivery > 0;
      var on = !!by[a.id] || legacy, price = by[a.id] ? by[a.id].price : legacy ? legacyDelivery : a.sale_price;
      return '<div class="extra' + (on ? ' on' : '') + '" data-xrow="' + a.id + '" data-list="' + (a.sale_price == null ? '' : a.sale_price) + '">' +
        '<label class="xpick"><input type="checkbox" data-x="' + a.id + '"' + (on ? ' checked' : '') + '><span class="xname">' + AZ.esc(a.name) + '</span></label>' +
        '<span class="xprice">$<input type="number" min="0" step="0.01" inputmode="decimal" data-xp="' + a.id + '" value="' + (price == null ? '' : price) + '" aria-label="Price for ' + AZ.esc(a.name) + '"></span>' +
        '<button type="button" class="xfree" data-xfree="' + a.id + '">Included</button>' +
        '<span class="xnote"></span></div>';
    }).join('') : '<p class="muted small">No add-ons set up yet. An admin can add them in Products.</p>';
    $$('#extrasList .extra').forEach(noteFor);
    var hasDel = extrasCat.some(isDelivery);
    form.delivery_fee.closest('label').hidden = hasDel;
    if (hasDel) form.delivery_fee.value = '';
  }
  // Under each add-on: "Included" when it's free, or the regular price when it's discounted.
  function noteFor(row) {
    var list = num(row.dataset.list), p = row.querySelector('[data-xp]'), on = row.querySelector('[data-x]').checked, v = p.value.trim() === '' ? list : num(p.value);
    var note = row.querySelector('.xnote');
    note.textContent = !on ? (list ? 'Regular ' + AZ.money(list) : '') : v === 0 ? 'Included at no charge' + (list ? ' (a ' + AZ.money(list) + ' value)' : '') : list && v < list ? 'Discounted from ' + AZ.money(list) : '';
    row.classList.toggle('free', on && v === 0);
  }
  function extraFor(id) { return extrasCat.filter(function (a) { return a.id === id; })[0]; }
  function chosenExtras() {
    return $$('#extrasList input[data-x]').filter(function (c) { return c.checked; }).map(function (c) {
      var row = c.closest('.extra'), a = extraFor(c.dataset.x) || { id: c.dataset.x, name: row.querySelector('.xname').textContent, sales_cost: 0 };
      return { id: a.id, name: a.name, price: num(row.querySelector('[data-xp]').value), sales_cost: num(a.sales_cost) };
    });
  }
  function extrasTotal() { return chosenExtras().reduce(function (t, x) { return t + x.price; }, 0); }
  $('#extrasList').addEventListener('change', function (e) {
    var row = e.target.closest('.extra'); if (!row) return;
    var box = row.querySelector('[data-x]');
    if (e.target.dataset.xp && !box.checked) box.checked = true;
    if (e.target.dataset.x && box.checked && row.querySelector('[data-xp]').value.trim() === '') row.querySelector('[data-xp]').value = row.dataset.list;
    row.classList.toggle('on', box.checked); noteFor(row); sums();
  });
  $('#extrasList').addEventListener('input', function (e) { var row = e.target.closest('.extra'); if (row && e.target.dataset.xp) { noteFor(row); sums(); } });
  $('#extrasList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-xfree]'); if (!b) return;
    var row = b.closest('.extra'), box = row.querySelector('[data-x]'), p = row.querySelector('[data-xp]');
    if (box.checked && num(p.value) === 0) { p.value = row.dataset.list; } else { box.checked = true; p.value = 0; }
    row.classList.toggle('on', box.checked); noteFor(row); sums();
  });
  function dealPrice() {
    var c = catItem(), el = $('#dealPrice');
    if (!c || (!c.msrp && !c.zen_price)) { el.hidden = true; return; }
    var save = c.msrp && c.zen_price ? c.msrp - c.zen_price : 0;
    el.innerHTML = (c.msrp ? '<span>MSRP <b>' + AZ.money(c.msrp) + '</b></span>' : '') + (c.zen_price ? '<span>Zen price <b>' + AZ.money(c.zen_price) + '</b></span>' : '') + (save > 0 ? '<span>They save <b>' + AZ.money(save) + '</b></span>' : '') +
      (c.zen_price && num(form.hot_tub_value.value) !== +c.zen_price && !form.hot_tub_value.disabled ? '<button type="button" class="linkbtn" id="useZen">Use the Zen price</button>' : '');
    el.hidden = false;
  }
  $('#dealPrice').addEventListener('click', function (e) { if (e.target.id === 'useZen') { var c = catItem(); if (c) { form.hot_tub_value.value = c.zen_price; sums(); checkFloor(); } } });
  function checkFloor() {
    clearTimeout(floorTimer);
    var model = modelVal(prodModel, prodOther), price = num(form.hot_tub_value.value);
    if (!model || !price || form.hot_tub_value.disabled) { floorAt = null; showFloor(); return; }
    floorTimer = setTimeout(function () {
      sb.rpc('price_floor', { p_type: prodType.value, p_model: model, p_price: price }).then(function (r) { floorAt = r.data || null; showFloor(); });
    }, 350);
  }
  function showFloor() {
    var w = $('#floorWarn'), admin = me && me.profile.role === 'admin';
    if (floorAt) {
      w.innerHTML = 'That’s below what we can sell the ' + AZ.esc(modelVal(prodModel, prodOther)) + ' for. The lowest price is <b>' + AZ.money(floorAt) + '</b>.' + (admin ? ' As an admin you can still save it.' : '');
      w.hidden = false;
    } else w.hidden = true;
    $('#saveBtn').disabled = !!floorAt && !admin;
  }
  function deal() {
    var p = $('#dealPanel'); if (!p || !cat) return;
    if (current && current.status && current.status !== 'draft') { drawSnap(); return; }
    var c = catItem(), price = num(form.hot_tub_value.value);
    dealPrice();
    if (!c || !price) { p.hidden = true; return; }
    var ex = chosenExtras(), rev = price, sc = num(c.sales_cost);
    ex.forEach(function (x) { rev += x.price; sc += x.sales_cost; });
    // No commission when an admin is the salesperson on the deal (the database does the same).
    var selfSold = me && me.profile.role === 'admin' && (!current || !current.salesperson_id || current.salesperson_id === me.user.id);
    var gp = rev - sc, comm = gp > 0 && !selfSold ? gp * dealSet.commission_pct / 100 : 0;
    var html = '<div><span>Deal GP</span><b class="' + (gp < 0 ? 'neg' : '') + '">' + AZ.money(gp) + '</b><small>' + (rev ? (Math.round(gp / rev * 1000) / 10) + '% of ' + AZ.money(rev) : '') + '</small></div>' +
      (selfSold ? '<div class="you"><span>Commission</span><b>$0.00</b><small>You\u2019re selling this one yourself, so there\u2019s no commission to pay</small></div>'
        : '<div class="you"><span>Your commission (' + dealSet.commission_pct + '% of GP)</span><b>' + AZ.money(comm) + '</b><small>Paid when the deal is paid in full</small></div>');
    p.innerHTML = html; p.hidden = false;
    if (me && me.profile.role === 'admin') adminProfit(c, ex, rev, comm);
  }
  function adminProfit(c, ex, rev, comm) {
    // Admins only: what we really keep, from true costs (product_costs and addons are admin-only tables).
    Promise.all([getCostList(), sb.from('addons').select('id,cost'), sb.from('product_lines').select('id,pad')]).then(function (r) {
      var pc = (r[0] || []).filter(function (x) { return x.id === c.id; })[0]; if (!pc) return;
      var ac = {}; (r[1].data || []).forEach(function (a) { ac[a.id] = num(a.cost); });
      var ln = (r[2].data || []).filter(function (l) { return l.id === pc.line_id; })[0], pad = ln ? num(ln.pad) : 0;
      var trueCost = num(pc.cost) + ex.reduce(function (t, x) { return t + (ac[x.id] || 0); }, 0);
      var before = rev - trueCost, keep = before - comm, box = $('#dealPanel'), pc2 = function (x) { return rev ? ' <em>' + (Math.round(x / rev * 1000) / 10) + '%</em>' : ''; };
      $$('.admin', box).forEach(function (x) { x.remove(); });
      box.insertAdjacentHTML('beforeend', '<div class="admin"><span>Your profit before commission (admins only)</span><b class="' + (before < 0 ? 'neg' : '') + '">' + AZ.money(before) + pc2(before) + '</b><small>Price less true cost. The ' + AZ.money(pad) + ' pad is yours, it only lowers the salesperson\u2019s GP.</small></div>' +
        '<div class="admin"><span>Your profit after commission</span><b class="' + (keep < 0 ? 'neg' : '') + '">' + AZ.money(keep) + pc2(keep) + '</b><small>After true cost ' + AZ.money(trueCost) + ' and commission ' + AZ.money(comm) + '.</small></div>');
    });
  }
  function drawSnap() {
    var p = $('#dealPanel');
    if (!snap) { p.hidden = true; return; }
    p.innerHTML = '<div><span>Deal GP (locked at signing)</span><b>' + AZ.money(snap.deal_gp) + '</b></div><div class="you"><span>Commission (' + num(snap.commission_pct) + '%)</span><b>' + AZ.money(snap.commission) + '</b><small>' + (snap.commission_paid_at ? 'Paid ' + AZ.date(snap.commission_paid_at) : 'Paid when the deal is paid in full') + '</small></div>';
    p.hidden = false;
  }
  form.hot_tub_value.addEventListener('input', checkFloor);
  prodModel.addEventListener('change', function () {
    var c = catItem(); if (c && c.zen_price && !num(form.hot_tub_value.value)) form.hot_tub_value.value = c.zen_price;
    sums(); checkFloor();
  });
  prodOther.addEventListener('input', function () { sums(); checkFloor(); });
  prodType.addEventListener('change', function () { floorAt = null; showFloor(); });

  function show(view) {
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + view; });
    $$('.tabs a').forEach(function (a) { a.removeAttribute('aria-current'); });
    var tab = view === 'sale' ? (current && current.id ? 'sales' : 'new') : view === 'customer' ? 'customers' : view;
    var t = $('.tabs a[data-tab="' + tab + '"]'); if (t) t.setAttribute('aria-current', 'page');
    $('#staffTitle').textContent = { sales: 'Sales', sale: current && current.id ? 'Sale #' + current.number : 'New sale', team: 'Team', products: 'Products', deliveries: 'Deliveries', service: 'Service', resources: 'Documents', money: 'Financials', customers: 'Customers', customer: 'Customer' }[view] || 'Sales';
    window.scrollTo(0, 0);
  }

  function route() {
    var h = location.hash.slice(1) || (me.profile.role === 'delivery' ? 'deliveries' : 'sales');
    if (me.profile.role === 'delivery' && h !== 'deliveries' && h !== 'resources') { location.hash = 'deliveries'; return; }
    if (h === 'deliveries') { show('deliveries'); loadDeliveries(); }
    else if (h === 'resources') { show('resources'); }
    else if (h === 'service' && me.profile.role !== 'delivery') { show('service'); loadService(); }
    else if (h === 'team' && me.profile.role === 'admin') { show('team'); loadTeam(); loadQb(); }
    else if (h === 'products' && me.profile.role === 'admin') { show('products'); loadProducts(); }
    else if (h === 'money' && me.profile.role === 'admin') { show('money'); loadMoney(); }
    else if (h === 'new') { openSale(null); }
    else if (h.indexOf('new-c-') === 0) { openSale(null, h.slice(6)); }
    else if (h === 'customers') { show('customers'); loadCustomers(); }
    else if (h === 'lead') { openCustomer(null); }
    else if (h.indexOf('cust-') === 0) { openCustomer(h.slice(5)); }
    else if (h.indexOf('sale-') === 0) { openSale(h.slice(5)); }
    else { show('sales'); loadSales(); }
  }

  // ---------- List ----------
  function loadSales() {
    var q = sb.from('sales').select('id,number,status,total,hot_tub_value,sauna_total,extras_total,delivery_fee,product_type,tub_model,sauna_model,updated_at,salesperson_id,customers(name),profiles!sales_salesperson_id_fkey(full_name,email)').order('updated_at', { ascending: false }).limit(200);
    if (filter === 'open') q = q.in('status', ['draft', 'awaiting_customer', 'signed', 'deposit_paid', 'delivery_scheduled']);
    else if (filter !== 'all') q = q.eq('status', filter);
    q.then(function (r) {
      var rows = r.data || [], isAdmin = me.profile.role === 'admin';
      $('#saleRows').innerHTML = rows.length ? rows.map(function (s) {
        var what = AZ.what(s) || '-';
        var rep = s.profiles ? (s.profiles.full_name || s.profiles.email) : '';
        return '<tr data-id="' + s.id + '" data-n="' + s.number + '" tabindex="0">' + (isAdmin ? '<td class="selcol"><input type="checkbox" class="sel" aria-label="Select sale #' + s.number + '"></td>' : '') + '<td>' + s.number + '</td><td>' + AZ.esc(s.customers && s.customers.name) + '</td><td>' + AZ.esc(what) + '</td><td class="num">' + AZ.money(s.total) + '</td><td>' + AZ.pill(s.status) + '</td>' + (isAdmin ? '<td>' + AZ.esc(rep) + '</td><td class="num" data-profit="' + s.id + '"></td><td class="num" data-margin="' + s.id + '"></td>' : '') + '<td>' + AZ.date(s.updated_at) + '</td></tr>';
      }).join('') : '<tr><td colspan="10" class="empty">No sales here yet. Start one with <a href="#new">New sale</a>.</td></tr>';
      $('#selAll').checked = false; updateBulk();
      if (isAdmin) listProfits(rows);
    });
  }
  $('#saleRows').addEventListener('click', function (e) {
    if (e.target.closest('.selcol')) { if (!e.target.matches('input')) { var cb = e.target.closest('.selcol').querySelector('input'); cb.checked = !cb.checked; } updateBulk(); return; }
    var tr = e.target.closest('tr[data-id]'); if (tr) location.hash = 'sale-' + tr.dataset.id;
  });

  // ---------- Bulk delete (admins) ----------
  function selected() { return $$('#saleRows .sel:checked').map(function (cb) { return cb.closest('tr'); }); }
  function updateBulk() {
    var n = selected().length, b = $('#bulkDelete');
    $('#bulkBar').hidden = me.profile.role !== 'admin' || !n;
    $('#bulkCount').textContent = n + (n === 1 ? ' sale selected' : ' sales selected');
    b.dataset.confirm = ''; b.textContent = 'Delete selected'; $('#bulkMsg').textContent = '';
  }
  $('#selAll').addEventListener('change', function () { var on = this.checked; $$('#saleRows .sel').forEach(function (cb) { cb.checked = on; }); updateBulk(); });
  $('#bulkClear').addEventListener('click', function () { $('#selAll').checked = false; $$('#saleRows .sel').forEach(function (cb) { cb.checked = false; }); updateBulk(); });
  $('#bulkDelete').addEventListener('click', function () {
    var b = this, rows = selected(); if (!rows.length) return;
    var nums = rows.map(function (tr) { return '#' + tr.dataset.n; }).join(', ');
    if (b.dataset.confirm !== '1') {
      b.dataset.confirm = '1'; b.textContent = 'Tap again to delete ' + nums + ' for good';
      setTimeout(function () { if (b.dataset.confirm === '1') { b.dataset.confirm = ''; b.textContent = 'Delete selected'; } }, 6000); return;
    }
    b.disabled = true; $('#bulkMsg').textContent = 'Deleting...';
    AZ.api('sale-delete', { sale_ids: rows.map(function (tr) { return tr.dataset.id; }) })
      .then(function (r) { AZ.toast(r.deleted === 1 ? 'Sale deleted' : r.deleted + ' sales deleted'); loadSales(); })
      .catch(function (err) { $('#bulkMsg').textContent = err.message; })
      .finally(function () { b.disabled = false; });
  });
  $('#saleRows').addEventListener('keydown', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') location.hash = 'sale-' + tr.dataset.id; });
  $$('.filters .chip').forEach(function (c) {
    c.addEventListener('click', function () {
      $$('.filters .chip').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); c.setAttribute('aria-pressed', 'true');
      filter = c.dataset.st; loadSales();
    });
  });

  // ---------- Editor ----------
  function fill(s, c) {
    CUST.forEach(function (k) { form['c_' + k].value = (c && c[k]) || ''; });
    SALE.forEach(function (k) { if (form[k]) form[k].value = (s && s[k] != null) ? s[k] : ''; });
    MONEY.forEach(function (k) { form[k].value = s && Number(s[k]) ? s[k] : ''; });
    var t = (s && s.product_type) || 'hot_tub', sauna = t === 'sauna';
    prodType.value = t; prodMake.value = ''; applyType(false);
    setModelSel(prodModel, prodOther, s ? (sauna ? s.sauna_model : s.tub_model) : null);
    prodMake.value = s ? ((sauna ? s.sauna_make : s.tub_make) || (P[t] || {}).make || '') : (P[t] || {}).make || '';
    $('#mainElectrical').value = s && sauna ? (s.sauna_electrical || '') : '';
    var mainPrice = s ? Number(sauna ? s.sauna_total : s.hot_tub_value) : 0;
    form.hot_tub_value.value = mainPrice ? mainPrice : '';
    setModelSel(addonModel, addonOther, s && !sauna ? s.sauna_model : null);
    addonMake.value = s && !sauna ? (s.sauna_make || '') : '';
    $('#addonElectrical').value = s && !sauna ? (s.sauna_electrical || '') : '';
    form.sauna_total.value = s && !sauna && Number(s.sauna_total) ? s.sauna_total : '';
    if (!s) { form.sale_date.value = new Date().toISOString().slice(0, 10); form.payment_type.value = 'full'; form.pay_methods.value = 'both'; }
    if (!form.balance_method.value) form.balance_method.value = 'before_delivery';
    floorAt = null; snap = null;
    loadDealData().then(function () {
      drawExtras(s && s.extras, s ? Number(s.delivery_fee) : 0);
      if (s && s.id && s.status !== 'draft') sb.from('sale_deal').select('*').eq('sale_id', s.id).maybeSingle().then(function (r) { snap = r.data; deal(); });
      if ($('#saveBtn').hidden) $$('#extrasList input,#extrasList button').forEach(function (i) { i.disabled = true; });
      sums(); showFloor(); if (!s || s.status === 'draft') checkFloor();
    });
    sums();
  }
  function lock(locked) {
    $$('input,select,textarea', form).forEach(function (el) { el.disabled = locked; });
    $('#saveBtn').hidden = locked; $('#deleteBtn').hidden = locked || !current || !current.id;
    $('#lockNote').hidden = !locked || (current && current.status !== 'awaiting_customer');
  }
  var newForCustomer = null; // starting a sale for an existing customer (a lead)
  function openSale(id, custId) {
    current = null; newForCustomer = null; form.querySelector('.formmsg').textContent = '';
    exitPresent();
    ['#signPanel', '#readyPanel', '#paperPanel', '#waitPanel', '#donePanel', '#eventsPanel', '#saleDanger', '#profitCard'].forEach(function (p) { $(p).hidden = true; });
    if (!id) {
      fill(null, null); lock(false); $('#saleHeading').textContent = 'New sale'; $('#saleStatus').innerHTML = ''; show('sale');
      if (custId) sb.from('customers').select('*').eq('id', custId).maybeSingle().then(function (r) {
        if (!r.data) return;
        newForCustomer = r.data;
        CUST.forEach(function (k) { form['c_' + k].value = r.data[k] || ''; });
        $('#saleHeading').textContent = 'New sale for ' + r.data.name;
      });
      return;
    }
    sb.from('sales').select('*, customers(*)').eq('id', id).maybeSingle().then(function (r) {
      if (!r.data) { AZ.toast("That sale wasn't found."); location.hash = 'sales'; return; }
      current = r.data; fill(current, current.customers);
      $('#saleHeading').textContent = 'Sale #' + current.number + ' · ' + (current.customers ? current.customers.name : '');
      $('#saleStatus').innerHTML = AZ.pill(current.status);
      lock(current.status !== 'draft');
      if (current.status === 'draft') { $('#readyPanel').hidden = false; $('#presentMsg').textContent = ''; $('#repName').textContent = me.profile.full_name || me.profile.email; }
      if (presentNext) { presentNext = false; if (current.status === 'draft') enterPresent(); }
      if (current.status === 'draft' || current.status === 'awaiting_customer') {
        $('#paperPanel').hidden = false; $('#paperConfirm').checked = false; $('#paperPhotos').value = '';
        $('#printMsg').textContent = ''; $('#paperMsg').textContent = ''; photoCount();
      }
      if (current.status === 'awaiting_customer') {
        $('#waitPanel').hidden = false;
        var link = current.sign_token ? location.origin + '/sign/?t=' + current.sign_token : '';
        $('#signLink').value = link; $('#openSign').href = link || '#';
      }
      if (current.agreement_pdf_path) {
        $('#donePanel').hidden = false;
        renderDeposit(); renderProgress();
        $('#doneText').textContent = (current.signing_method === 'paper'
          ? 'Signed on paper, recorded ' + AZ.dateTime(current.customer_signed_at) + '. '
          : (current.customer_typed_name || 'The customer') + ' signed on ' + AZ.dateTime(current.customer_signed_at) + '. ') +
          'They were emailed their copy, how to get their spot ready and a link to their portal.';
      }
      // Admins can delete any sale (tests, deals that fell through). Salespeople keep the Delete draft button.
      $('#saleDanger').hidden = me.profile.role !== 'admin';
      openProfit(current);
      $('#saleDelMsg').textContent = ''; $('#saleDelete').dataset.confirm = ''; $('#saleDelete').textContent = 'Delete sale';
      loadEvents(current.id);
      show('sale');
    });
  }
  function loadEvents(id) {
    sb.from('sale_events').select('at,kind,detail').eq('sale_id', id).order('at').then(function (r) {
      var L = { qb_invoice_created: 'Deposit invoice created in QuickBooks', qb_invoice_failed: 'QuickBooks invoice could not be created', pay_link_emailed: 'Deposit pay link emailed', deposit_paid: 'Deposit received', rep_signed: 'Signed by salesperson and sent for signature', link_emailed: 'Signing link emailed to customer', link_resent: 'New signing link created', customer_signed: 'Customer signed', welcome_sent: 'Welcome email sent with agreement, guide and manual', welcome_failed: 'Welcome email failed to send', balance_paid: 'Balance recorded as paid', undo_balance: 'Balance payment undone', delivered: 'Marked delivered', undo_delivered: 'Delivery undone', paper_signed: 'Signed on paper', printed_for_paper: 'Printed for paper signing', recorded_past: 'Recorded as a past sale (no agreement, emails or invoice)', reopened: 'Unlocked for changes (old signing link cancelled)' };
      var ev = r.data || []; if (!ev.length) return;
      $('#events').innerHTML = ev.map(function (e) { return '<li><b>' + AZ.esc(L[e.kind] || e.kind) + '</b><span>' + AZ.dateTime(e.at) + '</span></li>'; }).join('');
      $('#eventsPanel').hidden = false;
    });
  }

  function collect() {
    var c = {}, s = {};
    CUST.forEach(function (k) { c[k] = form['c_' + k].value.trim() || null; });
    SALE.forEach(function (k) { var el = form.querySelector('[name="' + k + '"]'); if (el) s[k] = el.value.trim() || null; });
    MONEY.forEach(function (k) { s[k] = num(form[k].value); });
    var type = prodType.value, model = modelVal(prodModel, prodOther), make = prodMake.value.trim() || null;
    s.product_type = type;
    if (type === 'sauna') {
      s.sauna_make = make; s.sauna_model = model; s.sauna_electrical = $('#mainElectrical').value.trim() || null; s.sauna_total = num(form.hot_tub_value.value);
      s.tub_make = null; s.tub_model = null; s.tub_line = null; s.hot_tub_value = 0;
      WATER.forEach(function (k) { s[k] = null; });
    } else {
      s.tub_make = make; s.tub_model = model; s.hot_tub_value = num(form.hot_tub_value.value);
      var t = type === 'hot_tub' ? AZ.tubFor(model) : null; s.tub_line = t ? t.lineName : null;
      var am = modelVal(addonModel, addonOther);
      s.sauna_model = am; s.sauna_make = am ? (addonMake.value.trim() || null) : null;
      s.sauna_electrical = am ? ($('#addonElectrical').value.trim() || null) : null;
      s.sauna_total = am ? num(form.sauna_total.value) : 0;
    }
    if (!s.sale_date) delete s.sale_date;
    s.extras = chosenExtras().map(function (x) { return { id: x.id, name: x.name, price: x.price }; });
    if (extrasCat.some(isDelivery)) s.delivery_fee = 0; // delivery is an add-on now
    return { c: c, s: s };
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = form.querySelector('.formmsg'), d = collect();
    if (!d.c.name || !d.c.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.c.email)) { msg.textContent = 'Add the customer\'s name and a valid email first.'; return; }
    msg.textContent = 'Saving...';
    var done = function (saleId) { msg.textContent = 'Saved.'; AZ.toast('Draft saved'); if (location.hash !== '#sale-' + saleId) location.hash = 'sale-' + saleId; else openSale(saleId); };
    var fail = function (err) { msg.textContent = (err && err.message) || 'Could not save. Please try again.'; };
    if (current && current.id) {
      sb.from('customers').update(d.c).eq('id', current.customer_id).then(function (r1) {
        if (r1.error) return fail(r1.error);
        sb.from('sales').update(d.s).eq('id', current.id).then(function (r2) { r2.error ? fail(r2.error) : done(current.id); });
      });
    } else if (newForCustomer) {
      var cid = newForCustomer.id;
      sb.from('customers').update(d.c).eq('id', cid).then(function (r1) {
        if (r1.error) return fail(r1.error);
        d.s.customer_id = cid; d.s.salesperson_id = me.user.id; d.s.status = 'draft';
        sb.from('sales').insert(d.s).select('id').single().then(function (r2) { r2.error ? fail(r2.error) : done(r2.data.id); });
      });
    } else {
      d.c.created_by = me.user.id;
      sb.from('customers').insert(d.c).select('id').single().then(function (r1) {
        if (r1.error) return fail(r1.error);
        d.s.customer_id = r1.data.id; d.s.salesperson_id = me.user.id; d.s.status = 'draft';
        sb.from('sales').insert(d.s).select('id').single().then(function (r2) { r2.error ? fail(r2.error) : done(r2.data.id); });
      });
    }
  });

  $('#deleteBtn').addEventListener('click', function () {
    var b = $('#deleteBtn');
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Tap again to delete'; setTimeout(function () { b.dataset.confirm = ''; b.textContent = 'Delete draft'; }, 4000); return; }
    sb.from('sales').delete().eq('id', current.id).then(function (r) { if (r.error) return AZ.toast(r.error.message); AZ.toast('Draft deleted'); location.hash = 'sales'; });
  });

  $('#reopenBtn').addEventListener('click', function () {
    var b = this, m = $('#reopenMsg'); if (!current) return;
    if (b.dataset.confirm !== '1') {
      b.dataset.confirm = '1'; b.textContent = 'Tap again to unlock and cancel the link';
      setTimeout(function () { if (b.dataset.confirm === '1') { b.dataset.confirm = ''; b.textContent = 'Edit this agreement'; } }, 5000); return;
    }
    b.disabled = true; m.textContent = 'Unlocking...';
    AZ.api('sale-reopen', { sale_id: current.id })
      .then(function () { AZ.toast('Unlocked. Make your changes, then sign and send again.'); b.dataset.confirm = ''; b.textContent = 'Edit this agreement'; m.textContent = ''; openSale(current.id); })
      .catch(function (err) { m.textContent = err.message; })
      .finally(function () { b.disabled = false; });
  });

  $('#saleDelete').addEventListener('click', function () {
    var b = this, m = $('#saleDelMsg'); if (!current) return;
    if (b.dataset.confirm !== '1') {
      b.dataset.confirm = '1'; b.textContent = 'Tap again to delete sale #' + current.number + ' for good';
      setTimeout(function () { if (b.dataset.confirm === '1') { b.dataset.confirm = ''; b.textContent = 'Delete sale'; } }, 5000); return;
    }
    b.disabled = true; m.textContent = 'Deleting...';
    AZ.api('sale-delete', { sale_ids: [current.id] })
      .then(function () { AZ.toast('Sale #' + current.number + ' deleted'); location.hash = 'sales'; })
      .catch(function (err) { m.textContent = err.message; })
      .finally(function () { b.disabled = false; });
  });


  // ---------- Customer view: go over the deal and sign with nothing staff-only on screen ----------
  var presentNext = false;
  function enterPresent() {
    renderPresent(current, current.customers || {});
    document.body.classList.add('presenting');
    $('#presentBar').hidden = false; $('#presentSummary').hidden = false; $('#signPanel').hidden = false;
    if (!pad) pad = AZ.signaturePad($('#repSig')); else pad.clear();
    $('#signMsg').textContent = '';
    window.scrollTo(0, 0);
  }
  function exitPresent() {
    document.body.classList.remove('presenting');
    $('#presentBar').hidden = true; $('#presentSummary').hidden = true; $('#signPanel').hidden = true;
  }
  $('#presentExit').addEventListener('click', function () { exitPresent(); if (current && current.id) openSale(current.id); });
  $('#presentBtn').addEventListener('click', function () {
    var m = $('#presentMsg'), d = collect(), b = this;
    if (!current || !current.id) return;
    if (!d.c.name || !d.c.email) { m.textContent = 'Add the customer’s name and email first.'; return; }
    if (floorAt && me.profile.role !== 'admin') { m.textContent = 'The price is below what we can sell it for. Fix that first.'; return; }
    b.disabled = true; m.textContent = 'Saving...';
    sb.from('customers').update(d.c).eq('id', current.customer_id)
      .then(function (r1) { if (r1.error) throw r1.error; return sb.from('sales').update(d.s).eq('id', current.id); })
      .then(function (r2) { if (r2.error) throw r2.error; presentNext = true; openSale(current.id); })
      .catch(function (err) { m.textContent = err.message || 'Could not save.'; })
      .finally(function () { b.disabled = false; });
  });
  function renderPresent(s, c) {
    var kind = s.product_type || 'hot_tub', noun = AZ.noun(s), pic = AZ.productFor(kind, s.tub_model);
    var row = function (k, v) { return v ? '<div><dt>' + k + '</dt><dd>' + AZ.esc(v) + '</dd></div>' : ''; };
    var price = num(s.hot_tub_value), msrp = num(s.msrp), save = msrp > price ? msrp - price : 0;
    var ex = Array.isArray(s.extras) ? s.extras : [], exSave = 0;
    var exRows = ex.map(function (x) {
      var p = num(x.price), l = num(x.list); if (l > p) exSave += l - p;
      return '<div><dt>' + AZ.esc(x.name) + (p > 0 && l > p ? ' <span class="was">was ' + AZ.money(l) + '</span>' : '') + '</dt><dd>' + (p > 0 ? AZ.money(p) : 'Included' + (l ? ' <span class="was">a ' + AZ.money(l) + ' value</span>' : '')) + '</dd></div>';
    }).join('');
    var sub = price + num(s.sauna_total) + num(s.extras_total) + num(s.delivery_fee), full = s.payment_type === 'full';
    $('#presentSummary').innerHTML =
      '<div class="present-top">' + (pic ? '<img src="/assets/img/' + (pic.top || pic.img) + '.webp" alt="The ' + AZ.esc(s.tub_model) + ' ' + noun + ' from above">' : '') +
      '<div><p class="eyebrow">Prepared for ' + AZ.esc(c.name || '') + '</p><h2>' + AZ.esc((s.tub_make ? s.tub_make + ' ' : '') + (s.tub_model || '') + ' ' + noun) + '</h2>' +
      (AZ.savingsHtml(s) || '<p class="zenline"><span class="zen">' + AZ.money(price) + '</span></p>') +
      '</div></div>' +
      '<div class="present-cols"><div>' + (function () { var d = row('Shell colour', s.shell_colour) + row('Siding', s.siding) + row('Water care', s.water_care) + row('Stereo', s.stereo) + row('Starter kit', s.starter_kit) + row('Cover', s.spa_cover) + row('Other', s.other); return d ? '<h3>Your ' + noun + '</h3><dl class="kv">' + d + '</dl>' : ''; })() +
      (exRows ? '<h3>Add-ons</h3><dl class="sums">' + exRows + '</dl>' : '') + '</div>' +
      '<div><h3>Your price</h3><dl class="sums">' +
      '<div><dt>' + AZ.cap(noun) + '</dt><dd>' + AZ.money(price) + '</dd></div>' +
      (num(s.extras_total) ? '<div><dt>Add-ons</dt><dd>' + AZ.money(s.extras_total) + '</dd></div>' : '') +
      (num(s.delivery_fee) ? '<div><dt>Delivery</dt><dd>' + AZ.money(s.delivery_fee) + '</dd></div>' : '') +
      '<div><dt>Subtotal</dt><dd>' + AZ.money(sub) + '</dd></div><div><dt>GST 5% + PST 7%</dt><dd>' + AZ.money(s.tax) + '</dd></div>' +
      '<div class="strong"><dt>Total</dt><dd>' + AZ.money(s.total) + '</dd></div>' +
      '<div><dt>' + (full ? 'Paid in full when you sign' : 'Paid when you sign') + '</dt><dd>' + AZ.money(s.deposit) + '</dd></div>' +
      (full ? '' : '<div class="strong"><dt>Balance before delivery</dt><dd>' + AZ.money(s.balance) + '</dd></div>') + '</dl>' +
      '<p class="muted small">You’ll pick your delivery window when you sign, and pay through a secure QuickBooks link right after.</p></div></div>';
  }

  $('#repSigClear').addEventListener('click', function () { pad && pad.clear(); });
  function sendForSignature(emailCustomer) {
    var m = $('#signMsg');
    if (!current || !current.id) return;
    if (!pad || pad.isEmpty()) { m.textContent = 'Please sign in the box first.'; return; }
    // Save any last edits first, then lock and sign.
    var d = collect();
    m.textContent = 'Saving and signing...';
    $$('#signPanel button').forEach(function (b) { b.disabled = true; });
    sb.from('customers').update(d.c).eq('id', current.customer_id).then(function () { return sb.from('sales').update(d.s).eq('id', current.id); })
      .then(function () { return AZ.api('send-for-signature', { sale_id: current.id, rep_signature: pad.toDataURL(), email_customer: emailCustomer }); })
      .then(function (r) {
        if (emailCustomer) { AZ.toast('Signing link emailed to ' + d.c.email); openSale(current.id); }
        else location.href = r.sign_url;
      })
      .catch(function (err) { m.textContent = err.message; })
      .finally(function () { $$('#signPanel button').forEach(function (b) { b.disabled = false; }); });
  }
  $('#signEmail').addEventListener('click', function () { sendForSignature(true); });
  $('#signHere').addEventListener('click', function () { sendForSignature(false); });
  $('#copyLink').addEventListener('click', function () { AZ.copy($('#signLink').value); });
  $('#resendLink').addEventListener('click', function () {
    var m = $('#waitMsg'); m.textContent = 'Sending...';
    AZ.api('send-for-signature', { sale_id: current.id, email_customer: true }).then(function () { m.textContent = 'A fresh link was emailed. The old link no longer works.'; openSale(current.id); })
      .catch(function (err) { m.textContent = err.message; });
  });
  $('#downloadPdf').addEventListener('click', function () {
    AZ.api('agreement-pdf', { sale_id: current.id }).then(function (r) { location.href = r.url; }).catch(function (err) { AZ.toast(err.message); });
  });
  // ---------- Printing ----------
  // Computers get the print dialog right away; phones and tablets open the PDF, to print from the share menu.
  function printAgreement(msg) {
    msg.textContent = 'Getting the agreement ready...';
    var touch = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
    var win = touch ? window.open('', '_blank') : null; // opened now so the browser doesn't block it
    AZ.api('agreement-print', { sale_id: current.id }).then(function (r) {
      var bin = atob(r.pdf), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      if (win) { win.location.href = url; msg.textContent = 'Opened in a new tab. Tap the share button there, then Print.'; return; }
      var old = document.getElementById('printFrame'); if (old) old.remove();
      var f = document.createElement('iframe');
      f.id = 'printFrame'; f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
      f.onload = function () {
        setTimeout(function () {
          try { f.contentWindow.focus(); f.contentWindow.print(); msg.textContent = ''; }
          catch (e) { window.open(url, '_blank'); msg.textContent = 'Opened in a new tab. Print it from there.'; }
        }, 300);
      };
      f.src = url; document.body.appendChild(f);
    }).catch(function (err) { if (win) win.close(); msg.textContent = err.message; });
  }
  // See or download the quote as a PDF, without printing. Saves the latest changes first.
  function quotePdf(download) {
    var m = $('#presentMsg'), d = collect();
    if (!current || !current.id) return;
    var win = download ? null : window.open('', '_blank'); // opened now so the browser doesn't block it
    m.textContent = 'Saving and making the PDF...';
    sb.from('customers').update(d.c).eq('id', current.customer_id)
      .then(function (r1) { if (r1.error) throw r1.error; return sb.from('sales').update(d.s).eq('id', current.id); })
      .then(function (r2) { if (r2.error) throw r2.error; return AZ.api('agreement-print', { sale_id: current.id, preview: true }); })
      .then(function (r) {
        var bin = atob(r.pdf), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        var name = 'AquaZen quote ' + current.number + (current.customers && current.customers.name ? ' - ' + current.customers.name : '') + '.pdf';
        if (download) { var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); m.textContent = 'Downloaded ' + name + '.'; }
        else { win.location.href = url; m.textContent = 'Opened in a new tab.'; }
      })
      .catch(function (err) { if (win) win.close(); m.textContent = (err && err.message) || 'Could not make the PDF.'; });
  }
  $('#quoteView').addEventListener('click', function () { quotePdf(false); });
  $('#quoteDownload').addEventListener('click', function () { quotePdf(true); });
  $('#printPdf').addEventListener('click', function () { printAgreement($('#pdfMsg')); });
  $('#printPaper').addEventListener('click', function () { printAgreement($('#printMsg')); });

  // Photos of signed paper pages are shrunk on the device first so they upload quickly.
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, 1800 / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { reject(new Error("One of the photos couldn't be read. Try a JPG or PNG.")); };
      img.src = url;
    });
  }
  function photoCount() {
    var n = $('#paperPhotos').files.length;
    $('#photoCount').textContent = n ? n + ' photo' + (n > 1 ? 's' : '') + ' ready' + (n > 6 ? ' (only the first 6 are kept)' : '') + '.' :
      'A photo of each signed page keeps a backup with the sale, in case the paper copy goes missing.';
  }
  $('#paperPhotos').addEventListener('change', photoCount);
  $('#markPaper').addEventListener('click', function () {
    var m = $('#paperMsg');
    if (!$('#paperConfirm').checked) { m.textContent = 'Please tick the box to confirm you both signed.'; return; }
    var btn = this; btn.disabled = true; m.textContent = 'Saving...';
    var files = Array.prototype.slice.call($('#paperPhotos').files, 0, 6);
    Promise.all(files.map(shrink))
      .then(function (photos) { m.textContent = 'Saving and sending the welcome email...'; return AZ.api('paper-signed', { sale_id: current.id, photos: photos, confirm: true }); })
      .then(function () { AZ.toast('Marked as signed. The customer has been emailed.'); openSale(current.id); })
      .catch(function (err) { m.textContent = err.message; })
      .finally(function () { btn.disabled = false; });
  });

  // ---------- Deposit (QuickBooks) ----------
  function renderDeposit() {
    var box = $('#depositBox'), s = current;
    var full = s.payment_type === 'full', H = full ? '<h3>Payment</h3>' : '<h3>Deposit</h3>';
    if (s.status === 'deposit_paid' || s.deposit_paid_at) { box.innerHTML = H + '<p>' + AZ.pill('deposit_paid').replace('Deposit received', full ? 'Paid in full' : 'Deposit received') + ' ' + AZ.money(s.deposit) + ' received ' + AZ.dateTime(s.deposit_paid_at) + '. Time to place the order with AquaSolus.</p>'; return; }
    if (!(Number(s.deposit) > 0)) { box.innerHTML = ''; return; }
    if (s.qb_deposit_invoice_id) {
      box.innerHTML = H + '<p>QuickBooks invoice created for ' + AZ.money(s.deposit) + (full ? ' (paid in full)' : ' (deposit)') + '. It updates on its own within 15 minutes of the customer paying.</p>' +
        '<div class="formactions">' + (s.qb_invoice_link ? '<button class="btn btn-line btn-sm" type="button" id="copyPay">Copy pay link</button><button class="btn btn-ink btn-sm" type="button" id="emailPay">Email pay link to customer</button>' : '') + '<p class="formmsg" id="payMsg"></p></div>';
    } else {
      box.innerHTML = H + '<p class="muted">No QuickBooks invoice yet for the ' + AZ.money(s.deposit) + (full ? ' payment' : ' deposit') + '.</p><div class="formactions"><button class="btn btn-gold btn-sm" type="button" id="makeInvoice">Create invoice and email pay link</button><p class="formmsg" id="payMsg"></p></div>';
    }
    var cp = $('#copyPay'); if (cp) cp.onclick = function () { AZ.copy(s.qb_invoice_link); };
    var send = function () {
      $('#payMsg').textContent = 'Working...';
      AZ.api('qb-invoice', { sale_id: s.id, email_customer: true }).then(function () { $('#payMsg').textContent = 'Pay link emailed to the customer.'; openSale(s.id); })
        .catch(function (e) { $('#payMsg').textContent = e.message; });
    };
    var ep = $('#emailPay'); if (ep) ep.onclick = send;
    var mk = $('#makeInvoice'); if (mk) mk.onclick = send;
  }

  // ---------- After the deposit: balance and delivery ----------
  function renderProgress() {
    var box = $('#progressBox'), s = current;
    if (!s || ['signed', 'deposit_paid', 'delivery_scheduled', 'delivered'].indexOf(s.status) < 0) { box.innerHTML = ''; return; }
    var owing = Number(s.balance) > 0, today = new Date().toISOString().slice(0, 10), h = '<h3>Balance and delivery</h3>';
    h += '<p>Customer asked for: <b>' + AZ.esc(AZ.windowLabel(s.delivery_window) || 'no window chosen') + '</b></p>';
    if (owing) {
      if (s.balance_paid_at) {
        h += '<p>' + AZ.pill('deposit_paid').replace('Deposit received', 'Balance paid') + ' ' + AZ.money(s.balance) + ' recorded ' + AZ.date(s.balance_paid_at) + '. <button class="textbtn" type="button" data-prog="undo_balance">Undo</button></p>';
      } else {
        var paidDep = !!s.deposit_paid_at || ['deposit_paid', 'delivery_scheduled', 'delivered'].indexOf(s.status) >= 0;
        h += '<div class="progrow"><p>Balance of <b>' + AZ.money(s.balance) + '</b> still owing.</p>' +
          (s.qb_balance_invoice_id
            ? '<p class="muted small">Balance invoice is in QuickBooks. It updates on its own within 15 minutes of the customer paying.</p>' + (s.qb_balance_link ? '<button class="btn btn-line btn-sm" type="button" id="copyBal">Copy pay link</button><button class="btn btn-ink btn-sm" type="button" id="sendBal">Email pay link again</button>' : '')
            : (paidDep && s.balance_method === 'before_delivery' ? '<button class="btn btn-gold btn-sm" type="button" id="sendBal">Send balance invoice</button>' : '')) +
          '</div><div class="progrow"><label>Paid on<input type="date" id="balDate" value="' + today + '"></label><button class="btn btn-line btn-sm" type="button" data-prog="balance_paid">Record balance paid another way</button></div>';
      }
    }
    if (s.status !== 'delivered') {
      h += s.delivery_date
        ? '<p>' + AZ.pill('delivery_scheduled') + ' ' + AZ.esc(AZ.dayLabel(s.delivery_date)) + '. <button class="textbtn" type="button" data-prog="undo_scheduled">Undo</button></p>'
        : '<div class="progrow"><label>Delivery day<input type="date" id="schedDate" min="' + today + '"></label><label class="inline"><input type="checkbox" id="schedEmail" checked> Email the customer</label><button class="btn btn-line btn-sm" type="button" data-prog="scheduled">Book delivery</button></div>';
    }
    h += s.status === 'delivered'
      ? '<p>' + AZ.pill('delivered') + ' ' + AZ.date(s.delivered_at) + (s.serial_number ? ' · Serial ' + AZ.esc(s.serial_number) : '') + '. <button class="textbtn" type="button" data-prog="undo_delivered">Undo</button></p>'
      : '<div class="progrow"><label>Delivered on<input type="date" id="delDate" value="' + today + '"></label><label>Serial number<input id="delSerial" value="' + AZ.esc(s.serial_number || '') + '" placeholder="From the tub"></label><button class="btn btn-gold btn-sm" type="button" data-prog="delivered">Mark delivered</button></div>';
    box.innerHTML = h + '<p class="formmsg" id="progMsg" role="status" aria-live="polite"></p>';
    var cb = $('#copyBal'); if (cb) cb.onclick = function () { AZ.copy(s.qb_balance_link); };
    var sbal = $('#sendBal'); if (sbal) sbal.onclick = function () {
      sbal.disabled = true; $('#progMsg').textContent = 'Creating the invoice and emailing it...';
      AZ.api('qb-balance-invoice', { sale_id: s.id, email_customer: true }).then(function () { AZ.toast('Balance invoice emailed'); openSale(s.id); })
        .catch(function (err) { $('#progMsg').textContent = err.message; sbal.disabled = false; });
    };
    $$('[data-prog]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.prog, body = { sale_id: s.id, action: a };
        if (a === 'balance_paid') body.date = $('#balDate').value;
        if (a === 'scheduled') { body.date = $('#schedDate').value; body.email_customer = $('#schedEmail').checked; if (!body.date) { $('#progMsg').textContent = 'Choose the delivery day.'; return; } }
        if (a === 'delivered') { body.date = $('#delDate').value; body.serial_number = $('#delSerial').value.trim(); }
        b.disabled = true; $('#progMsg').textContent = 'Saving...';
        AZ.api('sale-progress', body).then(function () { AZ.toast('Saved'); openSale(s.id); })
          .catch(function (err) { $('#progMsg').textContent = err.message; b.disabled = false; });
      });
    });
  }

  // ---------- Customers ----------
  var STAGES = {
    lead: ['Lead', 'grey'], payment_due: ['Payment due', 'amber'], balance: ['Paid, balance owing', 'teal'],
    waiting: ['Waiting for delivery', 'gold'], delivered: ['Delivered', 'green']
  };
  var SIGNED = ['signed', 'deposit_paid', 'delivery_scheduled', 'delivered'];
  function stageOf(c) {
    var deals = (c.sales || []).filter(function (x) { return SIGNED.indexOf(x.status) >= 0; })
      .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
    if (!deals.length) return { key: 'lead', deal: (c.sales || [])[0] || null };
    var d = deals[0];
    if (d.status === 'delivered') return { key: 'delivered', deal: d };
    if (d.status === 'signed') return { key: 'payment_due', deal: d };
    if (Number(d.balance) > 0 && !d.balance_paid_at) return { key: 'balance', deal: d };
    return { key: 'waiting', deal: d };
  }
  function stagePill(k) { var st = STAGES[k]; return '<span class="pill pill-' + st[1] + '">' + st[0] + '</span>'; }
  var custCache = [], custStage = 'all';
  // Team members who can own customers (admins and salespeople), for assigning leads.
  var teamCache = null;
  function getTeam() {
    if (teamCache) return Promise.resolve(teamCache);
    return sb.from('profiles').select('id,full_name,email,role,active').in('role', ['admin', 'staff']).order('full_name').then(function (r) { teamCache = r.data || []; return teamCache; });
  }
  function teamName(id) { var p = (teamCache || []).filter(function (x) { return x.id === id; })[0]; return p ? (p.full_name || p.email) : ''; }
  function loadCustomers() {
    if (me.profile.role === 'admin' && !teamCache) { getTeam().then(function () { if (custCache) renderCustomers(); }); }
    sb.from('customers').select('id,name,email,cell,city_pc,created_at,created_by,sales(id,number,status,total,balance,balance_paid_at,product_type,tub_model,sauna_model,created_at,salesperson_id,profiles!sales_salesperson_id_fkey(full_name,email))')
      .order('created_at', { ascending: false }).limit(1000).then(function (r) {
        if (r.error) { $('#custRows').innerHTML = '<tr><td colspan="7" class="empty">' + AZ.esc(r.error.message) + '</td></tr>'; return; }
        custCache = (r.data || []).map(function (c) { var st = stageOf(c); c._stage = st.key; c._deal = st.deal; return c; });
        renderCustomers();
      });
  }
  function renderCustomers() {
    var counts = { all: custCache.length }; Object.keys(STAGES).forEach(function (k) { counts[k] = 0; });
    custCache.forEach(function (c) { counts[c._stage]++; });
    counts.unassigned = custCache.filter(function (c) { return !c.created_by && !(c.sales || []).length; }).length;
    $$('#custFilters .chip').forEach(function (b) { b.querySelector('span').textContent = counts[b.dataset.stage] ? '(' + counts[b.dataset.stage] + ')' : ''; });
    var q = ($('#custSearch').value || '').toLowerCase().trim(), isAdmin = me.profile.role === 'admin';
    var rows = custCache.filter(function (c) {
      if (custStage === 'unassigned') { if (c.created_by || (c.sales || []).length) return false; }
      else if (custStage !== 'all' && c._stage !== custStage) return false;
      return !q || [c.name, c.email, c.cell, c.city_pc].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    $('#custRows').innerHTML = rows.length ? rows.map(function (c) {
      var d = c._deal, what = d ? '#' + d.number + ' ' + (AZ.what(d) || '') : '-';
      var bal = d && SIGNED.indexOf(d.status) >= 0 ? (d.balance_paid_at ? 0 : Number(d.balance)) : null;
      var rep = c.created_by ? teamName(c.created_by) : (d && d.profiles ? (d.profiles.full_name || d.profiles.email) : '');
      var repCell = rep ? AZ.esc(rep) : (!(c.sales || []).length ? '<span class="pill pill-amber">Needs assigning</span>' : '-');
      return '<tr data-cid="' + c.id + '" tabindex="0"><td><b>' + AZ.esc(c.name) + '</b></td><td>' + AZ.esc([c.cell, c.email].filter(Boolean).join(' · ') || '-') + '</td><td>' + stagePill(c._stage) + '</td><td>' + AZ.esc(what) + '</td><td class="num">' + (bal == null ? '-' : AZ.money(bal)) + '</td>' + (isAdmin ? '<td>' + repCell + '</td>' : '') + '<td>' + AZ.date(c.created_at) + '</td></tr>';
    }).join('') : '<tr><td colspan="7" class="empty">' + (custCache.length ? 'No customers match.' : 'No customers yet. <a href="#lead">Add a lead</a> or start a <a href="#new">new sale</a>.') + '</td></tr>';
  }
  $('#custRows').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-cid]'); if (tr) location.hash = 'cust-' + tr.dataset.cid; });
  $('#custRows').addEventListener('keydown', function (e) { var tr = e.target.closest('tr[data-cid]'); if (tr && e.key === 'Enter') location.hash = 'cust-' + tr.dataset.cid; });
  $('#custSearch').addEventListener('input', renderCustomers);
  $$('#custFilters .chip').forEach(function (c) {
    c.addEventListener('click', function () {
      $$('#custFilters .chip').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); c.setAttribute('aria-pressed', 'true');
      custStage = c.dataset.stage; renderCustomers();
    });
  });

  var currentCust = null, cform = $('#custForm');
  var CFIELDS = ['name', 'email', 'cell', 'heard_about', 'address', 'city_pc', 'notes'];
  function openCustomer(id) {
    currentCust = null; cform.querySelector('.formmsg').textContent = ''; $('#custDelMsg').textContent = '';
    $('#custDeals').hidden = true; $('#custDanger').hidden = true; $('#custNewSale').hidden = true; $('#custStage').innerHTML = ''; $('#custAssign').hidden = true; $('#assignMsg').textContent = '';
    var del = $('#custDelete'); del.dataset.confirm = ''; del.textContent = 'Delete customer';
    if (!id) { CFIELDS.forEach(function (k) { cform[k].value = ''; }); $('#custHeading').textContent = 'New lead'; show('customer'); cform.name.focus(); return; }
    sb.from('customers').select('*, sales(id,number,status,total,balance,deposit,balance_paid_at,product_type,tub_model,sauna_model,created_at,updated_at)').eq('id', id).maybeSingle().then(function (r) {
      if (!r.data) { AZ.toast("That customer wasn't found."); location.hash = 'customers'; return; }
      var c = currentCust = r.data, st = stageOf(c);
      CFIELDS.forEach(function (k) { cform[k].value = c[k] || ''; });
      $('#custHeading').textContent = c.name; $('#custStage').innerHTML = stagePill(st.key);
      $('#custNewSale').href = '#new-c-' + c.id; $('#custNewSale').hidden = false;
      var deals = (c.sales || []).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
      if (deals.length) {
        $('#custDealList').innerHTML = '<ul class="deallist">' + deals.map(function (d) {
          var what = AZ.what(d) || 'Sale';
          return '<li><a href="#sale-' + d.id + '"><b>#' + d.number + ' ' + AZ.esc(what) + '</b><span>' + AZ.pill(d.status) + ' ' + AZ.money(d.total) + (Number(d.balance) > 0 && !d.balance_paid_at && SIGNED.indexOf(d.status) >= 0 ? ' · ' + AZ.money(d.balance) + ' owing' : '') + '</span></a></li>';
        }).join('') + '</ul>';
        $('#custDeals').hidden = false;
      }
      // Admins can delete anyone; salespeople can delete their own leads that have no deals.
      $('#custDanger').hidden = !(me.profile.role === 'admin' || (!deals.length && c.created_by === me.user.id));
      if (me.profile.role === 'admin') getTeam().then(function (team) {
        $('#assignSel').innerHTML = '<option value="">Nobody yet (admins only)</option>' + team.filter(function (p) { return p.active || p.id === c.created_by; })
          .map(function (p) { return '<option value="' + p.id + '"' + (p.id === c.created_by ? ' selected' : '') + '>' + AZ.esc(p.full_name || p.email) + (p.role === 'admin' ? ' (admin)' : '') + '</option>'; }).join('');
        $('#custAssign').hidden = false;
      });
      show('customer');
    });
  }
  $('#assignBtn').addEventListener('click', function () {
    var b = this, m = $('#assignMsg'), c = currentCust; if (!c) return;
    var uid = $('#assignSel').value || null;
    b.disabled = true; m.textContent = 'Saving...';
    AZ.api('lead-assign', { customer_id: c.id, user_id: uid }).then(function () {
      c.created_by = uid; custCache = null;
      m.textContent = uid ? (uid === me.user.id ? 'Assigned to you.' : 'Assigned. ' + teamName(uid) + ' has been emailed.') : 'Unassigned. Only admins can see them now.';
      AZ.toast('Saved');
    }).catch(function (err) { m.textContent = err.message; }).finally(function () { b.disabled = false; });
  });
  // Saves the customer form. then(id) runs after a successful save; by default it reopens the customer.
  function saveCustomer(then) {
    var m = cform.querySelector('.formmsg'), d = {};
    CFIELDS.forEach(function (k) { d[k] = cform[k].value.trim() || null; });
    if (!d.name) { m.textContent = 'Add a name first.'; return; }
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) { m.textContent = 'That email doesn\'t look right.'; return; }
    if (!d.email && !d.cell) { m.textContent = 'Add an email or a cell number so you can follow up.'; return; }
    d.updated_at = new Date().toISOString();
    m.textContent = 'Saving...';
    var q = currentCust ? sb.from('customers').update(d).eq('id', currentCust.id).select('id').single()
      : sb.from('customers').insert(Object.assign(d, { created_by: me.user.id })).select('id').single();
    q.then(function (r) {
      if (r.error) { m.textContent = r.error.message; return; }
      AZ.toast('Saved');
      if (then) return then(r.data.id);
      if (location.hash !== '#cust-' + r.data.id) location.hash = 'cust-' + r.data.id; else openCustomer(r.data.id);
    });
  }
  cform.addEventListener('submit', function (e) { e.preventDefault(); saveCustomer(); });
  // Starting a sale saves any changes first, so details typed on the lead (like an email) carry into the sale.
  $('#custNewSale').addEventListener('click', function (e) {
    e.preventDefault();
    saveCustomer(function (id) { location.hash = 'new-c-' + id; });
  });
  $('#custDelete').addEventListener('click', function () {
    var b = this, m = $('#custDelMsg'), c = currentCust; if (!c) return;
    if (b.dataset.confirm !== '1') {
      b.dataset.confirm = '1'; b.textContent = 'Tap again to delete ' + c.name + ' for good';
      setTimeout(function () { b.dataset.confirm = ''; b.textContent = 'Delete customer'; }, 5000); return;
    }
    b.disabled = true; m.textContent = 'Deleting...';
    var hasDeals = (c.sales || []).length > 0;
    var p = hasDeals || me.profile.role === 'admin' ? AZ.api('customer-delete', { customer_id: c.id }) : sb.from('customers').delete().eq('id', c.id).then(function (r) { if (r.error) throw r.error; });
    p.then(function () { AZ.toast(c.name + ' deleted'); location.hash = 'customers'; })
      .catch(function (err) { m.textContent = err.message; }).finally(function () { b.disabled = false; });
  });

  // ---------- QuickBooks settings (admins) ----------
  function loadQb() {
    var body = $('#qbBody');
    var flag = new URLSearchParams(location.search).get('qb');
    var banner = flag ? '<p class="note">' + ({ connected: 'QuickBooks is connected.', cancelled: 'QuickBooks connection was cancelled.', failed: 'QuickBooks connection failed. Please try again.' }[flag] || '') + '</p>' : '';
    AZ.api('qb-status', {}).then(function (st) {
      if (!st.configured) { body.innerHTML = banner + '<p>Add <b>QB_CLIENT_ID</b> and <b>QB_CLIENT_SECRET</b> on the Supabase secrets page, then refresh.</p>'; return; }
      if (!st.connected) { body.innerHTML = banner + '<button class="btn btn-gold" type="button" id="qbConnect">Connect QuickBooks</button><p class="muted small">You\'ll sign in to the AquaZen QuickBooks and approve the connection once.</p>'; $('#qbConnect').onclick = function () { AZ.api('qb-connect', {}).then(function (r) { location.href = r.url; }).catch(function (e) { AZ.toast(e.message); }); }; return; }
      var L = st.lists || { items: [], taxCodes: [] };
      var opt = function (arr, sel) { return '<option value="">Choose...</option>' + arr.map(function (x) { return '<option value="' + AZ.esc(x.id) + '"' + (x.id === sel ? ' selected' : '') + '>' + AZ.esc(x.name) + (x.type ? ' (' + AZ.esc(x.type) + ')' : '') + '</option>'; }).join(''); };
      body.innerHTML = banner + '<p>' + AZ.pill('signed').replace('Signed', 'Connected') + ' ' + AZ.esc(st.company || 'QuickBooks company') + '</p>' +
        (st.list_error ? '<p class="note">' + AZ.esc(st.list_error) + '</p>' : '') +
        '<form id="qbForm" class="form grid2"><label>Product or service for website invoices<select name="item">' + opt(L.items, st.item_id) + '</select></label>' +
        '<label>Tax code<select name="tax">' + opt(L.taxCodes, st.tax_code_id) + '</select></label>' +
        '<div class="span2 formactions"><button class="btn btn-ink" type="submit">Save</button><button class="btn btn-line btn-sm" type="button" id="qbDisconnect">Disconnect</button><p class="formmsg"></p></div></form>' +
        (L.items.some(function (x) { return x.name === 'Hot Tub Sale'; }) ? '' : '<p><button class="btn btn-line btn-sm" type="button" id="qbMakeItem">Create a "Hot Tub Sale" item for me</button> <span class="muted small" id="qbMakeMsg">Adds it in QuickBooks, booked to your sales income account, and selects it here.</span></p>') +
        '<p class="muted small">Used for both deposits and paid-in-full invoices. Ask your bookkeeper which item and tax code to use. The deposit already includes GST and PST, so the tax code is usually the exempt or out-of-scope one. If there isn\'t one yet, create a "Hot Tub Sale" service in QuickBooks, then refresh this page.</p>';
      $('#qbForm').onsubmit = function (e) {
        e.preventDefault(); var f = e.target, m = f.querySelector('.formmsg'); m.textContent = 'Saving...';
        AZ.api('qb-settings', { item_id: f.item.value, tax_code_id: f.tax.value }).then(function () { m.textContent = 'Saved.'; }).catch(function (er) { m.textContent = er.message; });
      };
      $('#qbDisconnect').onclick = function () { AZ.api('qb-settings', { disconnect: true }).then(loadQb); };
      var mk = $('#qbMakeItem');
      if (mk) mk.onclick = function () {
        mk.disabled = true; $('#qbMakeMsg').textContent = 'Creating it in QuickBooks...';
        AZ.api('qb-settings', { create_item: true }).then(function (r) { AZ.toast('Hot Tub Sale item ready' + (r.account ? ', booked to ' + r.account : '')); loadQb(); })
          .catch(function (e) { $('#qbMakeMsg').textContent = e.message; mk.disabled = false; });
      };
    }).catch(function (e) { body.innerHTML = '<p>' + AZ.esc(e.message) + '</p>'; });
  }

  // ---------- Team ----------
  function loadTeam() {
    sb.from('profiles').select('full_name,email,role,active').in('role', ['admin', 'staff']).order('role').then(function (r) {
      $('#teamList').innerHTML = (r.data || []).map(function (p) {
        return '<li><b>' + AZ.esc(p.full_name || p.email) + '</b><span>' + AZ.esc(p.email) + ' · ' + (p.role === 'admin' ? 'Admin' : 'Salesperson') + (p.active ? '' : ' · inactive') + '</span></li>';
      }).join('') || '<li>No team members yet.</li>';
    });
  }
  $('#inviteForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, m = f.querySelector('.formmsg');
    m.textContent = 'Sending invite...';
    AZ.api('invite-staff', { full_name: f.full_name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), role: f.role.value })
      .then(function () { m.textContent = 'Invite sent.'; f.reset(); loadTeam(); }).catch(function (err) { m.textContent = err.message; });
  });


  // ---------- Profit and margin (admins only) ----------
  // Costs live in their own admin-only tables (sale_costs, product_costs), never on the sale itself,
  // so salespeople and customers can't read them.
  var DELIVERY_COST = ''; // set this once Shaun knows what a delivery usually costs us
  var COSTF = ['product_cost', 'sauna_cost', 'warehouse_shipping', 'delivery_cost', 'other_costs'];
  var costList = null;
  function getCostList() {
    if (costList) return Promise.resolve(costList);
    return sb.from('product_costs').select('id,product_type,line_id,model,cost,msrp,sale_price,note').order('product_type').order('model').then(function (r) { costList = r.data || []; return costList; });
  }
  function revenueOf(s) { return num(s.hot_tub_value) + num(s.sauna_total) + num(s.extras_total) + num(s.delivery_fee); }
  // Add-on costs and the commission are filled in by the database when the deal is built.
  function costOf(c) { return COSTF.reduce(function (t, k) { return t + num(c && c[k]); }, 0) + num(c && c.extras_cost) + num(c && c.commission); }
  function pct(x) { return isFinite(x) ? (Math.round(x * 1000) / 10).toFixed(1) + '%' : '-'; }
  // Cost list entries for a model: an exact match, or its finish variants like "Cube 210 (Nero)".
  function matches(type, model) {
    var m = String(model || '').toLowerCase().trim(); if (!m || !costList) return [];
    var exact = costList.filter(function (c) { return c.product_type === type && c.model.toLowerCase() === m; });
    return exact.length ? exact : costList.filter(function (c) { return c.product_type === type && c.model.toLowerCase().indexOf(m + ' (') === 0; });
  }
  function hintFor(el, field, list) {
    el.innerHTML = list.length ? 'Cost list: ' + list.map(function (c) { return '<button type="button" data-f="' + field + '" data-v="' + c.cost + '">' + AZ.esc(c.model) + ' ' + AZ.money(c.cost) + '</button>'; }).join('') : 'Not on the cost list yet';
  }
  var pf = $('#profitForm');
  function profitSums() {
    if (!current) return;
    var c = { extras_cost: current._auto ? current._auto.extras_cost : 0, commission: current._auto ? current._auto.commission : 0 }; COSTF.forEach(function (k) { c[k] = num(pf[k].value); });
    var rev = revenueOf(current), cost = costOf(c), profit = rev - cost, m = rev ? profit / rev : NaN;
    $('#profitSums').innerHTML = [['Sale price before GST and PST', AZ.money(rev)]].concat(c.extras_cost ? [['Add-ons cost (automatic)', AZ.money(c.extras_cost)]] : []).concat(c.commission ? [['Salesperson commission (automatic)', AZ.money(c.commission)]] : []).concat([['Our total cost', AZ.money(cost)], ['Profit', AZ.money(profit), profit >= 0 ? 'good' : 'bad'],  ['Margin', pct(m), profit >= 0 ? 'good' : 'bad']])
      .map(function (r) { return '<div class="strong ' + (r[2] || '') + '"><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('');
  }
  function openProfit(sale) {
    var card = $('#profitCard');
    if (!sale || me.profile.role !== 'admin') { card.hidden = true; return; }
    card.hidden = false; $('#profitMsg').textContent = '';
    var sauna = sale.product_type === 'sauna';
    $('#pcLabel').textContent = (sauna ? 'Sauna cost with heater' : AZ.cap(AZ.noun(sale)) + ' cost') + ' (CAD)';
    $('#scWrap').hidden = sauna || !sale.sauna_model;
    Promise.all([getCostList(), sb.from('sale_costs').select('*').eq('sale_id', sale.id).maybeSingle()]).then(function (res) {
      var saved = res[1].data; sale._auto = { extras_cost: saved ? num(saved.extras_cost) : 0, commission: saved ? num(saved.commission) : 0 };
      var mainList = matches(sale.product_type || 'hot_tub', sauna ? sale.sauna_model : sale.tub_model);
      var addList = !sauna && sale.sauna_model ? matches('sauna', sale.sauna_model) : [];
      hintFor($('#pcHint'), 'product_cost', mainList); hintFor($('#scHint'), 'sauna_cost', addList);
      COSTF.forEach(function (k) { pf[k].value = saved && Number(saved[k]) ? saved[k] : ''; });
      pf.notes.value = (saved && saved.notes) || '';
      // First time: fill the cost from the list when there's exactly one match.
      if (!saved) {
        pf.delivery_cost.value = DELIVERY_COST;
        if (mainList.length === 1) pf.product_cost.value = mainList[0].cost;
        if (addList.length === 1) pf.sauna_cost.value = addList[0].cost;
        $('#profitMsg').textContent = (mainList.length === 1 ? 'Cost filled in from the cost list. ' : '') + 'Add freight, delivery and anything else, then save.';
      }
      profitSums();
    });
  }
  pf.addEventListener('input', profitSums);
  pf.addEventListener('click', function (e) { var b = e.target.closest('button[data-f]'); if (!b) return; pf[b.dataset.f].value = b.dataset.v; profitSums(); });
  $('#profitSave').addEventListener('click', function () {
    var m = $('#profitMsg'); if (!current) return;
    var d = { sale_id: current.id, notes: pf.notes.value.trim() || null, updated_at: new Date().toISOString(), updated_by: me.user.id };
    COSTF.forEach(function (k) { d[k] = num(pf[k].value); });
    m.textContent = 'Saving...';
    sb.from('sale_costs').upsert(d, { onConflict: 'sale_id' }).then(function (r) { m.textContent = r.error ? r.error.message : 'Saved.'; if (!r.error) AZ.toast('Costs saved'); });
  });
  function listProfits(rows) {
    var sold = rows.filter(function (s) { return SIGNED.indexOf(s.status) >= 0; });
    if (!sold.length) return;
    sb.from('sale_costs').select('*').in('sale_id', sold.map(function (s) { return s.id; })).then(function (r) {
      var by = {}; (r.data || []).forEach(function (c) { by[c.sale_id] = c; });
      sold.forEach(function (s) {
        var pc = $('[data-profit="' + s.id + '"]'), mc = $('[data-margin="' + s.id + '"]'); if (!pc) return;
        var c = by[s.id];
        if (!c) { pc.innerHTML = '<span class="muted small">Add costs</span>'; return; }
        var rev = revenueOf(s), profit = rev - costOf(c);
        pc.textContent = AZ.money(profit); pc.className = 'num ' + (profit >= 0 ? 'pos' : 'neg');
        mc.textContent = rev ? pct(profit / rev) : '-';
      });
    });
  }


  // ---------- Financials (admins) ----------
  // Sold = signed or further along. A deal counts in the month the customer signed (or the sale date if older).
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var moneyData = null;
  function soldDate(s) { return new Date(s.customer_signed_at || (s.sale_date + 'T12:00:00')); }
  function unitsOf(s) { return (s.product_type === 'sauna' ? (s.sauna_model ? 1 : 0) : (s.tub_model ? 1 : 0) + (s.sauna_model ? 1 : 0)) || 1; }
  function loadMoney() {
    $('#moneyRows').innerHTML = '<tr><td colspan="9" class="empty">Loading...</td></tr>';
    Promise.all([
      sb.from('sales').select('id,number,status,product_type,tub_model,tub_line,sauna_model,hot_tub_value,sauna_total,extras_total,delivery_fee,sale_date,customer_signed_at,recorded_past,payment_type,deposit,balance,deposit_paid_at,balance_paid_at,salesperson_id,customers(name),profiles!sales_salesperson_id_fkey(full_name,email)').in('status', SIGNED).limit(5000),
      sb.from('sale_costs').select('*').limit(5000),
      sb.from('sale_deal').select('*').limit(5000)
    ]).then(function (res) {
      var costs = {}; (res[1].data || []).forEach(function (c) { costs[c.sale_id] = c; });
      dealsBy = {}; (res[2].data || []).forEach(function (d) { dealsBy[d.sale_id] = d; });
      moneyData = (res[0].data || []).map(function (s) { return { s: s, d: soldDate(s), c: costs[s.id] }; });
      var years = {}; moneyData.forEach(function (x) { years[x.d.getFullYear()] = 1; });
      var now = new Date().getFullYear(); years[now] = 1;
      var sel = $('#moneyYear'), keep = sel.value;
      sel.innerHTML = Object.keys(years).sort().reverse().map(function (y) { return '<option>' + y + '</option>'; }).join('');
      sel.value = keep && years[keep] ? keep : String(now);
      renderMoney();
    });
  }

  // ---------- Commissions and pad check (Financials, admins) ----------
  var dealsBy = {};
  // Paid in full: everything paid on signing, or the balance has been paid.
  function paidInFull(s) {
    if (s.balance_paid_at) return s.balance_paid_at;
    if (s.deposit_paid_at && (s.payment_type === 'full' || num(s.balance) <= 0)) return s.deposit_paid_at;
    return null;
  }
  function repName(s) { return s.profiles ? (s.profiles.full_name || s.profiles.email) : 'No salesperson'; }
  function renderCommissions() {
    var year = Number($('#moneyYear').value);
    var rows = moneyData.filter(function (x) { return dealsBy[x.s.id] && x.d.getFullYear() === year; })
      .sort(function (a, b) { return repName(a.s).localeCompare(repName(b.s)) || b.d - a.d; });
    var sum = {};
    rows.forEach(function (x) {
      var d = dealsBy[x.s.id], n = repName(x.s), st = d.commission_paid_at ? 'paid' : paidInFull(x.s) ? 'owed' : 'waiting';
      x.comm = st; sum[n] = sum[n] || { owed: 0, waiting: 0, paid: 0 }; sum[n][st] += num(d.commission);
    });
    $('#commSum').innerHTML = Object.keys(sum).length ? Object.keys(sum).map(function (n) {
      var t = sum[n];
      return '<div><b>' + AZ.esc(n) + '</b><span class="owed">Owed now ' + AZ.money(t.owed) + '</span><span>Waiting for full payment ' + AZ.money(t.waiting) + '</span><span>Paid in ' + year + ' ' + AZ.money(t.paid) + '</span></div>';
    }).join('') : '';
    var LBL = { owed: '<span class="pill pill-gold">Owed now</span>', waiting: '<span class="pill">Waiting for full payment</span>' };
    $('#commRows').innerHTML = rows.length ? rows.map(function (x) {
      var d = dealsBy[x.s.id];
      var status = x.comm === 'paid' ? '<span class="pill pill-green">Paid ' + AZ.date(d.commission_paid_at) + '</span>' : LBL[x.comm];
      var btn = x.comm === 'owed' ? '<button class="btn btn-ink btn-sm" type="button" data-cpay="' + x.s.id + '">Mark paid</button>' : x.comm === 'paid' ? '<button class="linkbtn" type="button" data-cundo="' + x.s.id + '">Undo</button>' : '';
      return '<tr><td>' + AZ.esc(repName(x.s)) + '</td><td><a href="#sale-' + x.s.id + '">' + x.s.number + '</a></td><td>' + AZ.esc(x.s.customers && x.s.customers.name) + '</td><td>' + AZ.esc(AZ.what(x.s) || '') + '</td><td>' + AZ.date(x.d) + '</td>' +
        '<td class="num">' + AZ.money(d.deal_gp) + '</td><td class="num"><b>' + AZ.money(d.commission) + '</b></td><td>' + status + '</td><td>' + btn + '</td></tr>';
    }).join('') : '<tr><td colspan="9" class="empty">No commissions yet for ' + year + '. They show up here once a deal built with the price list is signed.</td></tr>';
  }
  $('#commRows').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cpay],[data-cundo]'); if (!b) return;
    var id = b.dataset.cpay || b.dataset.cundo, when = b.dataset.cpay ? new Date().toISOString() : null;
    if (b.dataset.cundo && b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Tap again to undo'; setTimeout(function () { b.dataset.confirm = ''; b.textContent = 'Undo'; }, 4000); return; }
    sb.from('sale_deal').update({ commission_paid_at: when, updated_at: new Date().toISOString() }).eq('sale_id', id).then(function (r) {
      if (r.error) return AZ.toast(r.error.message);
      dealsBy[id].commission_paid_at = when; AZ.toast(when ? 'Commission marked paid' : 'Commission back to owed'); renderCommissions();
    });
  });
  function renderPads() {
    var year = Number($('#moneyYear').value), by = {};
    moneyData.forEach(function (x) {
      if (x.d.getFullYear() !== year || !x.c) return;
      var pad = num(x.c.pad), spent = num(x.c.warehouse_shipping) + num(x.c.other_costs);
      if (!pad && !spent) return;
      var line = x.s.tub_line || ({ swim_spa: 'Swim spas', mini_pool: 'Mini pools' }[x.s.product_type]) || 'Other';
      by[line] = by[line] || { n: 0, pad: 0, spent: 0 }; by[line].n++; by[line].pad += pad; by[line].spent += spent;
    });
    var keys = Object.keys(by);
    $('#padRows').innerHTML = keys.length ? keys.map(function (k) {
      var t = by[k], diff = t.pad - t.spent;
      return '<tr><td class="model">' + AZ.esc(k) + '</td><td class="num">' + t.n + '</td><td class="num">' + AZ.money(t.pad) + '</td><td class="num">' + AZ.money(t.spent) + '</td><td class="num"><b class="' + (diff < 0 ? 'neg' : 'pos') + '">' + AZ.money(diff) + '</b></td><td class="num">' + AZ.money(diff / t.n) + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="empty">Nothing to compare yet for ' + year + '. Once deals have a pad and you enter their freight and other costs, it shows here by line.</td></tr>';
  }

  function renderMoney() {
    if (!moneyData) return;
    renderCommissions(); renderPads();
    var year = Number($('#moneyYear').value), thisMonth = new Date().getFullYear() === year ? new Date().getMonth() : 11;
    var m = MONTHS.map(function () { return { units: 0, sold: 0, profit: 0, costedSold: 0, deals: 0, missing: 0 }; });
    moneyData.forEach(function (x) {
      if (x.d.getFullYear() !== year) return;
      var b = m[x.d.getMonth()], rev = revenueOf(x.s);
      b.units += unitsOf(x.s); b.sold += rev; b.deals++;
      if (x.c) { b.profit += rev - costOf(x.c); b.costedSold += rev; } else b.missing++;
    });
    var run = { units: 0, sold: 0, profit: 0, costedSold: 0, deals: 0, missing: 0 };
    var cell = function (v, cls) { return '<td class="num' + (cls ? ' ' + cls : '') + '">' + v + '</td>'; };
    var mg = function (b) { return b.costedSold ? pct(b.profit / b.costedSold) : '-'; };
    var pf = function (b) { return b.costedSold ? AZ.money(b.profit) : '-'; };
    var rows = [];
    for (var i = 0; i <= thisMonth; i++) {
      var b = m[i];
      ['units', 'sold', 'profit', 'costedSold', 'deals', 'missing'].forEach(function (k) { run[k] += b[k]; });
      var flag = b.missing ? ' <span class="muted small" title="Deals without costs saved">(' + b.missing + ' without costs)</span>' : '';
      rows.push('<tr' + (b.deals ? ' class="mrow" data-m="' + i + '" tabindex="0" aria-expanded="false"' : ' class="quiet"') + '><td>' + (b.deals ? '<span class="caret" aria-hidden="true">&#9656;</span> ' : '') + MONTHS[i] + flag + '</td>' +
        cell(b.units || '-') + cell(b.sold ? AZ.money(b.sold) : '-') + cell(pf(b), b.profit < 0 ? 'neg' : '') + cell(mg(b)) +
        cell(run.units || '-', 'ytd') + cell(run.sold ? AZ.money(run.sold) : '-', 'ytd') + cell(pf(run), 'ytd' + (run.profit < 0 ? ' neg' : '')) + cell(mg(run), 'ytd') + '</tr>');
    }
    $('#moneyRows').innerHTML = rows.reverse().join('');
    $('#moneyFoot').innerHTML = '<tr><td><b>' + year + ' total</b></td>' + cell('<b>' + run.units + '</b>') + cell('<b>' + AZ.money(run.sold) + '</b>') + cell('<b>' + pf(run) + '</b>') + cell('<b>' + mg(run) + '</b>') + '<td colspan="4"></td></tr>';
    $('#moneyCards').innerHTML = [['Units sold', run.units], ['Total sold', AZ.money(run.sold)], ['Total profit', pf(run)], ['Margin', mg(run)]]
      .map(function (c) { return '<div class="mcard"><span>' + c[0] + ' in ' + year + '</span><b>' + c[1] + '</b></div>'; }).join('');
    $('#moneyNote').textContent = run.missing
      ? run.missing + ' sold deal' + (run.missing > 1 ? 's' : '') + ' in ' + year + (run.missing > 1 ? " don't" : " doesn't") + ' have costs saved yet, so ' + (run.missing > 1 ? 'they count' : 'it counts') + ' in units and sales but not in profit or margin. Open ' + (run.missing > 1 ? 'each one' : 'it') + ' and save its costs to include it.'
      : 'Every sold deal in ' + year + ' has its costs saved.';
  }
  $('#moneyYear').addEventListener('change', renderMoney);
  function toggleMonth(tr) {
    var open = tr.getAttribute('aria-expanded') === 'true', next = tr.nextElementSibling;
    if (open) { if (next && next.classList.contains('mdetail')) next.remove(); tr.setAttribute('aria-expanded', 'false'); return; }
    var year = Number($('#moneyYear').value), mi = Number(tr.dataset.m);
    var deals = moneyData.filter(function (x) { return x.d.getFullYear() === year && x.d.getMonth() === mi; }).sort(function (a, b) { return a.d - b.d; });
    var rows = deals.map(function (x) {
      var rev = revenueOf(x.s), cost = x.c ? costOf(x.c) : null, profit = cost == null ? null : rev - cost;
      return '<tr data-go="' + x.s.id + '" tabindex="0"><td>#' + x.s.number + (x.s.recorded_past ? ' <span class="pill pill-grey">Past</span>' : '') + '</td><td>' + AZ.esc(x.s.customers ? x.s.customers.name : '') + '</td><td>' + AZ.esc(AZ.what(x.s) || '-') + '</td><td>' + x.d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) + '</td><td>' + AZ.pill(x.s.status) + '</td>' +
        '<td class="num">' + unitsOf(x.s) + '</td><td class="num">' + AZ.money(rev) + '</td><td class="num">' + (cost == null ? '<span class="muted small">Add costs</span>' : AZ.money(cost)) + '</td>' +
        '<td class="num ' + (profit == null ? '' : profit >= 0 ? 'pos' : 'neg') + '">' + (profit == null ? '-' : AZ.money(profit)) + '</td><td class="num">' + (profit == null || !rev ? '-' : pct(profit / rev)) + '</td></tr>';
    }).join('');
    var d = document.createElement('tr'); d.className = 'mdetail';
    d.innerHTML = '<td colspan="9"><table class="saletable dealtable"><thead><tr><th>#</th><th>Customer</th><th>What</th><th>Signed</th><th>Status</th><th class="num">Units</th><th class="num">Sold</th><th class="num">Our cost</th><th class="num">Profit</th><th class="num">Margin</th></tr></thead><tbody>' + rows + '</tbody></table></td>';
    tr.after(d); tr.setAttribute('aria-expanded', 'true');
  }
  $('#moneyRows').addEventListener('click', function (e) {
    var go = e.target.closest('tr[data-go]'); if (go) { location.hash = 'sale-' + go.dataset.go; return; }
    var tr = e.target.closest('tr.mrow'); if (tr) toggleMonth(tr);
  });
  $('#moneyRows').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var go = e.target.closest('tr[data-go]'); if (go) { location.hash = 'sale-' + go.dataset.go; return; }
    var tr = e.target.closest('tr.mrow'); if (tr) toggleMonth(tr);
  });

  // ---------- Record a past sale (admins) ----------
  var pform = $('#pastForm'), pastType = $('#pastType'), pastModel = $('#pastModel'), pastOther = $('#pastModelOther'), pastAddon = $('#pastAddon');
  pastAddon.innerHTML = modelOptions('sauna', 'No sauna').replace('<option value="__other">Other model (type it in)...</option>', '');
  function pastApplyType() {
    var t = pastType.value, sauna = t === 'sauna';
    pastModel.innerHTML = modelOptions(t, 'Choose a ' + AZ.NOUN[t] + '...'); pastOther.hidden = true; pastOther.value = '';
    $('#pastPriceLbl').textContent = AZ.cap(AZ.NOUN[t]) + ' price before GST and PST';
    $('#pastCostLbl').textContent = sauna ? 'Sauna cost with heater' : AZ.cap(AZ.NOUN[t]) + ' cost';
    $$('#pastForm .pastaddon').forEach(function (l) { l.hidden = true; });
    pastHints();
  }
  function pastHints() {
    getCostList().then(function () {
      var t = pastType.value, model = modelVal(pastModel, pastOther);
      var main = matches(t, model), add = matches('sauna', pastAddon.value);
      hintFor($('#pastCostHint'), 'product_cost', main); hintFor($('#pastAddonHint'), 'sauna_cost', add);
      if (main.length === 1 && !pform.product_cost.value) pform.product_cost.value = main[0].cost;
      if (add.length === 1 && !pform.sauna_cost.value) pform.sauna_cost.value = add[0].cost;
      pastSums();
    });
  }
  function pastSums() {
    var sauna = pastType.value === 'sauna';
    var rev = num(pform.price.value) + (sauna ? 0 : num(pform.addon_price.value)) + num(pform.delivery_fee.value);
    var cost = num(pform.product_cost.value) + (sauna ? 0 : num(pform.sauna_cost.value)) + num(pform.warehouse_shipping.value) + num(pform.delivery_cost.value) + num(pform.other_costs.value);
    var profit = rev - cost;
    $('#pastSums').innerHTML = [['Sold before GST and PST', AZ.money(rev)], ['Our total cost', AZ.money(cost)], ['Profit', AZ.money(profit), profit >= 0 ? 'good' : 'bad'], ['Margin', rev ? pct(profit / rev) : '-', profit >= 0 ? 'good' : 'bad']]
      .map(function (r) { return '<div class="strong ' + (r[2] || '') + '"><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('');
  }
  pastType.addEventListener('change', function () { pform.product_cost.value = ''; pastApplyType(); });
  pastModel.addEventListener('change', function () { pastOther.hidden = pastModel.value !== '__other'; if (!pastOther.hidden) pastOther.focus(); pform.product_cost.value = ''; pastHints(); });
  pastOther.addEventListener('change', function () { pform.product_cost.value = ''; pastHints(); });
  pastAddon.addEventListener('change', function () { pform.sauna_cost.value = ''; pastHints(); });
  pform.addEventListener('input', pastSums);
  pform.addEventListener('click', function (e) { var b = e.target.closest('button[data-f]'); if (!b) return; pform[b.dataset.f].value = b.dataset.v; pastSums(); });
  $('#pastOpen').addEventListener('click', function () {
    $('#pastCard').hidden = false; pform.reset(); pform.delivery_cost.value = DELIVERY_COST; pform.querySelector('.formmsg').textContent = '';
    pastApplyType(); pform.name.focus();
  });
  $('#pastCancel').addEventListener('click', function () { $('#pastCard').hidden = true; });
  pform.addEventListener('submit', function (e) {
    e.preventDefault();
    var m = pform.querySelector('.formmsg'), sauna = pastType.value === 'sauna';
    var body = {
      name: pform.name.value, email: pform.email.value, cell: pform.cell.value, city_pc: pform.city_pc.value, sale_date: pform.sale_date.value,
      status: pform.status.value, product_type: pastType.value, model: modelVal(pastModel, pastOther), price: pform.price.value,
      addon_model: sauna ? null : pastAddon.value || null, addon_price: sauna ? 0 : pform.addon_price.value, delivery_fee: pform.delivery_fee.value, notes: pform.notes.value,
      costs: { product_cost: pform.product_cost.value, sauna_cost: sauna ? 0 : pform.sauna_cost.value, warehouse_shipping: pform.warehouse_shipping.value, delivery_cost: pform.delivery_cost.value, other_costs: pform.other_costs.value }
    };
    m.textContent = 'Saving...';
    AZ.api('past-sale', body).then(function (r) {
      AZ.toast('Past sale #' + r.number + ' saved'); $('#pastCard').hidden = true;
      var y = (pform.sale_date.value || '').slice(0, 4); loadMoney(); if (y) setTimeout(function () { if ($('#moneyYear').querySelector('option[value="' + y + '"]')) { $('#moneyYear').value = y; renderMoney(); } }, 600);
    }).catch(function (err) { m.textContent = err.message; });
  });

  // ---------- Products tab (admins): settings, line pads, price list, add-ons ----------
  var CAT = { hot_tub: 'Hot tub', swim_spa: 'Swim spa', mini_pool: 'Mini pool', sauna: 'Sauna' };
  var costCat = '', lines = [], pset = { commission_pct: 25, min_margin_pct: 40, website_prices: 'off' };
  var DEFAULT_LINE = { swim_spa: 'Swim spas', mini_pool: 'Mini pools' };
  // Which line a model belongs to, from the website's own catalogue.
  var lineOfModel = (function () {
    var m = {}, P = window.AZ_PRODUCTS || {};
    Object.keys(P).forEach(function (t) { (P[t].groups || []).forEach(function (g) { (g.items || []).forEach(function (it) { m[t + '|' + it.n.toLowerCase()] = g.name || DEFAULT_LINE[t] || ''; }); }); });
    return function (type, model) { return m[type + '|' + String(model || '').toLowerCase()] || DEFAULT_LINE[type] || ''; };
  })();
  function lineId(type, name) { var l = lines.filter(function (x) { return x.product_type === type && x.name === name; })[0]; return l ? l.id : null; }
  function lineById(id) { return lines.filter(function (x) { return x.id === id; })[0] || null; }
  function calc(cost, pad, price) {
    cost = +cost || 0; pad = +pad || 0;
    // The floor is on TRUE cost (not the padded sales cost): price must keep the minimum margin over what we pay.
    var sales = cost + pad, o = { sales: sales, min: Math.ceil(cost / (1 - pset.min_margin_pct / 100)) };
    if (price == null || price === '' || !+price) return o;
    // The pad lowers the salesperson's GP but stays with the business: our profit is price - true cost (- commission).
    price = +price; o.price = price; o.gp = price - sales; o.margin = o.gp / price * 100;
    o.comm = o.gp > 0 ? o.gp * pset.commission_pct / 100 : 0;
    o.before = price - cost; o.beforeMargin = o.before / price * 100; o.profit = o.before - o.comm; o.low = cost > 0 && price < o.min;
    return o;
  }
  var dash = '<span class="muted">-</span>';
  // Re-draw a table without losing the box the person just tabbed into.
  function redraw(tb, html) {
    var ae = document.activeElement, keep = null;
    if (ae && tb.contains(ae) && ae.dataset) { var tr = ae.closest('tr'); keep = { row: tr && (tr.dataset.cost || tr.dataset.addon || tr.dataset.line), f: ae.dataset.f || (ae.hasAttribute('data-offer') ? 'offer' : '') }; }
    tb.innerHTML = html;
    if (keep && keep.row) {
      var row = tb.querySelector('tr[data-cost="' + keep.row + '"],tr[data-addon="' + keep.row + '"],tr[data-line="' + keep.row + '"]');
      var el = row && row.querySelector(keep.f === 'offer' ? '[data-offer]' : '[data-f="' + keep.f + '"]'); if (el) el.focus();
    }
  }
  function gpCells(o) {
    if (o.gp == null) return '<td class="num g-sales">' + dash + '</td><td class="num g-sales">' + dash + '</td><td class="num g-admin">' + dash + '</td><td class="num g-admin">' + dash + '</td>';
    return '<td class="num g-sales"><b class="' + (o.gp < 0 ? 'neg' : '') + '">' + AZ.money(o.gp) + '</b><span class="pct">' + (Math.round(o.margin * 10) / 10) + '%</span></td>' +
      '<td class="num g-sales">' + AZ.money(o.comm) + '</td><td class="num g-admin"><b class="' + (o.before < 0 ? 'neg' : '') + '">' + AZ.money(o.before) + '</b><span class="pct">' + (Math.round(o.beforeMargin * 10) / 10) + '% margin</span></td><td class="num g-admin"><b class="' + (o.profit < 0 ? 'neg' : '') + '">' + AZ.money(o.profit) + '</b><span class="pct">' + (Math.round(o.profit / o.price * 1000) / 10) + '% margin</span></td>';
  }
  function moneyInput(c, f, label) {
    var v = c[f] == null ? '' : c[f];
    return '<input type="number" step="0.01" min="0" inputmode="decimal" data-f="' + f + '" value="' + v + '" aria-label="' + label + ' of ' + AZ.esc(c.model || c.name) + '">';
  }
  function lineSelect(c) {
    var opts = lines.filter(function (l) { return l.product_type === c.product_type; });
    return '<select data-f="line_id" aria-label="Line for ' + AZ.esc(c.model) + '"><option value="">No line</option>' + opts.map(function (l) { return '<option value="' + l.id + '"' + (l.id === c.line_id ? ' selected' : '') + '>' + AZ.esc(l.name) + '</option>'; }).join('') + '</select>';
  }

  function loadPricing() {
    return Promise.all([sb.rpc('pricing_settings'), sb.from('product_lines').select('*').order('sort').order('name')]).then(function (res) {
      if (res[0].data) pset = res[0].data;
      lines = res[1].data || [];
      $('#setCommission').value = pset.commission_pct; $('#setMargin').value = pset.min_margin_pct;
      $('#setWebsite').checked = pset.website_prices === 'on'; $('#setWebsiteLbl').textContent = pset.website_prices === 'on' ? 'Showing' : 'Hidden';
      redraw($('#lineRows'), lines.map(function (l) {
        return '<tr data-line="' + l.id + '"><td class="model">' + AZ.esc(l.name) + ' <span class="muted small">' + CAT[l.product_type] + '</span></td>' +
          '<td class="num"><span class="padbox">$<input type="number" step="0.01" min="0" inputmode="decimal" data-f="pad" value="' + l.pad + '" aria-label="Pad for ' + AZ.esc(l.name) + '"></span></td>' +
          '<td><label class="switch"><input type="checkbox" data-f="show_price"' + (l.show_price ? ' checked' : '') + '><span>' + (l.show_price ? 'Yes' : 'No') + '</span></label></td><td class="muted">' + AZ.esc(l.manufacturer) + '</td></tr>';
      }).join(''));
      $('#costAddLine').innerHTML = lines.map(function (l) { return '<option value="' + l.id + '">' + AZ.esc(l.name) + ' (' + CAT[l.product_type] + ')</option>'; }).join('');
    });
  }
  function loadProducts() { loadPricing().then(function () { loadCosts(); loadAddons(); }); }
  function putSettings(d) {
    return sb.rpc('pricing_settings_put', { commission_pct: d.c == null ? null : d.c, min_margin_pct: d.m == null ? null : d.m, website_prices: d.w || null })
      .then(function (r) { if (r.error) { AZ.toast(r.error.message); return; } return sb.rpc('pricing_settings').then(function (s) { if (s.data) pset = s.data; loadCosts(); loadAddons(); }); });
  }
  $('#setCommission').addEventListener('change', function () { putSettings({ c: num(this.value) }).then(function () { AZ.toast('Commission saved'); }); });
  $('#setMargin').addEventListener('change', function () { putSettings({ m: num(this.value) }).then(function () { AZ.toast('Lowest margin saved'); }); });
  $('#setWebsite').addEventListener('change', function () {
    var on = this.checked; $('#setWebsiteLbl').textContent = on ? 'Showing' : 'Hidden';
    putSettings({ w: on ? 'on' : 'off' }).then(function () { AZ.toast(on ? 'Prices are showing on the website' : 'Prices are hidden on the website'); });
  });
  $('#lineRows').addEventListener('change', function (e) {
    var tr = e.target.closest('tr[data-line]'); if (!tr || !e.target.dataset.f) return;
    var f = e.target.dataset.f, d = { updated_at: new Date().toISOString() };
    d[f] = f === 'pad' ? num(e.target.value) : e.target.checked;
    sb.from('product_lines').update(d).eq('id', tr.dataset.line).then(function (r) {
      if (r.error) return AZ.toast(r.error.message);
      if (f === 'show_price') e.target.nextElementSibling.textContent = d.show_price ? 'Yes' : 'No';
      AZ.toast(f === 'pad' ? 'Pad saved' : 'Saved'); loadPricing().then(loadCosts);
    });
  });

  function loadCosts() {
    costList = null;
    getCostList().then(function (list) {
      // Give models without a line the one the website lists them under.
      list.forEach(function (c) {
        if (c.line_id) return; var id = lineId(c.product_type, lineOfModel(c.product_type, c.model));
        if (id) { c.line_id = id; sb.from('product_costs').update({ line_id: id }).eq('id', c.id).then(function () {}); }
      });
      // Group by line in line order (Series One, Two, Three, swim spas, mini pools), models in the website's order.
      var order = {}, P = window.AZ_PRODUCTS || {};
      Object.keys(P).forEach(function (t) { (P[t].groups || []).forEach(function (g) { (g.items || []).forEach(function (it, i) { order[t + '|' + it.n.toLowerCase()] = i; }); }); });
      var lsort = function (c) { var l = lineById(c.line_id); return l ? l.sort : 9999; };
      var rows = list.filter(function (c) { return !costCat || c.product_type === costCat; }).sort(function (a, b) {
        var oa = order[a.product_type + '|' + a.model.toLowerCase()], ob = order[b.product_type + '|' + b.model.toLowerCase()];
        return lsort(a) - lsort(b) || (oa == null ? 999 : oa) - (ob == null ? 999 : ob) || a.model.localeCompare(b.model);
      });
      var lastLine = null;
      redraw($('#costRows'), rows.length ? rows.map(function (c) {
        var head = '';
        if (c.line_id !== lastLine) {
          lastLine = c.line_id; var ln = lineById(c.line_id);
          head = '<tr class="linehead"><td colspan="14">' + (ln ? AZ.esc(ln.name) + '<span>' + CAT[ln.product_type] + 's &middot; pad ' + AZ.money(ln.pad) + ' per unit</span>' : 'No line yet<span>Pick a line for these models</span>') + '</td></tr>';
        }
        return head + rowFor(c);
      }).join('') : '<tr><td colspan="14" class="empty">' + (list.length ? 'Nothing in this category yet.' : 'No models yet. Upload your price sheet, or add a model.') + '</td></tr>');
    });
  }
  function rowFor(c) {
    {
        var l = lineById(c.line_id), pad = l ? +l.pad : 0, o = calc(c.cost, pad, c.sale_price);
        var save = c.msrp != null && c.sale_price != null ? AZ.money(c.msrp - c.sale_price) : dash;
        return '<tr data-cost="' + c.id + '"' + (o.low ? ' class="low"' : '') + '><td>' + lineSelect(c) + '</td><td class="model">' + AZ.esc(c.model) +
          (o.low ? '<span class="lowtag">Under the ' + pset.min_margin_pct + '% floor. Lowest price ' + AZ.money(o.min) + '</span>' : '') + '</td>' +
          '<td class="num g-admin">' + moneyInput(c, 'cost', 'True cost') + '</td><td class="num g-admin">' + AZ.money(pad) + '</td><td class="num">' + AZ.money(o.sales) + '</td>' +
          '<td class="num">' + moneyInput(c, 'msrp', 'MSRP') + '</td><td class="num">' + moneyInput(c, 'sale_price', 'Zen price') + '</td><td class="num">' + save + '</td>' +
          gpCells(o) + '<td class="src">' + AZ.esc(c.note || '') + '</td><td><button class="linkbtn" type="button" data-del="' + c.id + '">Remove</button></td></tr>';
    }
  }
  $('#costCat').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cat]'); if (!b) return;
    costCat = b.dataset.cat; $$('#costCat button').forEach(function (x) { x.classList.toggle('on', x === b); }); loadCosts();
  });
  $('#costRows').addEventListener('change', function (e) {
    var tr = e.target.closest('tr[data-cost]'), f = e.target.dataset.f; if (!tr || !f) return;
    var raw = e.target.value.trim(), d = { updated_at: new Date().toISOString(), updated_by: me.user.id };
    d[f] = f === 'line_id' ? (raw || null) : f === 'cost' ? num(raw) : (raw === '' ? null : num(raw));
    if (f === 'cost') d.note = 'Edited in the portal';
    sb.from('product_costs').update(d).eq('id', tr.dataset.cost).then(function (r) {
      if (r.error) return AZ.toast(r.error.message);
      AZ.toast({ cost: 'True cost', msrp: 'MSRP', sale_price: 'Zen price', line_id: 'Line' }[f] + ' saved'); loadCosts();
    });
  });
  $('#costRows').addEventListener('click', function (e) {
    var b = e.target.closest('[data-del]'); if (!b) return;
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Tap again'; setTimeout(function () { b.dataset.confirm = ''; b.textContent = 'Remove'; }, 4000); return; }
    sb.from('product_costs').delete().eq('id', b.dataset.del).then(function (r) { if (r.error) return AZ.toast(r.error.message); loadCosts(); });
  });
  $('#costAddOpen').addEventListener('click', function () { var f = $('#costAdd'); f.hidden = false; f.reset(); f.model.focus(); });
  $('#costAddCancel').addEventListener('click', function () { $('#costAdd').hidden = true; });
  $('#costAdd').addEventListener('submit', function (e) {
    e.preventDefault(); var f = e.target, opt = function (v) { return v.trim() === '' ? null : num(v); }, l = lineById(f.line_id.value);
    sb.from('product_costs').insert({ product_type: l ? l.product_type : 'hot_tub', line_id: l ? l.id : null, model: f.model.value.trim(), cost: num(f.cost.value), msrp: opt(f.msrp.value), sale_price: opt(f.sale_price.value), note: 'Added in the portal', updated_by: me.user.id })
      .then(function (r) {
        if (r.error) return AZ.toast(/duplicate|unique/i.test(r.error.message) ? 'That model is already on the list.' : r.error.message);
        AZ.toast(f.model.value.trim() + ' added'); f.hidden = true; loadCosts();
      });
  });

  function loadAddons() {
    sb.from('addons').select('*').order('sort').order('name').then(function (r) {
      if (r.error) { $('#addonRows').innerHTML = '<tr><td colspan="11" class="empty">' + AZ.esc(r.error.message) + '</td></tr>'; return; }
      var list = r.data || [];
      redraw($('#addonRows'), list.length ? list.map(function (a) {
        var o = calc(a.cost, a.pad, a.sale_price); o.low = false; // The lowest-margin rule is for hot tubs, swim spas and mini pools, not add-ons.
        return '<tr data-addon="' + a.id + '"' + (a.offered ? '' : ' class="off"') + '><td class="model">' + AZ.esc(a.name) + '</td>' +
          '<td class="num g-admin">' + moneyInput(a, 'cost', 'True cost') + '</td><td class="num g-admin">' + moneyInput(a, 'pad', 'Pad') + '</td><td class="num">' + AZ.money(o.sales) + '</td>' +
          '<td class="num">' + moneyInput(a, 'sale_price', 'Sale price') + '</td>' + gpCells(o) +
          '<td><label class="switch"><input type="checkbox" data-offer' + (a.offered ? ' checked' : '') + ' aria-label="We offer ' + AZ.esc(a.name) + '"><span>' + (a.offered ? 'Yes' : 'No') + '</span></label></td>' +
          '<td><button class="linkbtn" type="button" data-adel="' + a.id + '">Remove</button></td></tr>';
      }).join('') : '<tr><td colspan="11" class="empty">No add-ons yet. Add a cover lifter, steps or delivery.</td></tr>');
    });
  }
  $('#addonRows').addEventListener('change', function (e) {
    var tr = e.target.closest('tr[data-addon]'); if (!tr) return;
    var d = { updated_at: new Date().toISOString(), updated_by: me.user.id }, what;
    if (e.target.matches('[data-offer]')) { d.offered = e.target.checked; what = d.offered ? 'Offered' : 'No longer offered'; }
    else if (e.target.dataset.f) { var f = e.target.dataset.f, raw = e.target.value.trim(); d[f] = f === 'sale_price' ? (raw === '' ? null : num(raw)) : num(raw); what = { cost: 'True cost', pad: 'Pad', sale_price: 'Sale price' }[f] + ' saved'; }
    else return;
    sb.from('addons').update(d).eq('id', tr.dataset.addon).then(function (r) { if (r.error) return AZ.toast(r.error.message); AZ.toast(what); loadAddons(); });
  });
  $('#addonRows').addEventListener('click', function (e) {
    var b = e.target.closest('[data-adel]'); if (!b) return;
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Tap again'; setTimeout(function () { b.dataset.confirm = ''; b.textContent = 'Remove'; }, 4000); return; }
    sb.from('addons').delete().eq('id', b.dataset.adel).then(function (r) { if (r.error) return AZ.toast(r.error.message); loadAddons(); });
  });
  $('#addonAddOpen').addEventListener('click', function () { var f = $('#addonAdd'); f.hidden = false; f.reset(); f.name.focus(); });
  $('#addonAddCancel').addEventListener('click', function () { $('#addonAdd').hidden = true; });
  $('#addonAdd').addEventListener('submit', function (e) {
    e.preventDefault(); var f = e.target, name = f.name.value.trim();
    sb.from('addons').insert({ name: name, cost: num(f.cost.value), pad: num(f.pad.value), sale_price: f.sale_price.value.trim() === '' ? null : num(f.sale_price.value), updated_by: me.user.id }).then(function (r) {
      if (r.error) return AZ.toast(/duplicate|unique/i.test(r.error.message) ? 'That add-on is already on the list.' : r.error.message);
      AZ.toast(name + ' added'); f.hidden = true; loadAddons();
    });
  });

  $('#costDownload').addEventListener('click', function () {
    getCostList().then(function (list) {
      var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
      var csv = 'Category,Line,Model,True cost (CAD),Pad,Sales cost,MSRP,Zen price,They save,Salesperson GP,Margin %,Commission,Your profit,Source\n' + list.map(function (c) {
        var l = lineById(c.line_id), pad = l ? +l.pad : 0, o = calc(c.cost, pad, c.sale_price), r2 = function (x) { return x == null ? '' : (Math.round(x * 100) / 100).toFixed(2); };
        return [CAT[c.product_type], l ? l.name : '', c.model, c.cost, pad, r2(o.sales), c.msrp, c.sale_price, c.msrp != null && c.sale_price != null ? r2(c.msrp - c.sale_price) : '', r2(o.gp), o.margin == null ? '' : o.margin.toFixed(1), r2(o.comm), r2(o.profit), c.note].map(q).join(',');
      }).join('\n');
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'aquazen-price-list.csv'; a.click();
    });
  });
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise(function (ok, fail) {
      var sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      sc.onload = function () { ok(window.XLSX); }; sc.onerror = function () { fail(new Error("Couldn't load the spreadsheet reader. Check your connection and try again.")); };
      document.head.appendChild(sc);
    });
  }
  // Reads the AquaSolus price sheet, or any sheet with Model and Cost columns.
  function parseSheet(rows, sheetName, rate) {
    var out = [], hdr = -1, mCol = -1, cCol = -1, catCol = -1, usd = false, sect = null;
    var low = function (v) { return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim(); };
    var catOf = function (t) { t = low(t); return /swim/.test(t) ? 'swim_spa' : /mini ?pool/.test(t) ? 'mini_pool' : /sauna|hekla/.test(t) ? 'sauna' : /hot ?tub|spa|deluxe|premium|luxury/.test(t) ? 'hot_tub' : null; };
    for (var i = 0; i < rows.length && hdr < 0; i++) {
      var r = rows[i] || [];
      for (var j = 0; j < r.length; j++) if (/^model/.test(low(r[j]))) { hdr = i; mCol = j; break; }
    }
    if (hdr < 0) return { error: 'No "Model" column found in ' + sheetName + '.' };
    var h = (rows[hdr] || []).map(low), pick = function (test) { for (var k = 0; k < h.length; k++) if (test(h[k])) return k; return -1; };
    cCol = pick(function (t) { return /(cdn|cad)/.test(t) && /landed/.test(t); });
    if (cCol < 0) cCol = pick(function (t) { return /(cdn|cad)/.test(t) && /cost/.test(t); });
    if (cCol < 0) { cCol = pick(function (t) { return /landed/.test(t) && /usd/.test(t); }); usd = cCol >= 0; }
    if (cCol < 0) { cCol = pick(function (t) { return /cost|trade|price/.test(t) && !/retail|sale|msrp|map/.test(t); }); usd = cCol >= 0 && /usd/.test(h[cCol]); }
    catCol = pick(function (t) { return /^(category|type|product)/.test(t); });
    var msrpCol = pick(function (t) { return /msrp|retail/.test(t); }), saleCol = pick(function (t) { return /sale ?price|selling|our price/.test(t); });
    var money = function (x) { var n = typeof x === 'number' ? x : parseFloat(String(x == null ? '' : x).replace(/[$,\s]/g, '')); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
    if (cCol < 0) return { error: 'No cost column found in ' + sheetName + '.' };
    var sheetCat = catOf(sheetName);
    for (var n = hdr + 1; n < rows.length; n++) {
      var row = rows[n] || [], name = String(row[mCol] == null ? '' : row[mCol]).trim(), v = row[cCol];
      if (!name) continue;
      if ((v === '' || v == null) && row.filter(function (x) { return x !== '' && x != null; }).length === 1) { sect = catOf(name) || sect; continue; }
      var cost = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,\s]/g, ''));
      if (!isFinite(cost) || cost <= 0) continue;
      var model = name.replace(/\s+Professional\b/i, ' Pro').replace(/^Palmero$/i, 'Palermo');
      var cat = (catCol >= 0 && catOf(row[catCol])) || sect || sheetCat || 'hot_tub';
      out.push({ product_type: cat, model: model, cost: Math.round((usd ? cost * rate : cost) * 100) / 100,
        msrp: msrpCol >= 0 && msrpCol !== cCol ? money(row[msrpCol]) : null, sale_price: saleCol >= 0 && saleCol !== cCol ? money(row[saleCol]) : null,
        note: sheetName + ': ' + String(rows[hdr][cCol]).replace(/\s+/g, ' ').trim() + (usd ? ' x ' + rate : '') });
    }
    return { rows: out };
  }
  var pending = null;
  $('#costFile').addEventListener('change', function () {
    var f = this.files[0], m = $('#costMsg'); if (!f) return;
    var rate = num($('#costRate').value) || 1;
    m.textContent = 'Reading ' + f.name + '...';
    loadXlsx().then(function (X) { return f.arrayBuffer().then(function (buf) { return X.read(buf, { type: 'array' }); }); }).then(function (wb) {
      var all = [], errs = [];
      wb.SheetNames.forEach(function (sn) {
        var rows = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' });
        var p = parseSheet(rows, sn, rate); if (p.error) errs.push(p.error); else all = all.concat(p.rows);
      });
      $('#costFile').value = '';
      if (!all.length) { m.textContent = errs.join(' ') || 'No costs found in that file.'; return; }
      pending = all; m.textContent = '';
      var byCat = {}; all.forEach(function (r) { byCat[r.product_type] = (byCat[r.product_type] || 0) + 1; });
      $('#costPreview').innerHTML = '<div class="costpreview"><p><b>Found ' + all.length + ' costs</b> (' + Object.keys(byCat).map(function (k) { return byCat[k] + ' ' + CAT[k].toLowerCase() + (byCat[k] > 1 ? 's' : ''); }).join(', ') + ').</p>' +
        '<p class="muted small">' + all.slice(0, 6).map(function (r) { return AZ.esc(r.model) + ' ' + AZ.money(r.cost); }).join(', ') + (all.length > 6 ? ', ...' : '') + '</p>' +
        '<div class="formactions"><button class="btn btn-gold" type="button" id="costApply">Save these costs</button><button class="linkbtn" type="button" id="costCancel">Cancel</button></div></div>';
      $('#costApply').onclick = applyCosts; $('#costCancel').onclick = function () { pending = null; $('#costPreview').innerHTML = ''; };
    }).catch(function (err) { m.textContent = err.message; });
  });
  function applyCosts() {
    if (!pending) return;
    var m = $('#costMsg'), rows = pending; pending = null; $('#costPreview').innerHTML = ''; m.textContent = 'Saving...';
    costList = null;
    getCostList().then(function (list) {
      var key = function (t, mo) { return t + '|' + mo.toLowerCase(); }, have = {};
      list.forEach(function (c) { have[key(c.product_type, c.model)] = c.id; });
      var now = new Date().toISOString(), ins = [], ups = [];
      rows.forEach(function (r) {
        var d = { product_type: r.product_type, model: r.model, cost: r.cost, note: r.note, updated_at: now, updated_by: me.user.id };
        var lid = lineId(r.product_type, lineOfModel(r.product_type, r.model)); if (lid && !have[key(r.product_type, r.model)]) d.line_id = lid;
        if (r.msrp != null) d.msrp = r.msrp;
        if (r.sale_price != null) d.sale_price = r.sale_price;
        var id = have[key(r.product_type, r.model)];
        if (id) ups.push(sb.from('product_costs').update(d).eq('id', id)); else ins.push(d);
      });
      if (ins.length) ups.push(sb.from('product_costs').insert(ins));
      return Promise.all(ups).then(function (res) {
        var bad = res.filter(function (x) { return x.error; });
        m.textContent = bad.length ? bad[0].error.message : 'Saved ' + rows.length + ' costs (' + ins.length + ' new, ' + (rows.length - ins.length) + ' updated).';
        loadCosts();
      });
    });
  }


  // ---------- Deliveries: serial number and photos on delivery day ----------
  var delivs = [];
  function loadDeliveries() {
    AZ.api('deliveries', {}).then(function (r) { delivs = r.deliveries || []; renderDeliveries(); })
      .catch(function (e) { $('#delivList').innerHTML = '<div class="card"><p>' + AZ.esc(e.message) + '</p></div>'; });
  }
  function renderDeliveries() {
    var today = new Date().toISOString().slice(0, 10);
    var groups = [['Today', function (s) { return s.status !== 'delivered' && s.delivery_date === today; }],
      ['Booked', function (s) { return s.status !== 'delivered' && s.delivery_date && s.delivery_date !== today; }],
      ['Not booked yet', function (s) { return s.status !== 'delivered' && !s.delivery_date; }],
      ['Delivered in the last two weeks', function (s) { return s.status === 'delivered'; }]];
    var html = groups.map(function (g) {
      var rows = delivs.filter(g[1]); if (!rows.length) return '';
      return '<h3 class="delivgroup">' + g[0] + ' <span>' + rows.length + '</span></h3>' + rows.map(delivCard).join('');
    }).join('');
    $('#delivList').innerHTML = html || '<div class="card"><p>Nothing to deliver right now. Paid and booked tubs show up here.</p></div>';
  }
  function delivCard(s) {
    var c = s.customers || {}, done = s.status === 'delivered', addr = [c.address, c.city_pc].filter(Boolean).join(', ');
    var ex = (s.extras || []).map(function (x) { return x.name; });
    var specs = [s.shell_colour && 'Shell ' + s.shell_colour, s.siding && 'Siding ' + s.siding, s.spa_cover && 'Cover ' + s.spa_cover].filter(Boolean).concat(ex.length ? ['With ' + ex.join(', ')] : []);
    return '<article class="card deliv' + (done ? ' done' : '') + '" data-deliv="' + s.id + '">' +
      '<div class="deliv-head"><div><p class="eyebrow">#' + s.number + ' &middot; ' + (s.delivery_date ? AZ.dayLabel(s.delivery_date) : (s.delivery_window ? 'Asked for ' + AZ.windowLabel(s.delivery_window) : 'Not booked')) + '</p>' +
      '<h3>' + AZ.esc(c.name || '') + '</h3><p class="deliv-what">' + AZ.esc([s.tub_make, s.tub_model, AZ.noun(s)].filter(Boolean).join(' ')) + '</p>' + (specs.length ? '<p class="muted small">' + AZ.esc(specs.join(' · ')) + '</p>' : '') + '</div>' +
      (done ? AZ.pill('delivered') : (Number(s.balance) > 0 && !s.balance_paid_at ? '<span class="pill pill-gold">Balance owing</span>' : '')) + '</div>' +
      '<p class="deliv-contact">' + (addr ? '<a href="https://maps.google.com/?q=' + encodeURIComponent(addr) + '" target="_blank" rel="noopener">' + AZ.esc(addr) + '</a>' : '') + (c.cell ? ' &nbsp; <a href="tel:' + AZ.esc(c.cell.replace(/[^\d+]/g, '')) + '">' + AZ.esc(c.cell) + '</a>' : '') + '</p>' +
      '<div class="form"><div class="grid2"><label>Serial number<input data-dserial value="' + AZ.esc(s.serial_number || '') + '" placeholder="On the label in the equipment bay" autocomplete="off"></label>' +
      '<label>Delivery notes<input data-dnotes value="' + AZ.esc(s.delivery_notes || '') + '" placeholder="Anything worth remembering" autocomplete="off"></label></div></div>' +
      '<div class="deliv-photos">' + (s.photos || []).map(function (u) { return '<a href="' + AZ.esc(u) + '" target="_blank" rel="noopener"><img src="' + AZ.esc(u) + '" alt="Delivery photo"></a>'; }).join('') +
      '<label class="addphoto"><input type="file" accept="image/*" capture="environment" multiple data-dphotos hidden><span>+ Add photos</span></label></div>' +
      '<p class="muted small" data-dpending></p>' +
      '<div class="formactions"><button class="btn btn-line" type="button" data-dsave>Save</button>' + (done ? '' : '<button class="btn btn-gold" type="button" data-ddeliver>Mark delivered</button>') + '<p class="formmsg" data-dmsg role="status" aria-live="polite"></p></div>' +
      '</article>';
  }
  var pendingPhotos = {};
  $('#delivList').addEventListener('change', function (e) {
    if (!e.target.matches('[data-dphotos]')) return;
    var card = e.target.closest('[data-deliv]'), id = card.dataset.deliv, files = Array.prototype.slice.call(e.target.files || []);
    pendingPhotos[id] = (pendingPhotos[id] || []).concat(files).slice(0, 8);
    card.querySelector('[data-dpending]').textContent = pendingPhotos[id].length + ' new photo' + (pendingPhotos[id].length > 1 ? 's' : '') + ' ready. Tap Save or Mark delivered to upload.';
    e.target.value = '';
  });
  $('#delivList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-dsave],[data-ddeliver]'); if (!b) return;
    var card = b.closest('[data-deliv]'), id = card.dataset.deliv, m = card.querySelector('[data-dmsg]'), deliver = b.hasAttribute('data-ddeliver');
    var serial = card.querySelector('[data-dserial]').value.trim();
    if (deliver && !serial) { m.textContent = 'Add the serial number first. It’s on the label in the equipment bay.'; return; }
    var files = pendingPhotos[id] || [];
    $$('button', card).forEach(function (x) { x.disabled = true; });
    m.textContent = files.length ? 'Uploading ' + files.length + ' photo' + (files.length > 1 ? 's' : '') + '...' : 'Saving...';
    Promise.all(files.map(shrink)).then(function (photos) {
      return AZ.api('delivery-record', { sale_id: id, serial_number: serial, notes: card.querySelector('[data-dnotes]').value, photos: photos, delivered: deliver });
    }).then(function () {
      delete pendingPhotos[id]; AZ.toast(deliver ? 'Delivered. The customer has been emailed.' : 'Saved'); loadDeliveries();
    }).catch(function (err) { m.textContent = err.message; $$('button', card).forEach(function (x) { x.disabled = false; }); });
  });

  // ---------- Service requests ----------
  var svc = [], svcSt = 'open';
  var TOPIC = { water: 'Water care', heating: 'Heating or temperature', jets: 'Jets or pumps', leak: 'A leak', controls: 'Controls or error code', cover: 'Cover or lifter', other: 'Something else' };
  function loadService() {
    AZ.api('service-list', {}).then(function (r) { svc = r.requests || []; renderService(); })
      .catch(function (e) { $('#svcList').innerHTML = '<div class="card"><p>' + AZ.esc(e.message) + '</p></div>'; });
  }
  function renderService() {
    var rows = svc.filter(function (r) { return !svcSt || (svcSt === 'open' ? r.status !== 'done' : r.status === svcSt); });
    $('#svcList').innerHTML = rows.length ? rows.map(function (r) {
      var c = r.customers || {}, s = r.sales || {};
      return '<article class="card svc" data-svc="' + r.id + '"><div class="deliv-head"><div><p class="eyebrow">#' + r.number + ' &middot; ' + AZ.dateTime(r.created_at) + '</p><h3>' + AZ.esc(c.name || '') + ' &middot; ' + AZ.esc(TOPIC[r.topic] || r.topic) + '</h3>' +
        '<p class="muted small">' + AZ.esc([s.tub_model, s.serial_number && 'Serial ' + s.serial_number, s.delivered_at && 'Delivered ' + AZ.date(s.delivered_at)].filter(Boolean).join(' · ')) + '</p></div>' +
        '<span class="pill ' + (r.status === 'done' ? 'pill-green' : r.status === 'booked' ? 'pill-gold' : '') + '">' + ({ new: 'New', booked: 'Booked', done: 'Done' }[r.status]) + '</span></div>' +
        '<p class="svc-msg">' + AZ.esc(r.message) + '</p>' +
        (r.photos && r.photos.length ? '<div class="deliv-photos">' + r.photos.map(function (u) { return '<a href="' + AZ.esc(u) + '" target="_blank" rel="noopener"><img src="' + AZ.esc(u) + '" alt="Photo from the customer"></a>'; }).join('') + '</div>' : '') +
        '<p class="deliv-contact">' + (c.cell ? '<a href="tel:' + AZ.esc(c.cell.replace(/[^\d+]/g, '')) + '">' + AZ.esc(c.cell) + '</a> &nbsp; ' : '') + (c.email ? '<a href="mailto:' + AZ.esc(c.email) + '">' + AZ.esc(c.email) + '</a> &nbsp; ' : '') + AZ.esc([c.address, c.city_pc].filter(Boolean).join(', ')) + '</p>' +
        '<div class="form"><div class="grid3"><label>Status<select data-sst><option value="new"' + (r.status === 'new' ? ' selected' : '') + '>New</option><option value="booked"' + (r.status === 'booked' ? ' selected' : '') + '>Booked</option><option value="done"' + (r.status === 'done' ? ' selected' : '') + '>Done</option></select></label>' +
        '<label>Booked for<input type="date" data-sdate value="' + AZ.esc(r.booked_for || '') + '"></label><label>Notes<input data-snotes value="' + AZ.esc(r.staff_notes || '') + '" autocomplete="off"></label></div></div>' +
        '<div class="formactions"><button class="btn btn-line btn-sm" type="button" data-ssave>Save</button><p class="formmsg" data-smsg role="status" aria-live="polite"></p></div></article>';
    }).join('') : '<div class="card"><p>' + (svcSt === 'open' ? 'No open service requests. ' : 'Nothing here. ') + 'Customers send requests from their portal, and you get an email when one comes in.</p></div>';
  }
  $('#svcFilter').addEventListener('click', function (e) {
    var b = e.target.closest('[data-st]'); if (!b) return; svcSt = b.dataset.st;
    $$('#svcFilter button').forEach(function (x) { x.classList.toggle('on', x === b); }); renderService();
  });
  $('#svcList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ssave]'); if (!b) return;
    var card = b.closest('[data-svc]'), m = card.querySelector('[data-smsg]');
    m.textContent = 'Saving...';
    AZ.api('service-update', { id: card.dataset.svc, status: card.querySelector('[data-sst]').value, booked_for: card.querySelector('[data-sdate]').value, staff_notes: card.querySelector('[data-snotes]').value })
      .then(function () { AZ.toast('Saved'); loadService(); }).catch(function (err) { m.textContent = err.message; });
  });

  // ---------- Start ----------
  AZ.requireRole(['admin', 'staff', 'delivery']).then(function (m) {
    me = m;
    $('#whoami').textContent = me.profile.full_name || me.profile.email;
    if (me.profile.role === 'admin') $$('.admin-only').forEach(function (el) { el.hidden = false; });
    // The delivery team only sees Deliveries.
    if (me.profile.role === 'delivery') $$('.tabs a').forEach(function (a) { a.hidden = a.dataset.tab !== 'deliveries' && a.dataset.tab !== 'resources'; });
    $('#signOut').addEventListener('click', AZ.signOut);
    window.addEventListener('hashchange', route); route();
    // First time in: ask for a display name for agreements.
    if (!me.profile.full_name) {
      var n = document.createElement('div'); n.className = 'card namebox';
      n.innerHTML = '<form class="form"><label>Your full name, as it should appear on agreements<input name="n" required></label><button class="btn btn-gold" type="submit">Save</button></form>';
      $('.appmain .wrap').prepend(n);
      n.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault(); var v = e.target.n.value.trim(); if (!v) return;
        sb.from('profiles').update({ full_name: v }).eq('id', me.user.id).then(function () { me.profile.full_name = v; $('#whoami').textContent = v; n.remove(); AZ.toast('Saved'); });
      });
    }
  });
})();
