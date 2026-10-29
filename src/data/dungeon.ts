import type { DungeonDef } from './schema/dungeon';

/** Hard bound for authoring configurations that exhaust self-avoiding path search. */
export const DUNGEON_SEARCH_LIMIT = 100_000;

/** demo 初值；正式节奏由试玩后调整。另有一层独立 Boss 房。 */
export const DUNGEON = {
  gridSize: 5,
  mainRooms: 6,
  branchRooms: 2,
  floors: 3,
} as const satisfies DungeonDef;
