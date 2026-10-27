import { ATTACKS, type AttackId } from '../../data/attacks';
import { BALANCE } from '../../data/balance';
import type { EnemyDef, EnemySpecial } from '../../data/schema';
import type { ActorPose, ActorStage, ActorView, ZoneKind } from '../combat/api';
import type { EnemyAction } from '../core/events';
import type { Vec2 } from '../core/types';
import { moveEnemy, type BrainMove, type BrainStage, type EnemyBrain } from './brain';
import { chaseVelocity } from './chase';

/** AI 读写的实体字段；CombatWorld 的内部实体满足它。 */
export interface EnemyBody extends ActorView {
  base: Vec2;
  facing: number;
  brain: EnemyBrain;
  warning: boolean;
  pose: ActorPose;
  lift: number;
  aim: number;
  move: BrainMove;
  stage: ActorStage;
  stageTime: number;
  stageSpan: number;
  aimLocked: boolean;
  landX: number;
  landY: number;
}

/** 房间内边界，用来把预计落点限制在房间里。 */
export interface StageBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 招式落地时需要战斗世界执行的动作；实现方负责伤害、子弹、区域、石块与事件。 */
export interface AiHost {
  readonly actors: readonly ActorView[];
  lineOfSight(x1: number, y1: number, x2: number, y2: number): boolean;
  /** 用敌方攻击表按给定方向开一次火。 */
  shoot(e: EnemyBody, attack: AttackId, angle: number): void;
  explode(e: EnemyBody, radius: number, damage: number): void;
  lash(e: EnemyBody, angle: number, length: number, width: number, damage: number, pull: number): void;
  summon(e: EnemyBody, kind: string, count: number, telegraph: number): void;
  /** 仍存活（含预警中）的子嗣数。 */
  children(e: EnemyBody): number;
  zone(e: EnemyBody, kind: ZoneKind, radius: number, duration: number, damage: number, tick: number): void;
  /** 在目标附近砸下石块；stagger 为 true 时各块预警时长错开。 */
  rocks(e: EnemyBody, target: ActorView, count: number, spread: number, stagger: boolean): void;
  /** 冲撞被挡住：撞碎前方石块；返回 true 表示撞的是石柱或石块（会眩晕），false 表示房间边墙。 */
  crash(e: EnemyBody, angle: number): boolean;
  /** 自爆后结束自己（按正常死亡流程）。 */
  selfDestruct(e: EnemyBody): void;
  act(e: EnemyBody, action: EnemyAction, angle: number): void;
  /** AI 专用随机流 [0, 1)。 */
  random(): number;
}

/** 开火前额外显示蓄力动作的时长，只影响 pose。 */
const SHOT_TELL = 0.35;
const SHOT_POSE = 0.25;
const LAND_POSE = 0.2;
const SUMMON_POSE = 0.3;
const SURFACE_POSE = 0.3;
const RECOVER_COOLDOWN = 0.5;
/** 舌击与冲撞在出招前这么久锁定方向，之前一直跟着玩家转。 */
const AIM_LOCK = 0.25;
/** 冲撞起步后这么久才开始判断是否被挡住；实际位移低于预期的这个比例就算撞上。 */
const CRASH_GRACE = 0.08;
const CRASH_RATIO = 0.35;
/** 石块雨跺脚的蓄力时长。 */
const RAIN_WINDUP = 0.5;
/** 落地砸石的散布半径，像素。 */
const SLAM_SPREAD = 80;

/**
 * 怪物 AI（ADR 0030）：按行为移动，按招式阶段推进，所有计时都在 WORLD_STEP 的 dt 上。
 * 旧行为（追击、保持距离、炮台、冲锋）仍由 `moveEnemy` 计算，结果与改动前一致。
 */
export class EnemyAi {
  constructor(private readonly host: AiHost) {}

