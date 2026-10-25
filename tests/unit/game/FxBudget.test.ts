import { describe, expect, it } from 'vitest';
import { FxBudget } from '../../../src/game/fx/FxBudget';
import { FX_LIMITS } from '../../../src/game/fx/params';

const view = {
  scrollX: 100,
  scrollY: 50,
  width: 300,
  height: 180,
  zoomX: 1,
  zoomY: 1,
  originX: 0,
  originY: 0,
  matrix: { b: 0, c: 0 },
};
describe('装饰特效预算', () => {
  it('事件风暴有界；火花不能耗尽爆炸和闪电额度，不积压到下一帧', () => {
    const budget = new FxBudget();
    for (const kind of ['spark', 'burst', 'chain'] as const) {
      let accepted = 0;
      for (let i = 0; i < 10000; i++) accepted += Number(budget.admit(kind, view, 200, 100, 5));
      expect(accepted).toBe(FX_LIMITS[kind]);
    }
    expect(budget.accepted).toBe(80);
    expect(budget.dropped).toBe(29920);
    budget.beginFrame();
    expect(budget.admit('spark', view, 200, 100, 5)).toBe(true);
    expect(budget.accepted).toBe(81);
  });
  it('只剔除完全在屏外的装饰，跨屏大圆和边缘留量仍可见', () => {
    const budget = new FxBudget();
    expect(budget.admit('spark', view, -1000, 100, 2)).toBe(false);
    expect(budget.culled).toBe(1);
    expect(budget.dropped).toBe(0);
    expect(budget.visible(view, 0, 100, 100)).toBe(true);
    expect(budget.visible(view, 60, 100, 8)).toBe(true);
    expect(budget.visible(view, 59, 100, 8)).toBe(false);
    expect(budget.visible({ ...view, width: 0 }, 0, 0, 1)).toBe(true);
  });
  it('1080p 左上角原点和 6 倍跟随镜头使用真实可见范围', () => {
    const budget = new FxBudget();
    const camera = { ...view, width: 1920, height: 1080, zoomX: 6, zoomY: 6 };
    expect(budget.visible(camera, 240, 135, 4)).toBe(true);
    expect(budget.visible(camera, 900, 500, 4)).toBe(false);
    expect(budget.visible({ ...camera, originX: 0.5, originY: 0.5 }, 240, 135, 4)).toBe(false);
    expect(budget.visible({ ...camera, matrix: { b: 0.1, c: 0 } }, 240, 135, 4)).toBe(true);
  });
});
