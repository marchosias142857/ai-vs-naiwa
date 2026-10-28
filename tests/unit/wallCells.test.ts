import { expect, it } from 'vitest';
import { wallCells } from '../../src/game/world/ModularRoomArt';
import { MODULAR_V2 } from '../../src/data/roomTemplates/modularV2';
import { RoomGeometry, GeometryMask, createGeometryHit } from '../../src/sim/geometry/RoomGeometry';
import { compileRoom } from '../../src/sim/dungeon/compileRoom';
import { roomTemplate } from '../../src/sim/dungeon/roomCatalog';
import { MAP_ART, mapDoorRect } from '../../src/data/mapArt';

it('builds one solid outer course, ordered by y then x, for a rectangular room', () => {
  const b = MODULAR_V2.bounds;
  const points = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ];
  const cells = wallCells(points);
  expect(cells).toHaveLength(128);
  expect(wallCells([...points].reverse())).toEqual(cells);
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1]!,
      c = cells[i]!;
    expect(c.y > a.y || (c.y === a.y && c.x > a.x)).toBe(true);
  }
});

it('blocks the entire drawn wall silhouette, including raised south caps and the wreck step', () => {
  for (const theme of ['temple', 'wreck', 'abyss', 'milk']) {
    const room = compileRoom(roomTemplate(`modular_v2/${theme}/empty`)!);
    const geometry = new RoomGeometry(room.boundary, [], 0);
    for (const cell of wallCells(room.artBoundary))
      for (const dx of [0.125, 4, 7.875])
        for (const dy of [0.125, 4, 7.875, 8.125, 12, 17.475]) {
          const point = { x: cell.x + dx, y: cell.y - MAP_ART.wallHeight + dy };
          expect(geometry.canOccupy(point, 0, 'walk'), JSON.stringify({ theme, point })).toBe(false);
          expect(geometry.canOccupy(point, 0, 'spawn')).toBe(false);
        }
    const hit = createGeometryHit();
    for (let i = 0; i < room.artBoundary.length; i++) {
      const a = room.artBoundary[i]!,
        b = room.artBoundary[(i + 1) % room.artBoundary.length]!;
      if (a.y !== b.y || a.x <= b.x) continue;
      const x = (a.x + b.x) / 2,
        top = a.y - MAP_ART.wallHeight;
      for (const mask of Object.values(GeometryMask)) {
        geometry.sweepCircle({ x, y: top - 20 }, { x, y: a.y + 8 }, 6, mask, hit);
        expect(hit).toMatchObject({ hit: true, kind: 'boundary', ny: -1 });
        expect(hit.y).toBeCloseTo(top - 6);
      }
    }
    const south = room.ports.find((p) => p.id === 'south')!;
    expect(mapDoorRect(south).y).toBeCloseTo(south.center.y);
    expect(geometry.canOccupy(south.entrance, 14, 'spawn')).toBe(true);
  }
});

it('keeps complete wall footprints outside every existing contour, including concave corners', () => {
  for (const shape of Object.values(MODULAR_V2.shapes)) {
    const points = shape.points.map(([x, y]) => ({ x: 104 + x, y: 47 + y }));
    const geometry = new RoomGeometry(points, [], 0);
    for (const cell of wallCells(points)) {
      // Probe beyond the solver's 0.02 contact tolerance.
      for (const dx of [0.125, 4, 7.875])
        for (const dy of [0.125, 4, 7.875])
          expect(
            geometry.canOccupy({ x: cell.x + dx, y: cell.y + dy }, 0, 'walk'),
            JSON.stringify({ cell, dx, dy }),
          ).toBe(false);
    }
  }
});

it('rejects unapproved off-grid/diagonal contours rather than painting a mismatched footprint', () => {
  expect(() =>
    wallCells([
      { x: 96, y: 39 },
      { x: 104, y: 47 },
      { x: 96, y: 55 },
    ]),
  ).toThrow('module grid');
});
