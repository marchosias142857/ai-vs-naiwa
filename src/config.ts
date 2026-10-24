/**
 * 全局常量。玩法数值不要放这里，放 src/data/（见 docs/DATA_SCHEMA.md）。
 * 这里只放引擎、画面、性能相关的固定参数。
 */
export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;
export const TILE_SIZE = 16;

/** 对象池预热数量（docs/ARCHITECTURE.md「对象池」）。 */
export const POOL_SIZES = {
  bullets: 500,
  actors: 31,
  fx: 100,
  damageText: 60,
} as const;

export const COLORS = {
  background: 0x0b0d14,
  floor: 0x1b2030,
  floorAlt: 0x1f2538,
  wall: 0x3a4160,
  wallTop: 0x59628a,
  text: '#e8ecff',
  textDim: '#8a93b8',
  accent: '#7ee8ff',
} as const;

/**
 * 绘制层级（docs/visual/m1-feel.md「绘制层级」，ADR 0002）。
 * 角色与怪物按脚底 y 坐标排序：`DEPTH.actors + y * DEPTH_Y_SORT`，结果始终小于子弹层。
 */
export const DEPTH = {
  floor: 0,
  floorDecals: 10,
  shadows: 20,
  actors: 30,
  playerBullets: 40,
  enemyBullets: 41,
  fx: 50,
  wallTops: 60,
  screenFx: 90,
  hud: 100,
  touchControls: 110,
} as const;

/** y 排序系数：世界坐标 y 每增加 1 像素，depth 增加这么多。 */
export const DEPTH_Y_SORT = 1 / 10000;

/** 场景 key 统一在这里定义，避免字符串拼错。 */
export const SCENES = {
  boot: 'Boot',
  preload: 'Preload',
  menu: 'Menu',
  game: 'Game',
} as const;
