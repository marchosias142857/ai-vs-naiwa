import { expect, it, vi } from 'vitest';
import type { Scene } from 'phaser';
import type { CombatBridge } from '../../../src/game/world/CombatBridge';
import { createCombatWorld, type RockView } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import { RoomArena } from '../../../src/game/world/RoomArena';
import { GRAYBOX_BOUNDS as B } from '../../../src/game/world/graybox';
import { BOSS_ROOM_LAYOUT, ROOM_LAYOUTS } from '../../../src/data/layouts';
import { DungeonRun } from '../../../src/sim/run/DungeonRun';
import { createGeometryHit, GeometryMask as M } from '../../../src/sim/geometry/RoomGeometry';
vi.mock('../../../src/game/assets/demoArt', () => ({ ART: {} }));

// Only rendering/Arcade calls are stubbed. RoomArena, NavigationGrid and CombatWorld are real.
function harness() {
  const graphics = {
    setDepth: () => graphics,
    clear: () => graphics,
    fillStyle: () => graphics,
    fillRect: () => graphics,
    lineStyle: () => graphics,
    lineBetween: () => graphics,
    strokeRect: () => graphics,
  };
  const group = {
    create: () => {
      const image = {
        body: { enable: false },
        x: 0,
        y: 0,
        displayWidth: 0,
        displayHeight: 0,
        disableBody: () => {
          image.body.enable = false;
          return image;
        },
        enableBody: (_reset: boolean, x: number, y: number) => {
          image.body.enable = true;
          image.x = x;
          image.y = y;
          return image;
        },
        setDisplaySize: (width: number, height: number) => {
          image.displayWidth = width;
          image.displayHeight = height;
          return image;
        },
        refreshBody: () => image,
        setDepth: () => image,
        setAlpha: () => image,
      };
      return image;
    },
    destroy: () => {},
  };
  const scene = {
    textures: { exists: () => false },
    add: { graphics: () => graphics },
    physics: {
      add: { staticGroup: () => group, collider: () => ({ world: null }), overlap: () => ({ world: null }) },
    },
  } as unknown as Scene;
  const sim = createCombatWorld({ seed: 42, bus: new EventBus() });
  const bridge = { sim, actors: { group: {} }, bullets: { group: {} } } as unknown as CombatBridge;
  return { sim, arena: new RoomArena(scene, bridge) };
}
const cx = B.x + B.width / 2,
  cy = B.y + B.height / 2;
it('production room layouts and Boss columns compile at the same world positions as the wall pool', () => {
  const { arena } = harness(),
    out = createGeometryHit();
  for (let layout = 0; layout < ROOM_LAYOUTS.length; layout++) {
    arena.setLayout(layout);
    const q = arena.prepareGeometry();
    for (const box of ROOM_LAYOUTS[layout]!) {
      q.sweepCircle({ x: cx + box.x, y: cy + box.y }, { x: cx + box.x, y: cy + box.y }, 6, M.walk, out);
      expect(out).toMatchObject({ hit: true, t: 0, kind: 'wall' });
    }
  }
  const run = new DungeonRun(42, new EventBus(), 4);
  // Select the actual boss entry from the generated floor, without changing game production APIs.
  const boss = run.map.rooms.find((room) => room.kind === 'boss')!;
  run.roomId = boss.id;
  arena.show(run, 'legacy_v1/milk/boss');
  const box = BOSS_ROOM_LAYOUT[0]!;
  arena
    .prepareGeometry()
    .sweepCircle({ x: cx + box.x, y: cy + box.y }, { x: cx + box.x, y: cy + box.y }, 14, M.walk, out);
  expect(out).toMatchObject({ hit: true, t: 0, kind: 'pillar' });
  arena.destroy();
});
it('real navigation immediately routes around landed rocks, then releases the path on removal', () => {
  const { arena, sim } = harness(),
    out = { x: 0, y: 0 };
  arena.setLayout(0);
  const first = arena.prepareGeometry(),
    before = first.revision;
  expect(arena.steer(cx - 70, cy, cx + 70, cy, 6, out)).toBe(false);
  const r = sim.rocks[0] as { -readonly [K in keyof RockView]: RockView[K] };
  Object.assign(r, { active: true, landed: false, x: cx, y: cy, radius: 15 });
  expect(arena.steer(cx - 70, cy, cx + 70, cy, 6, out)).toBe(false);
  expect(arena.prepareGeometry().revision).toBe(before);
  r.landed = true;
  expect(arena.steer(cx - 70, cy, cx + 70, cy, 6, out)).toBe(true);
  const next = arena.prepareGeometry();
  expect(next).toBe(first);
  expect(next.revision).toBeGreaterThan(before);
  expect(next.canOccupy(out, 6, 'walk')).toBe(true);
  const blocked = next.revision;
  r.active = false;
  expect(arena.steer(cx - 70, cy, cx + 70, cy, 6, out)).toBe(false);
  expect(arena.prepareGeometry().revision).toBeGreaterThan(blocked);
  // Scene/room transitions increase revision even if a template is reused.
  const revision = next.revision;
  arena.setLayout(0);
  expect(arena.prepareGeometry().revision).toBeGreaterThan(revision);
  arena.destroy();
});
it('standing-barrel changes are visible before a render tick and queries alone preserve revision', () => {
  const { arena, sim } = harness(),
    out = { x: 0, y: 0 };
  arena.setLayout(0);
  sim.setTraps(1, [{ kind: 'barrel', x: cx, y: cy, radius: 12, width: 0, height: 0, angle: 0, delay: 0 }]);
  expect(arena.steer(cx - 70, cy, cx + 70, cy, 6, out)).toBe(true);
  const q = arena.prepareGeometry(),
    revision = q.revision;
  for (let i = 0; i < 10; i++) expect(q.canOccupy({ x: cx, y: cy }, 6, 'walk')).toBe(false);
  expect(q.revision).toBe(revision);
  sim.setTraps(2, []);
  expect(arena.steer(cx - 70, cy, cx + 70, cy, 6, out)).toBe(false);
  expect(arena.prepareGeometry().revision).toBeGreaterThan(revision);
  arena.destroy();
});

it('rejects unknown or mismatched template IDs before changing the active room geometry', () => {
  const { arena } = harness();
  const run = new DungeonRun(42, new EventBus());
  arena.show(run, 'legacy_v1/temple/empty');
  const before = arena.prepareGeometry().revision;
  for (const id of [
    'unknown',
    'legacy_v1/milk/empty',
    'legacy_v1/temple/combat_0',
    'legacy_v1/temple/boss',
  ]) {
    expect(() => arena.show(run, id)).toThrow(RangeError);
    expect(arena.prepareGeometry().revision).toBe(before);
  }
  arena.destroy();
  run.destroy();
});
