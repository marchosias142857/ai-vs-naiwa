import { expect, it, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { ENCOUNTERS } from '../../../src/data/loot';
const measurements: unknown[] = [];
afterAll(() => {
  if (process.env.ROOM_REPORT)
    writeFileSync(process.env.ROOM_REPORT, JSON.stringify(measurements, null, 2) + '\n');
});
import { LEGACY_V1 } from '../../../src/data/roomTemplates/legacyV1';
import { ENEMIES } from '../../../src/data/enemies';
import { compileRoom } from '../../../src/sim/dungeon/compileRoom';
import { roomTemplate } from '../../../src/sim/dungeon/roomCatalog';
import {
  RoomGeometry,
  GeometryMask,
  createGeometryHit,
  CONTACT_EPSILON,
} from '../../../src/sim/geometry/RoomGeometry';
import { RoomDirector } from '../../../src/sim/run/RoomDirector';
import { DungeonRun } from '../../../src/sim/run/DungeonRun';
import { createCombatWorld } from '../../../src/sim/combat/api';
import type { GameEvents } from '../../../src/sim/core/events';
import { EventBus } from '../../../src/sim/core/EventBus';
import { Random } from '../../../src/sim/core/Random';

for (const theme of LEGACY_V1.themes)
  for (const desc of [theme.empty, ...theme.plans, ...(theme.art === 'milk' ? [theme.boss] : [])]) {
    const id = desc.id.replace('legacy_v1/', 'modular_v2/');
    it(`validates area, connected clearance and anchors: ${id}`, () => {
      const t = roomTemplate(id)!,
        c = compileRoom(t),
        b = c.bounds;
      const barrels = t.traps
        .filter((p) => p.kind === 'barrel')
        .map((p, i) => ({
          id: `barrel:${i}`,
          kind: 'barrel' as const,
          mask: 15,
          shape: { type: 'circle' as const, x: 240 + p.x, y: 135 + p.y, radius: 7 },
        }));
      const q = new RoomGeometry(c.boundary, [...c.obstacles, ...barrels], 0),
        empty = new RoomGeometry(c.boundary, [], 0);
      // Compare with the frozen pre-#132 rectangle AND its original obstacles/barrels.
      const oldTemplate = roomTemplate(desc.id)!,
        oldRoom = compileRoom(oldTemplate);
      const old = new RoomGeometry(
        oldRoom.boundary,
        [
          ...oldRoom.obstacles,
          ...oldTemplate.traps
            .filter((p) => p.kind === 'barrel')
            .map((p, i) => ({
              id: `old-barrel:${i}`,
              kind: 'barrel' as const,
              mask: 15,
              shape: { type: 'circle' as const, x: 240 + p.x, y: 135 + p.y, radius: 7 },
            })),
        ],
        0,
      );
      const h = createGeometryHit();
      // 2-unit cell centres: footprint area is reported separately from body-centre clearance.
      const step = Number(process.env.ROOM_CELL_SIZE ?? 2),
        cols = b.width / step,
        rows = b.height / step;
      const floor = LEGACY_V1.themes.findIndex((theme) => theme.art === t.theme);
      const radii = new Set([
        6,
        ...(t.form === 'boss'
          ? [14]
          : ENCOUNTERS.floors[Math.min(floor, 2)]!.map((id) => ENEMIES[id].radius)),
      ]);
      for (const radius of radii) {
        let area = 0,
          free = 0,
          baseline = 0,
          legacyFree = 0,
          legacyCenters = 0;
        const cells = new Set<number>();
        for (let row = 0; row < rows; row++)
          for (let col = 0; col < cols; col++) {
            const p = { x: b.x + (col + 0.5) * step, y: b.y + (row + 0.5) * step };
            if (empty.canOccupy(p, 0, 'walk')) area++;
            if (q.canOccupy(p, 0, 'walk')) free++;
            if (empty.canOccupy(p, radius + CONTACT_EPSILON, 'walk')) baseline++;
            if (q.canOccupy(p, radius + CONTACT_EPSILON, 'walk')) cells.add(row * cols + col);
            if (old.canOccupy(p, 0, 'walk')) legacyFree++;
            if (old.canOccupy(p, radius + CONTACT_EPSILON, 'walk')) legacyCenters++;
          }
        expect(free / area).toBeGreaterThanOrEqual(0.8);
        const queue = [cells.values().next().value!],
          reached = new Set(queue);
        for (let i = 0; i < queue.length; i++) {
          const v = queue[i]!,
            x = v % cols,
            y = Math.floor(v / cols);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]) {
            const nx = x + dx!,
              ny = y + dy!,
              n = ny * cols + nx;
            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || !cells.has(n) || reached.has(n)) continue;
            const from = { x: b.x + (x + 0.5) * step, y: b.y + (y + 0.5) * step },
              to = { x: b.x + (nx + 0.5) * step, y: b.y + (ny + 0.5) * step };
            q.sweepCircle(from, to, radius, GeometryMask.walk, h);
            if (h.hit && h.t < 1) continue;
            reached.add(n);
            queue.push(n);
          }
        }
        expect(
          reached.size,
          JSON.stringify({
            radius,
            unreachable: [...cells]
              .filter((id) => !reached.has(id))
              .map((id) => ({
                x: b.x + ((id % cols) + 0.5) * step,
                y: b.y + (Math.floor(id / cols) + 0.5) * step,
              })),
          }),
        ).toBe(cells.size);
        expect(free).toBeGreaterThanOrEqual(legacyFree);
        // Count all old legal centres, even disconnected pockets: the new connected area
        // must exceed this stricter baseline, not merely an arbitrarily chosen component.
        expect(reached.size).toBeGreaterThanOrEqual(legacyCenters);
        if (radius === 6) expect(reached.size / baseline).toBeGreaterThanOrEqual(0.8);
        measurements.push({
          id,
          radius,
          cellSize: step,
          interiorArea: area * step * step,
          footprintFreeFraction: free / area,
          reachableCenterArea: reached.size * step * step,
          legacyFootprintArea: legacyFree * step * step,
          footprintArea: free * step * step,
          legacyCenterArea: legacyCenters * step * step,
          footprintRelativeToLegacy: free / legacyFree,
          centersRelativeToLegacy: reached.size / legacyCenters,
          relativeToEmptyCenters: reached.size / baseline,
          relativeToInterior: reached.size / area,
          components: 1,
        });
      }
      for (const p of Object.values(c.anchors)) expect(q.canOccupy(p, 6, 'spawn')).toBe(true);
      for (const p of c.ports) {
        expect(q.canOccupy(p.entrance, 14, 'spawn')).toBe(true);
        q.sweepCircle(
          p.entrance,
          { x: p.center.x - p.direction.x * 6, y: p.center.y - p.direction.y * 6 },
          6,
          GeometryMask.walk,
          h,
        );
        expect(h.hit && h.t < 1).toBe(false);
      }
      for (const radius of new Set(Object.values(ENEMIES).map((e) => e.radius))) {
        for (const p of c.spawns) expect(q.canOccupy(p, radius, 'spawn')).toBe(true);
      }
      // Every excluded rect lies outside the polygon, matching Arcade infill.
      for (const cut of c.cuts) expect(empty.canOccupy(cut, 0, 'walk')).toBe(false);
      for (let y = b.y + 0.5; y < b.y + b.height; y += 2)
        for (let x = b.x + 0.5; x < b.x + b.width; x += 2) {
          const infill = c.cuts.some(
            (cut) => Math.abs(x - cut.x) < cut.width / 2 && Math.abs(y - cut.y) < cut.height / 2,
          );
          expect(empty.canOccupy({ x, y }, 0, 'walk')).toBe(!infill);
        }
    });
  }

