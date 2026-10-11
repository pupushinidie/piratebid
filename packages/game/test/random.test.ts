/**
 * 随机对局：2–8 人每种 300 局，随机走合法行动（偶尔撤回叫墩、偶尔超时）直到终局。
 * 不变量用普通代码检查，最后汇总断言一次。
 */
import { describe, expect, it } from "vitest";
import {
  advance,
  apply,
  bonusTotal,
  cardInfo,
  createGame,
  createRng,
  GHOST_ID,
  handSize,
  isSpecial,
  leadSuitOf,
  legalActions,
  pendingActors,
  redactGameForViewer,
  roundScore,
  suitOf,
  timeoutStep,
  type GameState,
} from "../src/index.js";

const GAMES = 300;
const MAX_STEPS = 3000;

function check(state: GameState, problems: string[]): void {
  const fail = (message: string) => problems.length < 20 && problems.push(`r${state.round} ${state.phase}: ${message}`);
  const inTricks = state.tricks.flatMap((trick) => trick.plays.map((entry) => entry.card));
  const cards = [
    ...Object.values(state.hands).flat(),
    ...state.ghostQueue,
    ...state.undealt,
    ...inTricks,
    ...(state.phase === "play" ? state.trick.map((entry) => entry.card) : []),
  ];
  if (cards.length !== 70 || new Set(cards).size !== 70) fail(`配件不守恒：${cards.length} 张 / ${new Set(cards).size} 种`);
  const hands = state.players.length + (state.config.ghost ? 1 : 0);
  if (state.handSize !== handSize(state.round, hands)) fail("手牌数不对");
  for (const player of state.players) {
    if ((state.hands[player.id]?.length ?? 0) !== state.handCounts[player.id]) fail("handCounts 不对");
  }
  if (state.phase !== "finished" && state.phase !== "roundEnd") {
    const remaining = state.handSize - state.trickNo - (state.phase === "trickEnd" ? 1 : 0);
    for (const id of Object.keys(state.handCounts)) {
      const played = state.phase === "play" && state.trick.some((entry) => entry.by === id) ? 1 : 0;
      if (state.handCounts[id] !== remaining - played) fail(`${id} 手牌张数 ${state.handCounts[id]} ≠ ${remaining - played}`);
    }
  }
  const humanWins = state.tricks.filter((trick) => trick.winner !== GHOST_ID).length;
  if (state.phase !== "bid" && state.players.reduce((sum, player) => sum + player.won, 0) !== humanWins) fail("赢墩数和墩记录对不上");
  if (state.tricks.length > state.handSize) fail("墩数超过手牌数");
  if (state.phase !== "finished" && state.phase !== "trickEnd" && pendingActors(state).length === 0) fail("没人能行动又不会自动推进（卡死）");
  if (state.phase === "play" && (!state.turn || legalActions(state, state.turn).length === 0)) fail("轮到的人没有合法牌");
  // 分数：每轮结算按公式重算；奖励只在叫中时计入
  for (const round of state.history) {
    for (const entry of round.results) {
      if (entry.points !== roundScore(entry.bid, entry.won, round.handSize, entry.bonus + entry.lostBonus)) fail(`第 ${round.round} 轮 ${entry.player} 分数 ${entry.points} 不符合公式`);
      if (entry.bid === entry.won ? entry.lostBonus !== 0 : entry.bonus !== 0) fail("奖励作废规则不对");
    }
  }
  // 刚结算的那一轮：奖励分从这一轮的墩记录独立重算
  if (state.phase === "roundEnd" || state.phase === "finished") {
    const last = state.history.at(-1)!;
    for (const entry of last.results) {
      const fromTricks = state.tricks.filter((trick) => trick.winner === entry.player).reduce((sum, trick) => sum + bonusTotal(trick.bonus), 0);
      if (entry.bonus + entry.lostBonus !== fromTricks) fail(`${entry.player} 奖励分 ${entry.bonus}+${entry.lostBonus} ≠ 墩里的 ${fromTricks}`);
    }
  }
  for (const player of state.players) {
    const sum = state.history.reduce((total, round) => total + (round.results.find((entry) => entry.player === player.id)?.points ?? 0), 0);
    if (sum !== player.score) fail(`${player.id} 累计分 ${player.score} ≠ 各轮之和 ${sum}`);
  }
}

