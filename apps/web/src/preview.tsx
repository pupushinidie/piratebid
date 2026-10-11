/**
 * 预览页（提交进仓库，界面维护；教程可以往里加场景，不要删别人的场景，也不要整个删掉）。
 * 不连服务器：用规则包的预览局面工厂造局面，渲染真正的 GameBoard / 首页 / 等候房间。在牌桌上点的动作直接在浏览器里跑引擎。
 * 生产构建只打包 index.html，不会带上它。打开：http://localhost:5300/preview.html?s=<场景>
 *
 * 参数（都可以不写）：
 *   ?s=<场景>     牌桌场景用规则包的 SCENE_NAMES（bid、bid-partial、play-lead、play-follow、play-tigress、play-others、trick-end、
 *                 trick-bonus、round-end、final、final-tie、ghost-bid、ghost-play、max8-bid、max8-play、max8-final、tutorial），另外有：
 *                 home（首页）、home-rooms（首页带在线牌桌）、waiting-1 / waiting-full / waiting-bots / waiting-guest / waiting-spec（等候房间）、
 *                 tigress-pick（选中了双面海盗，等选身份）、max8-trick（8 人局一墩出满、轮到最后一个）
 *   &v=<座位>      从哪个座位看，默认 p1
 *   &bots=p2,p3   人机座位    &auto=p1  托管中    &offline=p3  离线
 *   &spec=1       观战（&all=1 观战能看手牌）
 *   &t=<毫秒>      倒计时剩余（默认 18000）；t=none 不显示
 *   &chat=1       带几条聊天
 *   &live=1       别人由人机自动叫墩、出牌，一墩停 1.8 秒，可以一直玩下去
 *   &pick=<牌>    进来就选中这张手牌
 *   &hint=1       显示「提示」按钮
 *   &err=<文字>    模拟服务器拒绝了动作（看非法操作提示）
 *   &tracker=0    关掉记牌辅助
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import ReactDOM from "react-dom/client";
import {
  advance,
  apply,
  botCommand,
  createRng,
  DEFAULT_ROOM_ACCESS,
  DEFAULT_ROOM_SETTINGS,
  pendingActors,
  playUntil,
  redactGameForViewer,
  scene,
  SCENE_NAMES,
  buildGame,
  type Capacity,
  type GameCommand,
  type GameState,
  type LobbyMember,
  type LobbyRoomSnapshot,
  type PublicRoomSummary,
  type RoomChatMessage,
  type RoomSettings,
  type SceneName,
} from "@piratebid/game";
import { Brand, ConnectionStatus, HomeScreen, RoomScreen } from "./App.js";
import { installArtVars } from "./art.js";
import { useConfirm } from "./confirm.js";
import GameBoard from "./GameBoard.js";
import RoomChat from "./RoomChat.js";
import { socket } from "./socket.js";
import { applyTheme, readTheme, ThemeToggle, useTheme } from "./theme.js";
import { SoundToggle } from "./gm-sound.js";
import { useVoice } from "./voice.js";
import "./styles.css";
import "./app-pixel.css";
import "./pb-pages.css";
import "./piratebid.css";
import "./theme-day.css";

applyTheme(readTheme());
installArtVars();

const params = new URLSearchParams(location.search);
const sceneName = params.get("s") ?? "play-lead";
const viewer = params.get("v") ?? (sceneName === "waiting-guest" ? "p2" : "p1");
const list = (key: string) => (params.get(key) ?? "").split(",").filter(Boolean);
const spectator = params.get("spec") === "1";
const seeAll = params.get("all") === "1";
const live = params.get("live") === "1";
const timeParam = params.get("t");
const turnRemainingMs = timeParam === "none" ? undefined : Number(timeParam ?? 18000);
const pickParam = params.get("pick");

Object.defineProperty(socket, "id", { get: () => (spectator ? "sock-watcher" : `sock-${viewer}`), configurable: true });
// 预览页不连服务器：发出去的房间操作直接回一个失败，界面上看得到提示。
socket.emit = ((event: string, ...args: unknown[]) => {
  const ack = args[args.length - 1];
  if (typeof ack === "function") (ack as (response: unknown) => void)({ ok: false, error: `预览页不连服务器（${event}）` });
  return socket;
}) as typeof socket.emit;
socket.connect = (() => socket) as typeof socket.connect;

const CHAT: RoomChatMessage[] = [
  { id: "c1", senderId: "sock-p2", name: "甲", message: "这把我叫 2，别抢我的", createdAt: "2026-10-11T20:01:00.000Z" },
  { id: "c2", senderId: "sock-p1", name: "你", message: "鬼船长还没出，小心", createdAt: "2026-10-11T20:01:30.000Z" },
  { id: "c3", senderId: "sock-watcher", name: "看客", message: "美人鱼在谁手里？", createdAt: "2026-10-11T20:02:00.000Z", spectator: true },
];

/* ---------- 额外场景 ---------- */

