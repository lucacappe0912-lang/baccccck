"""Assembles the standalone demo page (demo/backrooms-hub-demo.html) from the template,
the hub's real stylesheet, the logo and the 3D chart module.

    python3 demo/build.py [three-base-url] [output]
"""
import base64, io, sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
three = sys.argv[1] if len(sys.argv) > 1 else "https://cdn.jsdelivr.net/npm/three@0.169.0"
out = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "demo" / "backrooms-hub-demo.html"

logo = Image.open(root / "public" / "logo.png")
w, h = logo.size
logo = logo.resize((220, round(220 * h / w)), Image.LANCZOS)
buf = io.BytesIO()
logo.save(buf, "PNG", optimize=True)

page = (root / "demo" / "demo.template.html").read_text()
page = page.replace("__HUB_CSS__", (root / "src" / "app" / "globals.css").read_text())
page = page.replace("__LOGO_B64__", base64.b64encode(buf.getvalue()).decode())
page = page.replace("__CHART_MODULE__", (root / "demo" / "chart3d.module.js").read_text())
page = page.replace("__THREE_BASE__", three)
out.write_text(page)
print(f"{out} ({len(page) // 1024} KB)")
