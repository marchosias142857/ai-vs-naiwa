import type { Vec2 } from '../core/types';

/** 移动手感参数，来自角色数据（`CharacterDef`）。 */
export interface MoveTuning {
  /** 最高速度，像素/秒。 */
  maxSpeed: number;
  /** 从静止加速到最高速度的秒数；0 表示瞬间到达。 */
  accelTime: number;
  /** 从最高速度减到 0 的秒数；0 表示立刻停下。 */
  decelTime: number;
}

/**
 * 按输入方向更新速度（原地修改 `vel`，不分配对象）。
 *
 * - 有输入时，速度以「最高速度 ÷ 加速时间」的速率直线逼近目标速度 `move × maxSpeed`；
 *   转向也用同一速率，所以急转弯有一点点惯性，但不会打滑。
 * - 没有输入时，以「最高速度 ÷ 减速时间」的速率减速到 0。
 * - `move` 的长度应在 0–1 之间（InputFrame 已保证）；超过 1 时按 1 处理，斜向不会更快。
 */
export function stepVelocity(vel: Vec2, move: Readonly<Vec2>, tuning: MoveTuning, dt: number): Vec2 {
  let mx = move.x;
  let my = move.y;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  const moving = len > 0;
  const tx = mx * tuning.maxSpeed;
  const ty = my * tuning.maxSpeed;
  const time = moving ? tuning.accelTime : tuning.decelTime;
  if (time <= 0) {
    vel.x = tx;
    vel.y = ty;
    return vel;
  }
  const maxDelta = (tuning.maxSpeed / time) * dt;
  const dx = tx - vel.x;
  const dy = ty - vel.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxDelta) {
    vel.x = tx;
    vel.y = ty;
  } else {
    vel.x += (dx / dist) * maxDelta;
    vel.y += (dy / dist) * maxDelta;
  }
  return vel;
}
