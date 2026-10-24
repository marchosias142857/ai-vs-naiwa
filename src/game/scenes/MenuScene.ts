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
    this.panel = new MenuPanel(this);
    setTestHooks({ ready: true, scene: SCENES.menu });
  }
  override update(): void {
    this.panel?.update();
  }
}
