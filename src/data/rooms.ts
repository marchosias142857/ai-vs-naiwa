import type { RoomRules } from './schema/rooms';

export const ROOM_RULES = {
  waves: [2, 3],
  waveDelay: 1,
  floorExtra: 1,
  doorHalfWidth: 18,
  entranceInset: 24,
  exitReach: 18,
} as const satisfies RoomRules;
