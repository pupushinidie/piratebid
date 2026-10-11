/**
 * 新手教程的剧本（海盗叫墩，规则书 §9.8）。
 *
 * 教程在浏览器里直接跑规则引擎，不连服务器：3 人「第 4 轮」，每人 4 张，发牌按规则书写死（不洗牌），
 * 两个咕噜叫什么、出什么都由剧本定，所以「美人鱼抓鬼船长 +40」「白旗领出后双面海盗当海盗」「叫 0 吃墩扣 40」这几幕一定发生。
 * 剧本走完接着把这一局打完（练习局，第 5–10 轮）：两个咕噜交给人机，之后的发牌是普通随机数。
 *
 * 一墩打完的停顿在真实对局里由服务器推进；教程里把它当成一个叫 SYSTEM 的「人」走一步 ADVANCE。
 */
import { advance, apply, createGame, legalActions, pendingActors } from "./engine.js";
import { botCommand } from "./bot.js";
import { redactGameForViewer } from "./engine.js";
import { tutorialGame } from "./scenes.js";
import type { Rng } from "./rng.js";
import type { CardId, GameCommand, GameState } from "./types.js";

export type TutorialFace = "base" | "happy" | "surprised" | "think";

/** 教程里的一步棋：谁、做什么。SYSTEM 的 ADVANCE 是「一墩停顿结束 / 进下一轮」。 */
export type TutorialCommand = GameCommand | { readonly type: "ADVANCE" };
export interface TutorialMove {
  readonly player: string;
  readonly command: TutorialCommand;
}

interface StepBase {
  readonly id: string;
  /** 侧栏进度里这一课叫什么；同一课的后几步不写。 */
  readonly lesson?: string;
  /** 主句（24px），一句话。 */
  readonly say: string;
  /** 补充（12px），最多两句。 */
  readonly note?: string;
  /** 触屏上换的说法。 */
  readonly noteTouch?: string;
  /** 高亮哪个元素（网页里 data-tutorial 的值）；数组时用页面上看得见的第一个。 */
  readonly anchor?: string | readonly string[];
  readonly face?: TutorialFace;
}

export type TutorialStep =
  | (StepBase & { readonly kind: "info"; readonly finale?: boolean })
  | (StepBase & { readonly kind: "do"; readonly expect: TutorialMove })
  | (StepBase & { readonly kind: "watch"; readonly moves: readonly TutorialMove[] });

export const TUTORIAL_SELF = "p1";
export const SYSTEM = "system";
export const TUTORIAL_BOTS = [
  { id: "p2", name: "咕噜一号" },
  { id: "p3", name: "咕噜二号" },
] as const;
const ONE = "p2";
const TWO = "p3";

