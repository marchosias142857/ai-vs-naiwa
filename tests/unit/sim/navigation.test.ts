import { expect, it } from 'vitest';
import { NAVIGATION } from '../../../src/data/navigation';
import { NavigationRulesSchema } from '../../../src/data/schema/navigation';
import { NavigationGrid } from '../../../src/sim/dungeon/NavigationGrid';
import { segmentHitsBox } from '../../../src/sim/dungeon/geometry';
it('固定网格绕柱且每段不穿墙；不同半径与重复查询保持确定', () => {
  expect(NavigationRulesSchema.safeParse(NAVIGATION).success).toBe(true);
  const b = { x: 0, y: 0, width: 192, height: 128 };
  const free = (x: number, y: number, r: number) =>
    x >= r &&
    y >= r &&
    x <= b.width - r &&
    y <= b.height - r &&
    !(x > 80 - r && x < 112 + r && y > 32 - r && y < 96 + r);
  const clear = (x: number, y: number, tx: number, ty: number, r: number) =>
    free(x, y, r) && free(tx, ty, r) && !segmentHitsBox(x, y, tx, ty, 80 - r, 32 - r, 112 + r, 96 + r);
  const grid = new NavigationGrid(b, free, clear),
    out = { x: 0, y: 0 };
  for (const radius of [4, 6, 9, 12]) {
    let x = 32,
      y = 64,
      steps = 0;
    while (!clear(x, y, 160, 64, radius) && steps++ < 200) {
      expect(grid.steer(x, y, 160, 64, radius, out)).toBe(true);
      expect(clear(x, y, out.x, out.y, radius)).toBe(true);
      expect(Math.hypot(out.x - x, out.y - y)).toBeGreaterThan(0);
      x = out.x;
      y = out.y;
    }
    expect(steps).toBeLessThan(200);
    grid.invalidate();
  }
});
it('没有通路返回 false，不修改调用方已有输出', () => {
  const grid = new NavigationGrid(
      { x: 0, y: 0, width: 32, height: 32 },
      () => false,
      () => false,
    ),
    out = { x: 7, y: 8 };
  expect(grid.steer(0, 0, 30, 30, 6, out)).toBe(false);
  expect(out).toEqual({ x: 7, y: 8 });
});
