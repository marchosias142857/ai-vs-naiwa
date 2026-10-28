import { DungeonRun } from '../../src/sim/run/DungeonRun';
import { AUTO, Game, Scene, Scale, type Physics } from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE } from '../../src/config';
import { BOSS_ROOM_LAYOUT } from '../../src/data/layouts';
import { ENEMIES } from '../../src/data/enemies';
import { roomTheme } from '../../src/data/traps';
import type { RoomArt } from '../../src/game/world/RoomArt';
import { installDemoArt, preloadDemoArt } from '../../src/game/assets/demoArt';
import { createPlaceholderTextures } from '../../src/game/assets/placeholders';
import type { SessionSnapshot } from '../../src/game/save/RunSnapshot';
import { DemoSession } from '../../src/game/systems/DemoSession';
import { InputScene } from '../../src/game/ui/InputScene';
import { GRAYBOX_BOUNDS as B } from '../../src/game/world/graybox';
import { EventBus } from '../../src/sim/core/EventBus';
import type { GameEvents } from '../../src/sim/core/events';
import { createInputFrame } from '../../src/sim/core/types';
import { createGeometryHit, GeometryMask } from '../../src/sim/geometry/RoomGeometry';

/** Real DemoSession, physics, art and pooled hazards. Only starting arrangements are fixtures.
 * No injected geometry provider, fake AI stages, velocities, actions or collision callbacks.
 */
