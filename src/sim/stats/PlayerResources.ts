import type { PlayerRules } from '../../data/schema/player';

/** 生命周期归 CombatWorld；表现层只读取 api 的 Readonly 视图。 */
export class PlayerResources {
  armor: number;
  maxArmor: number;
  energy: number;
  maxEnergy: number;
  coins = 0;
  skillRemaining = 0;
  dashRemaining = 0;
  damageScale = 1;
  fireRateScale = 1;
  regenScale = 1;
  skillScale = 1;
  private safeTime = 0;
  private regenTime = 0;

  constructor(readonly rules?: Readonly<PlayerRules>) {
    this.armor = this.maxArmor = rules?.armor ?? 0;
    this.energy = this.maxEnergy = rules?.energy ?? 0;
  }

  step(dt: number): void {
    this.skillRemaining = Math.max(0, this.skillRemaining - dt);
    this.dashRemaining = Math.max(0, this.dashRemaining - dt);
    if (!this.rules) return;
    const previous = this.safeTime;
    this.safeTime += dt;
    if (this.armor >= this.maxArmor) {
      this.regenTime = 0;
      return;
    }
    this.regenTime +=
      Math.max(0, this.safeTime - this.rules.armorDelay) - Math.max(0, previous - this.rules.armorDelay);
    const interval = this.rules.armorInterval / this.regenScale;
    while (this.regenTime >= interval) {
      this.armor = Math.min(this.maxArmor, this.armor + 1);
      this.regenTime -= interval;
    }
  }

  /** 先扣护甲，返回溢出到生命的伤害；收到命中会重新计算修复等待。 */
  absorb(amount: number): number {
    this.safeTime = this.regenTime = 0;
    const absorbed = Math.min(amount, this.armor);
    this.armor -= absorbed;
    return amount - absorbed;
  }
  canFire(cost: number): boolean {
    return !this.rules || this.energy >= cost;
  }
  spend(cost: number): void {
    if (this.rules) this.energy -= cost;
  }
  skill(): boolean {
    if (!this.rules || this.skillRemaining > 0) return false;
    this.skillRemaining = this.rules.skillCooldown / this.skillScale;
    this.dashRemaining = this.rules.dashTime;
    return true;
  }
}
