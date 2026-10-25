import { TRAP_RULES } from '../../data/traps';
import type { TrapKind } from '../../data/schema/traps';
import type { TrapState, TrapView } from '../combat/api';
import type { EntityId, Team } from '../core/types';

/** 机关能影响到的角色；CombatWorld 的实体记录满足这个结构。 */
export interface TrapActor {
  readonly id: EntityId;
  readonly team: Team;
  readonly phase: 'telegraph' | 'active' | 'dead';
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** 机关的效果交给 CombatWorld 执行；Traps 只管计时、判定与状态。 */
export interface TrapHost {
  readonly actors: readonly TrapActor[];
  /** 站在地上：没有腾空、没有钻地。地刺、水流、海草和地雷只影响站在地上的角色。 */
  grounded(a: TrapActor): boolean;
  /** 地刺伤害，不分阵营，来源为 null。 */
  hurt(a: TrapActor, damage: number): void;
  /** 本步的移动倍率与推力，在 applyVelocity 里生效。 */
  sway(a: TrapActor, slow: number, pushX: number, pushY: number): void;
  /** 不分阵营的爆炸。 */
  explode(x: number, y: number, radius: number, damage: number, knockback: number): void;
}

/** 摆放好的机关（世界坐标）。矩形机关用 `width`/`height`，圆形机关用 `radius`。 */
export interface TrapLayout {
  readonly kind: TrapKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  /** 水流方向，弧度。 */
  readonly angle: number;
  readonly delay: number;
}

interface Trap extends TrapState {
  active: boolean;
  hitCount: number;
}

function newTrap(): Trap {
  return {
    active: false,
    kind: 'spikes',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    radius: 0,
    angle: 0,
    delay: 0,
    state: 'idle',
    time: 0,
    hp: 0,
    // 预留与实体池相当的命中记录，地刺每次刺出时复用。
    hitIds: new Array<EntityId>(32).fill(0),
    hitCount: 0,
  };
}

/** 还立着的鱼雷桶：挡路、挡视线、挡子弹（ADR 0032）。 */
export function standingBarrel(t: Readonly<TrapView>): boolean {
  return t.active && t.kind === 'barrel' && t.state === 'armed';
}

const RECT: ReadonlySet<TrapKind> = new Set(['spikes', 'current', 'weed']);

/**
 * 房间机关（ADR 0032）：固定槽位，换房时由表现层按房间方案摆放。
 * 地刺按周期刺出，水流推人，海草减速，泡泡地雷碰到就点燃，鱼雷桶被打爆后爆炸并可连锁。
 * 机关不分阵营：玩家可以把怪物引到地刺上、引爆鱼雷桶炸怪，怪物也会踩响地雷。
 */
export class Traps {
  readonly traps: Trap[] = [];
  /** 当前摆放所属的房间编号；-1 表示还没摆放。 */
  room = -1;

  constructor(
    private readonly host: TrapHost,
    capacity: number,
  ) {
    for (let i = 0; i < capacity; i++) this.traps.push(newTrap());
  }

  /**
   * 摆放房间 `room` 的机关。房间编号与当前相同时什么都不做（存档恢复后重建房间不会重置计时），
   * 换到别的房间时全部重新开始。超出槽位的机关不摆放。
   */
  place(room: number, layouts: readonly TrapLayout[]): void {
    if (room === this.room) return;
    this.room = room;
    for (let i = 0; i < this.traps.length; i++) {
      const t = this.traps[i]!,
        l = layouts[i];
      t.active = !!l;
      if (!l) continue;
      t.kind = l.kind;
      t.x = l.x;
      t.y = l.y;
      t.width = l.width;
      t.height = l.height;
      t.radius = l.radius;
      t.angle = l.angle;
      t.delay = l.delay;
      t.state = l.kind === 'spikes' ? 'idle' : l.kind === 'mine' || l.kind === 'barrel' ? 'armed' : 'on';
      t.time = l.kind === 'spikes' ? l.delay : 0;
      t.hp = l.kind === 'barrel' ? TRAP_RULES.barrel.hp : 0;
      t.hitCount = 0;
    }
  }

  update(dt: number): void {
    for (const t of this.traps) {
      if (!t.active) continue;
      if (t.kind === 'spikes') this.spikes(t, dt);
      else if (t.kind === 'mine') this.mine(t, dt);
      else if (t.kind === 'current' || t.kind === 'weed') this.field(t);
    }
  }

