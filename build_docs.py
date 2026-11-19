#!/usr/bin/env python3
"""Build the AquaZen printed guides (PDF) from src/docs/*.html.

  src/docs/pre-delivery.html   -> assets/docs/aquazen-pre-delivery-guide.pdf
  src/docs/owners-manual.html  -> assets/docs/aquazen-owners-manual.pdf
  src/docs/aquasolus-book.html -> assets/docs/aquazen-aquasolus-book.pdf (landscape)

Placeholders in the HTML:
  {{css}}               the shared stylesheet (src/docs/guide.css)
  {{qr:https://...}}    a QR code image (data URI) for that link
  {{access_table}}      delivery clearances per model, worked out from src/tubs.json
  {{swim_power}}        swim spa electrical per model, from src/tubs.json
  {{series:<slug>}}     a book page for one hot tub series and every model in it
  {{swim_book}}         the book's swim spa page
  {{series_overview}}   the book's "choose your series" comparison
  {{shaun_photo}}       assets/img/shaun.(jpg|png|webp) if it exists, otherwise a placeholder
Run: python3 build_docs.py
"""
import base64, io, json, os, re
import qrcode
from qrcode.image.svg import SvgPathImage
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src", "docs")
OUT = os.path.join(ROOT, "assets", "docs")
DOCS = {"pre-delivery.html": "aquazen-pre-delivery-guide.pdf", "owners-manual.html": "aquazen-owners-manual.pdf",
        "aquasolus-book.html": "aquazen-aquasolus-book.pdf"}
TUBS = json.load(open(os.path.join(ROOT, "src", "tubs.json")))

# On its side on our dolly the tub is about 20 cm taller than its longest side, and we
# want about 15 cm of hand room beside its depth.
DOLLY_CM, HANDS_CM = 20, 15


def qr(url):
    img = qrcode.make(url, image_factory=SvgPathImage, box_size=10, border=0)
    buf = io.BytesIO(); img.save(buf)
    return "data:image/svg+xml;base64," + base64.b64encode(buf.getvalue()).decode()


def inches(dim):
    return [float(x) for x in re.findall(r"[\d.]+", dim)[:3]]


def access_table():
    groups = {}
    for slug, m in TUBS["models"].items():
        l, w, d = inches(m["in"])
        width = round((d * 2.54 + HANDS_CM) / 5) * 5
        height = round((max(l, w) * 2.54 + DOLLY_CM) / 5) * 5
        key = (m["in"], width, height)
        groups.setdefault(key, []).append(m["name"])
    rows = []
    for (dims, width, height), names in sorted(groups.items(), key=lambda g: (g[0][2], g[0][1])):
        rows.append(f"<tr><td><b>{', '.join(names)}</b></td><td>{dims}</td><td class='num'>{width/100:.2f} m</td><td class='num'>{height/100:.2f} m</td></tr>")
    return ("<table><thead><tr><th>Model</th><th>Size (L x W x D)</th><th>Path at least</th><th>Height at least</th></tr></thead><tbody>"
            + "".join(rows) + "</tbody></table>")


def swim_power():
    rows = [f"<tr><td><b>{m['name']}</b></td><td>{m['power']}</td></tr>" for m in TUBS["swimspa_models"].values()]
    return "<table style='font-size:8.4pt'><thead><tr><th>Model</th><th>Power, all dedicated</th></tr></thead><tbody>" + "".join(rows) + "</tbody></table>"


def esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def seats(m):
    return f"{m['seats']} seat{'s' if m['seats'] != 1 else ''}" + (f", {m['loungers']} lounger{'s' if m['loungers'] > 1 else ''}" if m.get("loungers") else "")


def series_page(slug):
    se = next(x for x in TUBS["series"] if x["slug"] == slug)
    stats = "".join(f"<div><b>{esc(a)}</b><span>{esc(b)}</span></div>" for a, b in se["stats"])
    cards = []
    for k in se["models"]:
        m = TUBS["models"][k]
        cards.append(f"""<article class="model">
  <div class="mphoto" style="background-image:url(../../assets/img/models/{k}-quarter.webp)"></div>
  <h3>{esc(m['name'])}</h3>
  <p class="mtag">{esc(m['tag'])}</p>
  <dl>
    <dt>People</dt><dd>{m['people']} ({seats(m)})</dd>
    <dt>Jets</dt><dd>{m['jets']}</dd>
    <dt>Size</dt><dd>{esc(m['in'])}</dd>
    <dt>Water</dt><dd>{esc(m['l'])} L ({esc(m['gal'])} US gal)</dd>
    <dt>Power</dt><dd>{esc(m['power'])}</dd>
  </dl>
  <p class="mfit"><b>Made for</b> {esc(m['fit'])}</p>
</article>""")
    n = len(cards)
    return f"""<section class="page">
  <div class="shead">
    <div><p class="chap">{esc(se['name'])} &nbsp;&middot;&nbsp; {esc(se['range'])}</p><h2>{esc(se['headline'])}</h2><p class="lede">{esc(se['lede'])}</p></div>
    <div class="sstats">{stats}</div>
  </div>
  <div class="models n{n}">{''.join(cards)}</div>
  <div class="why honest"><b>Our honest take.</b> {esc(se['honest'])}</div>
  <div class="foot"><img src="../../assets/img/logo-word.png" alt="AquaZen"><span>AquaSolus by AquaZen</span><span class="pg"></span></div>
</section>"""


