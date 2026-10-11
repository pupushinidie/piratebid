/**
 * 新手教程剧本（照站内做法的五项）：从头走到尾、关键几幕一定发生、剧本本身、随机、接练习局能打完。
 */
import { describe, expect, it } from "vitest";
import {
  anchorCandidates,
  anchorVisible,
  createPracticeGame,
  createRng,
  createTutorialGame,
  legalActions,
  SYSTEM,
  TUTORIAL_SELF,
  TUTORIAL_STEPS,
  tutorialActor,
  tutorialApply,
  tutorialBot,
  type GameState,
  type TutorialMove,
} from "../src/index.js";

function legal(state: GameState, move: TutorialMove): boolean {
  if (move.command.type === "ADVANCE") return state.phase === "trickEnd" || state.phase === "roundEnd";
  const command = move.command;
  return legalActions(state, move.player).some((action) => JSON.stringify(action) === JSON.stringify(command));
}

/** 按剧本走，返回每一步开始时的局面。 */
function walk(): { states: Map<string, GameState>; end: GameState; problems: string[] } {
  const rng = createRng(1);
  let state = createTutorialGame("你");
  const states = new Map<string, GameState>();
  const problems: string[] = [];
  for (const step of TUTORIAL_STEPS) {
    states.set(step.id, state);
    if (step.kind === "do") {
      if (!legal(state, step.expect)) problems.push(`${step.id}：剧本要你做的不合法`);
      state = tutorialApply(state, step.expect, rng);
    }
    if (step.kind === "watch") {
      for (const move of step.moves) {
        const actor = tutorialActor(state);
        if (actor !== move.player) problems.push(`${step.id}：该 ${actor} 走，剧本写的是 ${move.player}`);
        if (!legal(state, move)) problems.push(`${step.id}：${JSON.stringify(move)} 不合法`);
        state = tutorialApply(state, move, rng);
      }
    }
    // 锚点在这一步走完后（玩家看到讲解时）看得见；do 步骤在做之前看得见
    const shown = step.kind === "do" ? states.get(step.id)! : state;
    for (const anchor of anchorCandidates(step).slice(0, 1)) {
      if (!anchorVisible(shown, anchor)) problems.push(`${step.id}：锚点 ${anchor} 看不见`);
    }
  }
  return { states, end: state, problems };
}

describe("新手教程剧本", () => {
  it("从头走到尾：每一步都合法、轮到的人对得上、锚点看得见", () => {
    const { problems, end } = walk();
    expect(problems).toEqual([]);
    expect(end.phase).toBe("roundEnd");
  });

  it("关键几幕一定发生：咕噜一号赢第 1 墩、咕噜二号的黑旗 11 赢第 2 墩、美人鱼抓鬼船长 +50、先出的海盗赢、得分 70/40/−40", () => {
    const { states, end } = walk();
    expect(states.get("trick1")!.tricks[0]!.winner).toBe("p2");
    expect(states.get("trick2")!.tricks[1]!.winner).toBe("p3");
    const ring = states.get("ring")!.tricks[2]!;
    expect(ring.winner).toBe(TUTORIAL_SELF);
    expect(ring.bonus.map((item) => item.points).sort()).toEqual([10, 40]);
    const fourth = states.get("first-pirate")!.tricks[3]!;
    expect(fourth.winner).toBe("p2");
    expect(fourth.plays[2]).toEqual({ by: "p3", card: "tigress", as: "pirate" });
    expect(end.history[0]!.results.map((entry) => entry.points)).toEqual([70, 40, -40]);
    // 亮叫墩前看不到咕噜的数字（同时叫）：叫墩那一步开始时咕噜都已叫好，但自己还没叫
    const before = states.get("my-bid")!;
    expect(before.phase).toBe("bid");
    expect(before.players.slice(1).every((player) => player.bidSubmitted)).toBe(true);
  });

  it("剧本本身：id 不重复、finale 唯一且在最后、每步都有主句、主句和补充不太长", () => {
    const ids = TUTORIAL_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    const finales = TUTORIAL_STEPS.filter((step) => step.kind === "info" && step.finale);
    expect(finales).toHaveLength(1);
    expect(TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1]).toBe(finales[0]);
    for (const step of TUTORIAL_STEPS) {
      expect(step.say.length).toBeGreaterThan(0);
      expect(step.say.length).toBeLessThanOrEqual(32);
      expect((step.note ?? "").length).toBeLessThanOrEqual(80);
    }
  });

  it("发牌是写死的（不洗牌）：每次开局一样", () => {
    expect(createTutorialGame("你").hands).toEqual(createTutorialGame("小明").hands);
    expect(createTutorialGame("小明").players[0]!.name).toBe("小明");
  });

  it("剧本走完接练习局，三家都交给人机，120 局都能打完（第 4 轮之后正常随机发牌）", () => {
    const { end } = walk();
    let stuck = 0;
    for (let game = 0; game < 120; game += 1) {
      const rng = createRng(1000 + game);
      let state = game % 2 === 0 ? end : createPracticeGame("你", game);
      let steps = 0;
      while (state.phase !== "finished" && steps < 3000) {
        steps += 1;
        const actor = tutorialActor(state);
        if (!actor) break;
        const move = actor === SYSTEM ? tutorialBot(state, SYSTEM)! : tutorialBot(state, actor);
        if (!move) break;
        state = tutorialApply(state, move, rng);
      }
      if (state.phase !== "finished") stuck += 1;
    }
    expect(stuck).toBe(0);
  }, 60_000);
});
