/**
 * 人机：只用自己的视图、自对弈全部合法不死循环、耗时、关键决策、每一步都有理由。
 */
import { describe, expect, it } from "vitest";
import {
  advance,
  apply,
  botCommand,
  botDecision,
  buildGame,
  bids,
  createGame,
  createRng,
  legalActions,
  pendingActors,
  play,
  redactGameForViewer,
  script,
  type GameState,
} from "../src/index.js";

const MAX_STEPS = 3000;

/** 全部用人机打一局：每一步都合法，记耗时和理由。 */
function selfPlay(count: number, seed: number, stats: { ms: number[]; problems: string[] }, positions?: GameState[]): GameState {
  const rng = createRng(seed);
  let state = createGame(Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `n${index}` })), seed);
  let steps = 0;
  while (state.phase !== "finished") {
    if (++steps > MAX_STEPS) {
      stats.problems.push(`${count} 人种子 ${seed} 超过最大步数`);
      break;
    }
    if (state.phase === "trickEnd") {
      state = advance(state, rng).state;
      continue;
    }
    const id = pendingActors(state)[0]!;
    const view = redactGameForViewer(state, id);
    const started = performance.now();
    const decision = botDecision(view, id);
    stats.ms.push(performance.now() - started);
    if (!decision) {
      stats.problems.push(`轮到 ${id} 但人机没给动作（${state.phase}）`);
      break;
    }
    if (!decision.reason) stats.problems.push("没有理由");
    const legal = legalActions(state, id).some((command) => JSON.stringify(command) === JSON.stringify(decision.command));
    if (!legal) stats.problems.push(`不合法：${JSON.stringify(decision.command)}`);
    if (positions && steps % 37 === 0) positions.push(state);
    state = apply(state, id, decision.command, rng).state;
  }
  return state;
}

/** 默认每种人数 40 局（npm test 一分钟内跑完）；FULL_SIM=1 跑完整 300 局（交付标准的数字）。 */
const SELF_PLAY_GAMES = process.env.FULL_SIM === "1" ? 300 : 40;
/** 每跑几局让出一次事件循环，免得 vitest 的 worker 心跳超时（onTaskUpdate timeout）。 */
const yieldLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

describe(`人机自对弈（每种人数 ${SELF_PLAY_GAMES} 局；FULL_SIM=1 跑 300 局）`, () => {
  for (let count = 2; count <= 8; count += 1) {
    it(`${count} 人：每一步合法、有理由、不死循环；每步平均 < 50ms、最坏 < 300ms`, async () => {
      const stats = { ms: [] as number[], problems: [] as string[] };
      for (let game = 0; game < SELF_PLAY_GAMES; game += 1) {
        selfPlay(count, 70_000 + count * 1000 + game, stats);
        if (game % 5 === 4) await yieldLoop();
      }
      expect(stats.problems.slice(0, 5)).toEqual([]);
      const average = stats.ms.reduce((sum, ms) => sum + ms, 0) / stats.ms.length;
      const worst = stats.ms.reduce((max, ms) => Math.max(max, ms), 0);
      expect(average).toBeLessThan(50);
      expect(worst).toBeLessThan(300);
    }, 300_000);
  }
});

describe("人机只看自己的视图", () => {
  it("给完整状态和给 redact 之后的视图，决定完全一样（说明它不用别人的手牌、幽灵的牌、没发的牌）", () => {
    const positions: GameState[] = [];
    const stats = { ms: [] as number[], problems: [] as string[] };
    for (const count of [2, 4, 7]) for (let game = 0; game < 6; game += 1) selfPlay(count, 500 + game, stats, positions);
    expect(positions.length).toBeGreaterThan(100);
    for (const state of positions) {
      for (const id of pendingActors(state)) {
        expect(botCommand(state, id)).toEqual(botCommand(redactGameForViewer(state, id), id));
      }
    }
  });
  it("把别人的手牌整个换掉，人机的决定不变", () => {
    const base = script(buildGame({ players: 4, round: 6, seed: 3 }), bids([2, 1, 1, 2]));
    const swapped = structuredClone(base);
    [swapped.hands.p2, swapped.hands.p3] = [swapped.hands.p3!, swapped.hands.p2!];
    swapped.undealt = [...swapped.undealt].reverse();
    expect(botCommand(redactGameForViewer(swapped, "p1"), "p1")).toEqual(botCommand(redactGameForViewer(base, "p1"), "p1"));
  });
});

