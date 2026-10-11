import { cardPx, type CardSize } from "./art.js";

/**
 * 牌桌的尺寸按实际可视区域（innerWidth × innerHeight）算：出牌区和手牌的牌在几种整数倍里挑最大、又能一屏放下的。
 * 所有数字都是 CSS 像素，GameBoard 用 CSS 变量交给 piratebid.css。
 *
 * 桌面（宽 ≥ 700）：
 *   顶栏
 *   别人的座位一排（从我左手边开始顺时针；2 人局加幽灵水手）          │ 侧栏（记牌 / 记录 / 聊天；
 *   出牌区（领出花色 + 记牌辅助一行；本墩的牌一排，叫墩时换成叫墩筹码）  │  宽 < 1280 时收进抽屉）
 *   手牌栏：我的座位卡 │ 手牌 │ 操作区
 * 手机（宽 < 700）：顶栏 │ 别人的小座位（4 列）│ 出牌区（小牌）│ 我的一行 + 操作 │ 手牌（小牌）
 */
export type Mode = "wide" | "mid" | "phone";

export interface Layout {
  readonly mode: Mode;
  readonly trick: CardSize;
  readonly hand: CardSize;
  readonly trickCard: { w: number; h: number };
  readonly handCard: { w: number; h: number };
  readonly topH: number;
  readonly gap: number;
  /** 别人座位一排的高度、每个座位的宽度和列数（手机是几列）。 */
  readonly seatH: number;
  readonly seatW: number;
  readonly seatCols: number;
  /** 出牌区高度（含上面那行提示）。 */
  readonly centerH: number;
  /** 出牌区里牌之间的步长（放不下时压住一部分）。 */
  readonly trickStep: number;
  readonly handBarH: number;
  /** 手牌的步长（压住时露出多少）。 */
  readonly handStep: number;
  readonly meW: number;
  readonly actionW: number;
  /** 侧栏宽；0 表示收进抽屉。 */
  readonly sideW: number;
  /** 叫墩筹码的倍数（筹码原图 32×32）。 */
  readonly chipScale: number;
}

const MARGIN = 12;
const TRICK_CHOICES: CardSize[] = [
  { set: "lg", scale: 2 },
  { set: "sm", scale: 3 },
  { set: "lg", scale: 1 },
  { set: "sm", scale: 1 },
];

/** 出牌区里最多几张：2 人局含幽灵 3 张，其余 = 人数。 */
export function trickSlots(players: number, ghost: boolean): number {
  return ghost ? 3 : players;
}

/** 手牌最少要露出多宽才看得全两位数（spec：大牌 48px、小牌 34px，按倍数放大）。 */
function minStep(size: CardSize): number {
  return size.set === "lg" ? 48 * size.scale : 34 * size.scale;
}

function desktop(vw: number, vh: number, others: number, slots: number, maxHand: number, trick: CardSize, hand: CardSize): Layout | null {
  const trickCard = cardPx(trick);
  const handCard = cardPx(hand);
  const topH = 48;
  const gap = 8;
  const sideW = vw >= 1280 ? Math.min(380, Math.max(280, Math.round(vw * 0.2))) : 0;
  const mainW = vw - 2 * MARGIN - (sideW ? sideW + gap : 0);
  // 别人的座位一排
  const seatW = Math.min(260, Math.floor((mainW - (others - 1) * gap) / Math.max(1, others)));
  if (seatW < 120) return null;
  const seatH = seatW >= 200 ? 104 : 96;
  // 出牌区：上面一行提示（领出花色、记牌辅助）40 + 牌 + 名字 24 + 内边距
  const centerH = 40 + trickCard.h + 24 + 12;
  // 手牌栏：牌 + 选中时抬高 16 + 内边距
  const handBarH = handCard.h + 16 + 16;
  if (topH + gap + seatH + gap + centerH + gap + handBarH + gap > vh) return null;
  // 出牌区横向：一排 slots 张，放不下就压住（至少露 60%）
  const trickAvail = mainW - 32;
  let trickStep = trickCard.w + 16;
  if (slots * trickStep - 16 > trickAvail) trickStep = Math.floor((trickAvail - trickCard.w) / Math.max(1, slots - 1));
  if (trickStep < trickCard.w * 0.6) return null;
  // 手牌栏横向：我的卡 + 手牌 + 操作区
  const meW = mainW >= 1100 ? 220 : 180;
  const actionW = mainW >= 1100 ? 260 : 220;
  const handAvail = mainW - meW - actionW - 2 * gap - 24;
  let handStep = handCard.w + 8;
  if (maxHand > 1 && (maxHand - 1) * handStep + handCard.w > handAvail) handStep = Math.floor((handAvail - handCard.w) / (maxHand - 1));
  if (handStep < minStep(hand)) return null;
  // 叫墩筹码：一排 handSize+1 个，2× 起，放得下就 3×
  const chipScale = mainW >= 1300 && centerH >= 300 ? 3 : 2;
  return { mode: sideW > 0 ? "wide" : "mid", trick, hand, trickCard, handCard, topH, gap, seatH, seatW, seatCols: others, centerH, trickStep, handBarH, handStep, meW, actionW, sideW, chipScale };
}

