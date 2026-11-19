#!/usr/bin/env python3
"""Build the AquaZen printed guides (PDF) from src/docs/*.html.

  src/docs/pre-delivery.html   -> assets/docs/aquazen-pre-delivery-guide.pdf
  src/docs/owners-manual.html  -> assets/docs/aquazen-owners-manual.pdf

Placeholders in the HTML:
  {{css}}               the shared stylesheet (src/docs/guide.css)
  {{qr:https://...}}    a QR code image (data URI) for that link
  {{access_table}}      delivery clearances per model, worked out from src/tubs.json
  {{swim_power}}        swim spa electrical per model, from src/tubs.json
Run: python3 build_docs.py
"""
import base64, io, json, os, re
import qrcode
from qrcode.image.svg import SvgPathImage
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src", "docs")
OUT = os.path.join(ROOT, "assets", "docs")
DOCS = {"pre-delivery.html": "aquazen-pre-delivery-guide.pdf", "owners-manual.html": "aquazen-owners-manual.pdf"}
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


def jpeg(name):
    """Photos go in as JPEG (Chromium embeds WebP losslessly), so the PDFs stay small enough to email."""
    from PIL import Image
    out = os.path.join(SRC, f"_{name}.jpg")
    im = Image.open(os.path.join(ROOT, "assets", "img", name + ".webp")).convert("RGB")
    im.thumbnail((1800, 1800))
    im.save(out, quality=80, optimize=True, progressive=True)
    return os.path.basename(out)


def render(name):
    html = open(os.path.join(SRC, name)).read()
    html = html.replace("{{css}}", open(os.path.join(SRC, "guide.css")).read())
    html = html.replace("{{access_table}}", access_table()).replace("{{swim_power}}", swim_power())
    html = re.sub(r"\{\{qr:([^}]+)\}\}", lambda m: qr(m.group(1)), html)
    html = re.sub(r"\.\./\.\./assets/img/([\w-]+)\.webp", lambda m: jpeg(m.group(1)), html)
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
