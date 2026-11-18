#!/usr/bin/env python3
"""Builds the hot tub pages from src/tubs.json.

Outputs (never hand-edit these, edit src/tubs.json or this file and rebuild):
  hot-tubs/index.html                      the three series
  hot-tubs/<series>/index.html             immersive series overview
  hot-tubs/<series>/<model>/index.html     model details
"""
import html
import json
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
      <a href="/#why">Why AquaZen</a>
      <a href="/#visit">Visit</a>
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
    <a href="/#why">Why AquaZen</a>
    <a href="/#visit">Visit</a>
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
    """The three things that set Aquasolus apart, written for the Lower Mainland."""
    if kind == "tub":
        water = ("Water this clean takes more than ozone.", "Every hot tub has an ozonator. Ours holds the ozone under water in a mixing chamber for at least 45 seconds so it actually works on the water, then sends it past a UV light. The cleanest water possible in a hot tub.")
        build = ("Build quality, second to none.", "A 304 stainless steel frame that won't rot or rust, on a structured ABS base pan that seals and protects the bottom of the tub. Built for the longest life you can get.")
    else:
        water = ("Clean water, simply.", "Ozone water care comes standard, and soft Lower Mainland water keeps the routine short. We show you exactly how before delivery.")
        build = ("Built to carry the weight.", "A 304 stainless steel frame that won't rot or rust, made to hold thousands of litres for years.")
    massage = ("A massage that pulls the tension out.", "It's not the number of jets, it's how the water reaches you. Most hot tubs use skinny plumbing, like a thumb over a garden hose, and the sharp spray can feel itchy. Aquasolus uses wide plumbing that delivers four to five times more water to every jet, so a big, warm volume of water works over more of your back and draws the tension out.")
    eff = ("Easy on the planet. And your hydro bill.", "Full AQ10 insulation keeps the heat the pumps make inside and puts it back into the water, instead of losing it to the air. Less wasted heat, less electricity.")
    items = (massage, water, eff, build) if kind == "tub" else (water, eff, build)
    tiles = "".join(f'<div class="tile"><h3>{e(t)}</h3><p>{e(d)}</p></div>' for t, d in items)
    return f"""
<section class="equip equip-sm">
  <div class="wrap center"><h2 class="h2">Why it's different.</h2></div>
  <div class="wrap tiles {'tiles-3 tiles-4' if kind == 'tub' else 'tiles-3'}">{tiles}</div>
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
    <p class="lede">Not sure which one is right? Answer a few quick questions and Shaun will call you to book a quiet visit. No pressure, no rush.</p>
    <div class="hero-ctas"><a class="pill" href="{fz}">Find your Zen</a><a class="link" href="tel:+12363044424">Or call 236-304-4424</a></div>
  </div>
</section>
</main>
<footer class="foot">
  <div class="wrap foot-in">
    <img src="/assets/img/logo-full.png" alt="AquaZen" width="167" height="101" loading="lazy">
    <p class="foot-tag">Your Zen is calling.</p>
    <p>Aqua Zen Wellness Consulting, operating as AquaZen. 7049 Russell Ave, Burnaby, BC.</p>
    <p><a class="plain" href="tel:+12363044424">236-304-4424</a> &nbsp; <a class="plain" href="mailto:shaun@aquazen.ca">shaun@aquazen.ca</a></p>
    <p>Hot tub photos and specifications courtesy of Aquasolus. Confirm details with us before ordering. &copy; 2026 AquaZen.</p>
    <p><a class="plain" href="/privacy/">Privacy</a> &nbsp; <a class="plain" href="/terms/">Terms</a></p>
  </div>
</footer>
<script src="/assets/js/menu.js"></script>
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
    page = head("Hot tubs | AquaZen", "Aquasolus hot tubs in Burnaby: Series One, Two and Three, for 3 to 7 people.")
    page += subnav([("Hot tubs", None)])
    page += f"""<main>