  /** 出生时按数据设定各计时器，避免所有怪物同一时刻放招。 */
  init(e: EnemyBody, def: Readonly<EnemyDef>): void {
    const b = e.brain;
    b.special = def.specialEvery ?? def.summon?.interval ?? def.strafe?.every ?? BALANCE.spawnTelegraph;
    b.flip = def.strafe?.flip ?? 0;
    b.gas = def.gas?.every ?? 0;
    b.side = 1;
    e.pose = 'idle';
    e.lift = 0;
    e.aim = e.facing;
  }

  /** 移动与招式推进；之后由调用方做绕墙修正、更新朝向，再调用 `shootRegular` 与 `pose`。 */
  think(
    e: EnemyBody,
    def: Readonly<EnemyDef>,
    target: ActorView | null,
    dt: number,
    speedScale: number,
  ): void {
    const b = e.brain;
    e.lift = 0;
    b.shot = Math.max(0, b.shot - dt);
    if (b.move !== 'none' && b.move !== 'dash') {
      b.cooldown -= dt;
      this.advance(e, def, target, dt);
      return;
    }
    if (!target) {
      moveEnemy(e.base, e, null, this.host.actors, def, b, dt, speedScale);
      return;
    }
    if (def.gas) this.tickGas(e, def.gas, dt);
    switch (def.behavior) {
      case 'hop':
        b.cooldown -= dt;
        e.base.x = e.base.y = 0;
        if (b.cooldown <= 0 && def.hop) this.start(e, 'hop', 'windup', def.hop.windup);
        break;
      case 'lash':
        b.cooldown -= dt;
        this.keepDistance(e, def, target, speedScale);
        if (def.lash && b.cooldown <= 0 && this.inReach(e, target, def.lash.length * 0.95))
          this.startLash(e, def, target);
        break;
      case 'summoner':
        b.cooldown -= dt;
        this.keepDistance(e, def, target, speedScale);
        b.special -= dt;
        if (def.summon && b.special <= 0) {
          if (this.host.children(e) < def.summon.max) this.start(e, 'summon', 'windup', def.summon.windup);
          else b.special = def.summon.interval;
        }
        break;
      case 'suicide':
        b.cooldown -= dt;
        chaseVelocity(
          e.base,
          e,
          target,
          this.host.actors,
          def.moveSpeed * speedScale,
          BALANCE.enemySeparation,
        );
        if (def.fuse && Math.hypot(target.x - e.x, target.y - e.y) <= def.fuse.trigger)
          this.start(e, 'fuse', 'windup', def.fuse.time);
        break;
      case 'burrow':
        b.cooldown -= dt;
        if (def.burrow) {
          this.start(e, 'burrow', 'buried', def.burrow.under);
          this.host.act(e, 'burrow', e.facing);
          this.advance(e, def, target, 0);
        }
        break;
      case 'strafe':
        b.cooldown -= dt;
        this.strafe(e, def, target, dt, speedScale);
        b.special -= dt;
        if (def.spin && b.special <= 0) this.startSpin(e, def, target);
        break;
      default: {
        const before = b.stage;
        moveEnemy(e.base, e, target, this.host.actors, def, b, dt, speedScale);
        b.move = b.stage === 'ready' ? 'none' : 'dash';
        if (before === 'windup' && b.stage === 'dash') this.host.act(e, 'lunge', Math.atan2(b.dirY, b.dirX));
        if (b.stage !== 'ready') e.aim = Math.atan2(b.dirY, b.dirX);
      }
    }
    if (b.move === 'none') this.trySpecial(e, def, target, dt);
  }

  /** 常规射击（旧逻辑原样搬来）：冷却到、在射程内且看得见才开火。 */
  shootRegular(e: EnemyBody, target: ActorView | null, attack: string | undefined): void {
    const b = e.brain;
    if (b.move !== 'none' || !target || !attack || b.cooldown > 0) return;
    const weapon = ATTACKS[attack as AttackId];
    if (
      !weapon ||
      Math.hypot(target.x - e.x, target.y - e.y) > weapon.range ||
      !this.host.lineOfSight(e.x, e.y, target.x, target.y)
    )
      return;
    this.host.shoot(e, attack as AttackId, Math.atan2(target.y - e.y, target.x - e.x));
    b.cooldown = 1 / weapon.fireRate;
    b.shot = SHOT_POSE;
  }

