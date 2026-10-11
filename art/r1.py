"""海盗叫墩正式美术第 1 轮候选（暖色船长舱）：一个进程，线程池 10。
python r1.py [前缀...]   已有的跳过；结果在 out/r1/
"""
import sys, pathlib
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import pixellab as px

ART = pathlib.Path(__file__).parent
OUT = ART / "out" / "r1"
OUT.mkdir(parents=True, exist_ok=True)
NEG = "text, letters, numbers, writing, signature, watermark, logo, frame, border"
CARD = ("classic adventure illustration, warm amber parchment background, rich browns and gold, "
        "dark outlines, full bleed, no border, no frame")
JOBS = []


def pixflux(name, desc, w, h, seed, nobg=False, neg=NEG):
    JOBS.append((name, "/create-image-pixflux", {
        "description": f"pixel art, {desc}", "image_size": {"width": w, "height": h},
        "no_background": nobg, "negative_description": neg, "detail": "highly detailed", "seed": seed}))


# ---------- 特殊牌卡面 116x180 ----------
SPECIAL = {
    "ghost": ("card portrait of a fearsome skeleton pirate captain king, bony skull face with glowing red eyes, "
              "small golden crown on a black tricorn hat, tattered dark navy captain's coat with gold buttons, "
              "holding a curved cutlass, upper body, centered", (101, 102, 103)),
    "mermaid1": ("card portrait of a mermaid, long wavy chestnut brown hair, coral orange fish tail, seashell top, "
                 "sitting on a rock among waves, holding a pearl, upper body and tail, centered", (111, 112)),
    "mermaid2": ("card portrait of a mermaid, long straight black hair with a pearl string, deep sapphire blue fish tail, "
                 "golden scallop shell top, swimming among waves and bubbles, upper body and tail, centered", (121, 122)),
    "tigress": ("card portrait of a cunning woman pirate with a two-faced look, black hair in a braid, red headscarf, "
                "holding a cutlass raised in her right hand and a small white surrender flag in her left hand, "
                "half of her coat dark red and half pale white, upper body, centered", (131, 132, 133)),
    "escape": ("card illustration of a plain white surrender flag on a wooden pole stuck in the sand of a small beach, "
               "calm sea and a little rowboat behind, gentle breeze, no people, centered", (141, 142, 143)),
    "pirate1": ("card portrait of a grizzled old one-eyed pirate with a black eyepatch, grey beard, "
                "brown leather hat, holding a flintlock pistol, upper body, centered", (151, 152)),
    "pirate2": ("card portrait of a young woman pirate with short curly red-brown hair, green bandana, "
                "holding a brass spyglass, white shirt and brown vest, upper body, centered", (161, 162)),
    "pirate3": ("card portrait of a big bald muscular pirate with a gold earring, anchor tattoo on his arm, "
                "striped shirt, holding a boarding axe, upper body, centered", (171, 172)),
    "pirate4": ("card portrait of a pirate quartermaster with a dark skin tone, neat beard, wide-brimmed feathered hat in deep blue, "
                "long blue coat, holding a cutlass and a lantern, upper body, centered", (181, 182)),
    "pirate5": ("card portrait of a stern woman sea captain from the south china sea, black hair in a tight bun, "
                "wide conical bamboo rain hat, dark teal robe, holding a curved dao sword, upper body, centered", (191, 192)),
}
for k, (d, seeds) in SPECIAL.items():
    for s in seeds:
        pixflux(f"card-{k}-s{s}", f"{d}, {CARD}", 116, 180, s)

# 牌背的中心图样 + 牌面羊皮纸纹理
for s in (201, 202, 203):
    pixflux(f"back-s{s}", "playing card back design, deep oxblood red leather with fine gold tooled filigree, "
            "a round brass compass rose medallion in the center, perfectly symmetrical, ornate, full bleed",
            116, 180, s, neg="text, letters, numbers, writing, logo")
for s in (211, 212, 213):
    pixflux(f"parch-s{s}", "plain aged parchment paper texture, warm cream and light tan, subtle stains and fibers, "
            "soft vignette, empty, nothing drawn on it", 116, 180, s, neg="text, letters, drawing, object, frame")

