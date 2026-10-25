import type { TrapView } from '../../sim/combat/api';
import { standingBarrel } from '../../sim/room/Traps';

/** 一个机关槽位上鱼雷桶碰撞体当前的摆放（ADR 0032）。 */
export interface BarrelBody {
  on: boolean;
  x: number;
  y: number;
  size: number;
}

/** 预热用的空记录：碰撞体关着。 */
export function newBarrelBody(): BarrelBody {
  return { on: false, x: 0, y: 0, size: 0 };
}

/**
 * 按槽位当前的机关更新碰撞体记录，返回这一步要做的事：
 * `place` 开启或挪到记录里的新位置，`remove` 关掉，`keep` 不动。
 * 换房后同一槽位可能换成别处的桶，所以除了立起与爆掉，位置或大小变了也要重新摆放。
 */
export function syncBarrelBody(
  body: BarrelBody,
  trap: Readonly<TrapView> | undefined,
  scale: number,
): 'place' | 'remove' | 'keep' {
  if (trap && standingBarrel(trap)) {
    const size = trap.radius * scale;
    if (body.on && body.x === trap.x && body.y === trap.y && body.size === size) return 'keep';
    body.on = true;
    body.x = trap.x;
    body.y = trap.y;
    body.size = size;
    return 'place';
  }
  if (!body.on) return 'keep';
  body.on = false;
  return 'remove';
}
