# 海盗叫墩

叫墩吃墩的海盗牌：一共 10 轮，第几轮发几张。每轮先看牌、所有人同时暗中**叫墩**（猜自己这轮能赢几墩），然后轮流出牌。**正好赢到叫的墩数**才得分，多了少了都扣分；叫中时赢下的墩里有特定的牌还能拿奖励分。10 轮后累计分最高的人赢。2–8 人，2 人局自动加一个「幽灵水手」。

- 线上：https://gulugagame.com/piratebid（服务端口 3029，pm2 名 `piratebid`）
- 规则书：`~/Desktop/游戏规则/海盗叫墩.md`（流水线 id `piratebid`）
- 美术：PixelLab 正式美术「暖色船长舱」，规格 `art/spec.md`，定稿 `art/out/final/` → `apps/web/public/art/`

## 本地运行

```bash
npm install
npm run dev          # 服务端 3029 + 网页 http://localhost:5300
npm test             # 规则包 + 服务端测试
npm run typecheck
BASE_PATH=/piratebid/ npm run build
```

端口从环境变量读：网页 `WEB_PORT`（默认 5300）、网页代理的目标 `SERVER_PORT`（默认 3029）、服务端 `PORT`（默认 3029），服务端允许的本地开发来源也跟着 `WEB_PORT`。另起一套服务（比如人机测试用 `TURN_MS=1500 BOT_DELAY_SCALE=0.3`）时改这几个就不会撞。

改了 `packages/game` 要先 `npm run build:game`，服务端和测试读的是 `packages/game/dist`。

### 一个人怎么测

- 陪玩机器人：`node scripts/test-bot.mjs host 4 3`（建 4 人房，3 个机器人，等你从浏览器用房间码加入凑满后自动开局）；`node scripts/test-bot.mjs join <房间码>` 加入你的房间。`BOT_DELAY_MS` 调思考时间（默认 1200），`BOT_IDLE=1` 只挂着不动（等超时由人机代打），`BOT_STAY=1` 终局后同意再来一局接着打。
- 房主也可以在等候房间点「加人机」把空座交给人机，一个人就能开局。
- 抓包：`node scripts/spy.mjs 3 3`（3 人打 3 轮）、`node scripts/spy.mjs 2 4`（2 人带幽灵），两个 socket 连真实服务器，对照每个版本 A、B 收到的数据，查别人的手牌、提前的叫墩、幽灵的牌、种子有没有漏。
- 测试用环境变量：`BOT_DELAY_SCALE=0`（人机立刻行动）、`TURN_MS=300`（叫墩 / 出牌限时）、`TRICK_PAUSE_MS`（一墩打完的停顿）、`ROUND_PAUSE_MS`（结算页时限）。

### 测试

| 文件 | 内容 |
|---|---|
| `packages/game/test/rulebook.test.ts` | 规则书 §10 测试用例 TC1–TC13 逐条（测试名带「规则书#TCn」） |
| `packages/game/test/sections.test.ts` | 规则书各章节的场景测试（§2 发牌、§3 开局、§4.1–4.5、§5 边界、§6 计分含例 1/例 2、§7 终局并列、§8.1 幽灵、§9.2 命令、§9.4 超时） |
| `packages/game/test/random.test.ts` | 2–8 人每种 300 局随机对局：配件守恒、张数、赢墩合计、分数按公式重算、奖励作废、不卡死、跟花色独立复核、抽查视图不泄露 |
| `apps/server/test/room.test.ts` | 房间全流程（同时叫墩、出牌、停顿、结算页、10 轮、再来一局）、幽灵、观战两种视角、每一步超时、原昵称回座、开房选项、8 人房；每条更新都对照服务端完整状态抓包 |
| `apps/server/test/spectate.test.ts`、`kickSession.test.ts`、`bots.test.ts` | 模板继承的观战、挤登录、人机托管测试（配置段改成本游戏） |

## 规则（自己的话）

**牌**：70 张。海藻、金币、罗盘三种普通花色和黑旗（王牌），各 1–14；特殊牌 14 张：海盗 5、双面海盗 1、鬼船长 1、美人鱼 2、白旗 5。

**发牌**：第 r 轮每人 r 张；8 人局第 9、10 轮只发 8 张（公式 `min(r, ⌊70/发牌手数⌋)`）。没发的牌这轮不用、谁也看不到。第 1 轮随机一人先出，之后每轮先出的人顺时针往后挪一位（庄家是先出那人的上家）。

**叫墩**：发完牌所有人同时暗中叫 0 到手牌数之间的一个数。提交前后都能改，最后一个人提交时一起亮出，之后不能改。总数不用凑整。

