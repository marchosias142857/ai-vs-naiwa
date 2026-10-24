import { expect, it } from 'vitest';
import { InputState } from '../../../src/game/input/InputState';
it('触屏动作保留设备，边沿只在一个渲染帧有效', () => {
  const s = new InputState();
  s.frame.source = 'touch';
  s.action('Space');
  s.action('KeyQ');
  s.action('KeyE');
  expect(s.sample()).toMatchObject({
    source: 'touch',
    skillPressed: true,
    swapPressed: true,
    interactPressed: true,
  });
  expect(s.sample()).toMatchObject({ skillPressed: false, swapPressed: false, interactPressed: false });
});
it('手柄 B/Y/A 按住不重复，释放再按产生新边沿，reset 后需回中', () => {
  const s = new InputState();
  s.sample();
  expect(s.sample(0, 0, 0, 0, false, false, true, true, true)).toMatchObject({
    source: 'gamepad',
    skillPressed: true,
    swapPressed: true,
    interactPressed: true,
  });
  expect(s.sample(0, 0, 0, 0, false, false, true, true, true).skillPressed).toBe(false);
  s.reset();
  expect(s.sample(0, 0, 0, 0, false, false, true).skillPressed).toBe(false);
  s.sample();
  expect(s.sample(0, 0, 0, 0, false, false, true).skillPressed).toBe(true);
});
