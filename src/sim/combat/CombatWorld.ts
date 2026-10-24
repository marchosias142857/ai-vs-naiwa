import { LOOT_RULES } from '../../data/loot';
import { UPGRADES, type UpgradeId } from '../../data/player';
import { PlayerResources } from '../stats/PlayerResources';
import { ATTACKS, type AttackId } from '../../data/attacks';
import { BALANCE } from '../../data/balance';
import { CHARACTERS, type CharacterId } from '../../data/characters';
import { ENEMIES, type EnemyId } from '../../data/enemies';
import type { EnemyDef, WeaponDef } from '../../data/schema';
import { WEAPONS, type WeaponId } from '../../data/weapons';
import { createBrain, moveEnemy, type EnemyBrain } from '../ai/brain';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { Random } from '../core/Random';
import type { EntityId, InputFrame, Team, Vec2 } from '../core/types';
import { getPattern, type BulletSink, type FireContext, type FirePattern } from '../weapons/patterns';
import type {
  ActorPhase,
  ActorState,
  ActorView,
  BulletSpawn,
  CombatWorld,
  CombatWorldOptions,
  LineOfSight,
  CombatWorldState,
  StepResult,
} from './api';
import { stepVelocity, type MoveTuning } from './movement';
import { PayloadStack } from './payloads';

/** `step` 单帧最大时长，秒（ADR 0003）。 */
const MAX_DT = 0.05;
const DEFAULT_MAX_BULLETS = 500;
/** 每颗子弹预留的命中记录数；穿透数更大的武器会在第一次用到时扩容。 */
const HIT_RECORD_CAPACITY = 4;
/** 剩余击退距离小于这个值（像素）就视为走完。 */
const KNOCK_EPSILON = 1e-6;

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
  moveSpeed: number;
  contactDamage: number;
  knock: Knockback;
  brain: EnemyBrain;
  warning: boolean;
}

/**
 * 击退按「剩余距离」记账，而不是按速度衰减：
 * 每次 step 先扣掉上一段时间里实际走过的距离（上次给出的速度 × 本次 dt），再给出下一段的速度。
 * 这样首帧不会提前衰减，帧率高低都能按数据走完全程（前提见 `step` 的说明）。
 */
interface Knockback {
  dirX: number;
  dirY: number;
  /** 本次击退的总距离与剩余距离，像素。 */
  total: number;
  left: number;
  /** 剩余时间，秒。 */
  timeLeft: number;
  /** 上一次 step 给出的击退速度，像素/秒。 */
  speed: number;
  /** 刚被命中、还没有任何一段物理时间用过击退速度。 */
  fresh: boolean;
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
  /** 发射时的武器或敌方攻击定义 ID（ADR 0019：存档后用来重建子弹半径与外观）。 */
  source: string;
  /** 已经命中过的实体（每个目标最多命中一次），长度为 `hitCount`。 */
  hitIds: EntityId[];
  hitCount: number;
}

type MutableSpawn = { -readonly [K in keyof BulletSpawn]: BulletSpawn[K] };

interface PlayerState {
  weapon: Readonly<WeaponDef>;
  weaponId: WeaponId;
  pattern: FirePattern;
  cooldown: number;
  tuning: MoveTuning;
  burstLeft: number;
  burstWait: number;
}

const alwaysVisible: LineOfSight = () => true;

/**
 * 从射手身体中心指向目标碰撞圆心的角度。
 * 枪口在身体中心（脚底上移一个半径）沿这个方向前移，所以弹道正好穿过目标圆心；
 * 若按「脚底 → 脚底」算角度，弹道会整体平行上移一个射手半径，大体型射手的正中一发会擦过目标。
 */
function aimAngle(shooter: Readonly<Actor>, target: Readonly<Vec2>): number {
  return Math.atan2(target.y - (shooter.y - shooter.radius), target.x - shooter.x);
}

function newBullet(): Bullet {
  return {
    id: 0,
    team: 'player',
    ownerId: 0,
    angle: 0,
    damage: 0,
    critChance: 0,
    knockback: 0,
    pierceLeft: 0,
    hitIds: new Array<EntityId>(HIT_RECORD_CAPACITY).fill(0),
    hitCount: 0,
    source: '',
  };
}

function newSpawn(): MutableSpawn {
  return {
    id: 0,
    team: 'player',
    ownerId: 0,
    x: 0,
    y: 0,
    angle: 0,
    speed: 0,
    radius: 0,
    lifetime: 0,
    sprite: '',
  };
}

function newActor(): Actor {
  return {
    id: 0,
    team: 'enemy',
    kind: '',
    phase: 'dead',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 0,
    hp: 0,
    maxHp: 0,
    invulnerable: false,
    facing: 0,
    activateAt: 0,
    invulnUntil: 0,
    invulnTime: 0,
    base: { x: 0, y: 0 },
    moveSpeed: 0,
    contactDamage: 0,
    brain: createBrain(),
    warning: false,
    knock: { dirX: 0, dirY: 0, total: 0, left: 0, timeLeft: 0, speed: 0, fresh: false },
  };
}

