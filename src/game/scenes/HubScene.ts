import { Scene, Scenes } from 'phaser';
import { DEPTH, SCENES } from '../../config';
import { HUB } from '../../data/hub';
import { createCombatWorld, type CombatWorld } from '../../sim/combat/api';
import { EventBus } from '../../sim/core/EventBus';
import type { GameEvents } from '../../sim/core/events';
import { createInputFrame } from '../../sim/core/types';
import { ART } from '../assets/demoArt';
import { configureCamera } from '../configureCamera';
import { RoomCamera } from '../RoomCamera';
import { setTestHooks } from '../testHooks';
import { InputScene } from '../ui/InputScene';
import { HubPanel } from '../ui/HubPanel';
import { CombatBridge } from '../world/CombatBridge';
import { bindCombatPause } from '../world/combatPause';
import type { PauseState } from '../world/PauseState';
import { createRoomArt } from '../world/RoomArt';

/** 大厅不创建 DungeonRun / RunPersistence，任何大厅操作都不会写冒险存档。 */
export class HubScene extends Scene {
  private readonly bus = new EventBus<GameEvents>();
  private readonly movement = createInputFrame();
  private sim!: CombatWorld;
  private bridge!: CombatBridge;
  private ui!: InputScene;
  private panel!: HubPanel;
  private pause!: PauseState;
  private roomCamera!: RoomCamera;
  constructor() {
    super(SCENES.hub);
  }
  create(): void {
    configureCamera(this);
    createRoomArt(this);
    this.add
      .image(HUB.door.x, HUB.door.y, ART.doors, 'open')
      .setDisplaySize(52, 39)
      .setDepth(DEPTH.floorDecals);
    this.sim = createCombatWorld({ seed: 0, bus: this.bus, maxActors: 1, maxBullets: 1 });
    this.sim.spawnPlayer('ai_proto', HUB.spawn.x, HUB.spawn.y);
    this.bridge = new CombatBridge(this, this.sim);
    this.bridge.actors.enableArt(this);
    if (this.bridge.actors.art) this.bridge.actors.art.showWeapon = false;
    this.scene.launch(InputScene.KEY, { hub: true });
    this.ui = this.scene.get(InputScene.KEY) as InputScene;
    this.roomCamera = new RoomCamera(this, this.ui);
    this.pause = bindCombatPause(this, () => {
      this.ui.controls?.reset();
      this.bridge.clearInput();
    });
    this.panel = new HubPanel(this, this.ui, this.pause, () => this.nearDoor);
    this.events.on(Scenes.Events.PRE_UPDATE, this.feedInput);
    this.events.once(Scenes.Events.SHUTDOWN, () => {
      this.events.off(Scenes.Events.PRE_UPDATE, this.feedInput);
      this.panel.destroy();
      this.scene.stop(InputScene.KEY);
      this.bus.clear();
    });
    setTestHooks({ ready: true, scene: SCENES.hub });
  }
  private get nearDoor(): boolean {
    const p = this.sim.getActor(this.sim.playerId!);
    return !!p && Math.hypot(p.x - HUB.door.x, p.y - HUB.door.y) <= HUB.reach;
  }
  private readonly feedInput = (): void => {
    if (!this.ui.controls || this.pause.blocked) return;
    const input = this.ui.controls.sample(this.ui.playerX, this.ui.playerY);
    // 大厅只接收移动和门的交互；不向 sim 传开火/技能/切枪。
    this.movement.move.x = input.move.x;
    this.movement.move.y = input.move.y;
    this.movement.source = input.source;
    this.bridge.setInput(this.movement);
    if (input.interactPressed) this.panel.open();
  };
  override update(): void {
    const p = this.sim.getActor(this.sim.playerId!);
    if (p) {
      this.ui.playerX = p.x;
      this.ui.playerY = p.y;
      this.roomCamera.update(p.x, p.y);
      this.roomCamera.hint(HUB.door.x, HUB.door.y, 0x7ee8ff);
    }
    this.panel.update();
  }
}
