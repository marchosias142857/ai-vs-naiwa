import { BALANCE } from '../../data/balance';
import { CHARACTERS, type CharacterId } from '../../data/characters';
import { ENEMIES, type EnemyId } from '../../data/enemies';
import type { WeaponDef } from '../../data/schema';
import { WEAPONS } from '../../data/weapons';
import { chaseVelocity } from '../ai/chase';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { Random } from '../core/Random';
import type { EntityId, InputFrame, Team, Vec2 } from '../core/types';
import { getPattern, type BulletSink, type FireContext, type FirePattern } from '../weapons/patterns';
import type {
  ActorPhase,
  ActorView,
  BulletSpawn,
  CombatWorld,
  CombatWorldOptions,
  LineOfSight,
  StepResult,
} from './api';
import { AutoAim } from './autoAim';
import { stepVelocity, type MoveTuning } from './movement';

/** `step` 单帧最大时长，秒（ADR 0003）。 */
const MAX_DT = 0.05;
const DEFAULT_MAX_BULLETS = 500;

/** 实体的内部状态；对外以 `ActorView` 只读暴露。 */
interface Actor extends ActorView {
  id: EntityId;
  team: Team;
  kind: string;
  phase: ActorPhase;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  invulnerable: boolean;
  facing: number;
  /** 预警结束的 sim 时间。 */
  activateAt: number;
  /** 无敌结束的 sim 时间。 */
  invulnUntil: number;
  /** 受伤后的无敌时长（只有玩家大于 0）。 */
  invulnTime: number;
  /** 自主移动的速度（不含击退）。 */
  base: Vec2;
  /** 击退：剩余时间与当前速度。 */
  knockTime: number;
  knockVx: number;
  knockVy: number;
  moveSpeed: number;
  contactDamage: number;
}

interface Bullet {
  id: EntityId;
  team: Team;
  ownerId: EntityId;
  angle: number;
  damage: number;
  critChance: number;
  knockback: number;
  pierceLeft: number;
  /** 上一次命中的实体，避免穿透子弹在重叠的几帧里重复命中同一目标。 */
  lastTargetId: EntityId;
}

type MutableSpawn = { -readonly [K in keyof BulletSpawn]: BulletSpawn[K] };

interface PlayerState {
  weapon: Readonly<WeaponDef>;
  weaponId: string;
  pattern: FirePattern;
  cooldown: number;
  tuning: MoveTuning;
}

const alwaysVisible: LineOfSight = () => true;

class CombatWorldImpl implements CombatWorld {
  time = 0;
  readonly actors: Actor[] = [];
  playerId: EntityId | null = null;

  private nextId = 1;
  private readonly byId = new Map<EntityId, Actor>();
  private readonly bullets = new Map<EntityId, Bullet>();
  private readonly bulletPool: Bullet[] = [];
  private readonly spawnPool: MutableSpawn[] = [];
  private readonly spawns: MutableSpawn[] = [];
  private readonly result: { bulletSpawns: readonly BulletSpawn[]; playerDead: boolean };
  private readonly bus: EventBus<GameEvents>;
  private readonly maxBullets: number;
  private readonly spreadRng: Random;
  private readonly critRng: Random;
  private readonly autoAim: AutoAim;
  private player: PlayerState | null = null;
  private readonly lastMoveDir: Vec2 = { x: 1, y: 0 };
  private readonly fireCtx: FireContext;
  /** 当前开火者与武器，供 `sink` 读取；用字段而不是每次新建对象或闭包。 */
  private firingOwner: Actor | null = null;
  private firingWeapon: Readonly<WeaponDef> = WEAPONS.pistol_basic;
  private readonly sink: BulletSink = { add: (x, y, angle) => this.addBullet(x, y, angle) };

  constructor(options: CombatWorldOptions) {
    const root = new Random(options.seed);
    this.spreadRng = root.fork('spread');
    this.critRng = root.fork('crit');
    this.bus = options.bus;
    this.maxBullets = options.maxBullets ?? DEFAULT_MAX_BULLETS;
    this.autoAim = new AutoAim(BALANCE.autoAimRetargetInterval, options.lineOfSight ?? alwaysVisible);
    this.result = { bulletSpawns: this.spawns, playerDead: false };
    this.fireCtx = { x: 0, y: 0, aim: 0, weapon: WEAPONS.pistol_basic, rng: this.spreadRng };
  }

  getActor(id: EntityId): ActorView | undefined {
    return this.byId.get(id);
  }

