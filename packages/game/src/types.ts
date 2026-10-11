/**
 * 海盗叫墩的类型。规则见仓库 README 和规则书 ~/Desktop/游戏规则/海盗叫墩.md。
 *
 * 牌（70 张）：
 * - 数字牌 56 张：海藻 seaweed、金币 coin、罗盘 compass 三种普通花色 + 黑旗 flag（王牌），各 1–14。id 形如 "coin-14"。
 * - 特殊牌 14 张：海盗 pirate-1..5、双面海盗 tigress、鬼船长 captain、美人鱼 mermaid-1..2、白旗 escape-1..5。
 */

export type Suit = "seaweed" | "coin" | "compass" | "flag";
export type SpecialKind = "pirate" | "tigress" | "captain" | "mermaid" | "escape";
export type CardId = string;

/** 双面海盗出牌时的声明。 */
export type TigressAs = "pirate" | "escape";

/** 2 人局的「幽灵水手」在出牌记录里的 id。它不叫墩、不计分。 */
export const GHOST_ID = "ghost";

export interface Config {
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** 一共几轮（标准 10 轮）。 */
  readonly rounds: number;
  /** 2 人局自动加幽灵水手。 */
  readonly ghost: boolean;
  /** 记牌辅助：桌边显示本轮出过的特殊牌和黑旗出到几（纯界面开关，信息本来就公开）。 */
  readonly tracker: boolean;
  /** 叫墩限时（秒），所有人同时叫，一个截止时间。 */
  readonly bidTimeoutSec: number;
  /** 出牌限时（秒）。 */
  readonly playTimeoutSec: number;
  /** 一墩打完停多久给大家看清赢家（毫秒，服务器按这个自动推进）。 */
  readonly trickPauseMs: number;
  /** 一轮结算页最多停多久（秒）；所有人点「继续」就提前进下一轮。 */
  readonly roundPauseSec: number;
}

export interface Player {
  readonly id: string;
  readonly name: string;
  /** 座位号 0…N−1（顺时针），头像按它取。 */
  readonly seat: number;
  /** 累计分，可以是负数。 */
  score: number;
  /** 本轮叫墩；亮出之前别人看到的是 null（看 bidSubmitted）。 */
  bid: number | null;
  bidSubmitted: boolean;
  /** 本轮已赢墩数。 */
  won: number;
}

export interface PlayedCard {
  /** 出牌的人：玩家 id，或 GHOST_ID。 */
  readonly by: string;
  readonly card: CardId;
  /** 只有双面海盗有：声明当海盗还是当白旗。 */
  readonly as?: TigressAs;
}

export type BonusKind = "fourteen" | "flag14" | "pirateMermaid" | "captainPirate" | "mermaidCaptain";

export interface BonusItem {
  readonly kind: BonusKind;
  readonly points: number;
  /** 计分来源的牌（14 那张 / 被抓的美人鱼、海盗、鬼船长）。 */
  readonly card: CardId;
}

/** 打完的一墩（公开）。 */
export interface TrickRecord {
  readonly leader: string;
  readonly plays: PlayedCard[];
  /** 赢家 id（可能是 GHOST_ID）。 */
  readonly winner: string;
  /** 赢的那张在 plays 里的下标。 */
  readonly winnerIndex: number;
  /** 这一墩的奖励分明细（只有赢家叫中时才计入，见 roundScore）。 */
  readonly bonus: BonusItem[];
}

export interface RoundPlayerResult {
  readonly player: string;
  readonly bid: number;
  readonly won: number;
  /** 叫墩分：叫中 +20×叫墩 / 叫 0 叫中 +10×张数 / 叫错的扣分。 */
  readonly bidPoints: number;
  /** 计入的奖励分（叫错为 0）。 */
  readonly bonus: number;
  /** 赢下的墩里有、但因为叫错作废的奖励分（结算页说明用）。 */
  readonly lostBonus: number;
  readonly points: number;
  readonly total: number;
}

export interface RoundResult {
  readonly round: number;
  readonly handSize: number;
  readonly results: RoundPlayerResult[];
}

/**
 * bid：所有人同时暗中叫墩；
 * play：轮流出牌；
 * trickEnd：一墩打完，停一下展示赢家（服务器自动推进）；
 * roundEnd：一轮结算，所有人点「继续」或到时进下一轮；
 * finished：10 轮打完。
 */
export type Phase = "bid" | "play" | "trickEnd" | "roundEnd" | "finished";

export type GameCommand =
  | { readonly type: "BID"; readonly n: number }
  | { readonly type: "UNBID" }
  | { readonly type: "PLAY"; readonly card: CardId; readonly as?: TigressAs }
  | { readonly type: "CONTINUE" };

export type GameEvent =
  | { readonly type: "RoundStarted"; readonly round: number; readonly handSize: number; readonly first: string }
  | { readonly type: "BidSubmitted"; readonly player: string }
  | { readonly type: "BidWithdrawn"; readonly player: string }
  | { readonly type: "BidsRevealed"; readonly bids: Record<string, number> }
  | { readonly type: "CardPlayed"; readonly player: string; readonly card: CardId; readonly as?: TigressAs }
  | { readonly type: "TrickWon"; readonly winner: string; readonly card: CardId; readonly bonus: BonusItem[]; readonly trick: number }
  | { readonly type: "RoundScored"; readonly round: number }
  | { readonly type: "GameEnded"; readonly winners: string[] }
  | { readonly type: "TimedOut"; readonly players: string[]; readonly phase: Phase };

export interface FinalResult {
  /** 最高分的人（并列都算赢）。 */
  readonly winners: string[];
  readonly totals: Record<string, number>;
}

export interface GameState {
  readonly config: Config;
  phase: Phase;
  players: Player[];
  /** 第几轮（1 起）。 */
  round: number;
  /** 本轮每人发几张（= 本轮墩数）。 */
  handSize: number;
  /** 本轮首位玩家（领出第 1 墩）；庄家是他上家。 */
  firstPlayer: string;
  /** 各人手牌。别人看到的是空数组，张数看 handCounts。 */
  hands: Record<string, CardId[]>;
  /** 各人（含幽灵）手里还剩几张（公开）。 */
  handCounts: Record<string, number>;
  /** 2 人局幽灵水手的牌，按翻牌顺序；谁都看不到（下发时是空数组）。 */
  ghostQueue: CardId[];
  /** 本轮没发出去的牌；谁都看不到（下发时是空数组）。 */
  undealt: CardId[];
  /** 本轮第几墩（0 起）。 */
  trickNo: number;
  /** 本墩领出的人。 */
  leader: string;
  /** 本墩已出的牌。 */
  trick: PlayedCard[];
  /** play 阶段轮到谁（玩家 id）；其他阶段为 null。幽灵的牌由引擎自动翻，不会轮到它。 */
  turn: string | null;
  /** 本轮打完的墩（公开）。trickEnd 时最后一项就是刚打完的那墩。 */
  tricks: TrickRecord[];
  /** roundEnd 阶段已点「继续」的人。 */
  ready: string[];
  /** 每轮结算（公开）。 */
  history: RoundResult[];
  events: GameEvent[];
  finalResult?: FinalResult;
  /** 每个动作 +1；前端据此判断是不是新事件。 */
  version: number;
  /** 以下只在服务端：随机数状态、动作序列。 */
  seed?: number;
  rngState?: number;
  log?: { player: string; command: GameCommand | { type: "TIMEOUT" } | { type: "ADVANCE" } }[];
}
