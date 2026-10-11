"""特殊牌待机动画（animate-with-text-v3）：首帧=末帧=静态插画 116x180，8 帧循环。每张 2 个种子作候选。
python anim.py  → out/anim/<name>-s<seed>/ 原始帧 + strip.png + preview.gif"""
import sys, pathlib, json
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import pixellab as px
ART = pathlib.Path(__file__).parent
SEL = json.loads((ART / "selection.json").read_text())
OUT = ART / "out" / "anim"
FRAMES = 8
ACT = {
    "ghost": "the skeleton pirate captain breathes slowly, his coat sways slightly, the candle flame flickers",
    "mermaid-1": "the mermaid's tail swishes gently, the sea waves ripple, her hair moves slightly",
    "escape": "the white flag flutters in the wind, small waves roll onto the beach",
}
JOBS = [(k, s) for k in ACT for s in (71, 72)]
# 第 2 次：ghost-s71 第 0 帧红眼、后面几帧眼睛变白（循环点会闪），s72 服务器报错。换动作词（不提脸）和种子重做
ACT2 = {"ghost": "the candle flame flickers and the captain's coat and sash sway slightly, the head stays still"}
if len(sys.argv) > 1 and sys.argv[1] == "ghost2":
    ACT.update(ACT2)
    JOBS = [("ghost", 73), ("ghost", 74), ("ghost", 75)]


def run(job):
    k, seed = job
    name = f"{k}-s{seed}"
    d = OUT / name
    if (d / "strip.png").exists():
        return name, "skip"
    src = ART / SEL[f"card-{k}"]["file"]
    try:
        paths = px.animate(name, {"first_frame": px.b64_image(src), "last_frame": px.b64_image(src),
                                  "action": ACT[k], "frame_count": FRAMES, "no_background": False, "seed": seed}, d)
    except Exception as e:
        return name, f"ERR {str(e)[:200]}"
    frames = [Image.open(p).convert("RGB") for p in paths][:FRAMES]
    while len(frames) < FRAMES:
        frames.append(frames[-1])
    w, h = frames[0].size
    strip = Image.new("RGB", (w * FRAMES, h))
    for i, f in enumerate(frames):
        strip.paste(f, (i * w, 0))
    strip.save(d / "strip.png")
    big = [f.resize((w * 2, h * 2), Image.NEAREST) for f in frames]
    big[0].save(d / "preview.gif", save_all=True, append_images=big[1:], duration=150, loop=0)
    return name, f"{len(paths)} 帧"


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=6) as pool:
        for n, r in pool.map(run, JOBS):
            print(n, r, flush=True)
    print("全部完成", flush=True)
