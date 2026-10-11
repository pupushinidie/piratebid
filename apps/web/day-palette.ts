import type { DayPalette } from "./day-theme";

/**
 * 白天版调色表（船长舱，阳光从舷窗照进来）：深木色底、面板 → 白底、奶油色面板；深棕描边保留；奶白字 → 深棕字。
 * 牌、出牌区里打出的牌、叫墩筹码、标签、横幅、特效在白天保持原色（keep）。
 * 背景图换白天那张、蒙版换成浅色这类机械换色不合适的，写在 src/theme-day.css。
 */
export const palette: DayPalette = {
  files: ["app-pixel.css", "pb-pages.css", "piratebid.css"],
  colors: {
    "#1a110b": "#ffffff", // 底色、输入框、顶栏
    "#1f150d": "#fbf6ec", // 底色的棋盘纹
    "#2c1d13": "#fbf3e4", // 面板、玩家卡、手牌栏
    "#3b2719": "#f1e3c8", // 面板 2、分隔线
    "#0e0805": "#2a1a10", // 像素描边（保持深棕）
    "#86613a": "#ffffff", // 面板亮边
    "#120b06": "#d9c4a0", // 面板暗边
    "#4a3020": "#ecdcbc", // 普通按钮、分隔线
    "#a67e4c": "#ffffff", // 按钮亮边
    "#1a0f08": "#b89a6a", // 按钮暗边
    "#2a1c10": "#fbf3df", // 管理员区
    "#3a2c10": "#fcefc6", // 金色字的底（选中项、状态牌）
    "#12452a": "#d8f0dc", // 绿色状态牌
    "#0b2614": "#7fbf8f",
    "#2b170d": "#fff6e0", // 出牌区的底
    "#141c30": "#dfe6f2", // 幽灵水手的座位
    "#2a160c": "#5a3a22", // 桌上的深褐描边
  },
  text: {
    "#fff4dc": "#2a1a10",
    "#cdb08a": "#7a5a3a",
    "#8a6c50": "#b09a80", // 输入框占位字
    "#ffcf6b": "#a5650a", // 本局牛头数字
    "#f0c050": "#94650a", // 提示、标题
    "#f25c5c": "#d1303f",
    "#ff9a8a": "#c0392b",
    "#b7f0c0": "#1f6b35",
    "#8ec0ff": "#1d4f9e",
    "#ffe08a": "#94650a", // 金色的字（叫墩数、分数、轮到你）
    "#5cc85a": "#1f8a45", // 叫中
    "#ff6a5a": "#d1303f", // 叫爆、扣分
    "#ff8a7a": "#c0392b", // 不能出的提示
    "#2a160c": "#2a160c", // 浅底上的深褐字保持
    "#6e4024": "#6e4024",
  },
  background: {},
  values: {
    // 不能点的按钮：夜间是压暗，白底上压暗成了泥色，改成褪成浅灰
    "grayscale(0.6) brightness(0.7)": "grayscale(0.85) brightness(1.15)",
  },
  textShadows: {
    // 大标题的投影：夜间是黑色，白底上换成浅金色
    "calc(var(--px) * 2) calc(var(--px) * 2) 0 var(--edge)": "calc(var(--px) * 2) calc(var(--px) * 2) 0 #f0d890",
  },
  textVarColors: {
    "--gold": "#94650a",
    "--gold-2": "#94650a",
    "--ok": "#1f8a45",
    "--bad": "#d1303f",
  },
  // 牌桌上的东西（毡面、牌、排头、空格）、座位色、飞牌层、首页大图上的字、规则里的小牌桌保持原色
  keep: [
    ".pb-tag", ".pb-card", ".pb-played", ".pb-chip", ".pb-trick-banner", ".pb-hint", ".pb-clock", ".pb-fx", ".pb-glow", ".pb-bonus",
    ".pb-hero-art", ".pb-mini-avatar", ".pb-avatar", ".pb-hand-card", ".pb-candles",
  ],
};
