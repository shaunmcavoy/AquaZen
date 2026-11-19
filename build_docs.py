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


PERFECT = json.load(open(os.path.join(SRC, "perfect_for.json")))
FOOT = '<div class="foot"><img src="../../assets/img/logo-word.png" alt="AquaZen"><span>AquaSolus by AquaZen</span><span class="pg"></span></div>'
BANDS = '<div class="tbands"><i></i><i></i><i></i><i></i><i></i><i></i></div>'


def series_page(slug):
    """One page that outlines the series, then one page per model."""
    se = next(x for x in TUBS["series"] if x["slug"] == slug)
    stats = "".join(f"<div><b>{esc(a)}</b><span>{esc(b)}</span></div>" for a, b in se["stats"])
    feats = []
    for img, title, text in se["features"]:
        has = os.path.exists(os.path.join(ROOT, "assets", "img", "models", img + ".webp"))
        pic = f'<div class="fpic" style="background-image:url(../../assets/img/models/{img}.webp)"></div>' if has else ""
        feats.append(f'<div class="feat">{pic}<h3>{esc(title)}</h3><p>{esc(text)}</p></div>')
    roster = "".join(
        f"<li><b>{esc(TUBS['models'][k]['name'])}</b><span>{esc(TUBS['models'][k]['tag'])}</span><em>{TUBS['models'][k]['people']} people, {TUBS['models'][k]['jets']} jets</em></li>"
        for k in se["models"])
    out = [f"""<section class="page">
  {BANDS}
  <div class="shead">
    <div><p class="chap">{esc(se['name'])} &nbsp;&middot;&nbsp; {esc(se['range'])}</p><h2>{esc(se['headline'])}</h2><p class="lede">{esc(se['lede'])}</p></div>
    <div class="sstats">{stats}</div>
  </div>
  <div class="sbody">
    <div class="feats">{''.join(feats)}</div>
    <div><p class="k">The models</p><ul class="roster">{roster}</ul>
    <div class="why honest"><b>Our honest take.</b> {esc(se['honest'])}</div></div>
  </div>
  {FOOT}
</section>"""]
    for k in se["models"]:
        out.append(model_page(se, k))
    return "\n".join(out)


# Where to look in a few wide or busy photos, so the tub fills the frame: (background-size, background-position).
FOCUS = {
    "sierra": ("auto 165%", "52% 82%"),
    "harmony": ("auto 160%", "76% 78%"),
    "calma": ("auto 150%", "48% 72%"),
}


def model_page(se, k):
    m = TUBS["models"][k]
    fz = FOCUS.get(k)
    focus = f"background-size:{fz[0]};background-position:{fz[1]}" if fz else ""
    specs = [("People", m["people"]), ("Seats", seats(m)), ("Jets", m["jets"]), ("Size", m["in"]),
             ("Water", f"{m['l']} L ({m['gal']} US gal)"), ("Power", m["power"])]
    spec = "".join(f"<div><span>{a}</span><b>{esc(b)}</b></div>" for a, b in specs)
    perfect = "".join(f"<li>{esc(x)}</li>" for x in PERFECT.get(k, []))
    incl = "".join(f"<span>{esc(f[1])}</span>" for f in se["features"]) + "<span>Double ozonator and UV</span><span>AQ10 insulation</span><span>304 stainless frame</span>"
    over = os.path.exists(os.path.join(ROOT, "assets", "img", "models", f"{k}-overhead.webp"))
    top = f'<div class="mtop"><div style="background-image:url(../../assets/img/models/{k}-overhead.webp)"></div><span>The seats, from above</span></div>' if over else ""
    return f"""<section class="page mpage">
  {BANDS}
  <div class="mgrid">
    <div class="mleft">
      <div class="mhero" style="background-image:url(../../assets/img/models/{k}-quarter.webp);{focus}"></div>
      <div class="mbelow">{top}<div class="mspec">{spec}</div></div>
    </div>
    <div class="mtext">
      <p class="chap">{esc(se['name'])} &nbsp;&middot;&nbsp; {esc(se['range'])}</p>
      <h2 class="mname">The {esc(m['name'])}</h2>
      <p class="mlede">{esc(m['tag'])}</p>
      <div class="perfect"><p class="k">This hot tub is perfect for you if</p><ul>{perfect}</ul></div>
      <div class="incl"><p class="k">Every {esc(se['name'])} tub has</p><p>{incl}</p></div>
      <div class="note mcta"><b>Feel it before you choose.</b> Book a quiet visit in Burnaby and sit in the {esc(m['name'])}. Call or text 236-304-4424.</div>
    </div>
  </div>
  {FOOT}
</section>"""


def swim_book():
    se = TUBS["swimspas"]
    stats = "".join(f"<div><b>{esc(a)}</b><span>{esc(b)}</span></div>" for a, b in se["stats"])
    rows = "".join(f"<tr><td><b>{esc(m['name'])}</b><br><span class='small'>{esc(m['tag'])}</span></td><td>{esc(m['system'])}</td><td>{esc(m['length'])}</td><td>{m['people']}</td><td>{m['jets']}</td><td>{esc(m['power'])}</td><td>{esc(m['fit'])}</td></tr>"
                   for m in TUBS["swimspa_models"].values())
    return f"""<section class="page">
  {BANDS}
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
    im.thumbnail((700, 700) if name.startswith("models/") and not name.endswith("-quarter") else (1400, 1400))
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