function buildScene(): GameState {
  let state: GameState;
  if (sceneName === "tigress-pick") state = scene("play-tigress");
  else if (sceneName === "max8-trick") {
    state = playUntil(buildGame({ players: 8, round: 10, firstSeat: 1, seed: 81, scores: [120, 90, -30, 210, 60, 0, 150, 40] }), (s) => s.phase === "play" && s.turn === "p1" && s.trick.length === 7);
  } else if ((SCENE_NAMES as readonly string[]).includes(sceneName)) state = scene(sceneName as SceneName);
  else state = scene("play-lead");
  if (params.get("tracker") === "0") state = { ...state, config: { ...state.config, tracker: false } };
  return state;
}

function sceneRoom(full: GameState, autoIds: string[]): LobbyRoomSnapshot {
  const bots = list("bots");
  const offline = list("offline");
  const members: LobbyMember[] = full.players.map((player, index) => ({
    id: `sock-${player.id}`,
    playerId: player.id,
    name: player.name,
    isHost: index === 0,
    connected: !offline.includes(player.id),
    ...(bots.includes(player.id) ? { bot: true } : {}),
    ...(autoIds.includes(player.id) ? { auto: true } : {}),
  }));
  const view = spectator ? redactGameForViewer(full, "", { seeAll }) : redactGameForViewer(full, viewer);
  return {
    code: "PB8K2Q",
    spectators: spectator ? [{ id: "sock-watcher", name: "看客" }] : [],
    access: { ...DEFAULT_ROOM_ACCESS, spectatorsSeeAll: seeAll },
    settings: { tracker: full.config.tracker },
    capacity: Math.max(2, full.players.length) as Capacity,
    status: "playing",
    members,
    chat: params.get("chat") === "1" ? CHAT : [],
    voice: [],
    game: view,
    ...(turnRemainingMs !== undefined && full.phase !== "finished" ? { turnRemainingMs } : {}),
    ...(full.phase === "finished" ? { rematch: { remainingMs: 52000, acceptedIds: members.filter((member) => member.bot).map((member) => member.id) } } : {}),
  };
}

/* ---------- 牌桌 ---------- */

