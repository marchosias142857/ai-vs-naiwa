import { expect, it } from 'vitest';
import { UI_KEYS, controlsOverlap, parseUiLayout, uiRect } from '../../../src/services/uiLayout';

it('空值、损坏字段、旧设置恢复默认；数值限制防止控件消失或超大', () => {
  const base = parseUiLayout(null);
  expect(parseUiLayout('broken')).toEqual(base);
  expect(parseUiLayout({ language: 'en', sound: false })).toEqual(base);
  const parsed = parseUiLayout({ fire: { x: -5, y: Infinity, scale: 99, opacity: 0 }, health: null });
  expect(parsed.fire).toEqual({ x: 0, y: null, scale: 1.5, opacity: 0.25 });
  expect(parsed.health).toEqual(base.health);
  expect(parseUiLayout({ move: { scale: NaN, opacity: 'bad' } }).move).toEqual(base.move);
});
it('默认横屏控制区彼此独立，编辑值会限制在小屏安全画布内', () => {
  for (const [w, h] of [
    [915, 412],
    [844, 390],
    [667, 375],
    [568, 320],
  ]) {
    expect(controlsOverlap(w!, h!, parseUiLayout(null))).toBe(false);
    const custom = parseUiLayout(
      Object.fromEntries(UI_KEYS.map((key) => [key, { x: 1, y: 0, scale: 1.5, opacity: 1 }])),
    );
    for (const key of UI_KEYS) {
      const r = uiRect(key, w!, h!, custom);
      expect(r.x + r.width / 2).toBeLessThanOrEqual(w! - 8);
      expect(r.y - r.height / 2).toBeGreaterThanOrEqual(8);
    }
    expect(controlsOverlap(w!, h!, custom)).toBe(true);
    const coversMap = parseUiLayout(null);
    coversMap.move.x = (w! - 150) / w!;
    coversMap.move.y = 70 / h!;
    expect(controlsOverlap(w!, h!, coversMap)).toBe(true);
  }
});
