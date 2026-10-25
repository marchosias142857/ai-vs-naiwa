import type { HubDef } from './schema/hub';
/** 大厅地牢门与天赋祭台；坐标沿用 480×270 的世界空间。 */
export const HUB = {
  spawn: { x: 240, y: 170 },
  door: { x: 240, y: 62 },
  altar: { x: 156, y: 146 },
  reach: 36,
} as const satisfies HubDef;
