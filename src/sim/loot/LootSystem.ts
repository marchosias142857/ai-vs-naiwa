import { ENEMIES, type EnemyId } from '../../data/enemies';
import { LOOT_RULES } from '../../data/loot';
import type { EnemyDef } from '../../data/schema';
import { WEAPONS, type WeaponId } from '../../data/weapons';
import type { CombatWorld } from '../combat/api';
import type { Random } from '../core/Random';

export type LootKind = 'coin' | 'health' | 'energy' | 'weapon';
export interface LootSlot {
  active: boolean;
  room: number;
  kind: LootKind;
  x: number;
  y: number;
  amount: number;
  weapon: WeaponId;
}
const weapons = (Object.keys(WEAPONS) as WeaponId[]).filter((id) => id !== 'pistol_basic');

/** 存档用的纯数据（ADR 0019），槽位按原顺序保存。 */
export interface LootSystemState {
  room: number;
  rng: number;
  slots: LootSlot[];
}

/** 固定楼层槽位；武器按房间保留，普通物资换房清空。 */
export class LootSystem {
  readonly slots: LootSlot[] = [];
  activeCount = 0;
  revision = 0;
  room = 0;
  constructor(private rng: Random) {
    for (let i = 0; i < LOOT_RULES.capacity; i++)
      this.slots.push({
        active: false,
        room: 0,
        kind: 'coin',
        x: 0,
        y: 0,
        amount: 0,
        weapon: 'pistol_basic',
      });
  }
  drop(kind: LootKind, x: number, y: number, amount: number, weapon: WeaponId = 'pistol_basic'): boolean {
    const limit = kind === 'weapon' ? this.slots.length : this.slots.length - LOOT_RULES.weaponReserve;
    for (let i = 0; i < limit; i++) {
      const s = this.slots[i]!;
      if (!s.active) {
        s.active = true;
        s.room = this.room;
        s.kind = kind;
        s.x = x;
        s.y = y;
        s.amount = amount;
        s.weapon = weapon;
        this.activeCount++;
        this.revision++;
        return true;
      }
    }
    return false;
  }
  /** 怪物掉落；`kind` 的 `loot` 倍率为 0 时（如分裂出的蝌蚪）不掉落也不消耗随机数（ADR 0030）。 */
  enemy(x: number, y: number, kind?: string): void {
    const rate =
      kind && Object.hasOwn(ENEMIES, kind) ? ((ENEMIES[kind as EnemyId] as EnemyDef).loot ?? 1) : 1;
    if (rate <= 0) return;
    if (this.rng.chance(LOOT_RULES.noDropChance)) return;
    if (rate < 1 && !this.rng.chance(rate)) return;
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
  chest(x: number, y: number): boolean {
    return this.drop('weapon', x, y, 1, this.rng.pick(weapons));
  }
  reward(x: number, y: number): void {
    this.drop('coin', x - LOOT_RULES.rewardSpacing, y, LOOT_RULES.roomCoins);
    this.drop('energy', x, y, LOOT_RULES.roomEnergy);
    this.drop('health', x + LOOT_RULES.rewardSpacing, y, LOOT_RULES.roomHealth);
  }
  /** 物资靠近自动拾取；武器要求单次交互，一次最多处理一把。 */
  collect(world: CombatWorld, x: number, y: number, interact: boolean): void {
    for (const s of this.slots) {
      if (!s.active || s.room !== this.room) continue;
      const weapon = s.kind === 'weapon';
      if (Math.hypot(s.x - x, s.y - y) > (weapon ? LOOT_RULES.weaponRadius : LOOT_RULES.pickupRadius))
        continue;
      if (weapon && !interact) continue;
      const previous = world.secondaryWeapon;
      const accepted = weapon
        ? world.takeWeapon(s.weapon)
        : world.grantPickup(s.kind as 'coin' | 'health' | 'energy', s.amount);
      if (accepted) {
        // 原槽原子置换，即使全池都是武器也无需额外槽位；手枪不离开第一槽。
        if (weapon && previous && previous !== 'pistol_basic') {
          s.weapon = previous;
          s.x = x;
          s.y = y;
        } else {
          s.active = false;
          this.activeCount--;
        }
        this.revision++;
        if (weapon) interact = false;
      }
    }
  }
  enterRoom(room: number): void {
    for (const s of this.slots)
      if (s.active && s.kind !== 'weapon') {
        s.active = false;
        this.activeCount--;
      }
    this.room = room;
    this.revision++;
  }
  resetFloor(rng: Random): void {
    this.clear();
    this.rng = rng;
  }
  clear(): void {
    for (const s of this.slots) s.active = false;
    this.activeCount = 0;
    this.revision++;
  }
  save(): LootSystemState {
    return { room: this.room, rng: this.rng.snapshot, slots: this.slots.map((slot) => ({ ...slot })) };
  }
  /** 写入存档；槽位数必须与容量一致。不发事件。 */
  load(s: Readonly<LootSystemState>): void {
    if (s.slots.length !== this.slots.length) throw new RangeError('掉落槽位数与容量不一致');
    this.room = s.room;
    this.rng.restore(s.rng);
    this.activeCount = 0;
    for (let i = 0; i < this.slots.length; i++) {
      Object.assign(this.slots[i]!, s.slots[i]!);
      if (this.slots[i]!.active) this.activeCount++;
    }
    this.revision++;
  }
}
