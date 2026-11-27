/* Find your Zen: AquaZen's intake questionnaire.
   When they send their answers, the thank-you screen shows two hot tubs: the best fit for their answers
   (Series Two by default, Series One only for "keep it simple" on a regular outlet, Series Three for
   "the best of everything") and the same layout one series up, with why. Shaun also gets his own note. */
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
  // Came from How we deliver Zen with a choice of what they want most? Tick it on the Zen Time question.
  (function () {
    try {
      var use = new URLSearchParams(location.search).get('use');
      var ok = STEPS.filter(function (s) { return s.id === 'use'; })[0].options.some(function (o) { return o.v === use; });
      if (ok) answers.use = [use];
    } catch (e) {}
  })();
  // Built into the end of How we deliver Zen? Use what they picked as most important on the way through.
  var embedded = !!document.querySelector('main.hz #fzForm');
  var GOALUSE = { sleep: 'sleep', muscles: 'recovery', together: 'family', escape: 'unwind', all: ['unwind', 'family', 'recovery', 'sleep'] };
  var touchedUse = false;
  if (embedded) {
    try { var g0 = GOALUSE[localStorage.getItem('az-goal') || '']; if (g0 && !answers.use) answers.use = [].concat(g0); } catch (e) {}
    document.addEventListener('az-goal', function (e) {
      if (touchedUse) return;
      if (e.detail && e.detail.length) answers.use = [].concat(e.detail); else delete answers.use;
    });
  }
  var cameFrom = (function () { try { return (new URLSearchParams(location.search).get('from') || '').replace(/[^a-z]/g, '').slice(0, 20); } catch (e) { return ''; } })();
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
    h += (embedded ? '<h2' : '<h1') + ' class="fz-title" tabindex="-1">' + esc(s.title) + (embedded ? '</h2>' : '</h1>');
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
    if (focus) {
      var t = stage.querySelector('.fz-title');
      if (t) t.focus({ preventScroll: embedded });
    }
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
            if (s.id === 'use') touchedUse = true;
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
    if (embedded) { var fr = document.getElementById('finder'); if (fr) fr.scrollIntoView({ block: 'start' }); } else window.scrollTo({ top: 0 });
  }

  // The hot tubs we can recommend. Keep in step with src/tubs.json.
  var SERIES = {
    one: { slug: 'series-one', name: 'Series One' },
    two: { slug: 'series-two', name: 'Series Two' },
    three: { slug: 'series-three', name: 'Series Three' }
  };
  var TUBS = {
    brook: { s: 'one', name: 'Brook', people: 4, jets: 23, layout: 'four seats' },
    zephyr: { s: 'one', name: 'Zephyr', people: 5, jets: 25, layout: 'two loungers and three seats' },
    cypress: { s: 'one', name: 'Cypress', people: 6, jets: 26, layout: 'a lounger and five seats' },
    cove: { s: 'one', name: 'Cove', people: 7, jets: 27, layout: 'seven upright seats' },
    sierra: { s: 'two', name: 'Sierra', people: 3, jets: 40, layout: 'two loungers and a seat' },
    harmony: { s: 'two', name: 'Harmony', people: 5, jets: 42, layout: 'two loungers and three seats' },
    eden: { s: 'two', name: 'Eden', people: 6, jets: 42, layout: 'a lounger and five seats' },
    aspen: { s: 'two', name: 'Aspen', people: 6, jets: 48, layout: 'a lounger and five seats' },
    calma: { s: 'two', name: 'Calma', people: 7, jets: 38, layout: 'seven upright seats' },
    cascade: { s: 'three', name: 'Cascade', people: 5, jets: 45, layout: 'two full-length loungers and three seats' },
    serenity: { s: 'three', name: 'Serenity', people: 6, jets: 49, layout: 'a full-length lounger and five seats' },
    zenith: { s: 'three', name: 'Zenith', people: 7, jets: 61, layout: 'a lounger and six seats' },
    solstice: { s: 'three', name: 'Solstice', people: 7, jets: 41, layout: 'seven upright seats' }
  };
  // The same layout, one series up. Series Three points to the other one worth sitting in.
  var UP = { brook: 'eden', zephyr: 'harmony', cypress: 'eden', cove: 'calma',
    sierra: 'cascade', harmony: 'cascade', eden: 'serenity', aspen: 'serenity', calma: 'solstice',
    cascade: 'serenity', serenity: 'zenith', zenith: 'serenity', solstice: 'zenith' };

  function has(a, k, v) { return (a[k] || []).indexOf(v) > -1; }

  // Which hot tub fits their answers best, and the step up from it.
  function picks(a) {
    if (a.kind === 'swim_spa' || a.kind === 'mini_pool') return null;
    var series = a.tier === 'best' ? 'three' : (a.tier === 'good' && a.power === 'outlet') ? 'one' : 'two';
    var p = a.people, seat = a.seat || 'unsure', small = p === '1' || p === '2', big = p === '5+';
    var fit;
    if (series === 'one') {
      fit = small ? (seat === 'seats' ? 'brook' : 'zephyr') : big ? (seat === 'seats' ? 'cove' : 'cypress') : (seat === 'lounger' ? 'zephyr' : 'cypress');
    } else if (series === 'two') {
      if (small) fit = seat === 'seats' ? 'harmony' : 'sierra';
      else if (big) fit = seat === 'seats' ? 'calma' : 'aspen';
      else fit = has(a, 'use', 'recovery') ? 'aspen' : seat === 'lounger' ? 'harmony' : 'eden';
    } else {
      if (small) fit = 'cascade';
      else if (big) fit = seat === 'seats' ? 'solstice' : 'zenith';
      else fit = seat === 'lounger' ? 'cascade' : 'serenity';
    }
    return { fit: fit, up: UP[fit] };
  }

  function whoFor(a) {
    return { '1': 'you', '2': 'the two of you', '3-4': 'your family', '5+': 'everyone' }[a.people] || 'everyone';
  }

  // Why this one, in their own words back to them.
  function whyFit(a, k) {
    var t = TUBS[k], r = [];
    r.push('Room for ' + t.people + ', so there\'s space for ' + whoFor(a) + ' on a normal night');
    if (a.seat === 'lounger') r.push(t.layout + ', so you can stretch right out');
    else if (a.seat === 'seats') r.push(t.layout + ', so everyone faces each other and talks');
    else r.push(t.layout);
    if (has(a, 'use', 'recovery')) r.push(t.jets + ' jets for sore muscles at the end of the day');
    if (t.s === 'two') r.push('two pumps on a dedicated 60 amp line, so the heater and jets run at full power together, even on a cold night');
    if (t.s === 'three') r.push('programmable massage and real-time water monitoring, because you told us you want the best of everything');
    if (t.s === 'one') r.push('it runs on a standard outlet, the simplest way to start');
    return r;
  }

  function whyUp(fitKey, upKey) {
    var f = TUBS[fitKey], u = TUBS[upKey];
    if (f.s === 'one') return 'The same idea in Series Two. Two pumps on a dedicated 60 amp line mean the heater and jets never take turns, so it\'s ready every night, all winter. It\'s the series we recommend most.';
    if (f.s === 'two') return 'The same layout in Series Three, with ' + u.jets + ' jets. It adds a programmable massage that runs the sequence you choose, and water monitoring that watches your water for you. If you\'ll be in it most nights, it\'s worth sitting in both.';
    return 'Our other Series Three favourite for answers like yours: ' + u.layout + ' and ' + u.jets + ' jets. Sit in both and you\'ll know.';
  }

  function card(k, label, reasons) {
    var t = TUBS[k], se = SERIES[t.s], url = '../hot-tubs/' + se.slug + '/' + k + '/';
    var list = Array.isArray(reasons) ? '<ul>' + reasons.map(function (x) { return '<li>' + esc(x.charAt(0).toUpperCase() + x.slice(1)) + '.</li>'; }).join('') + '</ul>' : '<p>' + esc(reasons) + '</p>';
    return '<article class="fz-pick">' +
      '<a class="fz-pick-img" href="' + url + '"><img src="../assets/img/models/' + k + '-quarter.webp" alt="The AquaSolus ' + esc(t.name) + '" loading="lazy"></a>' +
      '<div class="fz-pick-body"><p class="fz-pick-label">' + esc(label) + '</p>' +
      '<h2>The ' + esc(t.name) + ' <span>' + esc(se.name) + '</span></h2>' + list +
      '<a class="link-btn" href="' + url + '">See the ' + esc(t.name) + '</a></div></article>';
  }

  // Shaun's own note, with what the customer was shown
  function recommend(a) {
    if (a.kind === 'swim_spa') return 'Swim spa. Talk through swimming vs. exercise use and space.';
    if (a.kind === 'mini_pool') return 'Mini pool. Check space for a 6 m footprint and base.';
    var parts = [];
    if (a.seat === 'lounger') parts.push('wants a lounger');
    if (a.seat === 'seats') parts.push('wants all seats');
    if (a.power === 'existing' && a.line) parts.push(a.line === 'other' ? 'existing line: ' + (a.line_other || 'other size') : a.line === 'unsure' ? 'existing line, size unknown' : 'existing ' + a.line + ' amp line');
    if (a.kind === 'unsure') parts.push('unsure of product type, start with a conversation');
    var pk = picks(a);
    if (pk) parts.unshift('Shown on screen: ' + TUBS[pk.fit].name + ' (best fit, ' + SERIES[TUBS[pk.fit].s].name + ') and ' + TUBS[pk.up].name + ' (' + (TUBS[pk.fit].s === 'three' ? 'also worth sitting in' : 'one series up') + ')');
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
    if (!embedded && cameFrom) { a.source = 'finder_' + cameFrom; readable['Came from'] = cameFrom === 'fbad' ? 'A Facebook ad' : cameFrom === 'noah' ? 'Noah' : cameFrom; }
    if (embedded) {
      a.source = 'presentation' + (cameFrom ? '_' + cameFrom : '');
      readable['Came from'] = 'How we deliver Zen' + (cameFrom === 'noah' ? ', sent by Noah' : cameFrom === 'fbad' ? ', from a Facebook ad' : cameFrom ? ', from ' + cameFrom : '');
      var GW = { sleep: 'Better sleep', muscles: 'Relief for sore muscles', together: 'Time together', escape: 'A quiet escape', all: 'All of it' };
      try { var gw = GW[localStorage.getItem('az-goal') || '']; if (gw) readable['What they want most'] = gw; } catch (e) {}
      var sec = document.getElementById('find-your-zen');
      if (sec && sec.dataset.ans) readable['Believes AquaZen can give them that'] = sec.dataset.ans === 'yes' ? 'Yes' : 'Not sure yet';
    }
    visible().forEach(function (s) {
      if (s.type === 'contact') return;
      var v = a[s.id];
      if (Array.isArray(v)) readable[s.title] = v.map(function (x) { return labelFor(s.id, x); }).join(', ');
      else if (v === 'other' && a[s.id + '_other']) readable[s.title] = a[s.id + '_other'];
      else readable[s.title] = labelFor(s.id, v);
    });
    lastReadable = readable;
    var body = {
      first_name: contact.first.trim(), last_name: contact.last.trim(), email: contact.email.trim(),
      phone: contact.phone.trim(), city: contact.city.trim(), best_time: contact.time,
      email_ok: contact.emailOk, newsletter: contact.news, website: contact.website,
      answers: a, readable: readable, recommendation: recommend(a), picks: (function () { var pk = picks(a); return pk ? [pk.fit, pk.up] : []; })()
    };
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'send failed'); return j; }); })
      .then(function () { try { if (window.fbq) fbq('track', 'Lead', { content_name: 'Find your Zen' }); } catch (e) {} try { if (window.AZVisit) window.AZVisit.form(); } catch (e) {} done(a); })
      .catch(function () {
        sending = false;
        next.disabled = false;
        next.textContent = 'Send my answers';
        err.textContent = "Your answers didn't send. Check your connection and try again, or call or text us at 236-304-4424.";
      });
  }

  var lastReadable = {};
  function done(a) {
    bar.style.width = '100%';
    var when = contact.time && contact.time !== 'Any time' ? ' in the ' + contact.time.toLowerCase() : '';
    var first = esc(contact.first.trim());
    var pk = picks(a || {});
    var h = '<div class="fz-done">' +
      '<img src="../assets/img/logo-mark.png" alt="" width="160" height="67">' +
      (embedded ? '<h2' : '<h1') + ' class="fz-title sunset" tabindex="-1">Thank you, ' + first + '.' + (embedded ? '</h2>' : '</h1>');
    if (pk) {
      var three = TUBS[pk.fit].s === 'three';
      h += '<p class="fz-sub">Here\'s where your answers point. Two hot tubs we\'d love you to sit in, because the right tub starts with how you want to live, not with what is on the floor.</p>' +
        '<div class="fz-picks">' + card(pk.fit, 'Your best fit', whyFit(a, pk.fit)) + card(pk.up, three ? 'Also worth sitting in' : 'One series up', whyUp(pk.fit, pk.up)) + '</div>' +
        '<div class="fz-curious"><h2>What a screen can\'t tell you</h2>' +
        '<p>Specs only go so far. How the massage feels in the ' + esc(TUBS[pk.fit].name) + ' compared with the ' + esc(TUBS[pk.up].name) + ' is something you notice in the first minute, and it\'s different for everyone. At a quiet visit we\'ll show you the one detail that decides how little time you\'ll spend on your water, and we\'ll tell you honestly what we\'d leave off, so you only pay for what you\'ll use.</p>' +
        '<p>We\'ll call you' + when + ' to book it. Can\'t wait? Call or text <a href="tel:+12363044424">236-304-4424</a>.</p></div>';
    } else {
      h += '<p class="fz-sub">We have your answers. We\'ll find the perfect fit for you and call you' + when + ' to book a quiet visit, because the right choice starts with how you want to live, not with what is on the floor.</p>' +
        '<p class="fz-sub">There\'s a lot a screen can\'t tell you: how it feels, how much room you really need, and what we\'d leave off so you only pay for what you\'ll use. That\'s what the visit is for.</p>' +
        '<p class="fz-sub">Can\'t wait? Call or text <a href="tel:+12363044424">236-304-4424</a>.</p>';
    }
    h += '<div class="fz-done-ctas"><a class="pill" href="sms:+12363044424">Text us to book a visit</a><button type="button" class="link-btn fz-ask-noah">Ask Noah a question</button><a class="link-btn" href="../hot-tubs/">Browse every hot tub</a></div></div>';
    form.innerHTML = h;
    // Noah, the website chat, picks up from here with their results.
    try {
      var told = Object.keys(lastReadable).map(function (k) { return k + ': ' + lastReadable[k]; }).join('; ');
      var me = 'Name ' + contact.first.trim() + ' ' + contact.last.trim() + ', phone ' + contact.phone.trim() + ', email ' + contact.email.trim() + ', city ' + contact.city.trim() + ' (they gave these in the form, so never ask again)';
      document.dispatchEvent(new CustomEvent('az:fzdone', { detail: { picks: pk ? TUBS[pk.fit].name + ' and ' + TUBS[pk.up].name : '', answers: me + '. ' + told } }));
    } catch (e) {}
    var ask = form.querySelector('.fz-ask-noah');
    if (ask) ask.addEventListener('click', function () { if (window.AZNoah) window.AZNoah.open(); });
    form.querySelector('.fz-title').focus({ preventScroll: true });
    if (embedded) document.getElementById('finder').scrollIntoView({ block: 'start' }); else window.scrollTo({ top: 0 });
  }

  next.addEventListener('click', go);
  back.addEventListener('click', function () { if (idx > 0) { idx--; render(true); } });
  form.addEventListener('submit', function (e) { e.preventDefault(); go(); });
  stage.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'radio') { e.preventDefault(); go(); }
  });

  render(false);
})();


