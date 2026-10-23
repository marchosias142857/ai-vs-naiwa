import { COLORS } from '../../config';

/** 输入控件的 CSS 像素尺寸；绘制与命中判定必须共用。 */
export const INPUT_UI = {
  look: {
    idleFillAlpha: 0.3,
    pressedFillAlpha: 0.35,
    pressedColor: Number.parseInt(COLORS.accent.slice(1), 16),
    pauseColor: COLORS.background,
    pauseAlpha: 0.6,
  },
  pause: { inset: 28, radius: 18, hitRadius: 22, fontSize: 18 },
  fire: { inset: 88, radius: 40, pressedScale: 0.94, transitionMs: 60 },
  resume: { radius: 40, fontSize: 16 },
  joystick: { homeInset: 100, radius: 52, knobRadius: 22, activeAlpha: 0.8, idleAlpha: 0.35 },
  moveArea: { widthFraction: 0.45, top: 48 },
  deadzone: 0.12,
  outline: 2,
  crosshair: { radius: 3, outline: 3, stroke: 1 },
} as const;

/** 玩家死亡与重来提示（docs/visual/m1-feel.md 第 6 节「玩家死亡」）。时长为毫秒，字号为游戏像素。 */
export const DEATH_UI = {
  /** 死亡后画面在 dimMs 内压暗到 dimAlpha。 */
  dimColor: COLORS.background,
  dimAlpha: 0.6,
  dimMs: 600,
  titleSize: 20,
  hintSize: 10,
  /** 标题与提示相对画面中心的纵向偏移。 */
  titleOffsetY: -12,
  hintOffsetY: 14,
} as const;