function phone(vw: number, others: number, slots: number, maxHand: number): Layout {
  const trick: CardSize = { set: "sm", scale: 1 };
  const hand: CardSize = { set: "sm", scale: 1 };
  const trickCard = cardPx(trick);
  const handCard = cardPx(hand);
  const gap = 4;
  const seatCols = Math.min(4, Math.max(1, others));
  const seatW = Math.floor((vw - 2 * 8 - (seatCols - 1) * gap) / seatCols);
  const rows = Math.ceil(others / seatCols);
  const seatH = rows * 76 + (rows - 1) * gap;
  const avail = vw - 16 - 8;
  let trickStep = trickCard.w + 6;
  if (slots * trickStep - 6 > avail) trickStep = Math.floor((avail - trickCard.w) / Math.max(1, slots - 1));
  let handStep = handCard.w + 4;
  if (maxHand > 1 && (maxHand - 1) * handStep + handCard.w > avail) handStep = Math.floor((avail - handCard.w) / (maxHand - 1));
  return {
    mode: "phone",
    trick,
    hand,
    trickCard,
    handCard,
    topH: 40,
    gap,
    seatH,
    seatW,
    seatCols,
    centerH: 36 + trickCard.h + 20 + 8,
    trickStep,
    handBarH: handCard.h + 12 + 8,
    handStep,
    meW: 0,
    actionW: 0,
    sideW: 0,
    chipScale: 2,
  };
}

/** 按可视区域挑尺寸：手牌越大越好，其次出牌区。 */
export function pickLayout(vw: number, vh: number, players: number, ghost: boolean, maxHand: number): Layout {
  const others = players - 1 + (ghost ? 1 : 0);
  const slots = trickSlots(players, ghost);
  if (vw < 700) return phone(vw, others, slots, maxHand);
  let best: { layout: Layout; score: number } | null = null;
  for (const trick of TRICK_CHOICES) {
    for (const hand of TRICK_CHOICES) {
      const layout = desktop(vw, vh, others, slots, Math.max(maxHand, 1), trick, hand);
      if (!layout) continue;
      // 两排牌都大、又差不多大最好；一样时手牌大一点、用大牌图（细节多）
      const score = 2 * layout.handCard.h + 2 * layout.trickCard.h - Math.abs(layout.handCard.h - layout.trickCard.h) / 2
        + (layout.handCard.h >= layout.trickCard.h ? 1 : -400) + (hand.set === "lg" ? 0.5 : 0) + (trick.set === "lg" ? 0.5 : 0);
      if (!best || score > best.score) best = { layout, score };
    }
  }
  return best?.layout ?? desktop(Math.max(vw, 1024), 2000, others, slots, Math.max(maxHand, 1), { set: "sm", scale: 1 }, { set: "sm", scale: 1 })!;
}