<section class="tub-intro">
  <div class="wrap center">
    <h1 class="display">Which hot tub is your Zen?</h1>
    <p class="lede">Thirteen Aquasolus hot tubs in three series. Start with how you want to live, then pick the one that fits.</p>
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

    # The immersive scene: each model's overhead photo tilts and turns as you scroll
    layers = "".join(
        f'<img class="orbit-img" data-i="{i}" src="{IMG}{ov(k, m)}.webp" alt="{e(m["name"])} from above" loading="{"eager" if i == 0 else "lazy"}">'
        for i, (k, m) in enumerate(ms)
    )
    captions = "".join(
        f"""<div class="orbit-cap" data-i="{i}">
        <p class="orbit-n">{i + 1} of {len(ms)}</p>
        <h3>{e(m['name'])}</h3>
        <p class="orbit-tag">{e(m['tag'])}</p>
        <ul class="orbit-facts"><li><b>{m['people']}</b> people</li><li><b>{m['jets']}</b> jets</li><li>{e(seats_line(m))}</li>{('<li>' + e(m['system']) + '</li>') if m.get('system') else ''}</ul>
        <a class="link" href="{base}{k}/">See the {e(m['name'])}</a>
      </div>"""
        for i, (k, m) in enumerate(ms)
    )

    feats = "".join(
        f"""<article class="card"><img src="{IMG}{img}.webp" alt="" loading="lazy"><div class="card-copy"><h3>{e(t)}</h3><p>{e(d)}</p></div></article>"""
        for img, t, d in s["features"]
    )

    picks = "".join(
        f"""<a class="pick" href="{base}{k}/">
      <img src="{IMG}{qt(k, m)}.webp" alt="{e(m['name'])} {noun}" loading="lazy">
      <span class="pick-name">{e(m['name'])}</span>
      <span class="pick-tag">{e(m['tag'])}</span>
      <span class="pick-facts">{m['people']} people &middot; {m['jets']} jets</span>
      <span class="pick-go">Learn more</span>
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

<section class="orbit" data-orbit style="--count:{len(ms)}" aria-label="The {e(s['name'])} models">
  <div class="orbit-sticky">
    <div class="orbit-stage" aria-hidden="true">{layers}</div>
    <div class="orbit-caps">{captions}</div>
    <div class="orbit-dots" aria-hidden="true">{''.join('<span></span>' for _ in ms)}</div>
  </div>
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
<section class="picks-sec" id="models">
  <div class="wrap center"><h2 class="h2">Choose your {e(s['name'])}.</h2></div>
  <div class="wrap picks picks-{len(ms)}">{picks}</div>
</section>

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
    page = head(f"{m['name']} {noun} | AquaZen", f"The Aquasolus {m['name']} {noun}: {m['tag']} {m['people']} people, {m['jets']} jets. See it at AquaZen in Burnaby.")
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
      <div><dt>Water care</dt><dd>{'Ozone with a 45-second mixing chamber, then UV' if kind == 'tub' else 'Ozone, standard'}</dd><dd class="spec-sub">{'Plus Gecko WaterLab real-time monitoring' if s['slug'] == 'series-three' else 'Simple with soft Lower Mainland water'}</dd></div>
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
    tubs = [{"k": k, "n": m["name"], "line": series_by_slug(m["series"])["name"], "seats": m["people"],
             "jets": m["jets"], "power": m["power"]} for k, m in MODELS.items()]
    products = {
        "hot_tub": {"label": "Hot tub", "make": "Aquasolus", "groups": [
            {"name": se["name"], "items": [{"n": MODELS[k]["name"], "img": img_for(MODELS[k]["photos"], "aquazen-interior")} for k in se["models"]]} for se in SERIES]},
        "swim_spa": {"label": "Swim spa", "make": "Aquasolus", "groups": [
            {"name": "", "items": [{"n": SWIM[k]["name"], "img": img_for(SWIM[k]["photos"], "aquazen-swimspa-overhead")} for k in DATA["swimspas"]["models"]]}]},
        "mini_pool": {"label": "Mini pool", "make": "Aquasolus", "groups": []},
    }
    data = f"<script>window.AZ_TUBS={json.dumps(tubs)};window.AZ_PRODUCTS={json.dumps(products)};</script>\n"
    for slug, title, js in [("login", "Sign in", "login"), ("staff", "Staff portal", "staff"), ("sign", "Sign your agreement", "sign"), ("portal", "Your portal", "portal")]:
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
</body>
</html>
""")


def stamp_assets():
    """Add ?v=<content hash> to CSS and JS links in every page, so phones never use a stale copy."""
    import hashlib
    import re
    ver = {}
    for rel in ["assets/css/site.css", "assets/css/app.css", "assets/js/site.js", "assets/js/menu.js", "assets/js/tubs.js", "assets/js/finder.js", "assets/js/app.js", "assets/js/login.js", "assets/js/staff.js", "assets/js/sign.js", "assets/js/portal.js"]:
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
    build_app()
    stamp_assets()
    print("built", 1 + len(SERIES) + len(MODELS) + 1 + len(SWIM), "pages")
