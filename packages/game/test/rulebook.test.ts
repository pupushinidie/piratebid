/**
 * 规则书「§10 测试用例」TC1–TC13 逐条（测试名带「规则书#TCn」）。
 * 各章节的场景测试在 sections.test.ts，随机对局在 random.test.ts。
 */
import { describe, expect, it } from "vitest";
import {
  bidPoints,
  bids,
  buildGame,
  createRng,
  DECK,
  dealerOf,
  GHOST_ID,
  handSize,
  legalCards,
  play,
  roundScore,
  script,
  trickBonus,
  trickWinner,
  tutorialGame,
  withFinalScores,
  apply,
  advance,
  bonusTotal,
  type CardId,
  type PlayedCard,
  type GameState,
} from "../src/index.js";

/** 简写：一串出牌 → PlayedCard[]，by 用 s0/s1…（判赢家只看顺序）；"tigress:p" / "tigress:e" 表示双面海盗当海盗 / 白旗。 */
function plays(...cards: string[]): PlayedCard[] {
  return cards.map((entry, index) => {
    const [card, as] = entry.split(":");
    return as ? { by: `s${index}`, card: card!, as: as === "p" ? "pirate" : "escape" } : { by: `s${index}`, card: card! };
  });
}

function bonusOf(trick: PlayedCard[]): number {
  return bonusTotal(trickBonus(trick, trickWinner(trick)));
}

const rng = () => createRng(1);

describe("规则书#TC1 牌组", () => {
  it("70 张：四花色 1–14 + 海盗×5、双面海盗、鬼船长、美人鱼×2、白旗×5，没有重复", () => {
    expect(DECK).toHaveLength(70);
    expect(new Set(DECK).size).toBe(70);
    for (const suit of ["seaweed", "coin", "compass", "flag"]) {
      expect(DECK.filter((card) => card.startsWith(`${suit}-`))).toHaveLength(14);
    }
    expect(DECK.filter((card) => card.startsWith("pirate-"))).toHaveLength(5);
    expect(DECK.filter((card) => card === "tigress")).toHaveLength(1);
    expect(DECK.filter((card) => card === "captain")).toHaveLength(1);
    expect(DECK.filter((card) => card.startsWith("mermaid-"))).toHaveLength(2);
    expect(DECK.filter((card) => card.startsWith("escape-"))).toHaveLength(5);
  });
});

describe("规则书#TC2 手牌数", () => {
  it("3–7 手时第 r 轮发 r 张；8 手时第 8–10 轮发 8 张；2 人局（3 手）第 10 轮 10 张", () => {
    for (let hands = 3; hands <= 7; hands += 1) for (let round = 1; round <= 10; round += 1) expect(handSize(round, hands)).toBe(round);
    expect(handSize(8, 8)).toBe(8);
    expect(handSize(9, 8)).toBe(8);
    expect(handSize(10, 8)).toBe(8);
    expect(handSize(10, 3)).toBe(10);
  });
  it("7 人第 10 轮发完 undealt 为空", () => {
    const state = buildGame({ players: 7, round: 10 });
    expect(state.handSize).toBe(10);
    expect(state.undealt).toHaveLength(0);
  });
});

/** 把一整轮用最安全的默认动作打完并进到下一轮。 */
function finishRound(state: GameState): GameState {
  let current = state;
  const r = rng();
  for (let guard = 0; guard < 500; guard += 1) {
    if (current.phase === "bid") {
      const id = current.players.find((player) => !player.bidSubmitted)!.id;
      current = apply(current, id, { type: "BID", n: 0 }, r).state;
    } else if (current.phase === "play") {
      const id = current.turn!;
      const card = legalCards(current.hands[id]!, current.trick)[0]!;
      current = apply(current, id, card === "tigress" ? { type: "PLAY", card, as: "escape" } : { type: "PLAY", card }, r).state;
    } else if (current.phase === "trickEnd") {
      current = advance(current, r).state;
    } else return current;
  }
  throw new Error("打不完");
}

function nextRound(state: GameState): GameState {
  let current = finishRound(state);
  const r = rng();
  for (const player of current.players) current = apply(current, player.id, { type: "CONTINUE" }, r).state;
  return current;
}

