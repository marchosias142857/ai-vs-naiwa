import { SHOT_HIT_SLOTS as HIT_SLOTS, SHOT_RULES } from '../../data/arsenal';
import type { ShotDef, WeaponDef } from '../../data/schema';
import { WEAPONS, type WeaponId } from '../../data/weapons';
import type { BeamState, ShotState } from '../combat/api';
import type { Random } from '../core/Random';
import type { EntityId, Team } from '../core/types';
import { segmentDistance } from './melee';

/** 光束长度二分查找的次数：260 像素的光束约 0.25 像素精度。 */
const BEAM_STEPS = 10;
const TAU = Math.PI * 2;

/** 弹体能打到的实体；CombatWorld 的实体记录满足这个结构。 */
export interface ShotTarget {
  readonly id: EntityId;
  readonly team: Team;
  readonly phase: 'telegraph' | 'active' | 'dead';
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** 弹体与光束的落地效果交给 CombatWorld 执行；Arsenal 不碰事件总线与实体内部状态。 */
export interface ArsenalHost {
  readonly actors: readonly ShotTarget[];
  /** sim 时间，秒；环绕弹的公共相位。 */
  time(): number;
  /** 地图视线，落地的石块也算遮挡。 */
  los(x1: number, y1: number, x2: number, y2: number): boolean;
  /** 能被弹体命中：活动中，且没有钻到地下。 */
  targetable(a: ShotTarget): boolean;
  /** 按编号找实体（发射者、追踪目标）。 */
  actor(id: EntityId): ShotTarget | undefined;
  /**
   * 结算一次命中：暴击、伤害、击退与 `bullet:hit`。
   * 返回 false 表示目标处于无敌，这次命中不连锁、不叠冰冻。
   */
  strike(
    weapon: Readonly<WeaponDef>,
    team: Team,
    ownerId: EntityId,
    target: ShotTarget,
    damage: number,
    knockback: number,
    dirX: number,
    dirY: number,
    x: number,
    y: number,
  ): boolean;
  /** 打墙：发出 `targetId` 为 null 的 `bullet:hit`；撞的是鱼雷桶时按 `damage` 扣耐久（ADR 0032）。 */
  wall(team: Team, x: number, y: number, angle: number, damage: number): void;
  explode(
    x: number,
    y: number,
    radius: number,
    damage: number,
    team: Team,
    ownerId: EntityId,
    knockback: number,
  ): void;
  chained(team: Team, x1: number, y1: number, x2: number, y2: number): void;
  chill(target: ShotTarget, def: NonNullable<WeaponDef['chill']>): void;
  /** 扣能量；不够时返回 false，光束随即关闭。 */
  pay(cost: number): boolean;
  nextId(): EntityId;
}

/** 内部可写的弹体记录；结构上满足只读的 `ShotView`。 */
interface Shot extends Omit<ShotState, 'hitIds' | 'hitTimes'> {
  active: boolean;
  /** 环形命中记录；`hitNext` 是满了以后下一次覆盖的位置。 */
  hitIds: EntityId[];
  hitTimes: number[];
  hitCount: number;
  hitNext: number;
}

/** 内部可写的光束状态；结构上满足只读的 `BeamView`。 */
type Beam = BeamState;

function newShot(slot: number): Shot {
  return {
    slot,
    active: false,
    id: 0,
    team: 'player',
    ownerId: 0,
    source: 'pistol_basic',
    child: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    radius: 0,
    angle: 0,
    time: 0,
    life: 0,
    damage: 0,
    pierceLeft: 0,
    bounces: 0,
    back: false,
    targetId: 0,
    seek: 0,
    hitIds: new Array<EntityId>(HIT_SLOTS).fill(0),
    hitTimes: new Array<number>(HIT_SLOTS).fill(0),
    hitCount: 0,
    hitNext: 0,
  };
}

/**
 * 特殊弹体与光束（ADR 0031）。弹体在固定槽位里由 sim 每个物理步移动：
 * 先按运动方式算出这一步的线段，线段穿墙就按运动方式处理（反弹、折返或结束），
 * 再找线段扫过的目标结算命中；寿命到时结束。全部计时都用 `update` 的 dt。
 */
export class Arsenal {
  readonly shots: Shot[] = [];
  readonly beam: Beam = {
    active: false,
    source: 'pistol_basic',
    x: 0,
    y: 0,
    angle: 0,
    length: 0,
    width: 0,
    wait: 0,
    cost: 0,
  };
  private readonly chainIds: EntityId[] = [];

