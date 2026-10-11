"""总览拼图：python sheet.py <前缀> [缩放]  → out/sheets/<前缀>.png
pixflux/pixen：同前缀的所有图并排（带文件名序号）；v2：一个目录里 64 个候选 8x8 网格（带编号，深浅两种底各一半）。"""
import sys, pathlib
from PIL import Image, ImageDraw

ART = pathlib.Path(__file__).parent
R1 = ART / "out" / "r1"
OUT = ART / "out" / "sheets"
OUT.mkdir(parents=True, exist_ok=True)


def grid(ims, sc, cols, labels, bg=(60, 50, 44)):
    w = max(i.width for i in ims) * sc
    h = max(i.height for i in ims) * sc
    rows = (len(ims) + cols - 1) // cols
    W = Image.new("RGB", (cols * (w + 6) + 6, rows * (h + 18) + 6), bg)
    d = ImageDraw.Draw(W)
    for k, im in enumerate(ims):
        x, y = 6 + (k % cols) * (w + 6), 6 + (k // cols) * (h + 18)
        cell_bg = (243, 226, 184) if (k // cols) % 2 else (40, 28, 20)
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=cell_bg)
        im2 = im.convert("RGBA").resize((im.width * sc, im.height * sc), Image.NEAREST)
        W.paste(im2, (x, y), im2)
        d.text((x, y + h + 2), labels[k], fill=(255, 255, 255))
    return W


pre = sys.argv[1]
sc = int(sys.argv[2]) if len(sys.argv) > 2 else 2
d = R1 / pre
if d.is_dir():
    files = sorted([p for p in d.glob(f"{pre}*.png")], key=lambda p: (len(p.stem), p.stem))
    ims = [Image.open(p) for p in files]
    labels = [p.stem.replace(pre, "").lstrip("-") or "0" for p in files]
    grid(ims, sc, 8, labels).save(OUT / f"{pre}.png")
else:
    files = sorted(R1.glob(f"{pre}*.png"))
    ims = [Image.open(p) for p in files]
    labels = [p.stem for p in files]
    cols = int(sys.argv[3]) if len(sys.argv) > 3 else min(len(ims), 6)
    grid(ims, sc, cols, labels).save(OUT / f"{pre}.png")
print(OUT / f"{pre}.png")
