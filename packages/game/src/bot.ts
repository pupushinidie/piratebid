/**
 * 人机（「普通」难度）：只看它自己座位的视图（redactGameForViewer 之后的状态），不作弊。
 *
 * 核心是「这张牌能赢下一墩的概率」：
 * - 看得到的牌（自己手里、桌上出过的）以外都是「没见过的牌」U；
 * - 一张牌被压住，要后面某个人手里有能压过它的牌（B 张），而且他愿意出：
 *   P(某人有) = 1 − C(U−B, h)/C(U, h)（h = 他的手牌数），愿意出的程度按他还差不差墩估；
 * - 2 人局的幽灵翻的是一张随机牌：P = B/U，而且一定出。
 *
 * 叫墩：每张牌估一个将来赢墩的概率 f，按「每张牌独立」算出赢几墩的分布，挑期望得分最高的叫墩数。
 * 出牌：每种出法估「这墩赢的概率 P」和剩下每张牌将来赢墩的概率，算出这一轮最后赢几墩的分布，
 *       挑这一轮期望得分最高的（叫够了就躲、还差就抢、牌太强就趁安全时垫掉大牌），
 *       再加上能抓到的奖励分（海盗抓美人鱼、鬼船长抓海盗、美人鱼抓鬼船长、14）乘叫中的概率。
 */
import { bidPoints, bonusTotal, cardInfo, cardName, DECK, effectiveKind, leadSuitOf, legalCards, rankOf, suitOf, trickBonus, trickWinner, TRUMP } from "./cards.js";
import { legalActions, playOrder } from "./engine.js";
import { GHOST_ID, type CardId, type GameCommand, type GameState, type PlayedCard, type TigressAs } from "./types.js";

export interface BotDecision {
  readonly command: GameCommand;
  /** 给玩家看的一句理由（教程「提示」用）。 */
  readonly reason: string;
}

/** 可调参数（模拟脚本 sim-piratebid.ts 用来调参）。 */
export interface BotParams {
  /** 将来的墩里，对手愿意出能压过的牌的程度（不知道他们缺不缺墩时）。 */
  willing: number;
  /** 普通花色数字牌将来常常不是领出花色、只能垫：打个折。 */
  offSuit: number;
  /** 叫墩时人机能控制多赢少赢：误差折算系数（1 = 不折算）。 */
  control: number;
  /** 白旗、双面海盗是躲墩的本钱，不需要时别乱用。 */
  escapeKeep: number;
  tigressKeep: number;
}

export const BOT_PARAMS: BotParams = { willing: 0.7, offSuit: 0.7, control: 0.7, escapeKeep: 4, tigressKeep: 7 };

interface Opponent {
  readonly id: string;
  /** 手里还有几张（幽灵是翻一张随机牌）。 */
  readonly hand: number;
  readonly ghost: boolean;
  /** 他愿意出压牌的程度 0–1。 */
  readonly willing: number;
}

interface Context {
  readonly unseen: CardId[];
  /** 本墩还没出牌的对手（按出牌顺序，不含自己）。 */
  readonly after: Opponent[];
  /** 将来的墩里的对手（所有对手）。 */
  readonly everyone: Opponent[];
}

/** 从 U 张里抽 h 张，一张 B 类都没抽到的概率。 */
function noneDrawn(U: number, B: number, h: number): number {
  if (B <= 0) return 1;
  if (h >= U) return 0;
  let p = 1;
  for (let j = 0; j < h; j += 1) {
    p *= (U - B - j) / (U - j);
    if (p <= 0) return 0;
  }
  return p;
}

function willingOf(state: GameState, playerId: string, params: BotParams): number {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || state.phase === "bid" || player.bid === null) return params.willing;
  const need = player.bid - player.won;
  if (need > 0) return 0.9;
  // 叫够了（或叫 0）的人会躲，但有时被迫只能出大的
  return 0.25;
}

function context(state: GameState, me: string, params: BotParams): Context {
  const hand = state.hands[me] ?? [];
  const seen = new Set<CardId>([
    ...hand,
    ...state.tricks.flatMap((trick) => trick.plays.map((play) => play.card)),
    ...(state.phase === "play" ? state.trick.map((play) => play.card) : []),
  ]);
  const unseen = DECK.filter((card) => !seen.has(card));
  const opponent = (id: string): Opponent =>
    id === GHOST_ID
      ? { id, hand: state.handCounts[GHOST_ID] ?? 0, ghost: true, willing: 1 }
      : { id, hand: state.handCounts[id] ?? 0, ghost: false, willing: willingOf(state, id, params) };
  const everyone = [...state.players.map((player) => player.id).filter((id) => id !== me), ...(state.config.ghost ? [GHOST_ID] : [])].map(opponent);
  const after = state.phase === "play" ? playOrder(state, state.leader).slice(state.trick.length + 1).map(opponent) : [];
  return { unseen, after, everyone };
}

