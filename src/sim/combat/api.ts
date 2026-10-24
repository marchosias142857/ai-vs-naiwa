import type { PlayerRules } from '../../data/schema/player';
import type { UpgradeId } from '../../data/player';
import type { PlayerResources, PlayerResourcesState } from '../stats/PlayerResources';
import type { EnemyBrain } from '../ai/brain';
import type { CharacterId } from '../../data/characters';
import type { WeaponId } from '../../data/weapons';
import type { EnemyId } from '../../data/enemies';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { EntityId, InputFrame, Seed, Team, Vec2 } from '../core/types';
import { createCombatWorldImpl } from './CombatWorld';

/**
 * M1 战斗 sim 的对外接口（ADR 0003）。game 层（#14 实体与对象池、#15 场景接线）只通过这里与战斗规则交互。
 *
 * 分工：sim 决定「速度、开火、伤害、阶段」；Phaser Arcade 负责「按速度移动、挡墙、检测重叠」。
 * 位置以物理结果为准：game 每帧把物理体的位置写回 sim，sim 再据此计算下一帧。
 *
 * 每个物理步的顺序（ADR 0004：在 Arcade 的 `WORLD_STEP` 中调用，此时本步的移动与重叠检测已完成）：
 * 1. 输入层每个渲染帧产出一份 InputFrame，由 game 锁存后交给本步（边沿只交给一个物理步）。
 * 2. 对每个活着的实体调用 `syncPosition`，写回物理体位置。
 * 3. 调用 `step(dt, input)`：推进计时、出场预警、AI、玩家移动与开火。
 * 4. 按 `ActorView.vx / vy` 设置物理体速度；按 `StepResult.bulletSpawns` 从子弹池取出子弹。
 * 重叠回调（`hitActor`、`hitWall`、`contact`）在物理步进期间随时调用，sim 立即结算并发出事件。
 */

/** 实体阶段，与 ADR 0002「实体的三个阶段」对应。 */
export type ActorPhase = 'telegraph' | 'active' | 'dead';

/**
 * 实体的只读视图。对象由 sim 持有并在实体存活期间复用；读取字段即可，不要修改。
 * 实体被 `removeActor` 移除后，这个对象可能被复用给新实体，不要再访问。
 */
export interface ActorView {
  readonly id: EntityId;
  readonly team: Team;
  /** 数据 ID，如 `ai_proto`、`naiwa_chaser`。 */
  readonly kind: string;
  readonly phase: ActorPhase;
  /** 脚底中心的世界坐标，像素（最近一次 `syncPosition` 写入的值）。 */
  readonly x: number;
  readonly y: number;
  /** 本帧希望的速度，像素/秒，已包含击退；game 把它设到物理体上。预警与死亡阶段为 0。 */
  readonly vx: number;
  readonly vy: number;
  /** 碰撞半径，像素（来自角色 / 怪物数据）。 */
  readonly radius: number;
  readonly hp: number;
  readonly maxHp: number;
  /** 是否处于受伤后的无敌时间内。 */
  readonly invulnerable: boolean;
  /** 朝向，弧度。玩家为当前瞄准方向，怪物为移动方向；用于翻转贴图、放置枪口。 */
  readonly facing: number;
  /** 敌方冲锋蓄力，灰盒可显示危险提示。 */
  readonly warning?: boolean;
}

/** 需要生成的一颗子弹。对象由 sim 复用，只在下一次 `step` 之前有效；game 读取后立即从池中取子弹。 */
export interface BulletSpawn {
  /** 子弹编号，由 sim 分配；之后的 `hitActor` / `hitWall` / `releaseBullet` 都用它。 */
  readonly id: EntityId;
  readonly team: Team;
  readonly ownerId: EntityId;
  /** 出生位置（枪口），世界坐标，像素。 */
  readonly x: number;
  readonly y: number;
  /** 飞行方向，弧度。 */
  readonly angle: number;
  /** 弹速，像素/秒。 */
  readonly speed: number;
  /** 碰撞半径，像素。 */
  readonly radius: number;
  /** 寿命，秒（= 射程 ÷ 弹速）。到时 game 回收子弹并调用 `releaseBullet`。 */
  readonly lifetime: number;
  /** 纹理 key（`src/game/assets/keys.ts`）。 */
  readonly sprite: string;
}

/** `step` 的结果。对象与其中的数组由 sim 复用，只在下一次 `step` 之前有效。 */
export interface StepResult {
  /** 本帧新生成的子弹。 */
  readonly bulletSpawns: readonly BulletSpawn[];
  /** 玩家是否已死亡。死亡后仍可继续调用 `step`，怪物照常活动，直到场景决定重来。 */
  readonly playerDead: boolean;
}

