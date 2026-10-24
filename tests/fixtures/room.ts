import { AUTO, Game, Scene } from 'phaser';
import { createPlaceholderTextures } from '../../src/game/assets/placeholders';
import { RoomArena } from '../../src/game/world/RoomArena';
import { CombatBridge } from '../../src/game/world/CombatBridge';
import { createCombatWorld } from '../../src/sim/combat/api';
import { EventBus } from '../../src/sim/core/EventBus';
import type { GameEvents } from '../../src/sim/core/events';
import { createInputFrame } from '../../src/sim/core/types';
import { DungeonRun } from '../../src/sim/run/DungeonRun';

class RoomScene extends Scene {
  create(): void {
    createPlaceholderTextures(this);
    this.physics.disableUpdate();
    let arena: RoomArena;
    const bus = new EventBus<GameEvents>(),
      sim = createCombatWorld({
        seed: 1,
        bus,
        godMode: true,
        navigation: (x, y, tx, ty, radius, out) => arena.steer(x, y, tx, ty, radius, out),
      });
    const p = sim.spawnPlayer('ai_proto', 140, 99),
      bridge = new CombatBridge(this, sim);
    const room = new DungeonRun(1, bus);
    room.enter(1);
    arena = new RoomArena(this, bridge);
    arena.show(room, 1);
    let hits = 0;
    bus.on('bullet:hit', (e) => {
      if (e.targetId === null) hits++;
    });
    window.navigationTest = () => {
      const id = sim.spawnEnemy('naiwa_chaser', 210, 99),
        input = createInputFrame();
      let detour = false,
        insideWall = false;
      for (let i = 0; i < 360; i++) {
        bridge.setInput(input);
        this.physics.world.update((i * 1000) / 60, 1000 / 60);
        this.physics.world.postUpdate();
        const actor = sim.getActor(id)!;
        detour ||= Math.abs(actor.y - 99) > 18;
        insideWall ||= actor.x > 164 && actor.x < 188 && actor.y > 87 && actor.y < 111;
      }
      const actor = sim.getActor(id)!,
        player = sim.getActor(p)!;
      return { detour, insideWall, distance: Math.hypot(actor.x - player.x, actor.y - player.y) };
    };
    window.roomTest = () => {
      const input = createInputFrame();
      input.move.x = 1;
      input.aim = { x: 1, y: 0 };
      input.fire = true;
      for (let i = 0; i < 90; i++) {
        bridge.setInput(input);
        this.physics.world.update((i * 1000) / 60, 1000 / 60);
        this.physics.world.postUpdate();
      }
      const x = sim.getActor(p)!.x,
        blocked = !arena.lineOfSight(140, 99, 210, 99),
        clear = arena.lineOfSight(140, 135, 300, 135);
      const children = this.children.length;
      for (let i = 0; i < 50; i++) arena.show(room, i);
      arena.teleport(1, 0);
      const a = sim.getActor(p)!,
        body = bridge.actors.slots.find((s) => s.id === p)!.image.body!;
      return {
        hits,
        x,
        blocked,
        clear,
        sameChildren: children === this.children.length,
        bullets: bridge.bullets.activeCount,
        bodyX: body.center.x,
        bodyY: body.center.y,
        simX: a.x,
        simY: a.y,
      };
    };
  }
}
declare global {
  interface Window {
    navigationTest: () => { detour: boolean; insideWall: boolean; distance: number };
    roomTest: () => {
      hits: number;
      x: number;
      blocked: boolean;
      clear: boolean;
      sameChildren: boolean;
      bullets: number;
      bodyX: number;
      bodyY: number;
      simX: number;
      simY: number;
    };
  }
}
new Game({
  type: AUTO,
  width: 480,
  height: 270,
  physics: { default: 'arcade', arcade: { fixedStep: true } },
  scene: [RoomScene],
});
