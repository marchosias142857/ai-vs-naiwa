import { expect, it } from 'vitest';
import { DESIGNED_V3 } from '../../../src/data/roomTemplates/designedV3';
import type { RoomBlueprint } from '../../../src/data/roomTemplates/types';
import { ROOM_STYLE_IDS } from '../../../src/data/roomStyles';
import { compileRoom, clearOfTraps } from '../../../src/sim/dungeon/compileRoom';

// Independent D4 normalization. Interiors deliberately exclude the outline, IDs,
// theme, trap kind, timing and current angle, so none can inflate layout counts.
function canonical(t: RoomBlueprint, shell: boolean, grid = 1): string {
  const keys: string[] = [];
  for (const swap of [false, true])
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        const p = (x: number, y: number): number[] =>
          (swap ? [sx * y, sy * x] : [sx * x, sy * y]).map((n) => Math.round(n / grid) * grid);
        const points = t.outline.map(([x, y]) => p(x, y));
        const pieces = (items: readonly { x: number; y: number; width?: number; height?: number }[]) =>
          items.map((b) => [
            ...p(b.x, b.y),
            ...(swap ? [b.height ?? 28, b.width ?? 24] : [b.width ?? 24, b.height ?? 28]),
          ]);
        const boxes = pieces(t.boxes),
          traps = pieces(t.traps),
          all = shell ? points : [...boxes, ...traps];
        const minX = Math.min(...all.map((p) => p[0]!)),
          minY = Math.min(...all.map((p) => p[1]!));
        const width = shell ? Math.max(...all.map((p) => p[0]!)) - minX : 1,
          height = shell ? Math.max(...all.map((p) => p[1]!)) - minY : 1;
        const sorted = (items: number[][]) =>
          items
            .map(([x, y, ...rest]) => JSON.stringify([(x! - minX) / width, (y! - minY) / height, ...rest]))
            .sort();
        keys.push(JSON.stringify(shell ? sorted(points) : [sorted(boxes), sorted(traps)]));
      }
  return keys.sort()[0]!;
}
it('has 32 normalized shells and 128 distinct interiors per style, and 512 across styles', () => {
  const global = new Set<string>();
  for (const theme of ROOM_STYLE_IDS) {
    const rooms = DESIGNED_V3.filter((t) => t.theme === theme && t.form === 'combat');
    expect(new Set(rooms.map((t) => canonical(t, true))).size).toBeGreaterThanOrEqual(32);
    const keys = rooms.map((t) => canonical(t, false));
    expect(new Set(keys).size).toBe(128);
    // Four-wall-block quantization erases small offsets before the independent count.
    expect(new Set(rooms.map((t) => canonical(t, false, 32))).size).toBe(128);
    for (const key of keys) {
      expect(global.has(key)).toBe(false);
      global.add(key);
    }
    expect(new Set(rooms.map((t) => t.design?.split(':')[0])).size).toBe(16);
    for (const t of rooms) {
      expect(Math.max(...t.outline.map((p) => p[0])) - Math.min(...t.outline.map((p) => p[0]))).toBe(368);
      expect(Math.max(...t.outline.map((p) => p[1])) - Math.min(...t.outline.map((p) => p[1]))).toBe(272);
    }
  }
  expect(global.size).toBe(512);
});
it('separately furnishes every fixed role by style, with four complete Boss pillars', () => {
  for (const form of ['start', 'chest', 'exit', 'boss'] as const) {
    const rooms = DESIGNED_V3.filter((t) => t.form === form);
    expect(rooms).toHaveLength(4);
    expect(new Set(rooms.map((t) => canonical(t, false))).size).toBe(4);
    for (const t of rooms) {
      const c = compileRoom(t);
      if (form === 'boss') {
        expect(t.obstacle).toBe('pillar');
        expect(t.boxes).toHaveLength(4);
        for (const b of t.boxes) expect([b.width, b.height]).toEqual([24, 24]);
        expect(c.obstacles.map((p) => p.kind)).toEqual(['pillar', 'pillar', 'pillar', 'pillar']);
      } else {
        expect(t.outline).toHaveLength(4);
        expect(c.bounds.height + 9.6).toBeCloseTo(c.bounds.width);
        expect(c.bounds.width).toBeLessThanOrEqual(144);
      }
    }
  }
  expect(DESIGNED_V3.filter((t) => t.form === 'hub').map((t) => t.theme)).toEqual(['temple']);
});
it('excludes the upper part of a barrel sprite using its 0.65 anchor', () => {
  const t = { ...DESIGNED_V3[0]!, traps: [{ kind: 'barrel' as const, x: 0, y: 0 }] };
  expect(clearOfTraps(t, { x: 240, y: 121 }, 0)).toBe(false);
  expect(clearOfTraps(t, { x: 240, y: 144 }, 0)).toBe(true);
});
