import type { CSSProperties } from "react";
import { cardInfo, type CardId } from "@piratebid/game";

/**
 * 美术素材的地址和取法（照 art/spec.md）。所有图都按整数倍显示，加 image-rendering: pixelated。
 * - 牌：大牌 cards/<名>.png 128×192（1×、2×）；小牌 cards/sm/<名>.png 64×96（1×、3×；2× 和大牌 1× 一样大，用大牌）。
 * - 鬼船长的图叫 ghost.png；5 张白旗共用 escape.png。
 */
const ROOT = `${import.meta.env.BASE_URL}art/`;

export const art = (path: string) => `${ROOT}${path}`;

export type CardSet = "sm" | "lg";

export interface CardSize {
  readonly set: CardSet;
  readonly scale: number;
}

export const CARD_BASE = { sm: { w: 64, h: 96 }, lg: { w: 128, h: 192 } } as const;

export function cardPx(size: CardSize): { w: number; h: number } {
  return { w: CARD_BASE[size.set].w * size.scale, h: CARD_BASE[size.set].h * size.scale };
}

/** 牌 id → 图的文件名（不带扩展名）。 */
export function cardFile(card: CardId | "back"): string {
  if (card === "back") return "back";
  if (card === "captain") return "ghost";
  if (card.startsWith("escape-")) return "escape";
  return card;
}

export function cardSrc(card: CardId | "back", set: CardSet): string {
  return `${ROOT}cards/${set === "sm" ? "sm/" : ""}${cardFile(card)}.png`;
}

/** 有待机动画的牌（只在桌面出牌区播；首帧和静态牌一样）。 */
export function cardAnim(card: CardId): string | null {
  if (card === "captain") return `${ROOT}anim/ghost.png`;
  if (card === "mermaid-1") return `${ROOT}anim/mermaid-1.png`;
  if (card.startsWith("escape-")) return `${ROOT}anim/escape.png`;
  return null;
}

export function cardStyle(card: CardId | "back", size: CardSize): CSSProperties {
  const { w, h } = cardPx(size);
  return { width: w, height: h, backgroundImage: `url(${cardSrc(card, size.set)})`, backgroundSize: `${w}px ${h}px` };
}

/** 8 个座位色（Player.seat 0–7）：头像框和名字前的色点。 */
export const SEATS = ["#e5533f", "#3b82f0", "#44b860", "#f0c030", "#9b6ad6", "#f08a2e", "#36c2c9", "#f06aa8"] as const;
export const seatColor = (seat: number) => SEATS[((seat % 8) + 8) % 8]!;

export const avatarArt = (seat: number) => `${ROOT}avatars/crew-${(((seat % 8) + 8) % 8) + 1}.png`;
export const ghostAvatar = `${ROOT}avatars/ghost.png`;

export type SuitKey = "seaweed" | "coin" | "compass" | "flag";
export type SpecialKey = "pirate" | "tigress" | "ghost" | "mermaid" | "escape";

export const suitIcon = (suit: SuitKey | "none", small = false) => `${ROOT}icons/suit-${suit}${small && suit !== "none" ? "-16" : ""}.png`;
export const specialIcon = (kind: SpecialKey, small = false) => `${ROOT}icons/sp-${kind}${small ? "-16" : ""}.png`;

/** 牌的角标图标（日志、记牌辅助用）。 */
export function cardIcon(card: CardId, small = false): string {
  const info = cardInfo(card);
  if (info.kind === "number") return suitIcon(info.suit, small);
  return specialIcon(info.kind === "captain" ? "ghost" : info.kind, small);
}

/** 花色的「中」色（文字、色块用）；白天主题黑旗用深灰。 */
export const SUIT_COLOR: Record<SuitKey, string> = { seaweed: "#2f8f4e", coin: "#d89a1c", compass: "#7a4ab8", flag: "#3e3644" };

export const ART = {
  bgNight: `${ROOT}bg/night@3x.png`,
  bgDay: `${ROOT}bg/day@3x.png`,
  hero: `${ROOT}bg/night.png`,
  heroDay: `${ROOT}bg/day.png`,
  candles: `${ROOT}fx/candles-night.png`,
  glow: `${ROOT}cards/glow.png`,
  glowSm: `${ROOT}cards/sm/glow.png`,
  pile: `${ROOT}cards/pile.png`,
  pileSm: `${ROOT}cards/sm/pile.png`,
  markPirate: `${ROOT}marks/tigress-pirate.png`,
  markEscape: `${ROOT}marks/tigress-escape.png`,
  hit: `${ROOT}icons/hit.png`,
  miss: `${ROOT}icons/miss.png`,
  bid: `${ROOT}icons/bid.png`,
  trick: `${ROOT}icons/trick.png`,
  score: `${ROOT}icons/score.png`,
  chip: `${ROOT}ui/bid-chip.png`,
  chipOn: `${ROOT}ui/bid-chip-on.png`,
  parchment: `${ROOT}ui/parchment.png`,
  winner: `${ROOT}ui/winner.png`,
  fxTrick: `${ROOT}fx/trick-win.png`,
  fxCoins: `${ROOT}fx/coins.png`,
  fxHit: `${ROOT}fx/hit.png`,
  fxMiss: `${ROOT}fx/miss.png`,
  fxSplash: `${ROOT}fx/splash.png`,
} as const;

/** 样式表里要用的几张图（地址带 BASE_URL，CSS 里写死路径在子路径下会坏）：挂到 :root 的 CSS 变量上。 */
export function installArtVars(): void {
  const style = document.documentElement.style;
  style.setProperty("--bg-night", `url(${ART.bgNight})`);
  style.setProperty("--bg-day", `url(${ART.bgDay})`);
  style.setProperty("--hero-img", `url(${ART.hero})`);
  style.setProperty("--hero-day-img", `url(${ART.heroDay})`);
  style.setProperty("--candles-img", `url(${ART.candles})`);
  style.setProperty("--parchment-img", `url(${ART.parchment})`);
  style.setProperty("--chip-img", `url(${ART.chip})`);
  style.setProperty("--chip-on-img", `url(${ART.chipOn})`);
  style.setProperty("--fx-trick-img", `url(${ART.fxTrick})`);
  style.setProperty("--fx-coins-img", `url(${ART.fxCoins})`);
  style.setProperty("--fx-hit-img", `url(${ART.fxHit})`);
  style.setProperty("--fx-miss-img", `url(${ART.fxMiss})`);
  style.setProperty("--fx-splash-img", `url(${ART.fxSplash})`);
}