/** 独立检查跟花色：玩家手里有领出花色的数字牌却垫了别的数字牌 → 违规。 */
function followedSuit(before: GameState, playerId: string, card: string): boolean {
  const lead = leadSuitOf(before.trick);
  if (!lead || lead === "none" || isSpecial(card)) return true;
  const hand = before.hands[playerId]!;
  return suitOf(card) === lead || !hand.some((entry) => suitOf(entry) === lead);
}

function runGame(count: number, seed: number, problems: string[]): { steps: number; finished: boolean; scores: number[] } {
  const rng = createRng(seed);
  let state = createGame(Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `n${index}` })), seed);
  let steps = 0;
  let lastRound = 1;
  while (state.phase !== "finished" && steps < MAX_STEPS) {
    steps += 1;
    const roll = rng.next();
    if (state.phase === "trickEnd" || roll < 0.02) {
      state = state.phase === "trickEnd" ? advance(state, rng).state : timeoutStep(state);
    } else {
      const pending = pendingActors(state);
      const id = pending[rng.int(pending.length)]!;
      let options = legalActions(state, id);
      if (state.phase === "bid" && roll > 0.1) options = options.filter((command) => command.type !== "UNBID");
      // 已提交的人偶尔撤回
      if (state.phase === "bid" && roll < 0.05) {
        const submitted = state.players.find((player) => player.bidSubmitted);
        if (submitted) {
          state = apply(state, submitted.id, { type: "UNBID" }, rng).state;
          continue;
        }
      }
      const command = options[rng.int(options.length)]!;
      if (command.type === "PLAY" && !followedSuit(state, id, command.card)) problems.push(`没跟花色：${command.card}`);
      const before = steps % 97 === 0 ? JSON.stringify(state) : "";
      const next = apply(state, id, command, rng).state;
      if (steps % 97 === 0 && JSON.stringify(state) !== before) problems.push("apply 改了输入");
      if (command.type === "PLAY" && cardInfo(command.card).kind === "tigress" && !next.trick.concat(next.tricks.at(-1)?.plays ?? []).some((entry) => entry.card === "tigress" && entry.as === command.as)) {
        problems.push("双面海盗声明没记下");
      }
      state = next;
    }
    if (state.round < lastRound) problems.push("轮数倒退");
    lastRound = state.round;
    check(state, problems);
    // 抽查隐藏信息：别人的手牌不出现在视图里
    if (steps % 31 === 0) {
      const viewer = state.players[rng.int(state.players.length)]!.id;
      const json = JSON.stringify(redactGameForViewer(state, viewer));
      const secret = [...state.players.filter((player) => player.id !== viewer).flatMap((player) => state.hands[player.id] ?? []), ...state.ghostQueue, ...state.undealt];
      if (secret.some((card) => json.includes(`"${card}"`))) problems.push("视图泄露了别人的牌");
    }
  }
  if (state.phase === "finished") {
    if (state.round !== 10 || state.history.length !== 10) problems.push("没打满 10 轮就结束");
    const best = Math.max(...state.players.map((player) => player.score));
    const winners = state.players.filter((player) => player.score === best).map((player) => player.id);
    if (JSON.stringify(winners) !== JSON.stringify(state.finalResult?.winners)) problems.push("赢家不对");
    // 每轮的赢墩总数 = 手牌数 − 幽灵赢的墩
    for (const round of state.history) {
      const total = round.results.reduce((sum, entry) => sum + entry.won, 0);
      if (total > round.handSize || (!state.config.ghost && total !== round.handSize)) problems.push(`第 ${round.round} 轮赢墩合计 ${total}`);
    }
  }
  return { steps, finished: state.phase === "finished", scores: state.players.map((player) => player.score) };
}

describe("随机对局（每种人数 300 局）", () => {
  for (let count = 2; count <= 8; count += 1) {
    it(`${count} 人 ${GAMES} 局随机走到终局，不变量全部成立`, () => {
      const problems: string[] = [];
      let unfinished = 0;
      let maxSteps = 0;
      for (let game = 0; game < GAMES; game += 1) {
        const result = runGame(count, count * 100_000 + game, problems);
        if (!result.finished) unfinished += 1;
        maxSteps = Math.max(maxSteps, result.steps);
      }
      expect(problems).toEqual([]);
      expect(unfinished).toBe(0);
      expect(maxSteps).toBeLessThan(MAX_STEPS);
    }, 120_000);
  }
});

describe("奖励分来源", () => {
  it("bonusTotal 只看明细", () => expect(bonusTotal([{ kind: "flag14", points: 20, card: "flag-14" }])).toBe(20));
});
