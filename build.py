#!/usr/bin/env python3
"""Builds the hot tub pages from src/tubs.json.

Outputs (never hand-edit these, edit src/tubs.json or this file and rebuild):
  hot-tubs/index.html                      the three series
  hot-tubs/<series>/index.html             immersive series overview
  hot-tubs/<series>/<model>/index.html     model details
"""
import html
import json, re
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = json.load(open(os.path.join(ROOT, "src", "tubs.json")))
SERIES = DATA["series"]
MODELS = DATA["models"]
SWIM = DATA["swimspa_models"]
# Swim spa pages and their dropdown only go live once every photo is in assets/img/models/.
SWIM_READY = all(os.path.exists(os.path.join(ROOT, "assets/img/models", p + ".webp")) for k in DATA["swimspas"]["models"] for p in DATA["swimspa_models"][k]["photos"])
IMG = "/assets/img/models/"

e = html.escape
CUR = ' aria-current="page"'


def head(title, desc, extra=""):
    return f"""<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta name="theme-color" content="#000000">
<link rel="icon" href="/assets/img/icon-512.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/site.css">
{extra}</head>
<body class="tubs">
{header()}"""


def header():
    """Site header with Apple-style dropdowns for hot tubs and swim spas, plus a phone menu."""
    tub_cols = ""
    for se in SERIES:
        items = "".join(
            f'<li><a href="/hot-tubs/{se["slug"]}/{k}/">{e(MODELS[k]["name"])}<span>{MODELS[k]["people"]} people &middot; {MODELS[k]["jets"]} jets</span></a></li>'
            for k in se["models"]
        )
        tub_cols += f"""<div class="mega-col">
          <a class="mega-head" href="/hot-tubs/{se['slug']}/">{e(se['name'])}</a>
          <p class="mega-sub">{e(se['range'])} &middot; {e(se['stats'][1][0])} people</p>
          <ul>{items}</ul>
        </div>"""
    sw = DATA["swimspas"]
    river = [k for k in sw["models"] if SWIM[k]["system"] == "River jets"]
    turb = [k for k in sw["models"] if SWIM[k]["system"] != "River jets"]

    def swim_items(keys):
        return "".join(
            f'<li><a href="/swim-spas/{k}/">{e(SWIM[k]["name"])}<span>{SWIM[k]["length"]} &middot; {SWIM[k]["people"]} people</span></a></li>'
            for k in keys
        )

    swim_cols = f"""<div class="mega-col">
          <a class="mega-head" href="/swim-spas/">River jets</a>
          <p class="mega-sub">A smooth, adjustable current</p>
          <ul>{swim_items(river)}</ul>
        </div>
        <div class="mega-col">
          <a class="mega-head" href="/swim-spas/">9-speed turbine</a>
          <p class="mega-sub">A wider, deeper current for training</p>
          <ul>{swim_items(turb)}</ul>
        </div>"""

    def promo(img, title, text, href):
        return f"""<a class="mega-promo" href="{href}"><img src="{IMG}{img}.webp" alt="" loading="lazy"><span class="mega-promo-t">{e(title)}</span><span class="mega-promo-d">{e(text)}</span></a>"""

    m_tubs = "".join(
        f'<li><a href="/hot-tubs/{se["slug"]}/">{e(se["name"])} <span>{e(se["range"])}</span></a></li>' for se in SERIES
    )
    m_swim = "".join(f'<li><a href="/swim-spas/{k}/">{e(SWIM[k]["name"])}</a></li>' for k in sw["models"])

    swim_mega = f"""  <div class="mega" id="mega-swim" hidden>
    <div class="mega-in">
      {swim_cols}
      <div class="mega-col mega-side">
        {promo("solara-quarter", "All swim spas", "Six swim spas, 14 to 19 ft. Swim, train and soak.", "/swim-spas/")}
        <a class="mega-zen" href="/find-your-zen/">Not sure? Find your Zen</a>
      </div>
    </div>
  </div>
""" if SWIM_READY else ""
    return f"""<header class="nav" id="top">
  <div class="nav-in">
    <a class="nav-logo" href="/" aria-label="AquaZen home"><img src="/assets/img/logo-word.png" alt="AquaZen" width="112" height="32"></a>
    <nav class="nav-links" aria-label="Main">
      <button class="nav-drop" type="button" aria-expanded="false" aria-controls="mega-tubs">Hot tubs</button>
      {'<button class="nav-drop" type="button" aria-expanded="false" aria-controls="mega-swim">Swim spas</button>' if SWIM_READY else '<a href="/#water">Swim spas</a>'}
      <a href="/#water">Mini pools</a>
      <a href="/how-we-deliver-zen/">How we deliver Zen</a>
      <a href="/visit/">Visit</a>
      <a class="nav-signin" href="/login/">Sign in</a>
    </nav>
    <a class="pill pill-sm" href="/find-your-zen/">Find your Zen</a>
    <button class="nav-burger" type="button" aria-expanded="false" aria-controls="mmenu" aria-label="Open menu"><span></span><span></span></button>
  </div>
  <div class="mega" id="mega-tubs" hidden>
    <div class="mega-in">
      {tub_cols}
      <div class="mega-col mega-side">
        {promo("cove-quarter", "All hot tubs", "Thirteen tubs, three series. Compare them all.", "/hot-tubs/")}
        <a class="mega-zen" href="/find-your-zen/">Not sure? Find your Zen</a>
      </div>
    </div>
  </div>
{swim_mega}  <div class="mmenu" id="mmenu" hidden>
    <details><summary>Hot tubs</summary><ul>{m_tubs}<li><a href="/hot-tubs/">All hot tubs</a></li></ul></details>
    {f'<details><summary>Swim spas</summary><ul>{m_swim}<li><a href="/swim-spas/">All swim spas</a></li></ul></details>' if SWIM_READY else '<a href="/#water">Swim spas</a>'}
    <a href="/#water">Mini pools</a>
    <a href="/how-we-deliver-zen/">How we deliver Zen</a>
    <a href="/visit/">Visit</a>
    <a href="/login/">Sign in <span class="mmenu-sub">Customers and staff</span></a>
    <a class="pill" href="/find-your-zen/">Find your Zen</a>
    <a class="mmenu-call" href="tel:+12363044424">Call or text 236-304-4424</a>
  </div>
</header>
"""


