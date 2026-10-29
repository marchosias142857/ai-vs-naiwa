import { describe, it, expect } from 'vitest';
import { DESIGNED_V3 } from '../../../src/data/roomTemplates/designedV3';
import { ROOM_STYLE_IDS } from '../../../src/data/roomStyles';
import { TrapPlacementSchema } from '../../../src/data/schema/traps';
import { compileRoom, clearOfTraps } from '../../../src/sim/dungeon/compileRoom';
import { RoomGeometry } from '../../../src/sim/geometry/RoomGeometry';
import { selectRoomLayouts, roomTemplate, resolveRoomTemplate } from '../../../src/sim/dungeon/roomCatalog';
import { floorStyle } from '../../../src/sim/dungeon/floorStyle';
import { generateDungeon } from '../../../src/sim/dungeon/generate';
import { Random } from '../../../src/sim/core/Random';
import { DUNGEON } from '../../../src/data/dungeon';

for (const theme of ROOM_STYLE_IDS)
  describe(theme, () => {
    const rooms = DESIGNED_V3.filter((t) => t.theme === theme);
    it('contains 128 immutable combat layouts and explicit fixed roles', () => {
      expect(rooms.filter((t) => t.form === 'combat')).toHaveLength(128);
      expect(rooms.filter((t) => t.form !== 'combat').map((t) => t.form)).toEqual([
        'start',
        'chest',
        'exit',
        'boss',
        ...(theme === 'temple' ? ['hub'] : []),
      ]);
      expect(new Set(rooms.map((t) => t.id)).size).toBe(rooms.length);
      for (const t of rooms) {
        expect(Object.isFrozen(t)).toBe(true);
        for (const trap of t.traps) expect(TrapPlacementSchema.safeParse(trap).success, t.id).toBe(true);
      }
    });
    it('counts structural alternatives, not renamed, shifted or rotated duplicates', () => {
      const signatures = rooms
        .filter((t) => t.form === 'combat')
        .map((t) => {
          const variants: string[] = [];
          for (const swap of [false, true])
            for (const sx of [-1, 1])
              for (const sy of [-1, 1]) {
                const transform = (x: number, y: number): [number, number] =>
                  swap ? [sx * y, sy * x] : [sx * x, sy * y];
                const outline = t.outline.map(([x, y]) => transform(x, y));
                const ox = Math.min(...outline.map((p) => p[0])),
                  oy = Math.min(...outline.map((p) => p[1]));
                const sorted = (items: readonly number[][]) => items.map((p) => JSON.stringify(p)).sort();
                const pieces = (
                  items: readonly { x: number; y: number; width?: number; height?: number }[],
                ) =>
                  sorted(
                    items.map((p) => {
                      const [x, y] = transform(p.x, p.y);
                      return [
                        x - ox,
                        y - oy,
                        ...(swap ? [p.height ?? 0, p.width ?? 0] : [p.width ?? 0, p.height ?? 0]),
                      ];
                    }),
                  );
                variants.push(
                  JSON.stringify([
                    sorted(outline.map(([x, y]) => [x - ox, y - oy])),
                    pieces(t.boxes),
                    pieces(t.traps),
                  ]),
                );
              }
          return variants.sort()[0];
        });
      expect(new Set(signatures).size).toBe(128);
    });
    for (const t of rooms)
      it(`validates geometry, full models, visible gaps and anchors: ${t.id}`, () => {
        const c = compileRoom(t),
          g = new RoomGeometry(c.boundary, c.obstacles, 0),
          empty = new RoomGeometry(c.boundary, [], 0);
        const footprints = [
          ...t.boxes.map((p) => ({ ...p, width: p.width, height: p.height })),
          ...t.traps.map((p) => ({ ...p, width: (p.width ?? 24) + 6, height: (p.height ?? 28) + 6 })),
        ];
        for (let i = 0; i < footprints.length; i++) {
          const a = footprints[i]!;
          for (const b of footprints.slice(i + 1))
            expect(
              Math.abs(a.x - b.x) >= (a.width + b.width) / 2 + 8 ||
                Math.abs(a.y - b.y) >= (a.height + b.height) / 2 + 8,
              t.id,
            ).toBe(true);
          for (const dx of [-a.width / 2, a.width / 2])
            for (const dy of [-a.height / 2, a.height / 2])
              expect(empty.canOccupy({ x: 240 + a.x + dx, y: 135 + a.y + dy }, 0, 'walk'), t.id).toBe(true);
        }
        for (const b of t.boxes) expect(Math.max(b.width, b.height) % Math.min(b.width, b.height)).toBe(0);
        for (const p of t.traps)
          if (p.kind === 'spikes') {
            expect(p.width! % 16).toBe(0);
            expect(p.height! % 16).toBe(0);
          }
        for (const p of [...Object.values(c.anchors), ...c.ports.map((p) => p.entrance), ...c.spawns]) {
          expect(g.canOccupy(p, 6, 'spawn'), t.id).toBe(true);
          expect(clearOfTraps(t, p, 6), t.id).toBe(true);
        }
        for (const p of c.ports) expect(g.canOccupy(p.entrance, 14, 'walk')).toBe(true);
        // Every visible wall silhouette is solid, including the diagonal staircase and south caps.
        for (const cell of c.wallCells)
          for (const dx of [0.125, 4, 7.875])
            for (const dy of [0.125, 8, 17.475])
              expect(
                empty.canOccupy({ x: cell.x + dx, y: cell.y - 9.6 + dy }, 0, 'walk'),
                `${t.id}:${cell.x},${cell.y}`,
              ).toBe(false);
        // Independent Arcade infill agreement over the actual bounds.
        for (let y = c.bounds.y + 2; y < c.bounds.y + c.bounds.height; y += 8)
          for (let x = c.bounds.x + 2; x < c.bounds.x + c.bounds.width; x += 8) {
            const cut = c.cuts.some(
              (b) => Math.abs(x - b.x) < b.width / 2 && Math.abs(y - b.y) < b.height / 2,
            );
            expect(empty.canOccupy({ x, y }, 0, 'walk'), t.id).toBe(!cut);
          }
      });
  });