describe("规则书#TC3 首位玩家轮转", () => {
  it("4 人：第 1 轮庄家座位 3 → 首位 0；第 2 轮首位 1；第 3 轮首位 2；第 5 轮首位 0", () => {
    let state = buildGame({ players: 4, firstSeat: 0 });
    expect(dealerOf(state)).toBe("p4");
    expect(state.firstPlayer).toBe("p1");
    state = nextRound(state);
    expect(state.round).toBe(2);
    expect(dealerOf(state)).toBe("p1");
    expect(state.firstPlayer).toBe("p2");
    state = nextRound(state);
    expect(state.firstPlayer).toBe("p3");
    state = nextRound(nextRound(state));
    expect(state.round).toBe(5);
    expect(state.firstPlayer).toBe("p1");
  });
});

describe("规则书#TC4 跟花色合法性", () => {
  it("领出海藻 7，手牌 {海藻 2, 黑旗 9, 金币 14, 海盗} → {海藻 2, 海盗}", () => {
    expect(legalCards(["seaweed-2", "flag-9", "coin-14", "pirate-1"], plays("seaweed-7")).sort()).toEqual(["pirate-1", "seaweed-2"]);
  });
  it("领出海藻 7，手牌 {黑旗 9, 金币 14, 白旗} → 全部合法", () => {
    expect(legalCards(["flag-9", "coin-14", "escape-1"], plays("seaweed-7"))).toHaveLength(3);
  });
  it("领出黑旗 5，手牌 {黑旗 1, 海藻 14, 美人鱼} → {黑旗 1, 美人鱼}", () => {
    expect(legalCards(["flag-1", "seaweed-14", "mermaid-1"], plays("flag-5")).sort()).toEqual(["flag-1", "mermaid-1"]);
  });
  it("领出海盗，手牌 {海藻 2, 黑旗 9} → 全部合法", () => {
    expect(legalCards(["seaweed-2", "flag-9"], plays("pirate-1"))).toHaveLength(2);
  });
});

describe("规则书#TC5 白旗领出定花色", () => {
  it("白旗 → 罗盘 6，第 3 人 {罗盘 2, 海藻 14, 白旗} → {罗盘 2, 白旗}", () => {
    expect(legalCards(["compass-2", "seaweed-14", "escape-3"], plays("escape-1", "compass-6")).sort()).toEqual(["compass-2", "escape-3"]);
  });
  it("白旗 → 罗盘 6 → 罗盘 9 → 海藻 14：罗盘 9 赢，海藻 14 是垫的；这墩有 +10", () => {
    const trick = plays("escape-1", "compass-6", "compass-9", "seaweed-14");
    expect(trickWinner(trick)).toBe(2);
    expect(bonusOf(trick)).toBe(10);
  });
  it("白旗 → 白旗 → 金币 3：第三人定花色为金币", () => {
    expect(legalCards(["coin-1", "seaweed-5"], plays("escape-1", "escape-2", "coin-3"))).toEqual(["coin-1"]);
  });
  it("白旗 → 海盗 → 第 3 人 {海藻 13, 金币 1} 全部合法，海盗赢", () => {
    expect(legalCards(["seaweed-13", "coin-1"], plays("escape-1", "pirate-1"))).toHaveLength(2);
    expect(trickWinner(plays("escape-1", "pirate-1", "seaweed-13"))).toBe(1);
  });
});

describe("规则书#TC6 数字牌比大小", () => {
  it("金币 12 → 金币 5 → 黑旗 2：黑旗 2 赢", () => expect(trickWinner(plays("coin-12", "coin-5", "flag-2"))).toBe(2));
  it("金币 12 → 金币 5 → 罗盘 14：金币 12 赢", () => expect(trickWinner(plays("coin-12", "coin-5", "compass-14"))).toBe(0));
  it("海藻 10 → 黑旗 3 → 黑旗 8：黑旗 8 赢", () => expect(trickWinner(plays("seaweed-10", "flag-3", "flag-8"))).toBe(2));
});

