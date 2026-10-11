import {
  bidPoints,
  bonusTotal,
  cardInfo,
  DECK,
  effectiveKind,
  handSize as handSizeFor,
  isCard,
  leadSuitOf,
  legalCards,
  rankOf,
  suitOf,
  TRUMP,
  trickBonus,
  trickWinner,
} from "./cards.js";
import { createRng, type Rng } from "./rng.js";
import {
  GHOST_ID,
  type CardId,
  type Config,
  type GameCommand,
  type GameEvent,
  type GameState,
  type PlayedCard,
  type Player,
  type RoundPlayerResult,
  type TigressAs,
} from "./types.js";

export function defaultConfig(playerCount: number, overrides: Partial<Config> = {}): Config {
  return {
    minPlayers: 2,
    maxPlayers: 8,
    rounds: 10,
    ghost: playerCount === 2,
    tracker: true,
    bidTimeoutSec: 30,
    playTimeoutSec: 25,
    trickPauseMs: 1800,
    roundPauseSec: 15,
    ...overrides,
  };
}

export interface NewPlayer {
  readonly id: string;
  readonly name: string;
}

/** 发牌手数：玩家数，2 人局多一手幽灵。 */
export function handCountFor(state: Pick<GameState, "config" | "players">): number {
  return state.players.length + (state.config.ghost ? 1 : 0);
}

function playerById(state: GameState, id: string): Player {
  const player = state.players.find((candidate) => candidate.id === id);
  if (!player) throw new Error("你不在这局里。");
  return player;
}

function nextPlayerId(state: Pick<GameState, "players">, id: string): string {
  const index = state.players.findIndex((player) => player.id === id);
  return state.players[(index + 1) % state.players.length]!.id;
}

/**
 * 一墩的出牌顺序（从 leader 开始）。
 * 普通局：从领出的人顺时针一圈。
 * 2 人局（幽灵）：真人领出 → 领出的人、幽灵、另一个人；幽灵领出 → 幽灵、本轮首位玩家、另一个人（规则书 §8.1）。
 */
export function playOrder(state: Pick<GameState, "config" | "players" | "firstPlayer">, leader: string): string[] {
  const ids = state.players.map((player) => player.id);
  if (!state.config.ghost) {
    const start = ids.indexOf(leader);
    return ids.map((_, offset) => ids[(start + offset) % ids.length]!);
  }
  const other = (id: string) => ids.find((candidate) => candidate !== id)!;
  if (leader === GHOST_ID) return [GHOST_ID, state.firstPlayer, other(state.firstPlayer)];
  return [leader, GHOST_ID, other(leader)];
}

/** 按牌组顺序排好（花色、点数，特殊牌在后）。 */
function sortHand(hand: CardId[]): CardId[] {
  return [...hand].sort((left, right) => DECK.indexOf(left) - DECK.indexOf(right));
}

/** 洗牌发第 state.round 轮：首位玩家已经定好。 */
function deal(state: GameState, rng: Rng, events: GameEvent[]): void {
  const hands = handCountFor(state);
  const size = handSizeFor(state.round, hands);
  const deck = rng.shuffle(DECK);
  state.handSize = size;
  state.hands = {};
  state.handCounts = {};
  state.players.forEach((player, index) => {
    state.hands[player.id] = sortHand(deck.slice(index * size, (index + 1) * size));
    state.handCounts[player.id] = size;
    player.bid = null;
    player.bidSubmitted = false;
    player.won = 0;
  });
  const dealt = state.players.length * size;
  if (state.config.ghost) {
    state.ghostQueue = deck.slice(dealt, dealt + size);
    state.handCounts[GHOST_ID] = size;
    state.undealt = deck.slice(dealt + size);
  } else {
    state.ghostQueue = [];
    state.undealt = deck.slice(dealt);
  }
  state.phase = "bid";
  state.trickNo = 0;
  state.leader = state.firstPlayer;
  state.trick = [];
  state.turn = null;
  state.tricks = [];
  state.ready = [];
  events.push({ type: "RoundStarted", round: state.round, handSize: size, first: state.firstPlayer });
}