  spawnPlayer(kind: CharacterId, x: number, y: number): EntityId {
    if (this.playerId !== null) throw new Error('本局已经有玩家');
    const def = CHARACTERS[kind];
    const weaponId = def.startWeapon;
    const weapon = WEAPONS[weaponId];
    const actor = this.createActor('player', kind, x, y, def.radius, def.hp, def.moveSpeed);
    actor.invulnTime = def.invulnTime;
    this.player = {
      weapon,
      weaponId,
      pattern: getPattern(weapon.pattern),
      cooldown: 0,
      tuning: { maxSpeed: def.moveSpeed, accelTime: def.accelTime, decelTime: def.decelTime },
    };
    this.playerId = actor.id;
    this.bus.emit('entity:spawned', { id: actor.id, team: 'player', kind, x, y, telegraph: 0 });
    this.activate(actor);
    return actor.id;
  }

  spawnEnemy(kind: EnemyId, x: number, y: number): EntityId {
    const def = ENEMIES[kind];
    const actor = this.createActor('enemy', kind, x, y, def.radius, def.hp, def.moveSpeed);
    actor.contactDamage = def.contactDamage;
    actor.phase = 'telegraph';
    actor.activateAt = this.time + BALANCE.spawnTelegraph;
    const telegraph = BALANCE.spawnTelegraph;
    this.bus.emit('entity:spawned', { id: actor.id, team: 'enemy', kind, x, y, telegraph });
    if (telegraph <= 0) this.activate(actor);
    return actor.id;
  }

  syncPosition(id: EntityId, x: number, y: number): void {
    const actor = this.byId.get(id);
    if (!actor) return;
    actor.x = x;
    actor.y = y;
  }

  step(dtRaw: number, input: Readonly<InputFrame>): StepResult {
    this.spawns.length = 0;
    const dt = Math.min(Math.max(dtRaw, 0), MAX_DT);
    if (dt > 0) {
      this.time += dt;
      for (const actor of this.actors) this.tickActor(actor, dt);
      this.updatePlayer(input, dt);
      this.updateEnemies();
      for (const actor of this.actors) this.applyVelocity(actor);
    }
    this.result.playerDead = this.isPlayerDead();
    return this.result;
  }

  hitActor(bulletId: EntityId, targetId: EntityId, x: number, y: number): boolean {
    const bullet = this.bullets.get(bulletId);
    if (!bullet) return true;
    const target = this.byId.get(targetId);
    if (!target || target.phase !== 'active' || target.team === bullet.team) return false;
    if (target.id === bullet.lastTargetId) return false;
    bullet.lastTargetId = target.id;

    if (target.invulnerable) {
      this.endBullet(bullet, x, y, target.id, false);
      return true;
    }
    const critical = this.critRng.chance(bullet.critChance);
    const amount = critical ? bullet.damage * BALANCE.critMultiplier : bullet.damage;
    const dirX = Math.cos(bullet.angle);
    const dirY = Math.sin(bullet.angle);
    this.damage(target, amount, critical, dirX, dirY, bullet.ownerId);
    const alive = target.phase === 'active';
    if (alive && bullet.knockback > 0) this.knockBack(target, dirX, dirY, bullet.knockback);

    if (bullet.pierceLeft > 0) {
      bullet.pierceLeft--;
      return false;
    }
    this.endBullet(bullet, x, y, target.id, critical);
    return true;
  }

  hitWall(bulletId: EntityId, x: number, y: number): void {
    const bullet = this.bullets.get(bulletId);
    if (bullet) this.endBullet(bullet, x, y, null, false);
  }

  releaseBullet(bulletId: EntityId): void {
    const bullet = this.bullets.get(bulletId);
    if (!bullet) return;
    this.bullets.delete(bulletId);
    this.bulletPool.push(bullet);
  }

  contact(enemyId: EntityId, playerId: EntityId): void {
    const enemy = this.byId.get(enemyId);
    const player = this.byId.get(playerId);
    if (!enemy || !player || enemy.team === player.team) return;
    if (enemy.phase !== 'active' || player.phase !== 'active') return;
    if (player.invulnerable || enemy.contactDamage <= 0) return;
    let dirX = player.x - enemy.x;
    let dirY = player.y - enemy.y;
    const d = Math.hypot(dirX, dirY);
    if (d > 0) {
      dirX /= d;
      dirY /= d;
    } else {
      dirX = 0;
      dirY = 1;
    }
    this.damage(player, enemy.contactDamage, false, dirX, dirY, enemy.id);
  }