  constructor(
    private readonly host: ArsenalHost,
    private readonly rng: Random,
    capacity: number,
  ) {
    for (let i = 0; i < capacity; i++) this.shots.push(newShot(i));
  }

  /**
   * 发射一发弹体。`damage` 已含伤害升级与蓄力倍率，`speedScale`、`pierceBonus` 来自蓄力。
   * 到 `shot.max` 上限或槽位用完时返回 false，调用方据此停止本次开火。
   */
  add(
    team: Team,
    ownerId: EntityId,
    source: WeaponId,
    x: number,
    y: number,
    angle: number,
    damage: number,
    speedScale = 1,
    pierceBonus = 0,
  ): boolean {
    const weapon: Readonly<WeaponDef> = WEAPONS[source];
    const def = weapon.shot;
    if (!def) return false;
    if (def.max !== undefined) {
      let alive = 0;
      for (const s of this.shots)
        if (s.active && !s.child && s.ownerId === ownerId && s.source === source) alive++;
      if (alive >= def.max) return false;
    }
    const s = this.free();
    if (!s) return false;
    const speed = weapon.bulletSpeed * speedScale;
    this.fill(s, team, ownerId, source, false, x, y, angle, speed, weapon.bulletRadius, def.life, damage);
    s.pierceLeft = weapon.pierce + pierceBonus;
    s.bounces = def.bounces ?? 0;
    // 自转的弹体从正立开始转；环绕弹（spin 为 0）始终正立。
    if (def.spin !== undefined) s.angle = 0;
    return true;
  }

  update(dt: number): void {
    // 结束时分裂出的小弹可能落在后面的槽位，本步也会移动一次，顺序固定，结果确定。
    for (let i = 0; i < this.shots.length; i++) {
      const s = this.shots[i]!;
      if (s.active) this.move(s, dt);
    }
  }

  /** 按住光束时每步调用：扣能量、量长度、按 tick 结算伤害。返回 false 表示能量不足，光束已关闭。 */
  beamStep(
    team: Team,
    ownerId: EntityId,
    source: WeaponId,
    x: number,
    y: number,
    angle: number,
    damage: number,
    dt: number,
  ): boolean {
    const weapon: Readonly<WeaponDef> = WEAPONS[source];
    const def = weapon.beam;
    const b = this.beam;
    if (!def) return false;
    if (!b.active || b.source !== source) {
      b.active = true;
      b.source = source;
      b.wait = 0;
      b.cost = 0;
    }
    b.cost -= dt;
    if (b.cost <= 0) {
      if (!this.host.pay(weapon.energyCost)) {
        this.beamOff();
        return false;
      }
      b.cost += def.costEvery;
    }
    b.x = x;
    b.y = y;
    b.angle = angle;
    b.width = def.width;
    b.length = this.reach(x, y, angle, weapon.range);
    b.wait -= dt;
    while (b.wait <= 0) {
      b.wait += def.tick;
      this.burn(weapon, team, ownerId, damage);
    }
    return true;
  }

  beamOff(): void {
    this.beam.active = false;
  }

  /** 换房：清掉全部弹体与光束，不触发结束效果。 */
  clear(): void {
    for (const s of this.shots) s.active = false;
    this.beamOff();
  }

  save(): { shots: ShotState[]; beam: BeamState } {
    const shots: ShotState[] = [];
    for (const s of this.shots) {
      if (!s.active) continue;
      const hitIds: EntityId[] = [],
        hitTimes: number[] = [];
      // 环满时从最旧的一条开始写出，恢复后按顺序填回，覆盖顺序不变。
      const start = s.hitCount === HIT_SLOTS ? s.hitNext : 0;
      for (let k = 0; k < s.hitCount; k++) {
        const j = (start + k) % HIT_SLOTS;
        hitIds.push(s.hitIds[j]!);
        hitTimes.push(s.hitTimes[j]!);
      }
      shots.push({
        slot: s.slot,
        id: s.id,
        team: s.team,
        ownerId: s.ownerId,
        source: s.source,
        child: s.child,
        x: s.x,
        y: s.y,
        vx: s.vx,
        vy: s.vy,
        speed: s.speed,
        radius: s.radius,
        angle: s.angle,
        time: s.time,
        life: s.life,
        damage: s.damage,
        pierceLeft: s.pierceLeft,
        bounces: s.bounces,
        back: s.back,
        targetId: s.targetId,
        seek: s.seek,
        hitIds,
        hitTimes,
      });
    }
    const { active, source, x, y, angle, length, width, wait, cost } = this.beam;
    return { shots, beam: { active, source, x, y, angle, length, width, wait, cost } };
  }

