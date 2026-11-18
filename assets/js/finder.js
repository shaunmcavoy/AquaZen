/* Find your Zen: AquaZen's intake questionnaire.
   Recommendations are worked out here but only sent to Shaun, never shown to the customer. */
(function () {
  var ENDPOINT = 'https://zfqzajshbjfmflbttabq.supabase.co/functions/v1/lead';

  var STEPS = [
    { id: 'kind', title: 'What are you dreaming of?', sub: 'Pick the one that feels closest. You can change your mind later.',
      type: 'single', options: [
        { v: 'hot_tub', l: 'A hot tub', d: 'Soak, unwind and reconnect' },
        { v: 'swim_spa', l: 'A swim spa', d: 'Swim, train and soak in one' },
        { v: 'mini_pool', l: 'A mini pool', d: 'Summer at home, without the full dig' },
        { v: 'unsure', l: "I'm not sure yet", d: "That's what we're here for" }
      ] },
    { id: 'people', title: "Who's soaking with you?", sub: 'Think about a normal night, not the biggest party of the year.',
      type: 'single', options: [
        { v: '1', l: 'Just me' },
        { v: '2', l: 'The two of us' },
        { v: '3-4', l: 'A family of three or four' },
        { v: '5+', l: 'Five or more', d: 'Big family, friends over often' }
      ] },
    { id: 'use', title: 'What does your Zen Time look like?', sub: 'Choose as many as you like.',
      type: 'multi', options: [
        { v: 'unwind', l: 'Unwinding after work' },
        { v: 'family', l: 'Family night' },
        { v: 'date', l: 'Date night' },
        { v: 'recovery', l: 'Sore muscles and recovery' },
        { v: 'sleep', l: 'Sleeping better' },
        { v: 'swim', l: 'Swimming and exercise' },
        { v: 'friends', l: 'Having friends over' }
      ] },
    { id: 'often', title: 'How often do you picture using it?',
      type: 'single', options: [
        { v: 'nightly', l: 'Most nights' },
        { v: 'weekly', l: 'A few times a week' },
        { v: 'weekends', l: 'Mostly weekends' },
        { v: 'unsure', l: 'Not sure yet' }
      ] },
    { id: 'seat', title: 'Lounger, or all seats?', sub: 'A lounger lets you stretch right out. All seats fits more people face to face.',
      type: 'single', showIf: function (a) { return a.kind === 'hot_tub' || a.kind === 'unsure'; }, options: [
        { v: 'lounger', l: 'I want a lounger' },
        { v: 'seats', l: 'All seats, room for everyone' },
        { v: 'unsure', l: 'Help me decide' }
      ] },
    { id: 'tier', title: 'How do you like to buy?', sub: "Think about how you'd choose a car or a TV. There's no wrong answer.",
      type: 'single', options: [
        { v: 'good', l: 'Keep it simple', d: 'Solid and reliable, without the extras' },
        { v: 'better', l: 'A comfortable middle', d: 'More comfort and a few nice extras' },
        { v: 'best', l: 'The best of everything', d: 'The cleanest water and every feature' }
      ] },
    { id: 'place', title: 'Where will it go?',
      type: 'single', options: [
        { v: 'deck', l: 'On a deck' },
        { v: 'patio', l: 'On a patio or concrete pad' },
        { v: 'ground', l: 'On the lawn or gravel', d: "We'll talk about a good base" },
        { v: 'covered', l: 'Under a cover or indoors' },
        { v: 'unsure', l: 'Not sure yet' }
      ] },
    { id: 'power', title: 'Is there power where it will go?',
      type: 'single', options: [
        { v: 'existing', l: 'Yes, an old hot tub line is already there' },
        { v: 'outlet', l: 'Just a regular outlet nearby' },
        { v: 'none', l: 'No power there yet' },
        { v: 'unsure', l: "I don't know" }
      ] },
    { id: 'line', title: 'Do you know how big the line is?', sub: 'It is usually written on the breaker in your panel. Older tubs often used 40 amp, most spas today use 50 amp.',
      type: 'single', showIf: function (a) { return a.power === 'existing'; },
      other: 'other', otherLabel: 'Something else', otherHint: 'For example, 30 amp',
      options: [
        { v: '40', l: '40 amp' },
        { v: '50', l: '50 amp' },
        { v: '60', l: '60 amp' },
        { v: 'other', l: 'Something else' },
        { v: 'unsure', l: "I don't know" }
      ] },
    { id: 'when', title: 'When would you like to start your Zen Time?',
      type: 'single', other: 'other', otherLabel: 'Other', otherHint: 'For example, before summer',
      options: [
        { v: 'asap', l: 'As soon as possible' },
        { v: 'weeks', l: 'In the next few weeks' },
        { v: 'months', l: 'In the next few months' },
        { v: 'other', l: 'Other' }
      ] },
    { id: 'contact', title: 'Last step. Where can we reach you?',
      sub: "We'll look at your answers, find the perfect model for you and call to book a quiet visit. No pressure, and no one else sees your details.",
      type: 'contact' }
  ];

  var answers = {};
  // Came from a model page? Remember which tub caught their eye.
  var fromModel = (function () { try { return (new URLSearchParams(location.search).get('model') || '').replace(/[^a-z-]/g, '').slice(0, 30); } catch (e) { return ''; } })();
  var others = {};
  var contact = { first: '', last: '', email: '', phone: '', city: '', time: '', emailOk: false, news: false, website: '' };
  var idx = 0;
  var sending = false;

  var stage = document.getElementById('fzStage');
  var bar = document.getElementById('fzBar');
  var back = document.getElementById('fzBack');
  var next = document.getElementById('fzNext');
  var err = document.getElementById('fzErr');
  var form = document.getElementById('fzForm');

  function visible() { return STEPS.filter(function (s) { return !s.showIf || s.showIf(answers); }); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function render(focus) {
    var steps = visible();
    if (idx >= steps.length) idx = steps.length - 1;
    var s = steps[idx];
    err.textContent = '';
    bar.style.width = Math.round((idx / steps.length) * 100) + '%';
    back.hidden = idx === 0;
    next.textContent = s.type === 'contact' ? 'Send my answers' : 'Continue';

    var h = '<p class="fz-count">' + (idx + 1) + ' of ' + steps.length + '</p>';
    h += '<h1 class="fz-title" tabindex="-1">' + esc(s.title) + '</h1>';
    if (s.sub) h += '<p class="fz-sub">' + esc(s.sub) + '</p>';

    if (s.type === 'single' || s.type === 'multi') {
      var multi = s.type === 'multi';
      h += '<div class="fz-opts' + (s.options.length > 4 ? ' fz-opts-many' : '') + '" role="' + (multi ? 'group' : 'radiogroup') + '" aria-label="' + esc(s.title) + '">';
      s.options.forEach(function (o, i) {
        var on = multi ? (answers[s.id] || []).indexOf(o.v) > -1 : answers[s.id] === o.v;
        var id = 'o_' + s.id + '_' + i;
        h += '<label class="fz-opt' + (on ? ' on' : '') + '" for="' + id + '">' +
          '<input id="' + id + '" type="' + (multi ? 'checkbox' : 'radio') + '" name="' + s.id + '" value="' + esc(o.v) + '"' + (on ? ' checked' : '') + '>' +
          '<span class="fz-l">' + esc(o.l) + '</span>' + (o.d ? '<span class="fz-d">' + esc(o.d) + '</span>' : '') + '</label>';
      });
      h += '</div>';
      if (s.other) {
        var showOther = answers[s.id] === s.other;
        h += '<div class="fz-other"' + (showOther ? '' : ' hidden') + '><label for="other_' + s.id + '">' + esc(s.otherLabel) + '</label>' +
          '<input id="other_' + s.id + '" type="text" maxlength="120" placeholder="' + esc(s.otherHint || '') + '" value="' + esc(others[s.id] || '') + '"></div>';
      }
    } else {
      h += '<div class="fz-fields">' +
        field('first', 'First name', 'text', 'given-name', true) +
        field('last', 'Last name', 'text', 'family-name', false) +
        field('email', 'Email', 'email', 'email', true) +
        field('phone', 'Phone', 'tel', 'tel', true) +
        field('city', 'City', 'text', 'address-level2', false, 'For example, Burnaby') +
        '<div class="fz-field fz-wide"><span class="fz-flabel" id="timeLbl">Best time to call</span><div class="fz-chips" role="radiogroup" aria-labelledby="timeLbl">' +
          ['Morning', 'Afternoon', 'Evening', 'Any time'].map(function (t, i) {
            return '<label class="fz-chip' + (contact.time === t ? ' on' : '') + '" for="t_' + i + '"><input id="t_' + i + '" type="radio" name="time" value="' + t + '"' + (contact.time === t ? ' checked' : '') + '>' + t + '</label>';
          }).join('') + '</div></div>' +
        '<label class="fz-check fz-wide" for="emailOk"><input id="emailOk" type="checkbox"' + (contact.emailOk ? ' checked' : '') + '><span>Yes, AquaZen can email me about my hot tub search. I can unsubscribe any time.</span></label>' +
        '<label class="fz-check fz-wide" for="news"><input id="news" type="checkbox"' + (contact.news ? ' checked' : '') + '><span>Send me the AquaZen notes too: simple ideas for more Zen Time at home.</span></label>' +
        '<div class="fz-hp" aria-hidden="true"><label for="website">Website</label><input id="website" type="text" tabindex="-1" autocomplete="off"></div>' +
        '</div>';
    }
    stage.innerHTML = h;
    if (focus) { var t = stage.querySelector('.fz-title'); if (t) t.focus({ preventScroll: false }); }
    wire(s);
  }

  function field(k, label, type, ac, req, ph) {
    return '<div class="fz-field"><label for="f_' + k + '">' + label + (req ? '' : ' <span class="fz-opt-l">(optional)</span>') + '</label>' +
      '<input id="f_' + k + '" type="' + type + '" autocomplete="' + ac + '" value="' + esc(contact[k]) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (req ? ' required' : '') + '></div>';
  }

  function wire(s) {
    if (s.type === 'single' || s.type === 'multi') {
      stage.querySelectorAll('input[name="' + s.id + '"]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          if (s.type === 'multi') {
            answers[s.id] = Array.prototype.map.call(stage.querySelectorAll('input[name="' + s.id + '"]:checked'), function (x) { return x.value; });
          } else {
            answers[s.id] = inp.value;
          }
          stage.querySelectorAll('.fz-opt').forEach(function (l) { l.classList.toggle('on', l.querySelector('input').checked); });
          var o = stage.querySelector('.fz-other');
          if (o) {
            o.hidden = answers[s.id] !== s.other;
            if (!o.hidden) { o.querySelector('input').focus(); return; }
          }
          err.textContent = '';
          // Single choice moves on by itself, like flipping a page
          if (s.type === 'single' && !(s.other && answers[s.id] === s.other)) setTimeout(go, 220);
        });
      });
      var oi = stage.querySelector('.fz-other input');
      if (oi) oi.addEventListener('input', function () { others[s.id] = oi.value; });
    } else {
      ['first', 'last', 'email', 'phone', 'city'].forEach(function (k) {
        var el = document.getElementById('f_' + k);
        el.addEventListener('input', function () { contact[k] = el.value; err.textContent = ''; });
      });
      stage.querySelectorAll('input[name="time"]').forEach(function (r) {
        r.addEventListener('change', function () {
          contact.time = r.value;
          stage.querySelectorAll('.fz-chip').forEach(function (c) { c.classList.toggle('on', c.querySelector('input').checked); });
        });
      });
      document.getElementById('emailOk').addEventListener('change', function (e) { contact.emailOk = e.target.checked; });
      document.getElementById('news').addEventListener('change', function (e) { contact.news = e.target.checked; });
      document.getElementById('website').addEventListener('input', function (e) { contact.website = e.target.value; });
    }
  }

  function valid(s) {
    if (s.type === 'single') {
      if (!answers[s.id]) return 'Choose one to keep going.';
      if (s.other && answers[s.id] === s.other && !(others[s.id] || '').trim()) return 'Tell us a little more, or pick another answer.';
    }
    if (s.type === 'multi' && !(answers[s.id] || []).length) return 'Choose at least one.';
    if (s.type === 'contact') {
      if (!contact.first.trim()) return 'Add your first name so we know who to ask for.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) return 'Check your email address. It should look like name@example.com.';
      if (contact.phone.replace(/\D/g, '').length < 10) return 'Add a phone number with area code so we can call you.';
    }
    return '';
  }

  function go() {
    var steps = visible();
    var s = steps[idx];
    var e = valid(s);
    if (e) { err.textContent = e; return; }
    if (s.type === 'contact') return submit();
    idx++;
    render(true);
    window.scrollTo({ top: 0 });
  }

  // Shaun's private suggestion, never shown to the customer
  function recommend(a) {
    if (a.kind === 'swim_spa') return 'Swim spa. Talk through swimming vs. exercise use and space.';
    if (a.kind === 'mini_pool') return 'Mini pool. Check space for a 6 m footprint and base.';
    var big = a.people === '5+' || a.people === '3-4';
    var parts = [];
    if (a.tier === 'best') parts.push('Series Three (Serenity, Cascade, Solstice, Zenith) for the full EcoPure water system');
    else if (big) parts.push('Series Two (Calma seats 7, Aspen and Eden seat 6)');
    else if (a.power === 'outlet' || a.power === 'none') parts.push('Series One (Brook 4 seats, Zephyr 5) with 120V plug-and-play options');
    else parts.push('Series One or Two depending on budget');
    if (a.seat === 'lounger') parts.push('wants a lounger');
    if (a.seat === 'seats') parts.push('wants all seats');
    if (a.power === 'existing' && a.line) parts.push(a.line === 'other' ? 'existing line: ' + (a.line_other || 'other size') : a.line === 'unsure' ? 'existing line, size unknown' : 'existing ' + a.line + ' amp line');
    if (a.kind === 'unsure') parts.push('unsure of product type, start with a conversation');
    return parts.join('; ') + '.';
  }

  function labelFor(id, v) {
    var s = STEPS.filter(function (x) { return x.id === id; })[0];
    if (!s || !s.options) return v;
    var o = s.options.filter(function (x) { return x.v === v; })[0];
    return o ? o.l : v;
  }

  function submit() {
    if (sending) return;
    sending = true;
    next.disabled = true;
    next.textContent = 'Sending…';
    var a = JSON.parse(JSON.stringify(answers));
    if (fromModel) a.interested_in = fromModel;
    Object.keys(others).forEach(function (k) { if (a[k] === 'other') a[k + '_other'] = others[k].trim(); });
    // Drop answers to questions that ended up hidden
    STEPS.forEach(function (s) { if (s.showIf && !s.showIf(answers)) { delete a[s.id]; delete a[s.id + '_other']; } });
    var readable = {};
    if (fromModel) readable['Came from the model page'] = fromModel.charAt(0).toUpperCase() + fromModel.slice(1);
    visible().forEach(function (s) {
      if (s.type === 'contact') return;
      var v = a[s.id];
      if (Array.isArray(v)) readable[s.title] = v.map(function (x) { return labelFor(s.id, x); }).join(', ');
      else if (v === 'other' && a[s.id + '_other']) readable[s.title] = a[s.id + '_other'];
      else readable[s.title] = labelFor(s.id, v);
    });
    var body = {
      first_name: contact.first.trim(), last_name: contact.last.trim(), email: contact.email.trim(),
      phone: contact.phone.trim(), city: contact.city.trim(), best_time: contact.time,
      email_ok: contact.emailOk, newsletter: contact.news, website: contact.website,
      answers: a, readable: readable, recommendation: recommend(a)
    };
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'send failed'); return j; }); })
      .then(function () { done(); })
      .catch(function () {
        sending = false;
        next.disabled = false;
        next.textContent = 'Send my answers';
        err.textContent = "Your answers didn't send. Check your connection and try again, or call or text us at 236-304-4424.";
      });
  }

  function done() {
    bar.style.width = '100%';
    var when = contact.time && contact.time !== 'Any time' ? ' in the ' + contact.time.toLowerCase() : '';
    form.innerHTML = '<div class="fz-done">' +
      '<img src="../assets/img/logo-mark.png" alt="" width="160" height="67">' +
      '<h1 class="fz-title sunset" tabindex="-1">Thank you, ' + esc(contact.first.trim()) + '.</h1>' +
      '<p class="fz-sub">We have your answers. We\'ll find the perfect model for you and call you' + when + ' to book a quiet visit, because the right tub starts with how you want to live, not with what is on the floor.</p>' +
      '<p class="fz-sub">Can\'t wait? Call or text <a href="tel:+12363044424">236-304-4424</a>.</p>' +
      '<p class="fz-sub">While you wait, have a look around. Every Aquasolus hot tub, with the details that matter.</p>' +
      '<div class="fz-done-ctas"><a class="pill" href="../hot-tubs/">Browse our hot tubs</a><a class="link-btn" href="../">Back to AquaZen</a></div></div>';
    form.querySelector('.fz-title').focus();
    window.scrollTo({ top: 0 });
  }

  next.addEventListener('click', go);
  back.addEventListener('click', function () { if (idx > 0) { idx--; render(true); } });
  form.addEventListener('submit', function (e) { e.preventDefault(); go(); });
  stage.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'radio') { e.preventDefault(); go(); }
  });

  render(false);
})();
