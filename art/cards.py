"""海盗叫墩：按 selection.json 把挑定的 PixelLab 图合成成 spec 里的牌、图标、界面小图，导出到 out/final/。
python cards.py
数字全部用这里的 5x7 像素字画（不是模型写的）。
"""
import json, pathlib
from PIL import Image, ImageDraw

ART = pathlib.Path(__file__).parent
R1 = ART / "out" / "r1"
FIN = ART / "out" / "final"
SEL = json.loads((ART / "selection.json").read_text())


def hx(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


INK = hx("#2a160c")
PARCH = [hx("#f3e2b8"), hx("#dcc08a"), hx("#a87a44")]
BRASS, GOLD = hx("#c88a2c"), hx("#ffe08a")

SUITS = {  # 暗 / 中 / 亮 / 牌底 / 数字色 / 牌框
    "seaweed": dict(dark=hx("#164a2a"), mid=hx("#2f8f4e"), light=hx("#7ad27a"), tint=hx("#2f8f4e"), num=hx("#164a2a"), dark_body=False),
    "coin": dict(dark=hx("#7a4e08"), mid=hx("#d89a1c"), light=hx("#ffd75a"), tint=hx("#d89a1c"), num=hx("#7a4e08"), dark_body=False),
    "compass": dict(dark=hx("#3a1f66"), mid=hx("#7a4ab8"), light=hx("#c6a2ef"), tint=hx("#7a4ab8"), num=hx("#3a1f66"), dark_body=False),
    "flag": dict(dark=hx("#0c0a0e"), mid=hx("#3e3644"), light=hx("#ece4d0"), tint=hx("#2c2830"), num=hx("#ece4d0"), dark_body=True),
}
SPECIAL_FRAME = {  # 牌框 主色 / 亮线
    "pirate": (hx("#8a2a1e"), hx("#d0644a")),
    "ghost": (hx("#d8a038"), hx("#ffe08a")),
    "mermaid": (hx("#1f6f78"), hx("#6cc6c4")),
    "escape": (hx("#c8c4b8"), hx("#f4f2ea")),
    "tigress": (None, None),  # 左右分：左暗红 右灰白
}
FONT = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
}


def text_size(s, sc):
    return len(s) * 6 * sc - sc, 7 * sc


def draw_num(im, s, x, y, sc, col, shadow=None):
    d = ImageDraw.Draw(im)
    for pass_, c, off in ((0, shadow, sc // 2 or 1), (1, col, 0)):
        if c is None:
            continue
        for ci, ch in enumerate(s):
            for yy, row in enumerate(FONT[ch]):
                for xx, bit in enumerate(row):
                    if bit == "1":
                        px0 = x + ci * 6 * sc + xx * sc + off
                        py0 = y + yy * sc + off
                        d.rectangle([px0, py0, px0 + sc - 1, py0 + sc - 1], fill=c)


def load(key):
    p = SEL[key]["file"]
    return Image.open(ART / p).convert("RGBA")


def trim(im):
    bb = im.getchannel("A").point(lambda a: 255 if a > 20 else 0).getbbox()
    return im.crop(bb) if bb else im


def mix(a, b, t):
    return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))


def card_shape(w, h):
    """圆角蒙版：四角切掉 1px（外描边那一圈的角）。"""
    m = Image.new("L", (w, h), 255)
    for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        m.putpixel((x, y), 0)
    return m


