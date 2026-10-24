import { expect, it } from 'vitest';
import { ROOM_RULES } from '../../../src/data/rooms';
import { RoomRulesSchema } from '../../../src/data/schema/rooms';
import { DUNGEON } from '../../../src/data/dungeon';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { DungeonRun } from '../../../src/sim/run/DungeonRun';

const setup = () => {
  const bus = new EventBus<GameEvents>();
  return { bus, run: new DungeonRun(42, bus) };
};
const clear = (r: DungeonRun) => {
  while (r.locked) {
    r.step(ROOM_RULES.waveDelay + 0.001, 0, false);
  }
};
it('房间规则数据符合 schema', () => expect(RoomRulesSchema.safeParse(ROOM_RULES).success).toBe(true));
it('起点安全，禁止跳房；战斗时锁门，有怪不推进波次，清房只发一次', () => {
  const { bus, run } = setup();
  const log: string[] = [];
  bus.on('room:cleared', (e) => log.push(e.roomId));
  expect(run.locked).toBe(false);
  expect(run.enter(999)).toBe(false);
  expect(run.enter(1)).toBe(true);
  expect(run.enter(0)).toBe(false);
  run.step(ROOM_RULES.waveDelay + 0.001, 0, false);
  expect(run.spawnCount).toBe(ROOM_RULES.waves[0]);
  run.step(100, 1, false);
  expect(run.wave).toBe(1);
  expect(run.spawnCount).toBe(0);
  clear(run);
  expect(log).toHaveLength(1);
  expect(run.roomsCleared).toBe(1);
  run.step(10, 0, false);
  expect(log).toHaveLength(1);
  expect(run.enter(0)).toBe(true);
  expect(run.enter(1)).toBe(true);
  expect(run.locked).toBe(false);
});
it('三层主路径到 Boss：完整胜利事件恰好一次', () => {
  const { run, bus } = setup();
  const ends: boolean[] = [];
  bus.on('run:ended', (e) => ends.push(e.victory));
  for (let floor = 1; floor <= DUNGEON.floors; floor++) {
    for (let i = 1; i <= run.map.exit; i++) {
      expect(run.enter(i)).toBe(true);
      clear(run);
    }
    expect(run.nextFloor()).toBe(true);
  }
  expect(run.room.kind).toBe('start');
  expect(run.enter(1)).toBe(true);
  clear(run);
  expect(run.phase).toBe('won');
  run.step(1, 0, true);
  expect(ends).toEqual([true]);
  expect(run.nextFloor()).toBe(false);
  expect(run.enter(0)).toBe(false);
});
it('死亡优先于清房，结束后时间不继续增长', () => {
  const { run, bus } = setup();
  const ends: boolean[] = [];
  bus.on('run:ended', (e) => ends.push(e.victory));
  run.enter(1);
  run.step(1, 0, true);
  const t = run.elapsed;
  run.step(1, 0, true);
  expect(run.phase).toBe('lost');
  expect(run.elapsed).toBe(t);
  expect(ends).toEqual([false]);
});
