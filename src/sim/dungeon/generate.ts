import { DUNGEON } from '../../data/dungeon';
import type { Random } from '../core/Random';

export type RoomKind = 'start' | 'combat' | 'chest' | 'exit' | 'boss';
export interface DungeonRoom {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  kind: RoomKind;
  readonly links: number[];
}
export interface DungeonMap {
  readonly rooms: DungeonRoom[];
  readonly start: number;
  readonly exit: number;
}
const DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/** 只在生成楼层时分配。调用方传 rng.fork(`map:${floor}`)，不消耗战斗随机流。 */
export function generateDungeon(rng: Random, boss = false): DungeonMap {
  const size = DUNGEON.gridSize;
  const rooms: DungeonRoom[] = [];
  const occupied = new Set<number>();
  const add = (x: number, y: number, parent?: DungeonRoom): DungeonRoom => {
    const room: DungeonRoom = { id: rooms.length, x, y, kind: 'combat', links: [] };
    rooms.push(room);
    occupied.add(y * size + x);
    if (parent) {
      parent.links.push(room.id);
      room.links.push(parent.id);
    }
    return room;
  };
  const start = add(Math.floor(size / 2), Math.floor(size / 2));
  start.kind = 'start';
  // 回溯保证主路径达到目标长度；不靠失败后无界重试整个地图。
  const extend = (room: DungeonRoom, left: number): boolean => {
    if (!left) return true;
    for (const [dx, dy] of rng.shuffle([...DIRECTIONS])) {
      const x = room.x + dx,
        y = room.y + dy;
      if (x < 0 || y < 0 || x >= size || y >= size || occupied.has(y * size + x)) continue;
      const next = add(x, y, room);
      if (extend(next, left - 1)) return true;
      rooms.pop();
      room.links.pop();
      occupied.delete(y * size + x);
    }
    return false;
  };
  if (!extend(start, (boss ? 2 : DUNGEON.mainRooms) - 1)) throw new Error('无法生成地牢主路径');
  const exit = rooms[rooms.length - 1]!;
  exit.kind = boss ? 'boss' : 'exit';
  if (!boss) {
    for (let i = 0; i < DUNGEON.branchRooms; i++) {
      const candidates: { x: number; y: number; parent: DungeonRoom }[] = [];
      for (const parent of rooms)
        for (const [dx, dy] of DIRECTIONS) {
          const x = parent.x + dx,
            y = parent.y + dy;
          if (x >= 0 && y >= 0 && x < size && y < size && !occupied.has(y * size + x))
            candidates.push({ x, y, parent });
        }
      const spot = rng.pick(candidates);
      if (spot) add(spot.x, spot.y, spot.parent).kind = i === 0 ? 'chest' : 'combat';
    }
  }
  return { rooms, start: start.id, exit: exit.id };
}