/** 两点之间是否没有墙阻挡，由 game 层按地图提供。M1 灰盒房间内没有内墙，可恒返回 true。 */
export type LineOfSight = (x1: number, y1: number, x2: number, y2: number) => boolean;

export interface CombatWorldOptions {
  /** 本局种子。sim 内部用 `fork` 派生各子系统的随机流（开火散布、暴击、AI）。 */
  seed: Seed;
  /** 事件发往的总线（ADR 0002 的战斗事件）。 */
  bus: EventBus<GameEvents>;
  /** 视线判断，用于敌人开火；不传时视为全部可见。 */
  lineOfSight?: LineOfSight;
  /** 地图适配层可写入绕墙路点；返回 false 则沿原行为移动。out 为 sim 复用向量。 */
  navigation?: (x: number, y: number, targetX: number, targetY: number, radius: number, out: Vec2) => boolean;
  /**
   * 同时存在的子弹上限，应与 game 层子弹池大小一致（`POOL_SIZES.bullets`）。
   * 达到上限时，本次开火中放不下的子弹不再生成。
   * 不传时为 500。sim 不能读取 `src/config.ts`，所以由调用方传入。
   */
  maxBullets?: number;
  /** 预热实体记录上限，默认 31。同步事件期间移除的记录在外层调用结束后复用，避免串号。 */
  maxActors?: number;
  /**
   * 调试用无敌（`?god=1`，Issue #17，ADR 0005）：玩家不受任何伤害，也不会进入受伤无敌帧。
   * 打到玩家的子弹按「命中无敌目标」处理：子弹消失，发出 `critical: false` 的 `bullet:hit`。
   */
  godMode?: boolean;
  /** 传入时启用护甲、能量、冲刺；不传保留 M1 行为。 */
  playerRules?: Readonly<PlayerRules>;
}

/**
 * 一局战斗的规则状态。每次重来新建一个，不复用旧对象。
 * 实体与子弹的编号都由 sim 分配（取代 ADR 0002 中「由 game 层分配」的说法，见 ADR 0003）。
 */
export interface MeleeState {
  active: boolean;
  weaponId: WeaponId;
  angle: number;
  remaining: number;
  duration: number;
  damage: number;
  hitIds: EntityId[];
}

export interface CombatWorld {
  readonly melee: Readonly<MeleeState>;
  /** sim 时间，秒，从 0 开始，只随 `step` 的 dt 增长。 */
  readonly time: number;
  /** 当前全部实体（含预警中与已死亡、尚未移除的）。数组由 sim 复用，不要修改或跨帧保存。 */
  readonly actors: readonly ActorView[];
  /** 玩家实体的编号；尚未生成玩家时为 null。 */
  readonly playerId: EntityId | null;
  readonly weaponId: WeaponId;
  readonly secondaryWeapon: WeaponId | null;
  readonly resources: Readonly<
    Pick<
      PlayerResources,
      | 'armor'
      | 'maxArmor'
      | 'energy'
      | 'maxEnergy'
      | 'coins'
      | 'skillRemaining'
      | 'dashRemaining'
      | 'damageScale'
      | 'fireRateScale'
      | 'regenScale'
      | 'skillScale'
    >
  >;
  /** 装备第二槽（第一槽固定为免费手枪，传入手枪会被拒绝）；地面拾取由 LootSystem 原槽置换，保留旧武器。 */
  takeWeapon(id: WeaponId): boolean;
  /** 使用 data 中的补给价格购买生命/能量；满额、余额不足、死亡时不扣钱。 */
  buySupplies(): boolean;
  grantPickup(kind: 'health' | 'energy' | 'coin', amount: number): boolean;
  upgrade(id: UpgradeId): boolean;
  /** 仅允许 time=0 的新世界恢复入口资源，先由调用方重放升级；有限值会夹到上限。 */
  restorePlayer(progress: { hp: number; armor: number; energy: number; coins: number }): boolean;
  /** 装备武器；保留开火冷却并取消旧武器待发连射，死亡时拒绝。 */
  equipWeapon(id: WeaponId): boolean;
  getActor(id: EntityId): ActorView | undefined;

  /** 生成玩家：没有出场预警，同一帧内依次发出 `entity:spawned` 与 `entity:activated`。 */
  spawnPlayer(kind: CharacterId, x: number, y: number): EntityId;
  /** 生成怪物：进入出场预警（`BALANCE.spawnTelegraph` 秒），预警结束时由 `step` 发出 `entity:activated`。 */
  spawnEnemy(kind: EnemyId, x: number, y: number): EntityId;