function saveActor(a: Actor): ActorState {
  const k = a.knock,
    b = a.brain;
  return {
    id: a.id,
    team: a.team,
    kind: a.kind,
    phase: a.phase,
    x: a.x,
    y: a.y,
    vx: a.vx,
    vy: a.vy,
    radius: a.radius,
    hp: a.hp,
    maxHp: a.maxHp,
    invulnerable: a.invulnerable,
    facing: a.facing,
    activateAt: a.activateAt,
    invulnUntil: a.invulnUntil,
    invulnTime: a.invulnTime,
    baseX: a.base.x,
    baseY: a.base.y,
    moveSpeed: a.moveSpeed,
    contactDamage: a.contactDamage,
    knock: {
      dirX: k.dirX,
      dirY: k.dirY,
      total: k.total,
      left: k.left,
      timeLeft: k.timeLeft,
      speed: k.speed,
      fresh: k.fresh,
    },
    brain: { cooldown: b.cooldown, stage: b.stage, time: b.time, dirX: b.dirX, dirY: b.dirY },
    warning: a.warning,
  };
}

/** 写入一条预热的实体记录；复用记录上的 base / knock / brain 对象，不新建。 */
function loadActor(a: Actor, s: Readonly<ActorState>): void {
  a.id = s.id;
  a.team = s.team;
  a.kind = s.kind;
  a.phase = s.phase;
  a.x = s.x;
  a.y = s.y;
  a.vx = s.vx;
  a.vy = s.vy;
  a.radius = s.radius;
  a.hp = s.hp;
  a.maxHp = s.maxHp;
  a.invulnerable = s.invulnerable;
  a.facing = s.facing;
  a.activateAt = s.activateAt;
  a.invulnUntil = s.invulnUntil;
  a.invulnTime = s.invulnTime;
  a.base.x = s.baseX;
  a.base.y = s.baseY;
  a.moveSpeed = s.moveSpeed;
  a.contactDamage = s.contactDamage;
  Object.assign(a.knock, s.knock);
  Object.assign(a.brain, s.brain);
  a.warning = s.warning;
}

/** 每种事件一个 payload 复用栈。 */
function createPayloads() {
  return {
    spawned: new PayloadStack<GameEvents['entity:spawned']>(() => ({
      id: 0,
      team: 'player',
      kind: '',
      x: 0,
      y: 0,
      telegraph: 0,
    })),
    activated: new PayloadStack<GameEvents['entity:activated']>(() => ({
      id: 0,
      team: 'player',
      kind: '',
      x: 0,
      y: 0,
    })),
    damaged: new PayloadStack<GameEvents['entity:damaged']>(() => ({
      id: 0,
      team: 'player',
      amount: 0,
      critical: false,
      hp: 0,
      maxHp: 0,
      x: 0,
      y: 0,
      dirX: 0,
      dirY: 0,
      sourceId: null,
    })),
    died: new PayloadStack<GameEvents['entity:died']>(() => ({
      id: 0,
      team: 'player',
      kind: '',
      x: 0,
      y: 0,
      killerId: null,
    })),
    fired: new PayloadStack<GameEvents['weapon:fired']>(() => ({
      ownerId: 0,
      weaponId: '',
      x: 0,
      y: 0,
      angle: 0,
    })),
    hit: new PayloadStack<GameEvents['bullet:hit']>(() => ({
      team: 'player',
      x: 0,
      y: 0,
      angle: 0,
      targetId: null,
      critical: false,
    })),
  };
}

class CombatWorldImpl implements CombatWorld {
  time = 0;
  readonly actors: Actor[] = [];
  playerId: EntityId | null = null;

  private nextId = 1;
  private readonly actorPool: Actor[] = [];
  private readonly retired: Actor[] = [];
  private callDepth = 0;
  private readonly byId = new Map<EntityId, Actor>();
  private readonly bullets = new Map<EntityId, Bullet>();
  private readonly bulletPool: Bullet[] = [];
  private readonly spawnPool: MutableSpawn[] = [];
  private readonly spawns: MutableSpawn[] = [];
  private readonly result: { bulletSpawns: readonly BulletSpawn[]; playerDead: boolean };
  private readonly bus: EventBus<GameEvents>;
  private readonly payloads = createPayloads();
  private readonly maxBullets: number;
  private readonly godMode: boolean;
  private readonly spreadRng: Random;
  private readonly critRng: Random;
  private readonly lineOfSight: LineOfSight;
  private readonly navigation: CombatWorldOptions['navigation'];
  private readonly route = { x: 0, y: 0 };
  readonly resources: PlayerResources;
  secondaryWeapon: WeaponId | null = null;
  private readonly dashDirection = { x: 1, y: 0 };
  private readonly enemyGun = {
    weapon: ATTACKS.spit_single as Readonly<WeaponDef>,
    weaponId: 'spit_single',
    pattern: getPattern('single'),
  };
  private player: PlayerState | null = null;
  /** 玩家是否已在本局死亡。锁存：之后即使 `removeActor` 回收了玩家，也保持为 true。 */
  private playerDied = false;
  private readonly lastMoveDir: Vec2 = { x: 1, y: 0 };
  private readonly fireCtx: FireContext;
  /** 当前开火者与武器，供 `sink` 读取；用字段而不是每次新建对象或闭包。 */
  private firingOwner: Actor | null = null;
  private firingWeapon: Readonly<WeaponDef> = WEAPONS.pistol_basic;
  private firingSource = '';
  private readonly sink: BulletSink = { add: (x, y, angle) => this.addBullet(x, y, angle) };

