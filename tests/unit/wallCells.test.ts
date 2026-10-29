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

it('restores the rectangular perimeter plus four external corner blocks (128)', async () => {
  const { MODULAR_V2 } = await import('../../src/data/roomTemplates/modularV2');
  const b = MODULAR_V2.bounds;
  const cells = wallCells([
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ]);
  expect(cells).toHaveLength((2 * (b.width + b.height)) / 8 + 4);
  expect(cells).toHaveLength(128);
  for (const x of [b.x - 8, b.x + b.width])
    for (const y of [b.y - 8, b.y + b.height]) expect(cells).toContainEqual({ x, y });
});

it('keeps runs of at least three diagonal blocks single-course, including 135-degree endpoints', async () => {
  const { roomColumns } = await import('../../src/sim/dungeon/wallGeometry');
  for (const length of [24, 32, 48, 64]) {
    const p = [
      [-64 + length, -64],
      [64, -64],
      [64, 64],
      [-64, 64],
      [-64, -64 + length],
    ].map(([x, y]) => ({ x: 240 + x!, y: 135 + y! }));
    const cols = roomColumns(p),
      floor = new Set<string>(),
      course = new Set<string>();
    for (const c of cols) for (let y = c.top; y < c.bottom; y += 8) floor.add(`${c.x}:${y}`);
    for (const c of cols)
      for (let y = c.top; y < c.bottom; y += 8)
        for (const [dx, dy] of [
          [-8, 0],
          [8, 0],
          [0, -8],
          [0, 8],
        ]) {
          const key = `${c.x + dx!}:${y + dy!}`;
          if (!floor.has(key)) course.add(key);
        }
    const added = wallCells(p).filter((c) => !course.has(`${c.x}:${c.y}`));
    // Only the three remaining 90-degree convex vertices need new cells.
    expect(added).toEqual([
      { x: 304, y: 63 },
      { x: 168, y: 199 },
      { x: 304, y: 199 },
    ]);
  }
});

it('fills a two-block diagonal contact as a corner, and reuses the inner concave join', () => {
  const rectangle = [
    [-64, -64],
    [64, -64],
    [64, 64],
    [-64, 64],
  ].map(([x, y]) => ({ x: 240 + x!, y: 135 + y! }));
  const cells = wallCells(rectangle);
  expect(cells).toContainEqual({ x: 168, y: 63 });
  expect(cells).toContainEqual({ x: 176, y: 63 });
  expect(cells).toContainEqual({ x: 168, y: 71 });
  const notch = [
    [-64, -64],
    [-24, -64],
    [-24, -40],
    [24, -40],
    [24, -64],
    [64, -64],
    [64, 64],
    [-64, 64],
  ].map(([x, y]) => ({ x: 240 + x!, y: 135 + y! }));
  const bent = wallCells(notch);
  // Both re-entrant corners close on the notch side without adding a second row on the floor.
  for (const x of [216, 256]) expect(bent).toContainEqual({ x, y: 87 });
  for (const x of [208, 264]) expect(bent).not.toContainEqual({ x, y: 95 });
  expect(wallCells([...notch].reverse())).toEqual(bent);
});