def inject_home_header():
    """Put the same header on the hand-written home page, between markers."""
    for path in ["index.html"]:
        full = os.path.join(ROOT, path)
        txt = open(full).read()
        start, end = "<!-- HEADER -->", "<!-- /HEADER -->"
        if start not in txt:
            a = txt.index('<header class="nav"')
            b = txt.index("</header>", a) + len("</header>")
            txt = txt[:a] + start + "\n" + end + txt[b:]
        a = txt.index(start) + len(start)
        b = txt.index(end)
        txt = txt[:a] + "\n" + header() + txt[b:]
        if "/assets/js/menu.js" not in txt:
            txt = txt.replace("</body>", '<script src="/assets/js/menu.js"></script>\n</body>')
        open(full, "w").write(txt)


def built(kind):
    """The three things that set AquaSolus apart, written for the Lower Mainland."""
    if kind == "tub":
        water = ("Water this clean takes more than ozone.", "A typical hot tub takes about 45 minutes to move all its water through the filter and ozone. With four to five times more water flowing through the jets, an AquaSolus does it in under 10. Every series has a double ozonator: ozone held under water in a mixing chamber for at least 45 seconds, then a UV stage. Cleaner water, fewer chemicals.")
        build = ("Build quality, second to none.", "A 304 stainless steel frame that won't rot or rust, on a structured ABS base pan that seals and protects the bottom of the tub. Built for the longest life you can get.")
    else:
        water = ("Clean water, simply.", "Ozone water care comes standard, and soft Lower Mainland water keeps the routine short. We show you exactly how before delivery.")
        build = ("Built to carry the weight.", "A 304 stainless steel frame that won't rot or rust, made to hold thousands of litres for years.")
    massage = ("A massage that pulls the tension out.", "It's not the number of jets, it's how the water reaches you. Most hot tubs use skinny plumbing, like a thumb over a garden hose, and the sharp spray can feel itchy. AquaSolus uses wide plumbing that delivers four to five times more water to every jet, so a big, warm volume of water works over more of your back and draws the tension out.")
    eff = ("Easy on the planet. And your hydro bill.", "Full AQ10 insulation keeps the heat the pumps make inside and puts it back into the water, instead of losing it to the air. Less wasted heat, less electricity.")
    items = (massage, water, eff, build) if kind == "tub" else (water, eff, build)
    tiles = "".join(f'<div class="tile"><h3>{e(t)}</h3><p>{e(d)}</p></div>' for t, d in items)
    return f"""
<section class="equip equip-sm">
  <div class="wrap center"><h2 class="h2">Why it's different.</h2></div>
  <div class="wrap tiles {'tiles-3 tiles-4' if kind == 'tub' else 'tiles-3'}">{tiles}</div>
  {'<div class="wrap center equip-more"><a class="pill" href="/how-we-deliver-zen/">See how we deliver Zen</a></div>' if kind == 'tub' else ''}
</section>
"""


def subnav(crumbs, links=None):
    """Apple-style secondary bar: where you are, plus sibling links."""
    c = ' <span aria-hidden="true">/</span> '.join(
        f'<a href="{u}">{e(t)}</a>' if u else f"<strong>{e(t)}</strong>" for t, u in crumbs
    )
    l = ""
    if links:
        l = '<nav class="subnav-links" aria-label="In this series">' + "".join(
            f'<a href="{u}"{CUR if cur else ""}>{e(t)}</a>' for t, u, cur in links
        ) + "</nav>"
    return f'<div class="subnav"><div class="subnav-in"><p class="crumbs">{c}</p>{l}</div></div>\n'


FOOT = """
<section class="find find-sm" aria-labelledby="fz-title">
  <div class="wrap center">
    <img class="find-mark" src="/assets/img/logo-mark.png" alt="" width="217" height="91">
    <h2 id="fz-title" class="display sunset">Find your Zen.</h2>
    <p class="lede">Not sure which one is right? Answer a few quick questions and we&rsquo;ll help you find the perfect model, then call to book a quiet visit. No pressure, no rush.</p>
    <div class="hero-ctas"><a class="pill" href="{fz}">Find your Zen</a><a class="link" href="tel:+12363044424">Or call 236-304-4424</a></div>
  </div>
</section>
</main>
<footer class="foot">
  <div class="wrap foot-in">
    <img src="/assets/img/logo-full.png" alt="AquaZen" width="167" height="101" loading="lazy">
    <p class="foot-tag">Your Zen is calling.</p>
    <p>Aqua Zen Wellness Consulting, operating as AquaZen. 7049 Russell Ave, Burnaby, BC V5J 4R8.</p>
    <p><a class="plain" href="tel:+12363044424">236-304-4424</a> &nbsp; <a class="plain" href="mailto:shaun@aquazen.ca">shaun@aquazen.ca</a></p>
    <p>Hot tub photos and specifications courtesy of AquaSolus. Confirm details with us before ordering. &copy; 2026 AquaZen.</p>
    <p><a class="plain" href="/questions/">Hot tub questions</a> &nbsp; <a class="plain" href="/privacy/">Privacy</a> &nbsp; <a class="plain" href="/terms/">Terms</a> &nbsp; <a class="plain" href="/login/">Customer &amp; staff sign-in</a></p>
  </div>
</footer>
<script src="/assets/js/menu.js"></script>
<script src="/assets/js/prices.js"></script>
<script src="/assets/js/tubs.js"></script>
</body>
</html>
"""


def ov(k, m):
    return m.get("overhead", k + "-overhead")


def qt(k, m):
    return m.get("quarter", k + "-quarter")