# ---------- 花色中心图样 64x64 透明 ----------
SUIT = {
    "seaweed": "a bunch of wavy green kelp seaweed fronds growing upward from a small rock, emerald green, game emblem",
    "coin": "a single big shiny gold doubloon coin seen from the front with an embossed anchor, gold, game emblem",
    "compass": "a brass and purple navigation compass rose, four pointed star with a violet needle, purple and brass, game emblem",
    "flag": "a black pirate flag on a short pole waving, with white crossed bones and no skull, black and bone white, game emblem",
}
for k, d in SUIT.items():
    for s in (301, 302, 303):
        pixflux(f"emb-{k}-s{s}", f"{d}, bold dark outline, centered, transparent background", 64, 64, s, nobg=True)

# ---------- 场景 512x288 ----------
TABLE = ("top-down view looking straight down at a large old wooden captain's table filling the whole frame, "
         "the empty smooth table surface in the middle is clear and open, objects only along the edges: "
         "a brass oil lantern, candles in brass holders, a rolled treasure map, a few gold coins, a brass compass, "
         "a dagger, a coil of rope, detailed classic 16-bit adventure game style, no text, no writing")
for s in (401, 402, 403):
    JOBS.append((f"bg-night-s{s}", "/create-image-pixen", {"description": f"pixel art, {TABLE}, night, warm candle light pooling on the wood, "
                 "deep shadows at the corners, rich warm amber and brown palette", "image_size": {"width": 512, "height": 288},
                 "detail": "highly detailed", "seed": s}))
for s in (411, 412, 413):
    JOBS.append((f"bg-day-s{s}", "/create-image-pixen", {"description": f"pixel art, {TABLE}, bright daytime, sunbeams from a cabin window, "
                 "light honey colored wood, bright airy warm palette, soft shadows", "image_size": {"width": 512, "height": 288},
                 "detail": "highly detailed", "seed": s}))

# ---------- 头像 64x64：动物船员 + 幽灵水手 ----------
AVA = {
    "cat": "a ginger cat pirate wearing a small red bandana and a gold earring",
    "parrot": "a green and yellow parrot pirate wearing a tiny black tricorn hat",
    "monkey": "a brown monkey pirate deckhand wearing a striped shirt and a blue headscarf",
    "dog": "a white and brown bulldog pirate wearing a leather eyepatch and a brown hat",
    "raccoon": "a raccoon pirate with a tiny spyglass and a purple bandana",
    "turtle": "an old sea turtle pirate navigator with round spectacles and a navy captain hat",
    "crab": "a red crab pirate holding a tiny cutlass, wearing a little black hat",
    "seal": "a grey harbor seal pirate sailor wearing a blue knit cap",
}
for k, d in AVA.items():
    for s in (501, 502):
        pixflux(f"ava-{k}-s{s}", f"head and shoulders avatar portrait of {d}, cute storybook style, warm palette, "
                "dark outline, plain warm parchment background", 64, 64, s)
for s in (511, 512, 513):
    pixflux(f"ava-ghost-s{s}", "head and shoulders avatar portrait of a friendly translucent pale blue ghost sailor "
            "with a sailor cap and a striped shirt, wispy body, glowing softly, dark outline, plain dark blue background", 64, 64, s)

# ---------- 结算：赢家宝箱 64x64 透明 ----------
for s in (601, 602, 603):
    pixflux(f"winner-s{s}", "an open wooden treasure chest overflowing with gold coins and jewels, a small golden crown on top, "
            "bold dark outline, centered, transparent background", 64, 64, s, nobg=True)

# ---------- 大厅封面 384x192 ----------
CSTYLE = ("cozy 16-bit pixel art game cover illustration, rich warm colors, soft lighting, crisp clean pixels, "
          "no text, no letters, no numbers, no logo, no people")
