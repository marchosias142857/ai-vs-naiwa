import { GAME_HEIGHT, GAME_WIDTH, TILE_SIZE } from '../../config';

export const ROOM_COLS = 19;
export const ROOM_ROWS = 13;
/** 无内墙房间的内边界，与 GameScene 的墙面共用尺寸。 */
export const GRAYBOX_BOUNDS = {
  x: Math.floor((GAME_WIDTH - ROOM_COLS * TILE_SIZE) / 2) + TILE_SIZE,
  y: Math.floor((GAME_HEIGHT - ROOM_ROWS * TILE_SIZE) / 2) + TILE_SIZE,
  width: (ROOM_COLS - 2) * TILE_SIZE,
  height: (ROOM_ROWS - 2) * TILE_SIZE,
};
