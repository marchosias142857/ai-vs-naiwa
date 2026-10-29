import { playerMuzzle } from '../weapons/muzzle';
import { sectorHitsCircle, segmentDistance } from '../weapons/melee';
import type { MeleeState } from './api';
import { LOOT_RULES } from '../../data/loot';
import { UPGRADES, type UpgradeId } from '../../data/player';
import { PlayerResources } from '../stats/PlayerResources';
import { ATTACKS, type AttackId } from '../../data/attacks';
import { BALANCE } from '../../data/balance';
import { CHARACTERS, type CharacterId } from '../../data/characters';
import { characterArtFor } from '../../data/characterArt';
import { ENEMIES, type EnemyId } from '../../data/enemies';
import type { EnemyDef, WeaponDef } from '../../data/schema';
import type { UpgradeDef } from '../../data/schema/player';
import { WEAPONS, type WeaponId } from '../../data/weapons';
import { createBrain, resetBrain, type EnemyBrain } from '../ai/brain';
import { EnemyAi, type AiHost } from '../ai/EnemyAi';
import { createGeometryHit, GeometryMask } from '../geometry/RoomGeometry';
import type { EnemyAction } from '../core/events';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { Random } from '../core/Random';
import type { EntityId, InputFrame, Team, Vec2 } from '../core/types';
import { getPattern, type BulletSink, type FireContext, type FirePattern } from '../weapons/patterns';
import { Arsenal, type ArsenalHost } from '../weapons/Arsenal';
import { Traps, standingBarrel, type TrapHost } from '../room/Traps';
import type {
  ActorMove,
  ActorStage,
  ActorPhase,
  ActorPose,
  ActorState,
  ActorView,
  BeamView,
  BulletSpawn,
  CombatWorld,
  CombatWorldOptions,
  LineOfSight,
  CombatWorldState,
  RockState,
  RockView,
  ShotView,
  StepResult,
  TrapLayoutInput,
  TrapView,
  ZoneKind,
  ZoneState,
  ZoneView,
} from './api';
import { stepVelocity, type MoveTuning } from './movement';
import { PayloadStack } from './payloads';
import type { TalentModifiers } from '../meta/talents';

/** `step` 单帧最大时长，秒（ADR 0003）。 */
const MAX_DT = 0.05;
const DEFAULT_MAX_BULLETS = 500;
/** 每颗子弹预留的命中记录数；穿透数更大的武器会在第一次用到时扩容。 */
const HIT_RECORD_CAPACITY = 4;
/** 剩余击退距离小于这个值（像素）就视为走完。 */
const KNOCK_EPSILON = 1e-6;
/** 爆炸把目标推开的距离，像素。 */
const EXPLOSION_KNOCKBACK = 12;
/** 找石块落点的重试次数；石块雨的预警时长最多再延长这么多倍。 */
const ROCK_ATTEMPTS = 8;
const ROCK_STAGGER = 0.6;
/** 判断冲撞撞到什么时，往前探的距离，像素。 */
const CRASH_REACH = 6;

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
  pose: ActorPose;
  lift: number;
  aim: number;
  move: ActorMove;
  stage: ActorStage;
  stageTime: number;
  stageSpan: number;
  aimLocked: boolean;
  landX: number;
  landY: number;
  /** 召唤者编号；0 表示不是被召唤出来的。 */
  parentId: number;
  chill: number;
  frozen: boolean;
  /** 冰冻层数、每层减速、清零倒计时、冻结剩余秒数（ADR 0031）。 */
  status: { stacks: number; per: number; time: number; freeze: number };
  /** 本步机关给的移动倍率与推力（ADR 0032），每步重算，不存档。 */
  trapSlow: number;
  pushX: number;
  pushY: number;
}

interface Zone extends ZoneView, ZoneState {
  active: boolean;
  team: Team;
  kind: ZoneKind;
  x: number;
  y: number;
  radius: number;
  remaining: number;
  duration: number;
}

interface Rock extends RockView, RockState {
  active: boolean;
  landed: boolean;
  x: number;
  y: number;
  radius: number;
  time: number;
  fall: number;
  life: number;
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
  /** 已蓄力秒数、射速预热秒数（ADR 0031）。 */
  charge: number;
  spin: number;
}

const alwaysVisible: LineOfSight = () => true;

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
    pose: 'idle',
    lift: 0,
    aim: 0,
    move: 'none',
    stage: 'ready',
    stageTime: 0,
    stageSpan: 0,
    aimLocked: false,
    landX: 0,
    landY: 0,
    parentId: 0,
    chill: 0,
    frozen: false,
    status: { stacks: 0, per: 0, time: 0, freeze: 0 },
    trapSlow: 1,
    pushX: 0,
    pushY: 0,
    knock: { dirX: 0, dirY: 0, total: 0, left: 0, timeLeft: 0, speed: 0, fresh: false },
  };
}

function newRock(slot: number): Rock {
  return { slot, active: false, landed: false, x: 0, y: 0, radius: 0, time: 0, fall: 0, life: 0, damage: 0 };
}

function saveZone(z: Readonly<Zone>): ZoneState {
  const { slot, team, kind, x, y, radius, remaining, duration, damage, tick, wait } = z;
  return { slot, team, kind, x, y, radius, remaining, duration, damage, tick, wait };
}

function saveRock(r: Readonly<Rock>): RockState {
  const { slot, landed, x, y, radius, time, fall, life, damage } = r;
  return { slot, landed, x, y, radius, time, fall, life, damage };
}

function newZone(slot: number): Zone {
  return {
    slot,
    active: false,
    team: 'enemy',
    kind: 'poison',
    x: 0,
    y: 0,
    radius: 0,
    remaining: 0,
    duration: 0,
    damage: 0,
    tick: 0,
    wait: 0,
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
    brain: { ...b },
    warning: a.warning,
    pose: a.pose,
    lift: a.lift,
    aim: a.aim,
    move: a.move,
    parentId: a.parentId,
    status: { ...a.status },
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
  a.pose = s.pose;
  a.lift = s.lift;
  a.aim = s.aim;
  a.move = s.move;
  a.parentId = s.parentId;
  Object.assign(a.status, s.status);
  refreshChill(a);
}

/** 由冰冻状态算出给表现层看的减速比例与冻结标记。 */
function refreshChill(a: Actor): void {
  a.frozen = a.status.freeze > 0;
  a.chill = a.frozen ? 1 : Math.min(1, a.status.stacks * a.status.per);
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
    swung: new PayloadStack<GameEvents['weapon:swung']>(() => ({
      ownerId: 0,
      weaponId: '',
      x: 0,
      y: 0,
      angle: 0,
      duration: 0,
      range: 0,
      arcDegrees: 0,
    })),
    meleeHit: new PayloadStack<GameEvents['melee:hit']>(() => ({
      team: 'player',
      x: 0,
      y: 0,
      angle: 0,
      targetId: 0,
      critical: false,
    })),
    hit: new PayloadStack<GameEvents['bullet:hit']>(() => ({
      team: 'player',
      x: 0,
      y: 0,
      angle: 0,
      targetId: null,
      critical: false,
    })),
    chained: new PayloadStack<GameEvents['weapon:chained']>(() => ({
      team: 'player',
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
    })),
    exploded: new PayloadStack<GameEvents['combat:exploded']>(() => ({
      team: 'enemy',
      x: 0,
      y: 0,
      radius: 0,
    })),
    acted: new PayloadStack<GameEvents['enemy:acted']>(() => ({
      id: 0,
      kind: '',
      action: 'hop',
      x: 0,
      y: 0,
      angle: 0,
    })),
  };
}