/* Noah's private links (?from=noah&c=CODE). While someone from a Noah chat is on the presentation or Find your Zen,
   tell the portal how far they've got every 15 seconds and when they leave, so Noah can follow up with one curious
   question about a minute after they go. Only for visitors who came from Noah's link; nothing else is tracked. */
(function () {
  var URL_T = 'https://zfqzajshbjfmflbttabq.supabase.co/functions/v1/portal/noah-track';
  var code = '';
  try {
    var q = new URLSearchParams(location.search);
    code = (q.get('c') || '').replace(/[^a-z0-9]/g, '').slice(0, 12);
    if (code && q.get('from') === 'noah') sessionStorage.setItem('az-nc', code); else code = sessionStorage.getItem('az-nc') || '';
  } catch (e) { return; }
  if (!code) return;
  var page = document.querySelector('main.hz') ? 'presentation' : (document.querySelector('#fzForm') ? 'quiz' : '');
  if (!page) return;
  var shown = 0, lastShow = document.visibilityState === 'visible' ? Date.now() : 0;
  function seconds() { return Math.round((shown + (lastShow ? Date.now() - lastShow : 0)) / 1000); }
  function chapter() {
    var cur = '';
    Array.prototype.forEach.call(document.querySelectorAll('.hz-progress [data-t]'), function (a) {
      var el = document.querySelector(a.getAttribute('data-t'));
      if (el && el.getBoundingClientRect().top < window.innerHeight * 0.45) cur = a.getAttribute('data-t').slice(1);
    });
    return cur;
  }
  function send(e, beacon) {
    var body = JSON.stringify({ c: code, e: e, ch: chapter(), page: page, s: seconds() });
    try {
      if (beacon && navigator.sendBeacon) { navigator.sendBeacon(URL_T, new Blob([body], { type: 'text/plain' })); return; }
      fetch(URL_T, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, keepalive: true }).catch(function () {});
    } catch (err) {}
  }
  send('open');
  setInterval(function () { if (document.visibilityState === 'visible') send('beat'); }, 15000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { if (lastShow) { shown += Date.now() - lastShow; lastShow = 0; } send('away', true); }
    else { lastShow = Date.now(); send('back'); }
  });
  window.addEventListener('pagehide', function () { send('away', true); });
  window.AZVisit = { form: function () { send('form', true); } };
})();
