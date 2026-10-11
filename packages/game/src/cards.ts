import type { BonusItem, CardId, PlayedCard, SpecialKind, Suit, TigressAs } from "./types.js";

export const SUITS: readonly Suit[] = ["seaweed", "coin", "compass", "flag"];
/** 三种普通花色（黑旗是王牌）。 */
export const PLAIN_SUITS: readonly Suit[] = ["seaweed", "coin", "compass"];
export const TRUMP: Suit = "flag";

export const SUIT_NAMES: Record<Suit, string> = { seaweed: "海藻", coin: "金币", compass: "罗盘", flag: "黑旗" };
export const SPECIAL_NAMES: Record<SpecialKind, string> = {
  pirate: "海盗",
  tigress: "双面海盗",
  captain: "鬼船长",
  mermaid: "美人鱼",
  escape: "白旗",
};

/** 70 张基础牌，顺序固定（洗牌前）。 */
export const DECK: readonly CardId[] = [
  ...SUITS.flatMap((suit) => Array.from({ length: 14 }, (_, index) => `${suit}-${index + 1}`)),
  ...[1, 2, 3, 4, 5].map((n) => `pirate-${n}`),
  "tigress",
  "captain",
  "mermaid-1",
  "mermaid-2",
  ...[1, 2, 3, 4, 5].map((n) => `escape-${n}`),
];

export type CardInfo =
  | { readonly kind: "number"; readonly suit: Suit; readonly rank: number }
  | { readonly kind: SpecialKind };

const INFO = new Map<CardId, CardInfo>(
  DECK.map((card): [CardId, CardInfo] => {
    const [head, tail] = card.split("-");
    if ((SUITS as readonly string[]).includes(head!)) return [card, { kind: "number", suit: head as Suit, rank: Number(tail) }];
    return [card, { kind: head as SpecialKind }];
  }),
);

export function isCard(value: unknown): value is CardId {
  return typeof value === "string" && INFO.has(value);
}

export function cardInfo(card: CardId): CardInfo {
  const info = INFO.get(card);
  if (!info) throw new Error(`没有这张牌：${card}`);
  return info;
}

export function isSpecial(card: CardId): boolean {
  return cardInfo(card).kind !== "number";
}

export function suitOf(card: CardId): Suit | null {
  const info = cardInfo(card);
  return info.kind === "number" ? info.suit : null;
}

export function rankOf(card: CardId): number {
  const info = cardInfo(card);
  return info.kind === "number" ? info.rank : 0;
}

/** 界面和日志用的中文牌名，例如「金币 14」「鬼船长」。 */
export function cardName(card: CardId, as?: TigressAs): string {
  const info = cardInfo(card);
  if (info.kind === "number") return `${SUIT_NAMES[info.suit]} ${info.rank}`;
  if (info.kind === "tigress" && as) return `双面海盗（当${as === "pirate" ? "海盗" : "白旗"}）`;
  return SPECIAL_NAMES[info.kind];
}

/** 一张出到桌上的牌在本墩里按什么算：双面海盗换成声明的身份。 */
export type Effective = "number" | "pirate" | "captain" | "mermaid" | "escape";

export function effectiveKind(play: Pick<PlayedCard, "card" | "as">): Effective {
  const info = cardInfo(play.card);
  if (info.kind === "tigress") return play.as === "pirate" ? "pirate" : "escape";
  return info.kind;
}

/**
 * 本墩的领出花色：按出牌顺序找第一张不是白旗类的牌。
 * - 数字牌 → 它的花色；
 * - 角色牌（海盗、鬼船长、美人鱼、当海盗的双面海盗）→ "none"，本墩没有花色；
 * - 还没有这样的牌（没出牌或全是白旗）→ null，下一张来定。
 */
export function leadSuitOf(plays: readonly Pick<PlayedCard, "card" | "as">[]): Suit | "none" | null {
  for (const play of plays) {
    const kind = effectiveKind(play);
    if (kind === "escape") continue;
    if (kind === "number") return suitOf(play.card);
    return "none";
  }
  return null;
}

/** 手里哪些牌现在能出：特殊牌随时能出；有领出花色的数字牌就只能出那个花色的数字牌。 */
export function legalCards(hand: readonly CardId[], plays: readonly Pick<PlayedCard, "card" | "as">[]): CardId[] {
  const lead = leadSuitOf(plays);
  if (lead === null || lead === "none") return [...hand];
  if (!hand.some((card) => suitOf(card) === lead)) return [...hand];
  return hand.filter((card) => isSpecial(card) || suitOf(card) === lead);
}

