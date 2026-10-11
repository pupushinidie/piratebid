"""画廊：生成放大预览图 + 拍板 JSON（~/projects/pipeline/games/piratebid/assets/gallery-decision.json，不阻塞）。"""
import json, pathlib, sys
from PIL import Image, ImageDraw
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import cards
ART = pathlib.Path(__file__).parent
G = ART / "out" / "gallery"
G.mkdir(parents=True, exist_ok=True)
SEL = json.loads((ART / "selection.json").read_text())
DEC = pathlib.Path.home() / "projects/pipeline/games/piratebid/assets/gallery-decision.json"


def up(path, sc, name):
    im = Image.open(ART / path).convert("RGBA")
    im = im.resize((im.width * sc, im.height * sc), Image.NEAREST)
    bg = Image.new("RGBA", im.size, (40, 28, 20, 255)); bg.alpha_composite(im)
    p = G / f"{name}.png"; bg.convert("RGB").save(p); return str(p)


def card_prev(cid, art_path, name):
    art = Image.open(ART / art_path).convert("RGBA")
    c = cards.special_card(cid, art=art).resize((256, 384), Image.NEAREST)
    bg = Image.new("RGBA", (264, 392), (40, 28, 20, 255)); bg.alpha_composite(c, (4, 4))
    p = G / f"{name}.png"; bg.convert("RGB").save(p); return str(p)


