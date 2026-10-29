import type { EntityId } from '../core/types';
import type { ActorView, LineOfSight } from './api';

/**
 * 自动瞄准的目标选择（不分配对象）。
 *
 * 历史的有状态选敌器，尚无生产调用。玩家按 ADR 0043 在 CombatWorld 无状态选敌，不使用本模块。
 *
 * 规则：射程内、处于活动阶段、视线未被墙挡住的敌方实体中，选距离最近的一个。
 * 为了避免两个距离相近的目标之间来回切换，当前目标仍然有效时，至少保持 `retargetInterval` 秒才重新挑选。
 */
export class AutoAim {
  private targetId: EntityId | null = null;
  private nextRetargetAt = 0;

  constructor(
    private readonly retargetInterval: number,
    private readonly lineOfSight: LineOfSight,
  ) {}

  /** 当前目标编号；没有目标时为 null。 */
  get current(): EntityId | null {
    return this.targetId;
  }

  /**
   * 更新并返回目标。`actors` 中只考虑 `team !== ownTeam` 的实体。
   * `now` 是 sim 时间（秒），`range` 是武器射程（像素）。
   */
  update(
    ownTeam: ActorView['team'],
    x: number,
    y: number,
    range: number,
    actors: readonly ActorView[],
    now: number,
  ): ActorView | null {
    const rangeSq = range * range;
    let current: ActorView | null = null;
    if (this.targetId !== null) {
      for (const a of actors) {
        if (a.id === this.targetId) {
          current = this.isValid(a, ownTeam, x, y, rangeSq) ? a : null;
          break;
        }
      }
    }
    if (current && now < this.nextRetargetAt) return current;

    let best: ActorView | null = null;
    let bestSq = Infinity;
    for (const a of actors) {
      if (!this.isValid(a, ownTeam, x, y, rangeSq)) continue;
      const d = (a.x - x) ** 2 + (a.y - y) ** 2;
      if (d < bestSq) {
        bestSq = d;
        best = a;
      }
    }
    if (best?.id !== this.targetId) this.nextRetargetAt = now + this.retargetInterval;
    this.targetId = best?.id ?? null;
    return best;
  }

  private isValid(a: ActorView, ownTeam: ActorView['team'], x: number, y: number, rangeSq: number): boolean {
    if (a.team === ownTeam || a.phase !== 'active') return false;
    if ((a.x - x) ** 2 + (a.y - y) ** 2 > rangeSq) return false;
    return this.lineOfSight(x, y, a.x, a.y);
  }
}