describe("规则书#TC7 角色牌克制", () => {
  it("海盗 → 鬼船长 → 美人鱼：美人鱼赢，奖励只有 +40", () => {
    const trick = plays("pirate-1", "captain", "mermaid-1");
    expect(trickWinner(trick)).toBe(2);
    expect(bonusOf(trick)).toBe(40);
  });
  it("美人鱼 → 海盗 → 鬼船长：美人鱼赢，+40", () => {
    const trick = plays("mermaid-1", "pirate-1", "captain");
    expect(trickWinner(trick)).toBe(0);
    expect(bonusOf(trick)).toBe(40);
  });
  it("海盗(A) → 美人鱼 → 海盗(B)：A 赢，+20", () => {
    const trick = plays("pirate-1", "mermaid-1", "pirate-2");
    expect(trickWinner(trick)).toBe(0);
    expect(bonusOf(trick)).toBe(20);
  });
  it("美人鱼 → 黑旗 14 → 海藻 1：美人鱼赢，+20（黑旗 14）", () => {
    const trick = plays("mermaid-1", "flag-14", "seaweed-1");
    expect(trickWinner(trick)).toBe(0);
    expect(bonusOf(trick)).toBe(20);
  });
  it("鬼船长 → 海盗 → 双面海盗(当海盗) → 黑旗 14：鬼船长赢，+30×2 + 20 = 80", () => {
    const trick = plays("captain", "pirate-1", "tigress:p", "flag-14");
    expect(trickWinner(trick)).toBe(0);
    expect(bonusOf(trick)).toBe(80);
  });
  it("美人鱼(1) → 美人鱼(2) → 黑旗 13：先出的美人鱼赢，没有角色奖励", () => {
    const trick = plays("mermaid-1", "mermaid-2", "flag-13");
    expect(trickWinner(trick)).toBe(0);
    expect(bonusOf(trick)).toBe(0);
  });
  it("美人鱼(1) → 鬼船长 → 美人鱼(2)：美人鱼(1) 赢，+40", () => {
    const trick = plays("mermaid-1", "captain", "mermaid-2");
    expect(trickWinner(trick)).toBe(0);
    expect(bonusOf(trick)).toBe(40);
  });
  it("双面海盗(当海盗) → 海盗 → 美人鱼：双面海盗赢，+20", () => {
    const trick = plays("tigress:p", "pirate-1", "mermaid-1");
    expect(trickWinner(trick)).toBe(0);
    expect(bonusOf(trick)).toBe(20);
  });
});

describe("规则书#TC8 白旗类", () => {
  it("白旗 → 双面海盗(当白旗) → 白旗：第一张赢，没有奖励", () => {
    const trick = plays("escape-1", "tigress:e", "escape-2");
    expect(trickWinner(trick)).toBe(0);
    expect(bonusOf(trick)).toBe(0);
  });
  it("双面海盗(当白旗) 领出 → 海藻 3 → 海藻 8：领出花色是海藻，海藻 8 赢，双面海盗不给分", () => {
    const trick = plays("tigress:e", "seaweed-3", "seaweed-8");
    expect(legalCards(["seaweed-1", "coin-2"], trick.slice(0, 2))).toEqual(["seaweed-1"]);
    expect(trickWinner(trick)).toBe(2);
    expect(bonusOf(trick)).toBe(0);
  });
  it("PLAY 双面海盗不带 as 拒绝；PLAY 海藻 3 带 as 拒绝", () => {
    const state = script(buildGame({ players: 3, round: 2, hands: [["tigress", "seaweed-3"], undefined, undefined] }), bids([1, 0, 1]));
    expect(() => apply(state, "p1", { type: "PLAY", card: "tigress" }, rng())).toThrow();
    expect(() => apply(state, "p1", { type: "PLAY", card: "seaweed-3", as: "pirate" }, rng())).toThrow();
    expect(() => apply(state, "p1", { type: "PLAY", card: "tigress", as: "pirate" }, rng())).not.toThrow();
  });
});

