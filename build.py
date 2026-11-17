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
<header class="nav" id="top">
  <div class="nav-in">
    <a class="nav-logo" href="/" aria-label="AquaZen home"><img src="/assets/img/logo-word.png" alt="AquaZen" width="112" height="32"></a>
    <nav class="nav-links" aria-label="Sections">
      <a href="/hot-tubs/">Hot tubs</a>
      <a href="/#water">Swim spas</a>
      <a href="/#water">Mini pools</a>
      <a href="/#why">Why AquaZen</a>
      <a href="/#visit">Visit</a>
    </nav>
    <a class="pill pill-sm" href="/find-your-zen/">Find your Zen</a>
  </div>
</header>
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
    <p class="foot-tag">Find your Zen.</p>
    <p>Aqua Zen Wellness Consulting, operating as AquaZen. 7049 Russell Ave, Burnaby, BC.</p>
    <p><a class="plain" href="tel:+12363044424">236-304-4424</a> &nbsp; <a class="plain" href="mailto:shaun@aquazen.ca">shaun@aquazen.ca</a></p>
    <p>Hot tub photos and specifications courtesy of Aquasolus. Confirm details with us before ordering. &copy; 2026 AquaZen.</p>
  </div>
</footer>
<script src="/assets/js/tubs.js"></script>
</body>
</html>
"""


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
def build_series(s):
    ms = [(k, MODELS[k]) for k in s["models"]]
    links = [(m["name"], f"/hot-tubs/{s['slug']}/{k}/", False) for k, m in ms]
    page = head(f"{s['name']} hot tubs | AquaZen", f"{s['name']} ({s['range']}): {s['lede']}")
    page += subnav([("Hot tubs", "/hot-tubs/"), (s["name"], None)], links)

    stats = "".join(f'<div class="stat"><span class="stat-n">{e(n)}</span><span class="stat-l">{e(l)}</span></div>' for n, l in s["stats"])

    # The immersive scene: each model's overhead photo tilts and turns as you scroll
    layers = "".join(
        f'<img class="orbit-img" data-i="{i}" src="{IMG}{k}-overhead.webp" alt="{e(m["name"])} from above" loading="{"eager" if i == 0 else "lazy"}">'
        for i, (k, m) in enumerate(ms)
    )
    captions = "".join(
        f"""<div class="orbit-cap" data-i="{i}">
        <p class="orbit-n">{i + 1} of {len(ms)}</p>
        <h3>{e(m['name'])}</h3>
        <p class="orbit-tag">{e(m['tag'])}</p>
        <ul class="orbit-facts"><li><b>{m['people']}</b> people</li><li><b>{m['jets']}</b> jets</li><li>{e(seats_line(m))}</li></ul>
        <a class="link" href="/hot-tubs/{s['slug']}/{k}/">See the {e(m['name'])}</a>
      </div>"""
        for i, (k, m) in enumerate(ms)
    )

    feats = "".join(
        f"""<article class="card"><img src="{IMG}{img}.webp" alt="" loading="lazy"><div class="card-copy"><h3>{e(t)}</h3><p>{e(d)}</p></div></article>"""
        for img, t, d in s["features"]
    )

    picks = "".join(
        f"""<a class="pick" href="/hot-tubs/{s['slug']}/{k}/">
      <img src="{IMG}{k}-quarter.webp" alt="{e(m['name'])} hot tub" loading="lazy">
      <span class="pick-name">{e(m['name'])}</span>
      <span class="pick-tag">{e(m['tag'])}</span>
      <span class="pick-facts">{m['people']} people &middot; {m['jets']} jets</span>
      <span class="pick-go">Learn more</span>
    </a>"""
        for k, m in ms
    )

    rows = "".join(
        f"""<tr><th scope="row"><a href="/hot-tubs/{s['slug']}/{k}/">{e(m['name'])}</a></th><td>{m['people']}</td><td>{m['seats']} / {m['loungers']}</td><td>{e(m['in'])}</td><td>{m['gal']} US gal</td><td>{m['jets']}</td><td>{e(m['power'])}</td></tr>"""
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
    write(f"hot-tubs/{s['slug']}/index.html", page)


# ---------- Model: /hot-tubs/<series>/<model>/ ----------
def build_model(k, m):
    s = series_by_slug(m["series"])
    sibs = [(MODELS[x]["name"], f"/hot-tubs/{s['slug']}/{x}/", x == k) for x in s["models"]]
    page = head(f"{m['name']} hot tub | {s['name']} | AquaZen", f"The Aquasolus {m['name']}: {m['tag']} {m['people']} people, {m['jets']} jets. See it at AquaZen in Burnaby.")
    page += subnav([("Hot tubs", "/hot-tubs/"), (s["name"], f"/hot-tubs/{s['slug']}/"), (m["name"], None)], sibs)

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
        f"""<a class="pick pick-sm" href="/hot-tubs/{s['slug']}/{x}/"><img src="{IMG}{x}-quarter.webp" alt="" loading="lazy"><span class="pick-name">{e(MODELS[x]['name'])}</span><span class="pick-facts">{MODELS[x]['people']} people &middot; {MODELS[x]['jets']} jets</span></a>"""
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
  <div class="tilt" data-tilt><img src="{IMG}{photos[0]}.webp" alt="The {e(m['name'])} hot tub" fetchpriority="high"></div>
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
    <div class="orbit-stage" aria-hidden="true"><img class="orbit-img" data-i="0" src="{IMG}{k}-overhead.webp" alt="" loading="lazy"></div>
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

<section class="specs" id="specs">
  <div class="wrap">
    <h2 class="h2">Tech specs</h2>
    <dl class="spec-grid">
      <div><dt>Capacity</dt><dd>{m['people']} people</dd><dd class="spec-sub">{e(seats_line(m))}</dd></div>
      <div><dt>Jets</dt><dd>{m['jets']} jets</dd>{jetmix}</div>
      <div><dt>Size</dt><dd>{e(m['in'])}</dd><dd class="spec-sub">{e(m['mm'])}, length x width x height</dd></div>
      <div><dt>Water</dt><dd>{m['gal']} US gallons</dd><dd class="spec-sub">{m['l']} litres</dd></div>
      <div><dt>Weight</dt><dd>{e(m['dry'])} empty</dd><dd class="spec-sub">{e(m['full'])} full</dd></div>
      <div><dt>Power</dt><dd>{e(m['power'])}</dd></div>
      <div><dt>Pumps</dt><dd>{e(m['pumps'])}</dd><dd class="spec-sub">Plus a circulation pump</dd></div>
      <div><dt>Heater</dt><dd>{e(m['heater'])}</dd></div>
      <div><dt>Controls</dt><dd>{e(m['panel'])}</dd></div>
      <div><dt>Water care</dt><dd>{'Ozone, UV and Gecko WaterLab' if s['slug'] == 'series-three' else 'Ozone, standard'}</dd><dd class="spec-sub">Simple with soft Lower Mainland water</dd></div>
      <div><dt>Shell colours</dt><dd class="swatches"><span><img src="{IMG}swatch-sterling.webp" alt="" width="28" height="28">Sterling Silver</span><span><img src="{IMG}swatch-odyssey.webp" alt="" width="28" height="28">Odyssey Grey</span></dd></div>
      <div><dt>Built to last</dt><dd>304 stainless steel frame, AQ10 full insulation</dd><dd class="spec-sub">{e(DATA['warranty'])}</dd></div>
    </dl>
  </div>
</section>

<section class="picks-sec">
  <div class="wrap center"><h2 class="h2">More in {e(s['name'])}</h2></div>
  <div class="wrap picks picks-sm-row">{others}</div>
  <p class="wrap center"><a class="link" href="/hot-tubs/{s['slug']}/">See all of {e(s['name'])}</a></p>
</section>

<div class="lightbox" id="lightbox" hidden role="dialog" aria-modal="true" aria-label="Photo">
  <button class="lb-close" type="button" aria-label="Close photo">Close</button>
  <img alt="">
</div>
"""
    page += FOOT.format(fz=f"/find-your-zen/?model={k}")
    write(f"hot-tubs/{s['slug']}/{k}/index.html", page)


if __name__ == "__main__":
    build_hub()
    for s in SERIES:
        build_series(s)
        for k in s["models"]:
            build_model(k, MODELS[k])
    print("built", 1 + len(SERIES) + sum(len(s["models"]) for s in SERIES), "pages")
