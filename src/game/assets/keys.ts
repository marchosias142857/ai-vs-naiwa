/**
 * 纹理 / 资源 key。M5 起由 scripts/gen-asset-keys.ts 根据图集自动生成本文件；
 * 在那之前手动维护，全部是占位图（src/game/assets/placeholders.ts 生成）。
 * 代码里一律引用这些常量，不直接写字符串。
 */
export const TEX = {
  pixel: 'ph_pixel',
  floor: 'ph_floor',
  floorAlt: 'ph_floor_alt',
  wall: 'ph_wall',
  player: 'ph_player',
  enemy: 'ph_enemy',
  bulletPlayer: 'ph_bullet_player',
  bulletEnemy: 'ph_bullet_enemy',
} as const;

export type TextureKey = (typeof TEX)[keyof typeof TEX];