  /** 写回物理体的位置（脚底中心）。对未知或已移除的编号不做任何事。 */
  syncPosition(id: EntityId, x: number, y: number): void;
  /**
   * 推进一帧。`dt` 单位为秒，内部截断到 0.05 秒以内，避免卡顿后一帧走得太远。
   * `input` 只在本次调用中读取，不会被保存。
   *
   * 击退等按时间积分的量假设：本次的 `dt` 等于上一次 `step` 之后，物理按上次给出的速度实际积分的时间。
   * 每个物理步调用一次、`dt` 取物理步长时（ADR 0004）满足这一点，击退距离与数据完全一致。
   */
  step(dt: number, input: Readonly<InputFrame>): StepResult;

  /**
   * 子弹与实体重叠。sim 判断阵营、阶段与无敌帧，结算伤害并发出事件。
   * 返回 true 表示子弹应当消失（game 回收子弹，不需要再调用 `releaseBullet`）；
   * 返回 false 表示子弹继续飞行（穿透、或撞到同阵营 / 预警中的实体）。
   */
  hitActor(bulletId: EntityId, targetId: EntityId, x: number, y: number): boolean;
  /** 子弹撞墙：发出 `bullet:hit`（`targetId` 为 null），子弹消失。 */
  hitWall(bulletId: EntityId, x: number, y: number): void;
  /** 子弹寿命到期或飞出地图，静默回收，不发事件。 */
  releaseBullet(bulletId: EntityId): void;
  /** 怪物与玩家重叠。每帧重叠都可以调用，sim 自己处理无敌帧，不会重复扣血。 */
  contact(enemyId: EntityId, playerId: EntityId): void;

  /** 死亡表现播完、对象回收后调用，把已死亡的实体从 `actors` 中移除。 */
  removeActor(id: EntityId): void;
  /**
   * 调试用清房（F2，Issue #17，ADR 0005）：立即杀死全部怪物（含出场预警中的），
   * 每只按正常死亡顺序发出 `entity:damaged` → `entity:died`，`sourceId` / `killerId` 为 null。
   * 之后照常由 game 层在死亡表现结束后调用 `removeActor`。不要在正式玩法里调用。
   */
  debugKillEnemies(): void;

  /** 导出存档数据（ADR 0019）。只能在两次调用之间使用，不能在 step、hitActor 等调用的事件回调里调用。 */
  save(): CombatWorldState;
  /**
   * 把存档数据写入一个刚创建、还没有生成任何实体的世界（ADR 0019）。不发任何事件。
   * 数据须先按 ADR 0019 第 4 节校验；超出实体或子弹容量时抛错。
   */
  load(state: Readonly<CombatWorldState>): void;
}

/** 实体记录的存档数据（ADR 0019），按 `actors` 的顺序保存。字段含义同 ActorView 与 sim 内部状态。 */
export interface ActorState {
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
  activateAt: number;
  invulnUntil: number;
  invulnTime: number;
  baseX: number;
  baseY: number;
  moveSpeed: number;
  contactDamage: number;
  knock: {
    dirX: number;
    dirY: number;
    total: number;
    left: number;
    timeLeft: number;
    speed: number;
    fresh: boolean;
  };
  brain: EnemyBrain;
  warning: boolean;
}

/** 存活子弹的存档数据（ADR 0019）。`source` 是发射时的武器或敌方攻击定义 ID，用来重建半径与外观。 */
export interface BulletState {
  id: EntityId;
  team: Team;
  ownerId: EntityId;
  source: string;
  angle: number;
  damage: number;
  critChance: number;
  knockback: number;
  pierceLeft: number;
  /** 已命中过的实体编号；可以指向已经回收的实体。 */
  hitIds: EntityId[];
}

/** `CombatWorld.save()` 的结果：纯 JSON 数据，不含引用（ADR 0019）。 */
export interface CombatWorldState {
  melee: MeleeState;
  time: number;
  nextId: number;
  playerId: EntityId | null;
  playerDied: boolean;
  secondaryWeapon: WeaponId | null;
  player: {
    weaponId: WeaponId;
    cooldown: number;
    burstLeft: number;
    burstWait: number;
    maxSpeed: number;
    accelTime: number;
    decelTime: number;
  } | null;
  lastMoveDir: Vec2;
  dashDirection: Vec2;
  resources: PlayerResourcesState;
  rng: { spread: number; crit: number };
  actors: ActorState[];
  bullets: BulletState[];
}

/** 新建一局战斗。实现在 `CombatWorld.ts`，这里只是稳定的入口。 */
export function createCombatWorld(options: CombatWorldOptions): CombatWorld {
  return createCombatWorldImpl(options);
}