  removeActor(id: EntityId): void {
    const actor = this.byId.get(id);
    if (!actor || actor.phase !== 'dead') return;
    this.byId.delete(id);
    const index = this.actors.indexOf(actor);
    const last = this.actors.pop();
    if (last && last !== actor) this.actors[index] = last;
  }

  // ---- 内部 ----

  private createActor(
    team: Team,
    kind: string,
    x: number,
    y: number,
    radius: number,
    hp: number,
    moveSpeed: number,
  ): Actor {
    const actor: Actor = {
      id: this.nextId++,
      team,
      kind,
      phase: 'active',
      x,
      y,
      vx: 0,
      vy: 0,
      radius,
      hp,
      maxHp: hp,
      invulnerable: false,
      facing: 0,
      activateAt: this.time,
      invulnUntil: 0,
      invulnTime: 0,
      base: { x: 0, y: 0 },
      knockTime: 0,
      knockVx: 0,
      knockVy: 0,
      moveSpeed,
      contactDamage: 0,
    };
    this.actors.push(actor);
    this.byId.set(actor.id, actor);
    return actor;
  }

  private activate(actor: Actor): void {
    actor.phase = 'active';
    const { id, team, kind, x, y } = actor;
    this.bus.emit('entity:activated', { id, team, kind, x, y });
  }

  private tickActor(actor: Actor, dt: number): void {
    if (actor.phase === 'telegraph' && this.time >= actor.activateAt) this.activate(actor);
    actor.invulnerable = actor.phase === 'active' && this.time < actor.invulnUntil;
    if (actor.knockTime > 0) {
      // 线性减速：速度与剩余时间成正比，走完的总距离等于武器的击退距离。
      const remaining = Math.max(0, actor.knockTime - dt);
      const k = remaining / actor.knockTime;
      actor.knockVx *= k;
      actor.knockVy *= k;
      actor.knockTime = remaining;
    }
  }

  private updatePlayer(input: Readonly<InputFrame>, dt: number): void {
    const p = this.player;
    const actor = this.playerId === null ? undefined : this.byId.get(this.playerId);
    if (!p || !actor || actor.phase !== 'active') return;

    stepVelocity(actor.base, input.move, p.tuning, dt);
    if (input.move.x !== 0 || input.move.y !== 0) {
      const len = Math.hypot(input.move.x, input.move.y);
      this.lastMoveDir.x = input.move.x / len;
      this.lastMoveDir.y = input.move.y / len;
    }

    // 朝向：手动瞄准 > 自动瞄准的目标 > 最后的移动方向。
    const target = this.autoAim.update('player', actor.x, actor.y, p.weapon.range, this.actors, this.time);
    if (input.aim && (input.aim.x !== 0 || input.aim.y !== 0)) {
      actor.facing = Math.atan2(input.aim.y, input.aim.x);
    } else if (target) {
      actor.facing = Math.atan2(target.y - actor.y, target.x - actor.x);
    } else {
      actor.facing = Math.atan2(this.lastMoveDir.y, this.lastMoveDir.x);
    }

    // 冷却：按住时连发并保留余量，保证射速准确；松开后冷却只减到 0，不会攒出连发。
    p.cooldown -= dt;
    if (!input.fire) {
      if (p.cooldown < 0) p.cooldown = 0;
      return;
    }
    while (p.cooldown <= 0) {
      this.fire(actor, p);
      p.cooldown += 1 / p.weapon.fireRate;
    }
  }

  private fire(owner: Actor, p: PlayerState): void {
    // 枪口：身体中心（脚底向上一个半径）沿朝向前移一个半径再加 2 像素。
    const reach = owner.radius + 2;
    const muzzleX = owner.x + Math.cos(owner.facing) * reach;
    const muzzleY = owner.y - owner.radius + Math.sin(owner.facing) * reach;
    this.fireCtx.x = muzzleX;
    this.fireCtx.y = muzzleY;
    this.fireCtx.aim = owner.facing;
    this.fireCtx.weapon = p.weapon;
    this.firingOwner = owner;
    this.firingWeapon = p.weapon;
    const before = this.spawns.length;
    p.pattern(this.fireCtx, this.sink);
    this.firingOwner = null;
    if (this.spawns.length > before) {
      this.bus.emit('weapon:fired', {
        ownerId: owner.id,
        weaponId: p.weaponId,
        x: muzzleX,
        y: muzzleY,
        angle: owner.facing,
      });
    }
  }

