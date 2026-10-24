import { DemoHud } from '../../src/game/ui/DemoHud';
import { AUTO, Game, Scene } from 'phaser';
import { createPlaceholderTextures } from '../../src/game/assets/placeholders';
import { DemoSession } from '../../src/game/systems/DemoSession';
import { InputScene } from '../../src/game/ui/InputScene';
import { EventBus } from '../../src/sim/core/EventBus';
import type { GameEvents } from '../../src/sim/core/events';
import { createInputFrame } from '../../src/sim/core/types';
import { DUNGEON } from '../../src/data/dungeon';

class DemoHarness extends Scene {
  private hud?: DemoHud;
  constructor() {
    super('Game');
  }
  create(): void {
    createPlaceholderTextures(this);
    this.physics.disableUpdate();
    this.scene.launch(InputScene.KEY);
    const bus = new EventBus<GameEvents>(),
      session = new DemoSession(this, bus, this.scene.get(InputScene.KEY) as InputScene, 42, true);
    this.hud = new DemoHud(this, session);
    window.offerState = () => ({
      floor: session.dungeon.floor,
      energy: session.sim.resources.energy,
      coins: session.sim.resources.coins,
      offers: session.offers.length,
    });
    window.feedbackScenario = () => {
      const input = createInputFrame(),
        children = this.children.length;
      let steps = 0,
        hits = 0;
      bus.on('bullet:hit', (e) => {
        if (e.targetId !== null) hits++;
      });
      const tick = (n: number) => {
        for (let i = 0; i < n; i++) {
          session.setInput(input);
          this.physics.world.update((++steps * 1000) / 60, 1000 / 60);
          this.physics.world.postUpdate();
          session.update();
        }
      };
      const id = session.sim.spawnEnemy('naiwa_tank', 330, 135);
      tick(1);
      const telegraphHidden = !session.bridge.actors.slots.find((s) => s.id === id)!.image.visible;
      tick(45);
      input.fire = true;
      tick(30);
      input.fire = false;
      const effects = session.fx.activeCount;
      session.sim.debugKillEnemies();
      tick(1);
      const delayedDeath = session.sim.getActor(id)?.phase === 'dead';
      tick(30);
      return {
        hits,
        effects,
        telegraphHidden,
        delayedDeath,
        recycled: !session.sim.getActor(id),
        stable: children === this.children.length,
      };
    };
    window.demoScenario = (stopAtOffer = false) => {
      const input = createInputFrame();
      if (stopAtOffer) {
        session.sim.takeWeapon('rifle_auto');
        session.sim.grantPickup('coin', 50);
        input.fire = true;
      }
      let steps = 0,
        rooms = 0;
      const children = this.children.length;
      const tick = (count: number) => {
        for (let i = 0; i < count; i++) {
          session.setInput(input);
          this.physics.world.update((++steps * 1000) / 60, 1000 / 60);
          this.physics.world.postUpdate();
          session.update();
        }
      };
      const walk = (x: number, y: number) => {
        for (let i = 0; i < 400; i++) {
          const p = session.player!;
          const dx = x - p.x,
            dy = y - p.y,
            n = Math.hypot(dx, dy);
          if (n < 2) break;
          input.move.x = dx / n;
          input.move.y = dy / n;
          tick(1);
        }
        input.move.x = input.move.y = 0;
        tick(12);
      };
      // 实际物理走到门口，不调用 DungeonRun.enter 或篡改 sim 位置。
      const next = (id: number) => {
        walk(240, 135);
        const from = session.dungeon.room,
          to = session.dungeon.map.rooms[id]!;
        input.move.x = to.x - from.x;
        input.move.y = to.y - from.y;
        for (let i = 0; i < 400 && session.dungeon.roomId === from.id; i++) tick(1);
        input.move.x = input.move.y = 0;
        tick(12);
        if (session.dungeon.roomId !== id) throw Error('未能穿过门');
        rooms++;
      };
      const clear = () => {
        for (let i = 0; i < 400 && session.dungeon.locked; i++) {
          // 使用已批准的调试清房入口；刷怪、事件、池回收和开门仍经真实接线。
          session.sim.debugKillEnemies();
          tick(1);
        }
        if (session.dungeon.locked) throw Error('清房未开门');
      };
      for (let floor = 1; floor <= DUNGEON.floors; floor++) {
        for (let room = 1; room <= session.dungeon.map.exit; room++) {
          next(room);
          clear();
        }
        walk(240, 135);
        input.interactPressed = true;
        tick(1);
        input.interactPressed = false;
        if (session.offers.length !== 3) throw Error('缺少升级选择');
        if (stopAtOffer) {
          this.hud!.update(300);
          return {
            phase: 'offer',
            settled: false,
            floor,
            rooms,
            kills: session.kills,
            childrenStable: children === this.children.length,
            bullets: session.bridge.bullets.activeCount,
            steps,
          };
        }
        if (!session.chooseUpgrade(session.offers[0]!)) throw Error('升级失败');
      }
      next(1);
      clear();
      tick(100);
      return {
        phase: session.dungeon.phase,
        settled: session.settled,
        floor: session.dungeon.floor,
        rooms,
        kills: session.kills,
        childrenStable: children === this.children.length,
        bullets: session.bridge.bullets.activeCount,
        steps,
      };
    };
  }
  override update(_time: number, delta: number): void {
    this.hud?.update(delta);
  }
}
declare global {
  interface Window {
    feedbackScenario: () => {
      hits: number;
      effects: number;
      telegraphHidden: boolean;
      delayedDeath: boolean;
      recycled: boolean;
      stable: boolean;
    };
    offerState: () => { floor: number; energy: number; coins: number; offers: number };
    demoScenario: (stopAtOffer?: boolean) => {
      phase: string;
      settled: boolean;
      floor: number;
      rooms: number;
      kills: number;
      childrenStable: boolean;
      bullets: number;
      steps: number;
    };
  }
}
new Game({
  type: AUTO,
  width: 480,
  height: 270,
  physics: { default: 'arcade', arcade: { fixedStep: true } },
  scene: [DemoHarness, InputScene],
});
