/**
 * 规则书各章节的场景测试（测试名带「§章节」）：精确局面 → 精确结果。
 */
import { describe, expect, it } from "vitest";
import {
  advance,
  apply,
  bids,
  bonusTotal,
  buildGame,
  createGame,
  createRng,
  DECK,
  defaultBid,
  GHOST_ID,
  legalActions,
  pendingActors,
  play,
  playedThisRound,
  redactGameForViewer,
  roundScore,
  safestPlay,
  scene,
  script,
  SCENE_NAMES,
  stepKey,
  timeoutStep,
  trickBonus,
  trickWinner,
  type GameState,
  type PlayedCard,
} from "../src/index.js";

const rng = () => createRng(3);
const P = (by: string, card: string, as?: "pirate" | "escape"): PlayedCard => (as ? { by, card, as } : { by, card });

/** 局面里所有牌：手牌 + 幽灵 + 没发的 + 打完的墩 + 当前墩（trickEnd 时当前墩已记进 tricks）。 */
function allCards(state: GameState): string[] {
  return [
    ...Object.values(state.hands).flat(),
    ...state.ghostQueue,
    ...state.undealt,
    ...state.tricks.flatMap((trick) => trick.plays.map((entry) => entry.card)),
    ...(state.phase === "play" ? state.trick.map((entry) => entry.card) : []),
  ];
}

describe("§2 配件和发牌", () => {
  it("2–8 人开局：每人手牌互不重复，加上幽灵和没发的正好 70 张", () => {
    for (let count = 2; count <= 8; count += 1) {
      const state = createGame(Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `n${index}` })), 99);
      const cards = allCards(state);
      expect(cards).toHaveLength(70);
      expect(new Set(cards).size).toBe(70);
      expect(state.handSize).toBe(1);
    }
  });
  it("§2.4 8 人第 9 轮每人 8 张、没发的 6 张；2 人第 10 轮 10 张 + 幽灵 10 张、没发的 40 张", () => {
    const eight = buildGame({ players: 8, round: 9 });
    expect(Object.values(eight.hands).every((hand) => hand.length === 8)).toBe(true);
    expect(eight.undealt).toHaveLength(6);
    const two = buildGame({ players: 2, round: 10 });
    expect(two.hands.p1).toHaveLength(10);
    expect(two.ghostQueue).toHaveLength(10);
    expect(two.undealt).toHaveLength(40);
  });
});

describe("§3 开局", () => {
  it("所有人 0 分、第 1 轮叫墩；同一种子开局一样，首位玩家在座位里", () => {
    const players = [1, 2, 3, 4].map((n) => ({ id: `p${n}`, name: `n${n}` }));
    const a = createGame(players, 1234);
    const b = createGame(players, 1234);
    expect(a.hands).toEqual(b.hands);
    expect(a.players.every((player) => player.score === 0)).toBe(true);
    expect(a.phase).toBe("bid");
    expect(players.map((player) => player.id)).toContain(a.firstPlayer);
  });
  it("首位玩家是随机的（不同种子会落到不同的人）", () => {
    const players = [1, 2, 3, 4].map((n) => ({ id: `p${n}`, name: `n${n}` }));
    const firsts = new Set(Array.from({ length: 40 }, (_, seed) => createGame(players, seed).firstPlayer));
    expect(firsts.size).toBe(4);
  });
});