/** 一个对手（在我之后出）让「我这张」输掉的概率。 */
function threat(opponent: Opponent, unseen: readonly CardId[], beats: (card: CardId) => boolean): number {
  if (opponent.ghost) {
    if (unseen.length === 0) return 0;
    return unseen.filter((card) => card !== "tigress" && beats(card)).length / unseen.length;
  }
  const beaters = unseen.filter(beats).length;
  return (1 - noneDrawn(unseen.length, beaters, opponent.hand)) * opponent.willing;
}

/** 在 trick 后面出 play，最后赢下这一墩的大概概率。 */
function winChance(trick: readonly PlayedCard[], play: PlayedCard, after: readonly Opponent[], unseen: readonly CardId[]): number {
  const mine = [...trick, play];
  const index = mine.length - 1;
  const leading = trickWinner(mine) === index;
  // 后面来一张 card 之后，我这张还是不是赢家（双面海盗按当海盗算，最坏情况）
  const stillMine = (card: CardId) => {
    const next: PlayedCard = cardInfo(card).kind === "tigress" ? { by: "x", card, as: "pirate" } : { by: "x", card };
    return trickWinner([...mine, next]) === index;
  };
  if (leading) {
    let p = 1;
    for (const opponent of after) p *= 1 - threat(opponent, unseen, (card) => !stillMine(card));
    return p;
  }
  // 现在没赢，只有后面出的牌把局面翻过来（美人鱼遇到后出的鬼船长）才可能赢
  let rescue = 1;
  for (const opponent of after) rescue *= 1 - threat({ ...opponent, willing: Math.min(opponent.willing, 0.5) }, unseen, stillMine);
  return (1 - rescue) * 0.5;
}

/** 这张牌留到将来某一墩，大概能赢下的概率（按自己领出估，普通花色再打折）。 */
function futureWin(card: CardId, ctx: Context, params: BotParams): number {
  const kind = cardInfo(card).kind;
  if (kind === "escape") return 0;
  const play: PlayedCard = kind === "tigress" ? { by: "me", card, as: "pirate" } : { by: "me", card };
  const opponents = ctx.everyone.map((opponent) => (opponent.ghost ? opponent : { ...opponent, willing: Math.min(opponent.willing, params.willing) }));
  const p = winChance([], play, opponents, ctx.unseen);
  if (kind === "number") return suitOf(card) === TRUMP ? p * 0.95 : p * params.offSuit;
  if (kind === "tigress") return p * 0.85;
  return p;
}

/** 赢下这一墩能拿的奖励（只看这墩已经出了的牌 + 我的牌）。 */
function bonusIfWin(trick: readonly PlayedCard[], play: PlayedCard): number {
  const plays = [...trick, play];
  const winner = trickWinner(plays);
  if (winner !== plays.length - 1) return 0;
  return bonusTotal(trickBonus(plays, winner));
}

/** 每张牌独立地以概率 probs[i] 赢一墩时，一共赢几墩的分布。 */
function winDistribution(probs: readonly number[]): number[] {
  let dist = [1];
  for (const f of probs) {
    const next = new Array<number>(dist.length + 1).fill(0);
    dist.forEach((p, w) => {
      next[w]! += p * (1 - f);
      next[w + 1]! += p * f;
    });
    dist = next;
  }
  return dist;
}

/** 叫墩：按每张牌的 f 算赢墩数的分布，挑期望得分最高的。 */
function decideBid(state: GameState, me: string, params: BotParams): BotDecision {
  const hand = state.hands[me] ?? [];
  const ctx = context(state, me, params);
  const values = hand.map((card) => ({ card, f: futureWin(card, ctx, params) }));
  const dist = winDistribution(values.map((value) => value.f));
  const mean = values.reduce((sum, value) => sum + value.f, 0);
  const strongCount = hand.filter((card) => ["captain", "pirate"].includes(cardInfo(card).kind)).length;
  let best = { bid: 0, score: -Infinity };
  for (let bid = 0; bid <= state.handSize; bid += 1) {
    let score = 0;
    dist.forEach((p, w) => {
      // 叫 1 以上时多赢的墩常常能躲掉、少赢的能补：误差按 control 折算
      const adjusted = bid === 0 ? w : Math.round(bid + (w - bid) * params.control);
      score += p * bidPoints(bid, adjusted, state.handSize);
    });
    // 手里有鬼船长或海盗时叫 0 风险很大
    if (bid === 0 && strongCount > 0) score -= 15 * strongCount * state.handSize;
    if (score > best.score) best = { bid, score };
  }
  const strong = values.filter((value) => value.f >= 0.45).map((value) => cardName(value.card));
  const reason =
    best.bid === 0
      ? strong.length === 0
        ? "手里没有能稳赢的大牌，叫 0 墩，打的时候尽量躲"
        : `估计能赢 ${mean.toFixed(1)} 墩，但叫 0 更稳，打的时候趁安全把 ${strong.join("、")} 垫掉`
      : `${strong.length > 0 ? `手里有 ${strong.slice(0, 3).join("、")}，` : ""}估计能赢 ${mean.toFixed(1)} 墩，叫 ${best.bid} 墩`;
  return { command: { type: "BID", n: best.bid }, reason };
}

