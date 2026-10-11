/**
 * 预览局面工厂（对外接口：界面预览页、教程、测试都用它）。
 *
 * - buildGame(spec)：按参数造一个「某一轮刚发完牌」的精确局面（指定人数、轮数、首位玩家、每人手牌、幽灵的牌、累计分）。
 * - script(state, steps)：在它上面按顺序执行命令（叫墩、出牌、继续、自动推进），得到任意中间局面。
 *   所有局面都是真引擎走出来的，状态一定自洽。
 * - scene(name)：常用局面，名字见 SCENE_NAMES。
 *
 * 玩家 id 是 p1…pN（和服务器的座位 id 一样），座位号 0…N−1。界面预览默认用 p1 的视角。
 */
import { DECK, handSize as handSizeFor } from "./cards.js";
import { advance, apply, createGame, handCountFor, legalActions, pendingActors } from "./engine.js";
import { createRng, type Rng } from "./rng.js";
import { GHOST_ID, type CardId, type GameCommand, type GameState, type TigressAs } from "./types.js";

export interface BuildSpec {
  /** 玩家名字（2–8 个），默认「你、甲、乙…」。 */
  readonly names?: readonly string[];
  readonly players?: number;
  /** 第几轮（1–10），默认 1。 */
  readonly round?: number;
  /** 本轮首位玩家的座位号，默认 0。 */
  readonly firstSeat?: number;
  /** 按座位号指定手牌；没给的座位从剩下的牌里随机发（按 seed）。 */
  readonly hands?: readonly (readonly CardId[] | undefined)[];
  /** 2 人局幽灵的牌，按翻牌顺序；没给就随机。 */
  readonly ghostQueue?: readonly CardId[];
  /** 进这一轮之前的累计分（按座位号）。 */
  readonly scores?: readonly number[];
  readonly tracker?: boolean;
  readonly seed?: number;
}

export const DEFAULT_NAMES = ["你", "甲", "乙", "丙", "丁", "戊", "己", "庚"];

export function buildGame(spec: BuildSpec = {}): GameState {
  const count = spec.names?.length ?? spec.players ?? 4;
  const names = spec.names ?? DEFAULT_NAMES.slice(0, count);
  const seed = spec.seed ?? 7;
  const players = names.map((name, index) => ({ id: `p${index + 1}`, name }));
  const state = createGame(players, seed, spec.tracker === undefined ? {} : { tracker: spec.tracker });
  const round = spec.round ?? 1;
  const size = handSizeFor(round, handCountFor(state));
  state.round = round;
  state.handSize = size;
  state.firstPlayer = players[spec.firstSeat ?? 0]!.id;
  state.leader = state.firstPlayer;
  const used = new Set<CardId>([...(spec.hands ?? []).flatMap((hand) => hand ?? []), ...(spec.ghostQueue ?? [])]);
  if (used.size !== (spec.hands ?? []).reduce((sum, hand) => sum + (hand?.length ?? 0), 0) + (spec.ghostQueue?.length ?? 0)) {
    throw new Error("指定的牌有重复。");
  }
  const rest = createRng(seed).shuffle(DECK.filter((card) => !used.has(card)));
  const take = (n: number) => rest.splice(0, n);
  state.hands = {};
  state.handCounts = {};
  players.forEach((player, index) => {
    const given = spec.hands?.[index];
    if (given && given.length !== size) throw new Error(`座位 ${index} 的手牌应该是 ${size} 张。`);
    state.hands[player.id] = [...(given ?? take(size))].sort((a, b) => DECK.indexOf(a) - DECK.indexOf(b));
    state.handCounts[player.id] = size;
  });
  if (state.config.ghost) {
    state.ghostQueue = spec.ghostQueue ? [...spec.ghostQueue] : take(size);
    state.handCounts[GHOST_ID] = size;
  }
  state.undealt = rest;
  state.players.forEach((player, index) => {
    player.score = spec.scores?.[index] ?? 0;
  });
  state.events = [{ type: "RoundStarted", round, handSize: size, first: state.firstPlayer }];
  return state;
}

/** 剧本里的一步：[座位号, 命令]，或者 "advance"（服务器自动推进：一墩停顿结束 / 结算页到时）。 */
export type ScriptStep = readonly [seat: number, command: GameCommand] | "advance";

/** 叫墩的简写：bids([1, 2, 0]) → 按座位号依次叫墩。 */
export function bids(values: readonly number[]): ScriptStep[] {
  return values.map((n, seat) => [seat, { type: "BID", n }] as const);
}

/** 出牌的简写：play(0, "coin-9")、play(2, "tigress", "pirate")。 */
export function play(seat: number, card: CardId, as?: TigressAs): ScriptStep {
  return [seat, as ? { type: "PLAY", card, as } : { type: "PLAY", card }];
}

/** 按剧本依次执行（随机数用 seed，只有发下一轮时才用得到）。 */
export function script(state: GameState, steps: readonly ScriptStep[], rng: Rng = createRng(11)): GameState {
  let current = state;
  for (const step of steps) {
    if (step === "advance") current = advance(current, rng).state;
    else current = apply(current, current.players[step[0]]!.id, step[1], rng).state;
  }
  return current;
}

/** 全部用占位策略打到某个条件为止（造中后期、终局局面用）。 */
export function playUntil(state: GameState, done: (state: GameState) => boolean, seed = 5): GameState {
  const rng = createRng(seed);
  let current = state;
  for (let guard = 0; guard < 5000 && !done(current) && current.phase !== "finished"; guard += 1) {
    if (current.phase === "trickEnd") {
      current = advance(current, rng).state;
      continue;
    }
    const id = pendingActors(current)[0]!;
    const options = legalActions(current, id).filter((command) => command.type !== "UNBID");
    current = apply(current, id, options[rng.int(options.length)]!, rng).state;
  }
  return current;
}