describe("§4.1 叫墩（同时、暗中）", () => {
  it("亮出前别人只看到「已提交」，看不到数字；自己的能看到", () => {
    const state = script(buildGame({ players: 3, round: 3 }), [[0, { type: "BID", n: 2 }]]);
    const other = redactGameForViewer(state, "p2");
    expect(other.players[0]!.bidSubmitted).toBe(true);
    expect(other.players[0]!.bid).toBeNull();
    expect(redactGameForViewer(state, "p1").players[0]!.bid).toBe(2);
    expect(redactGameForViewer(state, "").players[0]!.bid).toBeNull();
  });
  it("最后一人提交时一起亮出，事件里带全部叫墩，之后全部公开", () => {
    const state = script(buildGame({ players: 3, round: 3 }), bids([2, 0, 3]));
    expect(state.events.find((event) => event.type === "BidsRevealed")).toEqual({ type: "BidsRevealed", bids: { p1: 2, p2: 0, p3: 3 } });
    expect(redactGameForViewer(state, "p2").players.map((player) => player.bid)).toEqual([2, 0, 3]);
  });
  it("叫墩阶段的计时 key 不因别人提交、撤回而变", () => {
    const start = buildGame({ players: 3, round: 3 });
    const key = stepKey(start);
    const later = script(start, [[0, { type: "BID", n: 1 }], [1, { type: "BID", n: 1 }], [0, { type: "UNBID" }]]);
    expect(stepKey(later)).toBe(key);
    expect(pendingActors(later).sort()).toEqual(["p1", "p3"]);
  });
  it("提交后再叫一次可以改数", () => {
    const state = script(buildGame({ players: 3, round: 3 }), [[0, { type: "BID", n: 1 }], [0, { type: "BID", n: 3 }]]);
    expect(state.players[0]!.bid).toBe(3);
  });
});

describe("§4.2 出牌顺序", () => {
  const start = () => script(buildGame({ players: 3, round: 2, firstSeat: 1, hands: [["coin-3", "flag-2"], ["coin-9", "seaweed-1"], ["coin-5", "seaweed-7"]] }), bids([1, 1, 0]));
  it("第 1 墩由首位玩家领出，顺时针轮流；没轮到的人出牌被拒绝", () => {
    const state = start();
    expect(state.turn).toBe("p2");
    expect(() => apply(state, "p1", { type: "PLAY", card: "coin-3" }, rng())).toThrow();
    const after = script(state, [play(1, "coin-9")]);
    expect(after.turn).toBe("p3");
  });
  it("每一墩由上一墩赢家领出；手里没有的牌不能出", () => {
    const state = script(start(), [play(1, "seaweed-1"), play(2, "seaweed-7"), play(0, "flag-2"), "advance"]);
    expect(state.tricks[0]!.winner).toBe("p1");
    expect(state.leader).toBe("p1");
    expect(state.turn).toBe("p1");
    expect(() => apply(state, "p1", { type: "PLAY", card: "coin-9" }, rng())).toThrow();
  });
});

describe("§4.3 跟花色", () => {
  const state = () => script(buildGame({ players: 3, round: 3, firstSeat: 0, hands: [["coin-8", "seaweed-1", "escape-1"], ["coin-2", "flag-14", "mermaid-1"], ["seaweed-5", "flag-1", "pirate-3"]] }), [...bids([1, 1, 1]), play(0, "coin-8")]);
  it("有领出花色时不能垫别的数字牌（服务器拒绝）", () => {
    expect(() => apply(state(), "p2", { type: "PLAY", card: "flag-14" }, rng())).toThrow("要跟");
  });
  it("特殊牌随时能出；跟花色可以出小的（没有必须压过的规定）", () => {
    expect(() => apply(state(), "p2", { type: "PLAY", card: "mermaid-1" }, rng())).not.toThrow();
    expect(() => apply(state(), "p2", { type: "PLAY", card: "coin-2" }, rng())).not.toThrow();
  });
  it("没有领出花色的牌就随便出，可以用黑旗压", () => {
    const next = script(state(), [play(1, "coin-2")]);
    expect(legalActions(next, "p3")).toHaveLength(3);
    const done = script(next, [play(2, "flag-1")]);
    expect(done.tricks[0]!.winner).toBe("p3");
  });
});

