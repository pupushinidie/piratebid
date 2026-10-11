"""按 spec 核对 out/final 里每一项都有、尺寸对。python check_final.py"""
import pathlib
from PIL import Image
F = pathlib.Path(__file__).parent / "out" / "final"
S = ["seaweed", "coin", "compass", "flag"]
SP = ["pirate-1", "pirate-2", "pirate-3", "pirate-4", "pirate-5", "tigress", "ghost", "mermaid-1", "mermaid-2", "escape"]
E = {"bg/night.png": (512, 288), "bg/day.png": (512, 288), "bg/night@3x.png": (1536, 864), "bg/day@3x.png": (1536, 864),
     "fx/candles-night.png": (2048, 288), "cards/back.png": (128, 192), "cards/sm/back.png": (64, 96),
     "cards/pile.png": (138, 202), "cards/sm/pile.png": (69, 101), "cards/glow.png": (136, 200), "cards/sm/glow.png": (70, 102),
     "cards/playable-off.png": (128, 192), "marks/tigress-pirate.png": (40, 40), "marks/tigress-escape.png": (40, 40),
     "icons/suit-none.png": (24, 24), "ui/bid-chip.png": (32, 32), "ui/bid-chip-on.png": (32, 32), "ui/winner.png": (52, 53),
     "ui/parchment.png": (48, 48), "avatars/ghost.png": (64, 64),
     "fx/trick-win.png": (960, 96), "fx/coins.png": (768, 64), "fx/hit.png": (640, 64), "fx/miss.png": (640, 64), "fx/splash.png": (960, 96),
     "anim/ghost.png": (1024, 192), "anim/mermaid-1.png": (1024, 192), "anim/escape.png": (1024, 192)}
for s in S:
    E[f"cards/num/{s}.png"] = (128, 192); E[f"cards/sm/num/{s}.png"] = (64, 96)
    E[f"icons/suit-{s}.png"] = (24, 24); E[f"icons/suit-{s}-16.png"] = (16, 16)
    for n in range(1, 15):
        E[f"cards/{s}-{n}.png"] = (128, 192); E[f"cards/sm/{s}-{n}.png"] = (64, 96)
for c in SP:
    E[f"cards/{c}.png"] = (128, 192); E[f"cards/sm/{c}.png"] = (64, 96)
for k in ("pirate", "tigress", "ghost", "mermaid", "escape"):
    E[f"icons/sp-{k}.png"] = (24, 24); E[f"icons/sp-{k}-16.png"] = (16, 16)
for k in ("hit", "miss", "bid", "trick", "score"):
    E[f"icons/{k}.png"] = (32, 32)
for i in range(1, 9):
    E[f"avatars/crew-{i}.png"] = (64, 64)
bad = 0
for rel, size in E.items():
    p = F / rel
    if not p.exists():
        print("缺", rel); bad += 1
    elif Image.open(p).size != size:
        print("尺寸不对", rel, Image.open(p).size, "应为", size); bad += 1
extra = sorted(str(p.relative_to(F)) for p in F.rglob("*.png") if str(p.relative_to(F)) not in E)
print(f"spec 项 {len(E)}，缺/错 {bad}；多出来的 {extra}")
