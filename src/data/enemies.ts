import type { EnemyDef } from './schema';

/**
 * 奶蛙风格的怪物（ADR 0009、ADR 0030）。数值为 demo 初值，负责人试玩后调整。
 * 行为参考：弹簧蛙（泰拉瑞亚史莱姆的跳跃）、叠罗汉蛙（挺进地牢果冻怪的分裂）、炸弹蛙（元气骑士自爆怪）、
 * 舌头蛙（舌击拉人）、蛙卵团（召唤师）、地洞蛙（泰拉瑞亚蚁狮）、街舞蛙（绕圈 + 螺旋弹）、放屁蛙（毒气区域）。
 */
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
  /** 大头蛙：追人，贴近后缩身蓄力，再往前扑咬。 */
  naiwa_chaser: {
    ...chaser,
    behavior: 'charge_dash',
    dash: { windup: 0.45, duration: 0.18, recovery: 0.6, speed: 170, trigger: 34 },
  },
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
  naiwa_hopper: {
    ...chaser,
    name: 'enemy.naiwa_hopper',
    hp: 11,
    moveSpeed: 0,
    behavior: 'hop',
    hop: { windup: 0.45, air: 0.55, recover: 0.55, range: 90, height: 12, landAttack: 'hop_ring' },
  },
  naiwa_splitter: {
    ...chaser,
    name: 'enemy.naiwa_splitter',
    hp: 18,
    moveSpeed: 24,
    radius: 8,
    split: { kind: 'naiwa_tadpole', count: 3, telegraph: 0.2 },
  },
  naiwa_tadpole: {
    ...chaser,
    name: 'enemy.naiwa_tadpole',
    hp: 3,
    moveSpeed: 72,
    radius: 3,
    loot: 0,
  },
  naiwa_bomber: {
    ...chaser,
    name: 'enemy.naiwa_bomber',
    hp: 8,
    moveSpeed: 54,
    contactDamage: 0,
    behavior: 'suicide',
    fuse: { trigger: 26, time: 0.9, radius: 30, damage: 2, attack: 'bomb_ring' },
  },
  naiwa_tongue: {
    ...chaser,
    name: 'enemy.naiwa_tongue',
    hp: 12,
    moveSpeed: 34,
    behavior: 'lash',
    desiredRange: 58,
    lash: {
      windup: 0.55,
      active: 0.16,
      recover: 0.6,
      length: 84,
      width: 5,
      damage: 1,
      pull: 18,
      cooldown: 2.2,
    },
  },
  naiwa_brood: {
    ...chaser,
    name: 'enemy.naiwa_brood',
    hp: 26,
    moveSpeed: 20,
    radius: 8,
    behavior: 'summoner',
    desiredRange: 120,
    summon: { kind: 'naiwa_tadpole', count: 2, max: 4, windup: 0.7, interval: 4.5, telegraph: 0.3 },
  },
  naiwa_burrower: {
    ...chaser,
    name: 'enemy.naiwa_burrower',
    hp: 14,
    moveSpeed: 58,
    behavior: 'burrow',
    burrow: { under: 1.6, emerge: 0.5, up: 1.4, offset: 30, attack: 'burrow_ring' },
  },
  naiwa_dancer: {
    ...chaser,
    name: 'enemy.naiwa_dancer',
    hp: 12,
    moveSpeed: 42,
    radius: 5,
    behavior: 'strafe',
    strafe: { range: 85, flip: 1.6, every: 3.2 },
    spin: { time: 0.9, interval: 0.1, step: 25, attack: 'spin_pair' },
  },
  naiwa_gasser: {
    ...chaser,
    name: 'enemy.naiwa_gasser',
    hp: 12,
    moveSpeed: 38,
    gas: { every: 1.4, radius: 14, duration: 3.5, damage: 1, tick: 0.8 },
  },
  /**
   * 最终 Boss 奶怪（负责人绘制）。挺肚冲撞撞上石柱或石块会晕；跳起砸地落石、留奶潭；捧腹狂笑放旋转环弹。
   * 三阶段：66% 起加入召唤，33% 起连续冲撞并下石块雨。
   */
  naiwa_boss: {
    ...chaser,
    name: 'enemy.naiwa_boss',
    hp: 320,
    moveSpeed: 30,
    radius: 14,
    behavior: 'keep_distance',
    desiredRange: 90,
    attack: 'boss_fan',
    hop: {
      windup: 0.55,
      air: 0.8,
      recover: 0.6,
      range: 140,
      height: 34,
      landAttack: 'boss_slam',
      rocks: 2,
      puddle: { radius: 24, duration: 6 },
    },
    bump: { windup: 0.8, speed: 250, time: 1.3, stun: 2.2, bonus: 1.5, recover: 0.6 },
    spin: { time: 1.8, interval: 0.3, step: 11, attack: 'boss_ring' },
    summon: { kind: 'naiwa_tadpole', count: 3, max: 6, windup: 0.8, interval: 1, telegraph: 0.3 },
    rain: { count: 7, spread: 90 },
    rock: { radius: 9, fall: 0.9, life: 7, damage: 1 },
    specials: ['bump', 'hop', 'bump', 'spin'],
    specialEvery: 2.6,
    phases: [
      {
        belowHp: 0.66,
        attack: 'boss_ring',
        speedScale: 1.15,
        specials: ['bump', 'hop', 'summon', 'spin'],
        rocks: 4,
      },
      {
        belowHp: 0.33,
        attack: 'boss_storm',
        speedScale: 1.35,
        specials: ['bump', 'bump', 'rain', 'hop', 'spin', 'summon'],
        rocks: 6,
      },
    ],
  },
} as const satisfies Record<string, EnemyDef>;

export type EnemyId = keyof typeof ENEMIES;