class CombatWorldImpl implements CombatWorld {
  readonly melee: MeleeState = {
    active: false,
    weaponId: 'cutlass',
    angle: 0,
    remaining: 0,
    duration: 0,
    damage: 0,
    hitIds: [],
    lunge: 0,
    traps: 0,
  };
  private readonly muzzle = { x: 0, y: 0 };
  time = 0;
  readonly actors: Actor[] = [];
  playerId: EntityId | null = null;
  playerBodyFacing = 0;

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
  private readonly aiRng: Random;
  private readonly shotRng: Random;
  readonly zones: Zone[] = [];
  readonly rocks: Rock[] = [];
  private readonly ai: EnemyAi;
  private readonly bounds: CombatWorldOptions['bounds'];
  /** 本步玩家的移动倍率（奶潭减速），每步由 updateZones 重算，不存档。 */
  private playerSlow = 1;
  private readonly aiHost: AiHost = {
    actors: this.actors,
    lineOfSight: (x1, y1, x2, y2) => this.aiLos(x1, y1, x2, y2),
    shoot: (e, attack, angle) => this.enemyShoot(e as Actor, attack, angle),
    explode: (e, radius, damage) =>
      this.explodeAt(e.x, e.y, radius, damage, e.team, e.id, EXPLOSION_KNOCKBACK),
    lash: (e, angle, length, width, damage, pull) =>
      this.lashAt(e as Actor, angle, length, width, damage, pull),
    summon: (e, kind, count, telegraph) =>
      this.spawnAround(e as Actor, kind as EnemyId, count, telegraph, e.id),
    children: (e) => this.countChildren(e.id),
    zone: (e, kind, radius, duration, damage, tick) =>
      this.addZone(e as Actor, kind, radius, duration, damage, tick),
    rocks: (e, target, count, spread, stagger) =>
      this.dropRocks(e as Actor, target as Actor, count, spread, stagger),
    crash: (e, angle) => this.crashInto(e as Actor, angle),
    selfDestruct: (e) => this.damage(e as Actor, e.hp, false, 0, 0, null),
    act: (e, action, angle) => this.emitAct(e as Actor, action, angle),
    random: () => this.aiRng.next(),
    geometry: () => this.geometryOf?.() ?? null,
  };
  private readonly arsenalHost: ArsenalHost = {
    actors: this.actors,
    time: () => this.time,
    los: (x1, y1, x2, y2) => this.los(x1, y1, x2, y2),
    targetable: (a) => this.targetable(a as Actor),
    actor: (id) => this.byId.get(id),
    strike: (weapon, team, ownerId, target, damage, knockback, dirX, dirY, x, y) =>
      this.strike(weapon, team, ownerId, target as Actor, damage, knockback, dirX, dirY, x, y),
    wall: (team, x, y, angle, damage) => {
      this.emitHitAt(team, x, y, angle, null, false);
      this.hitBarrelAt(x + Math.cos(angle) * 2, y + Math.sin(angle) * 2, damage);
    },
    explode: (x, y, radius, damage, team, ownerId, knockback) =>
      this.explodeAt(x, y, radius, damage, team, ownerId, knockback),
    chained: (team, x1, y1, x2, y2) => this.emitChained(team, x1, y1, x2, y2),
    chill: (target, def) => this.chillActor(target as Actor, def),
    pay: (cost) => {
      if (!this.resources.canFire(cost)) return false;
      this.resources.spend(cost);
      return true;
    },
    nextId: () => this.nextId++,
  };
  private readonly arsenal: Arsenal;
  private readonly trapHost: TrapHost = {
    actors: this.actors,
    grounded: (a) => (a as Actor).team !== 'enemy' || EnemyAi.grounded((a as Actor).brain),
    hurt: (a, damage) => {
      const target = a as Actor;
      if (!this.ignoresDamage(target)) this.damage(target, damage, false, 0, 0, null);
    },
    sway: (a, slow, pushX, pushY) => {
      const target = a as Actor;
      target.trapSlow = Math.min(target.trapSlow, slow);
      target.pushX += pushX;
      target.pushY += pushY;
    },
    explode: (x, y, radius, damage, knockback) => this.explodeAt(x, y, radius, damage, null, null, knockback),
  };
  private readonly trapSystem: Traps;
  /** 本步开火是否真的生成了子弹或弹体（ADR 0031：弹体到上限时不扣能量）。 */
  private fired = 0;
  /** 蓄力发射时本次开火的伤害、弹速倍率与额外穿透；其余时候为 1、1、0。 */
  private chargeDamage = 1;
  private chargeSpeed = 1;
  private chargePierce = 0;
  /** 本步玩家因预热武器开火而乘的移动倍率，每步由 updatePlayer 重算，不存档。 */
  private fireSlow = 1;
  private readonly lineOfSight: LineOfSight;
  private readonly navigation: CombatWorldOptions['navigation'];
  /** 房间几何提供者（ADR 0039）；每次查询前取当前视图，不缓存。 */
  private readonly geometryOf: CombatWorldOptions['geometry'];
  /** 几何查询的复用输入输出，避免战斗中分配。 */
  private readonly geoHit = createGeometryHit();
  private readonly geoFrom = { x: 0, y: 0 };
  private readonly geoTo = { x: 0, y: 0 };
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
  /** 开局天赋只能施加一次；不存档，读档时直接置为已施加。 */
  private talentsApplied = false;
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
    this.aiRng = root.fork('ai');
    this.shotRng = root.fork('shot');
    this.bounds = options.bounds;
    for (let i = 0; i < BALANCE.zoneCapacity; i++) this.zones.push(newZone(i));
    for (let i = 0; i < BALANCE.rockCapacity; i++) this.rocks.push(newRock(i));
    this.ai = new EnemyAi(this.aiHost);
    this.arsenal = new Arsenal(this.arsenalHost, this.shotRng, BALANCE.shotCapacity);
    this.trapSystem = new Traps(this.trapHost, BALANCE.trapCapacity);
    this.bus = options.bus;
    this.maxBullets = options.maxBullets ?? DEFAULT_MAX_BULLETS;
    this.godMode = options.godMode ?? false;
    this.lineOfSight = options.lineOfSight ?? alwaysVisible;
    this.navigation = options.navigation;
    this.geometryOf = options.geometry;
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

  get shots(): readonly ShotView[] {
    return this.arsenal.shots;
  }

  get beam(): BeamView {
    return this.arsenal.beam;
  }

  get traps(): readonly TrapView[] {
    return this.trapSystem.traps;
  }

  setTraps(room: number, traps: readonly TrapLayoutInput[]): void {
    // 近战的机关命中记录按槽位记，换房后槽位换成新机关，旧记录要清掉；恢复同一房间时保留。
    if (this.trapSystem.place(room, traps)) this.melee.traps = 0;
  }

  hitTrap(bulletId: EntityId, index: number, x: number, y: number): boolean {
    this.callDepth++;
    try {
      const bullet = this.bullets.get(bulletId),
        trap = this.trapSystem.traps[index];
      if (!bullet) return true;
      if (!trap || !standingBarrel(trap)) return false;
      this.emitHit(bullet, x, y, null, false);
      this.finishBullet(bullet);
      this.trapSystem.damageBarrel(index, bullet.damage);
      return true;
    } finally {
      this.callDepth--;
      if (!this.callDepth) while (this.retired.length) this.actorPool.push(this.retired.pop()!);
    }
  }