def seats_line(m):
    if m["loungers"]:
        return f'{m["seats"]} seat{"s" if m["seats"] != 1 else ""} + {m["loungers"]} lounger{"s" if m["loungers"] != 1 else ""}'
    return f'{m["seats"]} seats'


def pkey(kind, name):
    """Key the website price script matches against public_prices(): product type and slugified model name."""
    t = "hot_tub" if kind == "tub" else "swim_spa"
    return t + ":" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def write(path, text):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        f.write(text)


def series_by_slug(slug):
    return next(s for s in SERIES if s["slug"] == slug)


# ---------- Hub: /hot-tubs/ ----------
def build_hub():
    cards = ""
    for s in SERIES:
        cards += f"""
    <a class="hub-card" href="/hot-tubs/{s['slug']}/">
      <img src="{IMG}{s['hero']}.webp" alt="" loading="lazy">
      <span class="hub-copy">
        <span class="hub-range">{e(s['range'])}</span>
        <span class="hub-name">{e(s['name'])}</span>
        <span class="hub-head">{e(s['headline'])}</span>
        <span class="hub-meta">{e(s['stats'][1][0])} people &middot; {e(s['stats'][2][0])} jets</span>
        <span class="hub-go">Explore {e(s['name'])}</span>
      </span>
    </a>"""
    page = head("Hot tubs | AquaZen", "AquaSolus hot tubs in Burnaby: Series One, Two and Three, for 3 to 7 people.")
    page += subnav([("Hot tubs", None)])
    page += f"""<main>
<section class="tub-intro">
  <div class="wrap center">
    <h1 class="display">Which hot tub is your Zen?</h1>
    <p class="lede">Thirteen AquaSolus hot tubs in three series. Start with how you want to live, then pick the one that fits.</p>
  </div>
</section>
<section class="hub">
  <div class="wrap hub-grid">{cards}
  </div>
  <p class="wrap hub-note">Looking for the Vacation Series for a cabin or rental? <a class="link" href="/find-your-zen/">Ask us about it</a>.</p>
</section>
"""
    page += FOOT.format(fz="/find-your-zen/")
    write("hot-tubs/index.html", page)


# ---------- Series: /hot-tubs/<series>/ ----------
def build_series(s, models=MODELS, base=None, crumbs=None, kind="tub"):
    base = base or "/hot-tubs/" + s["slug"] + "/"
    crumbs = [("Hot tubs", "/hot-tubs/")] if crumbs is None else crumbs
    noun = "hot tub" if kind == "tub" else "swim spa"
    ms = [(k, models[k]) for k in s["models"]]
    links = [(m["name"], f"{base}{k}/", False) for k, m in ms]
    page = head(f"{s['name']}{' hot tubs' if kind == 'tub' else ''} | AquaZen", f"{s['name']} ({s['range']}): {s['lede']}")
    page += subnav(crumbs + [(s["name"], None)], links)

    stats = "".join(f'<div class="stat"><span class="stat-n">{e(n)}</span><span class="stat-l">{e(l)}</span></div>' for n, l in s["stats"])

    feats = "".join(
        f"""<article class="card"><img src="{IMG}{img}.webp" alt="" loading="lazy"><div class="card-copy"><h3>{e(t)}</h3><p>{e(d)}</p></div></article>"""
        for img, t, d in s["features"]
    )

    picks = "".join(
        f"""<a class="pick" href="{base}{k}/">
      <img src="{IMG}{qt(k, m)}.webp" alt="{e(m['name'])} {noun}" loading="lazy">
      <span class="pick-name">{e(m['name'])}</span>
      <span class="pick-tag">{e(m['tag'])}</span>
      <span class="pick-facts">{m['people']} people &middot; {m['jets']} jets &middot; {e(seats_line(m))}</span>
      <span class="zen-price zp-card" data-price="{pkey(kind, m['name'])}" hidden></span>
      <span class="pick-go">See the {e(m['name'])}</span>
    </a>"""
        for k, m in ms
    )

    rows = "".join(
        f"""<tr><th scope="row"><a href="{base}{k}/">{e(m['name'])}</a></th><td>{m['people']}</td><td>{m['seats']} / {m['loungers']}</td><td>{e(m['in'])}</td><td>{m['gal']} US gal</td><td>{m['jets']}</td><td>{e(m['power'])}</td></tr>"""
        for k, m in ms
    )

    page += f"""<main>
<section class="s-hero" data-zoom>
  <div class="s-hero-copy">
    <p class="s-range">{e(s['range'])}</p>
    <h1 class="s-name">{e(s['name'])}</h1>
    <p class="s-head sunset">{e(s['headline'])}</p>
  </div>
  <figure class="s-hero-img"><img src="{IMG}{s['hero']}.webp" alt="" fetchpriority="high"></figure>
</section>

<section class="s-lede">
  <div class="wrap center">
    <p class="lede lede-big">{e(s['lede'])}</p>
    <div class="stats">{stats}</div>
  </div>
</section>

<section class="picks-sec" id="models">
  <div class="wrap center"><h2 class="h2">Choose your {e(s['name'])}.</h2><p class="picks-lede">Tap any {noun} for the full details, photos and specs.</p></div>
  <div class="wrap picks picks-{len(ms)}">{picks}</div>
  <div class="wrap center picks-help"><p>Not sure which one fits? Answer a few quick questions and we&rsquo;ll help you find the perfect model.</p><a class="pill pill-dark" href="/find-your-zen/">Find your Zen</a></div>
</section>

<section class="highlights">
  <div class="wrap"><h2 class="h2">Every {e(s['name'])} comes with</h2></div>
  <div class="rail" data-rail tabindex="0" aria-label="Features, scroll sideways">{feats}</div>
  <div class="rail-nav wrap">
    <button class="rail-btn" data-rail-prev aria-label="Previous feature"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button class="rail-btn" data-rail-next aria-label="Next feature"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </div>
</section>

{built(kind)}

<section class="compare">
  <div class="wrap">
    <h2 class="h2">Compare {e(s['name'])}</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Model</th><th scope="col">People</th><th scope="col">Seats / loungers</th><th scope="col">Size</th><th scope="col">Water</th><th scope="col">Jets</th><th scope="col">Power</th></tr></thead>
      <tbody>{rows}</tbody>
    </table></div>
  </div>
</section>

<section class="honest">
  <div class="wrap narrow">
    <h2 class="h2">Shaun's honest take</h2>
    <p>{e(s['honest'])}</p>
  </div>
</section>
"""
    page += FOOT.format(fz="/find-your-zen/")
    write(base.strip("/") + "/index.html", page)


