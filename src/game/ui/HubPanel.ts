import type { Scene } from 'phaser';
import { TalentPanel } from './TalentPanel';
import { readProfile, takeProfileNotice } from '../save/metaProfile';
import { SCENES } from '../../config';
import { t } from '../../i18n/t';
import { readSavedRun } from '../save/runStorage';
import type { PauseState } from '../world/PauseState';
import { guardGameUi } from './guardGameUi';
import { MenuNavigation } from './MenuNavigation';
import './demo.css';

/** 门口确认暂停移动；取消后清空输入，必须重新按下才能交互。 */
export class HubPanel {
  private readonly root = document.createElement('div');
  private readonly door = document.createElement('button');
  private readonly altar = document.createElement('button');
  private readonly talents: TalentPanel;
  private readonly modal = document.createElement('section');
  private readonly abort = new AbortController();
  private readonly navigation: MenuNavigation;
  constructor(
    private readonly scene: Scene,
    ui: Scene,
    private readonly pause: PauseState,
    private readonly near: () => boolean,
    private readonly nearAltar: () => boolean,
  ) {
    readProfile();
    this.root.id = 'hub-panel';
    const title = document.createElement('h2'),
      hint = document.createElement('p');
    title.textContent = t('hub.title');
    hint.textContent = t('hub.hint');
    this.altar.id = 'hub-altar';
    this.altar.textContent = t('talent.interact');
    this.altar.addEventListener('click', () => this.open(), { signal: this.abort.signal });
    this.door.id = 'hub-door';
    this.door.textContent = t('hub.interact');
    this.modal.id = 'hub-confirm';
    this.modal.className = 'demo-dialog';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    const question = document.createElement('h2'),
      detail = document.createElement('p');
    question.id = 'hub-question';
    question.textContent = t('hub.question');
    this.modal.setAttribute('aria-labelledby', question.id);
    detail.textContent = t(readSavedRun().kind === 'none' ? 'hub.newRun' : 'hub.replaceSave');
    const cancel = document.createElement('button'),
      enter = document.createElement('button');
    cancel.id = 'cancel-dungeon';
    enter.id = 'enter-dungeon';
    cancel.textContent = t('hub.cancel');
    enter.textContent = t('hub.enter');
    this.door.addEventListener('click', () => this.open(), { signal: this.abort.signal });
    const close = () => {
      this.modal.hidden = true;
      this.talents.root.hidden = true;
      this.pause.set('interaction', false);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    };
    this.talents = new TalentPanel(pause, ui, this.abort.signal, close);
    cancel.addEventListener('click', close, { signal: this.abort.signal });
    enter.addEventListener(
      'click',
      () => {
        if (!this.modal.hidden && !this.pause.has('manual')) scene.scene.start(SCENES.game, {});
      },
      { signal: this.abort.signal },
    );
    window.addEventListener(
      'keydown',
      (e) => {
        if (!scene.game.input.enabled || this.modal.hidden || this.pause.has('manual')) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          close();
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          (document.activeElement === cancel ? enter : cancel).focus();
        }
      },
      { signal: this.abort.signal, capture: true },
    );
    this.modal.append(question, detail, cancel, enter);
    this.modal.hidden = true;
    const notice = takeProfileNotice();
    if (notice) {
      const status = document.createElement('p');
      status.id = 'profile-notice';
      status.setAttribute('role', 'status');
      status.textContent = t(`talent.notice.${notice}`);
      this.root.append(status);
    }
    this.root.append(title, hint, this.door, this.altar, this.modal, this.talents.root);
    guardGameUi(this.root, scene, this.abort.signal);
    document.body.append(this.root);
    this.navigation = new MenuNavigation(this.modal, ui);
    this.layout();
    scene.scale.on('resize', this.layout);
    window.addEventListener('resize', this.layout, { signal: this.abort.signal });
  }
  open(): void {
    if ((!this.near() && !this.nearAltar()) || this.pause.blocked) return;
    this.pause.set('interaction', true);
    if (this.nearAltar()) {
      this.talents.open();
      return;
    }
    this.modal.hidden = false;
    this.navigation.update(false);
    this.modal.querySelector('button')!.focus();
  }
  update(): void {
    this.talents.update();
    this.altar.hidden = !this.nearAltar() || this.pause.blocked;
    this.door.hidden = !this.near() || this.pause.blocked;
    this.modal.style.visibility = this.pause.has('manual') ? 'hidden' : '';
    this.navigation.update(!this.modal.hidden && !this.pause.has('manual'));
  }
  private readonly layout = (): void => {
    const r = this.scene.game.canvas.getBoundingClientRect();
    Object.assign(this.root.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  };
  destroy(): void {
    this.abort.abort();
    this.scene.scale.off('resize', this.layout);
    this.root.remove();
  }
}
