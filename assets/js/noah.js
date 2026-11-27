/* Noah tab (staff portal, admins): switch, promotion, practice chat and conversations from Messenger and Instagram. */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var practice = [], threads = [], openId = null, opened = false;

  function when(d) { return d ? AZ.dateTime(d) : ''; }
  function statusOf(t) {
    if (t.status === 'human' && t.human_until && new Date(t.human_until) > new Date()) return 'Team has it';
    if (t.handed_off_at) return 'Handed to the team';
    return t.followup_at ? 'Noah (followed up)' : 'Noah';
  }
  function bubbles(el, msgs) {
    el.innerHTML = msgs.map(function (m) {
      var who = m.role === 'user' ? 'them' : m.role === 'team' ? 'team' : 'noah';
      return '<div class="nb nb-' + who + '"><span>' + (who === 'them' ? 'Them' : who === 'team' ? 'Team' : 'Noah') + '</span>' + AZ.esc(m.text) + '</div>';
    }).join('') || '<p class="muted small">No messages yet.</p>';
    el.scrollTop = el.scrollHeight;
  }

  function load() {
    AZ.api('noah-admin', null, 'GET').then(function (r) {
      $('#noahOn').checked = !!r.on; $('#noahNudge').checked = r.nudge !== false;
      if (document.activeElement !== $('#noahPromo')) $('#noahPromo').value = r.promo || '';
      var miss = [];
      if (!r.ready.token) miss.push('the Meta key'); if (!r.ready.secret) miss.push('the Meta app secret (META_APP_SECRET)'); if (!r.ready.ai) miss.push('the Anthropic key');
      $('#noahReady').innerHTML = miss.length ? AZ.esc('Still needs ' + miss.join(' and ') + ' before Noah can answer real messages. Practice works now.') : 'Connected to Messenger and Instagram. <button class="btn btn-line btn-sm" type="button" id="noahSub">Reconnect the Page</button>';
      var sub = $('#noahSub'); if (sub) sub.onclick = function () { sub.disabled = true; AZ.api('noah-admin', { subscribe: true }).then(function (x) { sub.textContent = x.subscribed ? 'Page connected' : 'Try again'; }, function (e2) { sub.textContent = e2.message; }); };
      threads = r.threads || [];
      $('#noahThreads').innerHTML = threads.map(function (t) {
        return '<tr data-id="' + t.id + '" tabindex="0"><td><b>' + AZ.esc(t.name || 'Someone') + '</b></td><td>' + (t.channel === 'instagram' ? 'Instagram' : 'Messenger') + '</td><td>' + statusOf(t) + '</td><td>' + when(t.last_user_at) + '</td></tr>';
      }).join('') || '<tr><td colspan="4" class="empty">No conversations yet.</td></tr>';
    }).catch(function (e) { $('#noahReady').textContent = e.message; });
  }

  // What they did with Noah's link: when they opened it, how far they got, and whether Noah followed up.
  function visitsHtml(vs) {
    var box = $('#noahThreadVisits');
    box.innerHTML = vs.length ? '<p class="abl">On the website</p><ul>' + vs.map(function (v) {
      var mins = Math.max(1, Math.round(v.seconds / 60));
      var what = (v.page === 'quiz' ? 'Opened Find your Zen' : 'Opened the presentation') + ' ' + AZ.esc(AZ.dateTime(v.started_at)) +
        (v.seconds ? ', stayed ' + (v.seconds < 60 ? v.seconds + ' seconds' : 'about ' + mins + ' minute' + (mins === 1 ? '' : 's')) : '') +
        (v.furthest_name ? ', got to ' + AZ.esc(v.furthest_name) : '');
      var end = v.form_sent ? ' <b>Sent Find your Zen.</b>' : v.nudged_at ? (v.nudge_text && v.nudge_text.charAt(0) === '(' ? ' <span class="muted">No follow-up: ' + AZ.esc(v.nudge_text.slice(10, -1)) + '.</span>' : ' Noah followed up.') : '';
      return '<li>' + what + '.' + end + '</li>';
    }).join('') + '</ul>' : '';
  }

  function openThread(id) {
    openId = id;
    var t = threads.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    $('#noahThread').hidden = false;
    $('#noahThreadName').textContent = (t.name || 'Someone') + ' on ' + (t.channel === 'instagram' ? 'Instagram' : 'Messenger');
    var paused = t.status === 'human' && t.human_until && new Date(t.human_until) > new Date();
    $('#noahPause').textContent = paused ? 'Let Noah answer this chat again' : 'Pause Noah on this chat';
    $('#noahPause').dataset.to = paused ? 'bot' : 'human';
    AZ.api('noah-admin', { thread: id }).then(function (r) { visitsHtml(r.visits || []); bubbles($('#noahThreadMsgs'), r.messages); });
  }

  function wire() {
    $('#noahSave').addEventListener('click', function () {
      $('#noahMsg').textContent = 'Saving...';
      AZ.api('noah-admin', { on: $('#noahOn').checked, promo: $('#noahPromo').value }).then(function () { $('#noahMsg').textContent = 'Saved.'; load(); })
        .catch(function (e) { $('#noahMsg').textContent = e.message; });
    });
    $('#noahOn').addEventListener('change', function () { AZ.api('noah-admin', { on: $('#noahOn').checked }).then(load); });
    $('#noahNudge').addEventListener('change', function () { AZ.api('noah-admin', { nudge: $('#noahNudge').checked }).then(load); });
    $('#noahThreads').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr) openThread(tr.dataset.id); });
    $('#noahPause').addEventListener('click', function () {
      AZ.api('noah-admin', { thread_id: openId, status: $('#noahPause').dataset.to }).then(function () { load(); setTimeout(function () { openThread(openId); }, 400); });
    });
    $('#noahPracticeForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('#noahPracticeText'), text = input.value.trim(); if (!text) return;
      practice.push({ role: 'user', text: text }); input.value = '';
      bubbles($('#noahPractice'), practice.concat([{ role: 'noah', text: '...' }]));
      AZ.api('noah-admin', { practice: practice, closing: $('#noahPracticeClose').checked }).then(function (r) {
        practice.push({ role: 'noah', text: r.reply + (r.handoff ? '\n\n(Noah would now hand this to the team: ' + [r.lead && r.lead.name, r.lead && r.lead.phone].filter(Boolean).join(', ') + ')' : '') });
        bubbles($('#noahPractice'), practice);
      }).catch(function (err) { practice.push({ role: 'team', text: err.message }); bubbles($('#noahPractice'), practice); });
    });
    $('#noahPracticeReset').addEventListener('click', function () { practice = []; bubbles($('#noahPractice'), practice); });
  }

  window.AZNoah = {
    open: function () {
      if (!opened) { opened = true; wire(); bubbles($('#noahPractice'), practice); }
      load();
    }
  };
})();
