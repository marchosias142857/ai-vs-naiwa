// 由 art-src/arsenal/build_arsenal.py 生成，不要手改；改画法后重新运行脚本。
import type { WeaponArt } from './schema/art';

/** 新武器（ADR 0031）在 `demo_arsenal` 图集里的帧；握把、枪口与缩放的含义同 `WEAPON_ART`。 */
export const ARSENAL_WEAPON_ART = {
  octo_bazooka: {
    texture: 'demo_arsenal',
    rect: [422, 1, 66, 30],
    grip: { x: 31.5, y: 22.5 },
    muzzle: { x: 33, y: -8 },
    scale: 0.25,
  },
  eel_staff: {
    texture: 'demo_arsenal',
    rect: [39, 61, 64, 26],
    grip: { x: 20.5, y: 14.5 },
    muzzle: { x: 41, y: -1 },
    scale: 0.25,
  },
  fin_boomerang: {
    texture: 'demo_arsenal',
    rect: [329, 1, 35, 30],
    grip: { x: 8.5, y: 23.5 },
    muzzle: { x: 22, y: -11 },
    scale: 0.25,
  },
  puffer_wand: {
    texture: 'demo_arsenal',
    rect: [105, 61, 48, 26],
    grip: { x: 14.5, y: 13.5 },
    muzzle: { x: 32, y: 0 },
    scale: 0.25,
  },
  coral_bow: {
    texture: 'demo_arsenal',
    rect: [1, 1, 30, 58],
    grip: { x: 16.5, y: 29.5 },
    muzzle: { x: 12, y: 0 },
    scale: 0.25,
  },
  lantern_beam: {
    texture: 'demo_arsenal',
    rect: [101, 1, 62, 34],
    grip: { x: 22.5, y: 26.5 },
    muzzle: { x: 34, y: -7 },
    scale: 0.25,
  },
  slush_blaster: {
    texture: 'demo_arsenal',
    rect: [165, 1, 56, 32],
    grip: { x: 18.5, y: 26.5 },
    muzzle: { x: 37, y: -6 },
    scale: 0.25,
  },
  jelly_guard: {
    texture: 'demo_arsenal',
    rect: [366, 1, 54, 30],
    grip: { x: 14.5, y: 15.5 },
    muzzle: { x: 38, y: -3 },
    scale: 0.25,
  },
  swordfish_spear: {
    texture: 'demo_arsenal',
    rect: [201, 61, 88, 20],
    grip: { x: 24.5, y: 10.5 },
    muzzle: { x: 62, y: 0 },
    scale: 0.25,
  },
  shark_katana: {
    texture: 'demo_arsenal',
    rect: [291, 61, 80, 18],
    grip: { x: 12.5, y: 9.5 },
    muzzle: { x: 66, y: 0 },
    scale: 0.25,
  },
  bubble_gatling: {
    texture: 'demo_arsenal',
    rect: [33, 1, 66, 34],
    grip: { x: 20.5, y: 27.5 },
    muzzle: { x: 42, y: -7 },
    scale: 0.25,
  },
  urchin_mortar: {
    texture: 'demo_arsenal',
    rect: [223, 1, 56, 32],
    grip: { x: 18.5, y: 25.5 },
    muzzle: { x: 35, y: -8 },
    scale: 0.25,
  },
  bubble_bouncer: {
    texture: 'demo_arsenal',
    rect: [281, 1, 46, 30],
    grip: { x: 14.5, y: 21.5 },
    muzzle: { x: 30, y: -8 },
    scale: 0.25,
  },
} as const satisfies Record<string, WeaponArt>;

/** 弹体帧（朝右）：`rect` 为图集坐标，贴图以帧中心对齐弹体位置。 */
export const ARSENAL_SHOT_ART = {
  shot_rocket: [429, 61, 28, 14],
  shot_eel: [373, 61, 18, 18],
  shot_fin: [1, 61, 36, 30],
  shot_puffer: [393, 61, 18, 16],
  shot_arrow: [1, 93, 30, 9],
  shot_slush: [459, 61, 14, 14],
  shot_jelly: [155, 61, 22, 24],
  shot_bubble: [413, 61, 14, 14],
  shot_urchin: [179, 61, 20, 20],
  shot_spine: [33, 93, 16, 7],
  shot_water: [475, 61, 16, 12],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** 弹体贴图 1 个图集像素对应的游戏像素；比武器图大一档，飞行中看得清。 */
export const ARSENAL_SHOT_SCALE = 0.4;
