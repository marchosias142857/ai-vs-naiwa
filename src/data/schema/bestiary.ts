import { z } from 'zod';
import { I18nKeySchema } from './common';

/** 图鉴分类：普通怪、只由其他怪分裂/召唤出来的小怪、首领（ADR 0036）。 */
export const BESTIARY_ROLES = ['common', 'minion', 'boss'] as const;
export type BestiaryRole = (typeof BESTIARY_ROLES)[number];

export const BestiaryEntrySchema = z.strictObject({
  /** 图鉴编号：一经分配永不改、永不复用；新怪取当前最大编号 + 1。与数组或对象顺序无关。 */
  no: z.number().int().positive(),
  role: z.enum(BESTIARY_ROLES),
  /** 静态展示帧：怪物资源注册表里的动作名与帧序号。重绘后只换图集，不改这里。 */
  frame: z.strictObject({ action: z.string().min(1), index: z.number().int().min(0) }),
  /** 攻击方式与简介的文案 key；文案不写数字，具体数值由界面从 data 读取。 */
  attack: I18nKeySchema,
  desc: I18nKeySchema,
});
export type BestiaryEntry = z.infer<typeof BestiaryEntrySchema>;
