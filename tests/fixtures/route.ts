import { ROOM_RULES } from '../../src/data/rooms';
import type { DemoSession } from '../../src/game/systems/DemoSession';
import { GRAYBOX_BOUNDS as B } from '../../src/game/world/graybox';
import type { InputFrame } from '../../src/sim/core/types';

/** 房间中心（出口、宝箱等交互点所在）。 */
export const ROOM_CENTER = { x: B.x + B.width / 2, y: B.y + B.height / 2 } as const;

/**
 * 真实物理走到 `(x, y)`：直线被内墙或鱼雷桶挡住时，按房间导航（与怪物共用 `RoomArena.steer`）绕开。
 * 只写移动输入、每步调用 `step`，不改 sim 或物理位置。走到 2 像素内返回 true。
 */
export function walkTo(
  session: DemoSession,
  input: InputFrame,
  step: () => void,
  x: number,
  y: number,
  limit = 600,
): boolean {
  const waypoint = { x: 0, y: 0 };
  let arrived = false;
  for (let i = 0; i < limit; i++) {
    const p = session.player!;
    if (Math.hypot(x - p.x, y - p.y) < 2) {
      arrived = true;
      break;
    }
    const detour = session.arena.steer(p.x, p.y, x, y, p.radius, waypoint),
      dx = (detour ? waypoint.x : x) - p.x,
      dy = (detour ? waypoint.y : y) - p.y,
      n = Math.hypot(dx, dy) || 1;
    input.move.x = dx / n;
    input.move.y = dy / n;
    step();
  }
  input.move.x = input.move.y = 0;
  return arrived;
}

/**
 * 通往相邻房间那扇门内侧的入场点：从那扇门进来的角色就站在这里，内墙与机关都保证不压住它，
 * 并且正对门洞中心，从这里沿门的方向直走就能穿门。`dx`、`dy` 是目标房间相对当前房间的格子方向。
 */
export function doorStage(dx: number, dy: number): { x: number; y: number } {
  return {
    x: ROOM_CENTER.x + Math.sign(dx) * (B.width / 2 - ROOM_RULES.entranceInset),
    y: ROOM_CENTER.y + Math.sign(dy) * (B.height / 2 - ROOM_RULES.entranceInset),
  };
}
