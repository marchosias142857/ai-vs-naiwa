import { guardGameUi } from './guardGameUi';
import { settings } from '../../services/settings';
import { t } from '../../i18n/t';
import { addSettings } from './SettingsControls';
import { MenuNavigation } from './MenuNavigation';
import type { Scene } from 'phaser';
import { readProfile } from '../../services/profile';
import { readSavedRun } from '../save/runStorage';
import './demo.css';

/** 标题菜单；键盘/手柄导航与存档确认继续共用同一组控件。 */
export class MenuPanel {
  private readonly root = document.createElement('section');
  private readonly navigation: MenuNavigation;
  private readonly abort = new AbortController();
  constructor(scene: Scene, readSave = readSavedRun) {
    const saved = readSave(),
      profile = readProfile();
    const checkpoint =
      saved.kind === 'entry' ? saved.checkpoint : saved.kind === 'full' ? saved.snapshot.entry : null;
    const resumeData = () =>
      saved.kind === 'full' ? { snapshot: saved.snapshot } : checkpoint ? { checkpoint } : {};
    this.root.id = 'demo-menu-panel';
    this.root.className = 'demo-dialog';
    const brand = document.createElement('span');
    brand.className = 'menu-brand';
    brand.textContent = 'DA FEI YU · TIDAL RUINS';
    const title = document.createElement('h2');
    title.textContent = t('app.title');
    const subtitle = document.createElement('p');
    subtitle.textContent = t('menu.subtitle');
    const start = document.createElement('button');
    start.id = 'start-run';
    start.textContent = t('menu.new');
    const resume = document.createElement('button');
    resume.id = 'continue-run';
    resume.textContent = checkpoint
      ? t(saved.kind === 'entry' ? 'menu.continueEntry' : 'menu.continue', { floor: checkpoint.floor })
      : t('menu.noSave');
    resume.disabled = !checkpoint;
    const help = document.createElement('p');
    help.className = 'menu-help';
    help.textContent = t('menu.help');
    const controls = document.createElement('p');
    controls.className = 'menu-controls';
    controls.textContent = t('menu.controls');
    const instructions = document.createElement('details'),
      summary = document.createElement('summary');
    summary.textContent = t('menu.instructions');
    instructions.append(summary, controls);
    const stats = document.createElement('p');
    stats.className = 'menu-stats';
    stats.textContent = t('menu.stats', { runs: profile.runs, wins: profile.wins, kills: profile.kills });
    const note = document.createElement('small');
    note.textContent = t('menu.note');
    const saveNotice = document.createElement('p');
    saveNotice.id = 'save-notice';
    if (saved.kind !== 'full' && saved.notice) saveNotice.textContent = t(`save.${saved.notice}`);
    saveNotice.hidden = !saveNotice.textContent;
    const question = document.createElement('p'),
      cancel = document.createElement('button'),
      confirm = document.createElement('button');
    question.textContent = t('menu.replaceSave');
    cancel.id = 'cancel-new-run';
    confirm.id = 'confirm-new-run';
    cancel.textContent = t('menu.cancel');
    confirm.textContent = t('menu.confirmNew');
    question.hidden = cancel.hidden = confirm.hidden = true;
    let confirming = false;
    const showConfirmation = (value: boolean) => {
      confirming = value;
      question.hidden = !value;
      for (const button of this.root.querySelectorAll('button'))
        button.hidden = button === confirm || button === cancel ? !value : value;
      this.navigation.update(false);
      (value ? cancel : start).focus();
    };
    start.addEventListener(
      'click',
      () => {
        if (checkpoint) showConfirmation(true);
        else scene.scene.start('Game', {});
      },
      { signal: this.abort.signal },
    );
    cancel.addEventListener('click', () => showConfirmation(false), { signal: this.abort.signal });
    confirm.addEventListener(
      'click',
      () => {
        if (confirming) scene.scene.start('Game', {});
      },
      { signal: this.abort.signal },
    );
    resume.addEventListener(
      'click',
      () => {
        if (checkpoint) scene.scene.start('Game', resumeData());
      },
      { signal: this.abort.signal },
    );
    this.root.append(
      brand,
      title,
      subtitle,
      start,
      resume,
      saveNotice,
      question,
      cancel,
      confirm,
      help,
      instructions,
      stats,
      note,
    );
    const settingsRow = document.createElement('div');
    settingsRow.className = 'menu-settings';
    addSettings(settingsRow, this.abort.signal, () => scene.scene.restart());
    this.root.append(settingsRow);
    document.documentElement.lang = settings.language;
    guardGameUi(this.root, scene, this.abort.signal);
    document.body.append(this.root);
    this.navigation = new MenuNavigation(this.root, scene);
    window.addEventListener(
      'keydown',
      (e) => {
        if (!scene.game.input.enabled) return;
        if (e.repeat) {
          if (e.key === 'Enter') e.preventDefault();
          return;
        }
        if (confirming && e.key === 'Escape') showConfirmation(false);
        if (confirming || e.target instanceof HTMLButtonElement) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          scene.scene.start('Game', resumeData());
        }
      },
      { signal: this.abort.signal },
    );
    scene.events.once('shutdown', () => {
      this.abort.abort();
      this.root.remove();
    });
  }
  update(): void {
    this.navigation.update(true);
  }
}
