import { ARSENAL_WEAPON_ART } from './arsenalArt';
import type { ArtFrame, WeaponArt } from './schema/art';

/** 负责人动作参考的临时可调标注；像素坐标相对各帧左上角，不依赖动画帧率。 */
export const HERO_FRAMES = {
  idle_0: { rect: [184, 12, 271, 244], pivot: { x: 108, y: 171 }, grip: { x: 46, y: 197 }, seconds: 0.18 },
  idle_1: { rect: [474, 12, 272, 244], pivot: { x: 108, y: 171 }, grip: { x: 46, y: 197 }, seconds: 0.16 },
  idle_2: { rect: [778, 12, 278, 245], pivot: { x: 108, y: 171 }, grip: { x: 46, y: 197 }, seconds: 0.18 },
  idle_3: { rect: [1082, 12, 278, 245], pivot: { x: 108, y: 171 }, grip: { x: 46, y: 197 }, seconds: 0.18 },
  idle_4: { rect: [184, 263, 275, 244], pivot: { x: 108, y: 171 }, grip: { x: 46, y: 197 }, seconds: 0.16 },
  idle_5: { rect: [474, 263, 281, 244], pivot: { x: 108, y: 171 }, grip: { x: 46, y: 197 }, seconds: 0.18 },
  run_0: { rect: [184, 513, 276, 248], pivot: { x: 108, y: 171 }, grip: { x: 46, y: 197 }, seconds: 0.075 },
  run_1: { rect: [478, 513, 277, 249], pivot: { x: 108, y: 171 }, grip: { x: 46, y: 197 }, seconds: 0.075 },
  run_2: { rect: [778, 513, 274, 249], pivot: { x: 108, y: 171 }, grip: { x: 46, y: 197 }, seconds: 0.075 },
  run_3: { rect: [1071, 513, 276, 249], pivot: { x: 109, y: 171 }, grip: { x: 47, y: 197 }, seconds: 0.075 },
  run_4: { rect: [183, 768, 277, 247], pivot: { x: 108, y: 172 }, grip: { x: 46, y: 198 }, seconds: 0.075 },
  run_5: { rect: [476, 769, 272, 246], pivot: { x: 108, y: 171 }, grip: { x: 46, y: 197 }, seconds: 0.075 },
  run_6: { rect: [772, 769, 284, 246], pivot: { x: 108, y: 171 }, grip: { x: 46, y: 197 }, seconds: 0.075 },
  run_7: { rect: [1074, 769, 280, 247], pivot: { x: 108, y: 171 }, grip: { x: 46, y: 197 }, seconds: 0.075 },
  // 每格 512×512；按原参考头部比例缩放，并让各姿态落在同一地面。
  hurt_0: { rect: [0, 0, 512, 512], pivot: { x: 270, y: 369 }, grip: { x: 180, y: 408 }, seconds: 0.06 },
  hurt_1: { rect: [512, 0, 512, 512], pivot: { x: 223, y: 372 }, grip: { x: 133, y: 411 }, seconds: 0.08 },
  death_0: { rect: [1024, 0, 512, 512], pivot: { x: 205, y: 381 }, grip: { x: 115, y: 420 }, seconds: 0.08 },
  death_1: { rect: [0, 512, 512, 512], pivot: { x: 248, y: 336 }, grip: { x: 158, y: 375 }, seconds: 0.1 },
  death_2: { rect: [512, 512, 512, 512], pivot: { x: 230, y: 326 }, grip: { x: 140, y: 365 }, seconds: 0.12 },
  death_3: {
    rect: [1024, 512, 512, 512],
    pivot: { x: 219, y: 332 },
    grip: { x: 129, y: 371 },
    seconds: 0.24,
  },
} as const satisfies Record<string, ArtFrame>;

