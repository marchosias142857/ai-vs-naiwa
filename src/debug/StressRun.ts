import { Physics, Scenes, type Scene } from 'phaser';
import { COLORS, POOL_SIZES } from '../config';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { ROOM_LAYOUTS } from '../data/layouts';
import { PLAYER_RULES } from '../data/player';
import { createCombatWorld } from '../sim/combat/api';
import { Random } from '../sim/core/Random';
import { EventBus } from '../sim/core/EventBus';
import type { GameEvents } from '../sim/core/events';
import { createInputFrame } from '../sim/core/types';
import { CombatAudio } from '../game/fx/CombatAudio';
import { CombatFeedback } from '../game/fx/CombatFeedback';
import { CombatBridge } from '../game/world/CombatBridge';
import { RoomArena } from '../game/world/RoomArena';
import { GRAYBOX_BOUNDS as B } from '../game/world/graybox';
import { InputScene } from '../game/ui/InputScene';
import { setTestHooks } from '../game/testHooks';
import { DebugTools } from './DebugTools';
import { StressMeter, type StressLoad } from './StressMeter';

/** Issue #18 的固定负载，不是玩法数值；全部弹丸仍由真实 sim 分配编号并经 bridge 进入池。 */
const BULLETS = 400;
const KINDS: readonly EnemyId[] = [
  'naiwa_scout',
  'naiwa_chaser',
  'naiwa_tank',
  'naiwa_spitter',
  'naiwa_turret',
  'naiwa_charger',
  'naiwa_boss',
];
export class StressRun {
  private readonly bus = new EventBus<GameEvents>();
  readonly sim;
  readonly bridge;
  readonly fx;
  readonly waves = { wave: 0, alive: 0 };
  kills = 0;
  private readonly arena: RoomArena;
  private readonly ui: InputScene;
  private readonly tools: DebugTools;
  private readonly rng: Random;
  private readonly input = createInputFrame();
  private spawned = 0;
  private warmed = false;
  constructor(
    private readonly scene: Scene,
    readonly seed: number,
    private readonly fixed: boolean,
  ) {
    this.rng = new Random(seed).fork('stress:positions');
    this.sim = createCombatWorld({
      seed,
      bus: this.bus,
      godMode: true,
      playerRules: PLAYER_RULES,
      maxActors: POOL_SIZES.actors,
      maxBullets: fixed ? BULLETS : POOL_SIZES.bullets,
      navigation: (x, y, tx, ty, radius, out) => this.arena?.steer(x, y, tx, ty, radius, out) ?? false,
      lineOfSight: (x, y, tx, ty) => this.arena?.lineOfSight(x, y, tx, ty) ?? true,
    });
    this.sim.spawnPlayer('ai_proto', B.x + B.width / 2, B.y + B.height / 2);
    this.sim.takeWeapon('ring_staff');
    // 固定容量测试保留碰撞查询，但不结算伤害/消耗弹丸。真实战斗模式保持全部规则。
    if (fixed) this.sim.hitActor = () => false;
    scene.add.rectangle(B.x + B.width / 2, B.y + B.height / 2, B.width, B.height, COLORS.floor);
    this.bridge = new CombatBridge(scene, this.sim);
    this.arena = new RoomArena(scene, this.bridge, fixed);
    this.arena.setLayout(ROOM_LAYOUTS.length - 1);
    this.fx = new CombatFeedback(scene, this.sim, this.bridge, this.bus);
    new CombatAudio(scene, this.bus);
    scene.scene.launch(InputScene.KEY, { demo: true });
    this.ui = scene.scene.get(InputScene.KEY) as InputScene;
    this.tools = new DebugTools(scene, this, { seed, godMode: true });
    new StressMeter(scene, fixed ? 'capacity-30x400' : 'combat-mixed', seed, this.readLoad);
    scene.events.on(Scenes.Events.PRE_UPDATE, this.feedInput);
    scene.physics.world.on(Physics.Arcade.Events.WORLD_STEP, this.maintainLoad);
    this.bus.on('entity:died', this.onDeath);
    scene.events.once('shutdown', this.destroy);
    setTestHooks({ ready: true, scene: 'Game', seed });
    this.maintainLoad();
    this.update(0);
  }
  get player() {
    return this.sim.playerId === null ? undefined : this.sim.getActor(this.sim.playerId);
  }
  private readonly feedInput = () => {
    if (!this.ui.sys.isActive() || !this.ui.controls) return;
    const frame = this.ui.controls.sample(this.ui.playerX, this.ui.playerY),
      out = this.input;
    out.move.x = frame.move.x;
    out.move.y = frame.move.y;
    out.aim = frame.aim;
    out.fire = this.fixed || frame.fire;
    out.skillPressed = frame.skillPressed;
    out.swapPressed = frame.swapPressed;
    out.interactPressed = frame.interactPressed;
    out.pausePressed = frame.pausePressed;
    out.source = frame.source;
    this.bridge.setInput(out);
    out.aim = null; // 不跨帧保存输入层的复用向量。
  };
  private readonly maintainLoad = () => {
    this.sim.grantPickup('energy', PLAYER_RULES.energy);
    // 固定弹量：寿命不消耗，内外墙反弹；不伪造编号、不额外推进 sim。
    if (this.fixed)
      for (const slot of this.bridge.bullets.slots)
        if (slot.id) {
          slot.remaining = Infinity;
          slot.image.setCollideWorldBounds(true, 1, 1, false).setBounce(1);
        }
    for (
      let attempt = 0;
      attempt < POOL_SIZES.actors && this.sim.actors.length < POOL_SIZES.actors;
      attempt++
    ) {
      const kind = KINDS[this.spawned % KINDS.length]!,
        radius = ENEMIES[kind].radius,
        x = this.rng.range(B.x + radius, B.x + B.width - radius),
        y = this.rng.range(B.y + radius, B.y + B.height - radius);
      if (this.arena.isFree(x, y, radius)) {
        this.sim.spawnEnemy(kind, x, y);
        this.spawned++;
      }
    }
    this.waves.alive = 0;
    for (const actor of this.sim.actors)
      if (actor.team === 'enemy' && actor.phase !== 'dead') this.waves.alive++;
  };
  private readonly onDeath = () => {
    this.kills++;
  };
  private readonly readLoad = (out: StressLoad) => {
    out.actors = this.waves.alive;
    out.bullets = this.bridge.bullets.activeCount;
    this.warmed ||= out.actors === POOL_SIZES.actors - 1 && (!this.fixed || out.bullets === BULLETS);
    out.ready = this.warmed; // 开始后保留死亡/补怪的开销，不筛掉真实战斗中的慢帧。
    out.effects = this.fx.activeCount;
    out.children = this.scene.children.length;
    out.simSeconds = this.sim.time;
  };
  update(delta: number): void {
    const p = this.player;
    if (p) {
      this.ui.playerX = p.x;
      this.ui.playerY = p.y - p.radius;
    }
    this.fx.update();
    this.tools.update(delta);
  }
  private readonly destroy = () => {
    this.scene.events.off(Scenes.Events.PRE_UPDATE, this.feedInput);
    this.scene.physics.world?.off(Physics.Arcade.Events.WORLD_STEP, this.maintainLoad);
    this.arena.destroy();
    this.scene.scene.stop(InputScene.KEY);
    this.bus.clear();
  };
}