# ---------- Model: /hot-tubs/<series>/<model>/ ----------
def build_model(k, m, s=None, models=MODELS, base=None, crumbs=None, kind="tub"):
    s = s or series_by_slug(m["series"])
    base = base or "/hot-tubs/" + s["slug"] + "/"
    crumbs = [("Hot tubs", "/hot-tubs/")] if crumbs is None else crumbs
    noun = "hot tub" if kind == "tub" else "swim spa"
    swimrow = f'<div><dt>Swim system</dt><dd>{e(m["system"])}</dd><dd class="spec-sub">{e(m["length"])} long</dd></div>' if m.get("system") else ""
    sibs = [(models[x]["name"], f"{base}{x}/", x == k) for x in s["models"]]
    page = head(f"{m['name']} {noun} | AquaZen", f"The AquaSolus {m['name']} {noun}: {m['tag']} {m['people']} people, {m['jets']} jets. See it at AquaZen in Burnaby.")
    page += subnav(crumbs + [(s["name"], base), (m["name"], None)], sibs)

    photos = m["photos"]
    gallery = "".join(
        f'<button class="gal-item" type="button" data-full="{IMG}{p}.webp" aria-label="Enlarge photo {i + 1} of the {e(m["name"])}"><img src="{IMG}{p}.webp" alt="" loading="lazy"></button>'
        for i, p in enumerate(photos)
    )
    feats = "".join(
        f"""<article class="card"><img src="{IMG}{img}.webp" alt="" loading="lazy"><div class="card-copy"><h3>{e(t)}</h3><p>{e(d)}</p></div></article>"""
        for img, t, d in s["features"]
    )
    jetmix = f'<dd class="spec-sub">{e(m["jetmix"])}</dd>' if m["jetmix"] else ""
    others = "".join(
        f"""<a class="pick pick-sm" href="{base}{x}/"><img src="{IMG}{qt(x, models[x])}.webp" alt="" loading="lazy"><span class="pick-name">{e(models[x]['name'])}</span><span class="pick-facts">{models[x]['people']} people &middot; {models[x]['jets']} jets</span></a>"""
        for x in s["models"] if x != k
    )

    page += f"""<main>
<section class="m-hero">
  <div class="wrap center m-hero-copy">
    <p class="s-range">{e(s['name'])} &middot; {e(s['range'])}</p>
    <h1 class="m-name">{e(m['name'])}</h1>
    <p class="m-tag">{e(m['tag'])}</p>
    <p class="zen-price zp-hero" data-price="{pkey(kind, m['name'])}" hidden></p>
    <div class="hero-ctas"><a class="pill" href="/find-your-zen/?model={k}">Find your Zen</a><a class="link" href="#specs">Tech specs</a></div>
  </div>
  <div class="tilt" data-tilt><img src="{IMG}{photos[0]}.webp" alt="The {e(m['name'])} {noun}" fetchpriority="high"></div>
</section>

<section class="m-stats">
  <div class="wrap stats stats-4">
    <div class="stat"><span class="stat-n">{m['people']}</span><span class="stat-l">people</span></div>
    <div class="stat"><span class="stat-n">{m['jets']}</span><span class="stat-l">jets</span></div>
    <div class="stat"><span class="stat-n">{m['loungers'] or 'All'}</span><span class="stat-l">{'lounger' + ('s' if m['loungers'] > 1 else '') if m['loungers'] else 'upright seats'}</span></div>
    <div class="stat"><span class="stat-n">{m['gal']}</span><span class="stat-l">US gallons</span></div>
  </div>
</section>

<section class="orbit orbit-one" data-orbit style="--count:1" aria-label="The {e(m['name'])} from above">
  <div class="orbit-sticky">
    <div class="orbit-stage" aria-hidden="true"><img class="orbit-img" data-i="0" src="{IMG}{ov(k, m)}.webp" alt="" loading="lazy"></div>
    <div class="orbit-caps"><div class="orbit-cap" data-i="0">
      <h3>Made for</h3>
      <p class="orbit-tag">{e(m['fit'])}</p>
      <ul class="orbit-facts"><li>{e(seats_line(m))}</li><li>{e(m['in'])}</li></ul>
    </div></div>
  </div>
</section>

<section class="gallery">
  <div class="wrap"><h2 class="h2">A closer look.</h2></div>
  <div class="rail gal-rail" tabindex="0" aria-label="Photos, scroll sideways">{gallery}</div>
</section>

<section class="highlights">
  <div class="wrap"><h2 class="h2">Built in</h2></div>
  <div class="rail" data-rail tabindex="0" aria-label="Features, scroll sideways">{feats}</div>
  <div class="rail-nav wrap">
    <button class="rail-btn" data-rail-prev aria-label="Previous feature"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button class="rail-btn" data-rail-next aria-label="Next feature"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </div>
</section>

{built(kind)}
<section class="specs" id="specs">
  <div class="wrap">
    <h2 class="h2">Tech specs</h2>
    <dl class="spec-grid">
      {swimrow}<div><dt>Capacity</dt><dd>{m['people']} people</dd><dd class="spec-sub">{e(seats_line(m))}</dd></div>
      <div><dt>Jets</dt><dd>{m['jets']} jets</dd>{jetmix}</div>
      <div><dt>Size</dt><dd>{e(m['in'])}</dd><dd class="spec-sub">{e(m['mm'])}, length x width x height</dd></div>
      <div><dt>Water</dt><dd>{m['gal']} US gallons</dd><dd class="spec-sub">{m['l']} litres</dd></div>
      <div><dt>Weight</dt><dd>{e(m['dry'])} empty</dd><dd class="spec-sub">{e(m['full'])} full</dd></div>
      <div><dt>Power</dt><dd>{e(m['power'])}</dd></div>
      <div><dt>Pumps</dt><dd>{e(m['pumps'])}</dd><dd class="spec-sub">Plus a circulation pump</dd></div>
      <div><dt>Heater and controls</dt><dd>{e(m['heater'])}</dd><dd class="spec-sub">{e(m['panel'])} control panel</dd></div>
      <div><dt>Water care</dt><dd>{'Double ozonator: ozone with a 45-second mixing chamber, then UV' if kind == 'tub' else 'Ozone, standard'}</dd><dd class="spec-sub">{'Plus Gecko WaterLab real-time monitoring' if s['slug'] == 'series-three' else 'Simple with soft Lower Mainland water'}</dd></div>
      <div><dt>Efficiency</dt><dd>AQ10 full insulation</dd><dd class="spec-sub">Heat from the pumps is kept in and put back into the water</dd></div>
      <div><dt>Shell colours</dt><dd class="swatches"><span><img src="{IMG}swatch-sterling.webp" alt="" width="28" height="28">Sterling Silver</span><span><img src="{IMG}swatch-odyssey.webp" alt="" width="28" height="28">Odyssey Grey</span></dd></div>
      <div><dt>Built to last</dt><dd>{'304 stainless steel frame on a structured ABS base pan' if kind == 'tub' else '304 stainless steel frame'}</dd><dd class="spec-sub">{e(DATA['warranty'])}</dd></div>
    </dl>
  </div>
</section>

<section class="picks-sec">
  <div class="wrap center"><h2 class="h2">More in {e(s['name'])}</h2></div>
  <div class="wrap picks picks-sm-row">{others}</div>
  <p class="wrap center"><a class="link" href="{base}">See all of {e(s['name'])}</a></p>
</section>

<div class="lightbox" id="lightbox" hidden role="dialog" aria-modal="true" aria-label="Photo">
  <button class="lb-close" type="button" aria-label="Close photo">Close</button>
  <img alt="">
</div>
"""
    page += FOOT.format(fz=f"/find-your-zen/?model={k}")
    write(base.strip("/") + f"/{k}/index.html", page)