  /** 鱼雷桶受到伤害；打爆时爆炸（可能连锁引爆别的桶）。返回桶在这次伤害后是否已经爆掉。 */
  damageBarrel(index: number, amount: number): boolean {
    const t = this.traps[index];
    if (!t?.active || t.kind !== 'barrel' || t.state !== 'armed') return false;
    t.hp = Math.max(0, t.hp - amount);
    if (t.hp > 0) return false;
    // 先标记爆掉再引爆，连锁爆炸不会重复引爆同一个桶。
    t.state = 'broken';
    const b = TRAP_RULES.barrel;
    this.host.explode(t.x, t.y, b.blast, b.damage, b.knockback);
    return true;
  }

  save(): TrapState[] {
    const out: TrapState[] = [];
    for (const t of this.traps) {
      if (!t.active) continue;
      const { kind, x, y, width, height, radius, angle, delay, state, time, hp } = t;
      out.push({
        kind,
        x,
        y,
        width,
        height,
        radius,
        angle,
        delay,
        state,
        time,
        hp,
        hitIds: t.hitIds.slice(0, t.hitCount),
      });
    }
    return out;
  }

  load(room: number, states: readonly TrapState[]): void {
    if (states.length > this.traps.length) throw new RangeError('存档超出机关容量');
    this.room = room;
    for (let i = 0; i < this.traps.length; i++) {
      const t = this.traps[i]!,
        s = states[i];
      t.active = !!s;
      if (!s) continue;
      Object.assign(t, s, { hitIds: t.hitIds });
      t.hitCount = 0;
      for (const id of s.hitIds) t.hitIds[t.hitCount++] = id;
    }
  }

  // ---- 内部 ----

  private inside(t: Readonly<Trap>, a: TrapActor): boolean {
    if (RECT.has(t.kind)) return Math.abs(a.x - t.x) <= t.width / 2 && Math.abs(a.y - t.y) <= t.height / 2;
    return Math.hypot(a.x - t.x, a.y - t.y) <= t.radius + a.radius;
  }

  /** 地刺周期：idle（收起）→ warn（预警）→ on（刺出，伤人）→ idle。`time` 是本阶段已过的秒数。 */
  private spikes(t: Trap, dt: number): void {
    const r = TRAP_RULES.spikes;
    t.time += dt;
    const span = t.state === 'idle' ? r.rest : t.state === 'warn' ? r.warn : r.up;
    if (t.time >= span) {
      t.time -= span;
      t.state = t.state === 'idle' ? 'warn' : t.state === 'warn' ? 'on' : 'idle';
      t.hitCount = 0;
    }
    if (t.state !== 'on') return;
    // 倒序：伤害可能让监听器移除实体。
    const actors = this.host.actors;
    for (let i = actors.length - 1; i >= 0; i--) {
      const a = actors[i];
      if (!a || a.phase !== 'active' || !this.host.grounded(a) || !this.inside(t, a)) continue;
      let hit = false;
      for (let k = 0; k < t.hitCount; k++) if (t.hitIds[k] === a.id) hit = true;
      if (hit) continue;
      t.hitIds[t.hitCount++] = a.id;
      this.host.hurt(a, r.damage);
    }
  }

  /** 泡泡地雷：armed（布设）→ fuse（点燃）→ 爆炸 → idle（重新布设中）→ armed。 */
  private mine(t: Trap, dt: number): void {
    const r = TRAP_RULES.mine;
    if (t.state === 'armed') {
      for (const a of this.host.actors)
        if (a.phase === 'active' && this.host.grounded(a) && this.inside(t, a)) {
          t.state = 'fuse';
          t.time = 0;
          return;
        }
      return;
    }
    t.time += dt;
    if (t.state === 'fuse' && t.time >= r.fuse) {
      t.state = 'idle';
      t.time = 0;
      this.host.explode(t.x, t.y, r.blast, r.damage, r.knockback);
    } else if (t.state === 'idle' && t.time >= r.rearm) {
      t.state = 'armed';
      t.time = 0;
    }
  }

  /** 水流与海草：每步对区域里站在地上的角色生效。 */
  private field(t: Trap): void {
    const current = t.kind === 'current';
    const speed = TRAP_RULES.current.speed;
    for (const a of this.host.actors) {
      if (a.phase !== 'active' || !this.host.grounded(a) || !this.inside(t, a)) continue;
      if (current) this.host.sway(a, 1, Math.cos(t.angle) * speed, Math.sin(t.angle) * speed);
      else this.host.sway(a, TRAP_RULES.weed.slow, 0, 0);
    }
  }
}
