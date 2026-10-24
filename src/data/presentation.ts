import type { Presentation } from './schema/art';
/** 视觉初值，均不参与伤害、物理或随机状态。 */
export const PRESENTATION = {
  shadowColor: 0x07111e,
  shadowAlpha: 0.3,
  shadowWidth: 1.8,
  shadowHeight: 0.55,
  enemySize: 2.5,
  bobPixels: 0.45,
  bobSpeed: 12,
  invulnerableAlpha: 0.65,
  deathSeconds: 0.2,
  deathAngle: 80,
  hurtSeconds: 0.14,
  weaponDepth: 0.00001,
  arcWidth: 2,
  arcColor: 0x9ff6ed,
  arcAlpha: 0.6,
} as const satisfies Presentation;
