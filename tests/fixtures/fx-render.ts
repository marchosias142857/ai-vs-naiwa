import { Game, Scene, WEBGL, type GameObjects } from 'phaser';
import { impactTexture } from '../../src/game/fx/impactTexture';

interface Sample {
  mode: 'arc' | 'image';
  frames: number;
  calls: number;
  indices: number;
  averageRenderMs: number;
  arcTriangles: number;
}
declare global {
  interface Window {
    fxRenderResult?: { canvas: number[]; samples: Sample[] };
  }
}

/** 同一画布/位置/尺寸/数量，ABAB 四轮；计绘制提交耗时，不把它称为 FPS。 */
class FxRender extends Scene {
  create(): void {
    this.cameras.main.setZoom(4).setOrigin(0, 0);
    const texture = impactTexture(this),
      old: GameObjects.Arc[] = [],
      next: GameObjects.Image[] = [],
      samples: Sample[] = [];
    for (let i = 0; i < 100; i++) {
      const x = 40 + (i % 10) * 40,
        y = 40 + Math.floor(i / 10) * 20;
      old.push(this.add.circle(x, y, 2, 0xffffff));
      next.push(this.add.image(x, y, texture).setDisplaySize(4, 4).setVisible(false));
    }
    const renderer = this.game.renderer;
    if (!('drawElements' in renderer)) throw new Error('WebGL required');
    const draw = renderer.drawElements;
    let calls = 0,
      indices = 0,
      frames = 0,
      mode = 0,
      start = 0,
      renderMs = 0;
    renderer.drawElements = function (a, b, c, d, e, f, g) {
      calls++;
      indices += e;
      draw.call(this, a, b, c, d, e, f, g);
    };
    const before = () => {
      calls = indices = 0;
      start = performance.now();
    };
    const after = () => {
      frames++;
      renderMs += performance.now() - start;
      if (frames < 120) return;
      samples.push({
        mode: mode % 2 ? 'image' : 'arc',
        frames,
        calls,
        indices,
        averageRenderMs: renderMs / frames,
        arcTriangles: old[0]!.pathIndexes.length / 3,
      });
      mode++;
      frames = renderMs = 0;
      if (mode === 4) {
        renderer.drawElements = draw;
        this.game.events.off('prerender', before);
        this.game.events.off('postrender', after);
        window.fxRenderResult = { canvas: [this.game.canvas.width, this.game.canvas.height], samples };
        return;
      }
      for (const o of old) o.setVisible(mode % 2 === 0);
      for (const o of next) o.setVisible(mode % 2 === 1);
    };
    this.game.events.on('prerender', before);
    this.game.events.on('postrender', after);
  }
}
new Game({ type: WEBGL, width: 1920, height: 1080, scene: FxRender });