const me = (command: GameCommand): TutorialMove => ({ player: TUTORIAL_SELF, command });
const play = (player: string, card: CardId, as?: "pirate" | "escape"): TutorialMove => ({ player, command: as ? { type: "PLAY", card, as } : { type: "PLAY", card } });
const bid = (player: string, n: number): TutorialMove => ({ player, command: { type: "BID", n } });
const ADVANCE: TutorialMove = { player: SYSTEM, command: { type: "ADVANCE" } };

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: "goal",
    kind: "info",
    lesson: "目标",
    say: "目标：每轮正好赢到自己叫的墩数。",
    note: "一共 10 轮，第几轮就发几张牌。现在是第 4 轮，每人 4 张，这轮就打 4 墩。",
    anchor: "round",
    face: "happy",
  },
  {
    id: "hand",
    kind: "info",
    say: "这是你的手牌：海藻 9、黑旗 3、美人鱼、白旗。",
    note: "海藻、金币、罗盘是普通花色，黑旗是王牌；美人鱼、白旗这些是特殊牌。",
    anchor: "hand",
  },
  {
    id: "bots-bid",
    kind: "watch",
    lesson: "叫墩",
    say: "叫墩：大家同时暗中猜自己这轮能赢几墩。",
    note: "两个咕噜已经叫好了，你看不到数字，只看到「已叫」。",
    anchor: "seats",
    moves: [bid(ONE, 2), bid(TWO, 0)],
  },
  {
    id: "my-bid",
    kind: "do",
    say: "你的美人鱼有机会赢一墩：点「1」叫 1 墩。",
    note: "可以叫 0 到 4 之间任何数，叫 0 也行。最后一个人叫完之前都能改。",
    anchor: "bid:1",
    expect: me({ type: "BID", n: 1 }),
  },
  {
    id: "reveal",
    kind: "info",
    say: "最后一个人叫完，一起亮出！",
    note: "咕噜一号叫 2、咕噜二号叫 0。座位上一直显示「叫几 赢几」：正好叫中变绿，超了变红。",
    anchor: "seats",
    face: "surprised",
  },
  {
    id: "lead",
    kind: "do",
    lesson: "出牌和跟花色",
    say: "你先出：点海藻 9 选中，再点一次出牌。",
    note: "第一张叫「领出」，领出的人什么都能出。",
    noteTouch: "点一下选中，再点一下出牌。第一张叫「领出」，领出的人什么都能出。",
    anchor: "card:seaweed-9",
    expect: me({ type: "PLAY", card: "seaweed-9" }),
  },
  {
    id: "follow",
    kind: "watch",
    say: "有领出的花色就要跟：两个咕噜都出了海藻。",
    note: "跟的时候不用压过，出小的也行。",
    anchor: "trick",
    moves: [play(ONE, "seaweed-12"), play(TWO, "seaweed-4")],
  },
  {
    id: "trick1",
    kind: "info",
    say: "同花色比大小：海藻 12 最大，咕噜一号赢下这一墩。",
    note: "别的普通花色再大也没用，只看领出的花色（和黑旗）。下一墩由赢家先出。",
    anchor: "trick",
  },
  {
    id: "lead2",
    kind: "watch",
    lesson: "黑旗是王牌",
    say: "咕噜一号领出金币 5，咕噜二号没有金币，出了黑旗 11。",
    note: "手里没有领出的花色，才可以出别的。",
    anchor: "trick",
    moves: [ADVANCE, play(ONE, "coin-5"), play(TWO, "flag-11")],
  },
  {
    id: "flag3",
    kind: "do",
    say: "你也没有金币，什么都能出：出黑旗 3 试试。",
    note: "要跟花色的时候，不能出的牌会灰掉。",
    anchor: "card:flag-3",
    expect: me({ type: "PLAY", card: "flag-3" }),
  },
  {
    id: "trick2",
    kind: "info",
    say: "黑旗压过所有普通花色；黑旗之间比大小，黑旗 11 赢。",
    note: "所以咕噜二号赢了这一墩，可他叫的是 0。",
    anchor: "trick",
    face: "think",
  },
  {
    id: "lead3",
    kind: "watch",
    lesson: "特殊牌",
    say: "咕噜二号领出罗盘 14，你没有罗盘。",
    anchor: "trick",
    moves: [ADVANCE, play(TWO, "compass-14")],
  },
  {
    id: "mermaid",
    kind: "do",
    say: "出美人鱼！特殊牌随时都能出。",
    note: "就算手里有领出的花色，也可以出特殊牌。",
    anchor: "card:mermaid-1",
    expect: me({ type: "PLAY", card: "mermaid-1" }),
  },
  {
    id: "captain",
    kind: "watch",
    say: "咕噜一号丢出了鬼船长……",
    anchor: "trick",
    moves: [play(ONE, "captain")],
  },
  {
    id: "ring",
    kind: "info",
    say: "美人鱼抓住了鬼船长！这一墩归你。",
    note: "克制环：鬼船长压海盗，海盗压美人鱼，美人鱼抓鬼船长；三种都在时美人鱼赢。",
    anchor: "trick",
    face: "surprised",
  },
  {
    id: "bonus",
    kind: "info",
    say: "抓到鬼船长 +40，墩里的罗盘 14 再 +10。",
    note: "奖励只在这轮正好叫中时才算：14 每张 +10、黑旗 14 +20、海盗抓美人鱼 +20、鬼船长抓海盗每张 +30。",
    anchor: "trick-winner",
    face: "happy",
  },
  {
    id: "tracker",
    kind: "info",
    say: "右上角是记牌辅助：这轮出过的特殊牌会亮起来。",
    note: "黑旗出过哪几张也在这里。开房时可以关掉。",
    anchor: "tracker",
  },
  {
    id: "enough",
    kind: "watch",
    lesson: "叫够了就躲",
    say: "你已经赢了 1 墩，正好是你叫的数。",
    note: "再赢就超了，叫中的分和奖励都没了：叫够了就要躲。",
    anchor: "my-bid",
    face: "think",
    moves: [ADVANCE],
  },
  {
    id: "escape",
    kind: "do",
    say: "出白旗躲开这一墩。",
    note: "白旗输给一切。白旗领出时，由下一张牌来定花色。",
    anchor: "card:escape-1",
    expect: me({ type: "PLAY", card: "escape-1" }),
  },
  {
    id: "tigress",
    kind: "watch",
    say: "咕噜一号出海盗，咕噜二号出双面海盗、选了「当海盗」。",
    note: "双面海盗出的时候选当海盗还是当白旗。白旗后面跟的是角色牌，这墩就没有花色，随便出。",
    anchor: "trick",
    moves: [play(ONE, "pirate-1"), play(TWO, "tigress", "pirate")],
  },
  {
    id: "first-pirate",
    kind: "info",
    say: "两张海盗，先出的赢：咕噜一号赢下这一墩。",
    note: "同一种角色牌比不出大小，谁先出谁赢。",
    anchor: "trick",
  },
  {
    id: "score",
    kind: "watch",
    lesson: "计分",
    say: "4 墩打完，这一轮算分。",
    anchor: "round-result",
    moves: [ADVANCE],
  },
  {
    id: "score-you",
    kind: "info",
    say: "你叫 1 赢 1，叫中：+20，再加奖励 50，一共 +70。",
    note: "叫中每墩 +20；咕噜一号叫 2 赢 2，+40。",
    anchor: "result:p1",
    face: "happy",
  },
  {
    id: "score-zero",
    kind: "info",
    say: "咕噜二号叫 0 却吃了一墩：扣 10 × 4 张 = −40。",
    note: "叫 0 一墩不赢得 +10 × 张数，吃了墩就扣同样多。没叫中时差几墩扣几个 10，奖励全部作废。",
    anchor: "result:p3",
    face: "think",
  },
  {
    id: "end",
    kind: "info",
    lesson: "结束",
    say: "10 轮打完，总分最高的人赢，并列都算赢。",
    note: "叫墩 30 秒、出牌 25 秒；超时由人机代打，连续两次就转托管，点「取消托管」拿回来。",
  },
  {
    id: "finale",
    kind: "info",
    finale: true,
    say: "学会了！接着把这局打完，和两个咕噜练一练。",
    note: "练习局里点「提示」（或按 H），咕噜嘎会替你算一步、说说为什么。",
    face: "happy",
  },
];

