import type { WeaponDef } from './schema';

const spit = {
  name: 'attack.spit',
  attack: 'projectile',
  rarity: 'white',
  type: 'staff',
  damage: 1,
  fireRate: 0.7,
  energyCost: 0,
  spread: 0,
  pellets: 1,
  bulletSpeed: 95,
  range: 300,
  bulletRadius: 3,
  pierce: 0,
  knockback: 0,
  critChance: 0,
  pattern: 'single',
  bulletSprite: 'ph_bullet_enemy',
} as const satisfies WeaponDef;
/** 怪物使用同一武器 schema 与弹道注册表，但不进入玩家掉落表。 */
export const ATTACKS = {
  spit_single: spit,
  spit_fan: { ...spit, name: 'attack.fan', pellets: 3, spread: 35, pattern: 'spread' },
  boss_fan: { ...spit, name: 'attack.boss_fan', fireRate: 1, pellets: 5, spread: 60, pattern: 'spread' },
  boss_ring: { ...spit, name: 'attack.boss_ring', fireRate: 0.8, pellets: 12, pattern: 'radial' },
  boss_storm: {
    ...spit,
    name: 'attack.boss_storm',
    fireRate: 1.2,
    pellets: 16,
    bulletSpeed: 115,
    pattern: 'radial',
  },
} as const satisfies Record<string, WeaponDef>;
export type AttackId = keyof typeof ATTACKS;
