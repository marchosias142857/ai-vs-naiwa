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
  /** Issue #64 已确认的固定开火轮盘；不绘制瞄准提示线。 */
  aimWheel: {
    inset: 88,
    radius: 56,
    hitPadding: 12,
    knobRadius: 22,
    deadzone: 12,
    iconRadius: 6,
    firstShotDelayMs: 120,
  },
  resume: { radius: 40, fontSize: 16 },
  joystick: { homeInset: 100, radius: 52, knobRadius: 22, activeAlpha: 0.8, idleAlpha: 0.35 },
  moveArea: { widthFraction: 0.45, top: 48 },
  actions: { width: 56, height: 44, gap: 8, bottom: 6, fontSize: 12 },
  gamepad: { confirm: 0, skill: 1, swap: 3, pause: 9, up: 12, down: 13 },
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

/** 灰盒可读性参数，时长秒、尺寸游戏像素；正式反馈仍待画面方案。 */
export const COMBAT_FX = {
  impactRadius: 2,
  impactSeconds: 0.12,
  muzzleSeconds: 0.05,
  flashSeconds: 0.06,
  hurtSeconds: 0.25,
  deathSeconds: 0.2,
  deathAngle: 90,
  dimColor: COLORS.background,
  dimAlpha: 0.6,
  dimSeconds: 0.6,
  hitColor: 0xffffff,
  criticalColor: 0xffdd55,
  muzzleColor: 0xfff3a0,
  warningColor: 0xff4d6d,
  playerColor: 0xffffff,
  healthBack: COLORS.wall,
  healthHeight: 2,
  healthOffset: 3,
  lineWidth: 1,
  warningPadding: 4,
  hurtWidth: 4,
  invulnerableAlpha: 0.55,
  kinds: {
    naiwa_chaser: 0xffffff,
    naiwa_scout: 0x7ee8ff,
    naiwa_tank: 0xffcc77,
    naiwa_spitter: 0xe599ff,
    naiwa_turret: 0xff8888,
    naiwa_charger: 0xffdd55,
    naiwa_boss: 0xff7799,
  },
} as const;
/** ADR 0019 的临时灰盒数字，正式视觉待 Claude 方案。 */
export const RESUME_UI = { fontSize: 24 } as const;