/** 教程开局：规则书 §9.8 的固定发牌。 */
export function createTutorialGame(selfName: string): GameState {
  const state = tutorialGame();
  state.players = state.players.map((player, index) => ({ ...player, name: index === 0 ? selfName : TUTORIAL_BOTS[index - 1]!.name }));
  return state;
}

/** 练习局「再练一局」：同样 3 人，从第 1 轮开始，随机发牌。 */
export function createPracticeGame(selfName: string, seed: number): GameState {
  return createGame([{ id: TUTORIAL_SELF, name: selfName }, ...TUTORIAL_BOTS], seed);
}

/** 走一步（教程、练习局用）：SYSTEM 的 ADVANCE 是一墩停顿结束 / 进下一轮。不合法就抛错。 */
export function tutorialApply(state: GameState, move: TutorialMove, rng: Rng): GameState {
  if (move.command.type === "ADVANCE") return advance(state, rng).state;
  return apply(state, move.player, move.command, rng).state;
}

/**
 * 现在该谁动：叫墩时先让还没叫的咕噜叫，然后是你；出牌时轮到的人；一墩打完是 SYSTEM；结算页先让咕噜点继续。
 * 对局结束返回 null。
 */
export function tutorialActor(state: GameState, self: string = TUTORIAL_SELF): string | null {
  if (state.phase === "finished") return null;
  if (state.phase === "trickEnd") return SYSTEM;
  const pending = pendingActors(state);
  return pending.find((id) => id !== self) ?? (pending.includes(self) ? self : null);
}

/** 你现在能不能动（叫墩是同时的：咕噜还没叫完你也能叫、能改）。 */
export function selfCanAct(state: GameState, self: string = TUTORIAL_SELF): boolean {
  return legalActions(state, self).length > 0;
}

/** 练习局里人机（或 SYSTEM）的下一步。 */
export function tutorialBot(state: GameState, player: string): TutorialMove | null {
  if (player === SYSTEM) return state.phase === "trickEnd" ? ADVANCE : null;
  const command = botCommand(redactGameForViewer(state, player), player);
  return command ? { player, command } : null;
}

export function sameMove(a: TutorialMove, b: TutorialMove): boolean {
  return a.player === b.player && JSON.stringify(a.command) === JSON.stringify(b.command);
}

export function anchorCandidates(step: TutorialStep): readonly string[] {
  if (!step.anchor) return [];
  return typeof step.anchor === "string" ? [step.anchor] : step.anchor;
}

/** 这个锚点在这个局面里界面上看得见吗（对应 GameBoard 的显示条件；剧本单测用）。 */
export function anchorVisible(state: GameState, anchor: string, viewer: string = TUTORIAL_SELF): boolean {
  const mine = state.players.find((player) => player.id === viewer);
  if (!mine) return false;
  if (["round", "seats", "hand", "me", "my-bid", "status", "actions"].includes(anchor)) return true;
  if (anchor.startsWith("bid:")) return state.phase === "bid" && !mine.bidSubmitted && Number(anchor.slice(4)) <= state.handSize;
  if (anchor === "bid-panel") return state.phase === "bid";
  if (anchor.startsWith("card:")) return (state.hands[viewer] ?? []).includes(anchor.slice(5));
  if (anchor.startsWith("seat:")) return state.players.some((player) => player.id === anchor.slice(5) && player.id !== viewer);
  if (anchor === "trick" || anchor === "lead-suit") return state.phase !== "bid";
  if (anchor === "tracker") return state.config.tracker && state.phase !== "bid";
  if (anchor === "trick-winner") return state.phase === "trickEnd";
  if (anchor === "round-result") return state.phase === "roundEnd";
  if (anchor.startsWith("result:")) return state.phase === "roundEnd" && state.players.some((player) => player.id === anchor.slice(7));
  if (anchor === "continue") return state.phase === "roundEnd" && !state.ready.includes(viewer);
  return false;
}
