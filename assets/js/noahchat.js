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
  var greeting = '';
  function greet() {
    if (page === 'presentation') return "Hi, I'm Noah, AquaZen's AI assistant. Thank you for giving the presentation your time. What's on your mind? I can help you pick the right hot tub, or answer anything it didn't.";
    if (page === 'quiz' && ctx.picks) return "Hi, I'm Noah, AquaZen's AI assistant. Thanks for filling that out. Any questions about the " + ctx.picks.replace(' and ', ' or the ') + "? I can help you choose, or give you the exact price.";
    if (page === 'model' && cfg.model) return "Hi, I'm Noah, AquaZen's AI assistant. Thinking about the " + cfg.model + "? Ask me anything, price included.";
    return "Hi, I'm Noah, AquaZen's AI assistant. What can I help you with?";
  }

  var root, panel, list, input, launch, teaser, busy = false, shown = false;
  function build() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'noahw';
    root.innerHTML =
      '<button type="button" class="noahw-launch" aria-expanded="false" aria-controls="noahwPanel"><span class="noahw-dot" aria-hidden="true"></span><span class="noahw-label">Questions? Ask Noah</span></button>' +
      '<div class="noahw-teaser" hidden></div>' +
      '<section class="noahw-panel" id="noahwPanel" role="dialog" aria-label="Chat with Noah" hidden>' +
        '<header><span class="noahw-dot" aria-hidden="true"></span><div><b>Noah</b><small>AquaZen&rsquo;s AI assistant</small></div><button type="button" class="noahw-x" aria-label="Close the chat">&times;</button></header>' +
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
    var all = msgs.length ? msgs : [{ role: 'noah', text: greeting || greet() }];
    list.innerHTML = all.map(function (m) { return '<div class="nw nw-' + (m.role === 'user' ? 'me' : 'noah') + '">' + fmt(m.text) + '</div>'; }).join('') +
      (busy ? '<div class="nw nw-noah nw-typing" aria-label="Noah is typing"><i></i><i></i><i></i></div>' : '');
    list.scrollTop = list.scrollHeight;
  }
  function toggle(open) {
    build();
    panel.hidden = !open; launch.setAttribute('aria-expanded', open ? 'true' : 'false');
    root.classList.toggle('open', open); teaser.hidden = true;
    if (open) { if (!greeting) greeting = greet(); render(); setTimeout(function () { input.focus(); }, 50); }
  }
  function show(withTeaser) {
    build();
    if (!shown) { shown = true; requestAnimationFrame(function () { root.classList.add('on'); }); }
    if (withTeaser && panel.hidden && !store('teased.' + page + (cfg.model || ''))) {
      store('teased.' + page + (cfg.model || ''), 1);
      teaser.textContent = greeting || greet(); teaser.hidden = false;
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
    fetch(URL_W, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vid: vid(), text: text, ctx: ctx, greeting: first ? msgs[0].text : '' }) })
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
    var t0 = setTimeout(function () { show(true); }, 6000);
    window.addEventListener('scroll', function once() { if (window.scrollY > window.innerHeight * 0.5) { clearTimeout(t0); show(true); window.removeEventListener('scroll', once); } }, { passive: true });
  }
  if (msgs.length) show(false);

  // Find your Zen results (on its own page or inside the presentation).
  document.addEventListener('az:fzdone', function (e) {
    var d = e.detail || {};
    ctx.page = page = 'quiz'; ctx.picks = d.picks || ''; ctx.answers = d.answers || '';
    greeting = greet(); show(true);
  });
  window.AZNoah = { open: function () { toggle(true); } };
})();