  /** 由阶段算表现动作；`attack` 是本帧生效的常规攻击。 */
  pose(e: EnemyBody, target: ActorView | null, attack: string | undefined): void {
    const b = e.brain;
    e.warning = b.stage === 'windup';
    e.move = b.move;
    if (b.move === 'none') {
      e.aim = e.facing;
      const range = attack ? (ATTACKS[attack as AttackId]?.range ?? 0) : 0;
      if (b.shot > 0) e.pose = 'attack';
      else if (range && target && b.cooldown < SHOT_TELL && this.inReach(e, target, range)) e.pose = 'windup';
      else e.pose = e.base.x !== 0 || e.base.y !== 0 ? 'move' : 'idle';
      return;
    }
    switch (b.stage) {
      case 'windup':
      case 'emerge':
        e.pose = 'windup';
        break;
      case 'dash':
        e.pose = 'attack';
        break;
      case 'spin':
        e.pose = 'spin';
        break;
      case 'air':
        e.pose = 'air';
        break;
      case 'buried':
        e.pose = 'buried';
        break;
      case 'stun':
        e.pose = 'recover';
        break;
      case 'active':
        e.pose = b.move === 'burrow' && b.span - b.time > SURFACE_POSE ? 'idle' : 'attack';
        break;
      case 'recover':
        if (b.move === 'hop') e.pose = b.span - b.time < LAND_POSE ? 'attack' : 'idle';
        else e.pose = b.move === 'dash' ? 'recover' : 'idle';
        break;
      default:
        e.pose = 'idle';
    }
  }

  /**
   * 由已存档的 AI 状态推出表现用的阶段、进度、方向锁定与落点（ADR 0038）。只写这几个视图字段，
   * 不改变任何规则状态；CombatWorld 在每个物理步末与读档后各调用一次，所以同一状态永远得到同一结果。
   */
  static stageView(e: EnemyBody, bounds?: StageBounds): void {
    const b = e.brain;
    e.landX = e.landY = 0;
    if (b.move === 'none') {
      // 常规射击：前摇是冷却末段的表现（pose 已按射程与视线判定），后坐是 shot 计时。
      e.aimLocked = false;
      if (e.pose === 'windup') setStage(e, 'windup', SHOT_TELL - b.cooldown, SHOT_TELL);
      else if (e.pose === 'attack') setStage(e, 'active', SHOT_POSE - b.shot, SHOT_POSE);
      else setStage(e, 'ready', 0, 0);
      return;
    }
    // 旧存档的冲锋没有写 span，读档后从当前剩余时间起算，最多影响这一次动作的起始帧。
    const span = Math.max(b.span, b.time);
    setStage(e, b.stage, span - b.time, b.stage === 'ready' ? 0 : span);
    switch (b.move) {
      case 'dash':
        e.aimLocked = b.stage !== 'ready';
        break;
      case 'lash':
      case 'bump':
        e.aimLocked = b.stage !== 'windup' || b.time <= AIM_LOCK;
        break;
      case 'hop':
        e.aimLocked = b.stage !== 'windup';
        if (b.stage === 'air') {
          const left = Math.max(0, b.time) * b.speed;
          e.landX = e.x + b.dirX * left;
          e.landY = e.y + b.dirY * left;
          if (bounds) {
            e.landX = Math.min(bounds.x + bounds.width - e.radius, Math.max(bounds.x + e.radius, e.landX));
            e.landY = Math.min(bounds.y + bounds.height - e.radius, Math.max(bounds.y + e.radius, e.landY));
          }
        }
        break;
      default:
        e.aimLocked = false;
    }
  }

