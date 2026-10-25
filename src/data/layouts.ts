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
  // ADR 0032 起新增的布局：中央掩体、上下两道长廊、一圈柱子、两角 L 形墙、散落的箱子。
  [
    { x: 0, y: 0, width: 28, height: 28 },
    { x: -60, y: -40, width: 16, height: 16 },
    { x: 60, y: 40, width: 16, height: 16 },
  ],
  [
    { x: -56, y: -34, width: 64, height: 12 },
    { x: 56, y: -34, width: 64, height: 12 },
    { x: -56, y: 34, width: 64, height: 12 },
    { x: 56, y: 34, width: 64, height: 12 },
  ],
  [
    { x: 52, y: 15, width: 14, height: 14 },
    { x: 21, y: 37, width: 14, height: 14 },
    { x: -21, y: 37, width: 14, height: 14 },
    { x: -52, y: 15, width: 14, height: 14 },
    { x: -52, y: -15, width: 14, height: 14 },
    { x: -21, y: -37, width: 14, height: 14 },
    { x: 21, y: -37, width: 14, height: 14 },
    { x: 52, y: -15, width: 14, height: 14 },
  ],
  [
    { x: -76, y: -52, width: 48, height: 12 },
    { x: -94, y: -34, width: 12, height: 24 },
    { x: 76, y: 52, width: 48, height: 12 },
    { x: 94, y: 34, width: 12, height: 24 },
  ],
  [
    { x: -70, y: -20, width: 14, height: 14 },
    { x: -40, y: 45, width: 14, height: 14 },
    { x: -20, y: -50, width: 14, height: 14 },
    { x: 30, y: 30, width: 14, height: 14 },
    { x: 55, y: -45, width: 14, height: 14 },
    { x: 85, y: 40, width: 14, height: 14 },
  ],
] as const satisfies RoomLayouts;

/** Boss 房的四根石柱（ADR 0030）：引 Boss 冲撞撞柱会让它眩晕；离门口和墙边都留出通道。 */
export const BOSS_ROOM_LAYOUT = [
  { x: -76, y: -42, width: 22, height: 22 },
  { x: 76, y: -42, width: 22, height: 22 },
  { x: -76, y: 42, width: 22, height: 22 },
  { x: 76, y: 42, width: 22, height: 22 },
] as const satisfies RoomLayouts[number];
