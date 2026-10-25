import type { BalanceDef } from './schema';

/** 全局战斗参数。负责人试玩后直接改这里调手感。 */
export const BALANCE = {
  spawnTelegraph: 0.6,
  deathRestartDelay: 1.2,
  /** 打倒最终 Boss 后多久弹出通关结算，秒；要长于 Boss 死亡演出（ADR 0030）。 */
  victoryDelay: 3.6,
  enemySeparation: 14,
  autoAimRetargetInterval: 0.25,
  waveSizes: [3, 5, 7],
  waveInterval: 1.5,
  spawnMinDistance: 80,
  knockbackTime: 0.08,
  critMultiplier: 2,
  /** 站在奶潭里时玩家移动速度的倍率（ADR 0030）。 */
  milkSlow: 0.55,
  /** 同时存在的区域（毒气、奶潭）与天降石块上限（ADR 0030）。 */
  zoneCapacity: 24,
  rockCapacity: 12,
  /** 同时存在的特殊弹体上限（ADR 0031）；加特林满速约 12 发同时在飞。 */
  shotCapacity: 64,
  /** 一个房间最多摆放的机关数（ADR 0032）。 */
  trapCapacity: 12,
} as const satisfies BalanceDef;