  /** 只有朝目标走的常规移动与地下潜行交给绕墙导航；跳跃、横移、冲锋保持原方向。 */
  navigable(e: EnemyBody, def: Readonly<EnemyDef>): boolean {
    const b = e.brain;
    if (b.move === 'burrow') return b.stage === 'buried';
    return b.move === 'none' && def.behavior !== 'strafe' && def.behavior !== 'hop';
  }

  /** 腾空、钻地与出土时不造成接触伤害。 */
  static grounded(b: Readonly<EnemyBrain>): boolean {
    return b.stage !== 'air' && b.stage !== 'buried' && b.stage !== 'emerge';
  }
  /** 地下与出土蓄力时不会被子弹、近战与爆炸命中。 */
  static hidden(b: Readonly<EnemyBrain>): boolean {
    return b.stage === 'buried' || b.stage === 'emerge';
  }

  // ---- 内部 ----

  private start(e: EnemyBody, move: BrainMove, stage: BrainStage, time: number): void {
    const b = e.brain;
    b.move = move;
    b.stage = stage;
    b.time = b.span = time;
    e.base.x = e.base.y = 0;
  }

  private finish(e: EnemyBody, cooldown: number): void {
    const b = e.brain;
    b.move = 'none';
    b.stage = 'ready';
    b.time = b.span = 0;
    b.cooldown = Math.max(b.cooldown, cooldown);
    e.base.x = e.base.y = 0;
  }

  private next(e: EnemyBody, stage: BrainStage, time: number): void {
    e.brain.stage = stage;
    e.brain.time = e.brain.span = time;
  }

  private advance(e: EnemyBody, def: Readonly<EnemyDef>, target: ActorView | null, dt: number): void {
    const b = e.brain;
    b.time -= dt;
    switch (b.move) {
      case 'hop':
        return this.hop(e, def, target);
      case 'lash':
        return this.lash(e, def, target);
      case 'summon':
        return this.summon(e, def);
      case 'fuse':
        e.base.x = e.base.y = 0;
        if (b.time <= 0) {
          const fuse = def.fuse!;
          this.host.act(e, 'explode', e.facing);
          this.host.explode(e, fuse.radius, fuse.damage);
          if (fuse.attack) this.host.shoot(e, fuse.attack as AttackId, this.host.random() * Math.PI * 2);
          this.finish(e, 0);
          this.host.selfDestruct(e);
        }
        return;
      case 'burrow':
        return this.burrow(e, def, target);
      case 'spin':
        return this.spin(e, def);
      case 'bump':
        return this.bump(e, def, target, dt);
      case 'rain':
        e.base.x = e.base.y = 0;
        if (b.time > 0) return;
        if (target && def.rain) this.host.rocks(e, target, def.rain.count, def.rain.spread, true);
        this.host.act(e, 'rain', e.facing);
        this.finish(e, RECOVER_COOLDOWN);
    }
  }

