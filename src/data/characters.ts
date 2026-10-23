import type { CharacterDef } from './schema';

/** 可玩角色。M1 只有一位原型 AI 娘，正式设定由负责人提供（docs/GDD.md「待定」）。 */
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
