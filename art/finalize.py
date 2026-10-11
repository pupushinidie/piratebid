"""海盗叫墩动画检查（从花火的 finalize.py 改来）（宝石商人 finalize.py 的 report / has_glitch_frame 改成适合代码粒子特效的版本）。
python finalize.py

每条精灵图检查：
- 动不动：相邻帧变化的最大值 < 0.5% 判「不动」；
- 坏帧：某帧和前后两帧的差都 ≥ 中位数 4 倍，而前后两帧彼此很像（突变又变回）；
- 循环：循环播放的条，末帧→首帧的变化不超过相邻帧变化最大值的 1.2 倍（接缝和平常的一帧一样，不闪）；
- 一次性：只播一次的条，末帧必须是空的（播完消失）或者等于 spec 规定的停留帧。
"""
import pathlib, sys
from PIL import Image, ImageChops

ART = pathlib.Path(__file__).parent
FIN = ART / "out" / "final"
# 文件 → (每帧宽, 循环?)
ANIMS = {"fx/trick-win": (96, False), "fx/coins": (64, False), "fx/hit": (64, False), "fx/miss": (64, False),
         "fx/splash": (96, False), "fx/candles-night": (512, True),
         "anim/ghost": (128, True), "anim/mermaid-1": (128, True), "anim/escape": (128, True)}


def frames(path, w):
    s = Image.open(path).convert("RGBA")
    return [s.crop((i * w, 0, (i + 1) * w, s.height)) for i in range(s.width // w)]


def diff(a, b):
    d = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 24 else 0)
    return sum(1 for v in d.get_flattened_data() if v) / (a.width * a.height)


def has_glitch_frame(fr):
    ds = [diff(fr[i], fr[i + 1]) for i in range(len(fr) - 1)]
    med = sorted(ds)[len(ds) // 2] or 1e-6
    for i in range(1, len(fr) - 1):
        if ds[i - 1] >= 4 * med and ds[i] >= 4 * med and diff(fr[i - 1], fr[i + 1]) < med:
            return True, i
    return False, None


def report():
    bad = 0
    for name, (w, loop) in ANIMS.items():
        p = FIN / f"{name}.png"
        if not p.exists():
            print(f"{name}: 缺文件"); bad += 1; continue
        fr = frames(p, w)
        if name == "fx/candles-night":  # 半透明暖光只有叠到背景上才看得出变化
            bg = Image.open(FIN / "bg" / "night.png").convert("RGBA")
            box = fr[1].getbbox()  # 只量有灯光的那一块（整张 512x288 里灯只占一角）
            fr = [Image.alpha_composite(bg, f).crop(box) for f in fr]
        ds = [diff(fr[i], fr[i + 1]) for i in range(len(fr) - 1)]
        med = sorted(ds)[len(ds) // 2]
        flags = []
        if max(ds) < 0.005:
            flags.append("不动")
        g, i = has_glitch_frame(fr)
        if g:
            flags.append(f"坏帧 {i}")
        if loop:
            seam = diff(fr[-1], fr[0])
            if seam > 1.2 * max(max(ds), 0.002):  # 接缝不比任何一对相邻帧变化大，才算无缝
                flags.append(f"循环接缝 {seam:.1%}")
            extra = f"接缝 {seam:.2%}"
        else:
            empty = fr[-1].getbbox() is None
            if not empty:
                flags.append("末帧不空")
            extra = "末帧空" if empty else "末帧有图"
        print(f"{name}: {len(fr)} 帧，相邻变化 中位 {med:.2%} / 最大 {max(ds):.2%}，{extra} {'  '.join(flags) or 'OK'}")
        bad += bool(flags)
    print("有问题的条数", bad)
    return bad


if __name__ == "__main__":
    sys.exit(1 if report() else 0)
