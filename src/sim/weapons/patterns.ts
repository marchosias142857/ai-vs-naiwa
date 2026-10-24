import type { FirePatternId, WeaponDef } from '../../data/schema';
import type { Random } from '../core/Random';

/** 开火时的输入。由 CombatWorld 复用同一个对象传入。 */
export interface FireContext {
  /** 枪口位置，世界坐标，像素。 */
  x: number;
  y: number;
  /** 瞄准方向，弧度。 */
  aim: number;
  weapon: Readonly<WeaponDef>;
  /** 散布用的随机流（与暴击、AI 的随机流分开）。 */
  rng: Random;
  /** 连发调度器可将单次输出限制为一颗，避免创建临时武器对象。 */
  pelletCount?: number;
}

/** 弹道往这里写入要生成的子弹，避免每次开火都新建数组。 */
export interface BulletSink {
  /** 生成一颗子弹；返回 false 表示已达上限，调用方应停止继续生成。 */
  add(x: number, y: number, angle: number): boolean;
}

/** 弹道：决定一次开火生成几颗子弹、各朝什么方向。 */
export type FirePattern = (ctx: Readonly<FireContext>, sink: BulletSink) => void;

const DEG = Math.PI / 180;

/** `single`：每颗弹丸从枪口出发，在 ±spread/2 度内随机偏转。 */
const single: FirePattern = (ctx, sink) => {
  const half = (ctx.weapon.spread * DEG) / 2;
  for (let i = 0; i < (ctx.pelletCount ?? ctx.weapon.pellets); i++) {
    const angle = half > 0 ? ctx.aim + ctx.rng.range(-half, half) : ctx.aim;
    if (!sink.add(ctx.x, ctx.y, angle)) return;
  }
};

const spread: FirePattern = (ctx, sink) => {
  const n = ctx.weapon.pellets;
  for (let i = 0; i < n; i++) {
    const offset = n === 1 ? 0 : (i / (n - 1) - 0.5) * ctx.weapon.spread * DEG;
    if (!sink.add(ctx.x, ctx.y, ctx.aim + offset)) return;
  }
};
const radial: FirePattern = (ctx, sink) => {
  for (let i = 0; i < ctx.weapon.pellets; i++)
    if (!sink.add(ctx.x, ctx.y, ctx.aim + (Math.PI * 2 * i) / ctx.weapon.pellets)) return;
};
const twin: FirePattern = (ctx, sink) => {
  for (let i = 0; i < ctx.weapon.pellets; i++) {
    const offset = (i - (ctx.weapon.pellets - 1) / 2) * ctx.weapon.bulletRadius * 2;
    if (!sink.add(ctx.x - Math.sin(ctx.aim) * offset, ctx.y + Math.cos(ctx.aim) * offset, ctx.aim)) return;
  }
};
const registry = new Map<FirePatternId, FirePattern>([
  ['single', single],
  ['spread', spread],
  ['radial', radial],
  ['twin', twin],
  ['burst', single],
  // 近战由 CombatWorld 锁步结算，绝不向子弹池写入。
  ['melee_arc', () => {}],
]);

/** 注册弹道（M3 起加入其余模式）。重复注册会报错，防止两处代码互相覆盖。 */
export function registerPattern(id: FirePatternId, pattern: FirePattern): void {
  if (registry.has(id)) throw new Error(`弹道 ${id} 已注册`);
  registry.set(id, pattern);
}

/** 取得弹道；尚未实现的模式会报错，并指出是哪一个。 */
export function getPattern(id: FirePatternId): FirePattern {
  const pattern = registry.get(id);
  if (!pattern) throw new Error(`弹道 ${id} 尚未实现（M1 只有 single）`);
  return pattern;
}