**出牌**：先出的人领出，之后每墩由上一墩的赢家领出。
- 领出花色 = 本墩第一张不是白旗的牌：数字牌就是它的花色；角色牌（海盗、鬼船长、美人鱼、当海盗的双面海盗）就说明这墩没有花色，后面随便出。
- 有领出花色、手里也有这个花色的数字牌时，要出数字牌就只能出这个花色；**特殊牌随时能出**。没有这个花色就随便出。没有「必须压过」的规定。
- 双面海盗出的时候选「当海盗」或「当白旗」。

**谁赢这墩**（按顺序第一条成立的）：① 美人鱼和鬼船长都在 → 最先出的美人鱼；② 鬼船长；③ 最先出的海盗；④ 最先出的美人鱼；⑤ 最大的黑旗；⑥ 领出花色里最大的；⑦ 全是白旗 → 第一张白旗。

**计分**（每轮每人）：
- 叫 1 墩以上：正好叫中 +20×叫墩数，再加奖励分；没叫中 −10×差几墩，奖励作废。
- 叫 0：一墩没赢 +10×本轮手牌数；赢了墩 −10×本轮手牌数（赢几墩都一样）。
- 奖励分（只有叫中才算，按自己赢下的墩）：普通花色 14 每张 +10，黑旗 14 +20；海盗赢的墩里每张美人鱼 +20；鬼船长赢的墩里每张海盗（含当海盗的双面海盗）+30；美人鱼赢而且墩里有鬼船长 +40（三种都在只拿这 40）。

**结束**：10 轮打完累计分最高的赢，并列都算赢。

**2 人局**：多发一手牌给「幽灵水手」，谁也看不到。它不叫墩、不计分。轮到它时翻它最上面的一张直接出，不用跟花色，双面海盗一律当白旗。真人领出时幽灵第二个出；幽灵赢了墩就由它领出，然后本轮先出的那个人第二、另一人第三。幽灵赢的墩里的奖励没人拿。

### 默认规则表（规则书没写死、开工拍板和全站约定）

| 项 | 这里的做法 | 来源 |
|---|---|---|
| 人数 | 2–8 人；2 人自动加幽灵水手 | 开工拍板 |
| 终局并列 | 并列的人都算赢（官方是加赛，未写发几张） | 开工拍板 |
| 叫 0 的分数 | 按本轮每人手牌数（8 人局第 9、10 轮 ±80） | 开工拍板（官方 2024 规则书） |
| 白旗领出后第一张非白旗是角色牌 | 这墩没有花色，后面随便出 | 开工拍板 |
| 记牌辅助 | 默认开，开房时 / 等候房间里房主可以关（下一局生效）；只是界面开关，信息本来就公开 | 开工拍板 |
| 变体 | 一个都不做：只用基础 70 张、标准计分、10 轮；没有进阶牌、海盗技能、无赖计分、轮数变体 | 开工拍板 |
| 叫墩提交后 | 亮出前可以撤回或直接改数；最后一人提交即锁定 | 规则书 §4.1 |
| 双面海盗的声明 | 公开、不能改；当白旗被收走时不给任何奖励 | 规则书 §4.3、§6.3 |
| 一墩打完 | 停 1.8 秒展示赢家，服务器自动由赢家领下一墩 | 规则书 §9.2 |
| 每轮结算页 | 所有人点「继续」就进下一轮，最多停 15 秒自动进 | 规则书 §9.2 写 6 秒，留长一点给看结算表 |
| 托管 / 离线 | 全站约定：托管 = 人机代打；离线 3 秒后由人机代打；连续超时 2 次转托管；人机叫「咕噜一号…七号」带「人机」标签 | guluga-bots |
| 观战 | 默认可观战、只看公开信息；房主可开「观战看手牌」，但幽灵的牌、没发的牌、种子永远不给 | 全站约定 |

### 超时规则

| 步骤 | 时限 | 到点怎么办 |
|---|---|---|
| 叫墩 | 30 秒，所有没叫的真人共用一个截止时间（别人叫墩、撤回都不会重置） | 由人机替他叫，记一次超时 |
| 出牌 | 25 秒 | 由人机替他出，记一次超时 |
| 一墩打完 | 1.8 秒 | 自动下一墩 / 本轮计分 |
| 结算页 | 15 秒（所有人点继续会提前） | 自动发下一轮；人机、托管、离线的人自动算「继续」 |

人机出错时退回默认动作：叫 `round(手牌数 / 人数)`，出合法牌里最不可能赢的一张（白旗 > 双面海盗当白旗 > 垫的小牌 > 领出花色小牌 > 黑旗 > 美人鱼 > 海盗 > 鬼船长）。

