"""第 3 轮：封面重出（第 2 轮的牌上有角标字母、船那张右下角有签名样的笔画），这次不画牌、不画旗上图案。"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from r1 import JOBS, pixflux, run
from concurrent.futures import ThreadPoolExecutor
JOBS.clear()
CSTYLE = ("cozy 16-bit pixel art game cover illustration, rich warm colors, soft lighting, crisp clean pixels, "
          "no text, no letters, no numbers, no logo, no people, no playing cards")
NEG = "text, letters, numbers, writing, signature, watermark, logo, people, person, frame, border, playing cards"
COV = {
    1801: "a skull wearing a small golden crown resting on an old wooden captain's table next to an open treasure chest overflowing "
          "with gold coins, a lit candle, a brass compass and a cutlass, close up, filling the frame, warm amber candle light, dark cabin behind",
    1802: "an old wooden captain's table at night seen from above, an open treasure chest spilling gold coins, a brass oil lantern glowing, "
          "a treasure map with a red X, a brass compass, a dagger, candles, filling the frame, warm amber light",
    1803: "the stern of a wooden pirate galleon at night with big warm glowing cabin windows and hanging lanterns, "
          "calm dark sea reflecting the golden light, a full moon, close up, warm amber and deep blue",
    1804: "a skull wearing a small golden crown on top of a pile of gold coins and jewels, a brass lantern beside it, "
          "a coiled rope and a cutlass, close up, warm candle light, dark wooden cabin background",
}
for s, d in COV.items():
    pixflux(f"cover-s{s}", f"{d}, {CSTYLE}", 384, 192, s, neg=NEG)
if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=4) as pool:
        for n, r in pool.map(run, JOBS):
            print(n, r, flush=True)
    print("全部完成", flush=True)