function playCard(state: GameState, by: string, card: CardId, as: TigressAs | undefined, events: GameEvent[]): void {
  const play: PlayedCard = as ? { by, card, as } : { by, card };
  state.trick.push(play);
  state.handCounts[by] = (state.handCounts[by] ?? 1) - 1;
  events.push(as ? { type: "CardPlayed", player: by, card, as } : { type: "CardPlayed", player: by, card });
}

/** 出完一张后：幽灵自动翻牌，整墩出完就判赢家进 trickEnd，否则轮到下一个真人。 */
function settle(state: GameState, events: GameEvent[]): void {
  const order = playOrder(state, state.leader);
  while (state.trick.length < order.length) {
    const next = order[state.trick.length]!;
    if (next !== GHOST_ID) {
      state.turn = next;
      return;
    }
    // 幽灵翻顶牌，不受跟花色限制；双面海盗一律当白旗。
    const card = state.ghostQueue.shift()!;
    playCard(state, GHOST_ID, card, cardInfo(card).kind === "tigress" ? "escape" : undefined, events);
  }
  const winnerIndex = trickWinner(state.trick);
  const winning = state.trick[winnerIndex]!;
  const bonus = trickBonus(state.trick, winnerIndex);
  state.tricks.push({ leader: state.leader, plays: state.trick, winner: winning.by, winnerIndex, bonus });
  if (winning.by !== GHOST_ID) playerById(state, winning.by).won += 1;
  state.phase = "trickEnd";
  state.turn = null;
  events.push({ type: "TrickWon", winner: winning.by, card: winning.card, bonus, trick: state.trickNo });
}

function scoreRound(state: GameState, events: GameEvent[]): void {
  const results: RoundPlayerResult[] = state.players.map((player) => {
    const bid = player.bid ?? 0;
    const bonusSum = state.tricks.filter((trick) => trick.winner === player.id).reduce((sum, trick) => sum + bonusTotal(trick.bonus), 0);
    const hit = bid === player.won;
    const base = bidPoints(bid, player.won, state.handSize);
    const bonus = hit ? bonusSum : 0;
    player.score += base + bonus;
    return { player: player.id, bid, won: player.won, bidPoints: base, bonus, lostBonus: hit ? 0 : bonusSum, points: base + bonus, total: player.score };
  });
  state.history.push({ round: state.round, handSize: state.handSize, results });
  events.push({ type: "RoundScored", round: state.round });
}

function finish(state: GameState, events: GameEvent[]): void {
  const best = Math.max(...state.players.map((player) => player.score));
  const winners = state.players.filter((player) => player.score === best).map((player) => player.id);
  state.phase = "finished";
  state.turn = null;
  state.finalResult = { winners, totals: Object.fromEntries(state.players.map((player) => [player.id, player.score])) };
  events.push({ type: "GameEnded", winners });
}

function startNextRound(state: GameState, rng: Rng, events: GameEvent[]): void {
  state.round += 1;
  state.firstPlayer = nextPlayerId(state, state.firstPlayer);
  deal(state, rng, events);
}

/** trickEnd → 下一墩 / 本轮计分；roundEnd → 发下一轮。原地修改。 */
function advanceInPlace(state: GameState, rng: Rng, events: GameEvent[]): void {
  if (state.phase === "trickEnd") {
    const last = state.tricks[state.tricks.length - 1]!;
    if (state.trickNo + 1 < state.handSize) {
      state.trickNo += 1;
      state.leader = last.winner;
      state.trick = [];
      state.phase = "play";
      settle(state, events);
      return;
    }
    scoreRound(state, events);
    if (state.round >= state.config.rounds) finish(state, events);
    else {
      state.phase = "roundEnd";
      state.ready = [];
    }
    return;
  }
  if (state.phase === "roundEnd") {
    startNextRound(state, rng, events);
    return;
  }
  throw new Error("现在不需要自动推进。");
}

