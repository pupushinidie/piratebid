import { legalActions } from "./engine.js";
import type { GameCommand, GameState } from "./types.js";

/** 占位人机：从合法行动里随机挑一个（人机阶段再换成正式策略）。 */
export function botCommand(state: GameState, playerId: string): GameCommand | null {
  const options = legalActions(state, playerId).filter((command) => command.type !== "UNBID");
  if (options.length === 0) return null;
  return options[Math.floor(Math.random() * options.length)]!;
}
