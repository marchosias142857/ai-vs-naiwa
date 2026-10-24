import { AUTO, Game, Scene } from 'phaser';
import { POOL_SIZES } from '../../src/config';
import { createPlaceholderTextures } from '../../src/game/assets/placeholders';
import { CombatFeedback, type DeathSnapshot } from '../../src/game/fx/CombatFeedback';
import { CombatBridge, type PhysicsSnapshot } from '../../src/game/world/CombatBridge';
import { RoomArena } from '../../src/game/world/RoomArena';
import { createCombatWorld, type CombatWorldState } from '../../src/sim/combat/api';
import { EventBus } from '../../src/sim/core/EventBus';
import type { GameEvents } from '../../src/sim/core/events';
import { createInputFrame } from '../../src/sim/core/types';

interface Saved {
  sim: CombatWorldState;
  physics: PhysicsSnapshot;
  deaths: DeathSnapshot[];
}
type Mode = 'mixed' | 'full' | 'corpse' | 'teleport';
class SnapshotScene extends Scene {
  create(): void {
    createPlaceholderTextures(this);
    this.physics.disableUpdate();
    let ran = false;
    window.snapshotScenario = (mode, saved) => {
      if (ran) throw new Error('每组使用全新的场景');
      ran = true;
      const bus = new EventBus<GameEvents>();
      const sim = createCombatWorld({ seed: 42, bus, godMode: true, maxBullets: POOL_SIZES.bullets });
      if (saved) sim.load(saved.sim);
      else {
        sim.spawnPlayer('ai_proto', 160, 130);
        if (mode !== 'teleport') {
          sim.spawnEnemy('naiwa_turret', 270, 125);
          sim.spawnEnemy('naiwa_tank', 240, 160);
        }
      }
      const bridge = new CombatBridge(this, sim);
      const fx = new CombatFeedback(this, sim, bridge, bus);
      if (saved) {
        bridge.load(saved.physics, saved.sim);
        fx.loadDeaths(saved.deaths);
      }
      const input = createInputFrame();
      input.aim = { x: 1, y: 0 };
      const dt = 1 / 60;
      let steps = 0;
      const step = () => {
        bridge.setInput(input);
        this.physics.world.update(++steps * dt * 1000, dt * 1000);
        this.physics.world.postUpdate();
        fx.update();
      };
      const save = (): Saved => ({ sim: sim.save(), physics: bridge.save(), deaths: fx.saveDeaths() });
      if (!saved) {
        if (mode === 'full') {
          // 只在安排初始局面时跳过移动，实际生成 500 条 sim 记录；之后全走 Arcade + WORLD_STEP。
          sim.equipWeapon('ring_staff');
          input.fire = true;
          while (bridge.bullets.activeCount < POOL_SIZES.bullets) {
            for (const b of sim.step(0.05, input).bulletSpawns) bridge.bullets.spawn(b);
          }
          bridge.actors.apply();
        } else {
          for (let i = 0; i < 80; i++) step();
          if (mode === 'mixed') {
            sim.equipWeapon('heavy_cannon');
            input.fire = true;
            step();
          } else if (mode === 'corpse') {
            sim.debugKillEnemies();
            for (let i = 0; i < 4; i++) step();
          } else {
            input.move.x = 1;
            for (let i = 0; i < 3; i++) step();
            new RoomArena(this, bridge).teleport();
          }
        }
      }
      const before = JSON.parse(JSON.stringify(save())) as Saved;
      const events: string[] = [];
      for (const type of ['entity:damaged', 'entity:died', 'bullet:hit', 'weapon:fired'] as const)
        bus.on(type, (e) => events.push(`${type}:${JSON.stringify(e)}`));
      const children = this.children.length;
      input.move.x = 0;
      input.fire = true;
      for (let i = 0; i < 150; i++) {
        // 尸体释放后再生怪：同时检查演员槽位与 sim 数组顺序。
        if (i === 30 && mode === 'corpse') {
          sim.spawnEnemy('naiwa_scout', 250, 130);
          sim.spawnEnemy('naiwa_tank', 240, 170);
        }
        step();
      }
      return { before, after: save(), events, stable: this.children.length === children };
    };
  }
}
declare global {
  interface Window {
    snapshotScenario: (
      mode: Mode,
      saved?: Saved,
    ) => {
      before: Saved;
      after: Saved;
      events: string[];
      stable: boolean;
    };
  }
}
new Game({
  type: AUTO,
  width: 480,
  height: 270,
  physics: { default: 'arcade', arcade: { fixedStep: true } },
  scene: [SnapshotScene],
});
