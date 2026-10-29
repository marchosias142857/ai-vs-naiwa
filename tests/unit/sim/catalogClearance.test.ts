import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { DESIGNED_V3 } from '../../../src/data/roomTemplates/designedV3';
import { compileRoom } from '../../../src/sim/dungeon/compileRoom';
import { RoomGeometry, CONTACT_EPSILON, type GeometryObstacle } from '../../../src/sim/geometry/RoomGeometry';

it('audits every new room: full-radius connectivity, area and conservative legacy comparison', () => {
  const rows: {
    id: string;
    radius: number;
    cellSize: number;
    freeArea: number;
    reachableArea: number;
    freeFraction: number;
    centerFraction: number;
    components: number;
  }[] = [];
  const cache = new Map<string, Omit<(typeof rows)[number], 'id'>[]>();
  // The OLD EMPTY rectangle is stricter than any old furnished room, so no matching-ID shortcut is needed.
  const old = new RoomGeometry(
    [
      { x: 104, y: 47 },
      { x: 376, y: 47 },
      { x: 376, y: 223 },
      { x: 104, y: 223 },
    ],
    [],
    0,
  );
  const step = Number(process.env.ROOM_CELL_SIZE ?? 4);
  for (const t of DESIGNED_V3) {
    if (process.env.ROOM_FILTER && !t.id.includes(process.env.ROOM_FILTER)) continue;
    const c = compileRoom(t);
    const barrels: GeometryObstacle[] = t.traps
      .filter((p) => p.kind === 'barrel')
      .map((p, i) => ({
        id: `barrel:${i}`,
        kind: 'barrel',
        mask: 15,
        shape: { type: 'circle', x: 240 + p.x, y: 135 + p.y, radius: 7 },
      }));
    const obstacles = [...c.obstacles, ...barrels];
    const key = JSON.stringify([c.boundary, obstacles, t.form]);
    let measured = cache.get(key);
    if (!measured) {
      measured = [];
      const g = new RoomGeometry(c.boundary, obstacles, 0),
        empty = new RoomGeometry(c.boundary, [], 0),
        b = c.bounds;
      const cols = Math.ceil(b.width / step),
        nr = Math.ceil(b.height / step);
      let floor = 0,
        free = 0;
      for (let y = b.y + step / 2; y < b.y + b.height; y += step)
        for (let x = b.x + step / 2; x < b.x + b.width; x += step) {
          if (empty.canOccupy({ x, y }, 0, 'walk')) floor++;
          if (g.canOccupy({ x, y }, 0, 'walk')) free++;
        }
      const radii = t.form === 'boss' ? [6, 14] : t.form === 'combat' ? [3, 4, 5, 6, 7, 8, 9] : [6];
      for (const radius of radii) {
        const cells = new Uint8Array(cols * nr),
          queue = new Int32Array(cells.length);
        let legal = 0,
          baseline = 0,
          legacy = 0,
          first = -1;
        for (let r = 0; r < nr; r++)
          for (let col = 0; col < cols; col++) {
            const p = { x: b.x + (col + 0.5) * step, y: b.y + (r + 0.5) * step },
              id = r * cols + col;
            if (empty.canOccupy(p, radius + CONTACT_EPSILON, 'walk')) baseline++;
            if (g.canOccupy(p, radius + CONTACT_EPSILON, 'walk')) {
              cells[id] = 1;
              legal++;
              if (first < 0) first = id;
            }
          }
        for (let y = 47 + step / 2; y < 223; y += step)
          for (let x = 104 + step / 2; x < 376; x += step)
            if (old.canOccupy({ x, y }, radius + CONTACT_EPSILON, 'walk')) legacy++;
        expect(first, t.id).toBeGreaterThanOrEqual(0);
        let head = 0,
          tail = 1;
        queue[0] = first;
        cells[first] = 2;
        while (head < tail) {
          const id = queue[head++]!,
            x = id % cols,
            y = Math.floor(id / cols);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = x + dx!,
              ny = y + dy!,
              n = ny * cols + nx;
            if (nx < 0 || nx >= cols || ny < 0 || ny >= nr || cells[n] !== 1) continue;
            cells[n] = 2;
            queue[tail++] = n;
          }
        }
        const isolated = cells.findIndex((value) => value === 1);
        expect(
          tail,
          `${t.id} radius ${radius}; first disconnected center ${b.x + ((isolated % cols) + 0.5) * step},${b.y + (Math.floor(isolated / cols) + 0.5) * step}`,
        ).toBe(legal);
        expect(free / floor, t.id).toBeGreaterThanOrEqual(0.8);
        if (radius === 6) expect(legal / baseline, t.id).toBeGreaterThanOrEqual(0.8);
        if (t.form === 'combat' || t.form === 'boss') {
          expect(free * step * step, t.id).toBeGreaterThanOrEqual(272 * 176);
          expect(legal, t.id).toBeGreaterThanOrEqual(legacy);
        }
        measured.push({
          radius,
          cellSize: step,
          freeArea: free * step * step,
          reachableArea: legal * step * step,
          freeFraction: free / floor,
          centerFraction: legal / baseline,
          components: 1,
        });
      }
      cache.set(key, measured);
    }
    for (const row of measured) rows.push({ id: t.id, ...row });
  }
  if (process.env.ROOM_REPORT)
    writeFileSync(
      process.env.ROOM_REPORT,
      JSON.stringify({ templates: DESIGNED_V3.length, distinctGeometry: cache.size, rows }, null, 2) + '\n',
    );
}, 600000);