/** 把终局改成指定的总分（并列测试、预览用）。 */
export function withFinalScores(state: GameState, totals: readonly number[]): GameState {
  const next = structuredClone(state);
  next.players.forEach((player, index) => {
    player.score = totals[index] ?? player.score;
  });
  const best = Math.max(...next.players.map((player) => player.score));
  next.finalResult = {
    winners: next.players.filter((player) => player.score === best).map((player) => player.id),
    totals: Object.fromEntries(next.players.map((player) => [player.id, player.score])),
  };
  return next;
}

/** 教程剧本的开局（规则书 §9.8）：3 人第 4 轮，你先出。 */
export const TUTORIAL_HANDS: readonly (readonly CardId[])[] = [
  ["seaweed-9", "flag-3", "mermaid-1", "escape-1"],
  ["seaweed-12", "coin-5", "captain", "pirate-1"],
  ["seaweed-4", "flag-11", "compass-14", "tigress"],
];

export function tutorialGame(): GameState {
  return buildGame({ names: ["你", "甲", "乙"], round: 4, firstSeat: 0, hands: TUTORIAL_HANDS, seed: 2024 });
}

export const SCENE_NAMES = [
  "bid",
  "bid-partial",
  "play-lead",
  "play-follow",
  "play-tigress",
  "play-others",
  "trick-end",
  "trick-bonus",
  "round-end",
  "final",
  "final-tie",
  "ghost-bid",
  "ghost-play",
  "max8-bid",
  "max8-play",
  "max8-final",
  "tutorial",
] as const;
export type SceneName = (typeof SCENE_NAMES)[number];

const FIVE: readonly (readonly CardId[])[] = [
  ["seaweed-3", "coin-14", "compass-7", "flag-12", "tigress"],
  ["seaweed-10", "coin-2", "pirate-2", "escape-2", "flag-5"],
  ["seaweed-13", "compass-1", "mermaid-2", "coin-9", "escape-3"],
  ["seaweed-1", "captain", "compass-11", "flag-14", "coin-6"],
];

/** 常用局面（4 人第 5 轮为主；viewer 是 p1，座位 0）。 */
export function scene(name: SceneName): GameState {
  const four = () => buildGame({ round: 5, firstSeat: 0, hands: FIVE, scores: [40, -10, 60, 20] });
  switch (name) {
    case "bid":
      return four();
    case "bid-partial":
      return script(four(), [[0, { type: "BID", n: 2 }], [2, { type: "BID", n: 1 }]]);
    case "play-lead":
      return script(four(), bids([2, 1, 1, 2]));
    case "play-follow":
      // 甲领出海藻 10，轮到你：手里有海藻 3，只能出海藻 3 或特殊牌。
      return script(buildGame({ round: 5, firstSeat: 1, hands: FIVE, scores: [40, -10, 60, 20] }), [...bids([2, 1, 1, 2]), play(1, "seaweed-10"), play(2, "seaweed-13"), play(3, "seaweed-1")]);
    case "play-tigress":
      return script(four(), [...bids([2, 1, 1, 2]), play(0, "seaweed-3"), play(1, "seaweed-10"), play(2, "seaweed-13"), play(3, "seaweed-1"), "advance", play(2, "mermaid-2"), play(3, "captain")]);
    case "play-others":
      return script(four(), [...bids([2, 1, 1, 2]), play(0, "flag-12")]);
    case "trick-end":
      return script(four(), [...bids([2, 1, 1, 2]), play(0, "seaweed-3"), play(1, "seaweed-10"), play(2, "seaweed-13"), play(3, "seaweed-1")]);
    case "trick-bonus":
      // 美人鱼抓鬼船长 +40，墩里还有金币 14 +10。
      return script(four(), [...bids([2, 1, 1, 2]), play(0, "seaweed-3"), play(1, "seaweed-10"), play(2, "seaweed-13"), play(3, "seaweed-1"), "advance", play(2, "mermaid-2"), play(3, "captain"), play(0, "coin-14"), play(1, "coin-2")]);
    case "round-end":
      return playUntil(buildGame({ round: 3, seed: 31 }), (state) => state.phase === "roundEnd");
    case "final":
      return playUntil(buildGame({ seed: 41 }), () => false);
    case "final-tie": {
      const done = playUntil(buildGame({ seed: 41 }), () => false);
      const top = Math.max(...done.players.map((player) => player.score));
      return withFinalScores(done, done.players.map((player, index) => (index < 2 ? top + 30 : player.score)));
    }
    case "ghost-bid":
      return buildGame({ names: ["你", "甲"], round: 4, firstSeat: 0, seed: 52 });
    case "ghost-play":
      // 甲先出，幽灵自动翻第二张，轮到你。
      return playUntil(script(buildGame({ names: ["你", "甲"], round: 4, firstSeat: 1, seed: 52, scores: [30, 10] }), bids([1, 2])), (state) => state.turn === "p1");
    case "max8-bid":
      return buildGame({ players: 8, round: 10, firstSeat: 3, seed: 81, scores: [120, 90, -30, 210, 60, 0, 150, 40] });
    case "max8-play": {
      const start = buildGame({ players: 8, round: 10, firstSeat: 3, seed: 81, scores: [120, 90, -30, 210, 60, 0, 150, 40] });
      return playUntil(start, (state) => state.phase === "play" && state.trickNo === 2 && state.turn === "p1");
    }
    case "max8-final":
      return playUntil(buildGame({ players: 8, seed: 88 }), () => false);
    case "tutorial":
      return tutorialGame();
  }
}
