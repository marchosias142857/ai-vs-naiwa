import type { CharacterDef } from './schema';

/** 可玩角色；新增 ID 时须同步注册 characterArt.ts 中的图集与动作配置。 */
export const CHARACTERS = {
  ai_proto: {
    name: 'character.ai_proto',
    sprite: 'ph_player',
    hp: 6,
    moveSpeed: 90,
    accelTime: 0.06,
    decelTime: 0.08,
    invulnTime: 0.6,
    radius: 6,
    startWeapon: 'pistol_basic',
  },
} as const satisfies Record<string, CharacterDef>;

export type CharacterId = keyof typeof CHARACTERS;
