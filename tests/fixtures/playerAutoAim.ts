import { AUTO, Game, Scene, Scale, type Physics } from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE } from '../../src/config';
import type { WeaponId } from '../../src/data/weapons';
import { installDemoArt, preloadDemoArt } from '../../src/game/assets/demoArt';
import { createPlaceholderTextures } from '../../src/game/assets/placeholders';
import { configureCamera } from '../../src/game/configureCamera';
import { DemoSession } from '../../src/game/systems/DemoSession';
import { GRAYBOX_BOUNDS as B } from '../../src/game/world/graybox';
import { InputScene } from '../../src/game/ui/InputScene';
import { EventBus } from '../../src/sim/core/EventBus';
import type { GameEvents } from '../../src/sim/core/events';
import type { InputFrame } from '../../src/sim/core/types';

/** Only the encounter and clock are arranged here. DOM/gamepad -> production InputScene ->
 * DemoSession -> CombatBridge -> sim -> real Arcade bodies remains the production path. */
class AimScene extends Scene {
  constructor() {
    super('Game');
  }
  preload(): void {
    preloadDemoArt(this);
  }
  create(): void {
    createPlaceholderTextures(this);
    installDemoArt(this);
    configureCamera(this);
    this.physics.disableUpdate();
    this.scene.launch(InputScene.KEY, { demo: true });
    const ui = this.scene.get(InputScene.KEY) as InputScene;
    const bus = new EventBus<GameEvents>();
    const session = new DemoSession(this, bus, ui, 42, true, undefined, undefined, undefined, {
      runId: 'player-auto-aim-fixture',
    });
    const { sim, bridge, arena } = session;
    const shots: GameEvents['weapon:fired'][] = [];
    const shotTargets: { x: number; y: number }[] = [];
    let targetId = 0;
    let stationary = false;
    let targetDamage = 0;
    bus.on('entity:damaged', (e) => {
      if (e.id === targetId) targetDamage++;
    });
    bus.on('weapon:fired', (e) => {
      if (e.ownerId === sim.playerId) {
        shots.push({ ...e });
        const target = sim.getActor(targetId)!;
        shotTargets.push({ x: target.x, y: target.y });
      }
    });
    const step = (n: number) => {
      for (let i = 0; i < n; i++) {
        if (stationary) {
          const body = bridge.actors.slots.find((s) => s.id === targetId)?.image.body as
            Physics.Arcade.Body | undefined;
          body?.setVelocity(0, 0);
        }
        session.setInput(ui.controls.sample(ui.playerX, ui.playerY));
        this.physics.world.update(0, 1000 / 60);
        this.physics.world.postUpdate();
        session.update();
      }
    };
    const pin = (id: number, x: number, y: number) => {
      const body = bridge.actors.slots.find((s) => s.id === id)!.image.body as Physics.Arcade.Body;
      body.reset(x, y);
      body.updateFromGameObject();
      body.prev.copy(body.position);
      body.prevFrame.copy(body.position);
      sim.syncPosition(id, x, y);
    };
    const boxes = (items: readonly { x: number; y: number; width: number; height: number }[]) => {
      (arena as unknown as { setBoxes: (b: typeof items, kind: 'pillar') => void }).setBoxes(items, 'pillar');
    };
    const read = () => ({
      input: structuredClone(ui.controls.frame),
      shots: [...shots],
      shotTargets: [...shotTargets],
      targetDamage,
      facing: session.player!.facing,
      bodyFacing: sim.playerBodyFacing,
      melee: { active: sim.melee.active, angle: sim.melee.angle },
      beam: { active: sim.beam.active, angle: sim.beam.angle },
      bullets: bridge.bullets.slots
        .filter((s) => s.id)
        .map((s) => {
          const body = s.image.body as Physics.Arcade.Body;
          return { x: body.velocity.x, y: body.velocity.y };
        }),
      specialShots: sim.save().shots.map((s) => ({ vx: s.vx, vy: s.vy })),
    });
    window.playerAutoAim = {
      prepare: (weapon: WeaponId, blocked = false, stationaryTadpole = false) => {
        stationary = stationaryTadpole;
        boxes([]);
        sim.setTraps(-1, []);
        const p = session.player!,
          x = p.x,
          y = p.y;
        const enemy = sim.spawnEnemy(
          stationary ? 'naiwa_tadpole' : weapon === 'coral_bow' ? 'naiwa_turret' : 'naiwa_chaser',
          x,
          y + 36,
        );
        targetId = enemy;
        step(40); // Real spawn telegraph and fixed steps, no fabricated active phase.
        pin(p.id, x, y);
        pin(enemy, x, y + 36);
        if (blocked)
          boxes([{ x: x - (B.x + B.width / 2), y: y + 18 - (B.y + B.height / 2), width: 24, height: 8 }]);
        sim.equipWeapon(weapon);
        session.update();
        this.cameras.main.setScroll(
          x - this.scale.width / (2 * RENDER_SCALE),
          y - this.scale.height / (2 * RENDER_SCALE),
        );
        const c = ui.controls,
          rect = c.rect;
        return {
          fire: { x: rect.left + c.touch.fireX, y: rect.top + c.touch.fireY },
          mouse: { x: rect.left + rect.width / 2 - 30, y: rect.top + rect.height / 2 },
        };
      },
      read,
      tick: (n = 1) => {
        step(n);
        return read();
      },
    };
  }
}
declare global {
  interface Window {
    playerAutoAim: {
      prepare: (
        weapon: WeaponId,
        blocked?: boolean,
        stationaryTadpole?: boolean,
      ) => { fire: { x: number; y: number }; mouse: { x: number; y: number } };
      read: () => AimSnapshot;
      tick: (n?: number) => AimSnapshot;
    };
  }
}
interface AimSnapshot {
  input: InputFrame;
  shots: GameEvents['weapon:fired'][];
  shotTargets: { x: number; y: number }[];
  targetDamage: number;
  facing: number;
  bodyFacing: number;
  melee: { active: boolean; angle: number };
  beam: { active: boolean; angle: number };
  bullets: { x: number; y: number }[];
  specialShots: { vx: number; vy: number }[];
}
new Game({
  type: AUTO,
  parent: 'game',
  width: GAME_WIDTH * RENDER_SCALE,
  height: GAME_HEIGHT * RENDER_SCALE,
  scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { fixedStep: true } },
  input: { activePointers: 3, gamepad: true },
  scene: [AimScene, InputScene],
});