describe("§4.4 判定赢家（七条按顺序）", () => {
  it("① 美人鱼和鬼船长同在 → 最先出的美人鱼（有海盗也一样）", () => {
    expect(trickWinner([P("a", "pirate-1"), P("b", "mermaid-2"), P("c", "captain"), P("d", "mermaid-1")])).toBe(1);
  });
  it("② 鬼船长压所有海盗", () => expect(trickWinner([P("a", "pirate-1"), P("b", "captain"), P("c", "tigress", "pirate")])).toBe(1));
  it("③ 先出的海盗赢，当海盗的双面海盗也算", () => {
    expect(trickWinner([P("a", "flag-14"), P("b", "tigress", "pirate"), P("c", "pirate-2")])).toBe(1);
  });
  it("④ 只有美人鱼和数字牌 → 先出的美人鱼", () => expect(trickWinner([P("a", "flag-14"), P("b", "mermaid-1"), P("c", "mermaid-2")])).toBe(1));
  it("⑤ 黑旗里最大的", () => expect(trickWinner([P("a", "coin-14"), P("b", "flag-3"), P("c", "flag-9"), P("d", "flag-1")])).toBe(2));
  it("⑥ 领出花色里最大的，别的普通花色 14 也算输", () => {
    expect(trickWinner([P("a", "compass-2"), P("b", "seaweed-14"), P("c", "compass-5")])).toBe(2);
  });
  it("⑦ 全是白旗类 → 第一张；当白旗的双面海盗领出时它的主人赢", () => {
    expect(trickWinner([P("a", "tigress", "escape"), P("b", "escape-1")])).toBe(0);
    expect(trickWinner([P("a", "escape-2"), P("b", "escape-1"), P("c", "escape-3")])).toBe(0);
  });
});

describe("§4.5 隐藏信息（redactGameForViewer）", () => {
  const states = () => [scene("bid-partial"), scene("play-follow"), scene("trick-bonus"), scene("round-end"), scene("ghost-play"), scene("max8-play")];
  it("每个玩家视角：别人的手牌、幽灵的牌、没发的牌、种子都拿不到（整份 JSON 里搜不到这些牌）", () => {
    for (const state of states()) {
      for (const viewer of state.players) {
        const view = redactGameForViewer(state, viewer.id);
        const json = JSON.stringify(view);
        expect(view.hands[viewer.id]).toEqual(state.hands[viewer.id]);
        expect(view.ghostQueue).toEqual([]);
        expect(view.undealt).toEqual([]);
        expect(json).not.toMatch(/"seed"|"rngState"|"log"/);
        const secret = [
          ...state.players.filter((player) => player.id !== viewer.id).flatMap((player) => state.hands[player.id] ?? []),
          ...state.ghostQueue,
          ...state.undealt,
        ];
        for (const card of secret) expect(json.includes(`"${card}"`), `${viewer.id} 看到了 ${card}`).toBe(false);
        expect(view.handCounts).toEqual(state.handCounts);
      }
    }
  });
  it("观战（只看公开）谁的手牌都看不到；上帝视角能看手牌，但幽灵的牌、没发的牌、种子照样看不到", () => {
    for (const state of states()) {
      const spectator = redactGameForViewer(state, "");
      expect(Object.values(spectator.hands).every((hand) => hand.length === 0)).toBe(true);
      const god = redactGameForViewer(state, "", { seeAll: true });
      expect(god.hands).toEqual(state.hands);
      expect(god.ghostQueue).toEqual([]);
      expect(god.undealt).toEqual([]);
      expect(JSON.stringify(god)).not.toMatch(/"seed"|"rngState"/);
    }
  });
  it("出到桌上的牌、双面海盗的声明、每人赢的墩、累计分都公开", () => {
    const state = scene("trick-bonus");
    const view = redactGameForViewer(state, "p2");
    expect(view.tricks).toEqual(state.tricks);
    expect(view.players.map((player) => [player.won, player.score])).toEqual(state.players.map((player) => [player.won, player.score]));
  });
});

