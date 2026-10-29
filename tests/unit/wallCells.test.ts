import { expect, it } from 'vitest';
import { wallCells } from '../../src/sim/dungeon/wallGeometry';
import { DESIGNED_V3 } from '../../src/data/roomTemplates/designedV3';
import { compileRoom } from '../../src/sim/dungeon/compileRoom';

it('uses deterministic complete wall blocks in y/x order for both axis and 45-degree contours', () => {
  for (const template of DESIGNED_V3.filter((t) => t.theme === 'temple')) {
    const room = compileRoom(template),
      cells = wallCells(room.artBoundary);
    expect(wallCells([...room.artBoundary].reverse())).toEqual(cells);
    expect(new Set(cells.map((p) => `${p.x}:${p.y}`)).size).toBe(cells.length);
    for (let i = 1; i < cells.length; i++) {
      const a = cells[i - 1]!,
        b = cells[i]!;
      expect(b.y > a.y || (b.y === a.y && b.x > a.x)).toBe(true);
    }
    const diagonal = template.outline.some((p, i) => {
      const b = template.outline[(i + 1) % template.outline.length]!;
      return p[0] !== b[0] && p[1] !== b[1];
    });
    if (diagonal)
      expect(
        cells.some((a) => cells.some((b) => Math.abs(b.x - a.x) === 8 && Math.abs(b.y - a.y) === 8)),
      ).toBe(true);
  }
});
it('rejects off-grid and unsupported slopes', () => {
  expect(() =>
    wallCells([
      { x: 96, y: 39 },
      { x: 112, y: 47 },
      { x: 112, y: 71 },
      { x: 96, y: 71 },
    ]),
  ).toThrow('module grid');
});
