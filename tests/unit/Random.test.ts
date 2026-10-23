import { describe, expect, it } from 'vitest';
import { Random, hashString } from '../../src/sim/core/Random';

const sample = (r: Random, n: number) => Array.from({ length: n }, () => r.next());

describe('Random', () => {
  it('同一种子产生完全相同的序列', () => {
    expect(sample(new Random(12345), 50)).toEqual(sample(new Random(12345), 50));
  });

  it('不同种子产生不同序列', () => {
    expect(sample(new Random(1), 10)).not.toEqual(sample(new Random(2), 10));
  });

  it('next() 落在 [0, 1)', () => {
    const r = new Random(7);
    for (const v of sample(r, 10_000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() 两端都包含且不越界', () => {
    const r = new Random(99);
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('int() 参数反了会报错', () => {
    expect(() => new Random(1).int(5, 1)).toThrow(RangeError);
  });

  it('分布大致均匀（10 个桶，每桶偏差 < 10%）', () => {
    const r = new Random(2024);
    const buckets = new Array<number>(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(r.next() * 10)]! += 1;
    for (const b of buckets) expect(Math.abs(b - n / 10) / (n / 10)).toBeLessThan(0.1);
  });

  it('weighted() 按权重抽取，权重为 0 的永远抽不到', () => {
    const r = new Random(5);
    const counts = { a: 0, b: 0, never: 0 };
    for (let i = 0; i < 20_000; i++) {
      const k = r.weighted([
        { item: 'a' as const, weight: 3 },
        { item: 'b' as const, weight: 1 },
        { item: 'never' as const, weight: 0 },
      ]);
      counts[k] += 1;
    }
    expect(counts.never).toBe(0);
    expect(counts.a / counts.b).toBeGreaterThan(2.6);
    expect(counts.a / counts.b).toBeLessThan(3.4);
  });

  it('pick() 空数组报错', () => {
    expect(() => new Random(1).pick([])).toThrow(RangeError);
  });

  it('shuffle() 保留全部元素', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect([...new Random(3).shuffle([...items])].sort()).toEqual(items);
  });

  it('fork() 可复现，且不同 label 得到不同的流', () => {
    const a1 = new Random(42).fork('loot');
    const a2 = new Random(42).fork('loot');
    const b = new Random(42).fork('dungeon');
    const s1 = sample(a1, 20);
    expect(s1).toEqual(sample(a2, 20));
    expect(s1).not.toEqual(sample(b, 20));
  });

  it('snapshot 可用于恢复状态', () => {
    const r = new Random(77);
    sample(r, 13);
    const restored = new Random(r.snapshot);
    expect(sample(restored, 10)).toEqual(sample(r, 10));
  });

  it('hashString() 稳定', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});
