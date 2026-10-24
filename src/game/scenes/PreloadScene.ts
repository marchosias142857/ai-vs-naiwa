import { configureCamera } from '../configureCamera';
import { Scene } from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../../config';
import { debugParams } from '../../debug/params';
import { preloadDemoArt, installDemoArt } from '../assets/demoArt';
import { createPlaceholderTextures } from '../assets/placeholders';

/**
 * 加载项目自制图集，命名帧共用 PNG 纹理；基础粒子保留程序纹理。
 */
export class PreloadScene extends Scene {
  constructor() {
    super(SCENES.preload);
  }

  preload(): void {
    configureCamera(this);
    const barW = 160;
    const x = (GAME_WIDTH - barW) / 2;
    const y = GAME_HEIGHT / 2;
    this.add.rectangle(GAME_WIDTH / 2, y, barW + 4, 8).setStrokeStyle(1, COLORS.wallTop);
    const bar = this.add.rectangle(x, y, 1, 4, 0x7ee8ff).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => {
      bar.width = Math.max(1, barW * p);
    });
    preloadDemoArt(this);
  }

  create(): void {
    createPlaceholderTextures(this);
    installDemoArt(this);
    const params = debugParams();
    const target = params.stress || params.scene === SCENES.game ? SCENES.game : SCENES.menu;
    this.scene.start(target);
  }
}