/** 为什么不能出这张（界面悬停提示）；能出返回 null。 */
export function illegalReason(hand: readonly CardId[], plays: readonly Pick<PlayedCard, "card" | "as">[], card: CardId): string | null {
  if (legalCards(hand, plays).includes(card)) return null;
  const lead = leadSuitOf(plays);
  return lead && lead !== "none" ? `要跟${SUIT_NAMES[lead]}` : "现在不能出这张";
}

/**
 * 本墩赢家在 plays 里的下标（规则书 §4.4，从上往下第一条成立的）：
 * ① 有美人鱼也有鬼船长 → 最先出的美人鱼；② 鬼船长；③ 最先出的海盗；④ 最先出的美人鱼；
 * ⑤ 最大的黑旗；⑥ 领出花色里最大的；⑦ 全是白旗 → 最先出的白旗。
 */
export function trickWinner(plays: readonly Pick<PlayedCard, "card" | "as">[]): number {
  if (plays.length === 0) throw new Error("空的一墩没有赢家。");
  const kinds = plays.map(effectiveKind);
  const first = (kind: Effective) => kinds.indexOf(kind);
  const mermaid = first("mermaid");
  const captain = first("captain");
  if (mermaid >= 0 && captain >= 0) return mermaid;
  if (captain >= 0) return captain;
  const pirate = first("pirate");
  if (pirate >= 0) return pirate;
  if (mermaid >= 0) return mermaid;
  const highest = (suit: Suit) => {
    let best = -1;
    plays.forEach((play, index) => {
      if (kinds[index] === "number" && suitOf(play.card) === suit && (best < 0 || rankOf(play.card) > rankOf(plays[best]!.card))) best = index;
    });
    return best;
  };
  const trump = highest(TRUMP);
  if (trump >= 0) return trump;
  const lead = leadSuitOf(plays);
  if (lead && lead !== "none") {
    const led = highest(lead);
    if (led >= 0) return led;
  }
  return 0;
}

/**
 * 赢下这一墩能拿的奖励分明细（规则书 §6.3；只有赢家叫中时才计入）：
 * 普通花色 14 每张 +10，黑旗 14 +20；海盗赢的每张美人鱼 +20；鬼船长赢的每张海盗（含当海盗的双面海盗）+30；
 * 美人鱼赢而且墩里有鬼船长 +40（三种都在时只拿这 40）。
 */
export function trickBonus(plays: readonly Pick<PlayedCard, "card" | "as">[], winnerIndex: number): BonusItem[] {
  const items: BonusItem[] = [];
  for (const play of plays) {
    const info = cardInfo(play.card);
    if (info.kind === "number" && info.rank === 14) {
      items.push(info.suit === TRUMP ? { kind: "flag14", points: 20, card: play.card } : { kind: "fourteen", points: 10, card: play.card });
    }
  }
  const winnerKind = effectiveKind(plays[winnerIndex]!);
  plays.forEach((play, index) => {
    if (index === winnerIndex) return;
    const kind = effectiveKind(play);
    if (winnerKind === "pirate" && kind === "mermaid") items.push({ kind: "pirateMermaid", points: 20, card: play.card });
    if (winnerKind === "captain" && kind === "pirate") items.push({ kind: "captainPirate", points: 30, card: play.card });
    if (winnerKind === "mermaid" && kind === "captain") items.push({ kind: "mermaidCaptain", points: 40, card: play.card });
  });
  return items;
}

export function bonusTotal(items: readonly BonusItem[]): number {
  return items.reduce((sum, item) => sum + item.points, 0);
}

/** 本轮叫墩分（不含奖励）：叫 0 按本轮每人手牌数 ±10×张数；叫 1 以上叫中 +20×叫墩，叫错 −10×差几墩。 */
export function bidPoints(bid: number, won: number, handSize: number): number {
  if (bid === 0) return won === 0 ? 10 * handSize : -10 * handSize;
  return won === bid ? 20 * bid : -10 * Math.abs(won - bid);
}

/** 本轮得分 = 叫墩分 + 奖励分（奖励只在叫中时算）。 */
export function roundScore(bid: number, won: number, handSize: number, bonus: number): number {
  return bidPoints(bid, won, handSize) + (bid === won ? bonus : 0);
}

/** 每轮每人发几张：min(轮数, ⌊70 / 发牌手数⌋)；2 人局发 3 手（含幽灵）。 */
export function handSize(round: number, hands: number): number {
  return Math.min(round, Math.floor(DECK.length / hands));
}
