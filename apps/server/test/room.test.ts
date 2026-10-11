/**
 * 海盗叫墩的房间流程：建房 → 加入 → 开局 → 同时叫墩 → 出牌 → 一墩停顿自动推进 → 结算页继续 → 终局 → 再来一局；
 * 原昵称重连回座；每一步超时；开房选项；以及「抓包」：每条发给 B 的 room:updated 里都没有 A 的手牌、幽灵的牌、没发的牌和种子。
 */
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import {
  legalActions,
  pendingActors,
  type AckResponse,
  type ClientToServerEvents,
  type GameCommand,
  type LobbyRoomSnapshot,
  type ServerToClientEvents,
} from "@piratebid/game";

process.env.BOT_DELAY_SCALE = "0";
process.env.TURN_MS = "400";
process.env.TRICK_PAUSE_MS = "30";
process.env.ROUND_PAUSE_MS = "400";

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const clients = new Set<TestSocket>();
const latest = new Map<TestSocket, LobbyRoomSnapshot>();
let serverUrl = "";
let server: typeof import("../src/index.js");
let nameSeq = 0;
/** 抓包发现的问题（每条更新都检查）。 */
const leaks: string[] = [];
/** 抓包实际比对过的更新条数（确认不是空跑）。 */
let inspected = 0;

function nick(prefix: string): string {
  nameSeq += 1;
  return `${prefix}${nameSeq}`;
}

function seatOf(client: TestSocket): string {
  return latest.get(client)?.members.find((member) => member.id === client.id)?.playerId ?? "";
}

/** 抓包：对照服务端当前的完整对局，检查这条更新里有没有不该给这个人看的东西。 */
function inspect(client: TestSocket, room: LobbyRoomSnapshot): void {
  if (!room.game || !room.code) return;
  const full = server.testHooks.peek(room.code);
  if (!full || full.version !== room.game.version) return;
  inspected += 1;
  const json = JSON.stringify(room);
  const me = room.members.find((member) => member.id === client.id)?.playerId;
  const secret = [
    ...full.players.filter((player) => player.id !== me).flatMap((player) => full.hands[player.id] ?? []),
    ...full.ghostQueue,
    ...full.undealt,
  ];
  for (const card of secret) if (json.includes(`"${card}"`)) leaks.push(`${me ?? "观战"} 收到了 ${card}`);
  if (/"seed"|"rngState"|"log"/.test(json)) leaks.push("下发了种子或动作序列");
  if (full.phase === "bid") {
    for (const player of room.game.players) if (player.id !== me && player.bid !== null) leaks.push(`${me} 提前看到了 ${player.id} 的叫墩`);
  }
}

function connect(): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const client: TestSocket = createClient(serverUrl, { transports: ["websocket"], reconnection: false });
    clients.add(client);
    client.on("room:updated", (room) => {
      latest.set(client, room);
      inspect(client, room);
    });
    client.once("connect", () => resolve(client));
    client.once("connect_error", reject);
  });
}

function call<T>(send: (ack: (response: AckResponse<T>) => void) => void): Promise<AckResponse<T>> {
  return new Promise((resolve) => send(resolve));
}

function updateWhere(client: TestSocket, test: (room: LobbyRoomSnapshot) => boolean, timeoutMs = 20_000): Promise<LobbyRoomSnapshot> {
  return new Promise((resolve, reject) => {
    const current = latest.get(client);
    if (current && test(current)) {
      resolve(current);
      return;
    }
    const timer = setTimeout(() => {
      client.off("room:updated", handler);
      reject(new Error("等待房间更新超时"));
    }, timeoutMs);
    const handler = (room: LobbyRoomSnapshot) => {
      if (!test(room)) return;
      clearTimeout(timer);
      client.off("room:updated", handler);
      resolve(room);
    };
    client.on("room:updated", handler);
  });
}

/** 轮到就走第一个合法动作（UNBID 除外）。 */
function autoplay(client: TestSocket, pick: (actions: GameCommand[]) => GameCommand = (actions) => actions[0]!): () => void {
  let sentFor = "";
  const handler = (room: LobbyRoomSnapshot) => {
    const game = room.game;
    if (!game || game.phase === "finished") return;
    const seat = seatOf(client);
    if (!pendingActors(game).includes(seat)) return;
    const actions = legalActions(game, seat).filter((action) => action.type !== "UNBID");
    if (actions.length === 0 || sentFor === String(game.version)) return;
    sentFor = String(game.version);
    client.emit("game:command", pick(actions), () => {});
  };
  client.on("room:updated", handler);
  const current = latest.get(client);
  if (current) handler(current);
  return () => client.off("room:updated", handler);
}

