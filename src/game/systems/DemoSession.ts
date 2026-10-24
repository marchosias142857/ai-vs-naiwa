import type { FloorCheckpoint } from '../../sim/run/checkpoint';
import { CombatFeedback } from '../fx/CombatFeedback';
import { Physics, Scenes } from 'phaser';
import type { Scene } from 'phaser';
import { POOL_SIZES } from '../../config';
import { ROOM_LAYOUTS } from '../../data/layouts';
import { LOOT_RULES } from '../../data/loot';
import { BALANCE } from '../../data/balance';
import { PLAYER_RULES, UPGRADES, type UpgradeId } from '../../data/player';
import { ROOM_RULES } from '../../data/rooms';
import { WEAPONS, type WeaponId } from '../../data/weapons';
import { createCombatWorld, type CombatWorld } from '../../sim/combat/api';
import type { EventBus } from '../../sim/core/EventBus';
import type { GameEvents } from '../../sim/core/events';
import { Random } from '../../sim/core/Random';
import type { InputFrame } from '../../sim/core/types';
import { LootSystem } from '../../sim/loot/LootSystem';
import { DungeonRun } from '../../sim/run/DungeonRun';
import { RoomDirector } from '../../sim/run/RoomDirector';
import type { InputScene } from '../ui/InputScene';
import { CombatBridge } from '../world/CombatBridge';
import { RoomArena } from '../world/RoomArena';
import { GRAYBOX_BOUNDS as B } from '../world/graybox';
import { bindCombatPause } from '../world/combatPause';
import type { PauseState } from '../world/PauseState';

/** demo 的接线层；规则状态留在 sim，输入渲染帧采样、所有计时物理步推进。 */
export class DemoSession {
  readonly sim: CombatWorld;
  readonly bridge: CombatBridge;
  readonly dungeon: DungeonRun;
  readonly loot: LootSystem;
  readonly arena: RoomArena;
  readonly fx: CombatFeedback;
  readonly pause: PauseState;
  readonly offers: UpgradeId[] = [];
  private readonly upgrades: UpgradeId[] = [];
  settled = false;
  private readonly director: RoomDirector;
  private readonly root: Random;
  private rewardRng: Random;
  private interact = false;
  private endTime = 0;
  private layout = 0;
  private drawnRevision = -1;

  constructor(
    private readonly scene: Scene,
    private readonly bus: EventBus<GameEvents>,
    readonly inputScene: InputScene,
    readonly seed: number,
    god = false,
    weapon?: string | null,
    checkpoint?: FloorCheckpoint,
  ) {
    this.root = new Random(seed);
    this.rewardRng = this.root.fork(`upgrades:${checkpoint?.floor ?? 1}`);
    this.sim = createCombatWorld({
      seed,
      bus,
      maxBullets: POOL_SIZES.bullets,
      maxActors: POOL_SIZES.actors,
      godMode: god,
      playerRules: PLAYER_RULES,
      navigation: (x, y, tx, ty, radius, out) => this.arena?.steer(x, y, tx, ty, radius, out) ?? false,
      lineOfSight: (x1, y1, x2, y2) => this.arena?.lineOfSight(x1, y1, x2, y2) ?? true,
    });
    this.sim.spawnPlayer('ai_proto', B.x + B.width / 2, B.y + B.height / 2);
    if (checkpoint) {
      for (const id of checkpoint.upgrades) {
        this.sim.upgrade(id);
        this.upgrades.push(id);
      }
      if (checkpoint.secondary) this.sim.takeWeapon(checkpoint.secondary);
      this.sim.equipWeapon(checkpoint.equipped);
      this.sim.restorePlayer(checkpoint);
    }
    if (weapon && Object.hasOwn(WEAPONS, weapon)) this.sim.takeWeapon(weapon as WeaponId);
    this.bridge = new CombatBridge(scene, this.sim);
    this.arena = new RoomArena(scene, this.bridge);
    this.fx = new CombatFeedback(scene, this.sim, this.bridge, bus);
    this.dungeon = new DungeonRun(seed, bus, checkpoint?.floor);
    if (checkpoint) {
      this.dungeon.kills = checkpoint.kills;
      this.dungeon.roomsCleared = checkpoint.roomsCleared;
      this.dungeon.elapsed = checkpoint.elapsed;
    }
    this.loot = new LootSystem(this.root.fork(`loot:${this.dungeon.floor}`));
    this.director = new RoomDirector(
      this.sim,
      this.dungeon,
      this.root,
      B,
      this.arena.isFree,
      POOL_SIZES.actors,
    );
    this.showRoom();
    this.publishPosition();
    this.pause = bindCombatPause(scene, this.clearInput);
    bus.on('entity:died', this.onDied);
    bus.on('room:cleared', this.onCleared);
    scene.events.on(Scenes.Events.PRE_UPDATE, this.feedInput);
    scene.physics.world.on(Physics.Arcade.Events.WORLD_STEP, this.step);
    scene.events.once(Scenes.Events.SHUTDOWN, this.destroy);
  }
  get player() {
    return this.sim.playerId === null ? undefined : this.sim.getActor(this.sim.playerId);
  }
  get kills() {
    return this.dungeon.kills;
  }
  get waves() {
    return this.dungeon;
  }

