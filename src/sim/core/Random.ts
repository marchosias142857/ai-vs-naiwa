import type { Seed } from './types';

/**
 * 带种子的伪随机数生成器（mulberry32）。
 *
 * 规则：项目中所有随机都必须来自 Random 实例，禁止 Math.random()（ESLint 会拦截）。
 * 同一种子 + 同样的调用顺序 = 同样的结果，Bug 复现只需要种子。
 *
 * 不同子系统用 fork() 派生独立的流，避免「掉落多抽了一次随机，导致地图全变了」。
 */
export class Random {
  private state: number;

  constructor(seed: Seed) {
    this.state = seed >>> 0;
  }

  /** 当前内部状态，用于存档；用 new Random(state) 可恢复。 */
  get snapshot(): number {
    return this.state;
  }

  /** [0, 1) 均匀分布。 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max) 实数。 */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** [min, max] 整数（两端都包含）。 */
  int(min: number, max: number): number {
    if (max < min) throw new RangeError(`int(${min}, ${max}): max < min`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 以概率 p 返回 true。 */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** 从非空数组中等概率取一个。 */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('pick() on empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** 按权重取一个；权重必须 >= 0 且总和 > 0。 */
  weighted<T>(entries: readonly { item: T; weight: number }[]): T {
    const total = entries.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
    if (total <= 0) throw new RangeError('weighted() needs a positive total weight');
    let roll = this.next() * total;
    for (const e of entries) {
      roll -= Math.max(0, e.weight);
      if (roll < 0) return e.item;
    }
    return (entries[entries.length - 1] as { item: T }).item;
  }

  /** 原地洗牌（Fisher–Yates），返回同一个数组。 */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  /** 派生一个独立的随机流。label 让不同用途得到不同的流，且与调用顺序无关。 */
  fork(label: string): Random {
    return new Random(hashString(label) ^ this.state);
  }
}

/** 字符串 → 32 位哈希（FNV-1a），用于 fork 与把文本种子转成数字。 */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 生成一个新的本局种子。这是全项目唯一允许读取「非确定性」来源的地方。
 */
export function freshSeed(): Seed {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0] ?? Date.now()) >>> 0;
}