async function table(count: number): Promise<{ host: TestSocket; players: TestSocket[]; code: string; names: string[] }> {
  const host = await connect();
  const names = [nick("船长")];
  const created = await call<LobbyRoomSnapshot>((ack) => host.emit("room:create", { name: names[0]!, capacity: count as never }, ack));
  if (!created.ok) throw new Error(created.error);
  const players = [host];
  for (let seat = 1; seat < count; seat += 1) {
    const client = await connect();
    const name = nick("水手");
    names.push(name);
    const joined = await call<LobbyRoomSnapshot>((ack) => client.emit("room:join", { name, code: created.data.code }, ack));
    if (!joined.ok) throw new Error(joined.error);
    players.push(client);
  }
  await updateWhere(host, (room) => room.members.length === count);
  return { host, players, code: created.data.code, names };
}

describe("海盗叫墩房间", () => {
  beforeAll(async () => {
    server = await import("../src/index.js");
    await new Promise<void>((resolve, reject) => {
      server.httpServer.once("error", reject);
      server.httpServer.listen(0, resolve);
    });
    serverUrl = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    for (const client of clients) client.disconnect();
    await new Promise<void>((resolve) => server.io.close(() => resolve()));
  });

  it("3 人：同时叫墩（亮之前别人看不到数字）→ 出牌 → 打完 10 轮 → 再来一局；抓包没有泄露", async () => {
    const { host, players } = await table(3);
    expect((await call<LobbyRoomSnapshot>((ack) => host.emit("room:start", ack))).ok).toBe(true);
    const [a, b] = players as [TestSocket, TestSocket, TestSocket];
    await updateWhere(b, (room) => room.game?.phase === "bid");
    // A 先叫，B 看到「已提交」但看不到数字
    expect((await call<LobbyRoomSnapshot>((ack) => a.emit("game:command", { type: "BID", n: 1 }, ack))).ok).toBe(true);
    const seen = await updateWhere(b, (room) => room.game!.players.some((player) => player.id === seatOf(a) && player.bidSubmitted));
    expect(seen.game!.players.find((player) => player.id === seatOf(a))!.bid).toBeNull();
    // 没轮到时出牌被拒
    expect((await call<LobbyRoomSnapshot>((ack) => b.emit("game:command", { type: "PLAY", card: "coin-1" }, ack))).ok).toBe(false);

    const stops = players.map((client) => autoplay(client));
    const finished = await updateWhere(host, (room) => room.game?.phase === "finished", 60_000);
    stops.forEach((stop) => stop());
    expect(finished.game!.history).toHaveLength(10);
    expect(finished.game!.finalResult!.winners.length).toBeGreaterThan(0);
    expect(finished.rematch).toBeDefined();

    for (const client of players) expect((await call<void>((ack) => client.emit("room:rematch", true, ack))).ok).toBe(true);
    const again = await updateWhere(host, (room) => room.game?.phase === "bid" && room.game.round === 1 && !room.rematch);
    expect(again.game!.players.every((player) => player.score === 0)).toBe(true);
    expect(inspected).toBeGreaterThan(200);
    expect(leaks).toEqual([]);
  }, 90_000);

  it("2 人局自动加幽灵水手：幽灵的牌谁也收不到", async () => {
    const { host, players } = await table(2);
    expect((await call<LobbyRoomSnapshot>((ack) => host.emit("room:start", ack))).ok).toBe(true);
    const started = await updateWhere(host, (room) => room.game?.phase === "bid");
    expect(started.game!.config.ghost).toBe(true);
    expect(started.game!.handCounts.ghost).toBe(1);
    const stops = players.map((client) => autoplay(client));
    await updateWhere(host, (room) => (room.game?.round ?? 0) >= 4, 30_000);
    stops.forEach((stop) => stop());
    expect(leaks).toEqual([]);
  }, 40_000);

  it("观战（看手牌关）收不到任何人的手牌；打开后看得到手牌但没有幽灵的牌和种子", async () => {
    const { host, code } = await table(2);
    const viewer = await connect();
    expect((await call<LobbyRoomSnapshot>((ack) => viewer.emit("room:join", { name: nick("看客"), code, spectate: true }, ack))).ok).toBe(true);
    expect((await call<LobbyRoomSnapshot>((ack) => host.emit("room:start", ack))).ok).toBe(true);
    const blind = await updateWhere(viewer, (room) => room.game?.phase === "bid");
    expect(Object.values(blind.game!.hands).every((hand) => hand.length === 0)).toBe(true);
    expect((await call<void>((ack) => host.emit("room:access", { spectatorsSeeAll: true }, ack))).ok).toBe(true);
    const god = await updateWhere(viewer, (room) => room.access.spectatorsSeeAll);
    expect(Object.values(god.game!.hands).every((hand) => hand.length === 1)).toBe(true);
    expect(god.game!.ghostQueue).toEqual([]);
    expect(god.game!.undealt).toEqual([]);
    expect(JSON.stringify(god)).not.toMatch(/"seed"|"rngState"/);
  });

  it("每一步超时都有出路：叫墩超时由人机代叫、出牌超时由人机代出、结算页到时自动下一轮", async () => {
    const { host, players } = await table(2);
    expect((await call<LobbyRoomSnapshot>((ack) => host.emit("room:start", ack))).ok).toBe(true);
    const bidTimeout = await updateWhere(host, (room) => room.game?.events.some((event) => event.type === "TimedOut" && event.phase === "bid") === true, 5_000);
    expect(bidTimeout.game!.phase === "play" || bidTimeout.game!.phase === "trickEnd").toBe(true);
    // 叫墩阶段两人都超时 → 第 1 次；出牌再超时一次 → 转托管
    await updateWhere(host, (room) => room.game?.events.some((event) => event.type === "TimedOut" && event.phase === "play") === true || room.members.every((member) => member.auto), 5_000);
    // 结算页没人点继续也会到时进下一轮
    const next = await updateWhere(host, (room) => (room.game?.round ?? 0) >= 2, 10_000);
    expect(next.game!.round).toBeGreaterThanOrEqual(2);
    expect(players.length).toBe(2);
  }, 20_000);

  it("掉线后用原昵称加房间码回到自己的座位，手牌还在", async () => {
    const { host, players, code, names } = await table(3);
    expect((await call<LobbyRoomSnapshot>((ack) => host.emit("room:start", ack))).ok).toBe(true);
    const leaver = players[2]!;
    const before = await updateWhere(leaver, (room) => room.game?.phase === "bid");
    const seat = seatOf(leaver);
    const hand = before.game!.hands[seat];
    leaver.disconnect();
    await updateWhere(host, (room) => room.members.some((member) => member.playerId === seat && !member.connected));
    const back = await connect();
    const rejoined = await call<LobbyRoomSnapshot>((ack) => back.emit("room:join", { name: names[2]!, code }, ack));
    expect(rejoined.ok).toBe(true);
    if (!rejoined.ok) return;
    expect(rejoined.data.members.find((member) => member.id === back.id)?.playerId).toBe(seat);
    if (rejoined.data.game!.round === 1 && rejoined.data.game!.phase === "bid") expect(rejoined.data.game!.hands[seat]).toEqual(hand);
  });

  it("开房选项：记牌辅助默认开，房主等待时能关，新开的一局按它来；对局中不能改", async () => {
    const host = await connect();
    const created = await call<LobbyRoomSnapshot>((ack) => host.emit("room:create", { name: nick("船长"), capacity: 2, settings: { tracker: false } }, ack));
    expect(created.ok && created.data.settings.tracker).toBe(false);
    expect((await call<void>((ack) => host.emit("room:settings", { tracker: true }, ack))).ok).toBe(true);
    await updateWhere(host, (room) => room.settings.tracker);
    expect((await call<void>((ack) => host.emit("room:settings", { tracker: false }, ack))).ok).toBe(true);
    await updateWhere(host, (room) => !room.settings.tracker);
    expect((await call<void>((ack) => host.emit("room:add-bot", ack))).ok).toBe(true);
    expect((await call<LobbyRoomSnapshot>((ack) => host.emit("room:start", ack))).ok).toBe(true);
    const started = await updateWhere(host, (room) => room.game !== undefined);
    expect(started.game!.config.tracker).toBe(false);
    expect((await call<void>((ack) => host.emit("room:settings", { tracker: true }, ack))).ok).toBe(false);
  });

  it("2–8 人都能开（人机补满），8 人房能加 7 个人机", async () => {
    const host = await connect();
    expect((await call<LobbyRoomSnapshot>((ack) => host.emit("room:create", { name: nick("船长"), capacity: 8 }, ack))).ok).toBe(true);
    for (let seat = 1; seat < 8; seat += 1) expect((await call<void>((ack) => host.emit("room:add-bot", ack))).ok).toBe(true);
    expect((await call<void>((ack) => host.emit("room:add-bot", ack))).ok).toBe(false);
    expect((await call<LobbyRoomSnapshot>((ack) => host.emit("room:start", ack))).ok).toBe(true);
    const room = await updateWhere(host, (snapshot) => snapshot.game?.players.length === 8);
    expect(room.members.filter((member) => member.bot).map((member) => member.name)).toEqual(["咕噜一号", "咕噜二号", "咕噜三号", "咕噜四号", "咕噜五号", "咕噜六号", "咕噜七号"]);
  });
});