function revealBids(state: GameState, events: GameEvent[]): void {
  events.push({ type: "BidsRevealed", bids: Object.fromEntries(state.players.map((player) => [player.id, player.bid!])) });
  state.phase = "play";
  state.trickNo = 0;
  state.leader = state.firstPlayer;
  state.trick = [];
  settle(state, events);
}

function applyBid(state: GameState, player: Player, n: unknown, events: GameEvent[]): void {
  if (state.phase !== "bid") throw new Error("现在不是叫墩的时候。");
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > state.handSize) {
    throw new Error(`叫墩要在 0 到 ${state.handSize} 之间。`);
  }
  player.bid = n;
  player.bidSubmitted = true;
  events.push({ type: "BidSubmitted", player: player.id });
  if (state.players.every((candidate) => candidate.bidSubmitted)) revealBids(state, events);
}

function applyPlay(state: GameState, player: Player, card: unknown, as: unknown, events: GameEvent[]): void {
  if (state.phase !== "play") throw new Error("现在不是出牌的时候。");
  if (state.turn !== player.id) throw new Error("还没轮到你。");
  if (!isCard(card)) throw new Error("没有这张牌。");
  const hand = state.hands[player.id] ?? [];
  if (!hand.includes(card)) throw new Error("你手里没有这张牌。");
  const tigress = cardInfo(card).kind === "tigress";
  if (tigress && as !== "pirate" && as !== "escape") throw new Error("双面海盗要选当海盗还是当白旗。");
  if (!tigress && as !== undefined) throw new Error("只有双面海盗能选身份。");
  if (!legalCards(hand, state.trick).includes(card)) throw new Error("要跟领出的花色。");
  state.hands[player.id] = hand.filter((candidate) => candidate !== card);
  playCard(state, player.id, card, tigress ? (as as TigressAs) : undefined, events);
  settle(state, events);
}

export function apply(state: GameState, playerId: string, command: GameCommand, rng: Rng): { state: GameState; events: GameEvent[] } {
  if (state.phase === "finished") throw new Error("对局已经结束。");
  const next = structuredClone(state);
  const player = playerById(next, playerId);
  const events: GameEvent[] = [];
  switch (command?.type) {
    case "BID":
      applyBid(next, player, command.n, events);
      break;
    case "UNBID":
      if (next.phase !== "bid") throw new Error("叫墩已经亮出，不能再改。");
      if (!player.bidSubmitted) throw new Error("你还没有叫墩。");
      player.bid = null;
      player.bidSubmitted = false;
      events.push({ type: "BidWithdrawn", player: player.id });
      break;
    case "PLAY":
      applyPlay(next, player, command.card, command.as, events);
      break;
    case "CONTINUE":
      if (next.phase !== "roundEnd") throw new Error("现在不需要继续。");
      if (!next.ready.includes(player.id)) next.ready.push(player.id);
      if (next.players.every((candidate) => next.ready.includes(candidate.id))) advanceInPlace(next, rng, events);
      break;
    default:
      throw new Error("未知的行动。");
  }
  next.version += 1;
  next.events = events;
  return { state: next, events };
}

/** 系统推进（服务器在 trickEnd 停顿后、roundEnd 到时调用）。 */
export function advance(state: GameState, rng: Rng): { state: GameState; events: GameEvent[] } {
  const next = structuredClone(state);
  const events: GameEvent[] = [];
  advanceInPlace(next, rng, events);
  next.version += 1;
  next.events = events;
  return { state: next, events };
}

function withRng(
  state: GameState,
  entry: NonNullable<GameState["log"]>[number],
  run: (rng: Rng) => { state: GameState; events: GameEvent[] },
): GameState {
  const rng = createRng(state.rngState ?? state.seed ?? 0);
  const { state: next } = run(rng);
  next.rngState = rng.state;
  next.log = [...(state.log ?? []), entry];
  return next;
}

