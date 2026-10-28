import { DungeonRun } from '../../src/sim/run/DungeonRun';
import { AUTO, Game, Scene, Scale, type Physics, type GameObjects } from 'phaser';
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
import { ART } from '../../src/game/assets/demoArt';
import { MAP_ART } from '../../src/data/mapArt';
import { DemoObjects } from '../../src/game/world/DemoObjects';

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
    const missing = new URLSearchParams(location.search).get('missing');
    if (missing === 'legacy-doors') this.textures.remove(ART.doors);
    if (missing === 'objects') this.textures.remove(MAP_ART.textures.objects);
    this.physics.disableUpdate();
    this.scene.launch(InputScene.KEY, { demo: true });
    const ui = this.scene.get(InputScene.KEY) as InputScene;
    const bus = new EventBus<GameEvents>();
    const session = new DemoSession(this, bus, ui, 9, true, undefined, undefined, data?.restored, {
      runId: 'production-geometry-fixture',
    });
    const { sim, bridge, arena } = session;
    const objects = new DemoObjects(this, session);
    objects.update();
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
      trapState: (state) => {
        const traps = sim.traps.filter((t) => t.active);
        for (const t of traps)
          Object.assign(
            t,
            t.kind === 'spikes'
              ? { state: state === 'broken' ? 'idle' : state }
              : t.kind === 'barrel'
                ? { hp: state === 'idle' ? 8 : 2, state: state === 'broken' ? 'broken' : 'idle' }
                : t.kind === 'mine'
                  ? { state: state === 'idle' ? 'idle' : 'fuse', time: 5 }
                  : {},
          );
        session.update();
        const target = traps.find((t) => t.kind === 'spikes') ?? traps[0]!;
        this.cameras.main.setZoom(10).centerOn(target.x, target.y);
        return this.children.list
          .filter(
            (o) =>
              (o.type === 'Image' || o.type === 'TileSprite') &&
              (o as GameObjects.Image).visible &&
              (o as GameObjects.Image).texture.key === MAP_ART.textures.objects,
          )
          .map((o) => (o as GameObjects.Image).frame.name);
      },
      objects: (kind) => {
        const run = session.dungeon;
        run.roomId = run.map.rooms.find((r) => r.kind === kind)!.id;
        arena.show(run, 'modular_v2/temple/empty');
        session.loot.clear();
        session.loot.reward(240, 150);
        session.update();
        objects.update();
        this.cameras.main.setZoom(10).centerOn(240, 135);
        return this.children.list
          .filter(
            (o) =>
              o.type === 'Image' &&
              (o as GameObjects.Image).visible &&
              [MAP_ART.textures.objects, MAP_ART.textures.hub].some(
                (key) => key === (o as GameObjects.Image).texture.key,
              ),
          )
          .map((o) => (o as GameObjects.Image).frame.name);
      },
      walls: (floor, focus) => {
        const direction =
          focus === 'north'
            ? { x: 0, y: -1 }
            : focus === 'south'
              ? { x: 0, y: 1 }
              : focus === 'east'
                ? { x: 1, y: 0 }
                : focus === 'west'
                  ? { x: -1, y: 0 }
                  : undefined;
        let run = new DungeonRun(42, new EventBus(), floor);
        const theme = ['temple', 'wreck', 'abyss', 'milk'][floor - 1]!;
        for (let seed = 42; seed < 170; seed++) {
          run = new DungeonRun(seed, new EventBus(), floor);
          const room = run.map.rooms
            .filter(
              (r) =>
                r.kind === (floor === 4 ? 'boss' : 'combat') &&
                (!direction ||
                  r.links.some(
                    (id) =>
                      run.map.rooms[id]!.x - r.x === direction.x &&
                      run.map.rooms[id]!.y - r.y === direction.y,
                  )),
            )
            .sort((a, b) => b.links.length - a.links.length)[0];
          if (room) {
            run.roomId = room.id;
            break;
          }
          if (seed === 169) throw Error('No generated room with requested gate direction');
        }
        run.phase = focus === 'side-locked' ? 'fighting' : 'exploring';
        arena.show(
          run,
          `modular_v2/${theme}/${floor === 4 ? 'boss' : floor === 3 || focus === 'obstacle' ? 'combat_1' : 'combat_0'}`,
        );
        bridge.actors.apply();
        session.update();
        const adjacent =
          run.map.rooms[
            run.room.links.find((id) =>
              direction
                ? run.map.rooms[id]!.x - run.room.x === direction.x &&
                  run.map.rooms[id]!.y - run.room.y === direction.y
                : focus.startsWith('side')
                  ? run.map.rooms[id]!.x !== run.room.x
                  : run.map.rooms[id]!.y < run.room.y,
            ) ?? run.room.links[0]!
          ]!;
        const port = arena.port(adjacent.x - run.room.x, adjacent.y - run.room.y);
        const corner =
          floor === 3
            ? { x: 208, y: 71 }
            : floor === 4
              ? { x: 376, y: 47 }
              : { x: floor === 1 ? 336 : 352, y: 71 };
        const obstacle = this.children.list.find(
          (o) =>
            o.type === 'TileSprite' &&
            (o as unknown as { texture: { key: string }; visible: boolean }).texture.key ===
              MAP_ART.textures.blocks &&
            (o as unknown as { visible: boolean }).visible,
        ) as unknown as { x: number; y: number };
        this.cameras.main
          .setZoom(focus === 'room' ? 4.25 : 12)
          .centerOn(
            focus === 'room'
              ? 240
              : focus === 'obstacle'
                ? obstacle.x
                : focus !== 'corner'
                  ? port.center.x
                  : corner.x,
            focus === 'room'
              ? 135
              : focus === 'obstacle'
                ? obstacle.y
                : focus !== 'corner'
                  ? port.center.y
                  : corner.y,
          );
        const visibleDoors = this.children.list.filter(
          (o) =>
            o.type === 'Image' &&
            [MAP_ART.doorTextures.horizontal, MAP_ART.doorTextures.vertical].some(
              (key) => key === (o as unknown as { texture: { key: string } }).texture.key,
            ) &&
            (o as unknown as { visible: boolean }).visible,
        ) as unknown as Array<{
          texture: { key: string };
          frame: { name: string };
          y: number;
          originY: number;
          displayHeight: number;
        }>;
        const south = visibleDoors.find((o) => o.frame.name === `${theme}_south_open`);
        return {
          theme,
          doors: visibleDoors.length,
          sideDoors: visibleDoors.filter((o) => o.texture.key === MAP_ART.doorTextures.vertical).length,
          lockedDoors: visibleDoors.filter((o) => o.frame.name.endsWith('_locked')).length,
          expectedDoors: run.room.links.length,
          southAlignment:
            focus === 'south' && south
              ? south.y - south.originY * south.displayHeight - (port.center.y - MAP_ART.wallHeight)
              : null,
        };
      },
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
      zones: (active) => {
        for (let i = 0; i < 2; i++)
          Object.assign(sim.zones[i]!, {
            active,
            kind: i ? 'poison' : 'milk',
            x: i ? 274 : 206,
            y: 148,
            radius: 20,
            duration: 10,
            remaining: 6,
          });
        session.update();
        this.cameras.main.setZoom(8).centerOn(240, 148);
        const visible = this.children.list.filter(
          (o): o is GameObjects.Image =>
            'texture' in o &&
            (o as GameObjects.Image).texture.key === MAP_ART.textures.effects &&
            'visible' in o &&
            o.visible === true &&
            ['hazard_milk', 'hazard_poison'].includes(String((o as GameObjects.Image).frame.name)),
        );
        return {
          frames: visible.map((o) => String(o.frame.name)).sort(),
          opaqueEnough: visible.every((o) => o.alpha > 0.6),
          children: this.children.length,
          textures: this.textures.getTextureKeys().length,
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
      trapState: (state: 'idle' | 'warn' | 'on' | 'broken') => string[];
      objects: (kind: 'chest' | 'exit') => string[];
      walls: (
        floor: number,
        focus:
          | 'room'
          | 'door'
          | 'corner'
          | 'side-open'
          | 'side-locked'
          | 'obstacle'
          | 'north'
          | 'south'
          | 'east'
          | 'west',
      ) => {
        theme: string;
        doors: number;
        sideDoors: number;
        lockedDoors: number;
        expectedDoors: number;
        southAlignment: number | null;
      };
      showcase: (floor: number) => {
        theme: string;
        rocks: number;
        actors: number;
        traps: { kind: string; state: string }[];
        bullets: number;
      };
      zones: (active: boolean) => {
        frames: string[];
        opaqueEnough: boolean;
        children: number;
        textures: number;
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
