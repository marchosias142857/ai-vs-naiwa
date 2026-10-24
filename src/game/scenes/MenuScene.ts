import { Scene } from 'phaser';
import { SCENES } from '../../config';
import { setTestHooks } from '../testHooks';
import { MenuPanel } from '../ui/MenuPanel';

export class MenuScene extends Scene {
  constructor() {
    super(SCENES.menu);
  }
  create(): void {
    new MenuPanel(this);
    setTestHooks({ ready: true, scene: SCENES.menu });
  }
}
