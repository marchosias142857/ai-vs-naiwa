import { z } from 'zod';
import { I18nKeySchema, IdSchema } from './common';

/**
 * 天赋可改的开局数值（ADR 0035）。前八项与局内升级共用同一套加法规则，
 * `coins` 是开局金币，`offers` 是每层出口的升级候选数。
 */
export const TALENT_STATS = [
  'health',
  'armor',
  'energy',
  'speed',
  'damage',
  'haste',
  'regen',
  'skill',
  'coins',
  'offers',
] as const;
export type TalentStat = (typeof TALENT_STATS)[number];

/** 天赋树的三条分支；界面按此顺序从左到右排列。 */
export const TALENT_BRANCHES = ['guard', 'strike', 'current'] as const;
export type TalentBranch = (typeof TALENT_BRANCHES)[number];

const Count = z.number().int().positive();
export const TalentDefSchema = z.strictObject({
  name: I18nKeySchema,
  desc: I18nKeySchema,
  branch: z.enum(TALENT_BRANCHES),
  /** 界面层级：1 在下，越大越靠后；前置只能指向更低层级的同分支节点。 */
  tier: z.number().int().min(1).max(3),
  /** 同层并列时的左右位置：-1 左、0 中、1 右。 */
  lane: z.number().int().min(-1).max(1),
  stat: z.enum(TALENT_STATS),
  /** 每级加成，全部等级线性相加，不做乘法叠加。 */
  amount: z.number().positive(),
  /** 界面把 `amount` 显示为数字还是百分比，与局内升级的 `display` 相同。 */
  display: z.enum(['number', 'percent']),
  /** 第 n 级的价格，长度就是等级上限。 */
  costs: z.array(Count).min(1).max(5),
  /** 全部满足才可解锁第 1 级。 */
  requires: z.array(z.strictObject({ id: IdSchema, rank: Count })).max(3),
  /** 只对这些角色生效；省略表示全部角色。 */
  characters: z.array(IdSchema).min(1).optional(),
});
export type TalentDef = z.infer<typeof TalentDefSchema>;

export const TalentRulesSchema = z.strictObject({
  /** 每个清空的战斗房（含 Boss 房）。 */
  room: Count,
  /** 每进入下一层（含 Boss 层）。 */
  floor: Count,
  /** 打倒最终 Boss。 */
  victory: Count,
  /** 每多少击杀给 1 点；召唤物与分裂物也计入击杀，所以必须有上限。 */
  killsPerPoint: Count,
  killCap: Count,
  /** 每个首次到达的楼层（含第 1 层与 Boss 层），一生只给一次。 */
  record: Count,
  /** 第一次通关，一生只给一次。 */
  firstWin: Count,
  /** 记住最近多少个已结算冒险，防止重复发奖。 */
  history: Count,
  /** 旧档案（v1）迁移时按历史战绩补发，有上限。 */
  legacy: z.strictObject({ perRun: Count, perWin: Count, cap: Count }),
});
export type TalentRules = z.infer<typeof TalentRulesSchema>;