  load(shots: readonly ShotState[], beam: Readonly<BeamState>): void {
    if (shots.length > this.shots.length) throw new RangeError('存档超出特殊弹体容量');
    // 回到原槽位（ADR 0031）：弹体按槽位顺序移动，小弹占用第一个空槽，槽位一变后续结果就会不同。
    for (const state of shots) {
      const s = this.shots[state.slot];
      if (!s || s.active) throw new RangeError('特殊弹体槽位无效或重复');
      const { hitIds, hitTimes, ...rest } = state;
      Object.assign(s, rest, { active: true });
      s.hitCount = s.hitNext = 0;
      for (let k = 0; k < hitIds.length; k++) this.remember(s, hitIds[k]!, hitTimes[k]!);
    }
    Object.assign(this.beam, beam);
  }

  // ---- 内部 ----

  private free(): Shot | undefined {
    for (const s of this.shots) if (!s.active) return s;
    return undefined;
  }

  private fill(
    s: Shot,
    team: Team,
    ownerId: EntityId,
    source: WeaponId,
    child: boolean,
    x: number,
    y: number,
    angle: number,
    speed: number,
    radius: number,
    life: number,
    damage: number,
  ): void {
    s.active = true;
    s.id = this.host.nextId();
    s.team = team;
    s.ownerId = ownerId;
    s.source = source;
    s.child = child;
    s.x = x;
    s.y = y;
    s.vx = Math.cos(angle) * speed;
    s.vy = Math.sin(angle) * speed;
    s.speed = speed;
    s.radius = radius;
    s.angle = angle;
    s.time = 0;
    s.life = life;
    s.damage = damage;
    s.pierceLeft = 0;
    s.bounces = 0;
    s.back = false;
    s.targetId = 0;
    s.seek = 0;
    s.hitCount = s.hitNext = 0;
  }

  private move(s: Shot, dt: number): void {
    const weapon: Readonly<WeaponDef> = WEAPONS[s.source];
    const def = weapon.shot!;
    const motion = s.child ? 'straight' : def.motion;
    s.time += dt;
    let nx: number, ny: number;
    if (motion === 'orbit') {
      const owner = this.host.actor(s.ownerId);
      if (!owner || owner.phase !== 'active') return this.end(s, s.x, s.y, false);
      // 同一发射者的环绕弹按槽位顺序均分一圈，新加入或消失时其余的自动让位。
      let index = 0,
        count = 0;
      for (const o of this.shots)
        if (o.active && !o.child && o.ownerId === s.ownerId && o.source === s.source) {
          if (o === s) index = count;
          count++;
        }
      const radius = def.orbit!;
      const theta = this.host.time() * (s.speed / radius) + (TAU * index) / count;
      nx = owner.x + Math.cos(theta) * radius;
      ny = owner.y + Math.sin(theta) * radius;
      s.vx = (nx - s.x) / dt;
      s.vy = (ny - s.y) / dt;
    } else {
      if (motion === 'homing') this.steer(s, def, dt);
      else if (motion === 'boomerang' && !this.boomerang(s, def)) return;
      nx = s.x + s.vx * dt;
      ny = s.y + s.vy * dt;
      // 回程的回旋镖穿墙飞回，免得卡在柱子后面。
      if (!(motion === 'boomerang' && s.back) && !this.host.los(s.x, s.y, nx, ny)) {
        if (motion === 'bounce' && s.bounces > 0) {
          s.bounces--;
          this.host.wall(s.team, s.x, s.y, Math.atan2(s.vy, s.vx), s.damage);
          this.reflect(s, nx, ny);
        } else if (motion === 'boomerang') this.turnBack(s);
        else {
          this.host.wall(s.team, s.x, s.y, Math.atan2(s.vy, s.vx), s.damage);
          return this.end(s, s.x, s.y, true);
        }
        nx = s.x;
        ny = s.y;
      }
    }
    if (this.collide(s, weapon, nx, ny)) return;
    s.x = nx;
    s.y = ny;
    if (s.child || def.spin === undefined) {
      if (s.vx !== 0 || s.vy !== 0) s.angle = Math.atan2(s.vy, s.vx);
    } else s.angle += def.spin * dt;
    // 环绕弹与回旋镖到时只是消失；直线类弹体飞到头也会触发爆炸、分裂。
    if (s.time >= s.life) this.end(s, s.x, s.y, motion !== 'orbit' && motion !== 'boomerang');
  }

