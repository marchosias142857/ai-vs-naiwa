import { t } from '../../i18n/t';
import '../ui/imageUi.css';
import { prepareRunVersion } from '../save/runStorage';
import { configureCamera } from '../configureCamera';
import { Scene } from 'phaser';
import { SCENES } from '../../config';
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
    const panel = document.createElement('div'),
      progress = document.createElement('progress');
    panel.id = 'loading-panel';
    panel.textContent = t('ui.loading');
    progress.max = 1;
    progress.value = 0;
    progress.setAttribute('aria-label', t('ui.loading'));
    panel.append(progress);
    document.body.append(panel);
    this.load.on('progress', (p: number) => {
      progress.value = p;
    });
    this.events.once('shutdown', () => panel.remove());
    preloadDemoArt(this);
  }

  create(): void {
    createPlaceholderTextures(this);
    installDemoArt(this);
    const params = debugParams();
    const updated = prepareRunVersion();
    const target = !updated && (params.stress || params.scene === SCENES.game) ? SCENES.game : SCENES.menu;
    this.scene.start(target);
  }
}
