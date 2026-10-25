import { z } from 'zod';
import { PositiveNumber, Seconds } from './common';

/**
 * 全局战斗参数：不属于某个角色、武器或怪物的规则数值。
 * 只放会影响战斗结果的数值；纯视觉参数（闪白时长、震屏强度等）放在画面方案对应的数据文件里（M1-2）。
 */
export const BalanceDefSchema = z.strictObject({
  /** 怪物出场前的地面预警时长，秒；预警期间怪物没有碰撞、不能行动。 */
  spawnTelegraph: Seconds,
  /** 玩家死亡后到出现「重来」提示的时长，秒。 */
  deathRestartDelay: Seconds,
  /** 怪物之间保持的最小间距，像素（追击时互相推开）。 */
  enemySeparation: z.number().min(0),
  /** 自动瞄准切换目标的最短间隔，秒，避免两个距离相近的目标之间来回抖动。目前只留给以后的特殊武器（ADR 0020）。 */
  autoAimRetargetInterval: Seconds,
  /** 每波怪物的数量。M1 的灰盒房间循环使用这一组。 */
  waveSizes: z.array(z.int().min(1)).min(1).readonly(),
  /** 上一波清空后到下一波出现的间隔，秒。 */
  waveInterval: Seconds,
  /** 刷怪点离玩家的最小距离，像素，避免刷在玩家脸上。 */
  spawnMinDistance: PositiveNumber,
  /** 击退持续时间，秒：击退距离（武器的 `knockback`）在这段时间内线性减速走完。 */
  knockbackTime: Seconds,
  /** 暴击伤害倍率；暴击概率由武器的 `critChance` 决定。 */
  critMultiplier: z.number().min(1),
  /** 奶潭里的玩家移动速度倍率（ADR 0030）。 */
  milkSlow: z.number().positive().max(1),
  /** 打倒最终 Boss 后弹出通关结算的延迟，秒（ADR 0030）。 */
  victoryDelay: z.number().positive(),
  /** 区域与石块的预热槽位数（ADR 0030）。 */
  zoneCapacity: z.int().positive(),
  rockCapacity: z.int().positive(),
});

export type BalanceDef = z.infer<typeof BalanceDefSchema>;