def base_card(w, h, frame, frame_hi, border, inner_line=None):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w - 1, h - 1], fill=INK)
    if isinstance(frame, tuple) and len(frame) == 2 and isinstance(frame[0], tuple):  # 左右分色
        d.rectangle([1, 1, w // 2 - 1, h - 2], fill=frame[0])
        d.rectangle([w // 2, 1, w - 2, h - 2], fill=frame[1])
    else:
        d.rectangle([1, 1, w - 2, h - 2], fill=frame)
    if frame_hi:
        d.line([(2, 2), (w - 3, 2)], fill=frame_hi)
        d.line([(2, 2), (2, h - 3)], fill=frame_hi)
    d.rectangle([border - 1, border - 1, w - border, h - border], fill=inner_line or INK)
    im.putalpha(Image.composite(im.getchannel("A"), Image.new("L", (w, h), 0), card_shape(w, h)))
    return im


def parchment(w, h, tint, dark=False):
    """牌面底：PixelLab 羊皮纸纹理按花色着色（黑旗是深色皮革）。"""
    tex = load("parchment").convert("RGB").resize((w, h), Image.NEAREST) if (w, h) != (116, 180) else load("parchment").convert("RGB")
    out = Image.new("RGB", (w, h))
    tp, op = tex.load(), out.load()
    for x in range(w):
        for y in range(h):
            r, g, b = tp[x, y]
            lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255
            if dark:
                base = mix(hx("#16131a"), hx("#4a4252"), max(0, min(1, (lum - 0.5) * 1.8)))
            else:
                base = mix((r, g, b), tint, 0.10)
            op[x, y] = base
    return out.convert("RGBA")


def v2icon(key):
    return trim(load(key))


def outline(im, col, alpha_th=40):
    """透明图外面加 1px 描边（给深色牌底上的黑旗用）。"""
    a = im.getchannel("A").point(lambda v: 255 if v > alpha_th else 0)
    w, h = im.size
    out = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    ring = Image.new("L", (w + 2, h + 2), 0)
    for dx, dy in ((0, 1), (2, 1), (1, 0), (1, 2)):
        ring.paste(a, (dx, dy), a)
    out.paste(col + (255,), (0, 0), ring)
    out.alpha_composite(im, (1, 1))
    return out


def reduce2(im):
    """2x 缩小：box 取样后 alpha 二值化、颜色量化回 48 色，保持像素感。"""
    small = im.reduce(2)
    a = small.getchannel("A").point(lambda v: 255 if v > 110 else 0)
    rgb = small.convert("RGB").quantize(48, method=Image.Quantize.MEDIANCUT).convert("RGB")
    rgb.putalpha(a)
    return rgb


def paste_center(dst, src, cx, cy):
    dst.alpha_composite(src, (cx - src.width // 2, cy - src.height // 2))


def corner_block(n, st, icon, sc, gap):
    s = str(n)
    tw, th = text_size(s, sc)
    w = max(tw, icon.width)
    blk = Image.new("RGBA", (w, th + gap + icon.height), (0, 0, 0, 0))
    draw_num(blk, s, (w - tw) // 2, 0, sc, st["num"])
    blk.alpha_composite(icon, ((w - icon.width) // 2, th + gap))
    return blk


def number_card(suit, n, big=True):
    """大牌：左上数字（5x7 字 4 倍，28px 高）+ 下面 24px 角标，正中花色大图样，右下角倒放的角标。
    小牌：左上数字（3 倍，21px 高）+ 16px 角标，图样放在下半部，没有右下角标。"""
    st = SUITS[suit]
    if big:
        W, H, B = 128, 192, 6
        frame = base_card(W, H, st["mid"], st["light"], B)
        body = parchment(116, 180, st["tint"], st["dark_body"])
        emb = trim(load(f"emb-{suit}"))
        icon = v2icon(f"suit-{suit}-24")
        sc, gap, pad, cy = 4, 4, 5, 96
    else:
        W, H, B = 64, 96, 4
        frame = base_card(W, H, st["mid"], st["light"], B)
        body = parchment(116, 180, st["tint"], st["dark_body"]).resize((56, 88), Image.NEAREST)
        emb = reduce2(trim(load(f"emb-{suit}")))
        icon = v2icon(f"suit-{suit}-16")
        sc, gap, pad, cy = 3, 2, 3, 64
    if st["dark_body"]:
        emb = outline(emb, st["light"])
        icon = outline(icon, st["light"])
    paste_center(body, emb, body.width // 2, cy - B)
    if big:
        r = icon.rotate(180)
        body.alpha_composite(r, (body.width - pad - 2 - r.width, body.height - pad - 2 - r.height))
    if n is not None:
        blk = corner_block(n, st, icon, sc, gap)
        body.alpha_composite(blk, (pad, pad))
    else:
        body.alpha_composite(icon, (pad, pad + 7 * sc + gap))
    frame.alpha_composite(body, (B, B))
    return frame


SP_KEYS = {"pirate-1": "pirate", "pirate-2": "pirate", "pirate-3": "pirate", "pirate-4": "pirate", "pirate-5": "pirate",
           "tigress": "tigress", "ghost": "ghost", "mermaid-1": "mermaid", "mermaid-2": "mermaid", "escape": "escape"}


def plaque(icon, size):
    p = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(p)
    d.rectangle([1, 0, size - 2, size - 1], fill=INK)
    d.rectangle([0, 1, size - 1, size - 2], fill=INK)
    d.rectangle([1, 1, size - 2, size - 2], fill=PARCH[0])
    d.line([(2, size - 2), (size - 2, size - 2)], fill=PARCH[1])
    d.line([(size - 2, 2), (size - 2, size - 2)], fill=PARCH[1])
    paste_center(p, icon, size // 2, size // 2)
    return p


def special_card(cid, big=True, art=None):
    kind = SP_KEYS[cid]
    art = art if art is not None else load(f"card-{cid}")
    if kind == "tigress":
        fr, hi = (hx("#8a2a1e"), hx("#c8c4b8")), None
    else:
        fr, hi = SPECIAL_FRAME[kind]
    if big:
        card = base_card(128, 192, fr, hi, 6)
        card.alpha_composite(art, (6, 6))
        card.alpha_composite(plaque(v2icon(f"sp-{kind}-24"), 30), (8, 8))
    else:
        card = base_card(64, 96, fr, hi, 4)
        a = reduce2(art)  # 58x90
        card.alpha_composite(a.crop((1, 1, 57, 89)), (4, 4))
        card.alpha_composite(plaque(v2icon(f"sp-{kind}-16"), 20), (5, 5))
    return card


def back_card(big=True):
    art = load("back")
    if big:
        card = base_card(128, 192, hx("#4a2a16"), hx("#6e4024"), 6)
        card.alpha_composite(art, (6, 6))
    else:
        card = base_card(64, 96, hx("#4a2a16"), hx("#6e4024"), 4)
        card.alpha_composite(reduce2(art).crop((1, 1, 57, 89)), (4, 4))
    return card


def pile(back, n=6, step=(2, 2)):
    w, h = back.size
    out = Image.new("RGBA", (w + step[0] * (n - 1), h + step[1] * (n - 1)), (0, 0, 0, 0))
    for i in range(n):
        out.alpha_composite(back, (step[0] * (n - 1 - i), step[1] * (n - 1 - i)))
    return out


def glow(w, h, ext=4):
    g = Image.new("RGBA", (w + 2 * ext, h + 2 * ext), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    cols = [GOLD + (60,), GOLD + (110,), hx("#ffd75a") + (180,), hx("#fff4c0") + (255,)]
    for i, c in enumerate(cols):
        d.rounded_rectangle([i, i, w + 2 * ext - 1 - i, h + 2 * ext - 1 - i], radius=3, outline=c, width=1)
    return g


def seal(icon, wax, wax_hi, size=40):
    """蜡封：圆形蜡印（带不规则边）+ 中间图标。"""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = size / 2
    d.ellipse([1, 1, size - 2, size - 2], fill=INK)
    for k in range(8):  # 蜡滴出来的小鼓包
        import math
        ang = k * math.pi / 4 + 0.3
        x, y = c + math.cos(ang) * (size / 2 - 4), c + math.sin(ang) * (size / 2 - 4)
        d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=INK)
    d.ellipse([2, 2, size - 3, size - 3], fill=wax)
    for k in range(8):
        import math
        ang = k * math.pi / 4 + 0.3
        x, y = c + math.cos(ang) * (size / 2 - 4), c + math.sin(ang) * (size / 2 - 4)
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=wax)
    d.ellipse([7, 7, size - 8, size - 8], outline=mix(wax, INK, 0.45), width=1)
    d.arc([4, 4, size - 5, size - 5], 200, 260, fill=wax_hi, width=1)
    paste_center(im, icon, size // 2, size // 2)
    return im


def chip(on=False):
    im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rim = hx("#ffd75a") if on else hx("#c88a2c")
    face = hx("#ffe08a") if on else hx("#e8b04a")
    d.ellipse([1, 1, 30, 30], fill=INK)
    d.ellipse([2, 2, 29, 29], fill=rim)
    d.ellipse([4, 4, 27, 27], fill=face)
    d.arc([4, 4, 27, 27], 190, 280, fill=hx("#fff4c0"), width=1)
    d.arc([4, 4, 27, 27], 10, 100, fill=hx("#a86a1c"), width=1)
    if on:
        d.ellipse([0, 0, 31, 31], outline=hx("#fff4c0"))
    return im


def suit_none():
    im = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    import math
    for k in range(24):
        if k % 2:
            continue
        ang = k * 2 * math.pi / 24
        for r in (9, 10):
            x, y = 12 + math.cos(ang) * r, 12 + math.sin(ang) * r
            im.putpixel((int(round(x)), int(round(y))), PARCH[1] + (255,))
    return im


def parchment_9():
    tex = load("parchment").convert("RGB").crop((34, 66, 82, 114))  # 中间 48x48 的纸面
    im = tex.convert("RGBA")
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 47, 47], outline=INK)
    d.rectangle([1, 1, 46, 46], outline=PARCH[2])
    d.rectangle([2, 2, 45, 45], outline=PARCH[1])
    for x, y in ((0, 0), (47, 0), (0, 47), (47, 47)):
        im.putpixel((x, y), (0, 0, 0, 0))
    return im


def square(im, size):
    """图标统一放进 size x size 的透明方格正中（内容已裁掉空白），界面排版对齐方便。"""
    c = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    c.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
    return c


def save(im, rel):
    if rel.startswith("icons/"):
        size = 16 if rel.endswith("-16.png") else (32 if rel.split("/")[1].split(".")[0] in ("hit", "miss", "bid", "trick", "score") else 24)
        im = square(im, size)
    p = FIN / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    im.save(p)


if __name__ == "__main__":
    for suit in SUITS:
        save(number_card(suit, None), f"cards/num/{suit}.png")
        save(number_card(suit, None, big=False), f"cards/sm/num/{suit}.png")
        for n in range(1, 15):
            save(number_card(suit, n), f"cards/{suit}-{n}.png")
            save(number_card(suit, n, big=False), f"cards/sm/{suit}-{n}.png")
    have_sp = all(f"card-{c}" in SEL for c in SP_KEYS)
    if have_sp:
        for c in SP_KEYS:
            save(special_card(c), f"cards/{c}.png")
            save(special_card(c, big=False), f"cards/sm/{c}.png")
    b, bs = back_card(), back_card(False)
    save(b, "cards/back.png"); save(bs, "cards/sm/back.png")
    save(pile(b), "cards/pile.png"); save(pile(bs, 6, (1, 1)), "cards/sm/pile.png")
    save(glow(128, 192), "cards/glow.png"); save(glow(64, 96, 3), "cards/sm/glow.png")
    off = Image.new("RGBA", (128, 192), (42, 22, 12, 150)); off.putalpha(Image.composite(off.getchannel("A"), Image.new("L", off.size, 0), card_shape(128, 192)))
    save(off, "cards/playable-off.png")
    # 声明角标
    save(seal(v2icon("sp-pirate-24"), hx("#a8302a"), hx("#e8705a")), "marks/tigress-pirate.png")
    save(seal(v2icon("sp-escape-24"), hx("#bdb6a6"), hx("#f4f2ea")), "marks/tigress-escape.png")
    # 图标
    for suit in SUITS:
        i24, i16 = v2icon(f"suit-{suit}-24"), v2icon(f"suit-{suit}-16")
        if suit == "flag":  # 黑旗在夜间深色底上看不见，外加 1px 骨白描边（尺寸 +2）
            i24, i16 = outline(i24, SUITS["flag"]["light"]), outline(i16, SUITS["flag"]["light"])
        save(i24, f"icons/suit-{suit}.png")
        save(i16, f"icons/suit-{suit}-16.png")
    save(suit_none(), "icons/suit-none.png")
    for k in ("pirate", "tigress", "ghost", "mermaid", "escape"):
        save(v2icon(f"sp-{k}-24"), f"icons/sp-{k}.png")
        if f"sp-{k}-16" in SEL:
            save(v2icon(f"sp-{k}-16"), f"icons/sp-{k}-16.png")
    for k in ("hit", "miss", "bid", "trick", "score"):
        save(v2icon(f"ic-{k}"), f"icons/{k}.png")
    save(chip(), "ui/bid-chip.png"); save(chip(True), "ui/bid-chip-on.png")
    save(trim(load("winner")), "ui/winner.png")
    save(parchment_9(), "ui/parchment.png")
    # 背景
    for t in ("night", "day"):
        bg = Image.open(ART / SEL[f"bg-{t}"]["file"]).convert("RGB")
        save(bg, f"bg/{t}.png"); save(bg.resize((1536, 864), Image.NEAREST), f"bg/{t}@3x.png")
    # 头像
    for i in range(1, 9):
        if f"crew-{i}" in SEL:
            save(load(f"crew-{i}").convert("RGB"), f"avatars/crew-{i}.png")
    if "ava-ghost" in SEL:
        save(load("ava-ghost").convert("RGB"), "avatars/ghost.png")
    for cid in ("ghost", "mermaid-1", "escape"):
        if f"anim-{cid}" in SEL:
            raw = Image.open(ART / SEL[f"anim-{cid}"]["file"]).convert("RGBA")
            n = raw.width // 116
            strip = Image.new("RGBA", (128 * n, 192), (0, 0, 0, 0))
            for i in range(n):
                art = load(f"card-{cid}") if i == 0 else raw.crop((i * 116, 0, (i + 1) * 116, 180))  # 首帧和静态牌逐像素一样
                strip.alpha_composite(special_card(cid, art=art), (i * 128, 0))
            save(strip, f"anim/{cid}.png")
    print("ok", "特殊牌" if have_sp else "（特殊牌还没挑）")
