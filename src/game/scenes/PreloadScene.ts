import { Scene } from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../../config';
import { debugParams } from '../../debug/params';
import { createPlaceholderTextures } from '../assets/placeholders';

/**
 * 资源加载场景。M5 起在 preload() 中加载 public/assets/atlases 下的图集；
 * 现在只生成占位纹理。
 */
export class PreloadScene extends Scene {
  constructor() {
    super(SCENES.preload);
  }

  preload(): void {
    const barW = 160;
    const x = (GAME_WIDTH - barW) / 2;
    const y = GAME_HEIGHT / 2;
    this.add.rectangle(GAME_WIDTH / 2, y, barW + 4, 8).setStrokeStyle(1, COLORS.wallTop);
    const bar = this.add.rectangle(x, y, 1, 4, 0x7ee8ff).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => {
      bar.width = Math.max(1, barW * p);
    });
    // this.load.atlas(...) —— M5 资源管线接入后在这里加载。
  }

  create(): void {
    createPlaceholderTextures(this);
    const params = debugParams();
    const target = params.stress || params.scene === SCENES.game ? SCENES.game : SCENES.menu;
    this.scene.start(target);
  }
}
