import type { EnemyDef } from './schema';

/** 奶蛙风格的怪物。M1 只有一种追击怪，用来调移动与射击手感。 */
const chaser = {
  name: 'enemy.naiwa_chaser',
  sprite: 'ph_enemy',
  hp: 9,
  moveSpeed: 45,
  contactDamage: 1,
  radius: 6,
  behavior: 'chase',
} as const satisfies EnemyDef;
export const ENEMIES = {
  naiwa_chaser: chaser,
  naiwa_scout: { ...chaser, name: 'enemy.naiwa_scout', hp: 5, moveSpeed: 68, radius: 4 },
  naiwa_tank: { ...chaser, name: 'enemy.naiwa_tank', hp: 24, moveSpeed: 25, radius: 9 },
  naiwa_spitter: {
    ...chaser,
    name: 'enemy.naiwa_spitter',
    hp: 9,
    moveSpeed: 30,
    behavior: 'keep_distance',
    desiredRange: 110,
    attack: 'spit_single',
  },
  naiwa_turret: {
    ...chaser,
    name: 'enemy.naiwa_turret',
    hp: 15,
    moveSpeed: 0,
    behavior: 'turret',
    attack: 'spit_fan',
  },
  naiwa_charger: {
    ...chaser,
    name: 'enemy.naiwa_charger',
    hp: 14,
    moveSpeed: 32,
    behavior: 'charge_dash',
    dash: { windup: 0.65, duration: 0.35, recovery: 1.1, speed: 180 },
  },
  naiwa_boss: {
    ...chaser,
    name: 'enemy.naiwa_boss',
    hp: 220,
    moveSpeed: 25,
    radius: 12,
    behavior: 'keep_distance',
    desiredRange: 100,
    attack: 'boss_fan',
    phases: [
      { belowHp: 0.7, attack: 'boss_ring', speedScale: 1.2 },
      { belowHp: 0.4, attack: 'boss_storm', speedScale: 1.5 },
    ],
  },
} as const satisfies Record<string, EnemyDef>;

export type EnemyId = keyof typeof ENEMIES;
