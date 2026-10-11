// 引擎阶段的占位牌桌：只把状态和合法行动列出来，界面阶段换成正式牌桌。
import type { ReactNode } from "react";
import { cardName, legalActions, type GameCommand, type LobbyRoomSnapshot } from "@piratebid/game";
import { socket } from "./socket.js";

interface GameBoardProps {
  readonly room: LobbyRoomSnapshot;
  readonly busy: boolean;
  readonly error: string;
  readonly notice: string;
  readonly brand: ReactNode;
  readonly connection: ReactNode;
  readonly themeToggle: ReactNode;
  readonly chat: ReactNode;
  readonly onCommand: (command: GameCommand) => void;
  readonly onRematch: (accept: boolean) => void;
  readonly onAuto: (enabled: boolean) => void;
  readonly onDissolve: () => void;
  readonly watchId: string;
  readonly onWatch: (playerId: string) => void;
  readonly onLeave: () => void;
}

export default function GameBoard({ room, onCommand, onRematch, brand }: GameBoardProps) {
  const game = room.game!;
  const me = room.members.find((member) => member.id === socket.id)?.playerId ?? "";
  return (
    <main data-gc-table>
      {brand}
      <p>第 {game.round} 轮 · {game.phase}</p>
      <ul>{game.players.map((player) => <li key={player.id}>{player.name} 叫 {player.bid ?? (player.bidSubmitted ? "?" : "-")} 赢 {player.won} 分 {player.score}</li>)}</ul>
      <p>桌上：{game.trick.map((play) => cardName(play.card, play.as)).join("、")}</p>
      <p>手牌：{(game.hands[me] ?? []).map((card) => cardName(card)).join("、")}</p>
      <div>{legalActions(game, me).map((command, index) => <button key={index} onClick={() => onCommand(command)}>{JSON.stringify(command)}</button>)}</div>
      {game.phase === "finished" && <button onClick={() => onRematch(true)}>再来一局</button>}
    </main>
  );
}
