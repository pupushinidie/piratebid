/**
 * 人机强度模拟：npx tsx scripts/sim-piratebid.ts [每组局数，默认 300]
 * - 随机基线：叫墩 0…手牌数均匀随机，出牌在合法牌里随机（双面海盗随机声明）。
 * - 贪心基线（规则书 §9.7）：叫墩 = 估值表加总四舍五入；还差墩就出「现在能赢这墩的最小的牌」，否则出最不可能赢的牌。
 * 一个人机对 n−1 个基线，人机轮流坐各个座位；报胜率（并列按人数分）、平均名次、平均分、叫中率、每步耗时。
 */
import {
  advanceGame,
  applyCommand,
  BOT_PARAMS,
  botCommand,
  cardInfo,
  createGame,
  createRng,
  legalActions,
  pendingActors,
  redactGameForViewer,
  safestPlay,
  trickWinner,
  type BotParams,
  type CardId,
  type GameCommand,
  type GameState,
} from "../packages/game/src/index.js";

type Bot = (state: GameState, id: string) => GameCommand;

const rng = createRng(12345);
const randomBot: Bot = (state, id) => {
  const options = legalActions(state, id).filter((command) => command.type !== "UNBID");
  return options[rng.int(options.length)]!;
};

/** 规则书 §9.7 的估值表。 */
function tableValue(card: CardId, players: number): number {
  const info = cardInfo(card);
  switch (info.kind) {
    case "captain":
      return 0.85;
    case "pirate":
      return players >= 5 ? 0.6 : 0.7;
    case "tigress":
      return 0.5;
    case "mermaid":
      return 0.5;
    case "escape":
      return 0;
    case "number":
      if (info.suit === "flag") return info.rank >= 13 ? 0.7 : info.rank >= 10 ? 0.45 : info.rank >= 6 ? 0.25 : 0.1;
      if (info.rank >= 13) return players <= 4 ? 0.45 : 0.25;
      return info.rank >= 10 ? 0.15 : 0.05;
  }
}

const greedyBot: Bot = (state, id) => {
  if (state.phase === "bid") {
    const sum = (state.hands[id] ?? []).reduce((total, card) => total + tableValue(card, state.players.length), 0);
    return { type: "BID", n: Math.min(state.handSize, Math.round(sum)) };
  }
  if (state.phase === "roundEnd") return { type: "CONTINUE" };
  const me = state.players.find((player) => player.id === id)!;
  if ((me.bid ?? 0) > me.won) {
    const winners = legalActions(state, id)
      .filter((command): command is Extract<GameCommand, { type: "PLAY" }> => command.type === "PLAY")
      .filter((command) => {
        const plays = [...state.trick, command.as ? { by: id, card: command.card, as: command.as } : { by: id, card: command.card }];
        return trickWinner(plays) === plays.length - 1;
      });
    if (winners.length > 0) {
      // 最小的：数字牌按点数，特殊牌排在数字牌后（美人鱼 < 海盗 < 鬼船长）
      const order = (command: Extract<GameCommand, { type: "PLAY" }>) => {
        const info = cardInfo(command.card);
        if (info.kind === "number") return (info.suit === "flag" ? 20 : 0) + info.rank;
        return { mermaid: 40, tigress: 45, pirate: 50, captain: 60, escape: 0 }[info.kind];
      };
      return winners.sort((left, right) => order(left) - order(right))[0]!;
    }
  }
  return safestPlay(state, id);
};

const botWith = (params: BotParams): Bot => (state, id) => botCommand(redactGameForViewer(state, id), id, params)!;
const mine = botWith(BOT_PARAMS);

let decisions = 0;
let decisionMs = 0;
let worstMs = 0;
let hits = 0;
let rounds = 0;

function playGame(bots: Bot[], seed: number, track: number): GameState {
  let state = createGame(bots.map((_, index) => ({ id: `p${index}`, name: `b${index}` })), seed);
  let steps = 0;
  while (state.phase !== "finished") {
    if (++steps > 5000) throw new Error("死循环");
    if (state.phase === "trickEnd") {
      state = advanceGame(state);
      continue;
    }
    const id = pendingActors(state)[0]!;
    const index = Number(id.slice(1));
    const started = performance.now();
    const command = bots[index]!(state, id);
    if (index === track) {
      const ms = performance.now() - started;
      decisions += 1;
      decisionMs += ms;
      worstMs = Math.max(worstMs, ms);
    }
    state = applyCommand(state, id, command);
  }
  for (const round of state.history) {
    const entry = round.results[track]!;
    rounds += 1;
    if (entry.bid === entry.won) hits += 1;
  }
  return state;
}

function match(name: string, hero: Bot, other: Bot, players: number, games: number): { winRate: number; rank: number } {
  decisions = decisionMs = worstMs = hits = rounds = 0;
  let wins = 0;
  let rankSum = 0;
  let scoreSum = 0;
  let otherScore = 0;
  for (let game = 0; game < games; game += 1) {
    const seat = game % players;
    const bots = Array.from({ length: players }, (_, index) => (index === seat ? hero : other));
    const state = playGame(bots, 9000 + game * 7 + players, seat);
    const score = state.players[seat]!.score;
    if (state.finalResult!.winners.includes(`p${seat}`)) wins += 1 / state.finalResult!.winners.length;
    rankSum += 1 + state.players.filter((player) => player.score > score).length;
    scoreSum += score;
    otherScore += (state.players.reduce((sum, player) => sum + player.score, 0) - score) / (players - 1);
  }
  const winRate = wins / games;
  const rank = rankSum / games;
  console.log(
    `${name} ${players} 人（1 对 ${players - 1}）${games} 局：胜率 ${(100 * winRate).toFixed(1)}%（公平 ${(100 / players).toFixed(1)}%）` +
      ` 平均名次 ${rank.toFixed(2)}  平均分 ${(scoreSum / games).toFixed(0)} 对手 ${(otherScore / games).toFixed(0)}` +
      `  叫中率 ${(100 * hits / rounds).toFixed(0)}%  每步 ${(decisionMs / decisions).toFixed(2)}ms 最坏 ${worstMs.toFixed(1)}ms`,
  );
  return { winRate, rank };
}

const games = Number(process.argv[2] ?? 300);
const which = process.argv[3] ?? "all";
if (which === "all" || which === "random") for (const players of [2, 3, 4, 5, 6, 8]) match("人机 vs 随机", mine, randomBot, players, games);
if (which === "all" || which === "greedy") for (const players of [2, 3, 4, 5, 6, 7, 8]) match("人机 vs 贪心", mine, greedyBot, players, games);
if (which === "greedy-self") for (const players of [3, 4, 5]) match("贪心 vs 随机", greedyBot, randomBot, players, games);
export { greedyBot, randomBot, botWith, match };
