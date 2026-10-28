import { AUTO, Game, Scene, type Physics } from 'phaser';
import { LEGACY_V1 } from '../../src/data/roomTemplates/legacyV1';
import { UPGRADES, type UpgradeId } from '../../src/data/player';
import { createPlaceholderTextures } from '../../src/game/assets/placeholders';
import type { SessionSnapshot } from '../../src/game/save/RunSnapshot';
import { DemoSession } from '../../src/game/systems/DemoSession';
import { InputScene } from '../../src/game/ui/InputScene';
import { GRAYBOX_BOUNDS } from '../../src/game/world/graybox';
import { EventBus } from '../../src/sim/core/EventBus';
import type { Random } from '../../src/sim/core/Random';
import { selectRoomLayouts, roomTemplate } from '../../src/sim/dungeon/roomCatalog';
import type { GeometryObstacle } from '../../src/sim/geometry/RoomGeometry';

// Actual session, selector and Arcade bodies. Fixture changes room IDs directly to enumerate
// the whole catalog; it does not claim to test walking through doors or new map visuals.
class CatalogScene extends Scene {
  constructor() {
    super('Game');
  }
  create(data?: { state?: SessionSnapshot; entryOnly?: boolean }): void {
    createPlaceholderTextures(this);
    this.physics.disableUpdate();
    const seed = Number(new URLSearchParams(location.search).get('seed'));
    this.scene.launch(InputScene.KEY, { demo: true });
    const session = new DemoSession(
      this,
      new EventBus(),
      this.scene.get(InputScene.KEY) as InputScene,
      seed,
      true,
      undefined,
      data?.entryOnly ? data.state?.entry : undefined,
      data?.entryOnly ? undefined : data?.state,
      { runId: 'legacy-catalog-fixture' },
    );
    // Observe production private state; never substitute its selector or RNG.
    const inspect = session as unknown as { root: Random; templateId: string; rebuildRoom(): void };
    const slots = (session.arena as unknown as { slots: Physics.Arcade.Image[] }).slots;
    const cx = LEGACY_V1.bounds.x + LEGACY_V1.bounds.width / 2;
    const cy = LEGACY_V1.bounds.y + LEGACY_V1.bounds.height / 2;
    const rootAtCreate = inspect.root.snapshot;
    window.legacyCatalog = {
      generation: (window.legacyCatalog?.generation ?? 0) + 1,
      root: () => inspect.root.snapshot,
      rootAtCreate,
      save: () => session.save(),
      restore: (state, entryOnly) => this.scene.restart({ state, entryOnly }),
      inspectFloor: () => {
        const run = session.dungeon;
        const before = session.save();
        const manifest = selectRoomLayouts(seed, run.floor, run.map.rooms);
        const unchangedByFreeze = JSON.stringify(before) === JSON.stringify(session.save());
        const rows = run.map.rooms.map((room) => {
          run.roomId = room.id;
          inspect.rebuildRoom();
          const template = roomTemplate(manifest.templateIds[room.id]!)!;
          // Observe the ID actually passed by DemoSession to RoomArena. The spec separately
          // checks PR128's recorded selections and geometry, independent of this selector.
          const expectedId = inspect.templateId;
          const bodies = slots
            .filter((s) => s.body?.enable)
            .map((s) => ({
              x: s.body!.center.x,
              y: s.body!.center.y,
              width: s.body!.width,
              height: s.body!.height,
            }));
          const expectedBodies = template.boxes.map((b) => ({
            x: cx + b.x,
            y: cy + b.y,
            width: b.width,
            height: b.height,
          }));
          // Read the actual immutable static snapshot, without replacing setRoom or its inputs.
          const geometry = session.arena.prepareGeometry() as unknown as {
            room: { obstacles: readonly GeometryObstacle[] };
          };
          const staticObstacles = geometry.room.obstacles.map(({ id, kind, mask }) => ({ id, kind, mask }));
          const expectedObstacles = template.boxes.map((_, i) => ({
            id: `${template.obstacle}:${i}`,
            kind: template.obstacle,
            mask: template.mask,
          }));
          const traps = session.sim.save().traps.map((t) => ({
            kind: t.kind,
            x: t.x,
            y: t.y,
            width: t.width,
            height: t.height,
            radius: t.radius,
            angle: t.angle,
            delay: t.delay,
          }));
          const expectedTraps = template.traps.map((t) => ({
            kind: t.kind,
            x: cx + t.x,
            y: cy + t.y,
            width: t.width ?? 0,
            height: t.height ?? 0,
            radius: t.kind === 'barrel' || t.kind === 'mine' ? LEGACY_V1.trapRadii[t.kind] : 0,
            angle: ((t.angle ?? 0) * Math.PI) / 180,
            delay: t.delay ?? 0,
          }));
          return {
            id: room.id,
            kind: room.kind,
            templateId: template.id,
            form: template.form,
            expectedId,
            bodies,
            expectedBodies,
            staticObstacles,
            expectedObstacles,
            traps,
            expectedTraps,
            root: inspect.root.snapshot,
          };
        });
        run.roomId = run.map.start;
        inspect.rebuildRoom();
        // Verify legacy entry positions against the actual production teleport implementation.
        const entrances = LEGACY_V1.ports.map((port) => {
          session.arena.teleport(-port.direction.x, -port.direction.y);
          return {
            id: port.id,
            actual: { x: session.player!.x, y: session.player!.y },
            expected: port.entrance,
          };
        });
        session.arena.teleport();
        const center = { x: session.player!.x, y: session.player!.y };
        const checkpoint = session.checkpoint();
        return {
          rows,
          entrances,
          center,
          bounds: GRAYBOX_BOUNDS,
          checkpoint,
          root: inspect.root.snapshot,
          floor: run.floor,
          unchangedByFreeze,
        };
      },
      advance: () => {
        const run = session.dungeon;
        run.roomId = run.map.exit;
        run.phase = 'exploring';
        const id = Object.keys(UPGRADES)[0] as UpgradeId;
        session.offers.push(id);
        const advanced = session.chooseUpgrade(id);
        return {
          advanced,
          floor: run.floor,
          root: inspect.root.snapshot,
          entryFloor: session.save().entry.floor,
        };
      },
    };
  }
}
interface Api {
  generation: number;
  rootAtCreate: number;
  root(): number;
  save(): SessionSnapshot;
  restore(state: SessionSnapshot, entryOnly: boolean): void;
  inspectFloor(): {
    rows: {
      id: number;
      kind: string;
      templateId: string;
      form: string;
      expectedId: string;
      bodies: unknown[];
      expectedBodies: unknown[];
      staticObstacles: unknown[];
      expectedObstacles: unknown[];
      traps: unknown[];
      expectedTraps: unknown[];
      root: number;
    }[];
    entrances: { id: string; actual: { x: number; y: number }; expected: { x: number; y: number } }[];
    center: { x: number; y: number };
    bounds: typeof GRAYBOX_BOUNDS;
    checkpoint: SessionSnapshot['entry'];
    root: number;
    floor: number;
    unchangedByFreeze: boolean;
  };
  advance(): { advanced: boolean; floor: number; root: number; entryFloor: number };
}
declare global {
  interface Window {
    legacyCatalog: Api;
  }
}
new Game({
  type: AUTO,
  parent: 'game',
  width: 480,
  height: 270,
  physics: { default: 'arcade', arcade: { fixedStep: true } },
  input: { activePointers: 3, gamepad: true },
  scene: [CatalogScene, InputScene],
});
