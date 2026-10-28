import { LEGACY_V1 } from './roomTemplates/legacyV1';
import type { RoomTheme, TrapRules } from './schema/traps';

/** 房间机关的规则数值（ADR 0032）。demo 初值，负责人试玩后调整。 */
export const TRAP_RULES = {
  spikes: { rest: 1.6, warn: 0.6, up: 0.8, damage: 2 },
  current: { speed: 55 },
  weed: { slow: 0.55 },
  mine: { radius: LEGACY_V1.trapRadii.mine, fuse: 0.45, blast: 30, damage: 6, knockback: 14, rearm: 5 },
  barrel: { radius: LEGACY_V1.trapRadii.barrel, hp: 8, blast: 34, damage: 8, knockback: 16 },
} as const satisfies TrapRules;

/** Read-only compatibility view; no separately authored plan/placement data. */
export const ROOM_THEMES: readonly RoomTheme[] = Object.freeze(
  LEGACY_V1.themes.map(({ art, plans }) =>
    Object.freeze({
      art,
      plans: Object.freeze(plans.map(({ layout, traps }) => Object.freeze({ layout, traps }))),
    }),
  ),
);

/** 第 `floor` 层的房间主题；超出范围时用最后一项。 */
export function roomTheme(floor: number): RoomTheme {
  return ROOM_THEMES[Math.min(ROOM_THEMES.length, Math.max(1, floor)) - 1]!;
}
