import type { HubDef } from './schema/hub';
/** 大厅只有门可交互；坐标沿用 480×270 的世界空间。 */
export const HUB = {
  spawn: { x: 240, y: 170 },
  door: { x: 240, y: 62 },
  reach: 36,
} as const satisfies HubDef;
