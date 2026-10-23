import { describe, expect, it } from 'vitest';
import { createInputFrame, resetInputFrame } from '../../src/sim/core/types';

describe('InputFrame', () => {
  it('新建时为「无输入」', () => {
    expect(createInputFrame('touch')).toEqual({
      move: { x: 0, y: 0 },
      aim: null,
      fire: false,
      skillPressed: false,
      swapPressed: false,
      interactPressed: false,
      pausePressed: false,
      source: 'touch',
    });
  });

  it('reset 清空输入、保留来源，且复用同一对象', () => {
    const frame = createInputFrame('gamepad');
    const move = frame.move;
    frame.move.x = 1;
    frame.aim = { x: 0, y: 1 };
    frame.fire = true;
    frame.pausePressed = true;
    const same = resetInputFrame(frame);
    expect(same).toBe(frame);
    expect(frame.move).toBe(move);
    expect(frame).toEqual(createInputFrame('gamepad'));
  });
});
