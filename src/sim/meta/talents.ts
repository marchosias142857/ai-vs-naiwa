import type { CharacterId } from '../../data/characters';
import { LOOT_RULES } from '../../data/loot';
import type { TalentDef, TalentStat } from '../../data/schema/talents';
import { TALENTS, type TalentId } from '../../data/talents';

/** 每个天赋的已解锁等级；缺省即 0。存档与档案共用这一形状（ADR 0035）。 */
export type TalentRanks = Partial<Record<TalentId, number>>;
/** 天赋汇总后的开局加成；全部为线性相加值。 */
export type TalentModifiers = Record<TalentStat, number>;
/** 不能解锁的原因：未知 ID、已满级、前置未满足、点数不足。 */
export type UnlockBlock = 'unknown' | 'maxed' | 'locked' | 'points';

const DEFS: Readonly<Record<TalentId, TalentDef>> = TALENTS;
/** 按层级升序：前置只指向更低层级，顺序处理一遍即可修正前置链。 */
const ORDER = (Object.keys(TALENTS) as TalentId[]).sort((a, b) => DEFS[a].tier - DEFS[b].tier);

export function isTalentId(id: unknown): id is TalentId {
  return typeof id === 'string' && Object.hasOwn(TALENTS, id);
}
export function rankOf(ranks: Readonly<TalentRanks>, id: TalentId): number {
  return ranks[id] ?? 0;
}
export function maxRank(id: TalentId): number {
  return DEFS[id].costs.length;
}
/** 下一级的价格；已满级为 null。 */
export function nextCost(ranks: Readonly<TalentRanks>, id: TalentId): number | null {
  return DEFS[id].costs[rankOf(ranks, id)] ?? null;
}
export function spentPoints(ranks: Readonly<TalentRanks>): number {
  let sum = 0;
  for (const id of ORDER) for (let i = 0; i < rankOf(ranks, id); i++) sum += DEFS[id].costs[i] ?? 0;
  return sum;
}
export function requirementsMet(ranks: Readonly<TalentRanks>, id: TalentId): boolean {
  return DEFS[id].requires.every((r) => isTalentId(r.id) && rankOf(ranks, r.id) >= r.rank);
}
/** 返回 null 表示可以解锁下一级。 */
export function unlockBlock(
  ranks: Readonly<TalentRanks>,
  available: number,
  id: unknown,
): UnlockBlock | null {
  if (!isTalentId(id)) return 'unknown';
  const cost = nextCost(ranks, id);
  if (cost === null) return 'maxed';
  if (!requirementsMet(ranks, id)) return 'locked';
  return available >= cost ? null : 'points';
}

export function emptyModifiers(): TalentModifiers {
  return {
    health: 0,
    armor: 0,
    energy: 0,
    speed: 0,
    damage: 0,
    haste: 0,
    regen: 0,
    skill: 0,
    coins: 0,
    offers: 0,
  };
}
/** 汇总某个角色可用的天赋加成；`characters` 限定的节点对其他角色不生效。 */
export function talentModifiers(ranks: Readonly<TalentRanks>, kind?: CharacterId): TalentModifiers {
  const out = emptyModifiers();
  for (const id of ORDER) {
    const def = DEFS[id],
      rank = rankOf(ranks, id);
    if (rank && (!def.characters || (kind !== undefined && def.characters.includes(kind))))
      out[def.stat] += def.amount * rank;
  }
  return out;
}
/** 这套开局天赋下每层出口的升级候选数。 */
export function offerCount(ranks: Readonly<TalentRanks>): number {
  return LOOT_RULES.upgradeChoices + talentModifiers(ranks).offers;
}

/**
 * 外部数据转成合法等级表：丢弃未知 ID 与非法值，等级夹到上限，前置不满足的节点清零。
 * 数据更新删除节点或提高前置时，旧档按此规则降级，不会报错也不会越权。
 */
export function normalizeRanks(value: unknown): TalentRanks {
  const out: TalentRanks = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  const raw = value as Record<string, unknown>;
  for (const id of ORDER) {
    const rank = Object.hasOwn(raw, id) ? raw[id] : 0;
    if (typeof rank === 'number' && Number.isInteger(rank) && rank > 0) out[id] = Math.min(rank, maxRank(id));
  }
  for (const id of ORDER) if (out[id] && !requirementsMet(out, id)) delete out[id];
  return out;
}
/** 价格上调后已花费超过累计获得时，从高层级往低层级逐级退回，直到不透支。 */
export function trimRanks(ranks: Readonly<TalentRanks>, budget: number): TalentRanks {
  const out = normalizeRanks(ranks);
  let i = ORDER.length - 1;
  while (i >= 0 && spentPoints(out) > budget) {
    const id = ORDER[i]!;
    const rank = out[id] ?? 0;
    if (rank === 0) i--;
    else {
      if (rank === 1) delete out[id];
      else out[id] = rank - 1;
      for (const other of ORDER) if (out[other] && !requirementsMet(out, other)) delete out[other];
    }
  }
  return out;
}
