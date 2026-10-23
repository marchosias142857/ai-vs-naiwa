import { z } from 'zod';
import { I18nKeySchema, PositiveNumber, Probability, TextureKeySchema } from './common';

export const RaritySchema = z.enum(['white', 'green', 'blue', 'purple', 'orange', 'red']);
export const WeaponTypeSchema = z.enum([
  'pistol',
  'rifle',
  'shotgun',
  'sniper',
  'laser',
  'staff',
  'melee',
  'throwing',
]);
/** 弹道模式。M1 只实现 `single`，其余在 M3 加入注册表（docs/GDD.md「武器」）。 */
export const FirePatternIdSchema = z.enum([
  'single',
  'spread',
  'burst',
  'beam',
  'melee_arc',
  'orbit',
  'homing',
  'bounce',
  'charge',
]);

/** 武器。玩家与敌人的攻击都用这份结构。 */
export const WeaponDefSchema = z.strictObject({
  name: I18nKeySchema,
  rarity: RaritySchema,
  type: WeaponTypeSchema,
  /** 每颗弹丸的伤害。 */
  damage: PositiveNumber,
  /** 每秒开火次数。 */
  fireRate: PositiveNumber,
  /** 每次开火消耗的能量（M3 起生效）。 */
  energyCost: z.number().min(0),
  /** 散布总角度，度；每颗弹丸在 ±spread/2 内随机偏转。 */
  spread: z.number().min(0).max(360),
  /** 每次开火的弹丸数。 */
  pellets: z.int().min(1),
  /** 弹速，像素/秒。 */
  bulletSpeed: PositiveNumber,
  /** 射程，像素；子弹飞过这么远后消失，自动瞄准也只找这个范围内的目标。 */
  range: PositiveNumber,
  /** 子弹碰撞半径，像素。 */
  bulletRadius: PositiveNumber,
  /** 可额外穿透的目标数；0 表示命中第一个目标就消失。 */
  pierce: z.int().min(0),
  /** 命中时把目标推开的距离，像素。 */
  knockback: z.number().min(0),
  critChance: Probability,
  pattern: FirePatternIdSchema,
  bulletSprite: TextureKeySchema,
});

export type WeaponDef = z.infer<typeof WeaponDefSchema>;
export type FirePatternId = z.infer<typeof FirePatternIdSchema>;
