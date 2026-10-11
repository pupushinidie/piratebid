import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  cardInfo,
  cardName,
  dealerOf,
  GHOST_ID,
  illegalReason,
  leadSuitOf,
  legalCards,
  pendingActors,
  playedThisRound,
  playOrder,
  stepKey,
  SUIT_NAMES,
  trickWinner,
  type CardId,
  type GameCommand,
  type GameState,
  type LobbyMember,
  type LobbyRoomSnapshot,
  type Player,
  type TigressAs,
  type TrickRecord,
} from "@piratebid/game";
import { ART, avatarArt, cardAnim, cardPx, cardStyle, ghostAvatar, seatColor, specialIcon, suitIcon, type CardSize, type SpecialKey } from "./art.js";
import GameRules from "./GameRules.js";
import { playSelectSound, useGameSfx } from "./game-sfx.js";
import { sfx, useSfxCountdown } from "./gm-sound.js";
import { pickLayout, type Layout } from "./layout.js";
import { socket } from "./socket.js";
import { Coach, TipToast } from "./tutorial/Coach.js";
import { useFirstTimeTips } from "./tutorial/tips.js";
import { detectTips, GAME_ID, hintFor, TIPS, type Hint } from "./tutorial/tutorialGame.js";

interface GameBoardProps {
  readonly room: LobbyRoomSnapshot;
  readonly busy: boolean;
  readonly error: string;
  readonly notice: string;
  readonly brand: ReactNode;
  readonly connection: ReactNode;
  /** 顶栏的白天 / 夜间切换按钮（和 ♪ 声音面板）。 */
  readonly themeToggle: ReactNode;
  readonly theme: "day" | "night";
  readonly chat: ReactNode;
  readonly onCommand: (command: GameCommand) => void;
  readonly onRematch: (accept: boolean) => void;
  /** 打开 / 取消自己的托管。 */
  readonly onAuto: (enabled: boolean) => void;
  readonly onDissolve: () => void;
  /** 观战时从这位玩家的座位看。 */
  readonly watchId: string;
  readonly onWatch: (playerId: string) => void;
  /** 观战的人离开。 */
  readonly onLeave: () => void;
  /** 预览页用：强制显示「提示」按钮（正常只在练习局和只有自己和人机的房间里有）。 */
  readonly showHint?: boolean;
  /** 自己在 room.members 里的 id；默认 socket.id。新手教程在本地拼房间，传固定值。 */
  readonly selfMemberId?: string;
  /** online：真实对局；tutorial：教程剧本进行中；practice：教程后的练习局（随时能用「提示」）。 */
  readonly mode?: "online" | "tutorial" | "practice";
  /** 终局弹窗里替代「再来一局」的按钮（练习局：结束教程 / 再练一局）。 */
  readonly finalActions?: ReactNode;
}

function useViewport(): { w: number; h: number } {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return size;
}