  get charge(): number {
    const p = this.player;
    return p?.weapon.charge ? p.charge / p.weapon.charge.time : 0;
  }

  equipWeapon(id: WeaponId): boolean {
    const p = this.player;
    if (!p || this.playerDied || !Object.hasOwn(WEAPONS, id)) return false;
    p.weapon = WEAPONS[id];
    p.weaponId = id;
    p.pattern = getPattern(p.weapon.pattern);
    p.burstLeft = 0;
    p.charge = p.spin = 0;
    this.arsenal.beamOff();
    this.melee.active = false;
    this.melee.lunge = 0;
    this.melee.remaining = 0;
    this.melee.hitIds.length = 0;
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
    const { stat, amount } = UPGRADES[id];
    this.boost(actor, p, stat, amount);
    return true;
  }

  applyTalents(mods: Readonly<TalentModifiers>): boolean {
    const actor = this.playerId === null ? undefined : this.byId.get(this.playerId),
      p = this.player;
    if (!actor || !p || actor.phase !== 'active' || this.time !== 0 || this.talentsApplied) return false;
    for (const stat in mods) {
      const value = mods[stat as keyof TalentModifiers];
      if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) return false;
    }
    this.talentsApplied = true;
    for (const stat in mods) {
      const value = mods[stat as keyof TalentModifiers];
      if (!value || stat === 'offers') continue;
      if (stat === 'coins') this.resources.coins += value;
      else this.boost(actor, p, stat as UpgradeDef['stat'], value);
    }
    return true;
  }

  /** 局内升级与开局天赋共用的加法规则；生命、护甲、能量上限提升时同时补满（ADR 0035）。 */
  private boost(actor: Actor, p: PlayerState, stat: UpgradeDef['stat'], amount: number): void {
    const r = this.resources;
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
        charge: 0,
        spin: 0,
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
      return this.addEnemy(kind, x, y, BALANCE.spawnTelegraph, 0).id;
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
        // 先移动已有弹体，本步新发射的弹体和 Arcade 子弹一样从下一步开始飞。
        this.arsenal.update(dt);
        this.updatePlayer(input, dt);
        this.updateMelee(dt);
        this.updateEnemies(dt);
        this.updateZones(dt);
        for (const actor of this.actors) {
          actor.trapSlow = 1;
          actor.pushX = actor.pushY = 0;
        }
        this.trapSystem.update(dt);
        for (const actor of this.actors) this.applyVelocity(actor);
        this.refreshStages();
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
      // 钻在地下的怪物让子弹穿过去（ADR 0030）。
      if (EnemyAi.hidden(target.brain) && target.team === 'enemy') return false;
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

  clearHazards(): void {
    for (const z of this.zones) z.active = false;
    for (const r of this.rocks) r.active = false;
    this.arsenal.clear();
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
      if (this.ignoresDamage(player) || enemy.contactDamage <= 0 || !EnemyAi.grounded(enemy.brain)) return;
      // 冻住的怪物没有接触伤害（ADR 0031）。
      if (enemy.frozen) return;
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
      melee: { ...this.melee, hitIds: [...this.melee.hitIds] },
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
        charge: p.charge,
        spin: p.spin,
        maxSpeed: p.tuning.maxSpeed,
        accelTime: p.tuning.accelTime,
        decelTime: p.tuning.decelTime,
      },
      lastMoveDir: { x: this.lastMoveDir.x, y: this.lastMoveDir.y },
      dashDirection: { x: this.dashDirection.x, y: this.dashDirection.y },
      resources: r.save(),
      rng: {
        spread: this.spreadRng.snapshot,
        crit: this.critRng.snapshot,
        ai: this.aiRng.snapshot,
        shot: this.shotRng.snapshot,
      },
      actors: this.actors.map(saveActor),
      bullets,
      zones: this.zones.filter((z) => z.active).map(saveZone),
      rocks: this.rocks.filter((r) => r.active).map(saveRock),
      ...this.arsenal.save(),
      trapRoom: this.trapSystem.room,
      traps: this.trapSystem.save(),
    };
  }

  load(state: Readonly<CombatWorldState>): void {
    if (
      this.time !== 0 ||
      this.actors.length ||
      this.bullets.size ||
      this.playerId !== null ||
      this.zones.some((z) => z.active) ||
      this.rocks.some((r) => r.active) ||
      this.arsenal.shots.some((s) => s.active) ||
      this.trapSystem.traps.some((t) => t.active)
    )
      throw new Error('只能把存档写入刚创建的世界');
    if (state.actors.length > this.actorPool.length || state.bullets.length > this.bulletPool.length)
      throw new RangeError('存档超出实体或子弹容量');
    Object.assign(this.melee, state.melee);
    this.melee.hitIds = [...state.melee.hitIds];
    this.time = state.time;
    this.nextId = state.nextId;
    this.playerId = state.playerId;
    this.playerDied = state.playerDied;
    // 存档里的属性已含开局天赋；即使存于 time=0，读回后也不能再施加一次。
    this.talentsApplied = true;
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
      charge: p.charge,
      spin: p.spin,
      tuning: { maxSpeed: p.maxSpeed, accelTime: p.accelTime, decelTime: p.decelTime },
    };
    this.lastMoveDir.x = state.lastMoveDir.x;
    this.lastMoveDir.y = state.lastMoveDir.y;
    this.playerBodyFacing = Math.atan2(this.lastMoveDir.y, this.lastMoveDir.x);
    this.dashDirection.x = state.dashDirection.x;
    this.dashDirection.y = state.dashDirection.y;
    this.resources.load(state.resources);
    this.spreadRng.restore(state.rng.spread);
    this.critRng.restore(state.rng.crit);
    this.aiRng.restore(state.rng.ai);
    this.shotRng.restore(state.rng.shot);
    this.arsenal.load(state.shots, state.beam);
    this.trapSystem.load(state.trapRoom, state.traps);
    if (state.zones.length > this.zones.length) throw new RangeError('存档超出区域容量');
    if (state.rocks.length > this.rocks.length) throw new RangeError('存档超出石块容量');
    // 回到原槽位：之后新区域、新石块占用的空槽与遍历顺序都与存档前一致。
    for (const z of state.zones) {
      if (this.zones[z.slot]?.active !== false) throw new RangeError('区域槽位无效或重复');
      Object.assign(this.zones[z.slot]!, z, { active: true });
    }
    for (const r of state.rocks) {
      if (this.rocks[r.slot]?.active !== false) throw new RangeError('石块槽位无效或重复');
      Object.assign(this.rocks[r.slot]!, r, { active: true });
    }
    for (const a of state.actors) {
      const actor = this.actorPool.pop()!;
      loadActor(actor, a);
      this.actors.push(actor);
      this.byId.set(actor.id, actor);
    }
    // 招式进度不存档，从已恢复的 AI 状态重算，读档首帧即与存档前一致（ADR 0038）。
    this.refreshStages();
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
    resetBrain(actor.brain);
    actor.warning = false;
    actor.pose = 'idle';
    actor.lift = actor.aim = 0;
    actor.move = 'none';
    actor.stage = 'ready';
    actor.stageTime = actor.stageSpan = actor.landX = actor.landY = 0;
    actor.aimLocked = false;
    actor.parentId = 0;
    const st = actor.status;
    st.stacks = st.per = st.time = st.freeze = 0;
    refreshChill(actor);
    actor.trapSlow = 1;
    actor.pushX = actor.pushY = 0;
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
    const st = actor.status;
    if (st.freeze > 0 || st.stacks > 0) {
      if (st.freeze > 0) st.freeze = Math.max(0, st.freeze - dt);
      else if ((st.time -= dt) <= 0) st.stacks = st.time = 0;
      refreshChill(actor);
    }
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
    this.fireSlow = 1;
    if (!p || !actor || actor.phase !== 'active') {
      this.arsenal.beamOff();
      return;
    }

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
    // 即使同时瞄准，也记录左摇杆最后方向；松开右摇杆后用它恢复手机武器朝向。
    const moving = input.move.x !== 0 || input.move.y !== 0;
    if (moving) {
      const len = Math.hypot(input.move.x, input.move.y);
      this.lastMoveDir.x = input.move.x / len;
      this.lastMoveDir.y = input.move.y / len;
    }
    const moveAngle = Math.atan2(this.lastMoveDir.y, this.lastMoveDir.x);
    if (input.aim && (input.aim.x !== 0 || input.aim.y !== 0)) {
      actor.facing = Math.atan2(input.aim.y, input.aim.x);
    } else if (moving || input.source === 'touch') actor.facing = moveAngle;
    // 选敌与设备无关；蓄力松手、未发完的 burst 也使用本步目标。无锁定状态，读档不漂移。
    const attacking = input.fire || p.burstLeft > 0 || p.charge > 0;
    let target: Actor | undefined;
    if ((p.weapon.attack === 'projectile' || p.weapon.attack === 'shot') && attacking) {
      let nearest = p.weapon.range ** 2;
      for (const enemy of this.actors) {
        if (enemy.team === actor.team || enemy.phase !== 'active' || EnemyAi.hidden(enemy.brain)) continue;
        const distance = (enemy.x - actor.x) ** 2 + (enemy.y - actor.y) ** 2;
        if (distance === 0 || distance > nearest || (distance === nearest && target && enemy.id > target.id))
          continue;
        if (!this.los(actor.x, actor.y, enemy.x, enemy.y)) continue;
        nearest = distance;
        target = enemy;
      }
      if (target) actor.facing = Math.atan2(target.y - actor.y, target.x - actor.x);
    }
    this.playerBodyFacing = attacking || this.melee.active ? actor.facing : moveAngle;

    this.pullTrigger(actor, p, input.fire, dt, target);
    this.applyLunge(actor);
  }

  /** 开火输入：普通连发、光束、蓄力与射速预热（ADR 0031）。 */
  private pullTrigger(
    actor: Actor,
    p: PlayerState,
    firing: boolean,
    dt: number,
    target?: Readonly<Actor>,
  ): void {
    const r = this.resources,
      w = p.weapon;
    // 冷却：按住时连发并保留余量，保证射速准确；松开后冷却只减到 0，不会攒出连发。
    p.cooldown -= dt;
    if (p.burstLeft > 0) {
      p.burstWait -= dt;
      while (p.burstLeft > 0 && p.burstWait <= 0) {
        this.fire(actor, p, target);
        p.burstLeft--;
        p.burstWait += w.burstInterval ?? 1 / w.fireRate;
      }
    }
    if (w.beam) {
      if (firing) this.fireBeam(actor, p, dt);
      else this.arsenal.beamOff();
    }
    const c = w.charge;
    if (w.beam || c || !firing) {
      if (p.cooldown < 0) p.cooldown = 0;
      // 蓄力：按住只蓄力（冷却结束后才开始），松开才按蓄力比例发射。
      if (c && firing && p.cooldown === 0) p.charge = Math.min(c.time, p.charge + dt);
      else if (c && !firing && p.charge > 0) {
        const k = p.charge < c.minTime ? 0 : p.charge / c.time;
        this.chargeDamage = c.minScale + (c.maxScale - c.minScale) * k;
        this.chargeSpeed = 1 + (c.speed - 1) * k;
        this.chargePierce = k >= 1 ? c.fullPierce : 0;
        this.fire(actor, p, target);
        this.chargeDamage = this.chargeSpeed = 1;
        this.chargePierce = 0;
        p.charge = 0;
        p.cooldown = 1 / w.fireRate / r.fireRateScale;
      }
      if (w.spinup && !firing) p.spin = Math.max(0, p.spin - (dt * w.spinup.time) / w.spinup.decay);
      return;
    }
    // 射速预热：按住越久射速越高，开火期间走得慢。
    const spin = w.spinup;
    if (spin) {
      p.spin = Math.min(spin.time, p.spin + dt);
      this.fireSlow = spin.moveScale;
    }
    const rate = spin ? spin.startRate + (w.fireRate - spin.startRate) * (p.spin / spin.time) : w.fireRate;
    while (p.cooldown <= 0) {
      this.fire(actor, p, target);
      if (w.pattern === 'burst') {
        p.burstLeft = w.pellets - 1;
        p.burstWait = w.burstInterval ?? 1 / w.fireRate;
      }
      p.cooldown += (w.melee?.cooldown ?? 1 / rate) / r.fireRateScale;
    }
  }

  /** 光束每步结算；刚打开的那一步发 `weapon:fired`，给枪口火光与音效。 */
  private fireBeam(owner: Actor, p: PlayerState, dt: number): void {
    this.placeMuzzle(owner, p.weaponId);
    const x = this.muzzle.x,
      y = this.muzzle.y,
      was = this.arsenal.beam.active;
    const damage = p.weapon.damage * this.resources.damageScale;
    if (this.arsenal.beamStep(owner.team, owner.id, p.weaponId, x, y, owner.facing, damage, dt) && !was)
      this.emitFired(owner, p.weaponId, x, y);
  }

  /** 突进近战（ADR 0031）：挥动期间沿挥动方向冲，覆盖移动输入；可带冲刺无敌。 */
  private applyLunge(actor: Actor): void {
    const m = this.melee;
    if (!m.active || m.lunge <= 0) return;
    actor.base.x = Math.cos(m.angle) * m.lunge;
    actor.base.y = Math.sin(m.angle) * m.lunge;
    if ((WEAPONS[m.weaponId] as Readonly<WeaponDef>).melee?.dashInvulnerable) {
      actor.invulnUntil = Math.max(actor.invulnUntil, this.time + m.remaining);
      actor.invulnerable = true;
    }
  }

  /** 枪口位置写入 `this.muzzle`：玩家按武器图的枪口，怪物在身体边缘；枪口越过近墙时退回身体中心。 */
  private placeMuzzle(owner: Actor, weaponId: string): void {
    const muzzle = this.muzzle;
    if (owner.team === 'player')
      playerMuzzle(
        muzzle,
        owner.x,
        owner.y,
        owner.facing,
        weaponId as WeaponId,
        characterArtFor(owner.kind).standardGrip,
      );
    else {
      muzzle.x = owner.x + Math.cos(owner.facing) * owner.radius;
      muzzle.y = owner.y + Math.sin(owner.facing) * owner.radius;
    }
    // 从身体发射让同一步物理墙体检测接管。
    if (!this.lineOfSight(owner.x, owner.y, muzzle.x, muzzle.y)) {
      muzzle.x = owner.x;
      muzzle.y = owner.y;
    }
  }

  private fire(
    owner: Actor,
    p: { weapon: Readonly<WeaponDef>; weaponId: string; pattern: FirePattern },
    target?: Readonly<Actor>,
  ): void {
    if (owner.team === 'player' && !this.resources.canFire(p.weapon.energyCost)) return;
    if (p.weapon.attack === 'melee') {
      this.startMelee(owner, p.weapon, p.weaponId as WeaponId);
      return;
    }
    if (p.weapon.attack === 'beam') return;
    this.placeMuzzle(owner, p.weaponId);
    const muzzleX = this.muzzle.x,
      muzzleY = this.muzzle.y;
    this.fireCtx.x = muzzleX;
    this.fireCtx.y = muzzleY;
    // 持握侧由身体朝向决定；迭代 facing 会在朝下的左右镜像接缝来回跳。
    // 固定最终枪口（含近墙回退）后直接解算弹道，不再旋转枪口，避免平行偏移。
    // 目标比枪口更近时保留中心方向，不能为了补偿把枪向身后开。
    const beyondMuzzle =
      target &&
      (target.x - owner.x) ** 2 + (target.y - owner.y) ** 2 >
        (muzzleX - owner.x) ** 2 + (muzzleY - owner.y) ** 2;
    const aim = beyondMuzzle ? Math.atan2(target.y - muzzleY, target.x - muzzleX) : owner.facing;
    this.fireCtx.aim = aim;
    this.fireCtx.weapon = p.weapon;
    this.fireCtx.pelletCount = p.weapon.pattern === 'burst' ? 1 : p.weapon.pellets;
    this.firingOwner = owner;
    this.firingWeapon = p.weapon;
    this.firingSource = p.weaponId;
    this.fired = 0;
    p.pattern(this.fireCtx, this.sink);
    this.firingOwner = null;
    if (!this.fired) return;
    if (owner.team === 'player') this.resources.spend(p.weapon.energyCost);
    this.emitFired(owner, p.weaponId, muzzleX, muzzleY, aim);
  }

  private emitFired(
    owner: Readonly<Actor>,
    weaponId: string,
    x: number,
    y: number,
    angle = owner.facing,
  ): void {
    const e = this.payloads.fired.acquire();
    try {
      e.ownerId = owner.id;
      e.weaponId = weaponId;
      e.x = x;
      e.y = y;
      e.angle = angle;
      this.bus.emit('weapon:fired', e);
    } finally {
      this.payloads.fired.release();
    }
  }

  private startMelee(owner: Actor, weapon: Readonly<WeaponDef>, weaponId: WeaponId): void {
    const def = weapon.melee;
    if (!def || this.melee.active) return;
    const m = this.melee;
    m.active = true;
    m.weaponId = weaponId;
    m.angle = owner.facing;
    m.remaining = m.duration = def.duration / this.resources.fireRateScale;
    m.damage = weapon.damage * this.resources.damageScale;
    m.hitIds.length = 0;
    m.traps = 0;
    // 突进距离固定，攻速升级缩短挥动时就冲得更快。
    m.lunge = def.lunge ? def.lunge / m.duration : 0;
    this.resources.spend(weapon.energyCost);
    const e = this.payloads.swung.acquire();
    try {
      e.ownerId = owner.id;
      e.weaponId = weaponId;
      e.x = owner.x;
      e.y = owner.y;
      e.angle = m.angle;
      e.duration = m.duration;
      e.range = def.range;
      e.arcDegrees = def.arcDegrees;
      this.bus.emit('weapon:swung', e);
    } finally {
      this.payloads.swung.release();
    }
  }

  private updateMelee(dt: number): void {
    const m = this.melee;
    if (!m.active) return;
    const owner = this.playerId === null ? undefined : this.byId.get(this.playerId);
    if (!owner || owner.phase !== 'active') {
      m.active = false;
      m.remaining = 0;
      return;
    }
    const weapon: Readonly<WeaponDef> = WEAPONS[m.weaponId],
      def = weapon.melee!;
    // 倒序容忍死亡监听器立即回收实体；本次挥动每个 id 只结算一次。
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (
        !a ||
        a.team === owner.team ||
        a.phase !== 'active' ||
        (a.team === 'enemy' && EnemyAi.hidden(a.brain)) ||
        m.hitIds.includes(a.id) ||
        !sectorHitsCircle(a.x - owner.x, a.y - owner.y, a.radius, m.angle, def.range, def.arcDegrees) ||
        !this.lineOfSight(owner.x, owner.y, a.x, a.y)
      )
        continue;
      m.hitIds.push(a.id);
      const critical = !this.ignoresDamage(a) && this.critRng.chance(weapon.critChance);
      const dx = Math.cos(m.angle),
        dy = Math.sin(m.angle);
      if (!this.ignoresDamage(a)) {
        this.damage(a, m.damage * (critical ? BALANCE.critMultiplier : 1), critical, dx, dy, owner.id);
        if (a.phase === 'active' && weapon.knockback > 0) this.knockBack(a, dx, dy, weapon.knockback);
      }
      const e = this.payloads.meleeHit.acquire();
      try {
        e.team = owner.team;
        e.x = a.x;
        e.y = a.y;
        e.angle = m.angle;
        e.targetId = a.id;
        e.critical = critical;
        this.bus.emit('melee:hit', e);
      } finally {
        this.payloads.meleeHit.release();
      }
    }
    // 近战也能砍鱼雷桶，每次挥动每个桶最多一次（ADR 0032）。
    const traps = this.trapSystem.traps;
    for (let i = 0; i < traps.length; i++) {
      const t = traps[i]!;
      if (!standingBarrel(t) || m.traps & (1 << i)) continue;
      if (!sectorHitsCircle(t.x - owner.x, t.y - owner.y, t.radius, m.angle, def.range, def.arcDegrees))
        continue;
      m.traps |= 1 << i;
      this.trapSystem.damageBarrel(i, m.damage);
    }
    m.remaining = Math.max(0, m.remaining - dt);
    if (m.remaining === 0) {
      m.active = false;
      // 突进结束时把速度收回到正常移动上限，不靠减速慢慢滑停。
      if (m.lunge > 0 && this.player) {
        const v = owner.base,
          speed = Math.hypot(v.x, v.y),
          max = this.player.tuning.maxSpeed;
        if (speed > max) {
          v.x *= max / speed;
          v.y *= max / speed;
        }
        m.lunge = 0;
      }
    }
  }

  private addBullet(x: number, y: number, angle: number): boolean {
    const owner = this.firingOwner;
    const weapon = this.firingWeapon;
    if (!owner) return false;
    const scale = owner.team === 'player' ? this.resources.damageScale : 1;
    if (weapon.shot) {
      const damage = weapon.damage * scale * this.chargeDamage,
        source = this.firingSource as WeaponId;
      if (
        !this.arsenal.add(
          owner.team,
          owner.id,
          source,
          x,
          y,
          angle,
          damage,
          this.chargeSpeed,
          this.chargePierce,
        )
      )
        return false;
      this.fired++;
      return true;
    }
    const spawn = this.spawnPool[this.spawns.length];
    if (!spawn) return false;
    const bullet = this.bulletPool.pop();
    if (!bullet) return false;
    const id = this.nextId++;
    bullet.id = id;
    bullet.team = owner.team;
    bullet.ownerId = owner.id;
    bullet.angle = angle;
    bullet.damage = weapon.damage * scale * this.chargeDamage;
    bullet.critChance = weapon.critChance;
    bullet.knockback = weapon.knockback;
    bullet.pierceLeft = weapon.pierce + this.chargePierce;
    bullet.source = this.firingSource;
    bullet.hitCount = 0;
    this.bullets.set(id, bullet);

    spawn.id = id;
    spawn.team = owner.team;
    spawn.ownerId = owner.id;
    spawn.x = x;
    spawn.y = y;
    spawn.angle = angle;
    spawn.speed = weapon.bulletSpeed * this.chargeSpeed;
    spawn.radius = weapon.bulletRadius;
    spawn.lifetime = weapon.range / weapon.bulletSpeed;
    spawn.sprite = weapon.bulletSprite;
    this.spawns.push(spawn);
    this.fired++;
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

  /** 每步末从 AI 状态推出全部怪物的招式视图（含冻住、预警与死亡中的），读档后同样调用一次。 */
  private refreshStages(): void {
    for (const a of this.actors) if (a.team === 'enemy') EnemyAi.stageView(a, this.bounds);
  }

  private updateEnemies(dt: number): void {
    const player = this.playerId === null ? undefined : this.byId.get(this.playerId);
    const target = player && player.phase === 'active' ? player : null;
    // 按下标遍历：招式中途生成的子嗣追加在末尾，本步只登记不行动。
    for (let i = 0; i < this.actors.length; i++) {
      const actor = this.actors[i]!;
      if (actor.team !== 'enemy' || actor.phase !== 'active') continue;
      // 冻住的怪物不思考、不移动，招式计时也一起停住（ADR 0031）。
      if (actor.frozen) {
        actor.base.x = actor.base.y = 0;
        continue;
      }
      const def: Readonly<EnemyDef> = ENEMIES[actor.kind as EnemyId];
      let attack = def.attack,
        speedScale = 1;
      if (def.phases)
        for (const phase of def.phases)
          if (actor.hp / actor.maxHp <= phase.belowHp) {
            attack = phase.attack;
            speedScale = phase.speedScale;
          }
      this.ai.think(actor, def, target, dt, speedScale);
      // 自爆等招式可能让自己当步死亡。
      if (actor.phase !== 'active') continue;
      // 只调整向目标接近的自主移动；炮台、后退、横移、跳跃和锁定冲锋保持原行为，击退稍后叠加。
      if (
        target &&
        this.ai.navigable(actor, def) &&
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
      if (actor.base.x !== 0 || actor.base.y !== 0) actor.facing = Math.atan2(actor.base.y, actor.base.x);
      this.ai.shootRegular(actor, target, attack);
      this.ai.pose(actor, target, attack);
    }
  }

  /** 区域计时与结算：毒气每 tick 秒伤一次另一阵营，奶潭让玩家减速（在 applyVelocity 里生效）。 */
  private updateZones(dt: number): void {
    this.playerSlow = 1;
    const player = this.playerId === null ? undefined : this.byId.get(this.playerId);
    for (const z of this.zones) {
      if (!z.active) continue;
      z.remaining -= dt;
      if (z.remaining <= 0) {
        z.active = false;
        continue;
      }
      if (z.kind === 'milk') {
        if (player && z.team !== 'player' && this.inside(player, z.x, z.y, z.radius))
          this.playerSlow = Math.min(this.playerSlow, BALANCE.milkSlow);
        continue;
      }
      z.wait -= dt;
      if (z.wait > 0) continue;
      z.wait += z.tick;
      for (let i = this.actors.length - 1; i >= 0; i--) {
        const a = this.actors[i];
        if (!a || a.team === z.team || a.phase !== 'active' || !this.inside(a, z.x, z.y, z.radius)) continue;
        if (a.team === 'enemy' && EnemyAi.hidden(a.brain)) continue;
        if (!this.ignoresDamage(a)) this.damage(a, z.damage, false, 0, 0, null);
      }
    }
    for (const r of this.rocks) {
      if (!r.active) continue;
      r.time -= dt;
      if (r.time > 0) continue;
      if (r.landed) {
        r.active = false;
        continue;
      }
      r.landed = true;
      r.time = r.life;
      this.crush(r);
    }
  }

  /** 石块落地砸中落点内的玩家（不发爆炸事件，表现层按石块状态播落地效果）。 */
  private crush(r: Readonly<Rock>): void {
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (!a || a.team !== 'player' || a.phase !== 'active' || this.ignoresDamage(a)) continue;
      if (!this.inside(a, r.x, r.y, r.radius)) continue;
      const d = Math.hypot(a.x - r.x, a.y - r.y);
      this.damage(a, r.damage, false, d > 0 ? (a.x - r.x) / d : 0, d > 0 ? (a.y - r.y) / d : 1, null);
    }
  }

  private inside(a: Readonly<Actor>, x: number, y: number, radius: number): boolean {
    return Math.hypot(a.x - x, a.y - y) <= radius + a.radius;
  }

  /**
   * 范围爆炸（ADR 0030）：先发 `combat:exploded`，再对范围内、视线可达的另一阵营逐个结算伤害并推开。
   * 倒序遍历，容忍死亡监听器立即回收实体。
   */
  private explodeAt(
    x: number,
    y: number,
    radius: number,
    damage: number,
    team: Team | null,
    sourceId: EntityId | null,
    knockback: number,
  ): void {
    const e = this.payloads.exploded.acquire();
    try {
      e.team = team;
      e.x = x;
      e.y = y;
      e.radius = radius;
      this.bus.emit('combat:exploded', e);
    } finally {
      this.payloads.exploded.release();
    }
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (!a || (team !== null && a.team === team) || a.phase !== 'active' || !this.inside(a, x, y, radius))
        continue;
      if ((a.team === 'enemy' && EnemyAi.hidden(a.brain)) || !this.los(x, y, a.x, a.y)) continue;
      if (this.ignoresDamage(a)) continue;
      const d = Math.hypot(a.x - x, a.y - y);
      const dx = d > 0 ? (a.x - x) / d : 0,
        dy = d > 0 ? (a.y - y) / d : 1;
      this.damage(a, damage, false, dx, dy, sourceId);
      if (a.phase === 'active' && knockback > 0) this.knockBack(a, dx, dy, knockback);
    }
    // 爆炸波及范围内的鱼雷桶，可以连锁引爆（ADR 0032）。
    const traps = this.trapSystem.traps;
    for (let i = 0; i < traps.length; i++) {
      const t = traps[i]!;
      if (standingBarrel(t) && Math.hypot(t.x - x, t.y - y) <= radius + t.radius)
        this.trapSystem.damageBarrel(i, damage);
    }
  }

  /** 特殊弹体撞墙时如果撞的是鱼雷桶，按弹体伤害扣耐久（ADR 0032）。 */
  private hitBarrelAt(x: number, y: number, damage: number): void {
    const traps = this.trapSystem.traps;
    for (let i = 0; i < traps.length; i++) {
      const t = traps[i]!;
      if (standingBarrel(t) && Math.hypot(t.x - x, t.y - y) <= t.radius + 2) {
        this.trapSystem.damageBarrel(i, damage);
        return;
      }
    }
  }

  /** 召唤与分裂共用：在身边找视线可达的位置生成，实体记录不够时少生成。 */
  private spawnAround(
    source: Readonly<Actor>,
    kind: EnemyId,
    count: number,
    telegraph: number,
    parentId: number,
  ): void {
    const def = ENEMIES[kind];
    for (let i = 0; i < count && this.actorPool.length; i++) {
      const angle = this.aiRng.next() * Math.PI * 2,
        distance = source.radius + def.radius + 2;
      let x = source.x + Math.cos(angle) * distance,
        y = source.y + Math.sin(angle) * distance;
      // ADR 0039 规则 5：有房间几何时按子体完整身体检查；不合法就和原来一样退回施法者位置，数量与抽数不变。
      const geo = this.geometryOf?.();
      if (
        geo
          ? !geo.canOccupy(this.point(this.geoTo, x, y), def.radius, 'spawn')
          : !this.los(source.x, source.y, x, y)
      ) {
        x = source.x;
        y = source.y;
      }
      this.addEnemy(kind, x, y, telegraph, parentId);
    }
  }

  private addEnemy(kind: EnemyId, x: number, y: number, telegraph: number, parentId: number): Actor {
    const def = ENEMIES[kind];
    const actor = this.createActor('enemy', kind, x, y, def.radius, def.hp, def.moveSpeed);
    actor.contactDamage = def.contactDamage;
    actor.parentId = parentId;
    actor.phase = 'telegraph';
    actor.activateAt = this.time + telegraph;
    this.ai.init(actor, def);
    this.emitSpawned(actor, telegraph);
    if (telegraph <= 0) this.activate(actor);
    return actor;
  }

  /** 在目标附近挑石块落点：限制在房间内、不压住 Boss、不压在石柱上（用短线段视线粗测）。 */
  private dropRocks(
    e: Readonly<Actor>,
    target: Readonly<Actor>,
    count: number,
    spread: number,
    stagger: boolean,
  ): void {
    const def = ENEMIES[e.kind as EnemyId] as Readonly<EnemyDef>,
      rock = def.rock;
    if (!rock) return;
    const b = this.bounds;
    const geo = this.geometryOf?.();
    for (let i = 0; i < count; i++) {
      const slot = this.rocks.find((r) => !r.active);
      if (!slot) return;
      let x = target.x,
        y = target.y,
        legal = false;
      for (let attempt = 0; attempt < ROCK_ATTEMPTS; attempt++) {
        const angle = this.aiRng.next() * Math.PI * 2,
          distance = i === 0 && attempt === 0 ? 0 : this.aiRng.next() * spread;
        x = target.x + Math.cos(angle) * distance;
        y = target.y + Math.sin(angle) * distance;
        if (b) {
          x = Math.min(b.x + b.width - rock.radius, Math.max(b.x + rock.radius, x));
          y = Math.min(b.y + b.height - rock.radius, Math.max(b.y + rock.radius, y));
        }
        // ADR 0039 规则 6：有房间几何时用完整石块足迹代替十字视线检查。
        if (
          Math.hypot(x - e.x, y - e.y) > e.radius + rock.radius + 4 &&
          (geo
            ? geo.canOccupy(this.point(this.geoTo, x, y), rock.radius, 'rock')
            : this.lineOfSight(x - rock.radius, y, x + rock.radius, y) &&
              this.lineOfSight(x, y - rock.radius, x, y + rock.radius)) &&
          !this.rocks.some((r) => r.active && Math.hypot(r.x - x, r.y - y) < r.radius + rock.radius)
        ) {
          legal = true;
          break;
        }
      }
      // 旧规则用尽尝试后仍用最后一个候选；有几何时跳过这一块，也不再抽它的错开时长。
      if (geo && !legal) continue;
      slot.active = true;
      slot.landed = false;
      slot.x = x;
      slot.y = y;
      slot.radius = rock.radius;
      slot.fall = rock.fall * (stagger ? 1 + this.aiRng.next() * ROCK_STAGGER : 1);
      slot.time = slot.fall;
      slot.life = rock.life;
      slot.damage = rock.damage;
    }
  }

  /** 冲撞被挡：贴着房间边界算撞墙；否则撞的是石柱或石块，撞碎前方的石块。 */
  private crashInto(e: Readonly<Actor>, angle: number): boolean {
    const reach = e.radius + CRASH_REACH,
      fx = e.x + Math.cos(angle) * reach,
      fy = e.y + Math.sin(angle) * reach;
    let rock = false;
    for (const r of this.rocks)
      if (r.active && r.landed && Math.hypot(r.x - fx, r.y - fy) <= r.radius + CRASH_REACH) {
        r.active = false;
        rock = true;
        this.emitAct(e, 'shatter', angle, r.x, r.y);
      }
    if (rock) return true;
    const geo = this.geometryOf?.();
    if (geo) {
      // ADR 0039 规则 4：沿冲撞方向找第一个阻挡，外轮廓（含凹口、锁门）只停下，内墙、柱、桶会晕；
      // 同距时外轮廓优先。都没碰到（例如被别的身体挡住）维持原来的默认：晕。
      geo.sweepCircle(
        this.point(this.geoFrom, e.x, e.y),
        this.point(this.geoTo, e.x + Math.cos(angle) * CRASH_REACH, e.y + Math.sin(angle) * CRASH_REACH),
        e.radius,
        GeometryMask.walk,
        this.geoHit,
      );
      return !(this.geoHit.hit && this.geoHit.kind === 'boundary');
    }
    const b = this.bounds;
    if (b) {
      const m = e.radius + CRASH_REACH;
      if (e.x - m <= b.x || e.x + m >= b.x + b.width || e.y - m <= b.y || e.y + m >= b.y + b.height)
        return false;
    }
    return true;
  }

  /** 舌击：线段与目标圆相交且视线可达才命中；命中后把目标朝怪物拉近。 */
  private lashAt(
    e: Readonly<Actor>,
    angle: number,
    length: number,
    width: number,
    damage: number,
    pull: number,
  ): void {
    const dx = Math.cos(angle),
      dy = Math.sin(angle);
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (!a || a.team === e.team || a.phase !== 'active' || this.ignoresDamage(a)) continue;
      const t = Math.max(0, Math.min(length, (a.x - e.x) * dx + (a.y - e.y) * dy));
      const px = e.x + dx * t,
        py = e.y + dy * t;
      if (Math.hypot(a.x - px, a.y - py) > a.radius + width / 2 || !this.aiLos(e.x, e.y, a.x, a.y)) continue;
      this.damage(a, damage, false, -dx, -dy, e.id);
      if (a.phase === 'active' && pull > 0)
        this.knockBack(a, -dx, -dy, Math.min(pull, Math.max(0, t - e.radius)));
    }
  }

  private emitAct(e: Readonly<Actor>, action: EnemyAction, angle: number, x = e.x, y = e.y): void {
    const p = this.payloads.acted.acquire();
    try {
      p.id = e.id;
      p.kind = e.kind;
      p.action = action;
      p.x = x;
      p.y = y;
      p.angle = angle;
      this.bus.emit('enemy:acted', p);
    } finally {
      this.payloads.acted.release();
    }
  }

  private enemyShoot(e: Actor, attack: AttackId, angle: number): void {
    const weapon = ATTACKS[attack];
    e.facing = angle;
    this.enemyGun.weapon = weapon;
    this.enemyGun.weaponId = attack;
    this.enemyGun.pattern = getPattern(weapon.pattern);
    this.fire(e, this.enemyGun);
  }

  private countChildren(id: EntityId): number {
    let n = 0;
    for (const a of this.actors) if (a.parentId === id && a.phase !== 'dead') n++;
    return n;
  }

  /** 在怪物脚下放一个区域；满额时顶替剩余时间最短的那个。 */
  private addZone(
    e: Readonly<Actor>,
    kind: ZoneKind,
    radius: number,
    duration: number,
    damage: number,
    tick: number,
  ): void {
    let slot = this.zones[0]!;
    for (const z of this.zones) {
      if (!z.active) {
        slot = z;
        break;
      }
      if (z.remaining < slot.remaining) slot = z;
    }
    slot.active = true;
    slot.team = e.team;
    slot.kind = kind;
    slot.x = e.x;
    slot.y = e.y;
    slot.radius = radius;
    slot.remaining = slot.duration = duration;
    slot.damage = damage;
    slot.tick = tick;
    slot.wait = 0;
  }

  /** 视线：地图墙体之外，落地的石块也挡视线（ADR 0030）。 */
  private los(x1: number, y1: number, x2: number, y2: number): boolean {
    if (!this.lineOfSight(x1, y1, x2, y2)) return false;
    for (const r of this.rocks)
      if (r.active && r.landed && segmentDistance(r.x, r.y, x1, y1, x2, y2) < r.radius) return false;
    for (const t of this.trapSystem.traps)
      if (standingBarrel(t) && segmentDistance(t.x, t.y, x1, y1, x2, y2) < t.radius) return false;
    return true;
  }

  /**
   * 怪物视线（ADR 0039 规则 3）：远程射程判断、舌击命中都用它。有房间几何时走 traceSegment 的 LOS 掩码，
   * 凹口外的房外区域也会挡住；室内水只挡身体不挡视线。没有几何时与 `los` 完全相同。
   * 玩家武器仍用 `los`，属于武器机制，另行迁移。
   */
  private aiLos(x1: number, y1: number, x2: number, y2: number): boolean {
    const geo = this.geometryOf?.();
    if (!geo) return this.los(x1, y1, x2, y2);
    geo.traceSegment(
      this.point(this.geoFrom, x1, y1),
      this.point(this.geoTo, x2, y2),
      GeometryMask.LOS,
      this.geoHit,
    );
    return !this.geoHit.hit;
  }

  private point(out: { x: number; y: number }, x: number, y: number): { x: number; y: number } {
    out.x = x;
    out.y = y;
    return out;
  }

  private applyVelocity(actor: Actor): void {
    if (actor.phase !== 'active') {
      actor.vx = 0;
      actor.vy = 0;
      return;
    }
    const k = actor.knock;
    // 玩家：奶潭与预热武器开火减速；怪物：冰冻减速，冻住时只剩击退（ADR 0031）。
    const slow =
      (actor.id === this.playerId ? this.playerSlow * this.fireSlow : 1 - actor.chill) * actor.trapSlow;
    // 水流推力与击退一样叠加在自主移动之外（ADR 0032）；冻住的怪物也会被水冲走。
    actor.vx = actor.base.x * slow + k.dirX * k.speed + actor.pushX;
    actor.vy = actor.base.y * slow + k.dirY * k.speed + actor.pushY;
  }

  private damage(
    target: Actor,
    amount: number,
    critical: boolean,
    dirX: number,
    dirY: number,
    sourceId: EntityId | null,
  ): void {
    // 冲撞撞晕的 Boss 受到额外伤害（ADR 0030）。
    if (target.team === 'enemy' && target.brain.stage === 'stun')
      amount *= (ENEMIES[target.kind as EnemyId] as Readonly<EnemyDef>).bump?.bonus ?? 1;
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
    if (target.id === this.playerId) {
      this.playerDied = true;
      this.melee.active = false;
      this.melee.remaining = 0;
      this.arsenal.beamOff();
    }
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
    const enemyDef =
      target.team === 'enemy' ? (ENEMIES[target.kind as EnemyId] as Readonly<EnemyDef>) : undefined;
    // 会砸石块的 Boss 倒下时收起石块与奶潭，死亡演出不被遮挡。
    if (enemyDef?.rock) this.clearHazards();
    const split = enemyDef?.split;
    if (split) {
      this.emitAct(target, 'split', target.facing);
      this.spawnAround(target, split.kind as EnemyId, split.count, split.telegraph, 0);
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
    this.emitHitAt(bullet.team, x, y, bullet.angle, targetId, critical);
  }

  private emitHitAt(
    team: Team,
    x: number,
    y: number,
    angle: number,
    targetId: EntityId | null,
    critical: boolean,
  ): void {
    const p = this.payloads.hit.acquire();
    try {
      p.team = team;
      p.x = x;
      p.y = y;
      p.angle = angle;
      p.targetId = targetId;
      p.critical = critical;
      this.bus.emit('bullet:hit', p);
    } finally {
      this.payloads.hit.release();
    }
  }

  private emitChained(team: Team, x1: number, y1: number, x2: number, y2: number): void {
    const p = this.payloads.chained.acquire();
    try {
      p.team = team;
      p.x1 = x1;
      p.y1 = y1;
      p.x2 = x2;
      p.y2 = y2;
      this.bus.emit('weapon:chained', p);
    } finally {
      this.payloads.chained.release();
    }
  }

  /** 弹体与光束能打到：活动中，且没有钻到地下（ADR 0030）。 */
  private targetable(a: Actor): boolean {
    return a.phase === 'active' && !(a.team === 'enemy' && EnemyAi.hidden(a.brain));
  }

  /**
   * 特殊弹体、光束、连锁的一次命中（ADR 0031），顺序同 `hitActor`：
   * `entity:damaged` →（致命时）`entity:died` → `bullet:hit`。目标无敌时只发 `bullet:hit` 并返回 false。
   */
  private strike(
    weapon: Readonly<WeaponDef>,
    team: Team,
    ownerId: EntityId,
    target: Actor,
    damage: number,
    knockback: number,
    dirX: number,
    dirY: number,
    x: number,
    y: number,
  ): boolean {
    const angle = Math.atan2(dirY, dirX);
    if (this.ignoresDamage(target)) {
      this.emitHitAt(team, x, y, angle, target.id, false);
      return false;
    }
    const critical = this.critRng.chance(weapon.critChance);
    this.damage(target, critical ? damage * BALANCE.critMultiplier : damage, critical, dirX, dirY, ownerId);
    if (target.phase === 'active' && knockback > 0) this.knockBack(target, dirX, dirY, knockback);
    this.emitHitAt(team, x, y, angle, target.id, critical);
    return true;
  }

  /** 叠一层冰冻；叠满冻住，冻住期间不再叠层。免疫冻结的怪物（Boss）只减速（ADR 0031）。 */
  private chillActor(a: Actor, def: NonNullable<WeaponDef['chill']>): void {
    const st = a.status;
    if (a.phase !== 'active' || st.freeze > 0) return;
    st.per = def.slow / def.stacks;
    st.time = def.duration;
    st.stacks = Math.min(def.stacks, st.stacks + 1);
    const immune =
      a.team === 'enemy' && (ENEMIES[a.kind as EnemyId] as Readonly<EnemyDef>).freezeImmune === true;
    if (st.stacks >= def.stacks && !immune) {
      st.freeze = def.freeze;
      st.stacks = st.time = 0;
    }
    refreshChill(a);
  }
}

/** 新建一局战斗（ADR 0003）。 */
export function createCombatWorldImpl(options: CombatWorldOptions): CombatWorld {
  return new CombatWorldImpl(options);
}
