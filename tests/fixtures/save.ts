import { HubScene } from '../../src/game/scenes/HubScene';
import { AUTO, Game, Scene, Scale } from 'phaser';
import { createPlaceholderTextures } from '../../src/game/assets/placeholders';
import { bindLifecycle } from '../../src/game/bindLifecycle';
import { GameScene, type GameStart } from '../../src/game/scenes/GameScene';
import { MenuPanel } from '../../src/game/ui/MenuPanel';
import { InputScene } from '../../src/game/ui/InputScene';
import { setTestHooks } from '../../src/game/testHooks';
import { readSavedRun, RUN_KEY } from '../../src/game/save/runStorage';
import { decodeSimSnapshot, type RunSnapshot, type SessionSnapshot } from '../../src/game/save/RunSnapshot';
import type { DemoSession } from '../../src/game/systems/DemoSession';
import { createInputFrame } from '../../src/sim/core/types';
import { SAVE_REQUEST, LIFECYCLE_PAUSE } from '../../src/game/world/combatPause';
import { doorStage, ROOM_CENTER, walkTo } from './route';

class Bootstrap extends Scene {
  create(): void {
    createPlaceholderTextures(this);
    this.scene.start(new URLSearchParams(location.search).get('scene') === 'Game' ? 'Game' : 'Menu');
  }
}
class SaveMenu extends Scene {
  private panel!: MenuPanel;
  constructor() {
    super('Menu');
  }
  create(): void {
    // 使用生产字段校验器；拒绝开关只用来测试入口兜底提示。
    this.panel = new MenuPanel(this, () =>
      readSavedRun((value, seed) =>
        sessionStorage.getItem('fixture.reject') ? null : decodeSimSnapshot(value, seed),
      ),
    );
    setTestHooks({ scene: 'Menu', ready: true });
  }
  override update(): void {
    this.panel.update();
  }
}
const events: string[] = [];
class SaveGame extends GameScene {
  steps = 0;
  override create(data?: GameStart): void {
    this.steps = 0;
    events.length = 0;
    for (const type of [
      'entity:spawned',
      'entity:died',
      'entity:damaged',
      'weapon:fired',
      'bullet:hit',
      'room:entered',
      'room:cleared',
      'run:started',
      'run:ended',
    ] as const)
      this.bus.on(type, (event) => events.push(`${type}:${JSON.stringify(event)}`));
    super.create(data);
    // 同样的物理步输入序列：保留真实 PRE_UPDATE / UI / lifecycle，只由 fixture 驱动物理。
    this.physics.disableUpdate();
    this.physics.world.on('worldstep', () => this.steps++);
  }
}
const game = new Game({
  type: AUTO,
  parent: 'game',
  width: 480,
  height: 270,
  scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { fixedStep: true } },
  input: { activePointers: 3, gamepad: true },
  scene: [Bootstrap, SaveMenu, SaveGame, HubScene, InputScene],
});
bindLifecycle(game);
const battle = () => game.scene.getScene('Game') as SaveGame;
// 仅 fixture 可以访问测试安排入口；生产只暴露只读 probe。
const session = () => (battle() as unknown as { demo: DemoSession }).demo;
const tick = (n: number, frame = createInputFrame()) => {
  for (let i = 0; i < n; i++) {
    session().setInput(frame);
    battle().physics.world.update(0, 1000 / 60);
    battle().physics.world.postUpdate();
    battle().update(0, 1000 / 60);
  }
};
/** 实际物理绕开内墙与鱼雷桶走到 (x, y)。 */
function walk(x: number, y: number): void {
  const input = createInputFrame();
  if (!walkTo(session(), input, () => tick(1, input), x, y)) throw Error(`未能走到 (${x}, ${y})`);
  tick(12);
}
function next(id: number): void {
  const s = session(),
    from = s.dungeon.room,
    to = s.dungeon.map.rooms[id]!,
    stage = doorStage(s, to.x - from.x, to.y - from.y);
  walk(stage.x, stage.y);
  const input = createInputFrame();
  input.move.x = to.x - from.x;
  input.move.y = to.y - from.y;
  for (let i = 0; i < 400 && s.dungeon.roomId === from.id; i++) tick(1, input);
  tick(12);
  if (s.dungeon.roomId !== id) throw Error('未能穿门');
}
const api = {
  snapshot: (): SessionSnapshot => session().save(),
  stored: (): RunSnapshot => JSON.parse(localStorage.getItem(RUN_KEY)!),
  status: () => ({
    remaining: session().pause.remaining,
    paused: battle().physics.world.isPaused,
    steps: battle().steps,
    events: [...events],
    saveListeners: game.events.listenerCount(SAVE_REQUEST),
    pauseListeners: game.events.listenerCount(LIFECYCLE_PAUSE),
    children: battle().children.length,
  }),
  tick,
  prepare: (mode: 'battle' | 'offer' | 'exit' | 'plain') => {
    if (mode === 'plain') {
      tick(4);
      return;
    }
    if (mode === 'battle') {
      next(session().dungeon.room.links[0]!);
      tick(70);
      const input = createInputFrame();
      input.fire = true;
      input.aim = { x: 0, y: -1 };
      tick(1, input);
      return;
    }
    for (let room = 1; room <= session().dungeon.map.exit; room++) {
      next(room);
      for (let i = 0; i < 400 && session().dungeon.locked; i++) {
        session().sim.debugKillEnemies();
        tick(1);
      }
    }
    walk(ROOM_CENTER.x, ROOM_CENTER.y);
    if (mode === 'exit') return;
    const input = createInputFrame();
    input.interactPressed = true;
    tick(1, input);
    if (!session().offers.length) throw Error('未产生升级候选');
  },
  queueEdges: () => {
    session().sim.takeWeapon('shotgun_fan');
    const input = createInputFrame();
    input.skillPressed = input.swapPressed = input.interactPressed = true;
    session().setInput(input);
  },
  continueSteps: () => {
    session().clearInput();
    events.length = 0;
    const input = createInputFrame();
    input.fire = true;
    input.aim = { x: 1, y: 0 };
    tick(180, input);
    return { state: session().save(), events: [...events] };
  },
  hidden: (hidden: boolean) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: hidden ? 'hidden' : 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  },
  page: (hide: boolean) =>
    window.dispatchEvent(new PageTransitionEvent(hide ? 'pagehide' : 'pageshow', { persisted: true })),
  save: () => game.events.emit(SAVE_REQUEST),
  finish: () => {
    session().dungeon.phase = 'lost';
    battle().update(0, 0);
  },
  choose: () => session().chooseUpgrade(session().offers[0]!),
};
declare global {
  interface Window {
    saveFixture: typeof api;
  }
}
window.saveFixture = api;
