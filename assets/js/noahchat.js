/* Noah on the website: a chat box that shows up where people have questions.
   - The presentation: once they reach the end (the Find your Zen section).
   - Find your Zen: after they send it, from their results.
   - Hot tub model pages: "Want the price on the Aspen?"
   The chat lives in this browser (a random id and the messages in localStorage), so it carries across pages. */
(function () {
  var URL_W = 'https://zfqzajshbjfmflbttabq.supabase.co/functions/v1/portal/noah-web';
  var cfg = window.AZ_NOAH || {};
  var isPresentation = !!document.querySelector('main.hz');
  var isQuiz = !isPresentation && !!document.getElementById('fzForm');
  var page = cfg.page || (isPresentation ? 'presentation' : isQuiz ? 'quiz' : 'site');

  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem('azNoah.' + k)); localStorage.setItem('azNoah.' + k, JSON.stringify(v)); } catch (e) { return null; } }
  function vid() {
    var v = store('vid');
    if (!v) { v = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12); store('vid', v); }
    return v;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Plain text with links to our own site made clickable.
  function fmt(s) {
    return esc(s).replace(/https?:\/\/(?:www\.)?aquazen\.ca[^\s<]*/g, function (u) {
      var clean = u.replace(/[.,!?)]+$/, ''), tail = u.slice(clean.length);
      return '<a href="' + clean + '">' + clean.replace(/^https?:\/\/(www\.)?/, '') + '</a>' + tail;
    }).replace(/\n/g, '<br>');
  }

  var msgs = store('msgs') || [];
  var ctx = { page: page, model: cfg.model || '', series: cfg.series || '', picks: '', answers: '', saw_presentation: !!store('saw') };
  var greeting = '', openerKey = '', price = null;
  // The opener is the pattern interrupt (SCP Act One): unexpected, sincere and good to receive, then one question.
  // Main openers (about 4 in 5 visitors): gratitude at the end of the presentation, the price before they ask on a
  // model page. The rest get a true fact, as a test: each chat records its opener, so the Noah tab shows which wins.
  // After Find your Zen, Noah writes his own first message from their answers (see start()).
  var FACTS = {
    sleep: "a warm soak an hour or two before bed helps you fall asleep faster? Your body cools down afterwards, and that drop is one of the signals it uses to fall asleep.",
    float: "when you're in the water up to your shoulders, it carries most of your body's weight? Your back and joints finally get a break.",
    winter: "winter is when a hot tub is at its best? Hot water, cold air and steam rising off the top in the dark.",
    jets: "most hot tub jets feel like an itch because of skinny plumbing, like a thumb over a garden hose? AquaSolus uses wide plumbing that sends four to five times more water to every jet.",
    clean: "a typical hot tub takes about 45 minutes to move all its water through the filter, and an AquaSolus does it in under 10?",
    heat: "most hot tub insulation leaves the pumps and lines bare, so heat escapes and the tub keeps running in the cold? An AquaSolus keeps all of its water insulated, all the time.",
    care: "looking after the water in an AquaSolus comes down to about one teaspoon of chlorine after a soak?"
  };
  var HI = "Hi, I'm Noah, AquaZen's Internet Manager. ";
  function money(n) { return '$' + Math.round(n).toLocaleString('en-CA'); }
  function pickFact() {
    var keys = (page === 'model') ? ['jets', 'clean', 'heat', 'care', 'sleep', 'float', 'winter'] : ['sleep', 'float', 'winter'];
    var seen = store('facts') || [], fresh = keys.filter(function (k) { return seen.indexOf(k) < 0; });
    var pool = fresh.length ? fresh : keys, k = pool[Math.floor(Math.random() * pool.length)];
    store('facts', seen.concat(k).slice(-8));
    return k;
  }
  function chooseOpener() {
    if (openerKey) return;
    var main = page === 'presentation' ? 'thanks' : (page === 'model' && price) ? 'price' : '';
    openerKey = (main && Math.random() < 0.8) ? main : 'fact:' + pickFact();
  }
  // The hook: what the teaser bubble shows.
  function opener() {
    chooseOpener();
    if (openerKey === 'thanks') return HI + 'Thank you for going all the way through that. It was a lot to take in.';
    if (openerKey === 'price') return HI + "You're probably wondering about price, so here it is: the " + cfg.model + ' is ' + money(price.sale) + ' right now, normally ' + money(price.msrp) + ', with every upgrade, delivery, a cover lifter and steps included.';
    return HI + 'Did you know that ' + FACTS[openerKey.slice(5)];
  }
  function question() {
    if (openerKey === 'thanks') return "What's one thing you'd still like to know?";
    if (openerKey === 'price') return 'What else would help you decide?';
    if (page === 'presentation') return 'What stood out most for you in the presentation?';
    if (page === 'model' && cfg.model) return "What's got you looking at the " + cfg.model + '?';
    return "What's got you thinking about a hot tub?";
  }
  function greet() { return opener() + '\n\n' + question(); }

  var root, panel, list, input, launch, teaser, busy = false, shown = false, starting = false;
  function build() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'noahw';
    root.innerHTML =
      '<button type="button" class="noahw-launch" aria-expanded="false" aria-controls="noahwPanel"><span class="noahw-dot" aria-hidden="true"></span><span class="noahw-label">Questions? Ask Noah</span></button>' +
      '<div class="noahw-teaser" hidden></div>' +
      '<section class="noahw-panel" id="noahwPanel" role="dialog" aria-label="Chat with Noah" hidden>' +
        '<header><span class="noahw-dot" aria-hidden="true"></span><div><b>Noah</b><small>AquaZen&rsquo;s Internet Manager</small></div><button type="button" class="noahw-x" aria-label="Close the chat">&times;</button></header>' +
        '<div class="noahw-list" aria-live="polite"></div>' +
        '<form class="noahw-form"><textarea rows="1" maxlength="1000" placeholder="Type a question" aria-label="Your message"></textarea><button type="submit" aria-label="Send">Send</button></form>' +
        '<p class="noahw-note">Noah is an AI. A person on our team reads these chats. <a href="/privacy/">Privacy</a></p>' +
      '</section>';
    document.body.appendChild(root);
    panel = root.querySelector('.noahw-panel'); list = root.querySelector('.noahw-list');
    input = root.querySelector('textarea'); launch = root.querySelector('.noahw-launch'); teaser = root.querySelector('.noahw-teaser');
    if (page === 'model' && cfg.model) root.querySelector('.noahw-label').textContent = 'Price on the ' + cfg.model + '? Ask Noah';
    launch.addEventListener('click', function () { toggle(panel.hidden); });
    teaser.addEventListener('click', function () { toggle(true); });
    root.querySelector('.noahw-x').addEventListener('click', function () { toggle(false); });
    root.querySelector('.noahw-form').addEventListener('submit', function (e) { e.preventDefault(); send(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) toggle(false); });
    // Keep clear of the floating Find your Zen button on phones.
    var zf = document.querySelector('.zen-float');
    if (zf && 'MutationObserver' in window) {
      var sync = function () { root.classList.toggle('above-zf', zf.classList.contains('on')); };
      new MutationObserver(sync).observe(zf, { attributes: true, attributeFilter: ['class'] }); sync();
    }
  }
  function render() {
    var all = msgs.length || starting ? msgs : [{ role: 'noah', text: greeting || greet() }];
    list.innerHTML = all.map(function (m) { return '<div class="nw nw-' + (m.role === 'user' ? 'me' : 'noah') + '">' + fmt(m.text) + '</div>'; }).join('') +
      (busy ? '<div class="nw nw-noah nw-typing" aria-label="Noah is typing"><i></i><i></i><i></i></div>' : '');
    list.scrollTop = list.scrollHeight;
  }
  function toggle(open) {
    build();
    panel.hidden = !open; launch.setAttribute('aria-expanded', open ? 'true' : 'false');
    root.classList.toggle('open', open); teaser.hidden = true;
    if (open) { if (!greeting && !starting) greeting = greet(); render(); if (!starting) setTimeout(function () { input.focus(); }, 50); }
  }
  function show(withTeaser) {
    build();
    if (!shown) { shown = true; requestAnimationFrame(function () { root.classList.add('on'); }); }
    if (withTeaser && panel.hidden && !store('teased.' + page + (cfg.model || ''))) {
      store('teased.' + page + (cfg.model || ''), 1);
      if (!greeting) greeting = greet(); teaser.textContent = opener(); teaser.hidden = false;
      setTimeout(function () { teaser.hidden = true; }, 12000);
    }
  }
  function send() {
    var text = input.value.trim();
    if (!text || busy) return;
    var first = !msgs.length;
    if (first) msgs.push({ role: 'noah', text: greeting || greet() });
    msgs.push({ role: 'user', text: text }); store('msgs', msgs.slice(-60));
    input.value = ''; input.style.height = 'auto'; busy = true; render();
    fetch(URL_W, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vid: vid(), text: text, ctx: ctx, greeting: first ? msgs[0].text : '', opener: first ? openerKey : '' }) })
      .then(function (r) { return r.json(); })
      .then(function (r) { msgs.push({ role: 'noah', text: r.reply || r.error || "Sorry, that didn't go through. Call or text us at 236-304-4424." }); })
      .catch(function () { msgs.push({ role: 'noah', text: "That didn't send. Check your connection and try again, or call or text us at 236-304-4424." }); })
      .then(function () { busy = false; store('msgs', msgs.slice(-60)); render(); });
  }

  // Someone with an open chat sees it everywhere it's offered.
  if (page === 'presentation') {
    var end = document.getElementById('find-your-zen');
    if (end && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (es, io) {
        if (es.some(function (e) { return e.isIntersecting; })) { store('saw', 1); ctx.saw_presentation = true; show(true); io.disconnect(); }
      }, { threshold: 0.2 }).observe(end);
    } else if (end) show(false);
  } else if (page === 'model') {
    var ready = cfg.model ? fetch(URL_W, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ price_of: cfg.model }) })
      .then(function (r) { return r.json(); }).then(function (r) { if (r.ok && r.sale && r.msrp > r.sale) price = r; }).catch(function () {}) : Promise.resolve();
    var go = function () { ready.then(function () { show(true); }); };
    var t0 = setTimeout(go, 6000);
    window.addEventListener('scroll', function once() { if (window.scrollY > window.innerHeight * 0.5) { clearTimeout(t0); go(); window.removeEventListener('scroll', once); } }, { passive: true });
  }
  if (msgs.length) show(false);

  // Find your Zen results (on its own page or inside the presentation).
  document.addEventListener('az:fzdone', function (e) {
    var d = e.detail || {};
    ctx.page = page = 'quiz'; ctx.picks = d.picks || ''; ctx.answers = d.answers || ''; ctx.first = d.first || ''; ctx.best_time = d.best_time || '';
    if (!ctx.picks) return; // swim spas and mini pools: the team takes it from here
    start();
  });
  // Noah speaks first: his opener is written from their Find your Zen answers and the tub we suggest.
  function start() {
    build(); starting = true; busy = true;
    show(false);
    setTimeout(function () { toggle(true); }, 1200); // let the results appear first
    fetch(URL_W, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vid: vid(), start: true, ctx: ctx }) })
      .then(function (r) { return r.json(); })
      .then(function (r) { if (r.reply) msgs.push({ role: 'noah', text: r.reply }); })
      .catch(function () {})
      .then(function () {
        if (!msgs.length) msgs.push({ role: 'noah', text: HI + 'Thanks for filling that out' + (ctx.first ? ', ' + ctx.first : '') + '. Shaun will call you to book a quiet visit.\n\nAny questions about the ' + ctx.picks.replace(' and ', ' or the ') + ' before then?' });
        starting = false; busy = false; store('msgs', msgs.slice(-60)); render();
        if (!panel.hidden) input.focus({ preventScroll: true });
      });
  }
  window.AZNoah = { open: function () { toggle(true); } };
})();
