"""第 2 轮：特殊牌改成铺满画面的半身像（第 1 轮大多自带画框）、封面重出、补 sp-escape-16。"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import r1
from r1 import JOBS, pixflux, run, OUT
from concurrent.futures import ThreadPoolExecutor
JOBS.clear()
NEGF = "text, letters, numbers, writing, signature, watermark, logo, card frame, border, ornamental border, vignette, rounded corners"
BG = ("edge to edge illustration filling the entire canvas, no frame, no border, warm candle lit ship cabin background "
      "with wooden planks, classic adventure illustration, rich browns and gold, dark outlines")
SP = {
    "ghost": ("close-up bust portrait of a fearsome skeleton pirate captain, bony skull face with glowing red eyes, "
              "small golden crown on a black tricorn hat, tattered black captain's coat with gold buttons and a red sash, "
              "cutlass resting on his shoulder", (1101, 1102)),
    "mermaid1": ("bust portrait of a mermaid rising from the sea, long wavy chestnut brown hair, coral orange fish tail curling "
                 "in front, pale pink seashell top, holding a pearl, waves and bubbles", (1111, 1112)),
    "mermaid2": ("bust portrait of a mermaid rising from the sea, long straight black hair with a pearl string, "
                 "deep sapphire blue fish tail curling in front, golden scallop shell top, waves and bubbles", (1121,)),
    "tigress": ("bust portrait of a sly woman pirate, black braided hair, dark red headscarf, red coat, "
                "a raised cutlass in one hand and a small white cloth flag on a stick in the other hand, half smile", (1131, 1132, 1133)),
    "escape": ("a plain white surrender flag on a long wooden pole planted in the sand of a small beach, the flag waving in the wind, "
               "turquoise sea, a small rowboat pulled up on the shore, sunset sky, no people", (1141, 1142)),
    "pirate1": ("close-up bust portrait of a grizzled old pirate with a black eyepatch over one eye, grey beard, brown leather hat, "
                "holding a flintlock pistol", (1151, 1152)),
    "pirate2": ("close-up bust portrait of a young woman pirate with short curly red-brown hair, green bandana, "
                "brown vest over white shirt, holding a brass spyglass", (1161, 1162)),
    "pirate3": ("close-up bust portrait of a big bald muscular pirate with a gold earring and a thick black beard, "
                "striped shirt, holding a boarding axe", (1171, 1172)),
    "pirate4": ("close-up bust portrait of a pirate quartermaster with dark skin, neat beard, deep blue wide-brimmed hat with a feather, "
                "blue coat, holding a lantern", (1181, 1182)),
    "pirate5": ("close-up bust portrait of a stern woman sea captain from the south china sea, black hair in a bun, "
                "wide conical bamboo hat, dark teal robe, holding a curved sword", (1191, 1192)),
}
for k, (d, seeds) in SP.items():
    for s in seeds:
        bg = BG if k != "escape" else BG.replace("warm candle lit ship cabin background with wooden planks, ", "")
        pixflux(f"c2-{k}-s{s}", f"{d}, {bg}", 116, 180, s, neg=NEGF)
CSTYLE = "cozy 16-bit pixel art game cover illustration, rich warm colors, soft lighting, crisp clean pixels, no text, no letters, no numbers, no logo, no people"
COV = {
    1701: "close-up of an old wooden captain's table at night filling the frame: an open treasure chest spilling gold coins, "
          "a brass lantern glowing, a rolled treasure map, a brass compass and a neat fan of face down playing cards with dark red backs, warm candle light",
    1702: "a pirate galleon sailing on a calm sea at night, close up, warm glowing lantern windows at the stern, a full moon, "
          "a black flag with white crossed bones on the mast, silver moonlit waves",
    1703: "a small golden crown resting on a skull on a wooden table next to an open treasure chest full of gold, a lit candle, "
          "a cutlass and a fan of face down playing cards with dark red backs, close up, filling the frame, warm amber light",
}
for s, d in COV.items():
    pixflux(f"cover-s{s}", f"{d}, {CSTYLE}", 384, 192, s, neg="text, letters, numbers, writing, logo, people, person, frame, border")
JOBS.append(("sp-escape-16", "/generate-image-v2", {"description": "pixel art icon of a white flag on a pole, bold dark brown outline, simple, readable, fills the canvas, transparent background",
             "image_size": {"width": 16, "height": 16}, "no_background": True, "seed": 9917}))
if __name__ == "__main__":
    jobs = sorted(JOBS, key=lambda j: 0 if j[1] != "/create-image-pixflux" else 1)
    print("jobs", len(jobs), flush=True)
    with ThreadPoolExecutor(max_workers=10) as pool:
        for n, r in pool.map(run, jobs):
            print(n, r, flush=True)
    print("全部完成", flush=True)
