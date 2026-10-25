import { configureCamera } from '../configureCamera';
import { ART } from '../assets/demoArt';
import { GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE } from '../../config';
import { Scene } from 'phaser';
import { SCENES } from '../../config';
import { setTestHooks } from '../testHooks';
import { MenuPanel } from '../ui/MenuPanel';

export class MenuScene extends Scene {
  private panel?: MenuPanel;
  constructor() {
    super(SCENES.menu);
  }
  create(): void {
    this.scale.setGameSize(GAME_WIDTH * RENDER_SCALE, GAME_HEIGHT * RENDER_SCALE);
    configureCamera(this);
    if (this.textures.exists(ART.title))
      this.add
        .image(GAME_WIDTH - GAME_HEIGHT / 2, GAME_HEIGHT / 2, ART.title)
        .setDisplaySize(GAME_HEIGHT, GAME_HEIGHT);
    this.panel = new MenuPanel(this);
    setTestHooks({ ready: true, scene: SCENES.menu });
  }
  override update(): void {
    this.panel?.update();
  }
}
