import type { Vec2 } from '../core/types';
import type { ActorView } from '../combat/api';

/**
 * 追击行为：朝目标直线移动，同时与身边的同伴保持距离（原地写入 `out`，不分配对象）。
 *
 * 分离力：对每个距离小于 `separation` 的同伴，按「越近推得越用力」叠加一个反向推力，
 * 再与追击方向合成并归一到 `speed`。这样一群怪追上来时会散开，而不是叠成一团。
 *
 * @param self 自己
 * @param target 追击目标；为 null 时只做分离（站定但不互相重叠）
 * @param others 场上全部实体（会跳过自己、非同阵营、非活动阶段的实体）
 */
export function chaseVelocity(
  out: Vec2,
  self: ActorView,
  target: Readonly<Vec2> | null,
  others: readonly ActorView[],
  speed: number,
  separation: number,
): Vec2 {
  let dx = 0;
  let dy = 0;
  if (target) {
    const tx = target.x - self.x;
    const ty = target.y - self.y;
    const d = Math.hypot(tx, ty);
    // 已经贴住目标（重叠半径之内）时不再往里挤，接触伤害由碰撞负责。
    if (d > self.radius) {
      dx = tx / d;
      dy = ty / d;
    }
  }
  if (separation > 0) {
    for (const o of others) {
      if (o === self || o.team !== self.team || o.phase !== 'active') continue;
      const ox = self.x - o.x;
      const oy = self.y - o.y;
      const d = Math.hypot(ox, oy);
      if (d >= separation) continue;
      // 完全重合时用编号决定推开方向，保证结果可复现。
      const nx = d > 0 ? ox / d : self.id < o.id ? -1 : 1;
      const ny = d > 0 ? oy / d : 0;
      const push = 1 - d / separation;
      dx += nx * push;
      dy += ny * push;
    }
  }
  const len = Math.hypot(dx, dy);
  if (len === 0) {
    out.x = 0;
    out.y = 0;
  } else {
    const k = Math.min(1, len) / len;
    out.x = dx * k * speed;
    out.y = dy * k * speed;
  }
  return out;
}