def build_how():
    """How we deliver Zen: the scroll presentation that sells the tub and leads to Find your Zen."""
    body = open(os.path.join(ROOT, "src", "how.html")).read()
    page = head("How we deliver Zen | AquaZen", "You expect a luxury spa without the stress. Here's how an AquaSolus hot tub delivers it: the massage, the water flow, the double ozonator and the energy.")
    page = page.replace('<body class="tubs">', '<body class="tubs how">')
    foot = FOOT.split("</main>", 1)[1].replace('<script src="/assets/js/tubs.js"></script>', '<script src="/assets/js/how.js"></script>')
    write("how-we-deliver-zen/index.html", page + body + "\n</main>" + foot)


def build_legal():
    """Privacy policy and terms of use, from src/legal/*.md."""
    import markdown
    for slug, title, lead in [("privacy", "Privacy policy", "What we collect, why, and how we look after it."),
                              ("terms", "Terms of use", "The terms for our website, customer portal and staff portal.")]:
        body = markdown.markdown(open(os.path.join(ROOT, "src", "legal", slug + ".md")).read())
        page = head(f"{title} | AquaZen", lead)
        page += f"""<main>
<section class="tub-intro"><div class="wrap center"><h1 class="display">{title}</h1><p class="lede">{lead} Last updated November 17, 2026.</p></div></section>
<section class="legal"><div class="wrap prose">{body}</div></section>
"""
        page += FOOT.format(fz="/find-your-zen/")
        write(f"{slug}/index.html", page)


def build_app():
    """Back office pages: sign-in, staff portal, online signing and customer portal. Not indexed by search engines."""
    def img_for(photos, fallback):
        for ph in photos:
            if os.path.exists(os.path.join(ROOT, "assets/img/models", ph + ".webp")):
                return "models/" + ph
        return fallback
    def top_for(name):
        """The top-down photo, used on quotes and the signing page so the customer sees the tub itself."""
        if os.path.exists(os.path.join(ROOT, "assets/img/models", name + ".webp")):
            return "models/" + name
        return name if os.path.exists(os.path.join(ROOT, "assets/img", name + ".webp")) else None
    tubs = [{"k": k, "n": m["name"], "line": series_by_slug(m["series"])["name"], "seats": m["people"],
             "jets": m["jets"], "power": m["power"]} for k, m in MODELS.items()]
    products = {
        "hot_tub": {"label": "Hot tub", "make": "AquaSolus", "groups": [
            {"name": se["name"], "items": [{"n": MODELS[k]["name"], "img": img_for(MODELS[k]["photos"], "aquazen-interior"), "top": top_for(ov(k, MODELS[k]))} for k in se["models"]]} for se in SERIES]},
        "swim_spa": {"label": "Swim spa", "make": "AquaSolus", "groups": [
            {"name": "", "items": [{"n": SWIM[k]["name"], "img": img_for(SWIM[k]["photos"], "aquazen-swimspa-overhead"), "top": top_for(ov(k, SWIM[k])) or "aquazen-swimspa-overhead"} for k in DATA["swimspas"]["models"]]}]},
        "mini_pool": {"label": "Mini pool", "make": "AquaSolus", "groups": []},
    }
    data = f"<script>window.AZ_TUBS={json.dumps(tubs)};window.AZ_PRODUCTS={json.dumps(products)};</script>\n"
    for slug, title, js in [("login", "Sign in", "login"), ("staff", "Staff portal", "staff"), ("sign", "Sign your agreement", "sign"), ("portal", "Your portal", "portal"), ("pay", "Secure payment", "pay")]:
        body = open(os.path.join(ROOT, "src", "app", slug + ".html")).read()
        write(f"{slug}/index.html", f"""<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)} | AquaZen</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#000000">
<link rel="icon" href="/assets/img/icon-512.png">
<link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="app app-{slug}">
<header class="apptop"><div class="wrap"><a href="/" aria-label="AquaZen home"><img src="/assets/img/logo-word.png" alt="AquaZen" width="104" height="30"></a><a href="tel:+12363044424">236-304-4424</a></div></header>
{data}{body}
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.js"></script>
<script src="/assets/js/app.js"></script>
<script src="/assets/js/{js}.js"></script>
{'<script src="/assets/js/ads.js"></script>' + chr(10) + '<script src="/assets/js/noah.js"></script>' + chr(10) if slug == "staff" else ""}</body>
</html>
""")