  /** 与 CombatBridge 一样锁存交互边沿：0 步保留，多步只消费一次。 */
  setInput(frame: Readonly<InputFrame>): void {
    if (this.dungeon.finished || this.pause.blocked) {
      this.bridge.clearInput();
      this.interact = false;
      return;
    }
    this.bridge.setInput(frame);
    this.interact ||= frame.interactPressed;
  }
  /** 三处锁存必须一起清空；冻结期间也不会累积新的玩法边沿。 */
  readonly clearInput = (): void => {
    this.inputScene.controls?.reset();
    this.bridge.clearInput();
    this.interact = false;
  };
  private readonly feedInput = (): void => {
    const ui = this.inputScene;
    if (ui.sys.isActive() && ui.controls) this.setInput(ui.controls.sample(ui.playerX, ui.playerY));
  };
  private readonly step = (dt: number): void => {
    const interact = this.interact;
    this.interact = false;
    if (this.offers.length) return;
    this.director.step(dt);
    const p = this.player;
    if (!p) return;
    if (this.dungeon.finished) {
      if (!this.endTime)
        for (const slot of this.bridge.bullets.slots)
          if (slot.id) {
            this.sim.releaseBullet(slot.id);
            this.bridge.bullets.recycle(slot);
          }
      this.endTime += dt;
      if (this.endTime >= BALANCE.deathRestartDelay) {
        this.settled = true;
        this.pause.set('finished', true);
      }
      return;
    }
    this.loot.collect(this.sim, p.x, p.y, interact);
    const next = this.arena.exit(this.dungeon, p.x, p.y, p.vx, p.vy);
    if (next !== null) {
      const previous = this.dungeon.room,
        to = this.dungeon.map.rooms[next]!;
      if (this.dungeon.enter(next)) {
        this.showRoom();
        this.arena.teleport(to.x - previous.x, to.y - previous.y);
        this.publishPosition();
      }
      return;
    }
    if (
      interact &&
      this.dungeon.room.kind === 'exit' &&
      Math.hypot(p.x - (B.x + B.width / 2), p.y - (B.y + B.height / 2)) <= ROOM_RULES.exitReach
    ) {
      // 升级只在换层时分配候选列表；选择期间暂停物理，不消费战斗时间。
      const candidates = Object.keys(UPGRADES) as UpgradeId[];
      this.rewardRng.shuffle(candidates);
      for (let i = 0; i < LOOT_RULES.upgradeChoices; i++) this.offers.push(candidates[i]!);
      this.pause.set('upgrade', true);
    }
  };
  buySupplies(): boolean {
    return (
      !this.pause.has('manual') &&
      !this.pause.has('lifecycle') &&
      this.offers.length > 0 &&
      this.sim.buySupplies()
    );
  }
  chooseUpgrade(id: UpgradeId): boolean {
    if (
      this.pause.has('manual') ||
      this.pause.has('lifecycle') ||
      !this.offers.includes(id) ||
      !this.sim.upgrade(id)
    )
      return false;
    this.offers.length = 0;
    this.upgrades.push(id);
    this.dungeon.nextFloor();
    this.rewardRng = this.root.fork(`upgrades:${this.dungeon.floor}`);
    this.loot.resetFloor(this.root.fork(`loot:${this.dungeon.floor}`));
    this.showRoom();
    this.arena.teleport();
    this.publishPosition();
    this.pause.set('upgrade', false);
    return true;
  }
  /** 仅在楼层入口调用；数据由调用方序列化，绝不保存 sim 复用视图。 */
  checkpoint(): FloorCheckpoint {
    const d = this.dungeon,
      r = this.sim.resources;
    return {
      version: 1,
      seed: this.seed,
      floor: d.floor,
      upgrades: [...this.upgrades],
      secondary: this.sim.secondaryWeapon,
      equipped: this.sim.weaponId,
      hp: this.player!.hp,
      armor: r.armor,
      energy: r.energy,
      coins: r.coins,
      kills: d.kills,
      roomsCleared: d.roomsCleared,
      elapsed: d.elapsed,
    };
  }
  private showRoom(): void {
    this.loot.enterRoom(this.dungeon.roomId);
    this.layout = this.root
      .fork(`layout:${this.dungeon.floor}:${this.dungeon.roomId}`)
      .int(0, ROOM_LAYOUTS.length - 1);
    this.arena.show(this.dungeon, this.layout);
    this.drawnRevision = this.dungeon.revision;
    if (
      this.dungeon.room.kind === 'chest' &&
      !this.dungeon.claimed[this.dungeon.roomId] &&
      this.loot.chest(B.x + B.width / 2, B.y + B.height / 2)
    )
      this.dungeon.claim();
  }
  /** 本帧物理后发布位置，保持 #28 的鼠标瞄准顺序。 */
  update(): void {
    this.publishPosition();
    this.fx.update();
    if (this.drawnRevision !== this.dungeon.revision) {
      this.arena.draw(this.dungeon);
      this.drawnRevision = this.dungeon.revision;
    }
  }
  private publishPosition(): void {
    const p = this.player;
    if (p) {
      this.inputScene.playerX = p.x;
      this.inputScene.playerY = p.y - p.radius;
    }
  }
  private readonly onDied = (e: GameEvents['entity:died']): void => {
    if (e.team === 'enemy') {
      this.loot.enemy(e.x, e.y);
    }
  };
  private readonly onCleared = (): void => this.loot.reward(B.x + B.width / 2, B.y + B.height / 2);
  private readonly destroy = (): void => {
    this.scene.events.off(Scenes.Events.PRE_UPDATE, this.feedInput);
    this.scene.physics.world?.off(Physics.Arcade.Events.WORLD_STEP, this.step);
    this.bus.off('entity:died', this.onDied);
    this.bus.off('room:cleared', this.onCleared);
    this.dungeon.destroy();
    this.arena.destroy();
  };
}