  constructor(options: CombatWorldOptions) {
    const root = new Random(options.seed);
    const maxActors = options.maxActors ?? 31;
    if (!Number.isInteger(maxActors) || maxActors < 1) throw new RangeError('invalid maxActors');
    for (let i = 0; i < maxActors; i++) this.actorPool.push(newActor());
    this.resources = new PlayerResources(options.playerRules);
    this.spreadRng = root.fork('spread');
    this.critRng = root.fork('crit');
    this.bus = options.bus;
    this.maxBullets = options.maxBullets ?? DEFAULT_MAX_BULLETS;
    this.godMode = options.godMode ?? false;
    this.lineOfSight = options.lineOfSight ?? alwaysVisible;
    this.navigation = options.navigation;
    this.result = { bulletSpawns: this.spawns, playerDead: false };
    this.fireCtx = { x: 0, y: 0, aim: 0, weapon: WEAPONS.pistol_basic, rng: this.spreadRng };
    // 预热：子弹记录与输出对象一次建好，开火时只复用。
    for (let i = 0; i < this.maxBullets; i++) {
      this.bulletPool.push(newBullet());
      this.spawnPool.push(newSpawn());
    }
  }

  get weaponId(): WeaponId {
    return this.player?.weaponId ?? 'pistol_basic';
  }

  equipWeapon(id: WeaponId): boolean {
    const p = this.player;
    if (!p || this.playerDied || !Object.hasOwn(WEAPONS, id)) return false;
    p.weapon = WEAPONS[id];
    p.weaponId = id;
    p.pattern = getPattern(p.weapon.pattern);
    p.burstLeft = 0;
    return true;
  }

