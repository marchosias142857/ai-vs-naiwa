import { describe, expect, it } from 'vitest';
import { INPUT_UI as UI } from '../../../src/game/fx/params';
import { TouchState } from '../../../src/game/input/TouchState';

function setup() {
  const touch = new TouchState();
  touch.resize(800, 450);
  return { touch, x: touch.width - UI.aimWheel.inset, y: touch.height - UI.aimWheel.inset };
}

describe('固定开火轮盘', () => {
  it('每次按下等待 120 ms，死区内抖动不提前开火；松手和重置取消等待', () => {
    const { touch: t, x, y } = setup(),
      delay = UI.aimWheel.firstShotDelayMs;
    t.down(1, x, y, 0);
    expect(t.sampleFire(0)).toBe(false);
    t.drag(1, x + UI.aimWheel.deadzone, y);
    expect(t.sampleFire(delay - 1)).toBe(false);
    expect(t.sampleFire(delay)).toBe(true);
    expect(t.sampleFire(delay + 1)).toBe(true);
    t.up(1);
    expect(t.sampleFire(delay + 2)).toBe(false);
    t.down(2, x, y, delay + 2);
    expect(t.sampleFire(delay + 3)).toBe(false);
    t.reset();
    expect(t.sampleFire(delay * 10)).toBe(false);
  });

  it('拖出死区在同一采样帧确定方向并开火，回中持续射击', () => {
    const { touch: t, x, y } = setup();
    t.down(1, x, y, 0);
    t.drag(1, x - UI.aimWheel.radius, y);
    expect(t.sampleFire(1)).toBe(true);
    expect(t.aim).toEqual({ x: -1, y: 0 });
    t.drag(1, x, y);
    expect(t.sampleFire(2)).toBe(true);
    expect(t.aiming).toBe(false);
  });

  it('偏离圆心按下不立即开火；采样前出圈又回中仍等反应时间', () => {
    const { touch: t, x, y } = setup();
    t.down(1, x + UI.aimWheel.radius, y, 0);
    expect(t.sampleFire(1)).toBe(false);
    t.drag(1, x - UI.aimWheel.radius, y);
    t.drag(1, x, y);
    expect(t.sampleFire(2)).toBe(false);
    t.up(1);
    expect(t.sampleFire(UI.aimWheel.firstShotDelayMs)).toBe(false);
  });

  it('按住中心或死区时只开火；超出死区输出单位方向，回中后取消瞄准', () => {
    const { touch: t, x, y } = setup();
    expect(t.down(1, x, y)).toBe(true);
    expect(t.fireId).toBe(1);
    expect(t.aiming).toBe(false);
    t.drag(1, x + UI.aimWheel.deadzone, y);
    expect(t.aiming).toBe(false);
    t.drag(1, x + UI.aimWheel.deadzone + 1, y);
    expect(t.aiming).toBe(true);
    expect(t.aim).toEqual({ x: 1, y: 0 });
    t.drag(1, x, y);
    expect(t.fireId).toBe(1);
    expect(t.aiming).toBe(false);
    expect(t.aim).toEqual({ x: 0, y: 0 });
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
