import { expect, it } from 'vitest';
import { TouchState } from '../../../src/game/input/TouchState';
import { INPUT_UI } from '../../../src/game/fx/params';

it('房间侧栏不接管战斗视口触点；远拖时摇杆仍留在侧栏，抬手停止', () => {
  const t = new TouchState();
  t.resize(844, 390);
  t.moveWidth = 160;
  expect(t.down(1, 200, 280)).toBe(false);
  expect(t.down(1, 80, 80)).toBe(false);
  expect(t.down(1, 100, 290)).toBe(true);
  t.drag(1, 600, 280);
  expect(t.move.x).toBeGreaterThan(0.9);
  expect(t.x + INPUT_UI.joystick.radius).toBeLessThanOrEqual(160);
  t.drag(1, -400, -400);
  expect(t.x - INPUT_UI.joystick.radius).toBeGreaterThanOrEqual(0);
  expect(t.y - INPUT_UI.joystick.radius).toBeGreaterThanOrEqual(t.height / 2);
  t.up(1);
  expect(t.move).toEqual({ x: 0, y: 0 });
  expect(t.moveId).toBeNull();
});
