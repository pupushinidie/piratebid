"""海盗叫墩特效精灵图（代码画，横排）。python fx.py → out/final/fx/
trick-win 96x96x10、coins 64x64x12、hit 64x64x10、miss 64x64x10、splash 96x96x10；
candles-night 512x288x4（按夜间背景里的灯火位置做闪烁暖光，需要 selection.json 里的 bg-night）。
所有一次性特效末帧为空。"""
import json, math, pathlib, random
from PIL import Image, ImageDraw

ART = pathlib.Path(__file__).parent
FX = ART / "out" / "final" / "fx"
FX.mkdir(parents=True, exist_ok=True)


def hx(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


INK = hx("#2a160c")
GOLD = [hx("#7a4e08"), hx("#d89a1c"), hx("#ffd75a"), hx("#fff4c0")]


def strip(frames):
    w, h = frames[0].size
    s = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        s.paste(f, (i * w, 0))
    return s


def blank(w, h):
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def sparkle(d, x, y, r, col, core):
    """十字星：中心一点 + 四向光芒。"""
    x, y = int(x), int(y)
    for k in range(1, r + 1):
        c = col if k > 1 else core
        for dx, dy in ((k, 0), (-k, 0), (0, k), (0, -k)):
            d.point((x + dx, y + dy), fill=c)
    d.point((x, y), fill=core)


def coin(d, x, y, phase):
    """8px 高的小金币，phase 0-3 表现翻转（宽度 8/6/2/6）。"""
    x, y = int(x), int(y)
    w = [4, 3, 1, 3][phase % 4]
    d.ellipse([x - w, y - 4, x + w, y + 4], fill=INK)
    if w > 1:
        d.ellipse([x - w + 1, y - 3, x + w - 1, y + 3], fill=GOLD[1])
        d.line([(x - w + 2, y - 2), (x - w + 2, y + 1)], fill=GOLD[3])
        d.point((x + w - 2, y + 2), fill=GOLD[0])
    else:
        d.line([(x, y - 3), (x, y + 3)], fill=GOLD[2])


def trick_win():
    rnd = random.Random(7)
    rays = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(0.7, 1.0)) for _ in range(14)]
    out = []
    for f in range(10):
        im = blank(96, 96)
        d = ImageDraw.Draw(im)
        t = f / 9
        if f < 9:
            # 外扩的金色圆环
            r = 8 + 36 * t
            a = int(255 * (1 - t))
            ring = hx("#ffd75a") + (a,)
            d.ellipse([48 - r, 48 - r, 48 + r, 48 + r], outline=ring, width=2 if f < 5 else 1)
            for ang, sp in rays:
                rr = r * sp + 4
                x, y = 48 + math.cos(ang) * rr, 48 + math.sin(ang) * rr
                size = 3 if f < 4 else (2 if f < 7 else 1)
                sparkle(d, x, y, size, GOLD[2] + (a,), GOLD[3] + (255,))
            if f < 3:
                sparkle(d, 48, 48, 6 - f * 2, GOLD[2] + (255,), (255, 255, 255, 255))
        out.append(im)
    return strip(out)


def coins():
    rnd = random.Random(11)
    parts = [(rnd.uniform(-2.2, 2.2), rnd.uniform(-5.2, -3.2), rnd.randint(0, 3)) for _ in range(9)]
    out = []
    for f in range(12):
        im = blank(64, 64)
        d = ImageDraw.Draw(im)
        if f < 11:
            for vx, vy, ph in parts:
                x = 32 + vx * f * 1.6
                y = 44 + vy * f + 0.45 * f * f
                if 4 <= x <= 60 and 4 <= y <= 60:
                    coin(d, x, y, ph + f)
            if f < 3:
                sparkle(d, 32, 44, 4 - f, GOLD[2] + (255,), (255, 255, 255, 255))
        out.append(im)
    return strip(out)


def hit():
    rnd = random.Random(3)
    pts = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(10, 26)) for _ in range(10)]
    green = [hx("#2f8f4e"), hx("#5cc85a"), hx("#c8f5b4")]
    out = []
    for f in range(10):
        im = blank(64, 64)
        d = ImageDraw.Draw(im)
        if f < 9:
            t = f / 8
            for ang, dist in pts:
                rr = dist * (0.3 + 0.7 * t)
                x, y = 32 + math.cos(ang) * rr, 32 + math.sin(ang) * rr - 6 * t
                sparkle(d, x, y, 2 if f < 6 else 1, green[1], green[2])
            if f < 6:
                r = 6 + 20 * t
                d.ellipse([32 - r, 32 - r, 32 + r, 32 + r], outline=green[1] + (int(255 * (1 - t)),), width=1)
            if 2 <= f < 7:
                coin(d, 32, 30 - f * 2, f)
        out.append(im)
    return strip(out)


