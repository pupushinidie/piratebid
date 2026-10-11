"""牌桌示意图（给画廊和自查用，不是界面）：1440x790，夜间/白天各一张，外加手机 390x844。"""
import pathlib
from PIL import Image, ImageDraw
F = pathlib.Path(__file__).parent / "out" / "final"
OUT = pathlib.Path(__file__).parent / "out" / "mock"
OUT.mkdir(parents=True, exist_ok=True)


def im(p):
    return Image.open(F / p).convert("RGBA")


def cover(bg, W, H):
    s = max(W / bg.width, H / bg.height)
    b = bg.resize((round(bg.width * s), round(bg.height * s)), Image.NEAREST)
    x, y = (b.width - W) // 2, (b.height - H) // 2
    return b.crop((x, y, x + W, y + H))


def mock(theme, W=1440, H=790, small=False):
    c = cover(im(f"bg/{theme}@3x.png"), W, H)
    veil = Image.new("RGBA", (W, H), (0, 0, 0, 64) if theme == "night" else (255, 255, 255, 26))
    c = Image.alpha_composite(c, veil)
    d = ImageDraw.Draw(c)
    pre = "cards/sm/" if small else "cards/"
    trick = ["compass-9", "flag-3", "ghost", "mermaid-1", "pirate-2", "escape"]
    cw = 64 if small else 128
    gap = 6 if small else 14
    cols = 3 if small else 6
    tx = (W - (cw * cols + gap * (cols - 1))) // 2
    ty = 170 if small else 230
    for i, n in enumerate(trick):
        x = tx + (i % cols) * (cw + gap)
        y = ty + (i // cols) * (cw * 1.5 + gap)
        if n == "ghost":
            g = im(pre + "glow.png"); e = 3 if small else 4
            c.alpha_composite(g, (x - e, int(y) - e))
        c.alpha_composite(im(pre + f"{n}.png"), (x, int(y)))
    if not small:
        c.alpha_composite(im("marks/tigress-pirate.png").resize((80, 80), Image.NEAREST), (tx - 100, ty + 40))
    hand = ["seaweed-2", "seaweed-11", "coin-5", "coin-14", "compass-1", "flag-7", "flag-12", "tigress", "pirate-4", "mermaid-2"]
    step = 28 if small else 52
    hx0 = (W - (step * 9 + cw)) // 2
    hy = H - (100 if small else 200)
    for i, n in enumerate(hand):
        c.alpha_composite(im(pre + f"{n}.png"), (hx0 + i * step, hy))
    # 座位
    seats = 4 if small else 6
    for i in range(seats):
        x = 12 + i * ((W - 24 - 64) // max(1, seats - 1))
        y = 12
        d.rectangle([x - 2, y - 2, x + 65, y + 65], fill=(42, 22, 12))
        c.alpha_composite(im(f"avatars/crew-{i + 1}.png"), (x, y))
        icon = im("icons/hit.png" if i % 2 else "icons/bid.png")
        c.alpha_composite(icon.resize((64, 64), Image.NEAREST) if not small else icon, (x + 66, y) if not small else (x + 40, y + 66))
    if not small:
        for k, n in enumerate(["sp-pirate", "sp-tigress", "sp-ghost", "sp-mermaid", "sp-escape", "suit-flag"]):
            c.alpha_composite(im(f"icons/{n}.png").resize((48, 48), Image.NEAREST), (W - 70, 120 + k * 56))
        for k, v in enumerate(range(0, 6)):
            c.alpha_composite(im("ui/bid-chip.png" if v != 2 else "ui/bid-chip-on.png").resize((64, 64), Image.NEAREST), (40 + k * 72, H - 290))
    return c.convert("RGB")


for t in ("night", "day"):
    mock(t).save(OUT / f"table-{t}.png")
    mock(t, 390, 844, small=True).save(OUT / f"phone-{t}.png")
print("ok")
