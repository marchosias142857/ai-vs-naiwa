import { z } from 'zod';
import { I18nKeySchema, PositiveNumber, Probability, TextureKeySchema } from './common';

export const RaritySchema = z.enum(['white', 'green', 'blue', 'purple', 'orange', 'red']);
export const WeaponTypeSchema = z.enum([
  'pistol',
  'rifle',
  'shotgun',
  'sniper',
  'laser',
  'staff',
  'melee',
  'throwing',
]);
/** 弹道模式。M1 只实现 `single`，其余在 M3 加入注册表（docs/GDD.md「武器」）。 */
export const FirePatternIdSchema = z.enum([
  'single',
  'spread',
  'burst',
  'beam',
  'melee_arc',
  'orbit',
  'homing',
  'bounce',
  'charge',
  'radial',
  'twin',
]);

/** 特殊弹体的运动方式（ADR 0031）。 */
export const ShotMotionSchema = z.enum(['straight', 'homing', 'boomerang', 'orbit', 'bounce']);

/**
 * 特殊弹体（ADR 0031）：由 sim 移动并结算碰撞，不进 Arcade 子弹池。
 * 弹速、半径、伤害、穿透、击退与暴击仍用武器的同名字段；寿命用这里的 `life`，`range` 只作提示。
 */
export const ShotDefSchema = z.strictObject({
  motion: ShotMotionSchema,
  /** 弹体帧名（新武器图集 `demo_arsenal`）。 */
  sprite: z.string().min(1),
  /** 寿命，秒。 */
  life: PositiveNumber,
  /** 贴图自转速度，弧度/秒；不填时贴图朝向飞行方向。 */
  spin: z.number().optional(),
  /** 同一发射者、同一武器同时存在的上限；到上限时开火不生成，也不扣能量。 */
  max: z.int().positive().optional(),
  /** 同一目标再次命中的间隔，秒；不填时每个目标只命中一次。 */
  rehit: PositiveNumber.optional(),
  /** homing：转向速度，弧度/秒；找目标的范围，像素。 */
  turn: PositiveNumber.optional(),
  seek: PositiveNumber.optional(),
  /** boomerang：去程时长，秒；之后转身飞回发射者。 */
  out: PositiveNumber.optional(),
  /** orbit：环绕半径，像素；角速度用弹速除以半径。 */
  orbit: PositiveNumber.optional(),
  /** bounce：撞墙反弹次数。 */
  bounces: z.int().positive().optional(),
  /** 弹体结束时爆炸：范围、伤害、击退。 */
  burst: z
    .strictObject({ radius: PositiveNumber, damage: PositiveNumber, knockback: z.number().min(0) })
    .optional(),
  /** 弹体结束时向四周放出直线小弹。 */
  split: z
    .strictObject({
      count: z.int().positive(),
      sprite: z.string().min(1),
      speed: PositiveNumber,
      life: PositiveNumber,
      damage: PositiveNumber,
      radius: PositiveNumber,
    })
    .optional(),
});

/** 特殊弹体的通用规则（ADR 0031），不属于某一把武器。 */
export const ShotRulesSchema = z.strictObject({
  /** 追踪弹重新找目标的间隔，秒。 */
  seekEvery: PositiveNumber,
  /** 回旋镖回程的速度倍率，略快于去程，追得上走动的发射者。 */
  returnSpeed: PositiveNumber,
  /** 回旋镖碰到发射者身体外这么远就算接住，像素。 */
  catchRadius: z.number().min(0),
});