describe("人机的关键决策", () => {
  const decide = (state: GameState, id = "p1") => botDecision(redactGameForViewer(state, id), id)!;

  it("手里有鬼船长不叫 0", () => {
    const state = buildGame({ players: 4, round: 3, hands: [["captain", "coin-2", "seaweed-3"]] });
    expect(decide(state).command).not.toEqual({ type: "BID", n: 0 });
  });
  it("全是白旗和小牌时叫 0", () => {
    const state = buildGame({ players: 5, round: 4, hands: [["escape-1", "escape-2", "coin-2", "seaweed-1"]] });
    expect(decide(state).command).toEqual({ type: "BID", n: 0 });
  });
  it("一手大牌叫得多", () => {
    const state = buildGame({ players: 4, round: 5, hands: [["captain", "pirate-1", "pirate-2", "flag-14", "flag-13"]] });
    const command = decide(state).command;
    expect(command.type === "BID" && command.n >= 4).toBe(true);
  });
  it("叫 0、只能跟出会赢的金币 12 时，出白旗躲墩", () => {
    const state = script(
      buildGame({ players: 3, round: 3, firstSeat: 1, hands: [["escape-1", "coin-12", "seaweed-2"], ["coin-5", "coin-2", "seaweed-1"], ["coin-9", "compass-3", "seaweed-3"]] }),
      [...bids([0, 1, 1]), play(1, "coin-5"), play(2, "coin-9")],
    );
    const decision = decide(state);
    expect(decision.command).toEqual({ type: "PLAY", card: "escape-1" });
    expect(decision.reason).toContain("叫够");
  });
  it("叫 0 却拿着海盗和黑旗 14（基本保不住）时，不浪费白旗", () => {
    const state = script(
      buildGame({ players: 3, round: 3, firstSeat: 1, hands: [["escape-1", "flag-14", "pirate-1"], ["coin-5", "coin-2", "seaweed-1"], ["coin-9", "compass-3", "seaweed-2"]] }),
      [...bids([0, 1, 1]), play(1, "coin-5"), play(2, "coin-9")],
    );
    expect(decide(state).command).not.toEqual({ type: "PLAY", card: "escape-1" });
  });
  it("这墩有海盗、还差墩：丢鬼船长抓海盗 +30", () => {
    const state = script(
      buildGame({ players: 3, round: 2, firstSeat: 1, hands: [["captain", "coin-2"], ["pirate-1", "seaweed-4"], ["compass-3", "seaweed-2"]] }),
      [...bids([1, 1, 0]), play(1, "pirate-1"), play(2, "compass-3")],
    );
    const decision = decide(state);
    expect(decision.command).toEqual({ type: "PLAY", card: "captain" });
    expect(decision.reason).toContain("+30");
  });
  it("这墩有鬼船长、还差墩：丢美人鱼抓鬼船长 +40", () => {
    const state = script(
      buildGame({ players: 3, round: 2, firstSeat: 1, hands: [["mermaid-1", "coin-2"], ["captain", "seaweed-4"], ["compass-3", "seaweed-2"]] }),
      [...bids([1, 1, 0]), play(1, "captain"), play(2, "compass-3")],
    );
    expect(decide(state).command).toEqual({ type: "PLAY", card: "mermaid-1" });
  });
  it("最后一个出、两墩都要：用最小的黑旗赢这墩，鬼船长留着", () => {
    const state = script(
      buildGame({ players: 3, round: 2, firstSeat: 1, hands: [["flag-3", "captain"], ["coin-9", "seaweed-4"], ["coin-2", "seaweed-2"]] }),
      [...bids([2, 0, 0]), play(1, "coin-9"), play(2, "coin-2")],
    );
    expect(decide(state).command).toEqual({ type: "PLAY", card: "flag-3" });
  });
  it("叫 0 的人在别人已经出了海盗的墩里垫掉自己的大黑旗", () => {
    const state = script(
      buildGame({ players: 3, round: 3, firstSeat: 1, hands: [["flag-14", "seaweed-2", "compass-1"], ["pirate-1", "coin-4", "coin-5"], ["coin-1", "seaweed-3", "compass-4"]] }),
      [...bids([0, 1, 1]), play(1, "pirate-1"), play(2, "coin-1")],
    );
    expect(decide(state).command).toEqual({ type: "PLAY", card: "flag-14" });
  });
  it("结算页点继续；已经叫过墩时不再动", () => {
    const state = script(buildGame({ players: 3, round: 2 }), [[0, { type: "BID", n: 1 }]]);
    expect(botDecision(redactGameForViewer(state, "p1"), "p1")).toBeNull();
  });
});
