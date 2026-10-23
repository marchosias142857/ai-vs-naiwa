import { z } from 'zod';
import { I18nKeySchema, PositiveNumber, TextureKeySchema } from './common';

/** 怪物行为。M1 只实现 `chase`，其余在 M3 加入注册表（docs/GDD.md「奶蛙怪物」）。 */
export const EnemyBehaviorSchema = z.enum([
  'chase',
  'wander',
  'keep_distance',
  'charge_dash',
  'turret',
  'summoner',
  'suicide',
]);

export const EnemyDefSchema = z.strictObject({
  name: I18nKeySchema,
  sprite: TextureKeySchema,
  /** 生命上限。 */
  hp: PositiveNumber,
  /** 移动速度，像素/秒。 */
  moveSpeed: z.number().min(0),
  /** 接触玩家时造成的伤害（整数）；0 表示不造成接触伤害。 */
  contactDamage: z.int().min(0),
  /** 碰撞半径，像素。 */
  radius: PositiveNumber,
  behavior: EnemyBehaviorSchema,
});

export type EnemyDef = z.infer<typeof EnemyDefSchema>;
export type EnemyBehavior = z.infer<typeof EnemyBehaviorSchema>;