def icon_set(paths, name, sc=4):
    ims = [Image.open(ART / p).convert("RGBA") for p in paths]
    cell = max(max(i.size) for i in ims) * sc + 12
    W = Image.new("RGB", (cell * len(ims), cell * 2), (0, 0, 0))
    for k, im in enumerate(ims):
        big = im.resize((im.width * sc, im.height * sc), Image.NEAREST)
        for r, bg in enumerate([(40, 28, 20), (250, 246, 236)]):
            W.paste(bg, (k * cell, r * cell, k * cell + cell - 2, r * cell + cell - 2))
            W.paste(big, (k * cell + (cell - big.width) // 2, r * cell + (cell - big.height) // 2), big)
    p = G / f"{name}.png"; W.save(p); return str(p)


Q = []


def q(qid, question, opts, help=None):
    item = {"id": qid, "type": "choice", "question": question, "options": opts, "allowOther": True, "required": False}
    if help:
        item["help"] = help
    Q.append(item)


def opt(value, label, desc, images, rec=False):
    o = {"value": value, "label": label, "description": desc, "images": images}
    if rec:
        o["recommended"] = True
    return o


def cand_label(p):
    return pathlib.Path(p).stem


mock = ART / "out" / "mock"
q("overview", "整体效果（牌桌示意图：夜间、白天、手机）", [
    opt("ok", "就这样", "暖色船长舱：羊皮纸数字牌（四花色颜色+图形+黑旗深底三重区分）、特殊牌各有牌框颜色和左上角标。示意图是我拼的，不是界面",
        [str(mock / "table-night.png"), str(mock / "table-day.png"), str(mock / "phone-night.png")], True),
    opt("redo", "整体风格要改", "在「其他」里写想怎么改", [])])

# 场景
for t, label in (("night", "牌桌背景（夜间）"), ("day", "牌桌背景（白天）")):
    s = SEL[f"bg-{t}"]
    opts = [opt("fixed", "推荐", s["why"], [up(s["file"], 2, f"bg-{t}-pick")], True)]
    for c in s["candidates"]:
        if t == "night" and "s401" in c or t == "day" and "s413" in c:
            continue
        opts.append(opt(cand_label(c), cand_label(c), "备选", [up(c, 2, cand_label(c))]))
    q(f"bg-{t}", label, opts)

# 特殊牌
NAMES = {"ghost": "鬼船长", "mermaid-1": "美人鱼 1", "mermaid-2": "美人鱼 2", "tigress": "双面海盗", "escape": "白旗",
         "pirate-1": "海盗 1", "pirate-2": "海盗 2", "pirate-3": "海盗 3", "pirate-4": "海盗 4", "pirate-5": "海盗 5"}
NOTE = {"c2-mermaid1-s1111": "不推荐：红棕发+紫贝壳，像艾丽儿"}
for cid, nm in NAMES.items():
    s = SEL[f"card-{cid}"]
    opts = []
    for c in s["candidates"]:
        st = cand_label(c)
        rec = c == s["file"]
        desc = s["why"] if rec else NOTE.get(st, "第 1 轮（自带画框，合成时外框会叠两层）" if "/card-" in c else "备选")
        opts.append(opt(st, ("推荐 " if rec else "") + st, desc, [card_prev(cid, c, f"card-{cid}-{st}")], rec))
    q(f"card-{cid}", f"{nm} 牌面", opts)

# 牌背
s = SEL["back"]
opts = []
for c in s["candidates"]:
    st = cand_label(c); rec = c == s["file"]
    art = Image.open(ART / c).convert("RGBA")
    card = cards.base_card(128, 192, cards.hx("#4a2a16"), cards.hx("#6e4024"), 6); card.alpha_composite(art, (6, 6))
    p = G / f"back-{st}.png"; card.resize((256, 384), Image.NEAREST).save(p)
    opts.append(opt(st, ("推荐 " if rec else "") + st, s["why"] if rec else "备选", [str(p)], rec))
q("back", "牌背", opts)

# 花色大图样
for suit, nm in (("seaweed", "海藻"), ("coin", "金币"), ("compass", "罗盘"), ("flag", "黑旗")):
    s = SEL[f"emb-{suit}"]
    q(f"emb-{suit}", f"{nm}花色的中心图样（数字牌正中）",
      [opt(cand_label(c), ("推荐 " if c == s["file"] else "") + cand_label(c), s["why"] if c == s["file"] else "备选", [up(c, 4, cand_label(c))], c == s["file"]) for c in s["candidates"]])

# 小图标成套
def sets(keys, qid, title):
    picks = [SEL[k]["file"] for k in keys]
    alt1 = [SEL[k]["candidates"][1] for k in keys]
    alt2 = [SEL[k]["candidates"][2] for k in keys]
    q(qid, title, [opt("pick", "推荐这一套", "；".join(f"{k}：{SEL[k]['why']}" for k in keys[:1]) + " 等，每个都是 64 个候选里挑的", [icon_set(picks, qid + "-pick")], True),
                   opt("alt1", "备选一套", "每样换成第二候选", [icon_set(alt1, qid + "-alt1")]),
                   opt("alt2", "备选另一套", "每样换成第三候选", [icon_set(alt2, qid + "-alt2")])],
      help="上排深色底、下排白底。想单换某一个，在「其他」里写，比如「金币换备选一套的」")
sets([f"suit-{s}-24" for s in ("seaweed", "coin", "compass", "flag")], "suit-24", "花色小图标 24px（牌角、领出花色提示）")
sets([f"suit-{s}-16" for s in ("seaweed", "coin", "compass", "flag")], "suit-16", "花色小图标 16px（手机小牌）")
sets([f"sp-{k}-24" for k in ("pirate", "tigress", "ghost", "mermaid", "escape")], "sp-24", "特殊牌角标 24px（牌角、记牌辅助）")
sets([f"sp-{k}-16" for k in ("pirate", "tigress", "ghost", "mermaid", "escape")], "sp-16", "特殊牌角标 16px")
sets([f"ic-{k}" for k in ("hit", "miss", "bid", "trick", "score")], "ui-icons", "界面图标：叫中 / 叫爆 / 已叫墩 / 赢墩 / 分数")

# 头像
crew = [SEL[f"crew-{i}"] for i in range(1, 9)]
q("crew", "8 个船员头像", [
    opt("pick", "推荐这一套", "猫、鹦鹉、猴子、斗牛犬、浣熊、老海龟、螃蟹、海豹，每种三个候选里挑脸更大的", [icon_set([c["file"] for c in crew], "crew-pick", 2)], True),
    opt("alt", "另一套", "每种换成另一个候选", [icon_set([[x for x in c["candidates"] if x != c["file"]][0] for c in crew], "crew-alt", 2)]),
    opt("alt2", "第三套", "每种换成第三个候选", [icon_set([[x for x in c["candidates"] if x != c["file"]][1] for c in crew], "crew-alt2", 2)])])
s = SEL["ava-ghost"]
q("ava-ghost", "2 人局的幽灵水手头像", [opt(cand_label(c), ("推荐 " if c == s["file"] else "") + cand_label(c), s["why"] if c == s["file"] else "备选", [up(c, 4, cand_label(c))], c == s["file"]) for c in s["candidates"]])
s = SEL["winner"]
q("winner", "结算画面赢家宝箱", [opt(cand_label(c), ("推荐 " if c == s["file"] else "") + cand_label(c), s["why"] if c == s["file"] else "备选", [up(c, 4, cand_label(c))], c == s["file"]) for c in s["candidates"]])

# 动画
for cid, nm in (("ghost", "鬼船长"), ("mermaid-1", "美人鱼"), ("escape", "白旗")):
    s = SEL[f"anim-{cid}"]
    q(f"anim-{cid}", f"{nm}牌的待机动画（出牌区循环播）",
      [opt(pathlib.Path(c).parent.name, ("推荐 " if pathlib.Path(c).parent.name in s["file"] else "") + pathlib.Path(c).parent.name,
           s["why"] if pathlib.Path(c).parent.name in s["file"] else "备选", [str(ART / c)], pathlib.Path(c).parent.name in s["file"]) for c in s["candidates"]])

# 封面
cov = ART / "out" / "covers"
q("cover", "大厅封面", [
    opt("cover-1", "推荐 戴金冠的骷髅和金币堆", "鬼船长的意思最直接，暖色烛光和牌桌一致，铺满画面", [str(cov / "cover-1.png")], True),
    opt("cover-2", "夜海上的海盗船", "船尾窗户透出暖光，最有气氛，但和打牌关系远一点", [str(cov / "cover-2.png")]),
    opt("cover-3", "船长桌上的宝箱和藏宝图", "最像牌桌，但物件偏小（上下黑边已裁掉，384×162）", [str(cov / "cover-3.png")])])

dec = {"id": "art-gallery", "title": "海盗叫墩 美术画廊（我已挑好，可随时改）", "stage": "art", "blocking": False,
       "intro": "正式美术已经按「暖色船长舱」做完，**每样都标了我挑的推荐**，不用答也会按推荐上线。想换哪张就选别的，或者在「其他」里写想怎么改。\n\n"
                "数字牌的数字、角标都是代码画的；特殊牌每种有自己的牌框颜色（海盗暗红、鬼船长金、美人鱼海青、白旗灰白、双面海盗左红右白）。",
       "questions": Q}
DEC.write_text(json.dumps(dec, ensure_ascii=False, indent=1))
print(len(Q), "题")
