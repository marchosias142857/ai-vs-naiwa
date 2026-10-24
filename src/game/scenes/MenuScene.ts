import { ART } from '../assets/demoArt';
import { GAME_WIDTH, GAME_HEIGHT } from '../../config';
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
    if (this.textures.exists(ART.title))
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, ART.title).setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.panel = new MenuPanel(this);
    setTestHooks({ ready: true, scene: SCENES.menu });
  }
  override update(): void {
    this.panel?.update();
  }
}
