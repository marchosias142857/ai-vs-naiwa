import { Physics, Scenes } from 'phaser';
import type { Scene } from 'phaser';
import { POOL_SIZES } from '../../config';
import { BALANCE } from '../../data/balance';
import { createCombatWorld, type CombatWorld } from '../../sim/combat/api';
import type { EventBus } from '../../sim/core/EventBus';
import type { GameEvents } from '../../sim/core/events';
import type { Random } from '../../sim/core/Random';
import type { EntityId } from '../../sim/core/types';
import { WaveDirector } from '../../sim/run/WaveDirector';
import type { InputController } from '../input/InputController';
import type { InputScene } from '../ui/InputScene';
import { CombatBridge } from '../world/CombatBridge';
import { GRAYBOX_BOUNDS } from '../world/graybox';

/** 一局的阶段：战斗中 → 玩家已死（等待重来延迟）→ 可以重来。 */
export type RunPhase = 'playing' | 'dead' | 'restartable';

export interface CombatRunOptions {
  seed: number;
  /** 本局随机流；刷怪用 `fork('waves')`。 */
  rng: Random;
  bus: EventBus<GameEvents>;
  /** 提供输入的 UI 场景（#12）。它在战斗场景之后创建，所以每帧再取 `controls`。 */
  inputScene: InputScene;
  /** 调试无敌（`?god=1`，ADR 0005）。 */
  godMode?: boolean;
}

/**
 * 把输入、sim、实体和刷怪接在一起（#15）。只做接线与流程，不做规则判断：
 *
 * - 战斗场景 PRE_UPDATE（早于 Arcade 推进物理）：采样输入，交给 bridge 锁存。
 * - Arcade 每个物理步：bridge 推进 sim（#14），之后刷怪导演推进同样的 dt（ADR 0004）。
 * - 战斗场景 update：回收已死的怪，玩家死亡后计时，到时进入可重来阶段。
 */
export class CombatRun {
  readonly sim: CombatWorld;
  readonly bridge: CombatBridge;
  readonly waves: WaveDirector;
  readonly playerId: EntityId;
  phase: RunPhase = 'playing';
  kills = 0;
  /** 最近一次采样时开火键是否按住（重来时判断手柄 RT）。 */
  fireHeld = false;
  /**
   * 最近一次交给 sim 的瞄准方向（没有手动瞄准时为 NaN），以及当时的身体中心。
   * 只给测试探针核对「瞄准原点是当前位置」，不参与逻辑。
   */
  readonly lastAim = { x: NaN, y: NaN, originX: NaN, originY: NaN };
  private deadTime = 0;
  /** 等待回收的死亡怪物；复用同一个数组。 */
  private readonly corpses: EntityId[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly options: CombatRunOptions,
  ) {
    const { seed, rng, bus, godMode } = options;
    const bounds = GRAYBOX_BOUNDS;
    this.sim = createCombatWorld({ seed, bus, maxBullets: POOL_SIZES.bullets, godMode });
    // 先生成玩家再建 bridge：bridge 构造时会为现有实体分配槽位。
    this.playerId = this.sim.spawnPlayer(
      'ai_proto',
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    this.bridge = new CombatBridge(scene, this.sim);
    this.publishPlayerPosition();
    this.waves = new WaveDirector({ world: this.sim, rng: rng.fork('waves'), bounds, kind: 'naiwa_chaser' });

    bus.on('entity:died', this.onDied);
    scene.events.on(Scenes.Events.PRE_UPDATE, this.feedInput);
    // 在 bridge 之后注册，同一物理步里先推进 sim，再推进刷怪。
    scene.physics.world.on(Physics.Arcade.Events.WORLD_STEP, this.stepWaves);
    scene.events.once(Scenes.Events.SHUTDOWN, this.destroy);
  }

  get player() {
    return this.sim.getActor(this.playerId);
  }

  /** 由战斗场景的 update 调用；`dt` 为秒。 */
  update(dt: number): void {
    this.publishPlayerPosition();
    // M1 没有死亡动画，怪物一死就回收槽位。#16 接入死亡表现后，改为表现播完再调用 finishDeath。
    for (const id of this.corpses) this.bridge.actors.finishDeath(id);
    this.corpses.length = 0;

    if (this.phase === 'playing' && this.bridge.playerDead) {
      this.phase = 'dead';
      this.deadTime = 0;
    } else if (this.phase === 'dead') {
      this.deadTime += dt;
      if (this.deadTime >= BALANCE.deathRestartDelay) this.phase = 'restartable';
    }
  }

  private readonly feedInput = (): void => {
    const ui = this.options.inputScene;
    if (!ui.sys.isActive()) return;
    const controls = ui.controls as InputController | undefined;
    if (!controls) return;
    // InputScene 在场景列表里排在后面，Phaser 倒序更新场景，所以它的兜底采样通常先于这里执行；
    // 本帧已经采样过时这里只拿到缓存。两处用的都是 publishPlayerPosition 写入的位置，结果相同。
    const frame = controls.sample(ui.playerX, ui.playerY);
    this.fireHeld = frame.fire;
    this.bridge.setInput(frame);
    this.lastAim.x = frame.aim ? frame.aim.x : NaN;
    this.lastAim.y = frame.aim ? frame.aim.y : NaN;
    this.lastAim.originX = ui.playerX;
    this.lastAim.originY = ui.playerY;
  };

  /**
   * 把玩家身体中心写给输入层，与 sim 的开火原点对齐。在战斗场景 update（本帧物理之后）写入：
   * 下一帧无论是 InputScene 还是 PRE_UPDATE 先采样，中间都没有物理推进，拿到的就是玩家当前位置。
   */
  private publishPlayerPosition(): void {
    const player = this.player;
    if (!player) return;
    this.options.inputScene.playerX = player.x;
    this.options.inputScene.playerY = player.y;
  }

  private readonly stepWaves = (dt: number): void => this.waves.step(dt);

  private readonly onDied = (e: GameEvents['entity:died']): void => {
    if (e.team !== 'enemy') return;
    this.kills++;
    this.corpses.push(e.id);
  };

  private readonly destroy = (): void => {
    this.scene.events.off(Scenes.Events.PRE_UPDATE, this.feedInput);
    this.scene.events.off(Scenes.Events.SHUTDOWN, this.destroy);
    // Arcade 的 shutdown 可能先执行，此时 world 已清空。
    this.scene.physics.world?.off(Physics.Arcade.Events.WORLD_STEP, this.stepWaves);
    this.options.bus.off('entity:died', this.onDied);
  };
}