  takeWeapon(id: WeaponId): boolean {
    if (id === 'pistol_basic' || !this.equipWeapon(id)) return false;
    this.secondaryWeapon = id;
    return true;
  }
  grantPickup(kind: 'health' | 'energy' | 'coin', amount: number): boolean {
    const actor = this.playerId === null ? undefined : this.byId.get(this.playerId);
    if (!actor || actor.phase !== 'active' || !Number.isFinite(amount) || amount <= 0) return false;
    if (kind === 'health') {
      if (actor.hp >= actor.maxHp) return false;
      actor.hp = Math.min(actor.maxHp, actor.hp + amount);
    } else if (kind === 'energy') {
      if (this.resources.energy >= this.resources.maxEnergy) return false;
      this.resources.energy = Math.min(this.resources.maxEnergy, this.resources.energy + amount);
    } else this.resources.coins += amount;
    return true;
  }
  buySupplies(): boolean {
    const p = this.playerId === null ? undefined : this.byId.get(this.playerId),
      r = this.resources;
    if (
      !p ||
      p.phase !== 'active' ||
      r.coins < LOOT_RULES.shopPrice ||
      (p.hp >= p.maxHp && r.energy >= r.maxEnergy)
    )
      return false;
    r.coins -= LOOT_RULES.shopPrice;
    this.grantPickup('health', LOOT_RULES.shopHealth);
    this.grantPickup('energy', LOOT_RULES.shopEnergy);
    return true;
  }
  restorePlayer(progress: { hp: number; armor: number; energy: number; coins: number }): boolean {
    const p = this.playerId === null ? undefined : this.byId.get(this.playerId);
    if (!p || this.time !== 0 || p.phase !== 'active' || progress.hp <= 0) return false;
    for (const value of [progress.hp, progress.armor, progress.energy, progress.coins])
      if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) return false;
    p.hp = Math.min(p.maxHp, progress.hp);
    this.resources.armor = Math.min(this.resources.maxArmor, progress.armor);
    this.resources.energy = Math.min(this.resources.maxEnergy, progress.energy);
    this.resources.coins = progress.coins;
    return true;
  }

  upgrade(id: UpgradeId): boolean {
    const actor = this.playerId === null ? undefined : this.byId.get(this.playerId),
      p = this.player;
    if (!actor || !p || actor.phase !== 'active' || !Object.hasOwn(UPGRADES, id)) return false;
    const { stat, amount } = UPGRADES[id],
      r = this.resources;
    if (stat === 'damage') r.damageScale += amount;
    else if (stat === 'armor') {
      r.maxArmor += amount;
      r.armor = r.maxArmor;
    } else if (stat === 'health') {
      actor.maxHp += amount;
      actor.hp = actor.maxHp;
    } else if (stat === 'energy') {
      r.maxEnergy += amount;
      r.energy = r.maxEnergy;
    } else if (stat === 'speed') p.tuning.maxSpeed += amount;
    else if (stat === 'haste') r.fireRateScale += amount;
    else if (stat === 'regen') r.regenScale += amount;
    else r.skillScale += amount;
    return true;
  }

  getActor(id: EntityId): ActorView | undefined {
    return this.byId.get(id);
  }

  spawnPlayer(kind: CharacterId, x: number, y: number): EntityId {
    this.callDepth++;
    try {
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
        burstLeft: 0,
        burstWait: 0,
        tuning: { maxSpeed: def.moveSpeed, accelTime: def.accelTime, decelTime: def.decelTime },
      };
      this.playerId = actor.id;
      this.emitSpawned(actor, 0);
      this.activate(actor);
      return actor.id;
    } finally {
      this.callDepth--;
      if (!this.callDepth) while (this.retired.length) this.actorPool.push(this.retired.pop()!);
    }
  }

  spawnEnemy(kind: EnemyId, x: number, y: number): EntityId {
    this.callDepth++;
    try {
      const def = ENEMIES[kind];
      const actor = this.createActor('enemy', kind, x, y, def.radius, def.hp, def.moveSpeed);
      const telegraph = BALANCE.spawnTelegraph;
      actor.contactDamage = def.contactDamage;
      actor.phase = 'telegraph';
      actor.activateAt = this.time + telegraph;
      this.emitSpawned(actor, telegraph);
      if (telegraph <= 0) this.activate(actor);
      return actor.id;
    } finally {
      this.callDepth--;
      if (!this.callDepth) while (this.retired.length) this.actorPool.push(this.retired.pop()!);
    }
  }

  syncPosition(id: EntityId, x: number, y: number): void {
    const actor = this.byId.get(id);
    if (!actor) return;
    actor.x = x;
    actor.y = y;
  }

  step(dtRaw: number, input: Readonly<InputFrame>): StepResult {
    this.callDepth++;
    try {
      this.spawns.length = 0;
      const dt = Math.min(Math.max(dtRaw, 0), MAX_DT);
      if (dt > 0) {
        this.time += dt;
        for (const actor of this.actors) this.tickActor(actor, dt);
        this.updatePlayer(input, dt);
        this.updateEnemies(dt);
        for (const actor of this.actors) this.applyVelocity(actor);
      }
      this.result.playerDead = this.playerDied;
      return this.result;
    } finally {
      this.callDepth--;
      if (!this.callDepth) while (this.retired.length) this.actorPool.push(this.retired.pop()!);
    }
  }

  hitActor(bulletId: EntityId, targetId: EntityId, x: number, y: number): boolean {
    this.callDepth++;
    try {
      const bullet = this.bullets.get(bulletId);
      if (!bullet) return true;
      const target = this.byId.get(targetId);
      if (!target || target.phase !== 'active' || target.team === bullet.team) return false;
      // 每颗子弹对每个目标最多命中一次：重叠的几帧里、或 A → B → A 的回调顺序都不会重复伤害。
      if (this.alreadyHit(bullet, target.id)) return false;
      this.recordHit(bullet, target.id);

      if (this.ignoresDamage(target)) {
        this.emitHit(bullet, x, y, target.id, false);
        this.finishBullet(bullet);
        return true;
      }
      const critical = this.critRng.chance(bullet.critChance);
      const amount = critical ? bullet.damage * BALANCE.critMultiplier : bullet.damage;
      const dirX = Math.cos(bullet.angle);
      const dirY = Math.sin(bullet.angle);
      this.damage(target, amount, critical, dirX, dirY, bullet.ownerId);
      const alive = target.phase === 'active';
      if (alive && bullet.knockback > 0) this.knockBack(target, dirX, dirY, bullet.knockback);
      // 穿透时也发 bullet:hit（顺序仍是 damaged →（died）→ hit），子弹是否结束看返回值。
      this.emitHit(bullet, x, y, target.id, critical);

      if (bullet.pierceLeft > 0) {
        bullet.pierceLeft--;
        return false;
      }
      this.finishBullet(bullet);
      return true;
    } finally {
      this.callDepth--;
      if (!this.callDepth) while (this.retired.length) this.actorPool.push(this.retired.pop()!);
    }
  }

  hitWall(bulletId: EntityId, x: number, y: number): void {
    // 计入调用深度：bullet:hit 的同步监听器里调用 save 会被拒绝（ADR 0019：不在调用中途存档）。
    this.callDepth++;
    try {
      const bullet = this.bullets.get(bulletId);
      if (!bullet) return;
      this.emitHit(bullet, x, y, null, false);
      this.finishBullet(bullet);
    } finally {
      this.callDepth--;
      if (!this.callDepth) while (this.retired.length) this.actorPool.push(this.retired.pop()!);
    }
  }

  releaseBullet(bulletId: EntityId): void {
    const bullet = this.bullets.get(bulletId);
    if (bullet) this.finishBullet(bullet);
  }

  contact(enemyId: EntityId, playerId: EntityId): void {
    this.callDepth++;
    try {
      const enemy = this.byId.get(enemyId);
      const player = this.byId.get(playerId);
      if (!enemy || !player || enemy.team === player.team) return;
      if (enemy.phase !== 'active' || player.phase !== 'active') return;
      if (this.ignoresDamage(player) || enemy.contactDamage <= 0) return;
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
    } finally {
      this.callDepth--;
      if (!this.callDepth) while (this.retired.length) this.actorPool.push(this.retired.pop()!);
    }
  }

  debugKillEnemies(): void {
    this.callDepth++;
    try {
      // 倒序遍历：监听器在 entity:died 里同步调用 removeActor 移除当前实体时，不会跳过其他实体。
      for (let i = this.actors.length - 1; i >= 0; i--) {
        const actor = this.actors[i];
        if (!actor || actor.team !== 'enemy' || actor.phase === 'dead') continue;
        // 预警中的怪物没有碰撞，也一并清掉；按正常流程扣光生命，事件顺序与真实死亡相同。
        this.damage(actor, actor.hp, false, 0, 0, null);
      }
    } finally {
      this.callDepth--;
      if (!this.callDepth) while (this.retired.length) this.actorPool.push(this.retired.pop()!);
    }
  }

  removeActor(id: EntityId): void {
    const actor = this.byId.get(id);
    if (!actor || actor.phase !== 'dead') return;
    this.byId.delete(id);
    const index = this.actors.indexOf(actor);
    const last = this.actors.pop();
    if (last && last !== actor) this.actors[index] = last;
    if (this.callDepth) this.retired.push(actor);
    else this.actorPool.push(actor);
  }

  save(): CombatWorldState {
    if (this.callDepth) throw new Error('不能在战斗调用的事件回调里存档');
    const p = this.player,
      r = this.resources;
    const bullets: CombatWorldState['bullets'] = [];
    for (const b of this.bullets.values())
      bullets.push({
        id: b.id,
        team: b.team,
        ownerId: b.ownerId,
        source: b.source,
        angle: b.angle,
        damage: b.damage,
        critChance: b.critChance,
        knockback: b.knockback,
        pierceLeft: b.pierceLeft,
        hitIds: b.hitIds.slice(0, b.hitCount),
      });
    return {
      time: this.time,
      nextId: this.nextId,
      playerId: this.playerId,
      playerDied: this.playerDied,
      secondaryWeapon: this.secondaryWeapon,
      player: p && {
        weaponId: p.weaponId,
        cooldown: p.cooldown,
        burstLeft: p.burstLeft,
        burstWait: p.burstWait,
        maxSpeed: p.tuning.maxSpeed,
        accelTime: p.tuning.accelTime,
        decelTime: p.tuning.decelTime,
      },
      lastMoveDir: { x: this.lastMoveDir.x, y: this.lastMoveDir.y },
      dashDirection: { x: this.dashDirection.x, y: this.dashDirection.y },
      resources: r.save(),
      rng: { spread: this.spreadRng.snapshot, crit: this.critRng.snapshot },
      actors: this.actors.map(saveActor),
      bullets,
    };
  }

  load(state: Readonly<CombatWorldState>): void {
    if (this.time !== 0 || this.actors.length || this.bullets.size || this.playerId !== null)
      throw new Error('只能把存档写入刚创建的世界');
    if (state.actors.length > this.actorPool.length || state.bullets.length > this.bulletPool.length)
      throw new RangeError('存档超出实体或子弹容量');
    this.time = state.time;
    this.nextId = state.nextId;
    this.playerId = state.playerId;
    this.playerDied = state.playerDied;
    this.result.playerDead = state.playerDied;
    this.secondaryWeapon = state.secondaryWeapon;
    const p = state.player;
    this.player = p && {
      weapon: WEAPONS[p.weaponId],
      weaponId: p.weaponId,
      pattern: getPattern(WEAPONS[p.weaponId].pattern),
      cooldown: p.cooldown,
      burstLeft: p.burstLeft,
      burstWait: p.burstWait,
      tuning: { maxSpeed: p.maxSpeed, accelTime: p.accelTime, decelTime: p.decelTime },
    };
    this.lastMoveDir.x = state.lastMoveDir.x;
    this.lastMoveDir.y = state.lastMoveDir.y;
    this.dashDirection.x = state.dashDirection.x;
    this.dashDirection.y = state.dashDirection.y;
    this.resources.load(state.resources);
    this.spreadRng.restore(state.rng.spread);
    this.critRng.restore(state.rng.crit);
    for (const a of state.actors) {
      const actor = this.actorPool.pop()!;
      loadActor(actor, a);
      this.actors.push(actor);
      this.byId.set(actor.id, actor);
    }
    for (const b of state.bullets) {
      const bullet = this.bulletPool.pop()!;
      bullet.id = b.id;
      bullet.team = b.team;
      bullet.ownerId = b.ownerId;
      bullet.source = b.source;
      bullet.angle = b.angle;
      bullet.damage = b.damage;
      bullet.critChance = b.critChance;
      bullet.knockback = b.knockback;
      bullet.pierceLeft = b.pierceLeft;
      bullet.hitCount = 0;
      for (const id of b.hitIds) this.recordHit(bullet, id);
      this.bullets.set(bullet.id, bullet);
    }
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
    const actor = this.actorPool.pop();
    if (!actor) throw new Error('combat actor pool exhausted');
    actor.id = this.nextId++;
    actor.team = team;
    actor.kind = kind;
    actor.phase = 'active';
    actor.x = x;
    actor.y = y;
    actor.vx = actor.vy = 0;
    actor.radius = radius;
    actor.hp = actor.maxHp = hp;
    actor.invulnerable = false;
    actor.facing = 0;
    actor.activateAt = this.time;
    actor.invulnUntil = actor.invulnTime = 0;
    actor.base.x = actor.base.y = 0;
    actor.moveSpeed = moveSpeed;
    actor.contactDamage = 0;
    actor.brain.cooldown = BALANCE.spawnTelegraph;
    actor.brain.stage = 'ready';
    actor.brain.time = actor.brain.dirX = actor.brain.dirY = 0;
    actor.warning = false;
    const k = actor.knock;
    k.dirX = k.dirY = k.total = k.left = k.timeLeft = k.speed = 0;
    k.fresh = false;
    this.actors.push(actor);
    this.byId.set(actor.id, actor);
    return actor;
  }

  private activate(actor: Actor): void {
    actor.phase = 'active';
    const p = this.payloads.activated.acquire();
    try {
      p.id = actor.id;
      p.team = actor.team;
      p.kind = actor.kind;
      p.x = actor.x;
      p.y = actor.y;
      this.bus.emit('entity:activated', p);
    } finally {
      this.payloads.activated.release();
    }
  }

  private tickActor(actor: Actor, dt: number): void {
    if (actor.phase === 'telegraph' && this.time >= actor.activateAt) this.activate(actor);
    actor.invulnerable = actor.phase === 'active' && this.time < actor.invulnUntil;
    this.tickKnockback(actor.knock, dt);
  }

  /** 扣掉上一段时间里实际走过的击退距离，并给出下一段的击退速度。 */
  private tickKnockback(k: Knockback, dt: number): void {
    if (k.left <= 0) return;
    if (k.fresh) {
      // 命中发生在上一段物理时间之后，那段时间还没有用到击退速度，不扣距离也不扣时间。
      k.fresh = false;
    } else {
      k.left -= k.speed * dt;
      k.timeLeft -= dt;
    }
    if (k.left <= KNOCK_EPSILON) {
      k.left = 0;
      k.speed = 0;
      return;
    }
    const T = BALANCE.knockbackTime;
    if (k.timeLeft <= dt) {
      // 最后一段：假设下一段物理时间与本次 dt 相同，在其中走完剩余距离。
      k.speed = k.left / dt;
      return;
    }
    // 线性减速曲线 v(τ) = v0 × (1 − τ / T) 在下一段 [τ, τ + dt] 的平均速度，
    // 再按「实际剩余距离 ÷ 曲线上的剩余距离」校正，抵消之前各段的误差。
    const v0 = (2 * k.total) / T;
    const tau = T - k.timeLeft;
    const ideal = (v0 * k.timeLeft * k.timeLeft) / (2 * T);
    const average = v0 * (1 - (tau + dt / 2) / T);
    k.speed = Math.max(0, average * (k.left / ideal));
  }

  private updatePlayer(input: Readonly<InputFrame>, dt: number): void {
    const p = this.player;
    const actor = this.playerId === null ? undefined : this.byId.get(this.playerId);
    if (!p || !actor || actor.phase !== 'active') return;

    const r = this.resources;
    r.step(dt);
    if (input.swapPressed && this.secondaryWeapon)
      this.equipWeapon(p.weaponId === 'pistol_basic' ? this.secondaryWeapon : 'pistol_basic');
    if (input.skillPressed && r.skill()) {
      const moving = Math.hypot(input.move.x, input.move.y);
      this.dashDirection.x = moving ? input.move.x / moving : Math.cos(actor.facing);
      this.dashDirection.y = moving ? input.move.y / moving : Math.sin(actor.facing);
      actor.invulnUntil = Math.max(actor.invulnUntil, this.time + r.dashRemaining);
      actor.invulnerable = true;
    }
    if (r.dashRemaining > 0 && r.rules) {
      actor.base.x = this.dashDirection.x * r.rules.dashSpeed;
      actor.base.y = this.dashDirection.y * r.rules.dashSpeed;
    } else stepVelocity(actor.base, input.move, p.tuning, dt);
    // 朝向（ADR 0020）：正在瞄准 > 正在移动 > 保持上一次的朝向。玩家没有自动瞄准，aim 为 null 时朝面向开火。
    if (input.aim && (input.aim.x !== 0 || input.aim.y !== 0)) {
      actor.facing = Math.atan2(input.aim.y, input.aim.x);
    } else if (input.move.x !== 0 || input.move.y !== 0) {
      const len = Math.hypot(input.move.x, input.move.y);
      this.lastMoveDir.x = input.move.x / len;
      this.lastMoveDir.y = input.move.y / len;
      actor.facing = Math.atan2(this.lastMoveDir.y, this.lastMoveDir.x);
    }

    // 冷却：按住时连发并保留余量，保证射速准确；松开后冷却只减到 0，不会攒出连发。
    p.cooldown -= dt;
    if (p.burstLeft > 0) {
      p.burstWait -= dt;
      while (p.burstLeft > 0 && p.burstWait <= 0) {
        this.fire(actor, p);
        p.burstLeft--;
        p.burstWait += p.weapon.burstInterval ?? 1 / p.weapon.fireRate;
      }
    }
    if (!input.fire) {
      if (p.cooldown < 0) p.cooldown = 0;
      return;
    }
    while (p.cooldown <= 0) {
      this.fire(actor, p);
      if (p.weapon.pattern === 'burst') {
        p.burstLeft = p.weapon.pellets - 1;
        p.burstWait = p.weapon.burstInterval ?? 1 / p.weapon.fireRate;
      }
      p.cooldown += 1 / (p.weapon.fireRate * r.fireRateScale);
    }
  }

  private fire(
    owner: Actor,
    p: { weapon: Readonly<WeaponDef>; weaponId: string; pattern: FirePattern },
  ): void {
    if (owner.team === 'player' && !this.resources.canFire(p.weapon.energyCost)) return;
    // 枪口：身体中心（脚底向上一个半径）沿朝向前移一个半径再加 2 像素。
    const reach = owner.radius + 2;
    const muzzleX = owner.x + Math.cos(owner.facing) * reach;
    const muzzleY = owner.y - owner.radius + Math.sin(owner.facing) * reach;
    this.fireCtx.x = muzzleX;
    this.fireCtx.y = muzzleY;
    this.fireCtx.aim = owner.facing;
    this.fireCtx.weapon = p.weapon;
    this.fireCtx.pelletCount = p.weapon.pattern === 'burst' ? 1 : p.weapon.pellets;
    this.firingOwner = owner;
    this.firingWeapon = p.weapon;
    this.firingSource = p.weaponId;
    const before = this.spawns.length;
    p.pattern(this.fireCtx, this.sink);
    this.firingOwner = null;
    if (this.spawns.length === before) return;
    if (owner.team === 'player') this.resources.spend(p.weapon.energyCost);
    const e = this.payloads.fired.acquire();
    try {
      e.ownerId = owner.id;
      e.weaponId = p.weaponId;
      e.x = muzzleX;
      e.y = muzzleY;
      e.angle = owner.facing;
      this.bus.emit('weapon:fired', e);
    } finally {
      this.payloads.fired.release();
    }
  }

  private addBullet(x: number, y: number, angle: number): boolean {
    const owner = this.firingOwner;
    const weapon = this.firingWeapon;
    if (!owner) return false;
    const spawn = this.spawnPool[this.spawns.length];
    if (!spawn) return false;
    const bullet = this.bulletPool.pop();
    if (!bullet) return false;
    const id = this.nextId++;
    bullet.id = id;
    bullet.team = owner.team;
    bullet.ownerId = owner.id;
    bullet.angle = angle;
    bullet.damage = weapon.damage * (owner.team === 'player' ? this.resources.damageScale : 1);
    bullet.critChance = weapon.critChance;
    bullet.knockback = weapon.knockback;
    bullet.pierceLeft = weapon.pierce;
    bullet.source = this.firingSource;
    bullet.hitCount = 0;
    this.bullets.set(id, bullet);

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

  private alreadyHit(bullet: Bullet, id: EntityId): boolean {
    for (let i = 0; i < bullet.hitCount; i++) if (bullet.hitIds[i] === id) return true;
    return false;
  }

  private recordHit(bullet: Bullet, id: EntityId): void {
    // 容量按武器的穿透数有界（pierce + 1）；超出预留时扩容一次，之后复用。
    bullet.hitIds[bullet.hitCount++] = id;
  }

  private finishBullet(bullet: Bullet): void {
    this.bullets.delete(bullet.id);
    this.bulletPool.push(bullet);
  }

  private updateEnemies(dt: number): void {
    const player = this.playerId === null ? undefined : this.byId.get(this.playerId);
    const target = player && player.phase === 'active' ? player : null;
    for (const actor of this.actors) {
      if (actor.team !== 'enemy' || actor.phase !== 'active') continue;
      const def: Readonly<EnemyDef> = ENEMIES[actor.kind as EnemyId];
      let attack = def.attack,
        speedScale = 1;
      if (def.phases)
        for (const phase of def.phases)
          if (actor.hp / actor.maxHp <= phase.belowHp) {
            attack = phase.attack;
            speedScale = phase.speedScale;
          }
      moveEnemy(actor.base, actor, target, this.actors, def, actor.brain, dt, speedScale);
      // 只调整向目标接近的自主移动；炮台、后退和锁定冲锋保持原行为，击退稍后叠加。
      if (
        target &&
        def.behavior !== 'charge_dash' &&
        actor.base.x * (target.x - actor.x) + actor.base.y * (target.y - actor.y) > 0 &&
        this.navigation?.(actor.x, actor.y, target.x, target.y, actor.radius, this.route)
      ) {
        const dx = this.route.x - actor.x,
          dy = this.route.y - actor.y,
          distance = Math.hypot(dx, dy);
        const speed = Math.hypot(actor.base.x, actor.base.y);
        actor.base.x = distance ? (dx / distance) * speed : 0;
        actor.base.y = distance ? (dy / distance) * speed : 0;
      }
      actor.warning = actor.brain.stage === 'windup';
      if (actor.base.x !== 0 || actor.base.y !== 0) actor.facing = Math.atan2(actor.base.y, actor.base.x);
      if (!target || !attack || actor.brain.cooldown > 0) continue;
      const weapon = ATTACKS[attack as AttackId];
      if (
        !weapon ||
        Math.hypot(target.x - actor.x, target.y - actor.y) > weapon.range ||
        !this.lineOfSight(actor.x, actor.y, target.x, target.y)
      )
        continue;
      actor.facing = aimAngle(actor, target);
      this.enemyGun.weapon = weapon;
      this.enemyGun.weaponId = attack;
      this.enemyGun.pattern = getPattern(weapon.pattern);
      this.fire(actor, this.enemyGun);
      actor.brain.cooldown = 1 / weapon.fireRate;
    }
  }

  private applyVelocity(actor: Actor): void {
    if (actor.phase !== 'active') {
      actor.vx = 0;
      actor.vy = 0;
      return;
    }
    const k = actor.knock;
    actor.vx = actor.base.x + k.dirX * k.speed;
    actor.vy = actor.base.y + k.dirY * k.speed;
  }

  private damage(
    target: Actor,
    amount: number,
    critical: boolean,
    dirX: number,
    dirY: number,
    sourceId: EntityId | null,
  ): void {
    const healthDamage = target.id === this.playerId ? this.resources.absorb(amount) : amount;
    target.hp = Math.max(0, target.hp - healthDamage);
    if (target.invulnTime > 0) {
      target.invulnUntil = this.time + target.invulnTime;
      target.invulnerable = true;
    }
    const e = this.payloads.damaged.acquire();
    try {
      e.id = target.id;
      e.team = target.team;
      e.amount = amount;
      e.critical = critical;
      e.hp = target.hp;
      e.maxHp = target.maxHp;
      e.x = target.x;
      e.y = target.y;
      e.dirX = dirX;
      e.dirY = dirY;
      e.sourceId = sourceId;
      this.bus.emit('entity:damaged', e);
    } finally {
      this.payloads.damaged.release();
    }
    if (target.hp > 0) return;

    target.phase = 'dead';
    target.invulnerable = false;
    target.knock.left = 0;
    target.knock.speed = 0;
    target.base.x = 0;
    target.base.y = 0;
    this.applyVelocity(target);
    if (target.id === this.playerId) this.playerDied = true;
    const d = this.payloads.died.acquire();
    try {
      d.id = target.id;
      d.team = target.team;
      d.kind = target.kind;
      d.x = target.x;
      d.y = target.y;
      d.killerId = sourceId;
      this.bus.emit('entity:died', d);
    } finally {
      this.payloads.died.release();
    }
  }

  /** 受伤无敌帧，或调试无敌（`godMode`）下的玩家。 */
  private ignoresDamage(target: Actor): boolean {
    return target.invulnerable || (this.godMode && target.id === this.playerId);
  }

  private knockBack(target: Actor, dirX: number, dirY: number, distance: number): void {
    if (BALANCE.knockbackTime <= 0) return;
    const k = target.knock;
    k.dirX = dirX;
    k.dirY = dirY;
    k.total = distance;
    k.left = distance;
    k.timeLeft = BALANCE.knockbackTime;
    k.speed = 0;
    k.fresh = true;
  }

  private emitSpawned(actor: Actor, telegraph: number): void {
    const p = this.payloads.spawned.acquire();
    try {
      p.id = actor.id;
      p.team = actor.team;
      p.kind = actor.kind;
      p.x = actor.x;
      p.y = actor.y;
      p.telegraph = telegraph;
      this.bus.emit('entity:spawned', p);
    } finally {
      this.payloads.spawned.release();
    }
  }

  private emitHit(bullet: Bullet, x: number, y: number, targetId: EntityId | null, critical: boolean): void {
    const p = this.payloads.hit.acquire();
    try {
      p.team = bullet.team;
      p.x = x;
      p.y = y;
      p.angle = bullet.angle;
      p.targetId = targetId;
      p.critical = critical;
      this.bus.emit('bullet:hit', p);
    } finally {
      this.payloads.hit.release();
    }
  }
}

/** 新建一局战斗（ADR 0003）。 */
export function createCombatWorldImpl(options: CombatWorldOptions): CombatWorld {
  return new CombatWorldImpl(options);
}
