import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../../src/data/characters';
import { LOOT_RULES } from '../../../src/data/loot';
import { UPGRADES } from '../../../src/data/player';
import { IdSchema } from '../../../src/data/schema';
import { TalentDefSchema, TalentRulesSchema, type TalentDef } from '../../../src/data/schema/talents';
import { MAX_OFFER_BONUS, TALENT_RULES, TALENTS, type TalentId } from '../../../src/data/talents';
import en from '../../../src/i18n/en.json';
import zh from '../../../src/i18n/zh-CN.json';
import {
  emptyModifiers,
  maxRank,
  normalizeRanks,
  offerCount,
  spentPoints,
  talentModifiers,
  trimRanks,
  unlockBlock,
  type TalentRanks,
} from '../../../src/sim/meta/talents';

const DEFS: Record<TalentId, TalentDef> = TALENTS;
const IDS = Object.keys(TALENTS) as TalentId[];
const FULL: TalentRanks = Object.fromEntries(IDS.map((id) => [id, maxRank(id)]));

describe('天赋数据', () => {
  it('每个节点符合 schema；前置只指向同分支更低层级、等级不超上限；价格逐级不降', () => {
    expect(TalentRulesSchema.safeParse(TALENT_RULES).success).toBe(true);
    for (const id of IDS) {
      const def = DEFS[id];
      expect(IdSchema.safeParse(id).success, id).toBe(true);
      const parsed = TalentDefSchema.safeParse(def);
      expect(parsed.success, `${id}: ${parsed.error?.message ?? ''}`).toBe(true);
      for (const r of def.requires) {
        const target = DEFS[r.id as TalentId];
        expect(target, `${id} → ${r.id}`).toBeDefined();
        expect(target.branch).toBe(def.branch);
        expect(target.tier).toBeLessThan(def.tier);
        expect(r.rank).toBeLessThanOrEqual(target.costs.length);
      }
      expect(def.requires.length === 0).toBe(def.tier === 1);
      for (let i = 1; i < def.costs.length; i++)
        expect(def.costs[i]!).toBeGreaterThanOrEqual(def.costs[i - 1]!);
      for (const kind of def.characters ?? []) expect(Object.hasOwn(CHARACTERS, kind)).toBe(true);
      expect(['damage', 'haste', 'regen', 'skill'].includes(def.stat)).toBe(def.display === 'percent');
    }
  });
  it('名称与说明中英文齐全，说明用 {amount} 占位而不写死数值', () => {
    const keys = [
      ...IDS.flatMap((id) => [DEFS[id].name, DEFS[id].desc]),
      ...['guard', 'strike', 'current'].map((b) => `talent.branch.${b}`),
      ...['rooms', 'floors', 'kills', 'victory', 'record', 'first_win'].map((k) => `talent.reward.${k}`),
    ];
    for (const key of keys) {
      expect(Object.hasOwn(zh, key), key).toBe(true);
      expect(Object.hasOwn(en, key), key).toBe(true);
    }
    for (const id of IDS) {
      const desc = DEFS[id].desc as keyof typeof zh;
      expect(zh[desc]).toContain('{amount}');
      expect(zh[desc]).not.toMatch(/\d/);
    }
  });
  it('满级加成有上限，且候选总数不超过升级种类', () => {
    const full = talentModifiers(FULL);
    expect([full.health, full.armor, full.energy, full.speed, full.coins, full.offers]).toEqual([
      3, 2, 50, 12, 12, 1,
    ]);
    expect(full.damage).toBeCloseTo(0.25, 9);
    expect(full.haste).toBeCloseTo(0.1, 9);
    expect(full.regen).toBeCloseTo(0.3, 9);
    expect(full.skill).toBeCloseTo(0.2, 9);
    expect(MAX_OFFER_BONUS).toBe(1);
    expect(LOOT_RULES.upgradeChoices + MAX_OFFER_BONUS).toBeLessThanOrEqual(Object.keys(UPGRADES).length);
    expect(spentPoints(FULL)).toBe(454);
  });
});

describe('天赋树逻辑', () => {
  it('点数不足、前置未满足、满级、未知 ID 分别拒绝；恰好够点时允许', () => {
    expect(unlockBlock({}, 100, 'nope')).toBe('unknown');
    expect(unlockBlock({}, 100, '__proto__')).toBe('unknown');
    expect(unlockBlock({}, 3, 'thick_scales')).toBe('points');
    expect(unlockBlock({}, 4, 'thick_scales')).toBeNull();
    expect(unlockBlock({}, 100, 'coral_plates')).toBe('locked');
    expect(unlockBlock({ thick_scales: 1 }, 9, 'coral_plates')).toBe('points');
    expect(unlockBlock({ thick_scales: 1 }, 10, 'coral_plates')).toBeNull();
    expect(unlockBlock({ thick_scales: 2 }, 100, 'thick_scales')).toBe('maxed');
    expect(unlockBlock({ thick_scales: 2, coral_plates: 1 }, 100, 'abyss_heart')).toBe('locked');
    expect(unlockBlock({ thick_scales: 2, coral_plates: 1, tide_mending: 1 }, 70, 'abyss_heart')).toBeNull();
  });
  it('外部等级表规范化：丢弃未知、非法、超限，前置断裂的节点清零', () => {
    expect(normalizeRanks(null)).toEqual({});
    expect(normalizeRanks([1, 2])).toEqual({});
    expect(normalizeRanks({ thick_scales: 7, junk: 3, keen_fins: 1.5, flowing_swim: -2 })).toEqual({
      thick_scales: 2,
    });
    expect(normalizeRanks({ abyss_heart: 1, thick_scales: 2, coral_plates: 1 })).toEqual({
      thick_scales: 2,
      coral_plates: 1,
    });
    expect(normalizeRanks(FULL)).toEqual(FULL);
  });
  it('价格上调导致透支时从高层级逐级退回，结果不透支且前置完整', () => {
    for (const budget of [0, 3, 4, 20, 100, 453, 454]) {
      const trimmed = trimRanks(FULL, budget);
      expect(spentPoints(trimmed)).toBeLessThanOrEqual(budget);
      expect(normalizeRanks(trimmed)).toEqual(trimmed);
    }
    expect(trimRanks(FULL, 454)).toEqual(FULL);
    // 终点节点最先退回。
    const trimmed = trimRanks(FULL, 453);
    expect(trimmed.sharp_eye ?? 0).toBe(0);
    expect(trimmed.keen_fins).toBe(3);
  });
  it('限定角色的节点只对该角色生效；候选数随天赋变化', () => {
    expect(talentModifiers({}, 'ai_proto')).toEqual(emptyModifiers());
    expect(offerCount({})).toBe(LOOT_RULES.upgradeChoices);
    expect(offerCount(FULL)).toBe(LOOT_RULES.upgradeChoices + 1);
  });
});
