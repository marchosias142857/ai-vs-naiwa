/** 新武器表现的视觉参数（ADR 0031）；时长秒、尺寸游戏像素，只影响画面。 */
export const WEAPON_FX = {
  /** 光束：外层光晕、内芯颜色，宽度随时间轻微抖动。 */
  beamGlow: 0xffd34d,
  beamGlowAlpha: 0.35,
  beamCore: 0xfff7d6,
  beamFlicker: 26,
  beamFlickerWidth: 0.25,
  /** 光束末端与枪口的光点半径 = 光束宽度 × 这个倍数。 */
  beamSpot: 0.9,
  /** 连锁闪电：每段折线的节数、横向抖动、持续时间。 */
  chainPool: 16,
  chainSegments: 6,
  chainJitter: 4,
  chainSeconds: 0.18,
  chainGlow: 0x7fdcff,
  chainCore: 0xffffff,
  /** 蓄力圈：半径、线宽；蓄满后闪烁。 */
  chargeRadius: 11,
  chargeWidth: 1.5,
  chargeColor: 0xff8fb0,
  chargeFull: 0xfff36b,
  chargeBlink: 12,
  /** 环绕弹寿命最后这么多秒淡出。 */
  shotFade: 0.3,
  /** 冰冻：减速到 `chillFull` 时染成 `chillTint`，冻住时整只染成 `frozenTint`。 */
  chillTint: 0x9fd8ff,
  chillFull: 0.6,
  frozenTint: 0xc8f0ff,
} as const;