/** 当前这一步还剩几秒（服务器给的是发送时剩余的毫秒数）。 */
function useCountdown(room: LobbyRoomSnapshot): number | null {
  const [now, setNow] = useState(Date.now());
  const [anchor, setAnchor] = useState({ at: Date.now(), ms: room.turnRemainingMs });
  useEffect(() => setAnchor({ at: Date.now(), ms: room.turnRemainingMs }), [room]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  if (anchor.ms === undefined) return null;
  return Math.max(0, Math.ceil((anchor.ms - Math.max(0, now - anchor.at)) / 1000));
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/* ---------- 牌 ---------- */

export function CardView({ card, size, className = "", animate = false, style, title }: {
  card: CardId | "back";
  size: CardSize;
  className?: string;
  /** 出牌区里的鬼船长、美人鱼、白旗播待机动画（只在大牌上）。 */
  animate?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  const anim = animate && card !== "back" && size.set === "lg" ? cardAnim(card) : null;
  const { w, h } = cardPx(size);
  const look: CSSProperties = anim
    ? ({ width: w, height: h, backgroundImage: `url(${anim})`, backgroundSize: `${w * 8}px ${h}px`, "--pb-anim-w": `${-w * 8}px` } as CSSProperties)
    : cardStyle(card, size);
  return (
    <span
      className={`pb-card${anim ? " pb-card-anim" : ""} ${className}`}
      style={{ ...look, ...style }}
      role="img"
      aria-label={card === "back" ? "牌背" : cardName(card)}
      title={title}
    />
  );
}

/* ---------- 座位 ---------- */

type BidState = "none" | "hit" | "bust" | "under";

/** 叫中（已赢 = 叫）绿、叫爆（已经超了，或叫 0 吃了墩）红。 */
export function bidState(game: GameState, player: Player): BidState {
  if (game.phase === "bid" || player.bid === null) return "none";
  if (player.won > player.bid) return "bust";
  if (player.won === player.bid) return "hit";
  return "under";
}

function SeatCard({ game, player, member, isMe, layout, active, seconds, fx }: {
  game: GameState;
  player: Player;
  member: LobbyMember | undefined;
  isMe: boolean;
  layout: Layout;
  active: boolean;
  seconds: number | null;
  fx: "hit" | "miss" | null;
}) {
  const state = bidState(game, player);
  const phone = layout.mode === "phone";
  // 座位窄（8 人局、1024）：头像 32、两个数字上下排、不放分数图标
  const compact = !phone && !isMe && layout.seatW < 210;
  const icon = phone ? 16 : 32;
  const bidding = game.phase === "bid";
  const first = game.firstPlayer === player.id;
  const tags = (
    <>
      {isMe && <em className="pb-tag you">你</em>}
      {member?.bot && <em className="pb-tag bot">人机</em>}
      {member?.auto && <em className="pb-tag auto">托管</em>}
      {member && !member.connected && !member.bot && <em className="pb-tag warn">离线</em>}
      {first && <em className="pb-tag first" title={`本轮由${player.name}先出（庄家是他的上家）`}>先出</em>}
    </>
  );
  const bidBox = bidding ? (
    <span className={player.bidSubmitted ? "pb-bidbox done" : "pb-bidbox wait"}>
      {player.bidSubmitted ? (
        <><img src={ART.bid} alt="" width={icon} height={icon} />{player.bid !== null && isMe ? `叫${player.bid}` : "已叫"}</>
      ) : (
        <>思考中</>
      )}
    </span>
  ) : (
    <span className={`pb-bidbox ${state}`} key={`r${game.round}`} title={`叫 ${player.bid} 墩，已赢 ${player.won} 墩${state === "hit" ? "（正好叫中）" : state === "bust" ? "（已经超了）" : ""}`}>
      <small>叫</small>{player.bid}<small>赢</small>{player.won}
      {!phone && !compact && state === "hit" && <img src={ART.hit} alt="叫中" width={icon} height={icon} />}
      {!phone && !compact && state === "bust" && <img src={ART.miss} alt="叫爆" width={icon} height={icon} />}
    </span>
  );
  return (
    <div
      className={`pb-seat${active ? " active" : ""}${isMe ? " me" : ""}${phone ? " phone" : ""}${compact ? " compact" : ""}`}
      data-seat={player.id}
      data-tutorial={isMe ? "me" : `seat:${player.id}`}
      style={{ "--seat": seatColor(player.seat) } as CSSProperties}
    >
      {!(phone && !isMe) && <span className="pb-avatar"><img src={avatarArt(player.seat)} alt="" width={phone || compact ? 32 : 64} height={phone || compact ? 32 : 64} /></span>}
      <div className="pb-seat-body">
        <div className="pb-seat-name"><strong>{player.name}</strong>{!phone && tags}</div>
        <div className="pb-seat-nums" data-tutorial={isMe ? "my-bid" : undefined}>
          {bidBox}
          <span className="pb-score" title="累计分">{!phone && !compact && <img src={ART.score} alt="" width={32} height={32} />}{player.score}<small>分</small></span>
        </div>
      </div>
      {phone && (member?.bot || member?.auto || (member && !member.connected) || first) && <div className="pb-seat-tags">{tags}</div>}
      {active && !isMe && seconds !== null && !phone && <span className="pb-seat-clock">{seconds}</span>}
      {fx && <span className={`pb-fx pb-fx-${fx}`} key={`${fx}-${game.version}`} />}
    </div>
  );
}

function GhostSeat({ game, layout }: { game: GameState; layout: Layout }) {
  const phone = layout.mode === "phone";
  return (
    <div className={`pb-seat ghost${phone ? " phone" : ""}${!phone && layout.seatW < 210 ? " compact" : ""}`} data-seat={GHOST_ID} data-tutorial="seat:ghost" title="2 人局的幽灵水手：不叫墩、不计分，轮到它就翻最上面一张">
      {!phone && <span className="pb-avatar"><img src={ghostAvatar} alt="" width={layout.seatW < 210 ? 32 : 64} height={layout.seatW < 210 ? 32 : 64} /></span>}
      <div className="pb-seat-body">
        <div className="pb-seat-name"><strong>幽灵水手</strong></div>
        <div className="pb-seat-nums">
          <span className="pb-ghost-pile"><img src={ART.pileSm} alt="" width={phone ? 23 : 46} height={phone ? 34 : 67} />×{game.handCounts[GHOST_ID] ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- 出牌区上方：领出花色、记牌辅助 ---------- */

function LeadHint({ game, phone }: { game: GameState; phone: boolean }) {
  if (game.phase === "bid") return <span className="pb-leadhint"><b>叫墩</b>本轮 {game.handSize} 墩</span>;
  const plays = game.phase === "play" ? game.trick : game.tricks[game.tricks.length - 1]?.plays ?? [];
  const lead = leadSuitOf(plays);
  const icon = lead === null ? null : lead === "none" ? suitIcon("none") : suitIcon(lead);
  const text = plays.length === 0 ? "等领出" : lead === null ? "白旗领出，下一张定花色" : lead === "none" ? "没有花色，随便出" : `领出${SUIT_NAMES[lead]}${phone ? "" : "：有就要跟，特殊牌随时能出"}`;
  return (
    <span className="pb-leadhint" data-tutorial="lead-suit">
      <b>第 {Math.min(game.trickNo + 1, game.handSize)}/{game.handSize} 墩</b>
      {icon && <img src={icon} alt="" width={24} height={24} />}
      {text}
    </span>
  );
}

const TRACK: { kind: SpecialKey; total: number; match: (card: CardId) => boolean; name: string }[] = [
  { kind: "ghost", total: 1, match: (card) => card === "captain", name: "鬼船长" },
  { kind: "pirate", total: 5, match: (card) => card.startsWith("pirate-"), name: "海盗" },
  { kind: "tigress", total: 1, match: (card) => card === "tigress", name: "双面海盗" },
  { kind: "mermaid", total: 2, match: (card) => card.startsWith("mermaid-"), name: "美人鱼" },
  { kind: "escape", total: 5, match: (card) => card.startsWith("escape-"), name: "白旗" },
];

/** 记牌辅助：本轮出过的特殊牌（没出的灰掉）、黑旗出过哪几张。 */
function Tracker({ game, phone }: { game: GameState; phone: boolean }) {
  const played = playedThisRound(game).map((play) => play.card);
  const flags = played.filter((card) => card.startsWith("flag-")).map((card) => Number(card.slice(5))).sort((a, b) => b - a);
  const size = phone ? 16 : 24;
  return (
    <span className="pb-tracker" data-tutorial="tracker" title="记牌辅助：本轮已经出过的特殊牌和黑旗">
      {TRACK.map(({ kind, total, match, name }) => {
        const count = played.filter(match).length;
        return (
          <span key={kind} className={count > 0 ? "pb-track on" : "pb-track"} title={`${name}：本轮出了 ${count} / ${total} 张`}>
            <img src={specialIcon(kind, phone)} alt={name} width={size} height={size} />
            {total > 1 && <small>{count}</small>}
          </span>
        );
      })}
      <span className={flags.length ? "pb-track on flag" : "pb-track flag"} title={flags.length ? `黑旗本轮出过：${flags.join("、")}` : "黑旗本轮还没出"}>
        <img src={suitIcon("flag", phone)} alt="黑旗" width={size} height={size} />
        <small>{flags.length ? (phone ? flags[0] : flags.slice(0, 4).join(" ")) : "—"}</small>
      </span>
    </span>
  );
}

/* ---------- 出牌区 ---------- */

const BONUS_NAMES = { fourteen: "14", flag14: "黑旗 14", pirateMermaid: "海盗抓美人鱼", captainPirate: "鬼船长抓海盗", mermaidCaptain: "美人鱼抓鬼船长" } as const;

function bonusText(trick: TrickRecord): string {
  return trick.bonus.map((item) => `${BONUS_NAMES[item.kind]} +${item.points}`).join("、");
}

function TrickArea({ game, layout, names, selfId, reduced, collect }: {
  game: GameState;
  layout: Layout;
  names: Record<string, string>;
  selfId: string;
  reduced: boolean;
  collect: { dx: number; dy: number } | null;
}) {
  const ended = game.phase === "play" ? null : game.tricks[game.tricks.length - 1] ?? null;
  const plays = ended ? ended.plays : game.trick;
  const order = ended ? ended.plays.map((play) => play.by) : playOrder(game, game.leader);
  const leading = plays.length > 0 ? (ended ? ended.winnerIndex : trickWinner(plays)) : -1;
  const size = layout.trick;
  const { w, h } = layout.trickCard;
  const width = (order.length - 1) * layout.trickStep + w;
  const bonus = ended ? ended.bonus.reduce((sum, item) => sum + item.points, 0) : 0;
  const splash = ended?.bonus.some((item) => item.kind === "mermaidCaptain") ?? false;
  const markSize = size.set === "lg" ? 40 * size.scale : size.scale >= 3 ? 40 : 20;
  return (
    <div className="pb-trick" style={{ width, height: h + 24 }} data-tutorial="trick">
      {order.map((who, index) => {
        const play = plays[index];
        const left = index * layout.trickStep;
        if (!play) {
          const now = game.phase === "play" && game.turn === who;
          return (
            <div key={`slot-${index}`} className={now ? "pb-slot now" : "pb-slot"} style={{ left, width: w, height: h }}>
              <span>{now ? "出牌中" : ""}</span>
              <em>{who === GHOST_ID ? "幽灵" : names[who] ?? who}</em>
            </div>
          );
        }
        const win = index === leading;
        const style: CSSProperties = { left, zIndex: index + 1 };
        if (collect && ended) style.transform = `translate(${Math.round(collect.dx - left - w / 2)}px, ${Math.round(collect.dy)}px) scale(0.5)`;
        return (
          <div key={`${game.round}-${play.card}`} className={`pb-played${play.by === selfId ? " mine" : ""}${win ? " lead" : ""}${collect ? " collect" : ""}`} style={style} data-card={play.card}>
            {win && <img className="pb-glow" src={size.set === "lg" ? ART.glow : ART.glowSm} alt="" style={{ width: w + (size.set === "lg" ? 8 : 6) * size.scale, height: h + (size.set === "lg" ? 8 : 6) * size.scale }} />}
            <CardView card={play.card} size={size} animate={!reduced && layout.mode !== "phone"} />
            {play.as && (
              <img className="pb-mark" src={play.as === "pirate" ? ART.markPirate : ART.markEscape} alt={play.as === "pirate" ? "当海盗" : "当白旗"} style={{ width: markSize, height: markSize }} />
            )}
            <em className="pb-owner">{play.by === GHOST_ID ? "幽灵" : names[play.by] ?? play.by}</em>
            {ended && win && !reduced && game.phase === "trickEnd" && <span className="pb-fx pb-fx-trick" />}
            {ended && win && splash && !reduced && game.phase === "trickEnd" && <span className="pb-fx pb-fx-splash" />}
            {ended && win && bonus > 0 && ended.winner !== GHOST_ID && (
              <span className="pb-bonus" title="赢家叫中时才算">
                {!reduced && game.phase === "trickEnd" && <span className="pb-fx pb-fx-coins" />}+{bonus}
              </span>
            )}
          </div>
        );
      })}
      {ended && game.phase === "trickEnd" && (
        <div className="pb-trick-banner" data-tutorial="trick-winner">
          {ended.winner === GHOST_ID ? "幽灵水手" : names[ended.winner]} 赢下这一墩
          {ended.bonus.length > 0 && ended.winner !== GHOST_ID && layout.mode !== "phone" && <small>{bonusText(ended)}（叫中才算）</small>}
        </div>
      )}
    </div>
  );
}

/* ---------- 叫墩 ---------- */

function BidPanel({ game, me, layout, canAct, busy, hintBid, onBid, onUnbid }: {
  game: GameState;
  me: Player | undefined;
  layout: Layout;
  canAct: boolean;
  busy: boolean;
  hintBid: number | null;
  onBid: (n: number) => void;
  onUnbid: () => void;
}) {
  const submitted = me?.bidSubmitted ?? false;
  const done = game.players.filter((player) => player.bidSubmitted).length;
  return (
    <div className="pb-bidpanel" data-tutorial="bid-panel">
      <div className="pb-bid-title">
        {me ? (
          submitted ? <>你叫了 <b>{me.bid}</b> 墩，等其他人（{done}/{game.players.length}）</> : <>这轮你能赢几墩？</>
        ) : (
          <>大家在叫墩（{done}/{game.players.length}）</>
        )}
      </div>
      {me && (
        <div className="pb-chips" style={{ "--chip": `${32 * layout.chipScale}px` } as CSSProperties}>
          {Array.from({ length: game.handSize + 1 }, (_, n) => {
            const on = submitted && me.bid === n;
            return (
              <button
                key={n}
                type="button"
                className={`pb-chip${on ? " on" : ""}${hintBid === n ? " hinted" : ""}`}
                disabled={!canAct || busy}
                onClick={() => onBid(n)}
                data-tutorial={`bid:${n}`}
                aria-pressed={on}
                aria-label={`叫 ${n} 墩`}
              >
                {n}
              </button>
            );
          })}
        </div>
      )}
      {me && !submitted && <div className="pb-bid-sub">0 到 {game.handSize}，大家同时叫、一起亮出；正好叫中才得分</div>}
      {me && submitted && canAct && (
        <button type="button" className="quiet-button pb-unbid" onClick={onUnbid} disabled={busy}>撤回重叫</button>
      )}
    </div>
  );
}

/* ---------- 一轮结算、终局 ---------- */

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function RoundEndDialog({ game, names, selfId, seconds, canContinue, busy, onContinue, phone }: {
  game: GameState;
  names: Record<string, string>;
  selfId: string;
  seconds: number | null;
  canContinue: boolean;
  busy: boolean;
  onContinue: () => void;
  phone: boolean;
}) {
  const result = game.history[game.history.length - 1]!;
  const waiting = game.players.filter((player) => !game.ready.includes(player.id)).map((player) => player.name);
  const icon = phone ? 16 : 32;
  return (
    <div className="gm-modal-backdrop pb-backdrop-light">
      <section className="gm-panel pb-dialog pb-round-dialog" role="dialog" aria-label={`第 ${result.round} 轮结算`} data-tutorial="round-result">
        <h2>第 {result.round} 轮结算 <small>每人 {result.handSize} 张</small></h2>
        <table className="pb-table">
          <thead>
            <tr><th>玩家</th><th>叫/赢</th>{!phone && <th>叫墩分</th>}{!phone && <th>奖励</th>}<th>本轮</th><th>总分</th></tr>
          </thead>
          <tbody>
            {result.results.map((entry) => {
              const hit = entry.bid === entry.won;
              return (
                <tr key={entry.player} className={entry.player === selfId ? "me" : ""} data-tutorial={`result:${entry.player}`}>
                  <td className="pb-name-cell"><img src={hit ? ART.hit : ART.miss} alt={hit ? "叫中" : "没叫中"} width={icon} height={icon} /><span>{names[entry.player]}</span></td>
                  <td>{entry.bid}/{entry.won}</td>
                  {!phone && <td>{signed(entry.bidPoints)}</td>}
                  {!phone && <td>{entry.bonus ? `+${entry.bonus}` : entry.lostBonus ? <s title="没叫中，奖励作废">+{entry.lostBonus}</s> : "—"}</td>}
                  <td className={entry.points >= 0 ? "pos" : "neg"}>{signed(entry.points)}</td>
                  <td className="pb-total">{entry.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="pb-dialog-note">叫中：每墩 +20（叫 0 是 +10×张数），再加奖励；没叫中：差几墩扣几个 10（叫 0 吃了墩扣 10×张数），奖励作废。</p>
        <div className="pb-dialog-actions">
          {canContinue ? (
            <button type="button" className="primary-button pb-big" onClick={onContinue} disabled={busy} data-tutorial="continue">
              继续{seconds !== null ? `（${seconds}）` : ""}
            </button>
          ) : (
            <span className="pb-wait">等 {waiting.join("、") || "大家"} 点继续{seconds !== null ? `（${seconds}）` : ""}</span>
          )}
        </div>
      </section>
    </div>
  );
}

function useRematchSeconds(remainingMs: number | undefined): number | null {
  const [now, setNow] = useState(Date.now());
  const [anchor, setAnchor] = useState({ at: Date.now(), ms: remainingMs });
  useEffect(() => setAnchor({ at: Date.now(), ms: remainingMs }), [remainingMs]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  if (anchor.ms === undefined) return null;
  return Math.max(0, Math.ceil((anchor.ms - Math.max(0, now - anchor.at)) / 1000));
}

function FinalDialog({ game, room, selfId, memberId, spectating, phone, onRematch, onLeave, actions }: {
  game: GameState;
  room: LobbyRoomSnapshot;
  selfId: string;
  memberId: string;
  spectating: boolean;
  phone: boolean;
  onRematch: (accept: boolean) => void;
  onLeave: () => void;
  actions?: ReactNode;
}) {
  const winners = game.finalResult?.winners ?? [];
  const ranked = [...game.players].sort((a, b) => b.score - a.score);
  const seconds = useRematchSeconds(room.rematch?.remainingMs);
  const accepted = room.rematch?.acceptedIds.includes(memberId) ?? false;
  const waiting = room.members.filter((member) => !room.rematch?.acceptedIds.includes(member.id)).map((member) => member.name);
  const [showTable, setShowTable] = useState(!phone);
  const winnerNames = winners.map((id) => game.players.find((player) => player.id === id)?.name).join("、");
  return (
    <div className="gm-modal-backdrop pb-backdrop-light">
      <section className="gm-panel pb-dialog pb-final-dialog" role="dialog" aria-label="终局结算" data-tutorial="final">
        <h2>{winners.includes(selfId) && !spectating ? (winners.length > 1 ? "并列第一！" : "你赢了！") : `${winnerNames} ${winners.length > 1 ? "并列第一" : "赢了"}`}</h2>
        <ol className="pb-ranking">
          {ranked.map((player) => {
            const rank = 1 + game.players.filter((other) => other.score > player.score).length;
            const won = winners.includes(player.id);
            return (
              <li key={player.id} className={`${won ? "win" : ""}${player.id === selfId ? " me" : ""}`}>
                <span className="pb-rank">{rank}</span>
                <img className="pb-rank-avatar" src={avatarArt(player.seat)} alt="" width={32} height={32} />
                <strong>{player.name}</strong>
                {won && <img className="pb-winner" src={ART.winner} alt="赢家" width={52} height={53} />}
                <b>{player.score}</b>
              </li>
            );
          })}
        </ol>
        {phone && <button type="button" className="quiet-button" onClick={() => setShowTable(!showTable)}>{showTable ? "收起每轮明细" : "看每轮明细"}</button>}
        {showTable && (
          <div className="pb-history-wrap">
            <table className="pb-table pb-history">
              <thead>
                <tr><th>轮</th>{game.players.map((player) => <th key={player.id}>{player.name}</th>)}</tr>
              </thead>
              <tbody>
                {game.history.map((round) => (
                  <tr key={round.round}>
                    <td>{round.round}</td>
                    {round.results.map((entry) => (
                      <td key={entry.player} className={entry.bid === entry.won ? "pos" : "neg"} title={`叫 ${entry.bid} 赢 ${entry.won}`}>
                        {signed(entry.points)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pb-dialog-actions">
          {actions ?? (spectating ? (
            <button type="button" className="quiet-button" onClick={onLeave}>离开观战</button>
          ) : room.rematch ? (
            accepted ? (
              <span className="pb-wait">等 {waiting.join("、")} 确认{seconds !== null ? `（${seconds}）` : ""}</span>
            ) : (
              <>
                <button type="button" className="quiet-button" onClick={() => onRematch(false)}>不玩了</button>
                <button type="button" className="primary-button pb-big" onClick={() => onRematch(true)} data-tutorial="rematch">再来一局{seconds !== null ? `（${seconds}）` : ""}</button>
              </>
            )
          ) : null)}
        </div>
      </section>
    </div>
  );
}

/* ---------- 日志 ---------- */

interface LogLine {
  readonly id: string;
  readonly text: string;
  readonly cls?: string;
}

function eventLines(game: GameState, names: Record<string, string>): LogLine[] {
  const name = (id: string) => (id === GHOST_ID ? "幽灵水手" : names[id] ?? id);
  const lines: LogLine[] = [];
  game.events.forEach((event, index) => {
    const id = `${game.round}-${game.version}-${index}`;
    switch (event.type) {
      case "RoundStarted":
        lines.push({ id, text: `第 ${event.round} 轮：每人 ${event.handSize} 张，${name(event.first)} 先出`, cls: "round" });
        break;
      case "BidsRevealed":
        lines.push({ id, text: `亮叫墩：${Object.entries(event.bids).map(([player, n]) => `${name(player)} ${n}`).join("、")}`, cls: "reveal" });
        break;
      case "CardPlayed":
        lines.push({ id, text: `${name(event.player)} 出 ${cardName(event.card, event.as)}` });
        break;
      case "TrickWon": {
        const bonus = event.bonus.reduce((sum, item) => sum + item.points, 0);
        lines.push({ id, text: `${name(event.winner)} 赢下第 ${event.trick + 1} 墩${bonus && event.winner !== GHOST_ID ? `（奖励 +${bonus}）` : ""}`, cls: "win" });
        break;
      }
      case "RoundScored": {
        const round = game.history.find((entry) => entry.round === event.round);
        if (round) lines.push({ id, text: `第 ${event.round} 轮结算：${round.results.map((entry) => `${name(entry.player)} ${signed(entry.points)}`).join("、")}`, cls: "score" });
        break;
      }
      case "GameEnded":
        lines.push({ id, text: `终局：${event.winners.map(name).join("、")} 获胜`, cls: "score" });
        break;
      case "TimedOut":
        if (event.players.length) lines.push({ id, text: `${event.players.map(name).join("、")} 超时，人机代打`, cls: "warn" });
        break;
      default:
        break;
    }
  });
  return lines;
}

/* ---------- 牌桌 ---------- */

function GameBoard(props: GameBoardProps) {
  const { room, busy, onCommand } = props;
  const game = room.game!;
  const viewport = useViewport();
  const reduced = useReducedMotion();
  const memberId = props.selfMemberId ?? socket.id ?? "";
  const meMember = room.members.find((member) => member.id === memberId);
  const spectating = !meMember;
  const selfId = spectating ? props.watchId : meMember.playerId;
  const me = game.players.find((player) => player.id === selfId);
  const myHand = game.hands[selfId] ?? [];
  const mode = props.mode ?? "online";
  const names = useMemo(() => Object.fromEntries(game.players.map((player) => [player.id, player.name])), [game.players]);
  const memberOf = (playerId: string) => room.members.find((member) => member.playerId === playerId);
  const layout = pickLayout(viewport.w, viewport.h, game.players.length, game.config.ghost, game.handSize);
  const phone = layout.mode === "phone";
  const seconds = useCountdown(room);
  const pending = pendingActors(game);
  const canAct = !spectating && pending.includes(selfId) && !meMember?.auto;
  const myTurnToPlay = canAct && game.phase === "play";
  const legal = useMemo(() => (myTurnToPlay ? new Set(legalCards(myHand, game.trick)) : null), [myTurnToPlay, myHand, game.trick]);
  const [selected, setSelected] = useState<CardId | null>(null);
  const [hint, setHint] = useState<{ hint: Hint; key: string } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [flash, setFlash] = useState("");
  const flashTimer = useRef<number | undefined>(undefined);
  const key = stepKey(game);

  // 换步骤时清掉选中；提示只留在这一步
  useEffect(() => {
    setSelected(null);
    setHint((current) => (current && current.key === key ? current : null));
  }, [key]);

  // ---- 音效 ----
  useGameSfx({ game, selfId: spectating ? "" : selfId, canAct });
  useSfxCountdown(canAct && game.phase !== "roundEnd", seconds);

  // ---- 日志（只看 version 变化）----
  const [log, setLog] = useState<LogLine[]>([]);
  const lastVersion = useRef(-1);
  useEffect(() => {
    if (game.version === lastVersion.current) return;
    const fresh = lastVersion.current >= 0 && game.version > lastVersion.current;
    lastVersion.current = game.version;
    const lines = eventLines(game, names);
    setLog((current) => (fresh ? [...current, ...lines] : lines).slice(-80));
  }, [game.version]);
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = logRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [log.length]);

  // ---- 一轮结算时座位上的叫中 / 叫爆特效（计时器不跟着 version 清）----
  const [seatFx, setSeatFx] = useState<{ version: number; fx: Record<string, "hit" | "miss"> } | null>(null);
  const fxTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const scored = game.events.find((event) => event.type === "RoundScored");
    if (!scored || scored.type !== "RoundScored" || reduced) return;
    const round = game.history.find((entry) => entry.round === scored.round);
    if (!round) return;
    setSeatFx({ version: game.version, fx: Object.fromEntries(round.results.map((entry) => [entry.player, entry.bid === entry.won ? "hit" : "miss"])) });
    window.clearTimeout(fxTimer.current);
    fxTimer.current = window.setTimeout(() => setSeatFx(null), 1500);
  }, [game.version]);
  useEffect(() => () => {
    window.clearTimeout(fxTimer.current);
    window.clearTimeout(flashTimer.current);
  }, []);
  const fxOf = (id: string) => seatFx?.fx[id] ?? null;

  // ---- 真实对局里第一次遇到某条规则（叫爆、叫 0 吃墩、要跟花色、美人鱼抓鬼船长、被托管……）时弹一句小贴士 ----
  const tips = useFirstTimeTips(GAME_ID, game.version, () => detectTips(game, selfId, meMember?.auto === true), TIPS, mode === "online" && !spectating);

  // ---- 一墩打完：停一下后把整墩牌滑向赢家（教程剧本里不滑，咕噜嘎要指着这墩讲） ----
  const boardRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLElement>(null);
  const [collect, setCollect] = useState<{ dx: number; dy: number; version: number } | null>(null);
  useLayoutEffect(() => {
    if (game.phase !== "trickEnd" || reduced || mode === "tutorial") return;
    const version = game.version;
    const winner = game.tricks[game.tricks.length - 1]!.winner;
    const timer = window.setTimeout(() => {
      const seat = boardRef.current?.querySelector(`[data-seat="${winner}"]`)?.getBoundingClientRect();
      const area = centerRef.current?.querySelector(".pb-trick")?.getBoundingClientRect();
      if (!seat || !area) return;
      setCollect({ dx: seat.left + seat.width / 2 - area.left, dy: seat.top + seat.height / 2 - (area.top + area.height / 2), version });
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [game.version]);
  const collecting = collect && collect.version === game.version ? collect : null;

  // ---- 操作 ----
  function playCard(card: CardId, as?: TigressAs) {
    setSelected(null);
    setHint(null);
    onCommand(as ? { type: "PLAY", card, as } : { type: "PLAY", card });
  }
  function showFlash(text: string) {
    setFlash(text);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(""), 2000);
  }
  function clickCard(card: CardId) {
    if (!myTurnToPlay || busy) return;
    if (legal && !legal.has(card)) {
      sfx.deny();
      showFlash(illegalReason(myHand, game.trick, card) ?? "现在不能出这张");
      return;
    }
    if (selected === card) {
      if (cardInfo(card).kind === "tigress") return; // 双面海盗要在操作区选身份
      playCard(card);
      return;
    }
    playSelectSound();
    setSelected(card);
  }
  function askHint() {
    if (hint && hint.key === key) {
      setHint(null);
      return;
    }
    const next = hintFor(game, selfId);
    if (next.card) setSelected(next.card);
    setHint({ hint: next, key });
  }

  const onlyBots = room.members.every((member) => member.id === memberId || member.bot);
  const hintAllowed = !spectating && (props.showHint === true || mode === "practice" || (mode === "online" && onlyBots));
  // 键盘：Esc 取消选中，Enter / 空格出选中的牌，H 提示
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      if (event.key === "Escape") setSelected(null);
      if ((event.key === "Enter" || event.key === " ") && selected && myTurnToPlay && cardInfo(selected).kind !== "tigress") {
        event.preventDefault();
        playCard(selected);
      }
      if ((event.key === "h" || event.key === "H") && !event.metaKey && !event.ctrlKey && hintAllowed && canAct) askHint();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // 页面在后台时标题提示
  useEffect(() => {
    const base = "海盗叫墩 · 在线对战";
    document.title = canAct && game.phase !== "roundEnd" ? `【轮到你】${base}` : base;
    return () => {
      document.title = base;
    };
  }, [canAct, game.phase]);

  // ---- 座位：从我左手边开始顺时针（观战看被观战的人）----
  const anchorSeat = me?.seat ?? 0;
  const count = game.players.length;
  const others = game.players.filter((player) => player.id !== selfId).sort((a, b) => ((a.seat - anchorSeat + count) % count) - ((b.seat - anchorSeat + count) % count));
  const activeIds = new Set(game.phase === "play" ? (game.turn ? [game.turn] : []) : game.phase === "bid" ? pending : []);

  const seatStrip = (
    <div className="pb-seats" style={{ gridTemplateColumns: `repeat(${layout.seatCols}, ${phone ? "minmax(0, 1fr)" : `${layout.seatW}px`})` }} data-tutorial="seats">
      {others.map((player) => (
        <SeatCard key={player.id} game={game} player={player} member={memberOf(player.id)} isMe={false} layout={layout} active={activeIds.has(player.id)} seconds={seconds} fx={fxOf(player.id)} />
      ))}
      {game.config.ghost && <GhostSeat game={game} layout={layout} />}
    </div>
  );

  // ---- 操作区 ----
  let status: ReactNode;
  if (spectating) status = <>观战中 · 看 <b>{names[selfId]}</b></>;
  else if (meMember?.auto) status = <>托管中：人机在替你打</>;
  else if (game.phase === "bid") status = me?.bidSubmitted ? <>已叫墩，等其他人</> : <>选一个数叫墩</>;
  else if (game.phase === "play") status = myTurnToPlay ? <>轮到你出牌</> : <>等 <b>{names[game.turn ?? ""]}</b> 出牌</>;
  else if (game.phase === "trickEnd") {
    const last = game.tricks[game.tricks.length - 1]!;
    status = <><b>{last.winner === GHOST_ID ? "幽灵水手" : names[last.winner]}</b> 赢下这一墩</>;
  } else if (game.phase === "roundEnd") status = <>第 {game.round} 轮结束</>;
  else status = <>对局结束</>;
  const clock = canAct && seconds !== null && (game.phase === "bid" || game.phase === "play") ? <span className="pb-clock" data-tutorial="clock">{seconds}</span> : null;
  const selectedTigress = selected !== null && cardInfo(selected).kind === "tigress";
  const actions: ReactNode = (
    <div className={`pb-actions${phone ? " phone" : ""}`} data-tutorial="actions">
      <div className={canAct ? "pb-status mine" : "pb-status"} data-tutorial="status">{status}{clock}</div>
      {meMember?.auto && (
        <button type="button" className="primary-button pb-big" onClick={() => props.onAuto(false)} data-tutorial="cancel-auto">取消托管</button>
      )}
      {myTurnToPlay && selected && !selectedTigress && (
        <button type="button" className="primary-button pb-big" onClick={() => playCard(selected)} disabled={busy} data-tutorial="play">出这张</button>
      )}
      {myTurnToPlay && selectedTigress && (
        <div className="pb-tigress" data-tutorial="tigress-choice">
          <button type="button" className="primary-button" onClick={() => playCard(selected, "pirate")} disabled={busy} data-tutorial="as:pirate"><img src={ART.markPirate} alt="" width={40} height={40} />当海盗</button>
          <button type="button" className="primary-button" onClick={() => playCard(selected, "escape")} disabled={busy} data-tutorial="as:escape"><img src={ART.markEscape} alt="" width={40} height={40} />当白旗</button>
        </div>
      )}
      {myTurnToPlay && !phone && !hint && <p className="pb-tip">{!selected ? "点一张牌选中，再点一次出牌；灰掉的不能出" : selectedTigress ? "选当海盗还是当白旗" : "再点一次这张，或按上面的按钮；Esc 取消"}</p>}
      {(flash || props.error) && <p className="pb-flash" role="alert">{flash || props.error}</p>}
      {hintAllowed && canAct && game.phase !== "roundEnd" && (
        <button type="button" className={hint ? "quiet-button pb-hint-button on" : "quiet-button pb-hint-button"} onClick={askHint} title="人机替你算一步（键盘 H）" data-tutorial="hint">提示</button>
      )}
    </div>
  );

  // ---- 手牌 ----
  const handWidth = myHand.length > 0 ? (myHand.length - 1) * layout.handStep + layout.handCard.w : layout.handCard.w;
  const hand = (
    <div className="pb-hand" style={{ width: handWidth, height: layout.handCard.h + 16 }} data-tutorial="hand">
      {myHand.map((card, index) => {
        const off = legal !== null && !legal.has(card);
        const reason = off ? illegalReason(myHand, game.trick, card) ?? undefined : undefined;
        return (
          <button
            key={card}
            type="button"
            className={`pb-hand-card${off ? " off" : ""}${selected === card ? " selected" : ""}${legal && !off ? " playable" : ""}${hint?.hint.card === card ? " hinted" : ""}`}
            style={{ left: index * layout.handStep, zIndex: index + 1 }}
            onClick={() => clickCard(card)}
            aria-disabled={!myTurnToPlay || off}
            title={reason ?? cardName(card)}
            data-tutorial={`card:${card}`}
            data-sfx="none"
          >
            <CardView card={card} size={layout.hand} />
          </button>
        );
      })}
      {myHand.length === 0 && <span className="pb-hand-empty">{spectating ? "看不到这位玩家的手牌" : "这一轮的牌出完了"}</span>}
    </div>
  );

  const isHost = room.members.find((member) => member.isHost)?.id === memberId;
  const topbar = (
    <header className="topbar pb-topbar">
      {props.brand}
      <div className="pb-round" data-tutorial="round">
        <b>第 {game.round}/{game.config.rounds} 轮</b>
        {!phone && <span>每人 {game.handSize} 张 · 庄家 {names[dealerOf(game)]}</span>}
      </div>
      <div className="topbar-right">
        {!phone && <GameRules />}
        {layout.sideW === 0 && (
          <button type="button" className="quiet-button" onClick={() => setDrawer(!drawer)} aria-expanded={drawer} data-tutorial="drawer">{phone ? "更多" : "记录/聊天"}</button>
        )}
        {!spectating && !meMember?.auto && game.phase !== "finished" && mode === "online" && !phone && (
          <button type="button" className="quiet-button" onClick={() => props.onAuto(true)} title="让人机替你打，随时可以取消">托管</button>
        )}
        {props.themeToggle}
        {props.connection}
        {mode === "online" && !phone && (spectating ? (
          <button type="button" className="quiet-button" onClick={props.onLeave}>离开</button>
        ) : isHost ? (
          <button type="button" className="quiet-button danger" onClick={props.onDissolve}>解散</button>
        ) : null)}
      </div>
    </header>
  );

  const side = (
    <aside className={layout.sideW ? "pb-side" : `pb-side drawer${drawer ? " open" : ""}`}>
      {layout.sideW === 0 && (
        <div className="pb-drawer-tools">
          {phone && <GameRules />}
          {phone && !spectating && !meMember?.auto && mode === "online" && game.phase !== "finished" && <button type="button" className="quiet-button" onClick={() => props.onAuto(true)}>托管</button>}
          {phone && mode === "online" && (spectating ? <button type="button" className="quiet-button" onClick={props.onLeave}>离开</button> : isHost ? <button type="button" className="quiet-button danger" onClick={props.onDissolve}>解散</button> : null)}
          <button type="button" className="quiet-button" onClick={() => setDrawer(false)}>关闭</button>
        </div>
      )}
      <section className="pb-log-panel">
        <div className="panel-label">记录</div>
        <ol className="pb-log" ref={logRef}>
          {log.map((line) => <li key={line.id} className={line.cls}>{line.text}</li>)}
        </ol>
      </section>
      <section className="pb-chat-panel">{props.chat}</section>
    </aside>
  );

  const center = (
    <section className={`pb-center${game.phase === "bid" ? " bidding" : ""}`} ref={centerRef}>
      <div className="pb-center-top">
        <LeadHint game={game} phone={phone} />
        {game.config.tracker && game.phase !== "bid" && <Tracker game={game} phone={phone} />}
      </div>
      <div className="pb-center-body">
        {game.phase === "bid" ? (
          <BidPanel game={game} me={spectating ? undefined : me} layout={layout} canAct={canAct} busy={busy} hintBid={hint?.hint.bid ?? null} onBid={(n) => { setHint(null); onCommand({ type: "BID", n }); }} onUnbid={() => onCommand({ type: "UNBID" })} />
        ) : (
          <TrickArea game={game} layout={layout} names={names} selfId={selfId} reduced={reduced} collect={collecting} />
        )}
      </div>
    </section>
  );

  const meSeat = me ? (
    <SeatCard game={game} player={me} member={meMember ?? memberOf(selfId)} isMe={!spectating} layout={layout} active={activeIds.has(selfId)} seconds={seconds} fx={fxOf(selfId)} />
  ) : null;

  const style = {
    "--top-h": `${layout.topH}px`,
    "--gap": `${layout.gap}px`,
    "--seat-h": `${layout.seatH}px`,
    "--center-h": `${layout.centerH}px`,
    "--hand-bar-h": `${layout.handBarH}px`,
    "--me-w": `${layout.meW}px`,
    "--action-w": `${layout.actionW}px`,
    "--side-w": `${layout.sideW}px`,
  } as CSSProperties;

  return (
    <div className={`pb-board pb-${layout.mode}`} style={style} ref={boardRef}>
      <div className="pb-scene" aria-hidden="true">{props.theme !== "day" && !reduced && <span className="pb-candles" />}</div>
      {topbar}
      <div className="pb-main">
        <div className="pb-table-area">
          {seatStrip}
          {center}
          {phone ? (
            <>
              <div className="pb-mebar">{meSeat}{actions}</div>
              <div className="pb-hand-wrap">{hand}</div>
            </>
          ) : (
            <div className="pb-handbar">
              <div className="pb-me">
                {meSeat}
                {spectating && (
                  <select className="pb-watch" value={selfId} onChange={(event) => props.onWatch(event.target.value)} aria-label="看谁的座位">
                    {game.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                  </select>
                )}
              </div>
              <div className="pb-hand-wrap">{hand}</div>
              {actions}
            </div>
          )}
        </div>
        {side}
      </div>
      {hint && (
        <Coach
          view={{
            key: `hint-${key}`,
            say: hint.hint.say,
            ...(hint.hint.note ? { note: hint.hint.note } : {}),
            anchor: hint.hint.anchor,
            focus: false,
            face: "think",
            actions: <button className="quiet-button" type="button" onClick={() => setHint(null)}>知道了</button>,
          }}
        />
      )}
      {tips.tip && <TipToast tip={tips.tip} onClose={tips.dismiss} onNever={tips.never} />}
      {game.phase === "roundEnd" && (
        <RoundEndDialog game={game} names={names} selfId={selfId} seconds={seconds} canContinue={!spectating && !game.ready.includes(selfId)} busy={busy} onContinue={() => onCommand({ type: "CONTINUE" })} phone={phone} />
      )}
      {game.phase === "finished" && (
        <FinalDialog game={game} room={room} selfId={selfId} memberId={memberId} spectating={spectating} phone={phone} onRematch={props.onRematch} onLeave={props.onLeave} actions={props.finalActions} />
      )}
    </div>
  );
}

export default GameBoard;
