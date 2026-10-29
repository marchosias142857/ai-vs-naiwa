import { AUTO, Game, GameObjects, Scene, type Textures } from 'phaser';
import { MAP_ART } from '../../src/data/mapArt';
import { MODULAR_V2 } from '../../src/data/roomTemplates/modularV2';
import { createPlaceholderTextures } from '../../src/game/assets/placeholders';
import { installDemoArt, preloadDemoArt } from '../../src/game/assets/demoArt';
import { ActorArt } from '../../src/game/entities/ActorArt';
import { TrapLayer } from '../../src/game/fx/TrapLayer';
import { CombatBridge } from '../../src/game/world/CombatBridge';
import { ModularRoomArt } from '../../src/game/world/ModularRoomArt';
import { RoomArena } from '../../src/game/world/RoomArena';
import { createCombatWorld } from '../../src/sim/combat/api';
import { EventBus } from '../../src/sim/core/EventBus';
import type { GameEvents } from '../../src/sim/core/events';
import { createInputFrame } from '../../src/sim/core/types';

class LayerScene extends Scene {
  constructor() {
    super('Layers');
  }
  preload() {
    preloadDemoArt(this);
  }
  create() {
    createPlaceholderTextures(this);
    installDemoArt(this);
    this.physics.disableUpdate();
    this.cameras.main.setZoom(3).centerOn(240, 135);
    const sim = createCombatWorld({ seed: 42, bus: new EventBus<GameEvents>() });
    const ids = [
      sim.spawnPlayer('ai_proto', 192, 125),
      sim.spawnEnemy('naiwa_chaser', 240, 125),
      sim.spawnEnemy('naiwa_boss', 288, 125),
    ];
    for (let i = 0; i < 30; i++) sim.step(0.05, createInputFrame());
    const bridge = new CombatBridge(this, sim);
    const arena = new RoomArena(this, bridge, false, true);
    arena.setLayout(1);
    const actors = new ActorArt(this, sim, bridge.actors);
    const traps = new TrapLayer(this, sim, bridge, arena);
    const art = new ModularRoomArt(this);
    const boxes = [-48, 0, 48].map((x) => ({ x, y: 0, width: 16, height: 16 }));
    let room = 0;
    window.mapLayerProbe = (theme, y) => {
      art.show(theme, boxes);
      arena.setLayout(1 + (++room % 2));
      ids.forEach((id, i) => sim.syncPosition(id, 192 + i * 48, y));
      sim.setTraps(room, [
        { kind: 'barrel', x: 240, y: y + 8, width: 0, height: 0, radius: 7, angle: 0, delay: 0 },
      ]);
      bridge.actors.apply();
      traps.update();
      this.events.emit('postupdate');
      this.children.depthSort();
      const visuals = actors.slots.filter((s) => s.image.visible).map((s) => s.image);
      const obstacles = this.children.list.filter(
        (o): o is GameObjects.Image | GameObjects.Sprite | GameObjects.TileSprite =>
          (o instanceof GameObjects.Image ||
            o instanceof GameObjects.Sprite ||
            o instanceof GameObjects.TileSprite) &&
          o.visible &&
          (o.texture.key === MAP_ART.textures.blocks ||
            o.frame.name === 'barrel' ||
            o.texture.key === 'ph_wall'),
      );
      const order = this.children.list;
      return {
        actors: visuals.length,
        blocks: obstacles.filter((o) => o.texture.key === MAP_ART.textures.blocks).length,
        barrels: obstacles.filter((o) => o.frame.name === 'barrel').length,
        fallback: obstacles.filter((o) => o.texture.key === 'ph_wall').length,
        hiddenActors: visuals.filter((a) => obstacles.some((o) => order.indexOf(o) >= order.indexOf(a)))
          .length,
        hiddenWeapon: obstacles.some((o) => order.indexOf(o) >= order.indexOf(actors.weapon)),
      };
    };
    window.floorPatternProbe = (theme) => {
      art.show(theme, []);
      const texture = this.textures.get('modular-ground:Layers') as Textures.CanvasTexture;
      const B = MODULAR_V2.bounds,
        d = MAP_ART.density,
        n = MAP_ART.floorTile * d;
      const actual = texture.context.getImageData(
        (128 - B.x + MAP_ART.canvasPadding) * d,
        (96 - B.y + MAP_ART.canvasPadding) * d,
        n * 2,
        n * 2,
      ).data;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = n;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const f = MAP_ART.frames[`${theme}_ground`];
      ctx.drawImage(
        this.textures.get(MAP_ART.textures.ground).getSourceImage() as HTMLImageElement,
        f[0],
        f[1],
        f[2],
        f[3],
        0,
        0,
        n,
        n,
      );
      const source = ctx.getImageData(0, 0, n, n).data;
      let differences = 0;
      for (let y = 0; y < n * 2; y++)
        for (let x = 0; x < n * 2; x++)
          for (let c = 0; c < 4; c++)
            if (actual[(y * n * 2 + x) * 4 + c] !== source[((y % n) * n + (x % n)) * 4 + c]) differences++;
      const jump = (axis: 'x' | 'y', edge: number) => {
        let sum = 0;
        for (let i = 0; i < n; i++)
          for (let c = 0; c < 3; c++) {
            const a = axis === 'x' ? i * n + edge : edge * n + i;
            const b = axis === 'x' ? i * n + ((edge + 1) % n) : ((edge + 1) % n) * n + i;
            sum += Math.abs(source[a * 4 + c]! - source[b * 4 + c]!);
          }
        return sum / (n * 3);
      };
      // Natural pixel texture need not duplicate opposing pixels. Its boundary must not
      // introduce a stronger line than the material's ordinary internal transitions.
      return {
        differences,
        axes: (['x', 'y'] as const).map((axis) => ({
          seam: jump(axis, n - 1),
          internalMax: Math.max(...Array.from({ length: n - 1 }, (_, i) => jump(axis, i))),
        })),
      };
    };
  }
}
new Game({
  type: AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#000000',
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
  scene: LayerScene,
});
declare global {
  interface Window {
    mapLayerProbe: (
      theme: 'temple' | 'wreck' | 'abyss' | 'milk',
      y: number,
    ) => {
      actors: number;
      blocks: number;
      barrels: number;
      fallback: number;
      hiddenActors: number;
      hiddenWeapon: boolean;
    };
    floorPatternProbe: (theme: 'temple' | 'wreck' | 'abyss' | 'milk') => {
      differences: number;
      axes: { seam: number; internalMax: number }[];
    };
  }
}