  private addBullet(x: number, y: number, angle: number): boolean {
    const owner = this.firingOwner;
    const weapon = this.firingWeapon;
    if (!owner || this.bullets.size >= this.maxBullets) return false;
    const id = this.nextId++;
    const bullet = this.bulletPool.pop() ?? ({} as Bullet);
    bullet.id = id;
    bullet.team = owner.team;
    bullet.ownerId = owner.id;
    bullet.angle = angle;
    bullet.damage = weapon.damage;
    bullet.critChance = weapon.critChance;
    bullet.knockback = weapon.knockback;
    bullet.pierceLeft = weapon.pierce;
    bullet.lastTargetId = 0;
    this.bullets.set(id, bullet);

    const spawn = this.spawnPool[this.spawns.length] ?? ({} as MutableSpawn);
    this.spawnPool[this.spawns.length] = spawn;
    spawn.id = id;
    spawn.team = owner.team;
    spawn.ownerId = owner.id;
    spawn.x = x;
    spawn.y = y;
    spawn.angle = angle;
    spawn.speed = weapon.bulletSpeed;
    spawn.radius = weapon.bulletRadius;
    spawn.lifetime = weapon.range / weapon.bulletSpeed;
    spawn.sprite = weapon.bulletSprite;
    this.spawns.push(spawn);
    return true;
  }

  private updateEnemies(): void {
    const player = this.playerId === null ? undefined : this.byId.get(this.playerId);
    const target = player && player.phase === 'active' ? player : null;
    for (const actor of this.actors) {
      if (actor.team !== 'enemy' || actor.phase !== 'active') continue;
      chaseVelocity(actor.base, actor, target, this.actors, actor.moveSpeed, BALANCE.enemySeparation);
      if (actor.base.x !== 0 || actor.base.y !== 0) actor.facing = Math.atan2(actor.base.y, actor.base.x);
    }
  }

  private applyVelocity(actor: Actor): void {
    if (actor.phase !== 'active') {
      actor.vx = 0;
      actor.vy = 0;
      return;
    }
    actor.vx = actor.base.x + actor.knockVx;
    actor.vy = actor.base.y + actor.knockVy;
  }

  private damage(
    target: Actor,
    amount: number,
    critical: boolean,
    dirX: number,
    dirY: number,
    sourceId: EntityId,
  ): void {
    target.hp = Math.max(0, target.hp - amount);
    if (target.invulnTime > 0) {
      target.invulnUntil = this.time + target.invulnTime;
      target.invulnerable = true;
    }
    this.bus.emit('entity:damaged', {
      id: target.id,
      team: target.team,
      amount,
      critical,
      hp: target.hp,
      maxHp: target.maxHp,
      x: target.x,
      y: target.y,
      dirX,
      dirY,
      sourceId,
    });
    if (target.hp > 0) return;
    target.phase = 'dead';
    target.invulnerable = false;
    target.knockTime = 0;
    target.knockVx = 0;
    target.knockVy = 0;
    target.base.x = 0;
    target.base.y = 0;
    this.applyVelocity(target);
    const { id, team, kind, x, y } = target;
    this.bus.emit('entity:died', { id, team, kind, x, y, killerId: sourceId });
  }

  private knockBack(target: Actor, dirX: number, dirY: number, distance: number): void {
    const t = BALANCE.knockbackTime;
    if (t <= 0) return;
    // 线性减速走完 distance：初速度 = 2 × 距离 ÷ 时间。
    const v = (2 * distance) / t;
    target.knockVx = dirX * v;
    target.knockVy = dirY * v;
    target.knockTime = t;
  }

  private endBullet(
    bullet: Bullet,
    x: number,
    y: number,
    targetId: EntityId | null,
    critical: boolean,
  ): void {
    this.bullets.delete(bullet.id);
    this.bulletPool.push(bullet);
    this.bus.emit('bullet:hit', { team: bullet.team, x, y, angle: bullet.angle, targetId, critical });
  }

  private isPlayerDead(): boolean {
    if (this.playerId === null) return false;
    return this.byId.get(this.playerId)?.phase === 'dead';
  }
}

/** 新建一局战斗（ADR 0003）。 */
export function createCombatWorldImpl(options: CombatWorldOptions): CombatWorld {
  return new CombatWorldImpl(options);
}