export const HERO_ART = {
  nativeFacing: 'left',
  texture: 'demo_hero',
  source: 'da-fei-yu-pixel-v2.png',
  reactionTexture: 'demo_hero_reactions',
  reactionSource: 'da-fei-yu-pixel-reactions-v1.png',
  face: { frame: 'stable_face', rect: [244, 133, 99, 55], pivot: { x: 48, y: 50 } },
  frames: HERO_FRAMES,
  scale: 0.068,
  reactionScale: 0.0465,
  standardGrip: { x: 4.2, y: 1.8 },
  behindUpDegrees: 60,
  idle: ['idle_0', 'idle_1', 'idle_2', 'idle_3', 'idle_4', 'idle_5'],
  run: ['run_0', 'run_1', 'run_2', 'run_3', 'run_4', 'run_5', 'run_6', 'run_7'],
  hurt: ['hurt_0', 'hurt_1'],
  death: ['death_0', 'death_1', 'death_2', 'death_3'],
} as const;

export const WEAPON_ART = {
  pistol_basic: {
    rect: [37, 284, 234, 132],
    grip: { x: 54.5, y: 96.5 },
    muzzle: { x: 167.5, y: -51.5 },
    scale: 0.05,
  },
  rifle_auto: {
    rect: [313, 268, 290, 169],
    grip: { x: 86.5, y: 112 },
    muzzle: { x: 192.5, y: -51 },
    scale: 0.05,
  },
  shotgun_fan: {
    rect: [617, 301, 300, 121],
    grip: { x: 57, y: 84.5 },
    muzzle: { x: 230, y: -42.5 },
    scale: 0.055,
  },
  sniper_pierce: {
    rect: [929, 286, 317, 129],
    grip: { x: 69.5, y: 102 },
    muzzle: { x: 237.5, y: -44 },
    scale: 0.06,
  },
  twin_smg: { rect: [30, 540, 254, 195], grip: { x: 57, y: 134 }, muzzle: { x: 183, y: -53 }, scale: 0.05 },
  ring_staff: {
    rect: [297, 559, 324, 173],
    grip: { x: 52, y: 110 },
    muzzle: { x: 226, y: -27 },
    scale: 0.055,
  },
  burst_rifle: {
    rect: [626, 570, 308, 173],
    grip: { x: 56, y: 111.5 },
    muzzle: { x: 242, y: -40.5 },
    scale: 0.05,
  },
  heavy_cannon: {
    rect: [940, 560, 302, 159],
    grip: { x: 56.5, y: 121.5 },
    muzzle: { x: 236.5, y: -33.5 },
    scale: 0.055,
  },
  needle_rifle: {
    rect: [18, 897, 307, 115],
    grip: { x: 51.5, y: 69.5 },
    muzzle: { x: 245.5, y: -28.5 },
    scale: 0.05,
  },
  wide_staff: {
    rect: [323, 864, 326, 180],
    grip: { x: 45, y: 97.5 },
    muzzle: { x: 261, y: -22.5 },
    scale: 0.05,
  },
  cutlass: { rect: [654, 878, 291, 138], grip: { x: 54, y: 80 }, muzzle: { x: 222, y: -69 }, scale: 0.065 },
  anchor_hammer: {
    rect: [951, 849, 290, 169],
    grip: { x: 47, y: 103.5 },
    muzzle: { x: 233, y: -18.5 },
    scale: 0.065,
  },
  // 新武器图集（ADR 0031）。
  ...ARSENAL_WEAPON_ART,
} as const satisfies Record<string, WeaponArt>;

export const ENEMY_ART = {
  naiwa_chaser: [39, 77, 341, 284],
  naiwa_scout: [505, 113, 284, 252],
  naiwa_tank: [897, 46, 398, 324],
  naiwa_spitter: [1399, 107, 328, 261],
  naiwa_turret: [22, 443, 402, 385],
  naiwa_charger: [440, 493, 385, 335],
  naiwa_boss: [853, 374, 540, 485],
} as const;

export const ENVIRONMENT_ART = {
  floor: [87, 77, 338, 338],
  floor_alt: [505, 76, 340, 340],
  wall: [932, 79, 387, 338],
  pillar: [1415, 69, 262, 355],
  chest: [78, 501, 358, 321],
  chest_open: [511, 459, 360, 373],
  crystal: [959, 463, 354, 372],
  lantern: [1441, 460, 224, 373],
} as const;

export const DOOR_ART = {
  open: [96, 172, 712, 532],
  locked: [966, 172, 713, 532],
} as const;