/** 武器。玩家与敌人的攻击都用这份结构。 */
export const WeaponDefSchema = z
  .strictObject({
    name: I18nKeySchema,
    attack: z.enum(['projectile', 'melee', 'shot', 'beam']),
    melee: z
      .strictObject({
        range: PositiveNumber,
        arcDegrees: z.number().positive().max(360),
        duration: PositiveNumber,
        cooldown: PositiveNumber,
        /** 挥动期间沿挥动方向突进的距离，像素（ADR 0031）；突进覆盖移动输入。 */
        lunge: PositiveNumber.optional(),
        /** 突进期间无敌。 */
        dashInvulnerable: z.boolean().optional(),
      })
      .optional(),
    shot: ShotDefSchema.optional(),
    /**
     * 持续光束（ADR 0031）：按住时从枪口射到墙，每 `tick` 秒对经过的敌人造成一次 `damage`，
     * 每 `costEvery` 秒扣一次 `energyCost`。最大长度用 `range`。
     */
    beam: z
      .strictObject({ width: PositiveNumber, tick: PositiveNumber, costEvery: PositiveNumber })
      .optional(),
    /**
     * 按住蓄力、松开发射（ADR 0031）：伤害倍率按蓄力比例从 `minScale` 插值到 `maxScale`，
     * 弹速倍率从 1 插值到 `speed`；蓄满额外穿透 `fullPierce` 个目标。
     */
    charge: z
      .strictObject({
        time: PositiveNumber,
        minTime: z.number().min(0),
        minScale: PositiveNumber,
        maxScale: PositiveNumber,
        speed: PositiveNumber,
        fullPierce: z.int().min(0),
      })
      .optional(),
    /** 射速预热（ADR 0031）：按住时 `time` 秒内从 `startRate` 升到 `fireRate`，松开后 `decay` 秒降回。 */
    spinup: z
      .strictObject({
        time: PositiveNumber,
        startRate: PositiveNumber,
        decay: PositiveNumber,
        /** 开火期间的移动速度倍率。 */
        moveScale: z.number().positive().max(1),
      })
      .optional(),
    /** 命中后连锁闪电（ADR 0031）：跳 `jumps` 次，每跳找 `range` 内最近的新目标，伤害乘 `falloff`。 */
    chain: z
      .strictObject({
        jumps: z.int().positive(),
        range: PositiveNumber,
        falloff: z.number().positive().max(1),
      })
      .optional(),
    /** 命中叠冰冻层数（ADR 0031）：满层前每层减速 `slow / stacks`，满层冻结 `freeze` 秒；`duration` 秒没被打中就清零。 */
    chill: z
      .strictObject({
        stacks: z.int().positive(),
        slow: z.number().positive().max(1),
        duration: PositiveNumber,
        freeze: PositiveNumber,
      })
      .optional(),
    rarity: RaritySchema,
    type: WeaponTypeSchema,
    /** 每颗弹丸的伤害。 */
    damage: PositiveNumber,
    /** 每秒开火次数。 */
    fireRate: PositiveNumber,
    /** 每次开火消耗的能量（M3 起生效）。 */
    energyCost: z.number().min(0),
    /** 散布总角度，度；每颗弹丸在 ±spread/2 内随机偏转。 */
    spread: z.number().min(0).max(360),
    /** 每次开火的弹丸数。 */
    pellets: z.int().min(1),
    /** 弹速，像素/秒。 */
    bulletSpeed: PositiveNumber,
    /** 射程，像素；子弹飞过这么远后消失。敌人只在射程内开火。 */
    range: PositiveNumber,
    /** 子弹碰撞半径，像素。 */
    bulletRadius: PositiveNumber,
    /** 可额外穿透的目标数；0 表示命中第一个目标就消失。 */
    pierce: z.int().min(0),
    /** 命中时把目标推开的距离，像素。 */
    knockback: z.number().min(0),
    critChance: Probability,
    pattern: FirePatternIdSchema,
    /** burst 的弹间隔，秒；其他弹道不用。 */
    burstInterval: PositiveNumber.optional(),
    bulletSprite: TextureKeySchema,
  })
  .superRefine((w, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if ((w.attack === 'melee') !== Boolean(w.melee) || (w.attack === 'melee') !== (w.pattern === 'melee_arc'))
      fail('近战攻击必须同时有 melee 参数与 melee_arc 模式');
    if (w.melee && w.melee.duration > w.melee.cooldown) fail('挥动时长不可超过冷却');
    if ((w.attack === 'shot') !== Boolean(w.shot)) fail('特殊弹体攻击必须有 shot 参数');
    if ((w.attack === 'beam') !== Boolean(w.beam) || (w.attack === 'beam') !== (w.pattern === 'beam'))
      fail('光束攻击必须同时有 beam 参数与 beam 模式');
    if ((w.chain || w.chill) && w.attack !== 'shot') fail('连锁与冰冻只对特殊弹体生效');
    if ((w.charge || w.spinup) && (w.attack === 'melee' || w.attack === 'beam' || w.pattern === 'burst'))
      fail('蓄力与预热只用于子弹或特殊弹体，且不与连射同用');
    if (w.charge && w.spinup) fail('蓄力与预热不能同时使用');
    if (w.charge && (w.charge.minTime > w.charge.time || w.charge.minScale > w.charge.maxScale))
      fail('蓄力的最短时间与倍率范围不合法');
    if (w.spinup && w.spinup.startRate > w.fireRate) fail('预热起始射速不能高于 fireRate');
    const s = w.shot;
    if (s) {
      const need = { homing: s.turn && s.seek, boomerang: s.out, orbit: s.orbit, bounce: s.bounces };
      if (s.motion !== 'straight' && !need[s.motion]) fail(`${s.motion} 弹体缺少运动参数`);
      if (s.motion === 'boomerang' && s.out && s.out * 2 > s.life) fail('回旋镖寿命要够来回');
    }
  });

export type WeaponDef = z.infer<typeof WeaponDefSchema>;
export type ShotDef = z.infer<typeof ShotDefSchema>;
export type ShotMotion = z.infer<typeof ShotMotionSchema>;
export type ShotRules = z.infer<typeof ShotRulesSchema>;
export type FirePatternId = z.infer<typeof FirePatternIdSchema>;
