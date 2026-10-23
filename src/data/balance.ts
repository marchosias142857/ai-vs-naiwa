import type { BalanceDef } from './schema';

/** 全局战斗参数。负责人试玩后直接改这里调手感。 */
export const BALANCE = {
  spawnTelegraph: 0.6,
  deathRestartDelay: 1.2,
  enemySeparation: 14,
  autoAimRetargetInterval: 0.25,
  waveSizes: [3, 5, 7],
  waveInterval: 1.5,
  spawnMinDistance: 80,
  knockbackTime: 0.08,
} as const satisfies BalanceDef;