  private hop(e: EnemyBody, def: Readonly<EnemyDef>, target: ActorView | null): void {
    const b = e.brain,
      hop = def.hop!;
    if (b.stage === 'windup') {
      e.base.x = e.base.y = 0;
      if (b.time > 0) return;
      // 起跳时才锁定落点：横向走位就能躲开，像泰拉瑞亚的史莱姆。
      const tx = target ? target.x : e.x,
        ty = target ? target.y : e.y;
      const dx = tx - e.x,
        dy = ty - e.y,
        d = Math.hypot(dx, dy);
      const travel = Math.min(d, hop.range);
      b.dirX = d > 0 ? dx / d : Math.cos(e.facing);
      b.dirY = d > 0 ? dy / d : Math.sin(e.facing);
      b.speed = travel / hop.air;
      e.aim = Math.atan2(b.dirY, b.dirX);
      this.next(e, 'air', hop.air);
      this.host.act(e, 'hop', e.aim);
    }
    if (b.stage === 'air') {
      if (b.time > 0) {
        const t = 1 - b.time / b.span;
        e.lift = hop.height * 4 * t * (1 - t);
        e.base.x = b.dirX * b.speed;
        e.base.y = b.dirY * b.speed;
        return;
      }
      e.base.x = e.base.y = 0;
      this.host.act(e, 'land', e.aim);
      if (hop.landAttack) this.host.shoot(e, hop.landAttack as AttackId, this.host.random() * Math.PI * 2);
      if (hop.puddle) this.host.zone(e, 'milk', hop.puddle.radius, hop.puddle.duration, 0, 0);
      const rocks = this.phaseRocks(e, def) ?? hop.rocks ?? 0;
      if (rocks && target) this.host.rocks(e, target, rocks, SLAM_SPREAD, false);
      this.next(e, 'recover', hop.recover);
      return;
    }
    e.base.x = e.base.y = 0;
    if (b.time <= 0) this.finish(e, def.behavior === 'hop' ? 0 : RECOVER_COOLDOWN);
  }

  private startLash(e: EnemyBody, def: Readonly<EnemyDef>, target: ActorView): void {
    e.aim = Math.atan2(target.y - e.y, target.x - e.x);
    this.start(e, 'lash', 'windup', def.lash!.windup);
  }

  private lash(e: EnemyBody, def: Readonly<EnemyDef>, target: ActorView | null): void {
    const b = e.brain,
      lash = def.lash!;
    e.base.x = e.base.y = 0;
    if (b.stage === 'windup') {
      if (target && b.time > AIM_LOCK) e.aim = Math.atan2(target.y - e.y, target.x - e.x);
      e.facing = e.aim;
      if (b.time > 0) return;
      this.next(e, 'active', lash.active);
      this.host.act(e, 'lash', e.aim);
      this.host.lash(e, e.aim, lash.length, lash.width, lash.damage, lash.pull);
      return;
    }
    if (b.stage === 'active') {
      if (b.time <= 0) this.next(e, 'recover', lash.recover);
      return;
    }
    if (b.time <= 0) this.finish(e, lash.cooldown);
  }

  private summon(e: EnemyBody, def: Readonly<EnemyDef>): void {
    const b = e.brain,
      s = def.summon!;
    e.base.x = e.base.y = 0;
    if (b.stage === 'windup') {
      if (b.time > 0) return;
      const room = Math.max(0, s.max - this.host.children(e));
      if (room) {
        this.host.summon(e, s.kind, Math.min(s.count, room), s.telegraph);
        this.host.act(e, 'summon', e.facing);
      }
      this.next(e, 'active', SUMMON_POSE);
      return;
    }
    if (b.time > 0) return;
    this.finish(e, RECOVER_COOLDOWN);
    b.special = def.behavior === 'summoner' ? s.interval : (def.specialEvery ?? s.interval);
  }

  private burrow(e: EnemyBody, def: Readonly<EnemyDef>, target: ActorView | null): void {
    const b = e.brain,
      bur = def.burrow!;
    e.base.x = e.base.y = 0;
    if (b.stage === 'buried') {
      if (target) {
        // 地下朝玩家身边 offset 处潜行，到点或时间到就准备出土。
        const dx = e.x - target.x,
          dy = e.y - target.y,
          d = Math.hypot(dx, dy) || 1;
        const mx = target.x + (dx / d) * bur.offset - e.x,
          my = target.y + (dy / d) * bur.offset - e.y,
          md = Math.hypot(mx, my);
        if (md > 2) {
          e.base.x = (mx / md) * def.moveSpeed;
          e.base.y = (my / md) * def.moveSpeed;
        } else b.time = 0;
      }
      if (b.time > 0) return;
      e.base.x = e.base.y = 0;
      this.next(e, 'emerge', bur.emerge);
      this.host.act(e, 'emerge', e.facing);
      return;
    }
    if (b.stage === 'emerge') {
      if (b.time > 0) return;
      const angle = target ? Math.atan2(target.y - e.y, target.x - e.x) : e.facing;
      this.host.shoot(e, bur.attack as AttackId, angle);
      this.next(e, 'active', bur.up);
      return;
    }
    if (b.time > 0) return;
    this.next(e, 'buried', bur.under);
    this.host.act(e, 'burrow', e.facing);
  }