describe("规则书#TC9 叫墩校验", () => {
  const start = () => buildGame({ players: 3, round: 3 });
  it("第 3 轮：叫 0、3 合法；4、-1、1.5 拒绝", () => {
    const state = start();
    expect(() => apply(state, "p1", { type: "BID", n: 0 }, rng())).not.toThrow();
    expect(() => apply(state, "p1", { type: "BID", n: 3 }, rng())).not.toThrow();
    for (const n of [4, -1, 1.5]) expect(() => apply(state, "p1", { type: "BID", n }, rng())).toThrow();
  });
  it("所有人提交后才进入出牌；锁定前可以撤回，锁定后拒绝", () => {
    let state = script(start(), [[0, { type: "BID", n: 1 }], [1, { type: "BID", n: 2 }]]);
    expect(state.phase).toBe("bid");
    state = apply(state, "p1", { type: "UNBID" }, rng()).state;
    expect(state.players[0]!.bidSubmitted).toBe(false);
    state = script(state, [[0, { type: "BID", n: 0 }], [2, { type: "BID", n: 1 }]]);
    expect(state.phase).toBe("play");
    expect(() => apply(state, "p1", { type: "UNBID" }, rng())).toThrow();
    expect(() => apply(state, "p2", { type: "BID", n: 1 }, rng())).toThrow();
  });
});

describe("规则书#TC10 计分", () => {
  const cases: [string, number, number, number, number, number][] = [
    ["a", 3, 3, 5, 40, 100],
    ["b", 2, 4, 6, 10, -20],
    ["c", 2, 1, 6, 0, -10],
    ["d", 0, 0, 7, 0, 70],
    ["e", 0, 2, 9, 0, -90],
    ["f", 0, 0, 8, 0, 80],
    ["g", 1, 1, 1, 50, 70],
    ["h", 4, 4, 10, 50, 130],
  ];
  for (const [name, bid, won, size, bonus, expected] of cases) {
    it(`情形 ${name}：叫 ${bid} 赢 ${won}，手牌 ${size}，奖励 ${bonus} → ${expected}`, () => {
      expect(roundScore(bid, won, size, bonus)).toBe(expected);
    });
  }
  it("情形 a/g/h 的奖励分由真实的墩算出", () => {
    // a：黑旗 14 + 海盗抓 1 美人鱼
    expect(bonusOf(plays("flag-14", "seaweed-1")) + bonusOf(plays("pirate-1", "mermaid-1"))).toBe(40);
    // g：美人鱼抓鬼船长 + 罗盘 14
    expect(bonusOf(plays("compass-14", "mermaid-1", "captain"))).toBe(50);
    // h：四个 14 都在赢下的墩里
    expect(bonusOf(plays("flag-14", "seaweed-14", "coin-14", "compass-14"))).toBe(50);
  });
});

describe("规则书#TC11 一轮完整流程（教程剧本）", () => {
  it("叫 1/2/0 → 赢 1/2/1，得分 70/40/−40；赢家依次甲、乙、你、甲", () => {
    let state = script(tutorialGame(), bids([1, 2, 0]));
    expect(state.turn).toBe("p1");
    state = script(state, [play(0, "seaweed-9"), play(1, "seaweed-12"), play(2, "seaweed-4"), "advance"]);
    expect(state.leader).toBe("p2");
    state = script(state, [play(1, "coin-5"), play(2, "flag-11"), play(0, "flag-3"), "advance"]);
    expect(state.leader).toBe("p3");
    state = script(state, [play(2, "compass-14"), play(0, "mermaid-1"), play(1, "captain"), "advance"]);
    expect(state.leader).toBe("p1");
    state = script(state, [play(0, "escape-1"), play(1, "pirate-1"), play(2, "tigress", "pirate"), "advance"]);
    expect(state.tricks.map((trick) => trick.winner)).toEqual(["p2", "p3", "p1", "p2"]);
    expect(state.phase).toBe("roundEnd");
    const result = state.history[0]!.results;
    expect(result.map((entry) => entry.won)).toEqual([1, 2, 1]);
    expect(result.map((entry) => entry.points)).toEqual([70, 40, -40]);
    expect(state.players.map((player) => player.score)).toEqual([70, 40, -40]);
  });
});

describe("规则书#TC12 终局", () => {
  it("10 轮后 finished；总分 [210, 210, 150] → 座位 0、1 并列获胜", () => {
    let state = buildGame({ players: 3, round: 10 });
    state = finishRound(state);
    expect(state.phase).toBe("finished");
    expect(state.round).toBe(10);
    const tied = withFinalScores(state, [210, 210, 150]);
    expect(tied.finalResult!.winners).toEqual(["p1", "p2"]);
  });
  it("8 人局同样打 10 轮", () => {
    let state = buildGame({ players: 8, round: 9 });
    expect(state.handSize).toBe(8);
    state = nextRound(state);
    expect(state.round).toBe(10);
    expect(state.handSize).toBe(8);
    expect(finishRound(state).phase).toBe("finished");
  });
});

