/**
 * 海盗叫墩和教程有关的部分（共用的 Coach / useTutorial / tips / storage 之外，本游戏自己写的）：
 * 游戏 id、「提示」怎么说、「第一次遇到」小贴士什么时候出。
 */
import { botDecision, cardName, leadSuitOf, suitOf, type CardId, type GameState } from "@piratebid/game";

/** 本机记录（gm-tutorial-<id>、gm-tips-<id>）用的游戏 id。 */
export const GAME_ID = "piratebid";

export interface Hint {
  readonly say: string;
  readonly note?: string;
  /** 高亮哪个元素（data-tutorial）；null 不指。 */
  readonly anchor: string | null;
  /** 顺手替你选中的牌（还要你自己点出）。 */
  readonly card?: CardId;
  /** 叫墩时建议的数（筹码描边）。 */
  readonly bid?: number;
}

/** 「提示」：让人机从你的位置算一步（game 就是网页收到的你的视角，人机本来也只看这些），配一句它的理由。 */
export function hintFor(game: GameState, playerId: string): Hint {
  if (game.phase === "finished") return { say: "这局已经结束了。", anchor: null };
  const decision = botDecision(game, playerId);
  if (!decision) {
    if (game.phase === "bid") return { say: "你已经叫好了，等别人。", note: "想改的话点「撤回重叫」。", anchor: null };
    return { say: "现在还没轮到你。", anchor: null };
  }
  const { command, reason } = decision;
  if (command.type === "BID") return { say: `我会叫 ${command.n} 墩。`, note: reason, anchor: `bid:${command.n}`, bid: command.n };
  if (command.type === "PLAY") {
    const as = command.as ? `（${command.as === "pirate" ? "当海盗" : "当白旗"}）` : "";
    return { say: `我会出${cardName(command.card)}${as}。`, note: reason, anchor: `card:${command.card}`, card: command.card };
  }
  return { say: "点「继续」开下一轮。", anchor: "continue" };
}

/** 「第一次遇到」小贴士的内容。 */
export const TIPS = {
  "bust-self": {
    title: "你叫爆了",
    text: "赢的墩已经比叫的多，这轮叫中的分和奖励都拿不到了：差几墩扣几个 10。剩下的墩尽量少赢，别再多扣。",
  },
  "zero-broken": {
    title: "叫 0 吃了墩",
    text: "这一轮会扣 10 × 本轮张数，再多吃几墩也是扣这么多。下次叫 0 前看看手里有没有容易被逼着赢的大牌。",
  },
  "hit-self": {
    title: "你正好叫中",
    text: "接下来的墩都要躲：出白旗、垫小牌、出别的花色。再赢一墩就超了。",
  },
  "auto-self": {
    title: "你进入了托管",
    text: "连续 2 次超时，现在由人机替你打。点「取消托管」，或者直接出一张牌，就能拿回来。",
  },
  timeout: {
    title: "你超时了",
    text: "人机替你做了这一步。再连续超时一次就会进入托管。",
  },
  "must-follow": {
    title: "灰掉的牌不能出",
    text: "这墩有领出的花色、你手里也有：数字牌只能出这个花色。特殊牌（海盗、美人鱼、白旗……）随时都能出。",
  },
  "mermaid-captain": {
    title: "美人鱼抓住了鬼船长",
    text: "鬼船长压海盗，海盗压美人鱼，美人鱼抓鬼船长：三种都在时美人鱼赢，赢家叫中还能拿 +40。",
  },
  "round-end": {
    title: "一轮打完了",
    text: "叫中：每墩 +20（叫 0 是 +10 × 张数）加奖励；没叫中：差几墩扣几个 10，奖励作废。10 轮后总分最高的赢。",
  },
} as const;

/** 这一步该出哪些小贴士（按优先顺序；只出第一条没看过的）。auto：自己正被托管。 */
export function detectTips(game: GameState, selfId: string, auto: boolean): string[] {
  const ids: string[] = [];
  const me = game.players.find((player) => player.id === selfId);
  if (!me) return ids;
  for (const event of game.events) {
    if (event.type === "TrickWon" && event.winner === selfId && me.bid !== null) {
      if (me.bid === 0) ids.push("zero-broken");
      else if (me.won > me.bid) ids.push("bust-self");
      else if (me.won === me.bid) ids.push("hit-self");
    }
  }
  if (auto) ids.push("auto-self");
  for (const event of game.events) {
    if (event.type === "TimedOut" && event.players.includes(selfId)) ids.push("timeout");
  }
  if (game.phase === "play" && game.turn === selfId) {
    const lead = leadSuitOf(game.trick);
    const hand = game.hands[selfId] ?? [];
    if (lead && lead !== "none" && hand.some((card) => suitOf(card) === lead) && hand.some((card) => suitOf(card) !== null && suitOf(card) !== lead)) ids.push("must-follow");
  }
  for (const event of game.events) {
    if (event.type === "TrickWon" && event.bonus.some((item) => item.kind === "mermaidCaptain")) ids.push("mermaid-captain");
    if (event.type === "RoundScored") ids.push("round-end");
  }
  return ids;
}
