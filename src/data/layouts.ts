import type { RoomLayouts } from './schema/layouts';

/** 相对房间中心的灰盒内墙；保留四条门口通道和角落出生区。 */
export const ROOM_LAYOUTS = [
  [],
  [
    { x: -64, y: -36, width: 24, height: 24 },
    { x: 64, y: 36, width: 24, height: 24 },
  ],
  [
    { x: -64, y: 36, width: 24, height: 24 },
    { x: 64, y: -36, width: 24, height: 24 },
  ],
  [
    { x: -70, y: -40, width: 20, height: 20 },
    { x: 70, y: -40, width: 20, height: 20 },
    { x: -70, y: 40, width: 20, height: 20 },
    { x: 70, y: 40, width: 20, height: 20 },
  ],
] as const satisfies RoomLayouts;

/** Boss 房的四根石柱（ADR 0029）：引 Boss 冲撞撞柱会让它眩晕；离门口和墙边都留出通道。 */
export const BOSS_ROOM_LAYOUT = [
  { x: -76, y: -42, width: 22, height: 22 },
  { x: 76, y: -42, width: 22, height: 22 },
  { x: -76, y: 42, width: 22, height: 22 },
  { x: 76, y: 42, width: 22, height: 22 },
] as const satisfies RoomLayouts[number];