function BoardPreview() {
  const [theme, toggleTheme] = useTheme();
  const [full, setFull] = useState<GameState>(buildScene);
  const [error, setError] = useState(params.get("err") ?? "");
  const [autoIds, setAutoIds] = useState(list("auto"));
  const [confirm, confirmDialog] = useConfirm();
  const room = useMemo(() => sceneRoom(full, autoIds), [full, autoIds]);
  const voice = useVoice(room);
  const [watchId, setWatchId] = useState(full.players[0]!.id);
  const rng = useRef(createRng(99));

  function command(cmd: GameCommand, as = viewer) {
    try {
      setFull((state) => apply(state, as, cmd, rng.current).state);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  // 选中某张牌（pick=、tigress-pick）：模拟点一下
  useEffect(() => {
    const card = pickParam ?? (sceneName === "tigress-pick" ? "tigress" : null);
    if (!card) return;
    const timer = window.setTimeout(() => (document.querySelector(`[data-card-id="${card}"], [data-tutorial="card:${card}"]`) as HTMLButtonElement | null)?.click(), 200);
    return () => window.clearTimeout(timer);
  }, []);

  // live=1：别人由人机按自己能看到的信息走；一墩打完停 1.8 秒；结算页 2 秒后别人点继续
  const fullRef = useRef(full);
  fullRef.current = full;
  useEffect(() => {
    if (!live || full.phase === "finished") return;
    if (full.phase === "trickEnd") {
      const timer = window.setTimeout(() => setFull((state) => (state.phase === "trickEnd" ? advance(state, rng.current).state : state)), 1800);
      return () => window.clearTimeout(timer);
    }
    const actor = pendingActors(full).find((id) => id !== viewer || autoIds.includes(viewer));
    if (!actor) return;
    const timer = window.setTimeout(() => {
      const cmd = botCommand(redactGameForViewer(fullRef.current, actor), actor);
      if (cmd) command(cmd, actor);
    }, full.phase === "roundEnd" ? 2000 : 700);
    return () => window.clearTimeout(timer);
  }, [full, autoIds]);

  return (
    <main data-gc-table className="app-shell pb-game">
      <GameBoard
        room={room}
        busy={false}
        error={error}
        notice=""
        brand={<Brand />}
        connection={<ConnectionStatus connected />}
        themeToggle={<><ThemeToggle theme={theme} onToggle={toggleTheme} /><SoundToggle /></>}
        theme={theme}
        chat={<RoomChat room={room} voice={voice} />}
        onCommand={(cmd) => command(cmd)}
        onRematch={() => setFull(buildScene())}
        onAuto={(enabled) => setAutoIds((ids) => (enabled ? [...ids, viewer] : ids.filter((id) => id !== viewer)))}
        onDissolve={() => void confirm({ title: "解散房间？", detail: "所有玩家都会被移出，当前对局也会结束。", confirmLabel: "解散" })}
        watchId={watchId}
        onWatch={setWatchId}
        onLeave={() => setError("预览页：离开观战只在真房间里有效")}
        showHint={params.get("hint") === "1"}
      />
      {confirmDialog}
    </main>
  );
}

/* ---------- 首页 ---------- */

const LOBBY: PublicRoomSummary[] = [
  {
    id: "r1", status: "playing", capacity: 5, open: false, allowSpectators: true, spectators: 1,
    players: [
      { name: "老船长", isHost: true, connected: true, score: 120, isActive: true },
      { name: "大副", isHost: false, connected: true, score: 80 },
      { name: "咕噜一号", isHost: false, connected: true, bot: true, score: 150 },
      { name: "厨子", isHost: false, connected: false, score: -20 },
      { name: "瞭望", isHost: false, connected: true, score: 40 },
    ],
  },
  {
    id: "r2", status: "waiting", capacity: 8, open: true, allowSpectators: true, spectators: 0,
    players: [{ name: "二丫", isHost: true, connected: true }, { name: "三毛", isHost: false, connected: true }],
  },
  {
    id: "r3", status: "finished", capacity: 3, open: false, allowSpectators: true, spectators: 0,
    players: [{ name: "四喜", isHost: true, connected: true, score: 310, isWinner: true }, { name: "五福", isHost: false, connected: true, score: 210 }, { name: "咕噜二号", isHost: false, connected: true, bot: true, score: 260 }],
  },
];

function HomePreview() {
  const [theme, toggleTheme] = useTheme();
  const [name, setName] = useState("小明");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [capacity, setCapacity] = useState<Capacity>(4);
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [code, setCode] = useState("");
  const [confirm, confirmDialog] = useConfirm();
  return (
    <>
      <HomeScreen
        theme={theme}
        themeToggle={<ThemeToggle theme={theme} onToggle={toggleTheme} />}
        connected
        mode={mode}
        onMode={setMode}
        name={name}
        onName={setName}
        capacity={capacity}
        onCapacity={setCapacity}
        settings={settings}
        onSettings={(patch) => setSettings({ ...settings, ...patch })}
        roomCode={code}
        onRoomCode={(value) => setCode(value.toUpperCase().slice(0, 6))}
        canSubmit={name.trim().length >= 2}
        busy={false}
        error=""
        notice=""
        onSubmit={(event: FormEvent<HTMLFormElement>) => event.preventDefault()}
        lobbyRooms={sceneName === "home-rooms" ? LOBBY : []}
        onJoinListed={() => undefined}
        confirm={confirm}
      />
      {confirmDialog}
    </>
  );
}

/* ---------- 等候房间 ---------- */

const NAMES = ["你", "大副", "厨子", "瞭望", "炮手", "舵手", "木匠", "船医"];
const BOT_NAMES = ["一", "二", "三", "四", "五", "六", "七"];

function waitingRoom(): LobbyRoomSnapshot {
  const kind = sceneName.slice("waiting-".length);
  const capacity = (kind === "full" ? 8 : kind === "1" ? 4 : kind === "bots" ? 6 : 4) as Capacity;
  const seats = kind === "1" ? 1 : kind === "full" ? 8 : kind === "bots" ? 4 : kind === "spec" ? 3 : 2;
  let botNo = 0;
  const members: LobbyMember[] = Array.from({ length: seats }, (_, index) => {
    const bot = (kind === "bots" && index > 0) || (kind === "full" && index >= 5);
    return {
      id: `sock-p${index + 1}`,
      playerId: `p${index + 1}`,
      name: bot ? `咕噜${BOT_NAMES[botNo++]}号` : NAMES[index]!,
      isHost: index === 0,
      connected: !(kind === "full" && index === 3),
      ...(bot ? { bot: true } : {}),
    };
  });
  return {
    code: kind === "spec" ? "" : "PB8K2Q",
    spectators: kind === "full" || kind === "spec" ? [{ id: "sock-watcher", name: "看客" }] : [],
    access: { ...DEFAULT_ROOM_ACCESS, ...(kind === "full" ? { open: true } : {}) },
    settings: kind === "full" ? { tracker: false } : DEFAULT_ROOM_SETTINGS,
    capacity,
    status: "waiting",
    members,
    chat: params.get("chat") === "1" ? CHAT : [],
    voice: [],
  };
}

function RoomPreview() {
  const [theme, toggleTheme] = useTheme();
  const [room, setRoom] = useState(waitingRoom);
  const voice = useVoice(room);
  const [confirm, confirmDialog] = useConfirm();
  return (
    <>
      <RoomScreen
        room={room}
        busy={false}
        error=""
        notice=""
        connected
        themeToggle={<><ThemeToggle theme={theme} onToggle={toggleTheme} /><SoundToggle /></>}
        chat={<RoomChat room={room} voice={voice} />}
        onCopyCode={() => undefined}
        onLeave={() => undefined}
        onStart={() => undefined}
        onKick={() => undefined}
        onAddBot={() => undefined}
        onDissolve={() => void confirm({ title: "解散房间？", detail: "所有玩家都会被移出，当前对局也会结束。", confirmLabel: "解散" })}
        onSettings={(patch) => setRoom((current) => ({ ...current, settings: { ...current.settings, ...patch } }))}
      />
      {confirmDialog}
    </>
  );
}

function Preview() {
  if (sceneName.startsWith("home")) return <HomePreview />;
  if (sceneName.startsWith("waiting")) {
    if (sceneName === "waiting-spec") Object.defineProperty(socket, "id", { get: () => "sock-watcher", configurable: true });
    return <RoomPreview />;
  }
  return <BoardPreview />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Preview />);
