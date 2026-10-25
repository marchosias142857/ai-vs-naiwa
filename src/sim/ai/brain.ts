import { BALANCE } from '../../data/balance';
import type { EnemyDef } from '../../data/schema';
import type { ActorMove, ActorView } from '../combat/api';
import type { Vec2 } from '../core/types';
import { chaseVelocity } from './chase';

/** 招式所处阶段。`time` 是本阶段剩余秒数，`span` 是本阶段总时长（ADR 0030）。 */
export type BrainStage =
  | 'ready'
  | 'windup'
  | 'dash'
  | 'recover'
  | 'air'
  | 'active'
  | 'buried'
  | 'emerge'
  | 'spin'
  | 'stun';
/** 当前阶段属于哪一招；`none` 表示常规移动与射击。 */
/** 与 api 的 ActorMove 相同（ADR 0030）。 */
export type BrainMove = ActorMove;

export interface EnemyBrain {
  cooldown: number;
  stage: BrainStage;
  time: number;
  dirX: number;
  dirY: number;
  move: BrainMove;
  span: number;
  /** 跳跃水平速度，像素/秒。 */
  speed: number;
  /** 距离下一次特殊招式（召唤、旋转、轮换招式）的秒数。 */
  special: number;
  /** 特殊招式轮换到第几个。 */
  next: number;
  /** 螺旋弹当前角度，弧度。 */
  angle: number;
  /** 横移方向 ±1 与距离下次换向的秒数。 */
  side: number;
  flip: number;
  /** 距离下一次放毒气的秒数。 */
  gas: number;
  /** 开火后的后坐表现剩余秒数，只影响 pose。 */
  shot: number;
  /** 上一步的位置：冲撞时用实际位移判断是否撞上障碍。 */
  px: number;
  py: number;
}
/** 出生时预留；每步原地更新，不创建行为对象或闭包。 */
export function createBrain(): EnemyBrain {
  const brain = {} as EnemyBrain;
  resetBrain(brain);
  return brain;
}
/** 复用实体记录时回到出生状态。 */
export function resetBrain(b: EnemyBrain): void {
  b.cooldown = BALANCE.spawnTelegraph;
  b.stage = 'ready';
  b.time = b.dirX = b.dirY = b.span = b.speed = b.next = b.angle = b.shot = b.px = b.py = 0;
  b.move = 'none';
  b.special = b.flip = b.gas = BALANCE.spawnTelegraph;
  b.side = 1;
}
/** 追击、保持距离、炮台、锁定方向后冲锋（可先追到 trigger 距离内）；死亡后只保留分离行为。 */
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
  if (brain.stage === 'ready' && dash.trigger !== undefined && distance > dash.trigger) {
    chaseVelocity(out, self, target, others, def.moveSpeed * speedScale, BALANCE.enemySeparation);
    return;
  }
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
