import type { EnemyDef } from './schema';

/** 奶蛙风格的怪物。M1 只有一种追击怪，用来调移动与射击手感。 */
export const ENEMIES = {
  naiwa_chaser: {
    name: 'enemy.naiwa_chaser',
    sprite: 'ph_enemy',
    hp: 9,
    moveSpeed: 45,
    contactDamage: 1,
    radius: 6,
    behavior: 'chase',
  },
} as const satisfies Record<string, EnemyDef>;

export type EnemyId = keyof typeof ENEMIES;
