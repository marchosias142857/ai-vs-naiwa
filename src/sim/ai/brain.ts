import { BALANCE } from '../../data/balance';
import type { EnemyDef } from '../../data/schema';
import type { ActorView } from '../combat/api';
import type { Vec2 } from '../core/types';
import { chaseVelocity } from './chase';

export interface EnemyBrain {
  cooldown: number;
  stage: 'ready' | 'windup' | 'dash' | 'recover';
  time: number;
  dirX: number;
  dirY: number;
}
/** 出生时预留；每步原地更新，不创建行为对象或闭包。 */
export function createBrain(): EnemyBrain {
  return { cooldown: BALANCE.spawnTelegraph, stage: 'ready', time: 0, dirX: 0, dirY: 0 };
}
/** 追击、保持距离、炮台、锁定方向后冲锋；死亡后只保留分离行为。 */
export function moveEnemy(
  out: Vec2,
  self: ActorView,
  target: ActorView | null,
  others: readonly ActorView[],
  def: Readonly<EnemyDef>,
  brain: EnemyBrain,
  dt: number,
  speedScale = 1,
): void {
  brain.cooldown -= dt;
  if (!target || def.behavior === 'chase') {
    chaseVelocity(out, self, target, others, def.moveSpeed * speedScale, BALANCE.enemySeparation);
    return;
  }
  out.x = out.y = 0;
  const dx = target.x - self.x,
    dy = target.y - self.y,
    distance = Math.hypot(dx, dy);
  if (def.behavior === 'keep_distance') {
    const desired = def.desiredRange ?? self.radius;
    const direction = distance < desired ? -1 : distance > desired + BALANCE.enemySeparation ? 1 : 0;
    if (distance > 0) {
      out.x = (dx / distance) * def.moveSpeed * direction * speedScale;
      out.y = (dy / distance) * def.moveSpeed * direction * speedScale;
    }
  }
  if (def.behavior !== 'charge_dash' || !def.dash) return;
  const dash = def.dash;
  brain.time -= dt;
  if (brain.stage === 'ready') {
    brain.stage = 'windup';
    brain.time = dash.windup;
    brain.dirX = distance > 0 ? dx / distance : 1;
    brain.dirY = distance > 0 ? dy / distance : 0;
  } else if (brain.time <= 0) {
    if (brain.stage === 'windup') {
      brain.stage = 'dash';
      brain.time = dash.duration;
    } else if (brain.stage === 'dash') {
      brain.stage = 'recover';
      brain.time = dash.recovery;
    } else {
      brain.stage = 'ready';
    }
  }
  if (brain.stage === 'dash') {
    out.x = brain.dirX * dash.speed;
    out.y = brain.dirY * dash.speed;
  }
}
