import { AUTO, Game, Scene, Scale, type GameObjects, type Physics } from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE } from '../../src/config';
import { DESIGNED_V3 } from '../../src/data/roomTemplates/designedV3';
import { MAP_ART } from '../../src/data/mapArt';
import { compileRoom } from '../../src/sim/dungeon/compileRoom';
import { roomTemplate, selectRoomLayouts } from '../../src/sim/dungeon/roomCatalog';
import { RoomGeometry } from '../../src/sim/geometry/RoomGeometry';
import { createInputFrame } from '../../src/sim/core/types';
import { EventBus } from '../../src/sim/core/EventBus';
import { createPlaceholderTextures } from '../../src/game/assets/placeholders';
import { preloadDemoArt, installDemoArt } from '../../src/game/assets/demoArt';
import { DemoSession } from '../../src/game/systems/DemoSession';
import { DemoObjects } from '../../src/game/world/DemoObjects';
import { InputScene } from '../../src/game/ui/InputScene';
import type { SessionSnapshot } from '../../src/game/save/RunSnapshot';

class CatalogScene extends Scene {
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
    const session = new DemoSession(
      this,
      new EventBus(),
      this.scene.get(InputScene.KEY) as InputScene,
      42,
      true,
      undefined,
      undefined,
      data?.restored,
      { runId: 'designed-catalog-fixture' },
    );
    const { arena, sim, bridge, dungeon } = session,
      objects = new DemoObjects(this, session);
    const generation = (window.designedCatalog?.generation ?? 0) + 1;
    const inspector = session as unknown as {
      templateId: string;
      rebuildRoom(): void;
      root: { snapshot: number };
    };
    const staticBodies = (arena as unknown as { slots: Physics.Arcade.Image[] }).slots;
    const input = createInputFrame();
    const pin = (x: number, y: number) => {
      const image = bridge.actors.slots.find((s) => s.id === sim.playerId)!.image,
        body = image.body as Physics.Arcade.Body;
      body.reset(x, y);
      body.updateFromGameObject();
      body.prev.copy(body.position);
      body.prevFrame.copy(body.position);
      sim.syncPosition(sim.playerId!, x, y);
    };
    const show = (id: string) => {
      const t = roomTemplate(id)!;
      if (t.form === 'hub') throw Error('hub is separate');
      // Only fixture setup chooses an explicit template/role. Art, physics and traps are production.
      Object.defineProperty(dungeon, 'style', { value: t.theme, configurable: true });
      dungeon.room.kind = t.form;
      sim.setTraps(-1, []);
      arena.show(dungeon, id);
      arena.teleport();
      objects.update();
      for (const trap of sim.traps)
        if (trap.active && trap.kind === 'spikes') Object.assign(trap, { state: 'on' });
      session.update();
      const c = compileRoom(t),
        camera = this.cameras.main;
      camera
        .setZoom(Math.min(camera.width / (c.bounds.width + 40), camera.height / (c.bounds.height + 60)))
        .centerOn(240, 135);
      const sprites = this.children.list.filter(
        (o) => o.type === 'TileSprite' && (o as GameObjects.TileSprite).visible,
      ) as GameObjects.TileSprite[];
      const blocks = sprites.filter((o) => o.texture.key === MAP_ART.textures.blocks),
        fields = sprites.filter((o) => o.texture.key === MAP_ART.textures.spikes);
      return {
        id,
        theme: arena.artTheme,
        bounds: c.bounds,
        wallCells: c.wallCells.length,
        cutBodies: c.cuts.length,
        blocks: blocks.map((o, i) => ({
          width: o.displayWidth,
          height: o.displayHeight,
          bodyWidth: staticBodies[i]!.body!.width,
          bodyHeight: staticBodies[i]!.body!.height,
          scaleX: o.tileScaleX,
          scaleY: o.tileScaleY,
          wholeX: o.width / (o.frame.width * o.tileScaleX),
          wholeY: o.height / (o.frame.height * o.tileScaleY),
        })),
        spikes: fields.map((o) => ({
          frame: String(o.frame.name),
          width: o.width,
          height: o.height,
          scaleX: o.tileScaleX,
          scaleY: o.tileScaleY,
        })),
        portalText: this.children.list.filter(
          (o) =>
            o.type === 'Text' &&
            (o as GameObjects.Text).visible &&
            (o as GameObjects.Text).text.includes('下一层'),
        ).length,
        childCount: this.children.length,
        textureCount: this.textures.getTextureKeys().length,
      };
    };
    window.designedCatalog = {
      generation,
      ids: DESIGNED_V3.filter((t) => t.form !== 'hub').map((t) => t.id),
      show,
      manifest: () => selectRoomLayouts(42, dungeon.floor, dungeon.map.rooms, dungeon.style),
      selected: () => inspector.templateId,
      root: () => inspector.root.snapshot,
      visit: (id) => {
        dungeon.roomId = id;
        inspector.rebuildRoom();
        objects.update();
        return inspector.templateId;
      },
      save: () => session.save(),
      restore: (state) => this.scene.restart({ restored: state }),
      probe: (id) => {
        show(id);
        const c = compileRoom(roomTemplate(id)!),
          q = new RoomGeometry(c.boundary, c.obstacles, 0);
        // A notch may contain the north gate. Probe its shoulder so a correct door
        // transition cannot replace the room halfway through the wall assertion.
        const cut = c.cuts
          .flatMap((b) => [b.x, b.x - b.width / 2 + 8, b.x + b.width / 2 - 8].map((x) => ({ ...b, x })))
          .find(
            (b) =>
              Math.abs(b.x - 240) > 32 &&
              q.canOccupy(
                { x: b.x, y: b.y + (b.y < 135 ? b.height / 2 + 20 : -b.height / 2 - 20) },
                6,
                'walk',
              ),
          );
        if (!cut) throw Error('no diagonal/step test edge');
        const from = { x: cut.x, y: cut.y + (cut.y < 135 ? cut.height / 2 + 20 : -cut.height / 2 - 20) };
        const beforeLOS = !arena.lineOfSight(from.x, from.y, cut.x, cut.y);
        pin(from.x, from.y);
        input.move.y = cut.y < 135 ? -1 : 1;
        for (let i = 0; i < 60; i++) {
          session.setInput(input);
          this.physics.world.update((i * 1000) / 60, 1000 / 60);
          this.physics.world.postUpdate();
          session.update();
        }
        input.move.y = 0;
        const p = session.player!;
        return {
          moved: Math.hypot(p.x - from.x, p.y - from.y),
          legal: q.canOccupy(p, 6, 'walk'),
          blockedLOS: !arena.lineOfSight(from.x, from.y, cut.x, cut.y),
          x: p.x,
          y: p.y,
          beforeLOS,
          cut,
          roomId: dungeon.roomId,
        };
      },
    };
    objects.update();
  }
}
declare global {
  interface Window {
    designedCatalog: {
      generation: number;
      ids: string[];
      show: (id: string) => {
        id: string;
        theme: string;
        bounds: { x: number; y: number; width: number; height: number };
        wallCells: number;
        cutBodies: number;
        blocks: {
          width: number;
          height: number;
          bodyWidth: number;
          bodyHeight: number;
          scaleX: number;
          scaleY: number;
          wholeX: number;
          wholeY: number;
        }[];
        spikes: { frame: string; width: number; height: number; scaleX: number; scaleY: number }[];
        portalText: number;
        childCount: number;
        textureCount: number;
      };
      manifest: () => ReturnType<typeof selectRoomLayouts>;
      selected: () => string;
      root: () => number;
      visit: (id: number) => string;
      save: () => SessionSnapshot;
      restore: (state: SessionSnapshot) => void;
      probe: (id: string) => { moved: number; legal: boolean; blockedLOS: boolean; x: number; y: number };
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
  scene: [CatalogScene, InputScene],
});