## 对外接口（`packages/game`）

- 规则纯函数（`cards.ts`）：`handSize(r, hands)`、`leadSuitOf(plays)`、`legalCards(hand, plays)`、`illegalReason(hand, plays, card)`（悬停提示「要跟海藻」）、`trickWinner(plays)`、`trickBonus(plays, winnerIndex)`、`bidPoints`、`roundScore(bid, won, handSize, bonus)`、`cardInfo`、`cardName`、`effectiveKind`。
- 引擎（`engine.ts`）：`createGame(players, seed, {tracker})`、`apply(state, playerId, command, rng)`（不改输入，version +1）、`advance(state, rng)`（trickEnd / roundEnd 的系统推进）、服务端用的 `applyCommand` / `advanceGame`（随机数状态存在 state 里）、`pendingActors(state)`（现在要谁行动）、`stepKey(state)`（计时 key）、`legalActions`、`timeoutStep`、`safestPlay`、`defaultBid`、`playOrder`、`dealerOf`、`playedThisRound`、`redactGameForViewer(state, viewerId, {seeAll})`。
- 命令：`BID {n}`、`UNBID`、`PLAY {card, as?}`（只有 `tigress` 带 `as: "pirate" | "escape"`）、`CONTINUE`（结算页）。
- 阶段：`bid` → `play` ⇄ `trickEnd` → `roundEnd` → … → `finished`。`state.turn` 是出牌阶段轮到的人；`state.trick` 是本墩已出的牌（trickEnd 时也还在，`state.tricks` 最后一项是刚打完那墩，含赢家和奖励明细）；`state.history` 是每轮结算。
- 牌的 id：`seaweed-7`、`coin-14`、`compass-1`、`flag-12`；`pirate-1..5`、`tigress`、`captain`（鬼船长，对应美术 `cards/ghost.png`）、`mermaid-1..2`、`escape-1..5`（美术共用 `cards/escape.png`）。幽灵水手在出牌记录里的 id 是 `GHOST_ID = "ghost"`。

### 预览局面工厂（`scenes.ts`）

```ts
buildGame({ names?, players?, round?, firstSeat?, hands?, ghostQueue?, scores?, tracker?, seed? }) // 某一轮刚发完牌的精确局面
script(state, [...bids([1, 2, 0]), play(0, "seaweed-9"), play(2, "tigress", "pirate"), "advance", [1, { type: "CONTINUE" }]])
playUntil(state, (s) => s.phase === "roundEnd")   // 用随机合法行动打到某个条件
withFinalScores(state, [210, 210, 150])           // 改终局总分（并列）
scene(name)                                         // 常用局面，name 见 SCENE_NAMES
tutorialGame()                                      // 教程剧本开局（规则书 §9.8：3 人第 4 轮）
```

`SCENE_NAMES`：`bid`、`bid-partial`、`play-lead`、`play-follow`（必须跟花色）、`play-tigress`（手里有双面海盗）、`play-others`（别人出牌中）、`trick-end`、`trick-bonus`（美人鱼抓鬼船长 +40、金币 14 +10）、`round-end`、`final`、`final-tie`、`ghost-bid`、`ghost-play`、`max8-bid`、`max8-play`、`max8-final`、`tutorial`。玩家 id 是 p1…pN，默认视角 p1。所有局面都是真引擎走出来的。「对手离线」「超时」是房间层面的状态，预览页里改 `members[].connected` / `turnRemainingMs` 造。

## 目录

| 路径 | 内容 |
|---|---|
| `packages/game/src` | 规则（`cards.ts`）、引擎（`engine.ts`）、类型、预览工厂（`scenes.ts`）、人机（`bot.ts`）、房间协议（`roomTypes.ts`） |
| `packages/game/test` | 规则测试 |
| `apps/server` | Socket.IO 房间服务器（同时叫墩的共用截止时间、一墩停顿、结算页、人机托管、观战、挤登录、管理员解散） |
| `apps/web` | 网页（Vite + React） |
| `scripts/test-bot.mjs`、`scripts/spy.mjs` | 陪玩机器人、抓包脚本 |
| `art/` | 美术规格和出图脚本（美术 agent 的暂存目录复制来的；`art/out/` 只提交 `final/`） |

## 部署

服务器上 `~/piratebid`，pm2 进程 `piratebid`（端口 3029），网页在 `/var/www/piratebid`，Caddy `handle_path /piratebid/*`（在付费网关 `@games` 里）。本机运行 `~/projects/deploy.sh piratebid`。pm2 按 `ecosystem.config.cjs` 直接启动 `node --import tsx`。端口和密钥存在 pm2 里，不进仓库。
