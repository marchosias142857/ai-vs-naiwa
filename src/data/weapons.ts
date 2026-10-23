import type { WeaponDef } from './schema';

/** 武器。手感参照「元气骑士」的初始手枪（负责人确认的 M1 参照对象）。 */
export const WEAPONS = {
  pistol_basic: {
    name: 'weapon.pistol_basic',
    rarity: 'white',
    type: 'pistol',
    damage: 3,
    fireRate: 4,
    energyCost: 0,
    spread: 4,
    pellets: 1,
    bulletSpeed: 260,
    range: 220,
    bulletRadius: 3,
    pierce: 0,
    knockback: 4,
    critChance: 0.05,
    pattern: 'single',
    bulletSprite: 'ph_bullet_player',
  },
} as const satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPONS;