describe("§5 特殊情况和边界", () => {
  it("5.1 全是白旗：领出白旗的人赢这墩（计为赢墩），没有奖励", () => {
    const state = script(buildGame({ players: 3, round: 1, hands: [["escape-1"], ["escape-2"], ["tigress"]] }), [...bids([0, 0, 0]), play(0, "escape-1"), play(1, "escape-2"), play(2, "tigress", "escape"), "advance"]);
    expect(state.tricks[0]!.winner).toBe("p1");
    expect(state.history[0]!.results.map((entry) => entry.points)).toEqual([-10, 10, 10]);
  });
  it("5.2 白旗领出后第二张是角色牌：本墩没有花色，后面随便出（开工拍板）", () => {
    const state = script(buildGame({ players: 3, round: 2, hands: [["escape-1", "coin-1"], ["pirate-1", "coin-2"], ["seaweed-13", "coin-3"]] }), [...bids([0, 1, 1]), play(0, "escape-1"), play(1, "pirate-1")]);
    expect(legalActions(state, "p3")).toHaveLength(2);
  });
  it("5.3 白旗 → 白旗 → 第三人定花色", () => {
    const state = script(buildGame({ players: 4, round: 2, hands: [["escape-1", "coin-1"], ["escape-2", "coin-2"], ["seaweed-13", "coin-3"], ["seaweed-1", "compass-4"]] }), [...bids([0, 0, 1, 1]), play(0, "escape-1"), play(1, "escape-2"), play(2, "seaweed-13")]);
    expect(legalActions(state, "p4")).toEqual([{ type: "PLAY", card: "seaweed-1" }]);
  });
  it("5.4 多张海盗：先出的赢，含先出的双面海盗", () => {
    expect(trickWinner([P("a", "pirate-1"), P("b", "tigress", "pirate"), P("c", "pirate-4")])).toBe(0);
    expect(trickWinner([P("a", "coin-1"), P("b", "tigress", "pirate"), P("c", "pirate-4")])).toBe(1);
  });
  it("5.5 两张美人鱼 + 鬼船长：先出的美人鱼拿 40，后出的不额外加分", () => {
    const trick = [P("a", "mermaid-2"), P("b", "captain"), P("c", "mermaid-1")];
    expect(trickWinner(trick)).toBe(0);
    expect(trickBonus(trick, 0)).toEqual([{ kind: "mermaidCaptain", points: 40, card: "captain" }]);
  });
  it("5.6 海盗领出 → 鬼船长后出照样赢", () => expect(trickWinner([P("a", "pirate-1"), P("b", "coin-3"), P("c", "captain")])).toBe(2));
  it("5.7 总叫墩可以大于墩数", () => {
    const state = script(buildGame({ players: 3, round: 2 }), bids([2, 2, 2]));
    expect(state.phase).toBe("play");
  });
  it("5.10 最后一墩的赢家不影响下一轮谁先出", () => {
    let state = script(buildGame({ players: 3, round: 1, firstSeat: 0, hands: [["coin-1"], ["coin-2"], ["coin-14"]] }), [...bids([0, 0, 1]), play(0, "coin-1"), play(1, "coin-2"), play(2, "coin-14"), "advance"]);
    expect(state.tricks[0]!.winner).toBe("p3");
    state = script(state, [[0, { type: "CONTINUE" }], [1, { type: "CONTINUE" }], [2, { type: "CONTINUE" }]]);
    expect(state.round).toBe(2);
    expect(state.firstPlayer).toBe("p2");
  });
  it("5.13 一墩里 14 奖励和角色奖励累加", () => {
    const trick = [P("a", "seaweed-14"), P("b", "pirate-1"), P("c", "mermaid-1"), P("d", "flag-14")];
    expect(bonusTotal(trickBonus(trick, trickWinner(trick)))).toBe(10 + 20 + 20);
  });
});