  private startSpin(e: EnemyBody, def: Readonly<EnemyDef>, target: ActorView): void {
    const b = e.brain;
    b.angle = Math.atan2(target.y - e.y, target.x - e.x);
    this.start(e, 'spin', 'spin', def.spin!.time);
    b.cooldown = 0;
    this.host.act(e, 'spin', b.angle);
  }

  private spin(e: EnemyBody, def: Readonly<EnemyDef>): void {
    const b = e.brain,
      s = def.spin!;
    e.base.x = e.base.y = 0;
    while (b.cooldown <= 0 && b.time > 0) {
      this.host.shoot(e, s.attack as AttackId, b.angle);
      b.angle += (s.step * Math.PI) / 180;
      b.cooldown += s.interval;
    }
    if (b.time > 0) return;
    this.finish(e, RECOVER_COOLDOWN);
    b.special = def.strafe?.every ?? def.specialEvery ?? 1;
  }

  /** 挺肚冲撞：蓄力时跟着玩家转、最后锁定；猛冲中实际位移明显变小就算撞上。 */
  private bump(e: EnemyBody, def: Readonly<EnemyDef>, target: ActorView | null, dt: number): void {
    const b = e.brain,
      bump = def.bump!;
    e.base.x = e.base.y = 0;
    if (b.stage === 'windup') {
      if (target && b.time > AIM_LOCK) e.aim = Math.atan2(target.y - e.y, target.x - e.x);
      e.facing = e.aim;
      if (b.time > 0) return;
      b.dirX = Math.cos(e.aim);
      b.dirY = Math.sin(e.aim);
      b.px = e.x;
      b.py = e.y;
      this.next(e, 'dash', bump.time);
      this.host.act(e, 'lunge', e.aim);
    }
    if (b.stage === 'dash') {
      const moved = Math.hypot(e.x - b.px, e.y - b.py);
      const blocked = b.span - b.time > CRASH_GRACE && dt > 0 && moved < bump.speed * dt * CRASH_RATIO;
      b.px = e.x;
      b.py = e.y;
      if (blocked) {
        const stunned = this.host.crash(e, e.aim);
        this.host.act(e, stunned ? 'stun' : 'crash', e.aim);
        this.next(e, stunned ? 'stun' : 'recover', stunned ? bump.stun : bump.recover);
        return;
      }
      if (b.time <= 0) {
        this.next(e, 'recover', bump.recover);
        return;
      }
      e.base.x = b.dirX * bump.speed;
      e.base.y = b.dirY * bump.speed;
      return;
    }
    if (b.time <= 0) this.finish(e, RECOVER_COOLDOWN);
  }

  /** 定时特殊招式（Boss 等）：按阶段给的顺序轮换，条件不满足的招跳过。 */
  private trySpecial(e: EnemyBody, def: Readonly<EnemyDef>, target: ActorView | null, dt: number): void {
    if (!target || def.behavior === 'summoner' || def.behavior === 'strafe') return;
    const list = this.specials(e, def);
    if (!list?.length) return;
    const b = e.brain;
    b.special -= dt;
    if (b.special > 0) return;
    b.special = def.specialEvery ?? 1;
    for (let i = 0; i < list.length; i++) {
      const pick: EnemySpecial = list[b.next++ % list.length]!;
      if (pick === 'hop' && def.hop) return this.start(e, 'hop', 'windup', def.hop.windup);
      if (pick === 'lash' && def.lash && this.inReach(e, target, def.lash.length))
        return this.startLash(e, def, target);
      if (pick === 'summon' && def.summon && this.host.children(e) < def.summon.max)
        return this.start(e, 'summon', 'windup', def.summon.windup);
      if (pick === 'bump' && def.bump) {
        e.aim = Math.atan2(target.y - e.y, target.x - e.x);
        return this.start(e, 'bump', 'windup', def.bump.windup);
      }
      if (pick === 'spin' && def.spin) return this.startSpin(e, def, target);
      if (pick === 'rain' && def.rain && def.rock) return this.start(e, 'rain', 'windup', RAIN_WINDUP);
    }
  }

