import { it, expect } from 'vitest';
import { LEGACY_V1 } from '../../../src/data/roomTemplates/legacyV1';
import { RoomDirector } from '../../../src/sim/run/RoomDirector';
import { DungeonRun } from '../../../src/sim/run/DungeonRun';
import { createCombatWorld } from '../../../src/sim/combat/api';
import type { GameEvents } from '../../../src/sim/core/events';
import { EventBus } from '../../../src/sim/core/EventBus';
import { Random } from '../../../src/sim/core/Random';

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
