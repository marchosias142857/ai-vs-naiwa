import type { RoomTheme, TrapRules } from './schema/traps';

/** 房间机关的规则数值（ADR 0032）。demo 初值，负责人试玩后调整。 */
export const TRAP_RULES = {
  spikes: { rest: 1.6, warn: 0.6, up: 0.8, damage: 2 },
  current: { speed: 55 },
  weed: { slow: 0.55 },
  mine: { radius: 7, fuse: 0.45, blast: 30, damage: 6, knockback: 14, rearm: 5 },
  barrel: { radius: 7, hp: 8, blast: 34, damage: 8, knockback: 16 },
} as const satisfies TrapRules;

/**
 * 每层的房间主题（ADR 0032），下标为层数 − 1；最后一项是 Boss 层。
 * 战斗房按种子从 `plans` 里选一个：内墙布局加一组机关。机关坐标相对房间中心，避开四个门口的入场点。
 */
export const ROOM_THEMES = [
  {
    // 第 1 层：海底石殿（原有画面），海草丛减速、地刺、水流。
    art: 'temple',
    plans: [
      {
        layout: 0,
        traps: [
          { kind: 'weed', x: -64, y: -44, width: 56, height: 28 },
          { kind: 'weed', x: 64, y: 44, width: 56, height: 28 },
          { kind: 'spikes', x: 0, y: -40, width: 48, height: 16 },
          { kind: 'spikes', x: 0, y: 40, width: 48, height: 16, delay: 1.2 },
        ],
      },
      {
        layout: 1,
        traps: [
          { kind: 'current', x: 0, y: -30, width: 90, height: 18, angle: 0 },
          { kind: 'weed', x: -20, y: 40, width: 48, height: 24 },
        ],
      },
      {
        layout: 3,
        traps: [
          { kind: 'spikes', x: -36, y: 0, width: 16, height: 56 },
          { kind: 'spikes', x: 36, y: 0, width: 16, height: 56, delay: 1.1 },
          { kind: 'weed', x: 0, y: -44, width: 48, height: 20 },
        ],
      },
      {
        layout: 4,
        traps: [
          { kind: 'current', x: -80, y: 0, width: 18, height: 100, angle: 90 },
          { kind: 'current', x: 80, y: 0, width: 18, height: 100, angle: 270 },
        ],
      },
      { layout: 6, traps: [{ kind: 'weed', x: 0, y: 0, width: 40, height: 28 }] },
    ],
  },
  {
    // 第 2 层：沉船货舱，鱼雷桶、地刺、漏水的水流。
    art: 'wreck',
    plans: [
      {
        layout: 0,
        traps: [
          { kind: 'barrel', x: -70, y: -45 },
          { kind: 'barrel', x: 70, y: 45 },
          { kind: 'barrel', x: -30, y: 52 },
          { kind: 'barrel', x: 30, y: -52 },
          { kind: 'spikes', x: 0, y: 0, width: 32, height: 16 },
        ],
      },
      {
        layout: 5,
        traps: [
          { kind: 'current', x: 0, y: 0, width: 110, height: 20, angle: 180 },
          { kind: 'barrel', x: -40, y: -62 },
          { kind: 'barrel', x: 40, y: 62 },
          { kind: 'barrel', x: -100, y: 62 },
        ],
      },
      {
        layout: 7,
        traps: [
          { kind: 'barrel', x: -16, y: -12 },
          { kind: 'barrel', x: 16, y: -12 },
          { kind: 'barrel', x: 0, y: 14 },
          { kind: 'spikes', x: -80, y: 40, width: 32, height: 16 },
          { kind: 'spikes', x: 80, y: -40, width: 32, height: 16, delay: 1 },
        ],
      },
      {
        layout: 8,
        traps: [
          { kind: 'barrel', x: -90, y: -50 },
          { kind: 'barrel', x: 90, y: -62 },
          { kind: 'barrel', x: -6, y: 8 },
          { kind: 'spikes', x: 10, y: -28, width: 40, height: 16, delay: 0.6 },
        ],
      },
    ],
  },
  {
    // 第 3 层：珊瑚深渊，泡泡地雷、水流、地刺。
    art: 'abyss',
    plans: [
      {
        layout: 0,
        traps: [
          { kind: 'mine', x: -60, y: -40 },
          { kind: 'mine', x: 60, y: -40 },
          { kind: 'mine', x: -60, y: 40 },
          { kind: 'mine', x: 60, y: 40 },
          { kind: 'current', x: 0, y: 0, width: 24, height: 96, angle: 90 },
        ],
      },
      {
        layout: 3,
        traps: [
          { kind: 'current', x: 0, y: -46, width: 90, height: 18, angle: 0 },
          { kind: 'current', x: 0, y: 46, width: 90, height: 18, angle: 180 },
          { kind: 'mine', x: 0, y: 0 },
          { kind: 'mine', x: -100, y: -62 },
          { kind: 'mine', x: 100, y: 62 },
        ],
      },
      {
        layout: 6,
        traps: [
          { kind: 'mine', x: 0, y: 0 },
          { kind: 'spikes', x: -80, y: -62, width: 40, height: 14 },
          { kind: 'spikes', x: 80, y: 62, width: 40, height: 14, delay: 1 },
        ],
      },
      {
        layout: 5,
        traps: [
          { kind: 'mine', x: -60, y: 0 },
          { kind: 'mine', x: 60, y: 0 },
          { kind: 'mine', x: -100, y: -62 },
          { kind: 'mine', x: 100, y: 62 },
          { kind: 'spikes', x: 60, y: -62, width: 40, height: 14, delay: 0.8 },
        ],
      },
    ],
  },
  // Boss 层：奶池神殿，Boss 房用固定石柱（ADR 0030），不放机关。
  { art: 'milk', plans: [{ layout: 0, traps: [] }] },
] as const satisfies readonly RoomTheme[];

/** 第 `floor` 层的房间主题；超出范围时用最后一项。 */
export function roomTheme(floor: number): RoomTheme {
  return ROOM_THEMES[Math.min(ROOM_THEMES.length, Math.max(1, floor)) - 1]!;
}
