import type { NavigationRules } from './schema/navigation';
/** 寻路网格为 8 px，足够覆盖最大普通怪的墙边通道；不改变 Arcade 碰撞。 */
export const NAVIGATION = {
  cellSize: 8,
  radiusCaches: 8,
  clearance: 0,
  lookahead: 2,
  tieEpsilon: 1e-6,
} as const satisfies NavigationRules;