/** 服务端用：随机数状态从 state 里取、再存回去。 */
export function applyCommand(state: GameState, playerId: string, command: GameCommand): GameState {
  return withRng(state, { player: playerId, command }, (rng) => apply(state, playerId, command, rng));
}

export function advanceGame(state: GameState): GameState {
  return withRng(state, { player: "", command: { type: "ADVANCE" } }, (rng) => advance(state, rng));
}

/** 现在要谁行动：叫墩时是还没叫的人；出牌时是轮到的人；结算页是还没点继续的人；trickEnd 没人（自动推进）。 */
export function pendingActors(state: GameState): string[] {
  switch (state.phase) {
    case "bid":
      return state.players.filter((player) => !player.bidSubmitted).map((player) => player.id);
    case "play":
      return state.turn ? [state.turn] : [];
    case "roundEnd":
      return state.players.filter((player) => !state.ready.includes(player.id)).map((player) => player.id);
    default:
      return [];
  }
}

/**
 * 计时用的「这一步」标识：只在换人或换步骤时变。叫墩阶段整段一个 key（别人叫墩、撤回都不会重置倒计时）。
 */
export function stepKey(state: GameState): string {
  switch (state.phase) {
    case "bid":
      return `${state.round}:bid`;
    case "play":
      return `${state.round}:${state.trickNo}:${state.trick.length}`;
    case "trickEnd":
      return `${state.round}:${state.trickNo}:end`;
    case "roundEnd":
      return `${state.round}:end`;
    case "finished":
      return "finished";
  }
}

export function legalActions(state: GameState, playerId: string): GameCommand[] {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return [];
  switch (state.phase) {
    case "bid": {
      const bids: GameCommand[] = Array.from({ length: state.handSize + 1 }, (_, n) => ({ type: "BID", n }));
      return player.bidSubmitted ? [...bids, { type: "UNBID" }] : bids;
    }
    case "play":
      if (state.turn !== playerId) return [];
      return legalCards(state.hands[playerId] ?? [], state.trick).flatMap((card): GameCommand[] =>
        cardInfo(card).kind === "tigress"
          ? [{ type: "PLAY", card, as: "pirate" }, { type: "PLAY", card, as: "escape" }]
          : [{ type: "PLAY", card }],
      );
    case "roundEnd":
      return state.ready.includes(playerId) ? [] : [{ type: "CONTINUE" }];
    default:
      return [];
  }
}

/**
 * 「最不可能赢」的大概强度，越小越安全（超时默认出牌用）：
 * 白旗 < 双面海盗当白旗 < 垫的普通花色 < 领出花色 < 黑旗 < 美人鱼 < 海盗 < 鬼船长。
 */
function danger(card: CardId, lead: ReturnType<typeof leadSuitOf>): number {
  const info = cardInfo(card);
  switch (info.kind) {
    case "escape":
      return 0;
    case "tigress":
      return 1;
    case "mermaid":
      return 80;
    case "pirate":
      return 90;
    case "captain":
      return 100;
    case "number":
      if (info.suit === TRUMP) return 50 + info.rank;
      if (lead && lead !== "none" && info.suit === lead) return 30 + info.rank;
      return 10 + info.rank;
  }
}

/** 超时的默认出牌：合法牌里最不可能赢的一张，双面海盗当白旗。 */
export function safestPlay(state: GameState, playerId: string): GameCommand {
  const lead = leadSuitOf(state.trick);
  const legal = legalCards(state.hands[playerId] ?? [], state.trick);
  const card = [...legal].sort((left, right) => danger(left, lead) - danger(right, lead) || rankOf(left) - rankOf(right))[0]!;
  return cardInfo(card).kind === "tigress" ? { type: "PLAY", card, as: "escape" } : { type: "PLAY", card };
}

/** 超时的默认叫墩：round(本轮手牌数 / 人数)。 */
export function defaultBid(state: GameState): number {
  return Math.round(state.handSize / state.players.length);
}

