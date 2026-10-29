import { expect, it } from 'vitest';
import { TouchState } from '../../../src/game/input/TouchState';

it('布局移动并缩放后命中跟随新位置，旧位置失效；两指远拖和抬手独立', () => {
  const t = new TouchState();
  t.resize(900, 400);
  t.configure({ x: 160, y: 240, width: 120 }, { x: 600, y: 240, width: 160 });
  expect(t.down(1, 812, 312)).toBe(false);
  expect(t.down(-1, 600, 240)).toBe(true);
  t.drag(-1, 560, 240);
  expect(t.aim).toEqual({ x: -1, y: 0 });
  expect(t.sampleFire()).toBe(true);
  expect(t.down(2, 160, 240)).toBe(true);
  t.drag(2, 800, 240);
  expect(t.move).toEqual({ x: 1, y: 0 });
  expect(t.x).toBe(160);
  t.up(2);
  expect(t.move.x).toBe(0);
  expect(t.sampleFire()).toBe(true);
  t.up(-1);
  expect(t.sampleFire()).toBe(false);
  t.configure({ x: 200, y: 200, width: 104 }, { x: 700, y: 200, width: 112 });
  expect(t.x).toBe(200);
  expect(t.fireId).toBeNull();
});
