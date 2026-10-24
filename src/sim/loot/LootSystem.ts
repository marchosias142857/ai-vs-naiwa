import { LOOT_RULES } from '../../data/loot';
import { WEAPONS, type WeaponId } from '../../data/weapons';
import type { CombatWorld } from '../combat/api';
import type { Random } from '../core/Random';

export type LootKind = 'coin' | 'health' | 'energy' | 'weapon';
export interface LootSlot {
  active: boolean;
  kind: LootKind;
  x: number;
  y: number;
  amount: number;
  weapon: WeaponId;
}
const weapons = (Object.keys(WEAPONS) as WeaponId[]).filter((id) => id !== 'pistol_basic');

/** 规则槽位与 game 表现一一对应，整个房间重复利用；满额丢弃，换房清空。 */
export class LootSystem {
  readonly slots: LootSlot[] = [];
  activeCount = 0;
  revision = 0;
  constructor(private readonly rng: Random) {
    for (let i = 0; i < LOOT_RULES.capacity; i++)
      this.slots.push({ active: false, kind: 'coin', x: 0, y: 0, amount: 0, weapon: 'pistol_basic' });
  }
  drop(kind: LootKind, x: number, y: number, amount: number, weapon: WeaponId = 'pistol_basic'): boolean {
    for (const s of this.slots)
      if (!s.active) {
        s.active = true;
        s.kind = kind;
        s.x = x;
        s.y = y;
        s.amount = amount;
        s.weapon = weapon;
        this.activeCount++;
        this.revision++;
        return true;
      }
    return false;
  }
  enemy(x: number, y: number): void {
    let total = 0;
    for (const d of LOOT_RULES.drops) total += d.weight;
    let roll = this.rng.range(0, total);
    for (const d of LOOT_RULES.drops) {
      roll -= d.weight;
      if (roll < 0) {
        this.drop(d.kind, x, y, d.amount);
        return;
      }
    }
  }
  chest(x: number, y: number): void {
    this.drop('weapon', x, y, 1, this.rng.pick(weapons));
  }
  reward(x: number, y: number): void {
    this.drop('coin', x - LOOT_RULES.rewardSpacing, y, LOOT_RULES.roomCoins);
    this.drop('energy', x, y, LOOT_RULES.roomEnergy);
    this.drop('health', x + LOOT_RULES.rewardSpacing, y, LOOT_RULES.roomHealth);
  }
  /** 物资靠近自动拾取；武器要求单次交互，一次最多处理一把。 */
  collect(world: CombatWorld, x: number, y: number, interact: boolean): void {
    for (const s of this.slots) {
      if (!s.active) continue;
      const weapon = s.kind === 'weapon';
      if (Math.hypot(s.x - x, s.y - y) > (weapon ? LOOT_RULES.weaponRadius : LOOT_RULES.pickupRadius))
        continue;
      if (weapon && !interact) continue;
      const accepted = weapon
        ? world.takeWeapon(s.weapon)
        : world.grantPickup(s.kind as 'coin' | 'health' | 'energy', s.amount);
      if (accepted) {
        s.active = false;
        this.activeCount--;
        this.revision++;
        if (weapon) interact = false;
      }
    }
  }
  clear(): void {
    for (const s of this.slots) s.active = false;
    this.activeCount = 0;
    this.revision++;
  }
}
