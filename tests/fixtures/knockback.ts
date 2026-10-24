import { AUTO, Game, Scene } from 'phaser';
import type { Physics } from 'phaser';
import { POOL_SIZES } from '../../src/config';
import { BALANCE } from '../../src/data/balance';
import { CHARACTERS } from '../../src/data/characters';
import { WEAPONS } from '../../src/data/weapons';
import { createPlaceholderTextures } from '../../src/game/assets/placeholders';
import { CombatBridge } from '../../src/game/world/CombatBridge';
import { createCombatWorld } from '../../src/sim/combat/api';
import { EventBus } from '../../src/sim/core/EventBus';
import type { GameEvents } from '../../src/sim/core/events';
import { createInputFrame } from '../../src/sim/core/types';

class KnockbackScene extends Scene {
  create(): void {
    createPlaceholderTextures(this);
    this.physics.disableUpdate();
    let ran = false;
    window.knockback = (fps, fire, stopAfter) => {
      if (ran) throw new Error('每组必须重新加载页面，避免继承物理世界的状态');
      ran = true;
      this.physics.world.setFPS(fps);
      const dt = 1 / fps;
      const bus = new EventBus<GameEvents>();
      const sim = createCombatWorld({ seed: 42, bus, maxBullets: POOL_SIZES.bullets });
      sim.spawnPlayer('ai_proto', 160, 130);
      const enemyId = sim.spawnEnemy('naiwa_chaser', 280, 130);
      const bridge = new CombatBridge(this, sim);
      const input = createInputFrame('touch');
      // 玩家没有自动瞄准（ADR 0020）：从身体中心对准敌人的碰撞圆心。
      const r = CHARACTERS.ai_proto.radius,
        aimLength = Math.hypot(280 - 160, 130 - (130 - r));
      input.aim = { x: (280 - 160) / aimLength, y: r / aimLength };
      const enemyImage = bridge.actors.slots.find((s) => s.id === enemyId)!.image;
      const enemyBody = enemyImage.body as Physics.Arcade.Body;
      let steps = 0,
        hitStep = 0,
        hits = 0,
        fired = 0,
        overlaps = 0;
      const trace: string[] = [];
      for (const slot of bridge.bullets.slots) (slot.image.body as Physics.Arcade.Body).onOverlap = true;
      // 观察引擎的真实重叠事件；不直接调用 step、hitActor，也不注入子弹或速度。
      this.physics.world.on('overlap', (a: Physics.Arcade.Image, b: Physics.Arcade.Image) => {
        if (
          (a === enemyImage && bridge.bullets.byImage.has(b)) ||
          (b === enemyImage && bridge.bullets.byImage.has(a))
        ) {
          overlaps++;
          trace.push('overlap');
        }
      });
      bus.on('weapon:fired', () => fired++);
      bus.on('bullet:hit', (event) => {
        if (event.targetId !== enemyId) return;
        hits++;
        hitStep = steps;
        trace.push('hit');
      });
      const settleSteps = Math.ceil(BALANCE.knockbackTime / dt) + 1;
      const limit =
        stopAfter ??
        Math.ceil(
          (BALANCE.spawnTelegraph +
            WEAPONS.pistol_basic.range / WEAPONS.pistol_basic.bulletSpeed +
            BALANCE.knockbackTime +
            1) /
            dt,
        );
      while (steps < limit) {
        input.fire = fire && fired === 0 && sim.getActor(enemyId)!.phase === 'active';
        bridge.setInput(input);
        steps++;
        this.physics.world.update(steps * dt * 1000, dt * 1000);
        this.physics.world.postUpdate();
        if (stopAfter === undefined && hitStep && steps >= hitStep + settleSteps) break;
      }
      const enemy = sim.getActor(enemyId)!;
      return {
        steps,
        time: sim.time,
        hitStep,
        hits,
        fired,
        overlaps,
        trace,
        x: enemyBody.center.x,
        y: enemyBody.center.y,
        simX: enemy.x,
        simY: enemy.y,
        hp: enemy.hp,
        phase: enemy.phase,
        vx: enemy.vx,
        vy: enemy.vy,
        bullets: bridge.bullets.activeCount,
      };
    };
  }
}
interface KnockbackResult {
  steps: number;
  time: number;
  hitStep: number;
  hits: number;
  fired: number;
  overlaps: number;
  trace: string[];
  x: number;
  y: number;
  simX: number;
  simY: number;
  hp: number;
  phase: string;
  vx: number;
  vy: number;
  bullets: number;
}
declare global {
  interface Window {
    knockback: (fps: number, fire: boolean, stopAfter?: number) => KnockbackResult;
  }
}
new Game({
  type: AUTO,
  width: 480,
  height: 270,
  physics: { default: 'arcade', arcade: { fixedStep: true } },
  scene: [KnockbackScene],
});