COVER = {
    701: "a pirate captain's cabin table at night seen from above, playing cards lying face down in a fan, piles of gold coins, "
         "a brass lantern, a treasure map and a compass, warm candle light",
    702: "a pirate galleon anchored in a calm moonlit bay at night, warm glowing cabin windows at the stern, "
         "lanterns on the deck, a tropical island with palm trees, stars",
    703: "an open treasure chest full of gold coins on a wooden table, a skull wearing a small golden crown beside it, "
         "a lit candle, a cutlass and a few face down playing cards, dark warm cabin background",
}
for s, d in COVER.items():
    pixflux(f"cover-s{s}", f"{d}, {CSTYLE}", 384, 192, s, neg="text, letters, numbers, writing, logo, people, person, frame, border")

# ---------- v2 小图标（一次 64 个） ----------
OUTL = "bold dark brown outline, simple, readable, fills the canvas, transparent background"
V2 = {
    "suit-seaweed-24": ("pixel art icon of a green seaweed kelp frond, wavy leaves, emerald green", 24),
    "suit-coin-24": ("pixel art icon of a round shiny gold coin, gold", 24),
    "suit-compass-24": ("pixel art icon of a purple compass rose, four pointed star, violet and purple", 24),
    "suit-flag-24": ("pixel art icon of a small black pirate flag on a pole, black with white crossed bones", 24),
    "suit-seaweed-16": ("pixel art icon of a green seaweed frond", 16),
    "suit-coin-16": ("pixel art icon of a gold coin", 16),
    "suit-compass-16": ("pixel art icon of a purple four pointed compass star", 16),
    "suit-flag-16": ("pixel art icon of a black flag on a pole", 16),
    "sp-pirate-24": ("pixel art icon of two crossed steel cutlasses with gold hilts", 24),
    "sp-ghost-24": ("pixel art icon of a white skull wearing a small golden crown", 24),
    "sp-mermaid-24": ("pixel art icon of a coral orange mermaid fish tail fin", 24),
    "sp-escape-24": ("pixel art icon of a plain white flag on a wooden pole", 24),
    "sp-tigress-24": ("pixel art icon of a cutlass crossed with a small white flag", 24),
    "sp-pirate-16": ("pixel art icon of two crossed swords", 16),
    "sp-ghost-16": ("pixel art icon of a white skull with a gold crown", 16),
    "sp-mermaid-16": ("pixel art icon of an orange fish tail", 16),
    "sp-escape-16": ("pixel art icon of a white flag on a pole", 16),
    "sp-tigress-16": ("pixel art icon of a sword and a white flag crossed", 16),
    "ic-hit": ("pixel art icon of a small open treasure chest with shining gold coins", 32),
    "ic-miss": ("pixel art icon of an exploding gunpowder barrel keg with orange fire and black smoke", 32),
    "ic-bid": ("pixel art icon of a rolled parchment scroll sealed with a red wax seal", 32),
    "ic-trick": ("pixel art icon of a small stack of playing cards tied with a rope, face down, brown backs", 32),
    "ic-score": ("pixel art icon of a pile of gold coins", 32),
}
for k, (d, sz) in V2.items():
    JOBS.append((k, "/generate-image-v2", {"description": f"{d}, {OUTL}", "image_size": {"width": sz, "height": sz},
                 "no_background": True, "seed": 900 + len(JOBS)}))


def run(job):
    name, ep, body = job
    try:
        if ep == "/generate-image-v2":
            if (OUT / name / f"{name}.png").exists():
                return name, "skip"
            return name, len(px.generate_async(name, body, OUT / name, endpoint=ep))
        if (OUT / f"{name}.png").exists():
            return name, "skip"
        ep2 = ep
        return name, str(px.generate_image(name, body, OUT, endpoint=ep2).name)
    except Exception as e:
        return name, f"ERR {str(e)[:200]}"


if __name__ == "__main__":
    want = sys.argv[1:]
    jobs = [j for j in JOBS if not want or any(j[0].startswith(w) for w in want)]
    jobs.sort(key=lambda j: 0 if j[1] != "/create-image-pixflux" else 1)  # 慢的先提交
    print("jobs", len(jobs), flush=True)
    with ThreadPoolExecutor(max_workers=10) as pool:
        for n, r in pool.map(run, jobs):
            print(n, r, flush=True)
    print("全部完成", flush=True)
