import { describe, expect, it } from 'vitest';
import { stepVelocity, type MoveTuning } from '../../../src/sim/combat/movement';

const tuning: MoveTuning = { maxSpeed: 90, accelTime: 0.06, decelTime: 0.08 };
const DT = 1 / 120;

/** 按固定步长推进，直到速度满足条件，返回所用时间（秒）。 */
function timeUntil(vel: { x: number; y: number }, move: { x: number; y: number }, done: () => boolean) {
  let t = 0;
  while (!done() && t < 2) {
    stepVelocity(vel, move, tuning, DT);
    t += DT;
  }
  return t;
}

describe('stepVelocity', () => {
  it('在 accelTime 内从静止加速到最高速度', () => {
    const vel = { x: 0, y: 0 };
    const t = timeUntil(vel, { x: 1, y: 0 }, () => vel.x >= 90);
    expect(Math.abs(t - 0.06)).toBeLessThan(DT * 1.5);
    expect(vel).toEqual({ x: 90, y: 0 });
  });

  it('松开后在 decelTime 内减速到 0', () => {
    const vel = { x: 90, y: 0 };
    const t = timeUntil(vel, { x: 0, y: 0 }, () => vel.x === 0);
    expect(Math.abs(t - 0.08)).toBeLessThan(DT * 1.5);
    expect(vel).toEqual({ x: 0, y: 0 });
  });

  it('斜向移动不会比直线更快', () => {
    const vel = { x: 0, y: 0 };
    const s = Math.SQRT1_2;
    timeUntil(vel, { x: s, y: s }, () => false);
    expect(Math.hypot(vel.x, vel.y)).toBeLessThanOrEqual(90 + 1e-9);
    expect(Math.hypot(vel.x, vel.y)).toBeGreaterThan(89.99);
  });

  it('输入长度超过 1 时按 1 处理', () => {
    const vel = { x: 0, y: 0 };
    stepVelocity(vel, { x: 3, y: 4 }, { maxSpeed: 90, accelTime: 0, decelTime: 0 }, DT);
    expect(Math.hypot(vel.x, vel.y)).toBeCloseTo(90, 9);
  });

  it('加速、减速时间为 0 时立刻到达目标速度', () => {
    const instant: MoveTuning = { maxSpeed: 50, accelTime: 0, decelTime: 0 };
    const vel = { x: 0, y: 0 };
    stepVelocity(vel, { x: 0, y: -1 }, instant, DT);
    expect(vel).toEqual({ x: 0, y: -50 });
    stepVelocity(vel, { x: 0, y: 0 }, instant, DT);
    expect(vel.x === 0 && vel.y === 0).toBe(true);
  });

  it('原地修改并返回同一个对象', () => {
    const vel = { x: 0, y: 0 };
    expect(stepVelocity(vel, { x: 1, y: 0 }, tuning, DT)).toBe(vel);
  });
});