  /** 线段扫过的目标逐个结算；弹体因此结束时返回 true。倒序遍历，容忍死亡监听器移除实体。 */
  private collide(s: Shot, weapon: Readonly<WeaponDef>, nx: number, ny: number): boolean {
    const rehit = s.child ? undefined : weapon.shot!.rehit;
    const actors = this.host.actors;
    for (let i = actors.length - 1; i >= 0; i--) {
      const a = actors[i];
      if (!a || a.team === s.team || !this.host.targetable(a)) continue;
      if (segmentDistance(a.x, a.y, s.x, s.y, nx, ny) > a.radius + s.radius) continue;
      if (this.recent(s, a.id, rehit)) continue;
      this.remember(s, a.id, s.time);
      const d = Math.hypot(s.vx, s.vy);
      const dx = d > 0 ? s.vx / d : 1,
        dy = d > 0 ? s.vy / d : 0;
      // 命中点取目标朝弹体一侧的边缘，火花不会画在目标中心。
      const hx = a.x - dx * a.radius,
        hy = a.y - dy * a.radius;
      const landed = this.host.strike(
        weapon,
        s.team,
        s.ownerId,
        a,
        s.damage,
        weapon.knockback,
        dx,
        dy,
        hx,
        hy,
      );
      if (landed && !s.child) {
        if (weapon.chill) this.host.chill(a, weapon.chill);
        if (weapon.chain) this.chain(s, weapon, a);
      }
      if (s.pierceLeft <= 0) {
        this.end(s, hx, hy, true);
        return true;
      }
      s.pierceLeft--;
    }
    return false;
  }

  private recent(s: Shot, id: EntityId, rehit: number | undefined): boolean {
    for (let k = 0; k < s.hitCount; k++)
      if (s.hitIds[k] === id && (rehit === undefined || s.time - s.hitTimes[k]! < rehit)) return true;
    return false;
  }

  private remember(s: Shot, id: EntityId, time: number): void {
    // 同一目标的旧记录直接改写时间，避免环绕弹反复命中同一只怪时挤掉别的记录。
    for (let k = 0; k < s.hitCount; k++)
      if (s.hitIds[k] === id) {
        s.hitTimes[k] = time;
        return;
      }
    const k = s.hitCount < HIT_SLOTS ? s.hitCount++ : s.hitNext;
    s.hitIds[k] = id;
    s.hitTimes[k] = time;
    if (s.hitCount === HIT_SLOTS && k === s.hitNext) s.hitNext = (s.hitNext + 1) % HIT_SLOTS;
  }

  /** 连锁闪电：从命中目标出发，每跳找射程内最近、视线可达、这串闪电还没打过的目标。 */
  private chain(s: Shot, weapon: Readonly<WeaponDef>, first: ShotTarget): void {
    const c = weapon.chain!;
    const ids = this.chainIds;
    ids.length = 0;
    ids.push(first.id);
    let fx = first.x,
      fy = first.y,
      damage = s.damage;
    for (let j = 0; j < c.jumps; j++) {
      let best: ShotTarget | undefined,
        bestD = c.range;
      for (const a of this.host.actors) {
        if (a.team === s.team || !this.host.targetable(a) || ids.includes(a.id)) continue;
        const d = Math.hypot(a.x - fx, a.y - fy);
        if (d < bestD && this.host.los(fx, fy, a.x, a.y)) {
          best = a;
          bestD = d;
        }
      }
      if (!best) return;
      damage *= c.falloff;
      ids.push(best.id);
      const tx = best.x,
        ty = best.y,
        d = bestD || 1;
      this.host.chained(s.team, fx, fy, tx, ty);
      this.host.strike(weapon, s.team, s.ownerId, best, damage, 0, (tx - fx) / d, (ty - fy) / d, tx, ty);
      fx = tx;
      fy = ty;
    }
  }

  private steer(s: Shot, def: Readonly<ShotDef>, dt: number): void {
    s.seek -= dt;
    let target = s.targetId ? this.host.actor(s.targetId) : undefined;
    if (!target || !this.host.targetable(target) || s.seek <= 0) {
      s.seek = SHOT_RULES.seekEvery;
      target = undefined;
      let bestD = def.seek!;
      for (const a of this.host.actors) {
        if (a.team === s.team || !this.host.targetable(a)) continue;
        const d = Math.hypot(a.x - s.x, a.y - s.y);
        if (d < bestD && this.host.los(s.x, s.y, a.x, a.y)) {
          target = a;
          bestD = d;
        }
      }
      s.targetId = target?.id ?? 0;
    }
    if (!target) return;
    const now = Math.atan2(s.vy, s.vx);
    const want = Math.atan2(target.y - s.y, target.x - s.x);
    const diff = Math.atan2(Math.sin(want - now), Math.cos(want - now));
    const turn = def.turn! * dt;
    const angle = now + Math.max(-turn, Math.min(turn, diff));
    s.vx = Math.cos(angle) * s.speed;
    s.vy = Math.sin(angle) * s.speed;
  }

