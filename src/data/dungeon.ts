import type { DungeonDef } from './schema/dungeon';

/** demo 初值；正式节奏由试玩后调整。另有一层独立 Boss 房。 */
export const DUNGEON = {
  gridSize: 5,
  mainRooms: 6,
  branchRooms: 2,
  floors: 3,
} as const satisfies DungeonDef;