  private specials(e: EnemyBody, def: Readonly<EnemyDef>): readonly EnemySpecial[] | undefined {
    let list = def.specials;
    if (def.phases)
      for (const phase of def.phases)
        if (e.hp / e.maxHp <= phase.belowHp && phase.specials) list = phase.specials;
    return list;
  }

  private phaseRocks(e: EnemyBody, def: Readonly<EnemyDef>): number | undefined {
    let rocks: number | undefined;
    if (def.phases)
      for (const phase of def.phases) if (e.hp / e.maxHp <= phase.belowHp) rocks = phase.rocks ?? rocks;
    return rocks;
  }

  /** 与旧 `keep_distance` 相同的进退规则，不分配临时数据。 */
  private keepDistance(e: EnemyBody, def: Readonly<EnemyDef>, target: ActorView, scale: number): void {
    const dx = target.x - e.x,
      dy = target.y - e.y,
      d = Math.hypot(dx, dy);
    const desired = def.desiredRange ?? e.radius;
    const direction = d < desired ? -1 : d > desired + BALANCE.enemySeparation ? 1 : 0;
    e.base.x = d > 0 ? (dx / d) * def.moveSpeed * direction * scale : 0;
    e.base.y = d > 0 ? (dy / d) * def.moveSpeed * direction * scale : 0;
  }

  /** 绕玩家横移并保持距离；随机换向，像挺进地牢里边走边打的枪手。 */
  private strafe(e: EnemyBody, def: Readonly<EnemyDef>, target: ActorView, dt: number, scale: number): void {
    const s = def.strafe!,
      b = e.brain;
    b.flip -= dt;
    if (b.flip <= 0) {
      b.side = -b.side;
      b.flip = s.flip * (0.6 + this.host.random() * 0.8);
    }
    const dx = target.x - e.x,
      dy = target.y - e.y,
      d = Math.hypot(dx, dy) || 1;
    const ux = dx / d,
      uy = dy / d;
    const band = BALANCE.enemySeparation;
    const radial = d > s.range + band ? 1 : d < s.range - band ? -1 : 0;
    const vx = -uy * b.side + ux * radial,
      vy = ux * b.side + uy * radial;
    const len = Math.hypot(vx, vy) || 1;
    e.base.x = (vx / len) * def.moveSpeed * scale;
    e.base.y = (vy / len) * def.moveSpeed * scale;
  }

  private tickGas(e: EnemyBody, gas: NonNullable<EnemyDef['gas']>, dt: number): void {
    const b = e.brain;
    b.gas -= dt;
    if (b.gas > 0) return;
    b.gas += gas.every;
    this.host.zone(e, 'poison', gas.radius, gas.duration, gas.damage, gas.tick);
    this.host.act(e, 'gas', e.facing);
  }

  private inReach(e: EnemyBody, target: ActorView, range: number): boolean {
    const d = Math.hypot(target.x - e.x, target.y - e.y);
    return d <= range && this.host.lineOfSight(e.x, e.y, target.x, target.y);
  }
}

function setStage(e: EnemyBody, stage: ActorStage, time: number, span: number): void {
  e.stage = stage;
  e.stageSpan = span;
  e.stageTime = Math.min(span, Math.max(0, time));
}
