import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CardId } from "@piratebid/game";
import { cardStyle, specialIcon, type CardSize } from "./art.js";

/**
 * 规则说明：一个按钮 + 像素弹窗。用自己的话写，配游戏里的牌图。内容和 README 的规则说明一致。
 */
const SM: CardSize = { set: "sm", scale: 1 };

function Card({ card, label }: { card: CardId; label: string }) {
  return <span className="pb-card" style={cardStyle(card, SM)} role="img" aria-label={label} />;
}

export function RulesBody() {
  return (
    <div className="pb-rules-body">
      <section>
        <h3><img src={specialIcon("ghost")} alt="" width={24} height={24} /> 目标：正好叫中</h3>
        <p>一共 <b>10 轮</b>，第几轮每人发几张（8 人局第 9、10 轮只发 8 张）。发完牌大家<b>同时暗中叫墩</b>：猜自己这轮能赢几墩，0 也行，最后一个人叫完一起亮出。10 轮后累计分最高的赢，并列都算赢。</p>
      </section>
      <section>
        <h3>出牌</h3>
        <ul>
          <li>先出的人领出，之后每墩由上一墩的赢家领出。</li>
          <li>有领出的花色就要跟；没有才能出别的。<b>特殊牌随时能出</b>，不用跟。</li>
          <li>白旗领出时，下一张牌来定花色；角色牌（海盗、鬼船长、美人鱼）领出，这墩没有花色，随便出。</li>
          <li>双面海盗出的时候选「当海盗」或「当白旗」。</li>
        </ul>
      </section>
      <section>
        <h3>谁赢这一墩</h3>
        <div className="pb-rules-cards">
          <figure><Card card="captain" label="鬼船长" /><figcaption>鬼船长压海盗</figcaption></figure>
          <figure><Card card="pirate-2" label="海盗" /><figcaption>海盗压美人鱼</figcaption></figure>
          <figure><Card card="mermaid-2" label="美人鱼" /><figcaption>美人鱼抓鬼船长</figcaption></figure>
          <figure><Card card="flag-9" label="黑旗 9" /><figcaption>黑旗压普通花色</figcaption></figure>
          <figure><Card card="escape-1" label="白旗" /><figcaption>白旗输给一切</figcaption></figure>
        </div>
        <ul>
          <li>三种角色都在：美人鱼赢。同一种角色牌：先出的赢。</li>
          <li>没有角色牌：有黑旗比黑旗大小；没有黑旗比领出花色的大小，别的花色再大也不算。</li>
          <li>全是白旗：第一张白旗赢。</li>
        </ul>
      </section>
      <section>
        <h3>计分（每轮）</h3>
        <ul>
          <li>叫 1 墩以上：正好叫中 <b>+20 × 叫墩数</b>；没叫中，差几墩扣几个 10。</li>
          <li>叫 0：一墩没赢 <b>+10 × 本轮张数</b>；吃了墩就扣 10 × 本轮张数。</li>
          <li>叫中才有奖励（按自己赢的墩）：普通花色 14 每张 +10、黑旗 14 +20、海盗抓美人鱼 +20、鬼船长抓海盗每张 +30、美人鱼抓鬼船长 +40。</li>
        </ul>
      </section>
      <section>
        <h3>其他</h3>
        <ul>
          <li>2 人局多一个「幽灵水手」：不叫墩不计分，轮到它就翻最上面一张，不用跟花色。</li>
          <li>记牌辅助（开房可关）：桌上显示这一轮出过的特殊牌和黑旗。</li>
          <li>叫墩 30 秒、出牌 25 秒；超时由人机代打，连续 2 次转托管，点「取消托管」拿回来。掉线后用原昵称和房间码回到座位。</li>
        </ul>
      </section>
    </div>
  );
}

function GameRules({ className = "quiet-button" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button className={`${className} pb-rules-button`} type="button" aria-expanded={open} onClick={() => setOpen(true)} data-tutorial="rules-button">规则</button>
      {open && createPortal(
        // 挂到 body 上：手机上「规则」按钮在抽屉里，抽屉有 transform，fixed 的弹窗会被困在抽屉里
        <div className="app-shell pb-portal" style={{ display: "contents" }}>
        <div className="gm-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="gm-panel pb-rules" role="dialog" aria-modal="true" aria-labelledby="pb-rules-title">
            <div className="pb-rules-head">
              <h2 id="pb-rules-title">海盗叫墩 · 规则</h2>
              <button className="quiet-button" type="button" onClick={() => setOpen(false)}>关闭</button>
            </div>
            <RulesBody />
          </section>
        </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default GameRules;
