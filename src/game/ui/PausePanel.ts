import { guardGameUi } from './guardGameUi';
import { t } from '../../i18n/t';
import type { Scene } from 'phaser';
import { MenuNavigation } from './MenuNavigation';
/** 临时暂停菜单：入口检查点已存盘；退出不丢失本层之前的进度。 */
export class PausePanel {
  private readonly root = document.createElement('div');
  private readonly abort = new AbortController();
  private readonly navigation: MenuNavigation;
  constructor(ui: Scene, battle: Scene, resume: () => void) {
    this.root.id = 'demo-pause';
    this.root.className = 'demo-dialog';
    const continueButton = document.createElement('button');
    continueButton.textContent = t('pause.resume');
    const exit = document.createElement('button');
    exit.id = 'pause-menu';
    exit.textContent = t('pause.exit');
    continueButton.addEventListener('click', resume, { signal: this.abort.signal });
    exit.addEventListener('click', () => battle.scene.start('Menu'), { signal: this.abort.signal });
    this.root.append(continueButton, exit);
    this.root.hidden = true;
    guardGameUi(this.root, ui, this.abort.signal);
    document.body.append(this.root);
    this.navigation = new MenuNavigation(this.root, ui);
  }
  update(paused: boolean): void {
    this.root.hidden = !paused;
    this.navigation.update(paused);
  }
  destroy(): void {
    this.abort.abort();
    this.root.remove();
  }
}