def miss():
    rnd = random.Random(5)
    puffs = [(rnd.uniform(-14, 14), rnd.uniform(-6, 6), rnd.uniform(5, 9)) for _ in range(7)]
    sparks = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(14, 26)) for _ in range(6)]
    smoke = [hx("#3a3236"), hx("#6a6064"), hx("#9a9094")]
    out = []
    for f in range(10):
        im = blank(64, 64)
        d = ImageDraw.Draw(im)
        if f < 9:
            t = f / 8
            for dx, dy, r in puffs:
                rr = r * (0.5 + 0.8 * t) * (1 - 0.6 * max(0, t - 0.6) / 0.4)
                x, y = 32 + dx * (0.5 + t), 36 + dy - 12 * t
                a = int(230 * (1 - t * 0.85))
                d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=smoke[1] + (a,), outline=smoke[0] + (a,))
                d.ellipse([x - rr * 0.5, y - rr * 0.7, x, y - rr * 0.2], fill=smoke[2] + (a,))
            if f < 5:
                for ang, dist in sparks:
                    rr = dist * (0.3 + t)
                    x, y = 32 + math.cos(ang) * rr, 36 + math.sin(ang) * rr
                    d.rectangle([x, y, x + 1, y + 1], fill=hx("#ffb84a"))
            if f < 2:
                d.ellipse([24, 28, 40, 44], fill=hx("#ffb84a") + (200,))
        out.append(im)
    return strip(out)


def splash():
    rnd = random.Random(9)
    drops = [(rnd.uniform(-3, 3), rnd.uniform(-6.5, -3.5)) for _ in range(16)]
    water = [hx("#1f6f78"), hx("#4fb4c0"), hx("#c8f0f0")]
    out = []
    for f in range(10):
        im = blank(96, 96)
        d = ImageDraw.Draw(im)
        if f < 9:
            t = f / 8
            # 水花冠
            w = 10 + 30 * t
            h = 22 * math.sin(math.pi * min(1, t * 1.3))
            if h > 1:
                d.polygon([(48 - w, 80), (48 - w * 0.7, 80 - h), (48 - w * 0.35, 80 - h * 0.6), (48, 80 - h * 1.1),
                           (48 + w * 0.35, 80 - h * 0.6), (48 + w * 0.7, 80 - h), (48 + w, 80)],
                          fill=water[1] + (220,), outline=water[0])
            for vx, vy in drops:
                x, y = 48 + vx * f * 2.2, 78 + vy * f * 1.6 + 0.55 * f * f * 1.6
                if 2 <= x <= 92 and 2 <= y <= 92:
                    d.rectangle([x, y, x + 1, y + 2], fill=water[2])
            rr = 8 + 36 * t
            d.ellipse([48 - rr, 80 - rr / 4, 48 + rr, 80 + rr / 4], outline=water[1] + (int(255 * (1 - t)),))
        out.append(im)
    return strip(out)


def candles(bg_path, lights):
    """lights: [(x, y, r)] 夜间背景里灯火的位置；4 帧暖光，强度按固定序列抖动，末帧接首帧。"""
    seq = [0.4, 1.0, 0.6, 0.85]
    out = []
    for f in range(4):
        im = blank(512, 288)
        for i, (x, y, r) in enumerate(lights):
            k = seq[(f + i) % 4]
            layer = blank(512, 288)
            d = ImageDraw.Draw(layer)
            for step in range(4):
                rr = r * (1 - step * 0.22) * (0.92 + 0.08 * k)
                a = int((26 + step * 24) * k)
                d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(255, 184, 74, a))
            im = Image.alpha_composite(im, layer)
        out.append(im)
    return strip(out)


if __name__ == "__main__":
    for name, fn in (("trick-win", trick_win), ("coins", coins), ("hit", hit), ("miss", miss), ("splash", splash)):
        fn().save(FX / f"{name}.png")
    sel = json.loads((ART / "selection.json").read_text())
    if "candles" in sel:
        candles(ART / sel["bg-night"]["file"], sel["candles"]["lights"]).save(FX / "candles-night.png")
    print("ok")