  /** 回旋镖：去程到时转身，回程追着发射者飞，碰到就接住。返回 false 表示已经接住或发射者不在了。 */
  private boomerang(s: Shot, def: Readonly<ShotDef>): boolean {
    if (!s.back && s.time >= def.out!) this.turnBack(s);
    if (!s.back) return true;
    const owner = this.host.actor(s.ownerId);
    if (!owner || owner.phase === 'dead') {
      this.end(s, s.x, s.y, false);
      return false;
    }
    const dx = owner.x - s.x,
      dy = owner.y - s.y,
      d = Math.hypot(dx, dy);
    if (d <= owner.radius + s.radius + SHOT_RULES.catchRadius) {
      this.end(s, s.x, s.y, false);
      return false;
    }
    const speed = s.speed * SHOT_RULES.returnSpeed;
    s.vx = (dx / d) * speed;
    s.vy = (dy / d) * speed;
    return true;
  }

  private turnBack(s: Shot): void {
    s.back = true;
    // 回程可以再打一次去程打过的目标。
    s.hitCount = s.hitNext = 0;
  }

  /** 按被挡住的轴反弹：墙体都是轴对齐的方块；两轴单独都不挡（正撞墙角）时原路弹回。 */
  private reflect(s: Shot, nx: number, ny: number): void {
    const blockedX = !this.host.los(s.x, s.y, nx, s.y),
      blockedY = !this.host.los(s.x, s.y, s.x, ny);
    if (blockedX || !blockedY) s.vx = -s.vx;
    if (blockedY || !blockedX) s.vy = -s.vy;
  }

  /** 弹体结束；`effects` 为 true 时触发爆炸与分裂（小弹自己不再分裂）。 */
  private end(s: Shot, x: number, y: number, effects: boolean): void {
    s.active = false;
    if (!effects || s.child) return;
    const weapon: Readonly<WeaponDef> = WEAPONS[s.source];
    const def = weapon.shot!;
    // 爆炸与小弹的伤害跟随这发弹体的倍率（伤害升级、蓄力）。
    const scale = s.damage / weapon.damage;
    if (def.burst)
      this.host.explode(
        x,
        y,
        def.burst.radius,
        def.burst.damage * scale,
        s.team,
        s.ownerId,
        def.burst.knockback,
      );
    const split = def.split;
    if (!split) return;
    const start = (this.rng.next() * TAU) / split.count;
    for (let k = 0; k < split.count; k++) {
      const c = this.free();
      if (!c) return;
      const angle = start + (TAU * k) / split.count;
      this.fill(c, s.team, s.ownerId, s.source, true, x, y, angle, split.speed, split.radius, split.life, 0);
      c.damage = split.damage * scale;
    }
  }

  /** 光束一次伤害：沿光束的全部敌人各结算一次。 */
  private burn(weapon: Readonly<WeaponDef>, team: Team, ownerId: EntityId, damage: number): void {
    const b = this.beam;
    const dx = Math.cos(b.angle),
      dy = Math.sin(b.angle);
    const ex = b.x + dx * b.length,
      ey = b.y + dy * b.length;
    const actors = this.host.actors;
    for (let i = actors.length - 1; i >= 0; i--) {
      const a = actors[i];
      if (!a || a.team === team || !this.host.targetable(a)) continue;
      if (segmentDistance(a.x, a.y, b.x, b.y, ex, ey) > a.radius + b.width / 2) continue;
      this.host.strike(weapon, team, ownerId, a, damage, weapon.knockback, dx, dy, a.x, a.y);
    }
  }

  /** 光束到墙的长度：先试满长，被挡住再二分。 */
  private reach(x: number, y: number, angle: number, range: number): number {
    const dx = Math.cos(angle),
      dy = Math.sin(angle);
    if (this.host.los(x, y, x + dx * range, y + dy * range)) return range;
    let lo = 0,
      hi = range;
    for (let k = 0; k < BEAM_STEPS; k++) {
      const mid = (lo + hi) / 2;
      if (this.host.los(x, y, x + dx * mid, y + dy * mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  }
}