class GeometryScene extends Scene {
  constructor() {
    super('Game');
  }
  preload(): void {
    preloadDemoArt(this);
  }
  create(data?: { restored?: SessionSnapshot }): void {
    createPlaceholderTextures(this);
    installDemoArt(this);
    this.physics.disableUpdate();
    this.scene.launch(InputScene.KEY, { demo: true });
    const ui = this.scene.get(InputScene.KEY) as InputScene;
    const bus = new EventBus<GameEvents>();
    const session = new DemoSession(this, bus, ui, 9, true, undefined, undefined, data?.restored, {
      runId: 'production-geometry-fixture',
    });
    const { sim, bridge, arena } = session;
    const input = createInputFrame();
    const actions: GameEvents['enemy:acted'][] = [];
    const shots: number[] = [];
    bus.on('enemy:acted', (e) => actions.push({ ...e }));
    bus.on('weapon:fired', (e) => shots.push(e.ownerId));
    // Uses the SAME Box -> static body + geometry compilation as production. The near-wall
    // column is deliberately synthetic: the present boss catalogue has no touching column.
    const boxes = (
      items: readonly { x: number; y: number; width: number; height: number }[],
      kind: 'wall' | 'pillar' = 'pillar',
    ) => {
      const fixtureArena = arena as unknown as {
        art: RoomArt | null;
        setBoxes: (b: typeof items, k: typeof kind) => void;
      };
      fixtureArena.art?.show(roomTheme(session.dungeon.floor).art, items);
      fixtureArena.setBoxes(items, kind);
    };
    const pin = (id: number, x: number, y: number) => {
      const slot = bridge.actors.slots.find((s) => s.id === id)!;
      const body = slot.image.body as Physics.Arcade.Body;
      body.reset(x, y);
      body.updateFromGameObject();
      body.prev.copy(body.position);
      body.prevFrame.copy(body.position);
      sim.syncPosition(id, x, y);
    };
    const step = () => {
      session.setInput(input);
      this.physics.world.update(0, 1000 / 60);
      this.physics.world.postUpdate();
      session.update();
    };
    const player = sim.playerId!;
    this.cameras.main.setZoom(RENDER_SCALE * 1.5).centerOn(B.x + B.width / 2, B.y + B.height / 2);
    window.productionGeometry = {
      showcase: (floor) => {
        const run = new DungeonRun(42, new EventBus(), floor);
        const theme = ['temple', 'wreck', 'abyss', 'milk'][floor - 1]!;
        run.roomId = run.map.rooms.find((r) => r.kind === (floor === 4 ? 'boss' : 'combat'))!.id;
        arena.show(
          run,
          `modular_v2/${theme}/${floor === 4 ? 'boss' : floor === 3 ? 'combat_1' : 'combat_0'}`,
        );
        const candidates = arena.spawnAnchors();
        const kinds = ['naiwa_scout', 'naiwa_turret', 'naiwa_burrower', 'naiwa_tank'] as const;
        for (let i = 0; i < 30; i++) {
          const p = candidates[i % candidates.length]!;
          sim.spawnEnemy(kinds[i % kinds.length]!, p.x, p.y);
        }
        for (let i = 0; i < 7; i++) {
          const p = candidates[candidates.length - 1 - i]!;
          Object.assign(sim.rocks[i]!, {
            active: true,
            slot: i,
            landed: true,
            x: p.x,
            y: p.y,
            radius: 9,
            time: 10,
            fall: 1,
            life: 60,
            damage: 1,
          });
        }
        bridge.actors.apply();
        input.aim = { x: 340, y: 135 };
        input.fire = true;
        for (let i = 0; i < 180; i++) step();
        session.update();
        return {
          theme,
          rocks: sim.rocks.filter((r) => r.active).length,
          actors: sim.actors.filter((a) => a.team === 'enemy' && a.phase !== 'dead').length,
          traps: sim.traps.filter((t) => t.active).map((t) => ({ kind: t.kind, state: t.state })),
          bullets: bridge.bullets.activeCount,
        };
      },
      restored: !!data?.restored,
      restore: (state) => this.scene.restart({ restored: state }),
      rockSave: () => {
        Object.assign(sim.rocks[0]!, {
          active: true,
          slot: 0,
          landed: true,
          x: 180,
          y: 166,
          radius: 8,
          time: 30,
          fall: 1,
          life: 30,
          damage: 1,
        });
        step();
        return session.save();
      },
      rockPresent: () => !arena.prepareGeometry().canOccupy({ x: 180, y: 166 }, 3, 'spawn'),
      run: (scenario: 'pillar' | 'boundary' | 'near-wall' | 'rain' | 'brood' | 'los' | 'hop') => {
        const errors: string[] = [];
        let checked = 0;
        if (scenario === 'brood') {
          const r = ENEMIES.naiwa_brood.radius;
          const id = sim.spawnEnemy('naiwa_brood', B.x + r, B.y + r);
          bridge.actors.apply();
          for (let i = 0; i < 600 && !actions.some((a) => a.action === 'summon'); i++) {
            pin(id, B.x + r, B.y + r);
            pin(player, B.x + B.width - 30, B.y + B.height - 30);
            step();
          }
          const kids = sim.actors.filter((a) => a.kind === 'naiwa_tadpole');
          for (const a of kids)
            if (!arena.prepareGeometry().canOccupy(a, a.radius, 'spawn')) errors.push('child outside');
          return { errors, checked: kids.length, actions, shots: shots.length };
        }
        if (scenario === 'los') {
          boxes([{ x: 0, y: 0, width: 20, height: 100 }]);
          const id = sim.spawnEnemy('naiwa_turret', 180, 135);
          bridge.actors.apply();
          pin(player, 300, 135);
          for (let i = 0; i < 480; i++) step();
          const blocked = shots.filter((owner) => owner === id).length;
          if (blocked) errors.push('fired through pillar');
          pin(player, 180, 200);
          for (let i = 0; i < 480; i++) step();
          checked = shots.filter((owner) => owner === id).length;
          // Arrange a landed rock in the production pool; the very next provider query
          // must see it, and removal must be visible without a render-frame refresh.
          const rocks = [
            { slot: 0, landed: true, x: 180, y: 166, radius: 8, time: 30, fall: 1, life: 30, damage: 1 },
          ];
          Object.assign(sim.rocks[0]!, rocks[0], { active: true });
          const geo = arena.prepareGeometry();
          const hit = createGeometryHit();
          geo.traceSegment({ x: 180, y: 135 }, { x: 180, y: 200 }, GeometryMask.LOS, hit);
          if (hit.kind !== 'rock') errors.push('landed rock absent');
          const revision = geo.revision;
          const before = shots.length;
          for (let i = 0; i < 180; i++) step();
          if (shots.length !== before) errors.push('fired through landed rock');
          sim.clearHazards();
          arena.prepareGeometry().traceSegment({ x: 180, y: 135 }, { x: 180, y: 200 }, GeometryMask.LOS, hit);
          if (hit.hit || geo.revision <= revision) errors.push('stale removed rock');
          const cleared = shots.length;
          for (let i = 0; i < 180; i++) step();
          if (shots.length === cleared) errors.push('did not resume firing');
          return { errors, checked, actions, shots: shots.length };
        }
        if (scenario === 'hop') {
          boxes([{ x: -20, y: 0, width: 20, height: 100 }]);
          const id = sim.spawnEnemy('naiwa_hopper', 160, 135);
          bridge.actors.apply();
          pin(player, 280, 135);
          let target = 0;
          for (let i = 0; i < 360; i++) {
            step();
            const a = sim.getActor(id)!;
            if (a.stage === 'air') target = a.landX;
            if (actions.some((e) => e.action === 'land')) {
              if (!arena.prepareGeometry().canOccupy(a, a.radius, 'land')) errors.push('illegal landing');
              if (Math.abs(target - (210 - a.radius)) > 0.02) errors.push(`target ${target}`);
              checked++;
              break;
            }
          }
          return { errors, checked, actions, shots: shots.length };
        }
        boxes(
          scenario === 'near-wall'
            ? [{ x: -10, y: -68, width: 20, height: 40 }]
            : scenario === 'boundary'
              ? []
              : BOSS_ROOM_LAYOUT,
        );
        const start = scenario === 'near-wall' ? { x: 144, y: B.y + 14 } : { x: 125, y: 93 };
        const target = scenario === 'rain' ? { x: 280, y: 135 } : { x: B.x + B.width - 7, y: start.y };
        const id = sim.spawnEnemy('naiwa_boss', start.x, start.y);
        bridge.actors.apply();
        pin(player, target.x, target.y);
        if (scenario === 'rain') {
          const boss = sim.getActor(id)!;
          Object.assign(boss, { hp: Math.floor(boss.maxHp * 0.3) });
        }
        let dashing = false;
        for (let i = 0; i < 1500; i++) {
          if (scenario !== 'rain' && !dashing) pin(id, start.x, start.y);
          pin(player, target.x, target.y);
          step();
          const a = sim.getActor(id)!;
          dashing ||= a.move === 'bump' && a.stage === 'dash';
          if (scenario === 'rain') {
            for (const r of sim.rocks)
              if (r.active && !r.landed && r.fall - r.time <= 1 / 60 + 1e-9) {
                if (!arena.prepareGeometry().canOccupy(r, r.radius, 'rock')) errors.push('illegal rock');
                checked++;
              }
          } else {
            const crash = actions.find((e) => e.action === 'crash' || e.action === 'stun');
            if (crash) {
              if (crash.action !== (scenario === 'boundary' ? 'crash' : 'stun')) errors.push(crash.action);
              checked++;
              break;
            }
          }
        }
        session.update();
        return { errors, checked, actions, shots: shots.length };
      },
    };
  }
}
declare global {
  interface Window {
    productionGeometry: {
      showcase: (floor: number) => {
        theme: string;
        rocks: number;
        actors: number;
        traps: { kind: string; state: string }[];
        bullets: number;
      };
      restored: boolean;
      restore: (state: SessionSnapshot) => void;
      rockSave: () => SessionSnapshot;
      rockPresent: () => boolean;
      run: (scenario: 'pillar' | 'boundary' | 'near-wall' | 'rain' | 'brood' | 'los' | 'hop') => {
        errors: string[];
        checked: number;
        actions: GameEvents['enemy:acted'][];
        shots: number;
      };
    };
  }
}
new Game({
  type: AUTO,
  parent: 'game',
  width: GAME_WIDTH * RENDER_SCALE,
  height: GAME_HEIGHT * RENDER_SCALE,
  scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { fixedStep: true } },
  input: { activePointers: 3, gamepad: true },
  scene: [GeometryScene, InputScene],
});