interface Option {
  readonly play: PlayedCard;
  readonly value: number;
  readonly p: number;
  readonly bonus: number;
}

function decidePlay(state: GameState, me: string, params: BotParams): BotDecision {
  const hand = state.hands[me] ?? [];
  const player = state.players.find((candidate) => candidate.id === me)!;
  const ctx = context(state, me, params);
  const bid = player.bid ?? 0;
  const need = bid - player.won;
  const fValues = new Map(hand.map((card) => [card, futureWin(card, ctx, params)]));
  const broken = bid === 0 && player.won > 0; // 叫 0 已经吃了墩：这轮分数定了
  const options: Option[] = [];
  for (const card of legalCards(hand, state.trick)) {
    const kind = cardInfo(card).kind;
    const variants: PlayedCard[] = kind === "tigress" ? [{ by: me, card, as: "pirate" }, { by: me, card, as: "escape" }] : [{ by: me, card }];
    // 剩下的牌将来能再赢几墩的分布
    const rest = winDistribution(hand.filter((other) => other !== card).map((other) => fValues.get(other)!));
    for (const play of variants) {
      const p = winChance(state.trick, play, ctx.after, ctx.unseen);
      const bonus = bonusIfWin(state.trick, play);
      let value: number;
      if (broken) value = -p;
      else {
        // 这一轮的期望得分：这墩赢（概率 p）或不赢，再加上将来的墩
        value = 0;
        rest.forEach((q, w) => {
          value += q * (p * bidPoints(bid, player.won + 1 + w, state.handSize) + (1 - p) * bidPoints(bid, player.won + w, state.handSize));
        });
        // 赢这墩的奖励只有最后叫中才算
        if (need > 0) value += p * bonus * (rest[need - 1] ?? 0);
      }
      if (kind === "escape") value -= params.escapeKeep;
      if (kind === "tigress") value -= params.tigressKeep;
      // 打平时出小的、留大的
      value -= rankOf(card) * 0.01;
      options.push({ play, value, p, bonus });
    }
  }
  options.sort((left, right) => right.value - left.value);
  const choice = options[0]!;
  const command: GameCommand = choice.play.as ? { type: "PLAY", card: choice.play.card, as: choice.play.as } : { type: "PLAY", card: choice.play.card };
  return { command, reason: playReason(state, choice, need, broken) };
}

function playReason(state: GameState, choice: Option, need: number, broken: boolean): string {
  const name = cardName(choice.play.card, choice.play.as);
  const lead = leadSuitOf(state.trick);
  if (broken) return `叫 0 已经吃了墩，这轮分数定了，出${name}`;
  if (need > 0) {
    if (choice.bonus > 0 && choice.p >= 0.5) return `还差 ${need} 墩，出${name}很可能赢下这墩，还能拿 +${choice.bonus} 奖励`;
    if (choice.p >= 0.6) return `还差 ${need} 墩，出${name}很可能赢下这墩`;
    if (choice.p >= 0.25) return `还差 ${need} 墩，出${name}争一下这墩`;
    return `还差 ${need} 墩，但这墩不好抢，先出${name}，大牌留着以后用`;
  }
  const kind = effectiveKind(choice.play);
  if (choice.p < 0.1) {
    if (kind === "escape") return `已经叫够了，出${name}躲开这墩`;
    if (state.trick.length > 0 && rankOf(choice.play.card) >= 10) return `已经叫够了，这墩有人压着，趁机把${name}垫掉`;
    if (lead && lead !== "none" && suitOf(choice.play.card) !== lead) return `已经叫够了，垫一张${name}`;
    return `已经叫够了，出${name}，不容易赢`;
  }
  return `已经叫够了，没有安全的牌，出${name}风险最小`;
}

/** 人机下一步和理由；不需要它动时返回 null。state 应该是 redactGameForViewer(game, playerId)。 */
export function botDecision(state: GameState, playerId: string, params: BotParams = BOT_PARAMS): BotDecision | null {
  if (legalActions(state, playerId).length === 0) return null;
  switch (state.phase) {
    case "bid": {
      const player = state.players.find((candidate) => candidate.id === playerId)!;
      if (player.bidSubmitted) return null;
      return decideBid(state, playerId, params);
    }
    case "play":
      return decidePlay(state, playerId, params);
    case "roundEnd":
      return { command: { type: "CONTINUE" }, reason: "看完结算，继续下一轮" };
    default:
      return null;
  }
}

/** 轮到 playerId 时人机的下一步；不需要它动时返回 null。state 应该是 redactGameForViewer(game, playerId)。 */
export function botCommand(state: GameState, playerId: string, params: BotParams = BOT_PARAMS): GameCommand | null {
  return botDecision(state, playerId, params)?.command ?? null;
}