def swim_book():
    se = TUBS["swimspas"]
    stats = "".join(f"<div><b>{esc(a)}</b><span>{esc(b)}</span></div>" for a, b in se["stats"])
    rows = "".join(f"<tr><td><b>{esc(m['name'])}</b><br><span class='small'>{esc(m['tag'])}</span></td><td>{esc(m['system'])}</td><td>{esc(m['length'])}</td><td>{m['people']}</td><td>{m['jets']}</td><td>{esc(m['power'])}</td><td>{esc(m['fit'])}</td></tr>"
                   for m in TUBS["swimspa_models"].values())
    return f"""<section class="page">
  <div class="shead">
    <div><p class="chap">{esc(se['name'])} &nbsp;&middot;&nbsp; {esc(se['range'])}</p><h2>{esc(se['headline'])}</h2><p class="lede">{esc(se['lede'])}</p></div>
    <div class="sstats">{stats}</div>
  </div>
  <div class="swimgrid">
    <div class="swimphoto" style="background-image:url(../../assets/img/aquazen-swimspa-overhead.webp)"></div>
    <table class="swimtab"><colgroup><col style="width:21%"><col style="width:11%"><col style="width:7%"><col style="width:7%"><col style="width:6%"><col style="width:20%"><col></colgroup>
      <thead><tr><th>Model</th><th>Swim system</th><th>Length</th><th>People</th><th>Jets</th><th>Power</th><th>Made for</th></tr></thead><tbody>{rows}</tbody></table>
  </div>
  <div class="why honest"><b>Our honest take.</b> {esc(se['honest'])}</div>
  <div class="foot"><img src="../../assets/img/logo-word.png" alt="AquaZen"><span>AquaSolus by AquaZen</span><span class="pg"></span></div>
</section>"""


def series_overview():
    cols = []
    for se in TUBS["series"] + [TUBS["swimspas"]]:
        ms = [TUBS["models"].get(k) or TUBS["swimspa_models"].get(k) for k in se["models"]]
        names = ", ".join(m["name"] for m in ms)
        stats = "".join(f"<li><b>{esc(a)}</b> {esc(b)}</li>" for a, b in se["stats"])
        cols.append(f"<div class='ov'><p class='chap'>{esc(se['range'])}</p><h3>{esc(se['name'])}</h3><p class='ovh'>{esc(se['headline'])}</p><ul>{stats}</ul><p class='small'>{esc(names)}</p></div>")
    return "<div class='overview'>" + "".join(cols) + "</div>"


def shaun_photo():
    for ext in ("jpg", "jpeg", "png", "webp"):
        f = os.path.join(ROOT, "assets", "img", f"shaun.{ext}")
        if os.path.exists(f):
            return f"<div class='portrait' style='background-image:url(../../assets/img/shaun.{ext})'></div>"
    return "<div class='portrait empty'><span>Shaun&rsquo;s photo goes here</span></div>"


def jpeg(name):
    """Photos go in as JPEG (Chromium embeds WebP losslessly), so the PDFs stay small enough to email."""
    from PIL import Image
    out = os.path.join(SRC, "_" + name.replace("/", "_") + ".jpg")
    src = os.path.join(ROOT, "assets", "img", name)
    src = next((src + e for e in (".webp", ".jpg", ".jpeg", ".png") if os.path.exists(src + e)), src + ".webp")
    im = Image.open(src).convert("RGB")
    im.thumbnail((900, 900) if name.startswith("models/") else (1600, 1600))
    im.save(out, quality=80, optimize=True, progressive=True)
    return os.path.basename(out)


def render(name):
    html = open(os.path.join(SRC, name)).read()
    html = html.replace("{{css}}", open(os.path.join(SRC, "guide.css")).read())
    html = html.replace("{{access_table}}", access_table()).replace("{{swim_power}}", swim_power())
    html = re.sub(r"\{\{series:([\w-]+)\}\}", lambda m: series_page(m.group(1)), html)
    html = html.replace("{{swim_book}}", swim_book()).replace("{{series_overview}}", series_overview())
    html = html.replace("{{shaun_photo}}", shaun_photo())
    html = re.sub(r"\{\{qr:([^}]+)\}\}", lambda m: qr(m.group(1)), html)
    html = re.sub(r"\.\./\.\./assets/img/((?:models/)?[\w-]+)\.(?:webp|jpe?g)(?=[)'\"])", lambda m: jpeg(m.group(1)), html)
    if "—" in html:
        raise SystemExit(f"{name}: em dash found. House style is no em dashes.")
    tmp = os.path.join(SRC, "_" + name)
    open(tmp, "w").write(html)
    return tmp


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for src, pdf in DOCS.items():
            tmp = render(src)
            p = b.new_page()
            p.goto("file://" + tmp)
            p.wait_for_load_state("networkidle")
            p.pdf(path=os.path.join(OUT, pdf), prefer_css_page_size=True, print_background=True)
            os.remove(tmp)
            for f in os.listdir(SRC):
                if f.startswith("_") and f.endswith(".jpg"):
                    os.remove(os.path.join(SRC, f))
            print("built", pdf)
        b.close()


if __name__ == "__main__":
    main()
