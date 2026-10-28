import { expect, it } from 'vitest';
import { wallCells } from '../../src/game/world/ModularRoomArt';
import { MODULAR_V2 } from '../../src/data/roomTemplates/modularV2';
import { RoomGeometry } from '../../src/sim/geometry/RoomGeometry';

it('builds one solid outer course, ordered by y then x, for a rectangular room', () => {
  const b = MODULAR_V2.bounds;
  const points = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ];
  const cells = wallCells(points);
  expect(cells).toHaveLength(124);
  expect(wallCells([...points].reverse())).toEqual(cells);
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1]!,
      c = cells[i]!;
    expect(c.y > a.y || (c.y === a.y && c.x > a.x)).toBe(true);
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