describe("规则书#TC13 2 人局幽灵", () => {
  const ghostGame = (queue: CardId[], firstSeat = 0) =>
    buildGame({ names: ["A", "B"], round: 2, firstSeat, hands: [["seaweed-5", "coin-7"], ["seaweed-2", "coin-14"]], ghostQueue: queue });

  it("发 3 手、幽灵不叫墩不计分", () => {
    const state = ghostGame(["seaweed-9", "flag-1"]);
    expect(state.config.ghost).toBe(true);
    expect(state.handCounts[GHOST_ID]).toBe(2);
    expect(state.players).toHaveLength(2);
    const bidding = script(state, bids([0, 1]));
    expect(bidding.phase).toBe("play");
  });
  it("A 领出海藻 5 → 幽灵翻海藻 9 → B 只能出海藻 2 → 幽灵赢；下一墩幽灵先翻、首位玩家第二、另一人第三", () => {
    let state = script(ghostGame(["seaweed-9", "compass-3"]), [...bids([0, 1]), play(0, "seaweed-5")]);
    expect(state.trick.map((entry) => entry.by)).toEqual(["p1", GHOST_ID]);
    expect(state.turn).toBe("p2");
    expect(legalCards(state.hands.p2!, state.trick)).toEqual(["seaweed-2"]);
    state = script(state, [play(1, "seaweed-2")]);
    expect(state.tricks[0]!.winner).toBe(GHOST_ID);
    expect(state.players.map((player) => player.won)).toEqual([0, 0]);
    state = script(state, ["advance"]);
    expect(state.trick.map((entry) => entry.by)).toEqual([GHOST_ID]);
    expect(state.trick[0]!.card).toBe("compass-3");
    expect(state.turn).toBe("p1");
    state = script(state, [play(0, "coin-7")]);
    expect(state.turn).toBe("p2");
  });
  it("幽灵领出时首位玩家第二个出（首位是 B 时）", () => {
    let state = script(ghostGame(["coin-9", "compass-3"], 1), [...bids([0, 1]), play(1, "coin-14")]);
    // B 领出：B → 幽灵 → A
    expect(state.trick.map((entry) => entry.by)).toEqual(["p2", GHOST_ID]);
    state = script(state, [play(0, "coin-7"), "advance"]);
    // B 赢了（金币 14），下一墩 B 领出
    expect(state.leader).toBe("p2");
  });
  it("幽灵翻出双面海盗当白旗", () => {
    const state = script(ghostGame(["tigress", "compass-3"]), [...bids([0, 1]), play(0, "seaweed-5")]);
    expect(state.trick[1]).toEqual({ by: GHOST_ID, card: "tigress", as: "escape" });
  });
  it("幽灵不受跟花色限制（领出海藻 5 时翻出金币 2 也行，只是不算大）", () => {
    let state = script(ghostGame(["coin-2", "compass-3"]), [...bids([0, 1]), play(0, "seaweed-5")]);
    expect(state.trick[1]!.card).toBe("coin-2");
    state = script(state, [play(1, "seaweed-2")]);
    expect(state.tricks[0]!.winner).toBe("p1");
  });
  it("首位真人交替：第 1 轮 A，第 2 轮 B，第 3 轮 A", () => {
    let state = buildGame({ names: ["A", "B"], round: 1, firstSeat: 0 });
    expect(state.firstPlayer).toBe("p1");
    state = nextRound(state);
    expect(state.firstPlayer).toBe("p2");
    state = nextRound(state);
    expect(state.firstPlayer).toBe("p1");
  });
});

describe("规则书#TC10 补充：叫墩分函数", () => {
  it("叫 0 按本轮手牌数，赢几墩都扣一样多", () => {
    expect(bidPoints(0, 1, 8)).toBe(-80);
    expect(bidPoints(0, 5, 8)).toBe(-80);
  });
});
