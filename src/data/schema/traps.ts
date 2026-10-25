import { z } from 'zod';
import { PositiveNumber } from './common';

/** 房间机关（ADR 0032）。地刺、水流、海草丛是矩形区域；泡泡地雷、鱼雷桶是圆。 */
export const TrapKindSchema = z.enum(['spikes', 'current', 'weed', 'mine', 'barrel']);

/** 机关摆放：坐标相对房间中心，像素。 */
export const TrapPlacementSchema = z
  .strictObject({
    kind: TrapKindSchema,
    x: z.number(),
    y: z.number(),
    /** 矩形机关的宽高。 */
    width: PositiveNumber.optional(),
    height: PositiveNumber.optional(),
    /** 水流方向，度：0 向右，90 向下。 */
    angle: z.number().optional(),
    /** 地刺周期的起始偏移，秒，让相邻地刺错开。 */
    delay: z.number().min(0).optional(),
  })
  .superRefine((t, ctx) => {
    const rect = t.kind === 'spikes' || t.kind === 'current' || t.kind === 'weed';
    if (rect !== (t.width !== undefined && t.height !== undefined))
      ctx.addIssue({ code: 'custom', message: '矩形机关必须有宽高，圆形机关不能有' });
    if ((t.kind === 'current') !== (t.angle !== undefined))
      ctx.addIssue({ code: 'custom', message: '只有水流需要方向' });
  });

/** 每种机关的规则数值。 */
export const TrapRulesSchema = z.strictObject({
  /** 地刺：收起 `rest` 秒 → 预警 `warn` 秒 → 刺出 `up` 秒，刺出时伤害站在上面的所有角色，每次刺出每人最多一次。 */
  spikes: z.strictObject({
    rest: PositiveNumber,
    warn: PositiveNumber,
    up: PositiveNumber,
    damage: PositiveNumber,
  }),
  /** 水流：把区域里的角色往水流方向推，像素/秒。 */
  current: z.strictObject({ speed: PositiveNumber }),
  /** 海草丛：区域里的角色移动速度倍率。 */
  weed: z.strictObject({ slow: z.number().positive().max(1) }),
  /** 泡泡地雷：有角色碰到就点燃，`fuse` 秒后爆炸，伤害范围内所有角色；`rearm` 秒后重新布设。 */
  mine: z.strictObject({
    radius: PositiveNumber,
    fuse: PositiveNumber,
    blast: PositiveNumber,
    damage: PositiveNumber,
    knockback: z.number().min(0),
    rearm: PositiveNumber,
  }),
  /** 鱼雷桶：挡路挡子弹，被子弹、近战、爆炸打掉 `hp` 后爆炸，伤害范围内所有角色，可以连锁引爆。 */
  barrel: z.strictObject({
    radius: PositiveNumber,
    hp: PositiveNumber,
    blast: PositiveNumber,
    damage: PositiveNumber,
    knockback: z.number().min(0),
  }),
});

/** 一个战斗房的方案：内墙布局（`ROOM_LAYOUTS` 下标）加一组机关。 */
export const RoomPlanSchema = z.strictObject({
  layout: z.int().min(0),
  traps: z.array(TrapPlacementSchema).max(12).readonly(),
});

/** 每层的房间主题：美术风格与可选的战斗房方案。 */
export const RoomThemeSchema = z.strictObject({
  art: z.enum(['temple', 'wreck', 'abyss', 'milk']),
  plans: z.array(RoomPlanSchema).min(1).readonly(),
});

export type TrapKind = z.infer<typeof TrapKindSchema>;
export type TrapPlacement = z.infer<typeof TrapPlacementSchema>;
export type TrapRules = z.infer<typeof TrapRulesSchema>;
export type RoomPlan = z.infer<typeof RoomPlanSchema>;
export type RoomTheme = z.infer<typeof RoomThemeSchema>;
