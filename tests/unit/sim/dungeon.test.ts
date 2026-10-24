import { expect, it } from 'vitest';
import { DUNGEON } from '../../../src/data/dungeon';
import { DungeonDefSchema } from '../../../src/data/schema/dungeon';
import { Random } from '../../../src/sim/core/Random';
import { generateDungeon } from '../../../src/sim/dungeon/generate';

it('数据合法，过量房间被 schema 拒绝', () => {
  expect(DungeonDefSchema.safeParse(DUNGEON).success).toBe(true);
  expect(DungeonDefSchema.safeParse({ ...DUNGEON, mainRooms: 30 }).success).toBe(false);
});
it('1000 个种子：可复现、全连通、无重复位置、双向相邻连接、房间数量正确', () => {
  for (let seed = 0; seed < 1000; seed++) {
    const map = generateDungeon(new Random(seed).fork('map:1'));
    expect(map).toEqual(generateDungeon(new Random(seed).fork('map:1')));
    expect(map.rooms).toHaveLength(DUNGEON.mainRooms + DUNGEON.branchRooms);
    expect(new Set(map.rooms.map((r) => `${r.x},${r.y}`)).size).toBe(map.rooms.length);
    const seen = new Set([map.start]),
      queue = [map.start];
    for (let i = 0; i < queue.length; i++) {
      const room = map.rooms[queue[i]!]!;
      for (const id of room.links) {
        const other = map.rooms[id]!;
        expect(other.links).toContain(room.id);
        expect(Math.abs(room.x - other.x) + Math.abs(room.y - other.y)).toBe(1);
        if (!seen.has(id)) {
          seen.add(id);
          queue.push(id);
        }
      }
    }
    expect(seen.size).toBe(map.rooms.length);
    expect(map.rooms.filter((r) => r.kind === 'chest')).toHaveLength(1);
    expect(map.rooms[map.exit]!.kind).toBe('exit');
  }
});
it('子流隔离；Boss 层只有安全起点和 Boss 房', () => {
  const root = new Random(8);
  const before = generateDungeon(root.fork('map:1'));
  for (let i = 0; i < 100; i++) root.fork('loot').next();
  expect(generateDungeon(root.fork('map:1'))).toEqual(before);
  const boss = generateDungeon(root.fork('boss'), true);
  expect(boss.rooms.map((r) => r.kind)).toEqual(['start', 'boss']);
  expect(boss.rooms[0]!.links).toEqual([1]);
});
