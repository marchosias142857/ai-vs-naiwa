import { describe, expect, it } from 'vitest';
import { INPUT_UI as UI } from '../../../src/game/fx/params';
import { TouchState } from '../../../src/game/input/TouchState';

function setup() {
  const touch = new TouchState();
  touch.resize(800, 450);
  return { touch, x: touch.width - UI.aimWheel.inset, y: touch.height - UI.aimWheel.inset };
}

describe('固定开火轮盘', () => {
  it('中心按下同一采样即开火；松手和重置立即清空', () => {
    const { touch: t, x, y } = setup();
    t.down(1, x, y);
    expect(t.sampleFire()).toBe(true);
    expect(t.aiming).toBe(false);
    expect(t.aim).toEqual({ x: 0, y: 0 });
    t.up(1);
    expect(t.sampleFire()).toBe(false);
    t.down(2, x, y);
    expect(t.sampleFire()).toBe(true);
    t.reset();
    expect(t.sampleFire()).toBe(false);
  });

  it.each([1e-10, 0.001, 0.25, 6, 56])('初次按下及拖动的非零偏移 %s 无瞄准死区', (offset) => {
    const { touch: t, x, y } = setup();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [0.6, -0.8],
    ]) {
      t.down(1, x + dx! * offset, y + dy! * offset);
      expect(t.sampleFire()).toBe(true);
      expect(t.aiming).toBe(true);
      expect(Math.hypot(t.aim.x, t.aim.y)).toBeCloseTo(1, 12);
      // 极小值按浏览器实际可表示的坐标差计算，不人为另设 epsilon。
      const actualX = x + dx! * offset - x,
        actualY = y + dy! * offset - y;
      expect(t.aim.x).toBeCloseTo(actualX / Math.hypot(actualX, actualY), 12);
      expect(t.aim.y).toBeCloseTo(actualY / Math.hypot(actualX, actualY), 12);
      t.drag(1, x, y);
      expect(t.aiming).toBe(false);
      expect(t.sampleFire()).toBe(true);
      t.drag(1, x + offset, y);
      expect(t.aim).toEqual({ x: 1, y: 0 });
      t.up(1);
    }
  });

  it('自定义尺寸不引入瞄准死区，左摇杆仍保留原死区', () => {
    const { touch: t } = setup();
    t.configure({ x: 100, y: 300, width: 104 }, { x: 600, y: 300, width: 180 });
    t.down(1, 600.001, 300);
    expect(t.sampleFire()).toBe(true);
    expect(t.aim).toEqual({ x: 1, y: 0 });
    t.down(2, 100.001, 300);
    expect(t.move).toEqual({ x: 0, y: 0 });
  });

  it('按下范围包含额外边距；基座固定，远拖仍保持方向且摇杆头限幅', () => {
    const { touch: t, x, y } = setup(),
      reach = UI.aimWheel.radius + UI.aimWheel.hitPadding;
    expect(t.down(1, x + reach + 1, y)).toBe(false);
    expect(t.down(1, x + reach, y)).toBe(true);
    const aim = t.aim;
    t.drag(1, x - UI.aimWheel.radius * 3, y - UI.aimWheel.radius * 4);
    expect(t.aim).toBe(aim);
    expect(t.aim.x).toBeCloseTo(-0.6);
    expect(t.aim.y).toBeCloseTo(-0.8);
    expect(Math.hypot(t.fireDx, t.fireDy)).toBeCloseTo(UI.aimWheel.radius);
    t.drag(1, x, y - UI.aimWheel.radius);
    expect(t.aim).toEqual({ x: 0, y: -1 });
  });

  it('只由所属手指控制，与移动、暂停及其他手指互不串扰', () => {
    const { touch: t, x, y } = setup(),
      mx = UI.joystick.homeInset,
      my = t.height - UI.joystick.homeInset;
    t.down(1, mx, my);
    t.drag(1, mx + UI.joystick.radius, my);
    t.down(2, x, y - UI.aimWheel.radius);
    expect(t.down(3, x, y)).toBe(false);
    t.drag(3, x + UI.aimWheel.radius, y);
    t.up(3);
    expect(t.fireId).toBe(2);
    expect(t.aim).toEqual({ x: 0, y: -1 });
    t.down(4, t.width - UI.pause.inset, UI.pause.inset);
    expect(t.pausePressed).toBe(true);
    t.up(2);
    expect(t.move).toEqual({ x: 1, y: 0 });
    expect(t.aiming).toBe(false);
    expect(t.fireDx).toBe(0);
    expect(t.fireDy).toBe(0);
  });

  it('释放、暂停重置与尺寸变化清空；旧手指移动不能恢复射击', () => {
    const { touch: t, x, y } = setup();
    for (const clear of [() => t.up(1), () => t.reset(), () => t.resize(700, 390)]) {
      t.resize(800, 450);
      t.down(1, x, y - UI.aimWheel.radius);
      t.resize(800, 450);
      expect(t.aiming).toBe(true);
      clear();
      t.drag(1, x, y - UI.aimWheel.radius);
      expect(t.fireId).toBeNull();
      expect(t.aiming).toBe(false);
      expect(t.aim).toEqual({ x: 0, y: 0 });
      expect(t.fireDx).toBe(0);
      expect(t.fireDy).toBe(0);
    }
  });
});
