// 由 art-src/rooms/build_rooms.py 生成，不要手改；改画法后重新运行脚本。

/** 房间主题与机关图集 `demo_rooms` 的帧（ADR 0032）：[x, y, 宽, 高]，图集像素。 */
export const ROOM_ART = {
  abyss_block: [397, 1, 48, 48],
  abyss_bubbles: [1, 117, 14, 18],
  abyss_floor: [1, 1, 64, 64],
  abyss_floor_alt: [67, 1, 64, 64],
  abyss_kelp: [483, 67, 16, 20],
  abyss_skull: [75, 117, 14, 14],
  abyss_wall: [147, 67, 32, 32],
  barrel: [51, 67, 30, 34],
  barrel_broken: [83, 67, 30, 34],
  barrel_hit: [115, 67, 30, 34],
  current: [181, 67, 32, 32],
  milk_block: [447, 1, 48, 48],
  milk_coin: [57, 117, 16, 16],
  milk_floor: [133, 1, 64, 64],
  milk_floor_alt: [199, 1, 64, 64],
  milk_flower: [17, 117, 14, 18],
  milk_puddle: [91, 117, 24, 14],
  milk_wall: [215, 67, 32, 32],
  mine: [419, 67, 30, 30],
  mine_lit: [451, 67, 30, 30],
  spikes_idle: [249, 67, 32, 32],
  spikes_on: [283, 67, 32, 32],
  spikes_warn: [317, 67, 32, 32],
  weed: [351, 67, 32, 32],
  wreck_block: [1, 67, 48, 48],
  wreck_coins: [117, 117, 20, 14],
  wreck_floor: [265, 1, 64, 64],
  wreck_floor_alt: [331, 1, 64, 64],
  wreck_plank: [139, 117, 26, 12],
  wreck_rope: [33, 117, 22, 18],
  wreck_wall: [385, 67, 32, 32],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** 1 个图集像素对应的游戏像素。 */
export const ROOM_ART_SCALE = 0.5;
