import { expect, it } from 'vitest';
import { DUNGEON } from '../../../src/data/dungeon';
import { ROOM_RULES } from '../../../src/data/rooms';
import { LEGACY_V1 } from '../../../src/data/roomTemplates/legacyV1';
import { createCombatWorld, type CombatWorldState } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { Random } from '../../../src/sim/core/Random';
import { DungeonRun, type DungeonRunState } from '../../../src/sim/run/DungeonRun';
import { RoomDirector, type RoomDirectorState } from '../../../src/sim/run/RoomDirector';

interface Saved {
  world: CombatWorldState;
  run: DungeonRunState;
  director: RoomDirectorState;
}

// Use the actual entry, wave and load paths. Debug kills and corpse removal stand in for
// finishing combat; this test covers root ownership, not weapon/AI or Arcade behavior.
function harness(seed: number, saved?: Saved) {
  const root = new Random(seed);
  const bus = new EventBus<GameEvents>();
  const world = createCombatWorld({ seed, bus });
  const run = saved ? DungeonRun.restore(seed, bus, saved.run) : new DungeonRun(seed, bus);
  const director = new RoomDirector(world, run, root, LEGACY_V1.bounds, () => true);
  expect(root.snapshot).toBe(seed);
  if (saved) {
    world.load(saved.world);
    director.load(saved.director);
  } else world.spawnPlayer('ai_proto', LEGACY_V1.anchors.player.x, LEGACY_V1.anchors.player.y);
  expect(root.snapshot).toBe(seed);
  const save = (): Saved => {
    const result = { world: world.save(), run: run.save(), director: director.save() };
    expect(root.snapshot).toBe(seed);
    return result;
  };
  return { root, world, run, director, save };
}

for (const seed of [0, 42, 12345, 0xffffffff])
  it(`keeps the legacy root through real multi-wave spawning, floor changes and save/load: ${seed}`, () => {
    let h = harness(seed);
    let normalWaves = 0,
      bossSpawns = 0,
      restores = 0;
    const tick = () => {
      h.director.step(1 / 60);
      expect(h.root.snapshot).toBe(seed);
    };
    for (let floor = 1; floor <= DUNGEON.floors + 1; floor++) {
      expect(h.run.floor).toBe(floor);
      // Generated main-path IDs are consecutive, and each enter must pass real link/lock checks.
      for (let id = 1; id <= h.run.map.exit; id++) {
        expect(h.run.enter(id)).toBe(true);
        expect(h.run.visited[id]).toBe(true);
        expect(h.root.snapshot).toBe(seed);
        if (!h.run.locked) continue;
        const boss = h.run.room.kind === 'boss';
        const waves = boss ? 1 : ROOM_RULES.waves.length;
        for (let wave = 0; wave < waves; wave++) {
          const before = h.director.save();
          for (let step = 0; h.run.wave === wave && step < 120; step++) tick();
          expect(h.run.wave).toBe(wave + 1);
          const enemies = h.world.actors.filter((a) => a.team === 'enemy');
          const expected = boss ? 1 : ROOM_RULES.waves[wave]! + (floor - 1) * ROOM_RULES.floorExtra;
          expect(enemies).toHaveLength(expected);
          expect(h.director.save().positions).not.toBe(before.positions);
          if (boss) {
            expect(enemies[0]!.kind).toBe('naiwa_boss');
            bossSpawns++;
          } else {
            expect(h.director.save().kinds).not.toBe(before.kinds);
            normalWaves++;
          }
          const saved = JSON.parse(JSON.stringify(h.save())) as Saved;
          const resumed = harness(seed, saved);
          expect(resumed.save()).toEqual(saved);
          // Both real directors advance once from the same in-progress wave after roundtrip.
          h.director.step(1 / 60);
          resumed.director.step(1 / 60);
          expect(h.root.snapshot).toBe(seed);
          expect(resumed.root.snapshot).toBe(seed);
          expect(resumed.save()).toEqual(h.save());
          h.run.destroy();
          h = resumed;
          restores++;
          // Death can spawn splitter children; finish those through the same debug hook too.
          for (let pass = 0; h.world.actors.some((a) => a.team === 'enemy') && pass < 8; pass++) {
            h.world.debugKillEnemies();
            const ids = h.world.actors.filter((a) => a.team === 'enemy').map((a) => a.id);
            for (const id of ids) h.world.removeActor(id);
          }
          expect(h.world.actors.some((a) => a.team === 'enemy')).toBe(false);
          tick();
        }
        expect(h.run.locked).toBe(false);
        expect(h.run.cleared[id]).toBe(true);
      }
      if (floor <= DUNGEON.floors) {
        expect(h.run.nextFloor()).toBe(true);
        expect(h.root.snapshot).toBe(seed);
        tick(); // Exercises RoomDirector's this.rng fork on the existing director after nextFloor.
        expect(h.director.save().floor).toBe(floor + 1);
      }
    }
    expect(normalWaves).toBe((DUNGEON.mainRooms - 2) * ROOM_RULES.waves.length * DUNGEON.floors);
    expect(bossSpawns).toBe(1);
    expect(restores).toBe(normalWaves + bossSpawns);
    expect(h.run.phase).toBe('won');
    h.run.destroy();
  });