def stamp_assets():
    """Add ?v=<content hash> to CSS and JS links in every page, so phones never use a stale copy."""
    import hashlib
    import re
    ver = {}
    for rel in ["assets/css/site.css", "assets/css/app.css", "assets/js/site.js", "assets/js/menu.js", "assets/js/tubs.js", "assets/js/finder.js", "assets/js/how.js", "assets/js/prices.js", "assets/js/app.js", "assets/js/login.js", "assets/js/staff.js", "assets/js/sign.js", "assets/js/portal.js", "assets/js/pay.js", "assets/js/ads.js", "assets/js/noah.js"]:
        ver[os.path.basename(rel)] = hashlib.md5(open(os.path.join(ROOT, rel), "rb").read()).hexdigest()[:8]
    pat = re.compile(r'((?:\.\./|/)?assets/(?:css|js)/)(' + "|".join(re.escape(k) for k in ver) + r')(\?v=[0-9a-f]+)?')
    for dirpath, _, files in os.walk(ROOT):
        if "/.git" in dirpath or "/supabase" in dirpath:
            continue
        for f in files:
            if f.endswith(".html"):
                full = os.path.join(dirpath, f)
                txt = open(full).read()
                new = pat.sub(lambda m: m.group(1) + m.group(2) + "?v=" + ver[m.group(2)], txt)
                if new != txt:
                    open(full, "w").write(new)


SITE = "https://aquazen.ca"
ADDRESS = "7049 Russell Ave, Burnaby, BC V5J 4R8"
MAPS_URL = "https://www.google.com/maps/search/?api=1&query=AquaZen+7049+Russell+Ave+Burnaby+BC+V5J+4R8"
# Paste the content value of Google Search Console's HTML tag here (google-site-verification) and rebuild.
GOOGLE_SITE_VERIFICATION = ""
# Our delivery crew goes anywhere from Whistler to Hope.
DELIVERY_AREA = ["Whistler", "Squamish", "West Vancouver", "North Vancouver", "Vancouver", "Burnaby", "New Westminster", "Richmond", "Delta", "Surrey", "White Rock", "Langley", "Coquitlam", "Port Coquitlam", "Port Moody", "Pitt Meadows", "Maple Ridge", "Mission", "Abbotsford", "Chilliwack", "Agassiz", "Harrison Hot Springs", "Hope"]
STORE = {
    "@type": ["Store", "LocalBusiness"], "@id": SITE + "/#store",
    "name": "AquaZen", "legalName": "Aqua Zen Wellness Consulting",
    "description": "AquaSolus hot tubs and swim spas in Burnaby, BC, delivered anywhere from Whistler to Hope. The right equipment from day one, honest advice, and care for the life of your tub.",
    "url": SITE + "/", "telephone": "+1-236-304-4424", "email": "shaun@aquazen.ca",
    "image": SITE + "/assets/img/og-aquazen.jpg", "logo": SITE + "/assets/img/icon-512.png",
    "address": {"@type": "PostalAddress", "streetAddress": "7049 Russell Ave", "addressLocality": "Burnaby",
                "addressRegion": "BC", "postalCode": "V5J 4R8", "addressCountry": "CA"},
    "hasMap": MAPS_URL,
    "contactPoint": {"@type": "ContactPoint", "telephone": "+1-236-304-4424", "email": "shaun@aquazen.ca",
                     "contactType": "sales", "areaServed": "CA-BC", "availableLanguage": "English"},
    "potentialAction": {"@type": "ReserveAction", "name": "Book a visit", "target": SITE + "/find-your-zen/"},
    "founder": {"@type": "Person", "name": "Shaun McAvoy"},
    "brand": {"@type": "Brand", "name": "AquaSolus"},
    "slogan": "Your Zen is calling.",
    "areaServed": [{"@type": "City", "name": c} for c in DELIVERY_AREA],
    "knowsAbout": ["hot tubs", "swim spas", "hot tub water care", "hot tub installation in BC"],
}
APP_DIRS = ("login", "staff", "sign", "portal")


