import { useEffect, useRef } from "react";
import { cardInfo, stepKey, type GameState } from "@piratebid/game";
import { sfx, synth } from "./gm-sound.js";

/**
 * 海盗叫墩的动作音效。gm-sound.tsx 是全站共用的音效库，这里只管「什么时候响哪个」。
 * 看引擎的 events：发牌、叫墩（交 / 撤回）、一起亮出（捶桌三下）、出牌（特殊牌各有招牌声）、赢墩、奖励、一轮叫中/叫爆、终局、超时。
 * 第一次拿到对局（进房间、重连、观战刚进来）不响；版本一下跳了很多步（重连）不补放；再来一局（版本变小）重新算起。
 * 自己的动作 mine=true，别人的减半；观战时都算别人的。轮到自己（叫墩开始、轮到出牌）响一声「轮到你」。
 */

declare global {
  interface Window {
    /** 开发时自测脚本用：记下响过的音效名字。 */
    __sfxLog?: string[];
  }
}

function log(name: string) {
  if (import.meta.env.DEV) (window.__sfxLog ??= []).push(name);
}

const { tone, noise, level } = synth;

function later(name: string, fn: () => void, delay: number) {
  if (delay <= 0) {
    fn();
    log(name);
    return;
  }
  window.setTimeout(() => {
    fn();
    log(name);
  }, delay);
}

/** 招牌声音：一起亮叫墩——捶桌三下，再「唰」地亮出。 */
function knockReveal() {
  [0, 0.16, 0.32].forEach((at) => {
    tone(90, { at, duration: 0.12, volume: 0.22, glideTo: 60 });
    noise({ at, duration: 0.06, volume: 0.08, filter: "lowpass", freq: 900 });
  });
  window.setTimeout(() => sfx.reveal(true), 520);
}

/** 特殊牌落桌的招牌声：鬼船长低沉、海盗刀光、美人鱼水泡、白旗轻轻一飘。 */
function specialSound(card: string, mine: boolean) {
  const kind = cardInfo(card).kind;
  const v = level(mine);
  if (kind === "captain") {
    tone(110, { duration: 0.6, volume: 0.2 * v, type: "sawtooth", glideTo: 70 });
    tone(165, { at: 0.05, duration: 0.5, volume: 0.08 * v, type: "triangle", glideTo: 104 });
  } else if (kind === "pirate" || kind === "tigress") {
    noise({ duration: 0.18, volume: 0.12 * v, filter: "highpass", freq: 2500, freqTo: 6000 });
    tone(1568, { at: 0.02, duration: 0.2, volume: 0.06 * v, type: "triangle", glideTo: 1320 });
  } else if (kind === "mermaid") {
    [0, 0.07, 0.15].forEach((at, i) => tone(600 + i * 220, { at, duration: 0.1, volume: 0.09 * v, glideTo: 900 + i * 260 }));
  } else if (kind === "escape") {
    noise({ duration: 0.3, volume: 0.05 * v, filter: "bandpass", freq: 900, freqTo: 400 });
  }
}

/** 美人鱼抓住鬼船长：一大片水花。 */
function splash() {
  noise({ duration: 0.7, volume: 0.16, filter: "lowpass", freq: 3000, freqTo: 500 });
  [0.1, 0.2, 0.32].forEach((at, i) => tone(500 + i * 180, { at, duration: 0.12, volume: 0.07, glideTo: 1100 }));
}

/** 选中一张牌（还没出）。 */
export function playSelectSound() {
  sfx.select(true);
  log("select");
}

export function useGameSfx({ game, selfId, canAct }: { game: GameState; selfId: string; canAct: boolean }) {
  const prev = useRef<GameState | null>(null);
  const announced = useRef<string | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = game;
    if (!before) {
      announced.current = stepKey(game);
      return;
    }
    if (game.version === before.version) return;
    if (game.version < before.version) {
      announced.current = stepKey(game);
      if (game.round === 1 && game.phase === "bid") {
        later("gameStart", () => sfx.gameStart(), 100);
        later("deal", () => sfx.deal(game.handSize), 700);
      }
      return;
    }
    if (game.version - before.version > 6) return;
    let delay = 0;
    for (const event of game.events) {
      switch (event.type) {
        case "RoundStarted":
          later("shuffle", () => sfx.shuffle(), delay);
          later("deal", () => sfx.deal(Math.min(8, event.handSize)), delay + 400);
          delay += 500;
          break;
        case "BidSubmitted":
          later("bid", () => sfx.place(event.player === selfId), delay);
          break;
        case "BidWithdrawn":
          later("unbid", () => sfx.pass(event.player === selfId), delay);
          break;
        case "BidsRevealed":
          later("reveal", knockReveal, delay + 120);
          delay += 700;
          break;
        case "CardPlayed": {
          const mine = event.player === selfId;
          later("card", () => sfx.card(mine), delay);
          later("special", () => specialSound(event.card, mine), delay + 40);
          delay += 160;
          break;
        }
        case "TrickWon": {
          const mine = event.winner === selfId;
          const bonus = event.bonus.reduce((sum, item) => sum + item.points, 0);
          later("trickWon", () => (mine ? sfx.score(true) : sfx.coin(false)), delay + 250);
          if (bonus > 0) later("bonus", () => sfx.chips(Math.min(6, bonus / 10), mine), delay + 600);
          if (event.bonus.some((item) => item.kind === "mermaidCaptain")) later("splash", splash, delay + 350);
          break;
        }
        case "RoundScored": {
          const mineResult = game.history.find((round) => round.round === event.round)?.results.find((entry) => entry.player === selfId);
          if (mineResult) later(mineResult.bid === mineResult.won ? "hit" : "bust", () => (mineResult.bid === mineResult.won ? sfx.sparkle(true) : sfx.bust(true)), delay + 200);
          else later("roundEnd", () => sfx.score(false), delay + 200);
          break;
        }
        case "GameEnded":
          later("gameOver", () => sfx.gameOver(event.winners.includes(selfId)), delay + 500);
          break;
        case "TimedOut":
          if (event.players.includes(selfId)) later("timeout", () => sfx.timeout(), delay);
          break;
        default:
          break;
      }
    }
  }, [game.version]);

  // 轮到自己：叫墩开始、轮到出牌（每一步只响一次）
  useEffect(() => {
    const key = stepKey(game);
    if (!canAct || game.phase === "roundEnd" || announced.current === key) return;
    announced.current = key;
    later("yourTurn", () => sfx.yourTurn(), 350);
  }, [canAct, game.version]);
}
