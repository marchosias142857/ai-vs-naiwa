import { expect, it } from 'vitest';
import { FloorCheckpointSchema } from '../../../src/data/schema/checkpoint';
import { PLAYER_RULES } from '../../../src/data/player';
import { createCombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { createInputFrame } from '../../../src/sim/core/types';
import { legacyRunId, parseCheckpoint, type FloorCheckpoint } from '../../../src/sim/run/checkpoint';
import { DungeonRun } from '../../../src/sim/run/DungeonRun';
const save: FloorCheckpoint = {
  version: 2,
  seed: 42,
  runId: '16-lzk3x9',
  talents: { thick_scales: 1 },
  floor: 2,
  upgrades: ['vitality'],
  secondary: 'shotgun_fan',
  equipped: 'pistol_basic',
  hp: 4,
  armor: 2,
  energy: 120,
  coins: 10,
  kills: 12,
  roomsCleared: 4,
  elapsed: 100,
};
it('检查点 schema 与轻量解析一致；拒绝损坏/未来版本/未知 ID', () => {
  for (const value of [
    save,
    { ...save, secondary: null },
    { ...save, secondary: null, equipped: 'shotgun_fan' },
    { ...save, secondary: null, equipped: null },
    null,
    {},
    { ...save, version: 3 },
    { ...save, runId: '' },
    { ...save, runId: 'Bad ID' },
    { ...save, talents: null },
    { ...save, talents: [] },
    { ...save, talents: { thick_scales: 1.5 } },
    { ...save, talents: { thick_scales: -1 } },
    { ...save, talents: { removed_talent: 2 } },
    { version: 1, ...withoutStart(save) },
    { version: 1, ...withoutStart(save), floor: 5 },
    { ...save, seed: -1 },
    { ...save, floor: 5 },
    { ...save, upgrades: [] },
    { ...save, upgrades: ['__proto__'] },
    { ...save, secondary: '__proto__' },
    { ...save, equipped: 'bad' },
    { ...save, hp: 0 },
    { ...save, energy: Infinity },
    { ...save, coins: NaN },
  ])
    expect(!!parseCheckpoint(value)).toBe(FloorCheckpointSchema.safeParse(value).success);
  const restored = parseCheckpoint(JSON.parse(JSON.stringify(save)))!;
  expect(restored).toEqual(save);
  expect(restored.upgrades).not.toBe(save.upgrades);
});
function withoutStart(c: FloorCheckpoint) {
  const { version: _version, runId: _runId, talents: _talents, ...rest } = c;
  return rest;
}
it('v1 入口迁移为零天赋 v2，冒险 ID 由种子派生且稳定；未知天赋丢弃、等级夹到上限', () => {
  const v1 = { version: 1, ...withoutStart(save) };
  const migrated = parseCheckpoint(v1)!;
  expect(migrated).toEqual({ ...save, runId: legacyRunId(42), talents: {} });
  expect(parseCheckpoint(v1)!.runId).toBe(migrated.runId);
  expect(parseCheckpoint({ ...save, talents: { removed_talent: 2, thick_scales: 9 } })!.talents).toEqual({
    thick_scales: 2,
  });
  // 前置不满足的节点按当前数据清零。
  expect(parseCheckpoint({ ...save, talents: { coral_plates: 1 } })!.talents).toEqual({});
});
it('恢复升级和资源，拒绝运行中恢复；非法值不产生部分写入', () => {
  const world = createCombatWorld({
    seed: save.seed,
    bus: new EventBus<GameEvents>(),
    playerRules: PLAYER_RULES,
  });
  const id = world.spawnPlayer('ai_proto', 0, 0);
  for (const upgrade of save.upgrades) world.upgrade(upgrade);
  expect(world.restorePlayer(save)).toBe(true);
  expect(world.getActor(id)?.hp).toBe(4);
  expect(world.getActor(id)?.maxHp).toBe(8);
  expect(world.resources.armor).toBe(2);
  expect(world.restorePlayer({ ...save, armor: NaN })).toBe(false);
  expect(world.resources.energy).toBe(120);
  expect(world.restorePlayer({ ...save, hp: 100, energy: 1000 })).toBe(true);
  expect(world.getActor(id)?.hp).toBe(8);
  expect(world.resources.energy).toBe(200);
  world.step(1 / 60, createInputFrame());
  expect(world.restorePlayer(save)).toBe(false);
});
it('直接恢复到每层入口保持确定地图；拒绝非法楼层', () => {
  for (const floor of [1, 2, 3, 4]) {
    const a = new DungeonRun(42, new EventBus<GameEvents>(), floor);
    const b = new DungeonRun(42, new EventBus<GameEvents>(), floor);
    expect(a.map).toEqual(b.map);
    expect(a.room.kind).toBe('start');
    expect(a.locked).toBe(false);
  }
  expect(() => new DungeonRun(42, new EventBus<GameEvents>(), 0)).toThrow();
});
