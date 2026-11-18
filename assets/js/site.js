(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Split the statement into words so they can light up one at a time
  var words = [];
  Array.prototype.forEach.call(document.querySelectorAll('[data-words]'), function (st) {
    st.innerHTML = st.innerHTML.trim().split(/\s+/).map(function (w) {
      return '<span class="w">' + w + '</span>';
    }).join(' ');
  });
  words = document.querySelectorAll('[data-words] .w');

  var hero = document.querySelector('.hero');
  var statement = document.querySelector('.statement');

  function progress(el) {
    var r = el.getBoundingClientRect();
    var total = el.offsetHeight - window.innerHeight;
    if (total <= 0) return 1;
    return Math.min(1, Math.max(0, -r.top / total));
  }

  var ticking = false;
  function update() {
    ticking = false;
    if (hero) hero.style.setProperty('--p', progress(hero).toFixed(4));
    if (statement && words.length) {
      var p = progress(statement);
      var lit = Math.round(p * 1.15 * words.length);
      for (var i = 0; i < words.length; i++) words[i].classList.toggle('on', i < lit);
    }
  }
  if (!reduce) {
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // Highlights rail buttons
  var rail = document.querySelector('[data-rail]');
  if (rail) {
    var step = function (dir) {
      var card = rail.querySelector('.card');
      var w = card ? card.getBoundingClientRect().width + 20 : 400;
      rail.scrollBy({ left: dir * w, behavior: reduce ? 'auto' : 'smooth' });
    };
    document.querySelector('[data-rail-prev]').addEventListener('click', function () { step(-1); });
    document.querySelector('[data-rail-next]').addEventListener('click', function () { step(1); });
  }
})();
