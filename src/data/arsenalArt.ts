// 由 art-src/arsenal/build_arsenal.py 生成，不要手改；改画法后重新运行脚本。
import type { WeaponArt } from './schema/art';

/** 新武器（ADR 0031）在 `demo_arsenal` 图集里的帧；握把、枪口与缩放的含义同 `WEAPON_ART`。 */
export const ARSENAL_WEAPON_ART = {
  octo_bazooka: {
    texture: 'demo_arsenal',
    rect: [306, 85, 100, 49],
    grip: { x: 25.5, y: 41.5 },
    muzzle: { x: 72, y: -13 },
    scale: 1 / 6,
  },
  eel_staff: {
    texture: 'demo_arsenal',
    rect: [146, 145, 103, 42],
    grip: { x: 22.5, y: 22.5 },
    muzzle: { x: 72, y: -2 },
    scale: 1 / 6,
  },
  fin_boomerang: {
    texture: 'demo_arsenal',
    rect: [1, 194, 59, 35],
    grip: { x: 13.5, y: 27.5 },
    muzzle: { x: 42, y: -22 },
    scale: 1 / 6,
  },
  puffer_wand: {
    texture: 'demo_arsenal',
    rect: [369, 145, 81, 38],
    grip: { x: 13.5, y: 19.5 },
    muzzle: { x: 70, y: 0 },
    scale: 1 / 6,
  },
  coral_bow: {
    texture: 'demo_arsenal',
    rect: [1, 1, 34, 82],
    grip: { x: 13.5, y: 41.5 },
    muzzle: { x: 20, y: 0 },
    scale: 1 / 6,
  },
  lantern_beam: {
    texture: 'demo_arsenal',
    rect: [96, 85, 106, 57],
    grip: { x: 27.5, y: 47.5 },
    muzzle: { x: 73, y: -14 },
    scale: 1 / 6,
  },
  slush_blaster: {
    texture: 'demo_arsenal',
    rect: [1, 85, 93, 58],
    grip: { x: 13.5, y: 49.5 },
    muzzle: { x: 76, y: -10 },
    scale: 1 / 6,
  },
  jelly_guard: {
    texture: 'demo_arsenal',
    rect: [204, 85, 100, 49],
    grip: { x: 18.5, y: 25.5 },
    muzzle: { x: 78, y: -8 },
    scale: 1 / 6,
  },
  swordfish_spear: {
    texture: 'demo_arsenal',
    rect: [62, 194, 114, 34],
    grip: { x: 22.5, y: 16.5 },
    muzzle: { x: 92, y: 0 },
    scale: 1 / 6,
  },
  shark_katana: {
    texture: 'demo_arsenal',
    rect: [178, 194, 126, 24],
    grip: { x: 20.5, y: 13.5 },
    muzzle: { x: 103, y: -10 },
    scale: 1 / 6,
  },
  bubble_gatling: {
    texture: 'demo_arsenal',
    rect: [245, 1, 98, 59],
    grip: { x: 17.5, y: 50.5 },
    muzzle: { x: 79, y: -15 },
    scale: 1 / 6,
  },
  urchin_mortar: {
    texture: 'demo_arsenal',
    rect: [50, 145, 94, 46],
    grip: { x: 13.5, y: 36.5 },
    muzzle: { x: 73, y: -15 },
    scale: 1 / 6,
  },
  bubble_bouncer: {
    texture: 'demo_arsenal',
    rect: [408, 85, 79, 47],
    grip: { x: 13.5, y: 36.5 },
    muzzle: { x: 64, y: -12 },
    scale: 1 / 6,
  },
} as const satisfies Record<string, WeaponArt>;

/** 弹体帧（朝右）：`rect` 为图集坐标，贴图以帧中心对齐弹体位置。 */
export const ARSENAL_SHOT_ART = {
  shot_rocket: [295, 145, 72, 39],
  shot_eel: [118, 1, 68, 68],
  shot_fin: [37, 1, 79, 69],
  shot_puffer: [345, 1, 65, 58],
  shot_arrow: [306, 194, 69, 21],
  shot_slush: [1, 145, 47, 47],
  shot_jelly: [188, 1, 55, 61],
  shot_bubble: [251, 145, 42, 42],
  shot_urchin: [412, 1, 58, 58],
  shot_spine: [377, 194, 40, 17],
  shot_water: [452, 145, 49, 36],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** 弹体贴图 1 个图集像素对应的游戏像素。 */
export const ARSENAL_SHOT_SCALE = 1 / 6;