def build_faq():
    """Hot tub questions: a plain-answer page with FAQPage schema, for Google and AI assistants."""
    d = json.load(open(os.path.join(ROOT, "src", "faq.json")))
    page = head(f"{d['title']} | AquaZen", d["lead"])
    groups = ""
    for g in d["groups"]:
        items = "".join(f'<details class="qa"><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in g["items"])
        groups += f'<h2>{e(g["name"])}</h2>{items}'
    page += f"""<main>
<section class="tub-intro"><div class="wrap center"><h1 class="display">{e(d['title'])}</h1><p class="lede">{e(d['lead'])}</p></div></section>
<section class="legal faq"><div class="wrap prose">{groups}<p class="faq-more">Still wondering about something? Call or text <a href="tel:+12363044424">236-304-4424</a>. No question is too small.</p></div></section>
"""
    page += FOOT.format(fz="/find-your-zen/")
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for g in d["groups"] for q, a in g["items"]]}
    page = page.replace("</head>", f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>\n</head>', 1)
    write("questions/index.html", page)


def seo():
    """Canonical links, social cards, structured data, sitemap.xml, robots.txt. App pages are kept out of search."""
    import datetime
    by_url = {}
    for s in SERIES:
        by_url[f"/hot-tubs/{s['slug']}/"] = ("series", s)
        for k in s["models"]:
            by_url[f"/hot-tubs/{s['slug']}/{k}/"] = ("model", (s, k, MODELS[k]))
    urls = []
    for dirpath, _, files in os.walk(ROOT):
        rel = os.path.relpath(dirpath, ROOT)
        if rel.startswith((".git", "supabase", "src", "assets", "__pycache__")):
            continue
        if "index.html" not in files:
            continue
        path = "/" if rel == "." else "/" + rel.replace(os.sep, "/") + "/"
        full = os.path.join(dirpath, "index.html")
        txt = open(full).read()
        txt = re.sub(r"\n?<!-- seo -->.*?<!-- /seo -->", "", txt, flags=re.S)
        if path.strip("/").split("/")[0] in APP_DIRS:
            tags = '<!-- seo --><meta name="robots" content="noindex, nofollow"><!-- /seo -->'
        else:
            urls.append(path)
            title = re.search(r"<title>(.*?)</title>", txt, re.S).group(1)
            dm = re.search(r'<meta name="description" content="([^"]*)"', txt)
            desc = dm.group(1) if dm else ""
            img = SITE + "/assets/img/og-aquazen.jpg"
            lds = []
            kind = by_url.get(path)
            if path == "/":
                lds.append({"@context": "https://schema.org", **STORE})
                lds.append({"@context": "https://schema.org", "@type": "WebSite", "@id": SITE + "/#site", "url": SITE + "/",
                            "name": "AquaZen", "publisher": {"@id": SITE + "/#store"}})
            if kind and kind[0] == "model":
                s, k, m = kind[1]
                img = f"{SITE}/assets/img/models/{k}-quarter.webp" if os.path.exists(os.path.join(ROOT, "assets/img/models", k + "-quarter.webp")) else img
                lds.append({"@context": "https://schema.org", "@type": "Product", "name": f"AquaSolus {m['name']} hot tub",
                            "brand": {"@type": "Brand", "name": "AquaSolus"}, "category": "Hot tub",
                            "description": f"{m['tag']} {m['fit']}", "image": img, "url": SITE + path,
                            "additionalProperty": [
                                {"@type": "PropertyValue", "name": "Seats", "value": m["people"]},
                                {"@type": "PropertyValue", "name": "Jets", "value": m["jets"]},
                                {"@type": "PropertyValue", "name": "Size", "value": m["in"]},
                                {"@type": "PropertyValue", "name": "Power", "value": m["power"]},
                                {"@type": "PropertyValue", "name": "Series", "value": f"{s['name']} ({s['range']})"}],
                            "seller": {"@id": SITE + "/#store"}})
            if kind and kind[0] == "series":
                s = kind[1]
                lds.append({"@context": "https://schema.org", "@type": "ItemList", "name": f"AquaSolus {s['name']} hot tubs",
                            "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": MODELS[k]["name"],
                                                 "url": f"{SITE}/hot-tubs/{s['slug']}/{k}/"} for i, k in enumerate(s["models"])]})
            parts = [p for p in path.strip("/").split("/") if p]
            if parts:
                crumbs, acc = [{"@type": "ListItem", "position": 1, "name": "AquaZen", "item": SITE + "/"}], ""
                for i, p in enumerate(parts):
                    acc += "/" + p
                    name = {"hot-tubs": "Hot tubs"}.get(p) or (by_url.get(acc + "/", (None, None))[1] or {})
                    if isinstance(name, dict):
                        name = name.get("name", p.replace("-", " ").title())
                    elif isinstance(name, tuple):
                        name = name[2]["name"]
                    crumbs.append({"@type": "ListItem", "position": i + 2, "name": name, "item": SITE + acc + "/"})
                lds.append({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": crumbs})
            tags = ["<!-- seo -->",
                    f'<link rel="canonical" href="{SITE}{path}">',
                    '<meta property="og:type" content="website">',
                    '<meta property="og:site_name" content="AquaZen">',
                    '<meta property="og:locale" content="en_CA">',
                    f'<meta property="og:url" content="{SITE}{path}">',
                    f'<meta property="og:title" content="{title}">',
                    f'<meta property="og:description" content="{desc}">',
                    f'<meta property="og:image" content="{img}">',
                    '<meta name="twitter:card" content="summary_large_image">',
                    *([f'<meta name="google-site-verification" content="{GOOGLE_SITE_VERIFICATION}">'] if GOOGLE_SITE_VERIFICATION and path == "/" else []),
                    '<meta name="geo.region" content="CA-BC"><meta name="geo.placename" content="Burnaby">']
            tags += [f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>' for x in lds]
            tags = "\n".join(tags) + "<!-- /seo -->"
        txt = txt.replace("</head>", tags + "\n</head>", 1)
        open(full, "w").write(txt)
    today = datetime.date.today().isoformat()
    pri = lambda u: "1.0" if u == "/" else "0.9" if u in ("/find-your-zen/", "/hot-tubs/", "/questions/", "/visit/") else "0.3" if u in ("/privacy/", "/terms/") else "0.8"
    sm = "".join(f"<url><loc>{SITE}{u}</loc><lastmod>{today}</lastmod><priority>{pri(u)}</priority></url>\n" for u in sorted(urls))
    open(os.path.join(ROOT, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + sm + "</urlset>\n")
    open(os.path.join(ROOT, "robots.txt"), "w").write("User-agent: *\nAllow: /\n" + "".join(f"Disallow: /{d}/\n" for d in APP_DIRS) + f"\nSitemap: {SITE}/sitemap.xml\n")



def llms():
    """llms.txt: a plain summary of AquaZen for AI assistants (ChatGPT, Claude, Gemini, Perplexity) that read the site."""
    lines = ["# AquaZen", "",
             "> AquaZen is a hot tub and swim spa store at 7049 Russell Ave, Burnaby, BC V5J 4R8, Canada. Visits are by appointment. It delivers anywhere from Whistler to Hope: " + ", ".join(DELIVERY_AREA) + ". "
             "It sells AquaSolus hot tubs and swim spas, set up with the right equipment from day one, with honest advice "
             "and care for the life of the tub. Founder: Shaun McAvoy, over twenty years in the hot tub industry. "
             "Phone or text 236-304-4424, email shaun@aquazen.ca.", "",
             "## Why people choose AquaZen",
             "- A hot tub is a place of peace at home. AquaZen helps people choose the tub that gives them that every night, and will recommend a smaller tub when it is the better fit.",
             "- Some stores hold back on equipment to sell more chemicals and service later. AquaZen sells the right equipment from day one: 56-frame pumps (not 48-frame) on 240V tubs, water turned over in under 10 minutes, a double ozonator with a 45-second mixing chamber then UV, and AQ10 insulation that keeps 100% of the water insulated 100% of the time.",
             "- Simple water care: 1 teaspoon of chlorine granules after each soak. AquaZen recommends chlorine, not bromine.",
             "- Local help: an exclusive electrical partner (Gerry Jansen), a pre-delivery guide with exact path sizes for every model, a delivery team that records each tub's serial number and photos, and a customer account with care guides and service requests.",
             "- AquaSolus tubs are handmade on a hand-welded 304 stainless steel frame with a sealed ABS base.", "",
             "## Hot tubs"]
    for se in SERIES:
        lines.append(f"- [{se['name']} ({se['range']})]({SITE}/hot-tubs/{se['slug']}/): {se['headline']} {se['lede']}")
        for k in se["models"]:
            m = MODELS[k]
            lines.append(f"  - [{m['name']}]({SITE}/hot-tubs/{se['slug']}/{k}/): {m['tag']} {m['people']} people, {m['jets']} jets, {m['in']}, {m['power']}. Made for {m['fit'][0].lower() + m['fit'][1:]}")
    sw = DATA["swimspas"]
    lines += ["", "## Swim spas", f"- {sw['name']} ({sw['range']}): {sw['lede']}"]
    lines += [f"  - {m['name']}: {m['tag']} {m['length']}, {m['people']} people, {m['system']}." for m in SWIM.values()]
    lines += ["", "## Key pages",
              f"- [Find your Zen]({SITE}/find-your-zen/): answer a few questions and AquaZen recommends a model and books a quiet visit.",
              f"- [How we deliver Zen]({SITE}/how-we-deliver-zen/): the massage, water flow, double ozonator, energy and insulation.",
              f"- [Visit]({SITE}/visit/): address, phone, by-appointment visits and the delivery area.",
              f"- [Hot tub questions]({SITE}/questions/): buying, installing in BC (electrical, permits, base, delivery) and owning a hot tub.",
              "", "## Questions people ask"]
    faq = json.load(open(os.path.join(ROOT, "src", "faq.json")))
    for g in faq["groups"]:
        for q, a in g["items"]:
            lines.append(f"- **{q}** {a}")
    open(os.path.join(ROOT, "llms.txt"), "w").write("\n".join(lines) + "\n")


def build_visit():
    """Visit: the address, phone, appointment-only note, map and delivery area. The page Google Business Profile links to."""
    page = head("Visit AquaZen | Hot tub store in Burnaby, BC", "Visit AquaZen at 7049 Russell Ave, Burnaby, BC V5J 4R8 by appointment. Call or text 236-304-4424. AquaSolus hot tubs and swim spas, delivered anywhere from Whistler to Hope.")
    towns = "".join(f"<li>{e(t)}</li>" for t in DELIVERY_AREA)
    page += f"""<main>
<section class="tub-intro"><div class="wrap center"><h1 class="display">Come sit in one.</h1><p class="lede">Take your time, try the seats and bring the people you&rsquo;ll be soaking with. A good decision beats a fast one, so visits are by appointment: it&rsquo;s just you, us and the tubs, with no rush.</p></div></section>
<section class="legal visitpage"><div class="wrap prose">
  <div class="vgrid">
    <div>
      <h2>AquaZen</h2>
      <p class="vaddr">7049 Russell Ave<br>Burnaby, BC V5J 4R8</p>
      <p><a href="tel:+12363044424">236-304-4424</a> (call or text)<br><a href="mailto:shaun@aquazen.ca">shaun@aquazen.ca</a></p>
      <p><b>Hours:</b> by appointment. Call or text to book a quiet visit, often the same week.</p>
      <p class="vbtns"><a class="pill" href="/find-your-zen/">Book a visit</a> <a class="link" href="{e(MAPS_URL)}">Open in Google Maps</a> &nbsp; <a class="link" href="https://maps.apple.com/?q=7049+Russell+Ave,+Burnaby,+BC+V5J+4R8">Apple Maps</a></p>
    </div>
    <div>
      <h2>We deliver from Whistler to Hope</h2>
      <p>Our own crew delivers and sets up your hot tub or swim spa anywhere in between, and we look after you just the same wherever home is.</p>
      <ul class="towns">{towns}</ul>
    </div>
  </div>
</div></section>
"""
    page += FOOT.format(fz="/find-your-zen/")
    write("visit/index.html", page)

if __name__ == "__main__":
    build_hub()
    for s in SERIES:
        build_series(s)
        for k in s["models"]:
            build_model(k, MODELS[k])
    sw = DATA["swimspas"]
    if SWIM_READY:
        build_series(sw, SWIM, "/swim-spas/", [], "swim")
        for k in sw["models"]:
            build_model(k, SWIM[k], sw, SWIM, "/swim-spas/", [], "swim")
    else:
        print("swim spa photos missing: swim spa pages and dropdown held back")
    inject_home_header()
    build_legal()
    build_how()
    build_faq()
    build_visit()
    build_app()
    stamp_assets()
    seo()
    llms()
    print("built", 1 + len(SERIES) + len(MODELS) + 1 + len(SWIM), "pages")
