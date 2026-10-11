"""背景修补：卷轴/地图上像字的笔画抹掉，改成代码画的虚线航路 + 红叉（不调 PixelLab）。
python bgfix.py <in.png> <out.png> x0 y0 x1 y1 [x0 y0 x1 y1 ...]"""
import sys
from PIL import Image, ImageDraw


def lum(c):
    return c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11


def clean(im, box, tol=16):
    px = im.load()
    x0, y0, x1, y1 = box
    region = [(x, y) for x in range(x0, x1) for y in range(y0, y1)]
    light = [px[p][:3] for p in region]
    light.sort(key=lum)
    paper_l = lum(light[int(len(light) * 0.85)])  # 纸的亮度

    def is_paper(c):
        return lum(c) > paper_l - tol

    changed = []
    for x, y in region:
        c = px[x, y][:3]
        if is_paper(c):
            continue
        # 四个方向 4px 内都碰得到纸 → 在纸里面的笔画
        hits = 0
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            for k in range(1, 5):
                q = (x + dx * k, y + dy * k)
                if x0 <= q[0] < x1 and y0 <= q[1] < y1 and is_paper(px[q][:3]):
                    hits += 1
                    break
        if hits == 4:
            changed.append((x, y))
    for x, y in changed:
        nb = [px[x + dx, y + dy][:3] for dx in range(-3, 4) for dy in range(-3, 4)
              if (dx or dy) and x0 <= x + dx < x1 and y0 <= y + dy < y1 and is_paper(px[x + dx, y + dy][:3])]
        if nb:
            nb.sort(key=lum)
            px[x, y] = nb[len(nb) // 2] + ((255,) if len(px[x, y]) == 4 else ())
    return changed


def draw_route(im, pts, x_at, ink, red):
    d = ImageDraw.Draw(im)
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        n = max(abs(bx - ax), abs(by - ay))
        for i in range(0, n + 1, 3):
            t = i / n if n else 0
            d.point((round(ax + (bx - ax) * t), round(ay + (by - ay) * t)), fill=ink)
    x, y = x_at
    for k in range(-2, 3):
        d.point((x + k, y + k), fill=red)
        d.point((x + k, y - k), fill=red)


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    nums = list(map(int, sys.argv[3:]))
    im = Image.open(src).convert("RGB")
    for i in range(0, len(nums), 4):
        print("抹掉像素", len(clean(im, tuple(nums[i:i + 4]))))
    im.save(dst)


def smooth_paper(im, box, tol=34):
    """纸面内部统一抹平：每个内部像素换成 7x7 邻域里纸色像素的中位数（去掉残留笔画）。"""
    px = im.load()
    x0, y0, x1, y1 = box
    region = [(x, y) for x in range(x0, x1) for y in range(y0, y1)]
    ls = sorted(lum(px[p][:3]) for p in region)
    paper_l = ls[int(len(ls) * 0.85)]
    is_paper = lambda c: lum(c) > paper_l - tol
    src = im.copy().load()
    for x, y in region:
        hits = 0
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            for k in range(1, 6):
                q = (x + dx * k, y + dy * k)
                if x0 <= q[0] < x1 and y0 <= q[1] < y1 and is_paper(src[q][:3]):
                    hits += 1
                    break
        if hits < 4 or not (is_paper(src[x, y][:3]) or lum(src[x, y][:3]) > paper_l - 70):
            continue
        nb = sorted((src[x + dx, y + dy][:3] for dx in range(-3, 4) for dy in range(-3, 4)
                     if x0 <= x + dx < x1 and y0 <= y + dy < y1 and lum(src[x + dx, y + dy][:3]) > paper_l - 12), key=lum)
        if nb:
            px[x, y] = nb[len(nb) // 2]