/**
 * 这一步超时，没有人机时的默认处理（服务器优先让人机代打，见 apps/server）：
 * 叫墩 → 没叫的人叫 defaultBid；出牌 → safestPlay；结算页 → 进下一轮；trickEnd → 下一墩。
 */
export function timeoutStep(state: GameState): GameState {
  if (state.phase === "finished") return state;
  const pending = pendingActors(state);
  const phase = state.phase;
  let current = state;
  if (phase === "bid") {
    for (const id of pending) current = applyCommand(current, id, { type: "BID", n: defaultBid(current) });
  } else if (phase === "play") {
    current = applyCommand(current, pending[0]!, safestPlay(current, pending[0]!));
  } else {
    current = advanceGame(current);
  }
  if (pending.length > 0 && phase !== "trickEnd") {
    current = { ...current, events: [{ type: "TimedOut", players: pending, phase }, ...current.events] };
  }
  return current;
}

export interface RedactOptions {
  /** 观战上帝视角：能看所有人的手牌和没亮的叫墩；牌堆、幽灵的牌、种子照样看不到。 */
  readonly seeAll?: boolean;
}

/**
 * 隐藏信息只经过这里下发：
 * - 别人的手牌 → 空数组（张数在 handCounts）；
 * - 幽灵的牌、没发的牌、种子、随机数状态、动作序列 → 谁都不给；
 * - 叫墩亮出之前，别人的叫墩数 → null（只看 bidSubmitted）。
 */
export function redactGameForViewer(state: GameState, viewerId: string, options: RedactOptions = {}): GameState {
  const { seed: _seed, rngState: _rngState, log: _log, ...rest } = state;
  const view = structuredClone(rest) as GameState;
  view.ghostQueue = [];
  view.undealt = [];
  if (!options.seeAll) {
    for (const id of Object.keys(view.hands)) if (id !== viewerId) view.hands[id] = [];
    if (view.phase === "bid") {
      for (const player of view.players) if (player.id !== viewerId) player.bid = null;
    }
  }
  return view;
}

export function createGame(
  players: readonly NewPlayer[],
  seed = Math.floor(Math.random() * 2 ** 32),
  overrides: Partial<Config> = {},
): GameState {
  const config = defaultConfig(players.length, overrides);
  if (players.length < config.minPlayers || players.length > config.maxPlayers) {
    throw new Error(`需要 ${config.minPlayers}–${config.maxPlayers} 位玩家才能开始。`);
  }
  const rng = createRng(seed);
  const first = rng.int(players.length);
  const state: GameState = {
    config,
    phase: "bid",
    players: players.map((player, index) => ({ id: player.id, name: player.name, seat: index, score: 0, bid: null, bidSubmitted: false, won: 0 })),
    round: 1,
    handSize: 1,
    firstPlayer: players[first]!.id,
    hands: {},
    handCounts: {},
    ghostQueue: [],
    undealt: [],
    trickNo: 0,
    leader: players[first]!.id,
    trick: [],
    turn: null,
    tricks: [],
    ready: [],
    history: [],
    events: [],
    version: 0,
    seed,
  };
  const events: GameEvent[] = [];
  deal(state, rng, events);
  state.events = events;
  state.rngState = rng.state;
  return state;
}

/** 庄家（本轮首位玩家的上家），界面显示用。 */
export function dealerOf(state: Pick<GameState, "players" | "firstPlayer">): string {
  const index = state.players.findIndex((player) => player.id === state.firstPlayer);
  return state.players[(index - 1 + state.players.length) % state.players.length]!.id;
}

/** 本轮出过的牌（打完的墩 + 当前这墩），记牌辅助用。 */
export function playedThisRound(state: Pick<GameState, "tricks" | "trick" | "phase">): PlayedCard[] {
  return [...state.tricks.flatMap((trick) => trick.plays), ...(state.phase === "play" ? state.trick : [])];
}


