import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../../../src/data/weapons';
import { Random } from '../../../src/sim/core/Random';
import { getPattern, registerPattern, type BulletSink } from '../../../src/sim/weapons/patterns';

function collect(limit = Infinity) {
  const angles: number[] = [];
  const sink: BulletSink = {
    add: (_x, _y, angle) => {
      if (angles.length >= limit) return false;
      angles.push(angle);
      return true;
    },
  };
  return { angles, sink };
}

describe('弹道注册表', () => {
  it('single：每次开火生成 pellets 颗，偏转在 ±spread/2 内', () => {
    const weapon = { ...WEAPONS.pistol_basic, pellets: 5, spread: 30 };
    const { angles, sink } = collect();
    const single = getPattern('single');
    for (let i = 0; i < 200; i++) single({ x: 0, y: 0, aim: 1, weapon, rng: new Random(i) }, sink);
    expect(angles.length).toBe(1000);
    const half = (30 * Math.PI) / 180 / 2;
    for (const a of angles) {
      expect(a).toBeGreaterThanOrEqual(1 - half);
      expect(a).toBeLessThanOrEqual(1 + half);
    }
  });

  it('single：散布为 0 时完全朝向瞄准方向，且不消耗随机数', () => {
    const weapon = { ...WEAPONS.pistol_basic, spread: 0 };
    const rng = new Random(9);
    const before = rng.snapshot;
    const { angles, sink } = collect();
    getPattern('single')({ x: 0, y: 0, aim: 0.5, weapon, rng }, sink);
    expect(angles).toEqual([0.5]);
    expect(rng.snapshot).toBe(before);
  });

  it('sink 满了就停止生成', () => {
    const weapon = { ...WEAPONS.pistol_basic, pellets: 6 };
    const { angles, sink } = collect(2);
    getPattern('single')({ x: 0, y: 0, aim: 0, weapon, rng: new Random(1) }, sink);
    expect(angles.length).toBe(2);
  });

  it('同一种子得到同样的散布', () => {
    const weapon = { ...WEAPONS.pistol_basic, spread: 20, pellets: 3 };
    const a = collect();
    const b = collect();
    getPattern('single')({ x: 0, y: 0, aim: 0, weapon, rng: new Random(42) }, a.sink);
    getPattern('single')({ x: 0, y: 0, aim: 0, weapon, rng: new Random(42) }, b.sink);
    expect(a.angles).toEqual(b.angles);
  });

  it('未实现的弹道报错并指出名称；重复注册报错', () => {
    expect(() => getPattern('homing')).toThrow(/homing/);
    expect(() => registerPattern('single', () => undefined)).toThrow(/single/);
  });
});
