import { expect, it } from 'vitest';
import { LiveRoomGeometry } from '../../../src/sim/geometry/LiveRoomGeometry';
import {
  RoomGeometry,
  createGeometryHit,
  GeometryMask as M,
  type GeometryObstacle,
} from '../../../src/sim/geometry/RoomGeometry';
import { createCombatWorld, type RockView, type TrapView } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import { createInputFrame } from '../../../src/sim/core/types';
import { standingBarrel } from '../../../src/sim/room/Traps';

const p = (x: number, y: number) => ({ x, y });
const boundary = [p(0, 0), p(200, 0), p(200, 150), p(0, 150)];
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
const rock = (): Mutable<RockView> => ({
  active: false,
  landed: false,
  x: 100,
  y: 75,
  radius: 10,
  time: 1,
  fall: 1,
  life: 5,
});
const barrel = (): Mutable<TrapView> => ({
  active: true,
  kind: 'barrel',
  state: 'armed',
  x: 60,
  y: 75,
  radius: 10,
  width: 0,
  height: 0,
  angle: 0,
  time: 0,
  hp: 10,
});
function snapshot(
  source: { traps: readonly TrapView[]; rocks: readonly RockView[] },
  obstacles: readonly GeometryObstacle[] = [],
) {
  const all: GeometryObstacle[] = [...obstacles];
  for (const [i, t] of source.traps.entries())
    if (standingBarrel(t))
      all.push({
        id: `barrel:${i}`,
        kind: 'barrel',
        mask: 15,
        shape: { type: 'circle', x: t.x, y: t.y, radius: t.radius },
      });
  for (const [i, r] of source.rocks.entries())
    if (r.active && r.landed)
      all.push({
        id: `rock:${i}`,
        kind: 'rock',
        mask: 15,
        shape: { type: 'circle', x: r.x, y: r.y, radius: r.radius },
      });
  return new RoomGeometry(boundary, all, 1);
}
it('only armed barrels / landed active rocks block; queries do not refresh or mutate snapshots', () => {
  const source = { traps: [barrel()], rocks: [rock()] },
    g = new LiveRoomGeometry(boundary, [], source),
    out = createGeometryHit();
  const revision = g.revision;
  expect(g.canOccupy(p(60, 75), 6, 'walk')).toBe(false);
  expect(g.canOccupy(p(100, 75), 6, 'land')).toBe(true);
  source.traps[0]!.state = 'broken';
  source.rocks[0]!.active = true;
  expect(g.canOccupy(p(60, 75), 6, 'walk')).toBe(false);
  expect(g.revision).toBe(revision);
  expect(g.sync()).toBe(true);
  expect(g.revision).toBe(revision + 1);
  expect(g.canOccupy(p(60, 75), 6, 'surface')).toBe(true);
  expect(g.canOccupy(p(100, 75), 6, 'land')).toBe(true);
  source.rocks[0]!.landed = true;
  g.sync();
  for (const mask of [M.walk, M.land, M.LOS, M.projectile, 15]) {
    g.traceSegment(p(80, 75), p(120, 75), mask, out);
    expect(out).toMatchObject({ hit: true, id: 'rock:0', kind: 'rock' });
  }
  g.traceSegment(p(80, 65), p(120, 65), M.LOS, out);
  expect(out.hit).toBe(false);
  g.sweepCircle(p(84, 75), p(70, 75), 6, M.walk, out);
  expect(out.hit).toBe(false);
  g.sweepCircle(p(84, 75), p(95, 75), 6, M.walk, out);
  expect(out).toMatchObject({ hit: true, t: 0, nx: -1, ny: 0 });
});
it('revision and object identities stay fixed for unchanged topology, hp, timers and nonblocking traps', () => {
  const source = { traps: [barrel()], rocks: [rock()] },
    g = new LiveRoomGeometry(boundary, [], source);
  const view = g as unknown as { room: RoomGeometry; circles: object[] };
  const room = view.room,
    slots = view.circles,
    identities = [...slots];
  let revision = g.revision;
  source.traps[0]!.hp--;
  source.traps[0]!.time++;
  source.rocks[0]!.time--;
  expect(g.sync()).toBe(false);
  expect(g.revision).toBe(revision);
  for (let i = 0; i < 100; i++) {
    source.rocks[0]!.active = source.rocks[0]!.landed = true;
    source.rocks[0]!.x = 100 + i;
    expect(g.sync()).toBe(true);
    expect(g.revision).toBe(++revision);
    expect(g.sync()).toBe(false);
    source.rocks[0]!.active = false;
    expect(g.sync()).toBe(true);
    ++revision;
    expect(view.room).toBe(room);
    expect(view.circles).toBe(slots);
    for (let j = 0; j < slots.length; j++) expect(slots[j]).toBe(identities[j]);
  }
  source.traps[0]!.kind = 'mine';
  g.sync();
  revision = g.revision;
  source.traps[0]!.state = 'fuse';
  source.traps[0]!.x++;
  source.traps[0]!.time++;
  expect(g.sync()).toBe(false);
  expect(g.revision).toBe(revision);
  g.setRoom(boundary, []);
  expect(g.revision).toBe(revision + 1);
  expect(view.room).not.toBe(room);
  expect(view.circles).toBe(slots);
});
it('mixed live/static first hits, masks, ties, misses and footprints equal an immutable snapshot', () => {
  const source = { traps: [barrel()], rocks: [rock()] };
  source.rocks[0]!.active = source.rocks[0]!.landed = true;
  const obstacle: GeometryObstacle = {
    id: 'wall:0',
    kind: 'wall',
    mask: M.walk | M.land,
    shape: { type: 'polygon', points: [p(125, 40), p(140, 40), p(140, 110), p(125, 110)] },
  };
  const g = new LiveRoomGeometry(boundary, [obstacle], source),
    expected = snapshot(source, [obstacle]);
  const out = createGeometryHit(),
    other = createGeometryHit();
  for (const r of [0, 0.5, 6, 14])
    for (const mask of [0, M.walk, M.land, M.LOS, M.projectile, 15])
      for (const from of [p(20, 75), p(44, 75), p(84.01, 75), p(100, 75), p(180, 75), p(20, 14)])
        for (const to of [p(20, 75), p(160, 75), p(20, 135), p(190, 14)]) {
          g.sweepCircle(from, to, r, mask, out);
          expected.sweepCircle(from, to, r, mask, other);
          expect(out).toEqual(other);
          for (const purpose of ['walk', 'land', 'spawn', 'surface', 'rock'] as const)
            expect(g.canOccupy(from, r, purpose)).toBe(expected.canOccupy(from, r, purpose));
        }
  source.traps[0]!.x = source.rocks[0]!.x = 210;
  g.sync();
  g.sweepCircle(p(150, 75), p(210, 75), 6, M.walk, out);
  expect(out.kind).toBe('boundary');
  source.traps[0]!.x = source.rocks[0]!.x = 100;
  g.sync();
  g.sweepCircle(p(20, 75), p(120, 75), 6, M.walk, out);
  expect(out.id).toBe('barrel:0');
});
it('real fixed combat pools survive save/load, trap replacement and clearHazards without stale geometry or RNG writes', () => {
  const world = createCombatWorld({ seed: 12345, bus: new EventBus() });
  world.spawnPlayer('ai_proto', 30, 75);
  world.setTraps(1, [{ kind: 'barrel', x: 60, y: 75, radius: 10, width: 0, height: 0, angle: 0, delay: 0 }]);
  const g = new LiveRoomGeometry(boundary, [], world),
    saved = world.save();
  for (let i = 0; i < 5; i++) {
    g.sync();
    g.canOccupy(p(60, 75), 6, 'spawn');
  }
  expect(world.save()).toEqual(saved);
  world.setTraps(2, []);
  g.sync();
  expect(g.canOccupy(p(60, 75), 6, 'walk')).toBe(true);
  const restored = createCombatWorld({ seed: 12345, bus: new EventBus() });
  const restoredGeometry = new LiveRoomGeometry(boundary, [], restored);
  restored.load(saved);
  restoredGeometry.sync();
  expect(restoredGeometry.canOccupy(p(60, 75), 6, 'walk')).toBe(false);
  expect(restored.save()).toEqual(saved);
  const landed = world.save();
  landed.rocks.push({
    slot: 0,
    x: 100,
    y: 75,
    radius: 10,
    time: 3,
    fall: 1,
    life: 3,
    landed: true,
    damage: 1,
  });
  const withRocks = createCombatWorld({ seed: 12345, bus: new EventBus() });
  const rockGeometry = new LiveRoomGeometry(boundary, [], withRocks);
  withRocks.load(landed);
  rockGeometry.sync();
  expect(rockGeometry.canOccupy(p(100, 75), 6, 'walk')).toBe(false);
  withRocks.clearHazards();
  rockGeometry.sync();
  expect(rockGeometry.canOccupy(p(100, 75), 6, 'walk')).toBe(true);
  // clearHazards does not clear a standing barrel in a restored world.
  restored.clearHazards();
  restoredGeometry.sync();
  expect(restoredGeometry.canOccupy(p(60, 75), 6, 'walk')).toBe(false);
  restored.step(1 / 60, createInputFrame());
  expect(restoredGeometry.sync()).toBe(false);
});
it('reserved dynamic IDs and changing source capacity fail instead of silently losing blockers', () => {
  const source = { traps: [barrel()], rocks: [rock()] },
    g = new LiveRoomGeometry(boundary, [], source);
  expect(() =>
    g.setRoom(boundary, [
      { id: 'barrel:0', kind: 'wall', mask: 15, shape: { type: 'circle', x: 20, y: 20, radius: 5 } },
    ]),
  ).toThrow();
  source.rocks.push(rock());
  expect(() => g.sync()).toThrow('capacity');
});
