import type { ArtFrame, WeaponArt } from './schema/art';

/** 负责人动作参考的临时可调标注；像素坐标相对各帧左上角，不依赖动画帧率。 */
export const HERO_FRAMES = {
  idle_0: { rect: [69, 93, 269, 240], pivot: { x: 105, y: 135 }, grip: { x: 162, y: 159 }, seconds: 0.32 },
  idle_1: { rect: [371, 93, 268, 240], pivot: { x: 109, y: 135 }, grip: { x: 165, y: 157 }, seconds: 0.32 },
  run_0: { rect: [61, 373, 279, 238], pivot: { x: 113, y: 134 }, grip: { x: 171, y: 162 }, seconds: 0.1 },
  run_1: { rect: [371, 369, 273, 251], pivot: { x: 109, y: 138 }, grip: { x: 167, y: 172 }, seconds: 0.1 },
  run_2: { rect: [668, 369, 276, 252], pivot: { x: 112, y: 138 }, grip: { x: 167, y: 164 }, seconds: 0.1 },
  run_3: { rect: [968, 366, 271, 255], pivot: { x: 112, y: 141 }, grip: { x: 170, y: 173 }, seconds: 0.1 },
  hurt_0: { rect: [68, 664, 272, 240], pivot: { x: 106, y: 135 }, grip: { x: 162, y: 157 }, seconds: 0.06 },
  hurt_1: { rect: [373, 660, 267, 242], pivot: { x: 107, y: 139 }, grip: { x: 163, y: 167 }, seconds: 0.08 },
  death_0: { rect: [64, 943, 271, 246], pivot: { x: 110, y: 137 }, grip: { x: 166, y: 163 }, seconds: 0.08 },
  death_1: { rect: [364, 956, 266, 230], pivot: { x: 116, y: 124 }, grip: { x: 172, y: 159 }, seconds: 0.1 },
  death_2: { rect: [630, 994, 295, 204], pivot: { x: 152, y: 101 }, grip: { x: 178, y: 126 }, seconds: 0.12 },
  death_3: { rect: [925, 1022, 311, 181], pivot: { x: 155, y: 85 }, grip: { x: 185, y: 98 }, seconds: 0.24 },
} as const satisfies Record<string, ArtFrame>;

export const HERO_ART = {
  scale: 0.075,
  standardGrip: { x: 4.2, y: 1.8 },
  behindUpDegrees: 60,
  idle: ['idle_0', 'idle_1'],
  run: ['run_0', 'run_1', 'run_2', 'run_3'],
  hurt: ['hurt_0', 'hurt_1'],
  death: ['death_0', 'death_1', 'death_2', 'death_3'],
} as const;

export const WEAPON_ART = {
  pistol_basic: {
    rect: [37, 288, 228, 128],
    grip: { x: 48, y: 90 },
    muzzle: { x: 174, y: -49 },
    scale: 0.05,
  },
  rifle_auto: {
    rect: [316, 272, 282, 160],
    grip: { x: 77, y: 104 },
    muzzle: { x: 199, y: -47 },
    scale: 0.05,
  },
  shotgun_fan: {
    rect: [617, 304, 295, 118],
    grip: { x: 49, y: 80 },
    muzzle: { x: 238, y: -41 },
    scale: 0.055,
  },
  sniper_pierce: {
    rect: [931, 289, 312, 124],
    grip: { x: 63, y: 97 },
    muzzle: { x: 242, y: -42 },
    scale: 0.06,
  },
  twin_smg: { rect: [30, 542, 248, 188], grip: { x: 50, y: 132 }, muzzle: { x: 190, y: -53 }, scale: 0.05 },
  ring_staff: {
    rect: [297, 561, 318, 167],
    grip: { x: 46, y: 104 },
    muzzle: { x: 232, y: -23 },
    scale: 0.055,
  },
  burst_rifle: {
    rect: [626, 573, 305, 164],
    grip: { x: 48, y: 107 },
    muzzle: { x: 250, y: -39 },
    scale: 0.05,
  },
  heavy_cannon: {
    rect: [940, 562, 299, 151],
    grip: { x: 50, y: 118 },
    muzzle: { x: 243, y: -32 },
    scale: 0.055,
  },
  needle_rifle: {
    rect: [18, 899, 305, 109],
    grip: { x: 45, y: 68 },
    muzzle: { x: 252, y: -29 },
    scale: 0.05,
  },
  wide_staff: { rect: [323, 867, 321, 171], grip: { x: 40, y: 92 }, muzzle: { x: 266, y: -20 }, scale: 0.05 },
  cutlass: { rect: [654, 881, 284, 129], grip: { x: 47, y: 77 }, muzzle: { x: 229, y: -69 }, scale: 0.065 },
  anchor_hammer: {
    rect: [951, 851, 287, 162],
    grip: { x: 44, y: 99 },
    muzzle: { x: 236, y: -16 },
    scale: 0.065,
  },
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
