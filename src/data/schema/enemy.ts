import { z } from 'zod';
import { I18nKeySchema, IdSchema, PositiveNumber, Probability, TextureKeySchema } from './common';

/**
 * 怪物行为（ADR 0009、ADR 0028）。移动方式与主要动作由行为决定，招式参数放在同名可选字段里。
 * `wander` 仍未实现，保留在枚举中只为兼容旧数据校验。
 */
export const EnemyBehaviorSchema = z.enum([
  'chase',
  'wander',
  'keep_distance',
  'charge_dash',
  'turret',
  'summoner',
  'suicide',
  'hop',
  'lash',
  'burrow',
  'strafe',
]);
/** 定时穿插在常规攻击之间的特殊招式（Boss 等多招怪物用）。 */
export const EnemySpecialSchema = z.enum(['hop', 'lash', 'summon', 'bump', 'spin', 'rain']);

const Seconds = PositiveNumber;

export const EnemyDefSchema = z.strictObject({
  name: I18nKeySchema,
  sprite: TextureKeySchema,
  /** 生命上限。 */
  hp: PositiveNumber,
  /** 移动速度，像素/秒。 */
  moveSpeed: z.number().min(0),
  /** 接触玩家时造成的伤害（整数）；0 表示不造成接触伤害。 */
  contactDamage: z.int().min(0),
  /** 碰撞半径，像素。 */
  radius: PositiveNumber,
  behavior: EnemyBehaviorSchema,
  attack: IdSchema.optional(),
  desiredRange: PositiveNumber.optional(),
  /** 掉落倍率：乘在怪物掉落的「有掉落」概率上；分裂出的小怪设 0。默认 1。 */
  loot: Probability.optional(),
  /** 冲锋：锁定方向后高速移动。有 trigger 时先追击，距离进入 trigger 才开始蓄力（奶怪的挺肚冲撞）。 */
  dash: z
    .strictObject({
      windup: PositiveNumber,
      duration: PositiveNumber,
      recovery: PositiveNumber,
      speed: PositiveNumber,
      trigger: PositiveNumber.optional(),
    })
    .optional(),
  /** 跳跃：蓄力 → 腾空（无接触伤害、可被打）→ 落地；落地可放一圈子弹。 */
  hop: z
    .strictObject({
      windup: Seconds,
      air: Seconds,
      recover: Seconds,
      /** 单次最远跳跃距离，像素。 */
      range: PositiveNumber,
      /** 腾空最高点的表现高度，像素（只用于画面）。 */
      height: PositiveNumber,
      landAttack: IdSchema.optional(),
      /** 落地时从天上砸下的石块数（参数见 rock）。 */
      rocks: z.int().min(0).optional(),
      /** 落地处留下的减速奶潭。 */
      puddle: z.strictObject({ radius: PositiveNumber, duration: Seconds }).optional(),
    })
    .optional(),
  /** 挺肚冲撞：蓄力后直线猛冲；撞上石柱或石块会眩晕 stun 秒，期间受到的伤害乘 bonus。撞房间边墙只停下。 */
  bump: z
    .strictObject({
      windup: Seconds,
      speed: PositiveNumber,
      time: Seconds,
      stun: Seconds,
      bonus: z.number().min(1),
      recover: Seconds,
    })
    .optional(),
  /** 原地旋转放弹：time 秒内每 interval 秒朝当前角度开一次火，之后角度转 step 度。 */
  spin: z
    .strictObject({ time: Seconds, interval: Seconds, step: z.number().finite(), attack: IdSchema })
    .optional(),
  /** 石块雨：在玩家周围陆续砸下 count 块石头，落点预警时长在 fall 到 fall × 1.6 之间错开。 */
  rain: z.strictObject({ count: z.int().positive(), spread: PositiveNumber }).optional(),
  /** 天降石块：fall 秒预警后砸下，伤害落点内的玩家，之后作为障碍留 life 秒，被冲撞撞碎。 */
  rock: z
    .strictObject({ radius: PositiveNumber, fall: Seconds, life: Seconds, damage: z.int().positive() })
    .optional(),
  /** 舌击：蓄力时锁定方向，出舌瞬间判定一条线段，命中把玩家拉向自己。 */
  lash: z
    .strictObject({
      windup: Seconds,
      active: Seconds,
      recover: Seconds,
      length: PositiveNumber,
      width: PositiveNumber,
      damage: z.int().positive(),
      /** 命中时把玩家拉近的距离，像素。 */
      pull: z.number().min(0),
      cooldown: Seconds,
    })
    .optional(),
  /** 召唤：蓄力后在身边生成小怪，同时存在的子嗣数有上限。 */
  summon: z
    .strictObject({
      kind: IdSchema,
      count: z.int().positive(),
      max: z.int().positive(),
      windup: Seconds,
      interval: Seconds,
      telegraph: Seconds,
    })
    .optional(),
  /** 自爆：靠近到 trigger 后停下鼓胀，fuse 秒后爆炸并死亡。 */
  fuse: z
    .strictObject({
      trigger: PositiveNumber,
      time: Seconds,
      radius: PositiveNumber,
      damage: z.int().positive(),
      attack: IdSchema.optional(),
    })
    .optional(),
  /** 潜地：地下移动（不可被命中、无接触）→ 冒头预警 → 出土放子弹 → 停留后再钻回去。 */
  burrow: z
    .strictObject({
      under: Seconds,
      emerge: Seconds,
      up: Seconds,
      /** 出土点距玩家的距离，像素。 */
      offset: PositiveNumber,
      attack: IdSchema,
    })
    .optional(),
  /** 绕圈：保持距离横移，随机换向；每 every 秒原地旋转一次（参数见 spin）。 */
  strafe: z.strictObject({ range: PositiveNumber, flip: Seconds, every: Seconds }).optional(),
  /** 死亡时分裂成若干小怪。 */
  split: z.strictObject({ kind: IdSchema, count: z.int().positive(), telegraph: Seconds }).optional(),
  /** 定时在身后留下毒气云。 */
  gas: z
    .strictObject({
      every: Seconds,
      radius: PositiveNumber,
      duration: Seconds,
      damage: z.int().positive(),
      tick: Seconds,
    })
    .optional(),
  /** 特殊招式轮换：每隔 specialEvery 秒按顺序放一个；阶段可以覆盖。 */
  specials: z.array(EnemySpecialSchema).readonly().optional(),
  specialEvery: Seconds.optional(),
  phases: z
    .array(
      z.strictObject({
        belowHp: z.number().min(0).max(1),
        attack: IdSchema,
        speedScale: PositiveNumber,
        specials: z.array(EnemySpecialSchema).readonly().optional(),
        /** 覆盖 hop.rocks。 */
        rocks: z.int().min(0).optional(),
      }),
    )
    .readonly()
    .optional(),
});

export type EnemyDef = z.infer<typeof EnemyDefSchema>;
export type EnemyBehavior = z.infer<typeof EnemyBehaviorSchema>;
export type EnemySpecial = z.infer<typeof EnemySpecialSchema>;