it('keeps pending and both streams unchanged when all candidates are blocked, including load', () => {
  const bus = new EventBus<GameEvents>(),
    root = new Random(42),
    world = createCombatWorld({ seed: 42, bus });
  const run = new DungeonRun(42, bus);
  world.spawnPlayer('ai_proto', 240, 135);
  let free = false;
  const anchors = [
    { id: 'b', x: 352, y: 135 },
    { id: 'a', x: 128, y: 135 },
  ];
  const director = new RoomDirector(
    world,
    run,
    root,
    LEGACY_V1.bounds,
    (x, y) => free && anchors.some((p) => p.x === x && p.y === y),
    31,
    () => anchors,
  );
  expect(run.enter(1)).toBe(true);
  const streams = director.save();
  for (let i = 0; i < 120; i++) director.step(1 / 60);
  const blocked = director.save();
  expect(blocked.pending).toBeGreaterThan(0);
  expect(blocked.kinds).toBe(streams.kinds);
  expect(blocked.positions).toBe(streams.positions);
  expect(run.locked).toBe(true);
  expect(world.actors).toHaveLength(1);
  director.load(JSON.parse(JSON.stringify(blocked)));
  director.step(1 / 60);
  expect(director.save()).toEqual(blocked);
  const bus2 = new EventBus<GameEvents>(),
    world2 = createCombatWorld({ seed: 42, bus: bus2 });
  world2.load(world.save());
  const run2 = DungeonRun.restore(42, bus2, run.save());
  const resumed = new RoomDirector(
    world2,
    run2,
    new Random(42),
    LEGACY_V1.bounds,
    (x, y) => free && anchors.some((p) => p.x === x && p.y === y),
    31,
    () => anchors,
  );
  resumed.load(JSON.parse(JSON.stringify(blocked)));
  free = true;
  director.step(1 / 60);
  resumed.step(1 / 60);
  expect(world2.save()).toEqual(world.save());
  expect(resumed.save()).toEqual(director.save());
  const enemies = world.actors.filter((a) => a.team === 'enemy');
  expect(enemies).toHaveLength(blocked.pending);
  for (const e of enemies) expect({ x: e.x, y: e.y }).toEqual({ x: 128, y: 135 });
  expect(director.save().pending).toBe(0);
  expect(root.snapshot).toBe(42);
});
