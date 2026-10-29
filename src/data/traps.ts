import { ROOM_METRICS } from './roomTemplates/metrics';
import type { TrapRules } from './schema/traps';

/** 房间机关的规则数值（ADR 0032）。demo 初值，负责人试玩后调整。 */
export const TRAP_RULES = {
  spikes: { rest: 1.6, warn: 0.6, up: 0.8, damage: 2 },
  current: { speed: 55 },
  weed: { slow: 0.55 },
  mine: { radius: ROOM_METRICS.mineRadius, fuse: 0.45, blast: 30, damage: 6, knockback: 14, rearm: 5 },
  barrel: { radius: ROOM_METRICS.barrelRadius, hp: 8, blast: 34, damage: 8, knockback: 16 },
} as const satisfies TrapRules;