it('replaces old IDs and selects without replacement for arbitrary explicit style/floor', () => {
  expect(roomTemplate('modular_v2/temple/combat_0')).toBeNull();
  expect(roomTemplate('legacy_v1/temple/empty')).toBeNull();
  for (const theme of ROOM_STYLE_IDS)
    for (const floor of [1, 2, 4, 10, 99])
      for (let seed = 0; seed < 30; seed++) {
        const root = new Random(seed),
          map = generateDungeon(root.fork('map'));
        const selected = selectRoomLayouts(seed, floor, map.rooms, theme);
        expect(selected).toEqual(selectRoomLayouts(seed, floor, map.rooms, theme));
        expect(new Set(selected.templateIds).size).toBe(map.rooms.length);
        for (const r of map.rooms)
          expect(resolveRoomTemplate(selected.templateIds[r.id]!, theme, r.kind)?.theme).toBe(theme);
        expect(root.snapshot).toBe(seed);
      }
  expect(() =>
    selectRoomLayouts(
      1,
      1,
      Array.from({ length: 129 }, (_, id) => ({ id, kind: 'combat' })),
      'milk',
    ),
  ).toThrow('pool exhausted');
});
it('supports configurable room counts, stable topology, explicit allocation policies', () => {
  for (const [mainRooms, branchRooms] of [
    [3, 1],
    [4, 3],
    [6, 2],
    [9, 6],
    [12, 10],
  ])
    for (let seed = 0; seed < 50; seed++) {
      const config = { ...DUNGEON, gridSize: 7, mainRooms: mainRooms!, branchRooms: branchRooms! };
      const map = generateDungeon(new Random(seed), false, config);
      expect(map.rooms).toHaveLength(mainRooms! + branchRooms!);
      for (const kind of ['start', 'chest', 'exit'])
        expect(map.rooms.filter((r) => r.kind === kind)).toHaveLength(1);
      expect(map).toEqual(generateDungeon(new Random(seed), false, config));
    }
  expect(() => generateDungeon(new Random(1), false, { ...DUNGEON, mainRooms: 30 })).toThrow();
  const policy = { mode: 'random' as const, styles: ['abyss', 'milk'] as const };
  const selected = Array.from({ length: 100 }, (_, i) => floorStyle(i, 17, policy));
  expect(new Set(selected)).toEqual(new Set(['abyss', 'milk']));
  expect(floorStyle(42, 17, policy)).toBe(floorStyle(42, 17, policy));
});
