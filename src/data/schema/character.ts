import { z } from 'zod';
import { I18nKeySchema, IdSchema, PositiveNumber, Seconds, TextureKeySchema } from './common';

/** 可玩角色（AI 娘）。单位见 docs/DATA_SCHEMA.md。 */
export const CharacterDefSchema = z.strictObject({
  name: I18nKeySchema,
  sprite: TextureKeySchema,
  /** 生命上限（整数）。 */
  hp: z.int().min(1),
  /** 最高移动速度，像素/秒。 */
  moveSpeed: PositiveNumber,
  /** 从静止加速到最高速度所需的秒数；0 表示瞬间到达。 */
  accelTime: Seconds,
  /** 松开方向后从最高速度减到 0 所需的秒数；0 表示立刻停下。 */
  decelTime: Seconds,
  /** 受伤后的无敌时长，秒。 */
  invulnTime: Seconds,
  /** 碰撞半径，像素（圆形判定，以脚底中心为圆心）。 */
  radius: PositiveNumber,
  /** 开局武器的 ID（必须存在于 WEAPONS）。 */
  startWeapon: IdSchema,
});

export type CharacterDef = z.infer<typeof CharacterDefSchema>;
