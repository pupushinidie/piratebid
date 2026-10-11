"""python vpick.py out.png scale name:idx ...  v2 候选放大对比（上深底、下浅底）"""
import sys, pathlib
from PIL import Image, ImageDraw
R1 = pathlib.Path(__file__).parent / "out" / "r1"
def get(spec):
    n, i = spec.split(":")
    return Image.open(R1 / n / (f"{n}.png" if i == "0" else f"{n}-{i}.png")).convert("RGBA")
out, sc, specs = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [get(s) for s in specs]
w = max(i.width for i in ims) * sc + 8; h = max(i.height for i in ims) * sc + 8
W = Image.new("RGB", (w * len(ims), h * 2 + 14), (0, 0, 0)); d = ImageDraw.Draw(W)
for k, im in enumerate(ims):
    big = im.resize((im.width * sc, im.height * sc), Image.NEAREST)
    for r, bg in enumerate([(40, 28, 20), (243, 226, 184)]):
        d.rectangle([k * w, r * h, k * w + w - 3, r * h + h - 3], fill=bg)
        W.paste(big, (k * w + 4, r * h + 4), big)
    d.text((k * w + 2, 2 * h), specs[k], fill=(255, 255, 255))
W.save(out)
