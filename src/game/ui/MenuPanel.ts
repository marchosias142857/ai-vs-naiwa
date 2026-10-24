import { guardGameUi } from './guardGameUi';
import { settings } from '../../services/settings';
import { t } from '../../i18n/t';
import { addSettings } from './SettingsControls';
import { MenuNavigation } from './MenuNavigation';
import type { Scene } from 'phaser';
import { SCENES } from '../../config';
import { readSavedRun } from '../save/runStorage';
import './demo.css';

/** 主城入口与续玩分开；去主城不读入、清除或覆盖冒险存档。 */
export class MenuPanel {
  private readonly root = document.createElement('section');
  private readonly navigation: MenuNavigation;
  private readonly abort = new AbortController();
  constructor(
    private readonly scene: Scene,
    readSave = readSavedRun,
  ) {
    const saved = readSave();
    const checkpoint =
      saved.kind === 'entry' ? saved.checkpoint : saved.kind === 'full' ? saved.snapshot.entry : null;
    this.root.id = 'demo-menu-panel';
    this.root.className = 'demo-dialog';
    const title = document.createElement('h2');
    title.textContent = t('app.title');
    const actions = document.createElement('div');
    const start = document.createElement('button');
    start.id = 'start-run';
    start.textContent = t('menu.town');
    const resume = document.createElement('button');
    resume.id = 'continue-run';
    resume.textContent = t('menu.resume');
    resume.disabled = !checkpoint;
    const status = document.createElement('p');
    status.className = 'menu-save-status';
    status.textContent = checkpoint ? t('menu.savedFloor', { floor: checkpoint.floor }) : t('menu.noSave');
    const saveNotice = document.createElement('p');
    saveNotice.id = 'save-notice';
    if (saved.kind !== 'full' && saved.notice) saveNotice.textContent = t(`save.${saved.notice}`);
    saveNotice.hidden = !saveNotice.textContent;
    start.addEventListener('click', () => scene.scene.start(SCENES.hub), { signal: this.abort.signal });
    resume.addEventListener(
      'click',
      () => {
        if (checkpoint)
          scene.scene.start(
            SCENES.game,
            saved.kind === 'full' ? { snapshot: saved.snapshot } : { checkpoint },
          );
      },
      { signal: this.abort.signal },
    );
    const options = document.createElement('details'),
      summary = document.createElement('summary');
    summary.textContent = t('menu.options');
    const settingsRow = document.createElement('div');
    settingsRow.className = 'menu-settings';
    addSettings(settingsRow, this.abort.signal, () => scene.scene.restart());
    options.append(summary, settingsRow);
    actions.append(start, resume, status, saveNotice, options);
    this.root.append(title, actions);
    document.documentElement.lang = settings.language;
    guardGameUi(this.root, scene, this.abort.signal);
    document.body.append(this.root);
    this.layout();
    scene.scale.on('resize', this.layout);
    window.addEventListener('resize', this.layout, { signal: this.abort.signal });
    this.navigation = new MenuNavigation(this.root, scene);
    window.addEventListener(
      'keydown',
      (e) => {
        if (
          !scene.game.input.enabled ||
          e.target instanceof HTMLButtonElement ||
          (e.target instanceof HTMLElement && e.target.closest('summary'))
        )
          return;
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (!e.repeat) (checkpoint ? resume : start).click();
      },
      { signal: this.abort.signal },
    );
    scene.events.once('shutdown', () => {
      this.abort.abort();
      scene.scale.off('resize', this.layout);
      this.root.remove();
    });
  }
  private readonly layout = (): void => {
    const r = this.scene.game.canvas.getBoundingClientRect();
    Object.assign(this.root.style, {
      left: `${r.left + r.width * 0.045}px`,
      top: `${r.top + r.height * 0.08}px`,
      width: `${r.width * 0.365}px`,
      height: `${r.height * 0.84}px`,
    });
  };
  update(): void {
    this.navigation.update(true);
  }
}