describe("§6 计分", () => {
  it("6.1 叫错时赢下墩里的奖励全部作废（lostBonus 记下）", () => {
    // 你叫 1 却赢了 2 墩，其中一墩有黑旗 14
    const state = script(buildGame({ players: 3, round: 2, firstSeat: 0, hands: [["flag-14", "coin-13"], ["coin-1", "seaweed-2"], ["coin-2", "seaweed-3"]] }), [
      ...bids([1, 0, 0]),
      play(0, "flag-14"), play(1, "coin-1"), play(2, "coin-2"), "advance",
      play(0, "coin-13"), play(1, "seaweed-2"), play(2, "seaweed-3"), "advance",
    ]);
    const me = state.history[0]!.results[0]!;
    expect(me).toMatchObject({ bid: 1, won: 2, bidPoints: -10, bonus: 0, lostBonus: 20, points: -10 });
    expect(state.history[0]!.results.slice(1).map((entry) => entry.points)).toEqual([20, 20]);
  });
  it("6.2 叫 0 叫中 +10×张数；叫 0 吃墩 −10×张数", () => {
    expect(roundScore(0, 0, 5, 0)).toBe(50);
    expect(roundScore(0, 3, 5, 0)).toBe(-50);
  });
  it("6.4 例 1（4 人第 5 轮）：甲 80、乙 50、丙 −10、丁 −10", () => {
    const jia = 20 * 2 + bonusTotal(trickBonus([P("x", "pirate-1"), P("y", "mermaid-1")], 0)) + bonusTotal(trickBonus([P("x", "flag-14"), P("y", "flag-2")], 0));
    expect(roundScore(2, 2, 5, jia - 40)).toBe(80);
    expect(roundScore(0, 0, 5, 0)).toBe(50);
    expect(roundScore(2, 3, 5, 10)).toBe(-10);
    expect(roundScore(1, 0, 5, 0)).toBe(-10);
  });
  it("6.4 例 2（8 人第 9 轮发 8 张）：叫 0 叫中 +80、叫 0 吃 2 墩 −80；叫 3 中 3 含鬼船长抓 2 海盗和罗盘 14 → 130", () => {
    expect(roundScore(0, 0, 8, 0)).toBe(80);
    expect(roundScore(0, 2, 8, 0)).toBe(-80);
    const trick = [P("a", "captain"), P("b", "pirate-1"), P("c", "pirate-2"), P("d", "compass-14")];
    expect(roundScore(3, 3, 8, bonusTotal(trickBonus(trick, trickWinner(trick))))).toBe(130);
  });
  it("6.4 例 2 用真实一轮：8 人第 9 轮叫 0 叫中得 +80（不是 +90）", () => {
    let state = buildGame({ players: 8, round: 9 });
    state = script(state, bids([0, 0, 0, 0, 0, 0, 0, 0]));
    const r = rng();
    while (state.phase === "play" || state.phase === "trickEnd") {
      state = state.phase === "trickEnd" ? advance(state, r).state : apply(state, state.turn!, safestPlay(state, state.turn!), r).state;
    }
    for (const entry of state.history[0]!.results) expect(entry.points).toBe(entry.won === 0 ? 80 : -80);
  });
});

describe("§7 结束与胜负", () => {
  it("10 轮后结束，最高分获胜；结束后不能再操作", () => {
    const state = scene("final");
    expect(state.phase).toBe("finished");
    expect(state.history).toHaveLength(10);
    const best = Math.max(...state.players.map((player) => player.score));
    expect(state.finalResult!.winners).toEqual(state.players.filter((player) => player.score === best).map((player) => player.id));
    for (const player of state.players) expect(player.score).toBe(state.history.reduce((sum, round) => sum + round.results.find((entry) => entry.player === player.id)!.points, 0));
    expect(() => apply(state, "p1", { type: "CONTINUE" }, rng())).toThrow();
  });
  it("并列的人都算赢（开工拍板）", () => {
    const state = scene("final-tie");
    expect(state.finalResult!.winners).toEqual(["p1", "p2"]);
  });
});

describe("§8.1 2 人局幽灵水手", () => {
  it("幽灵赢的墩里的奖励没人拿，不算任何人的赢墩", () => {
    const state = script(buildGame({ names: ["A", "B"], round: 1, firstSeat: 0, hands: [["coin-14"]], ghostQueue: ["captain"] }), [...bids([1, 0]), play(0, "coin-14")]);
    const after = script(state, [[1, { type: "PLAY", card: state.hands.p2![0]! }], "advance"]);
    expect(after.tricks[0]!.winner).toBe(GHOST_ID);
    expect(after.history[0]!.results.map((entry) => entry.won)).toEqual([0, 0]);
    expect(after.history[0]!.results[0]!.points).toBe(-10);
  });
  it("幽灵从不出现在待行动的人里", () => {
    const state = scene("ghost-play");
    expect(pendingActors(state)).toEqual(["p1"]);
  });
});

