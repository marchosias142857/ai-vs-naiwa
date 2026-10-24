import { guardGameUi } from './guardGameUi';
import { t } from '../../i18n/t';
import type { Scene } from 'phaser';
import { MenuNavigation } from './MenuNavigation';
import { SAVE_REQUEST } from '../world/combatPause';
/** 临时暂停菜单；退出时先请求同步保存，再切换场景。 */
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
    exit.addEventListener(
      'click',
      () => {
        battle.game.events.emit(SAVE_REQUEST);
        battle.scene.start('Menu');
      },
      { signal: this.abort.signal },
    );
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
