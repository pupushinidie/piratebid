// 抓包脚本：连上真实服务器（先 npm run dev，或设 SERVER_URL），A 建房、B 加入（再补人机凑人数），
// 两人都用 botCommand 自动打，记录服务器发给每个人的每一条 room:updated，然后检查：
// - 发给 B 的同一版本里没有 A 当时的手牌（反过来也查）；
// - 叫墩亮出之前看不到别人的叫墩数；
// - 谁都收不到种子、随机数状态、动作序列、幽灵的牌、没发的牌。
//   node scripts/spy.mjs [人数，默认 3；2 表示带幽灵] [打几轮，默认 3]
import { io } from "socket.io-client";
import { botCommand, pendingActors } from "../packages/game/dist/index.js";

const URL = process.env.SERVER_URL ?? "http://localhost:3029";
const CAPACITY = Number(process.argv[2] ?? 3);
const ROUNDS = Number(process.argv[3] ?? 3);

const problems = [];
const seen = { A: new Map(), B: new Map() };
let checked = 0;

function client(label) {
  const socket = io(URL, { transports: ["websocket"] });
  const emit = (event, ...args) => new Promise((resolve) => socket.emit(event, ...args, resolve));
  let busy = false;
  socket.on("room:updated", (room) => {
    const json = JSON.stringify(room);
    const me = room.members.find((member) => member.id === socket.id)?.playerId;
    if (room.game) {
      seen[label].set(room.game.version, { room, json, me });
      if (/"seed"|"rngState"|"log"/.test(json)) problems.push(`${label} 收到种子/动作序列`);
      if (room.game.ghostQueue.length || room.game.undealt.length) problems.push(`${label} 收到幽灵的牌或没发的牌`);
      if (room.game.phase === "bid") {
        for (const player of room.game.players) if (player.id !== me && player.bid !== null) problems.push(`${label} 提前看到 ${player.id} 的叫墩`);
      }
      for (const player of room.game.players) if (player.id !== me && room.game.hands[player.id]?.length) problems.push(`${label} 收到 ${player.id} 的手牌`);
    }
    const game = room.game;
    if (!game || game.phase === "finished" || busy || !me || !pendingActors(game).includes(me)) return;
    busy = true;
    setTimeout(async () => {
      const command = botCommand(game, me);
      if (command) await emit("game:command", command);
      busy = false;
    }, 30);
  });
  return { socket, emit };
}

const A = client("A");
const B = client("B");
await new Promise((resolve) => A.socket.on("connect", resolve));
await new Promise((resolve) => (B.socket.connected ? resolve() : B.socket.on("connect", resolve)));
const created = await A.emit("room:create", { name: "间谍甲", capacity: CAPACITY });
if (!created.ok) throw new Error(created.error);
const joined = await B.emit("room:join", { name: "间谍乙", code: created.data.code });
if (!joined.ok) throw new Error(joined.error);
for (let seat = 2; seat < CAPACITY; seat += 1) await A.emit("room:add-bot");
const started = await A.emit("room:start");
if (!started.ok) throw new Error(started.error);

await new Promise((resolve) => {
  const timer = setInterval(() => {
    const last = [...seen.A.values()].at(-1)?.room.game;
    if (last && (last.round > ROUNDS || last.phase === "finished")) {
      clearInterval(timer);
      resolve();
    }
  }, 200);
});

// 同一版本两边对照：A 的手牌不在 B 收到的数据里，反之亦然。
for (const [version, a] of seen.A) {
  const b = seen.B.get(version);
  if (!b) continue;
  checked += 1;
  for (const card of a.room.game.hands[a.me] ?? []) if (b.json.includes(`"${card}"`)) problems.push(`v${version} B 收到了 A 的 ${card}`);
  for (const card of b.room.game.hands[b.me] ?? []) if (a.json.includes(`"${card}"`)) problems.push(`v${version} A 收到了 B 的 ${card}`);
}
console.log(`${CAPACITY} 人，打了 ${ROUNDS} 轮：A 收到 ${seen.A.size} 条、B 收到 ${seen.B.size} 条，两边对照 ${checked} 个版本`);
console.log(problems.length === 0 ? "没有发现泄露" : `发现 ${problems.length} 个问题：\n${[...new Set(problems)].slice(0, 20).join("\n")}`);
await A.emit("room:dissolve");
A.socket.disconnect();
B.socket.disconnect();
process.exit(problems.length === 0 ? 0 : 1);
