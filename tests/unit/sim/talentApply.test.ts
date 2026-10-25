import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../../src/data/characters';
import { PLAYER_RULES } from '../../../src/data/player';
import { TALENTS, type TalentId } from '../../../src/data/talents';
import { createCombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { createInputFrame } from '../../../src/sim/core/types';
import { emptyModifiers, maxRank, talentModifiers, type TalentRanks } from '../../../src/sim/meta/talents';

const FULL: TalentRanks = Object.fromEntries(
  (Object.keys(TALENTS) as TalentId[]).map((id) => [id, maxRank(id)]),
);

describe('开局施加天赋', () => {
  const world = () =>
    createCombatWorld({ seed: 7, bus: new EventBus<GameEvents>(), playerRules: PLAYER_RULES });
  it('满级天赋与数据表一致，与局内升级同一套加法；生命、护甲、能量补满', () => {
    const w = world(),
      id = w.spawnPlayer('ai_proto', 0, 0);
    expect(w.applyTalents(talentModifiers(FULL, 'ai_proto'))).toBe(true);
    const p = w.getActor(id)!,
      r = w.resources;
    expect([p.maxHp, p.hp]).toEqual([CHARACTERS.ai_proto.hp + 3, CHARACTERS.ai_proto.hp + 3]);
    expect([r.maxArmor, r.armor]).toEqual([PLAYER_RULES.armor + 2, PLAYER_RULES.armor + 2]);
    expect([r.maxEnergy, r.energy]).toEqual([PLAYER_RULES.energy + 50, PLAYER_RULES.energy + 50]);
    expect(r.damageScale).toBeCloseTo(1.25, 9);
    expect(r.fireRateScale).toBeCloseTo(1.1, 9);
    expect(r.regenScale).toBeCloseTo(1.3, 9);
    expect(r.skillScale).toBeCloseTo(1.2, 9);
    expect(r.coins).toBe(12);
    expect(w.upgrade('power')).toBe(true);
    expect(r.damageScale).toBeCloseTo(1.45, 9);
  });
  it('只能施加一次、只能在开局；非法值整体拒绝不产生部分写入', () => {
    const w = world();
    expect(w.applyTalents(emptyModifiers())).toBe(false);
    const id = w.spawnPlayer('ai_proto', 0, 0);
    expect(w.applyTalents({ ...emptyModifiers(), health: 1, armor: NaN })).toBe(false);
    expect(w.applyTalents({ ...emptyModifiers(), health: 1, coins: -1 })).toBe(false);
    expect(w.getActor(id)!.maxHp).toBe(CHARACTERS.ai_proto.hp);
    expect(w.applyTalents({ ...emptyModifiers(), health: 1 })).toBe(true);
    expect(w.applyTalents({ ...emptyModifiers(), health: 1 })).toBe(false);
    expect(w.getActor(id)!.maxHp).toBe(CHARACTERS.ai_proto.hp + 1);
    const late = world();
    late.spawnPlayer('ai_proto', 0, 0);
    late.step(1 / 60, createInputFrame());
    expect(late.applyTalents({ ...emptyModifiers(), health: 1 })).toBe(false);
  });
  it('入口兜底重放（天赋 → 升级 → 入口资源）与完整读档得到同样的属性，不重复叠加', () => {
    const ranks: TalentRanks = {
      thick_scales: 2,
      coral_plates: 1,
      keen_fins: 2,
      pocket_money: 1,
      flowing_swim: 1,
    };
    const fresh = world();
    fresh.spawnPlayer('ai_proto', 0, 0);
    fresh.applyTalents(talentModifiers(ranks, 'ai_proto'));
    fresh.upgrade('vitality');
    const progress = { hp: 5, armor: 3, energy: 90, coins: 20 };
    fresh.restorePlayer(progress);
    const saved = fresh.save();
    const replay = world();
    replay.spawnPlayer('ai_proto', 0, 0);
    replay.applyTalents(talentModifiers(ranks, 'ai_proto'));
    replay.upgrade('vitality');
    replay.restorePlayer(progress);
    expect(replay.save()).toEqual(saved);
    const loaded = world();
    loaded.load(saved);
    expect(loaded.save()).toEqual(saved);
    expect(loaded.applyTalents(talentModifiers(ranks, 'ai_proto'))).toBe(false);
    expect(loaded.resources.coins).toBe(20);
  });
});