describe("§9.2 命令和阶段", () => {
  it("结算页：部分人点继续不动，全部点了才发下一轮；不在结算页时继续被拒绝", () => {
    const start = scene("round-end");
    expect(() => apply(scene("play-lead"), "p1", { type: "CONTINUE" }, rng())).toThrow();
    const one = apply(start, "p1", { type: "CONTINUE" }, rng()).state;
    expect(one.phase).toBe("roundEnd");
    expect(pendingActors(one)).toEqual(["p2", "p3", "p4"]);
    const all = script(one, [[1, { type: "CONTINUE" }], [2, { type: "CONTINUE" }], [3, { type: "CONTINUE" }]]);
    expect(all.phase).toBe("bid");
    expect(all.round).toBe(start.round + 1);
  });
  it("apply 不修改输入", () => {
    const state = scene("play-follow");
    const before = JSON.stringify(state);
    apply(state, "p1", { type: "PLAY", card: "seaweed-3" }, rng());
    expect(JSON.stringify(state)).toBe(before);
  });
  it("每一步 version +1", () => {
    const state = scene("play-lead");
    expect(apply(state, "p1", { type: "PLAY", card: "flag-12" }, rng()).state.version).toBe(state.version + 1);
  });
});

describe("§9.4 超时默认动作（没有人机时）", () => {
  it("叫墩超时：没叫的人叫 round(张数/人数)", () => {
    const start = script(buildGame({ players: 4, round: 6 }), [[0, { type: "BID", n: 5 }]]);
    const after = timeoutStep(start);
    expect(after.phase).toBe("play");
    expect(after.players.map((player) => player.bid)).toEqual([5, defaultBid(start), defaultBid(start), defaultBid(start)]);
    expect(defaultBid(start)).toBe(2);
    expect(after.events[0]).toEqual({ type: "TimedOut", players: ["p2", "p3", "p4"], phase: "bid" });
  });
  it("出牌超时：出最不可能赢的（白旗优先，双面海盗当白旗）", () => {
    const state = script(buildGame({ players: 3, round: 3, firstSeat: 0, hands: [["coin-3", "escape-2", "captain"], ["tigress", "coin-12", "flag-9"], ["coin-1", "seaweed-14", "flag-2"]] }), [...bids([1, 1, 1])]);
    expect(safestPlay(state, "p1")).toEqual({ type: "PLAY", card: "escape-2" });
    const lead = script(state, [play(0, "coin-3")]);
    expect(safestPlay(lead, "p2")).toEqual({ type: "PLAY", card: "tigress", as: "escape" });
    const third = script(lead, [play(1, "coin-12")]);
    expect(safestPlay(third, "p3")).toEqual({ type: "PLAY", card: "coin-1" });
  });
  it("trickEnd、roundEnd 超时自动推进", () => {
    expect(timeoutStep(scene("trick-end")).phase).toBe("play");
    expect(timeoutStep(scene("round-end")).phase).toBe("bid");
  });
});

describe("记牌辅助和预览工厂", () => {
  it("本轮出过的牌：trickEnd 时不重复算当前墩", () => {
    const state = scene("trick-end");
    expect(playedThisRound(state)).toHaveLength(4);
    expect(playedThisRound(scene("play-tigress"))).toHaveLength(6);
  });
  it("每个场景都能造出来，配件守恒", () => {
    for (const name of SCENE_NAMES) {
      const state = scene(name);
      const cards = allCards(state);
      expect(new Set(cards).size, name).toBe(70);
      expect(cards.every((card) => DECK.includes(card))).toBe(true);
    }
  });
  it("开房时可以关记牌辅助", () => {
    expect(buildGame({ tracker: false }).config.tracker).toBe(false);
    expect(buildGame().config.tracker).toBe(true);
  });
});
