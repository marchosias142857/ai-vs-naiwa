import type { Scene } from 'phaser';
import { DUNGEON } from '../../data/dungeon';
import { bestiaryCards } from '../../sim/meta/bestiary';
import { t, type TextKey } from '../../i18n/t';
import type { PauseState } from '../world/PauseState';
import { BESTIARY_UI } from '../fx/params';
import { bestiaryPortrait } from './bestiaryPortrait';
import { BestiaryNavigation } from './BestiaryNavigation';
import './bestiary.css';

let selectedId: string | undefined;
/** 首次打开才构建；开关复用卡片、预览与监听，跨场景只保留 ID 和裁剪坐标。 */
export class BestiaryPanel {
  readonly root = document.createElement('section');
  private readonly cards = bestiaryCards();
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly detail = document.createElement('article');
  private readonly navigation: BestiaryNavigation;
  private index = 0;
  constructor(
    scene: Scene,
    ui: Scene,
    private readonly pause: PauseState,
    signal: AbortSignal,
    close: () => void,
  ) {
    this.root.id = 'bestiary-panel';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'bestiary-title');
    const header = document.createElement('header'),
      title = document.createElement('h2'),
      count = document.createElement('span'),
      back = document.createElement('button'),
      body = document.createElement('div'),
      grid = document.createElement('div');
    title.id = 'bestiary-title';
    title.textContent = t('bestiary.title');
    count.textContent = t('bestiary.count', { count: this.cards.length });
    back.id = 'bestiary-close';
    back.textContent = t('bestiary.back');
    back.addEventListener('click', close, { signal });
    header.append(title, count, back);
    grid.id = 'bestiary-grid';
    grid.setAttribute('aria-label', t('bestiary.title'));
    this.detail.id = 'bestiary-detail';
    body.className = 'bestiary-body';
    body.append(grid, this.detail);
    this.root.append(header, body);
    const portraits = this.cards.map((card) => bestiaryPortrait(scene, card));
    let pointer: { id: number; x: number; y: number } | undefined,
      dragged = false;
    grid.addEventListener(
      'pointerdown',
      (e) => {
        pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
        dragged = false;
      },
      { signal, capture: true },
    );
    grid.addEventListener(
      'pointermove',
      (e) => {
        if (
          pointer?.id === e.pointerId &&
          Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > BESTIARY_UI.dragPixels
        )
          dragged = true;
      },
      { signal },
    );
    grid.addEventListener(
      'pointercancel',
      () => {
        dragged = true;
        pointer = undefined;
      },
      { signal },
    );
    grid.addEventListener(
      'pointerup',
      () => {
        pointer = undefined;
      },
      { signal },
    );
    for (const [i, card] of this.cards.entries()) {
      const button = document.createElement('button'),
        number = document.createElement('span');
      button.dataset.enemy = card.id;
      button.dataset.role = card.role;
      button.tabIndex = -1;
      button.setAttribute('aria-label', `${card.label} ${t(card.name as TextKey)}`);
      number.className = 'bestiary-number';
      number.textContent = card.label;
      button.append(portraits[i]!, number);
      button.addEventListener(
        'focus',
        () => {
          if (!pointer) this.select(i, portraits);
        },
        { signal },
      );
      button.addEventListener(
        'click',
        (e) => {
          if (dragged && e.detail !== 0) {
            e.preventDefault();
            return;
          }
          this.select(i, portraits);
        },
        { signal },
      );
      grid.append(button);
      this.buttons.push(button);
    }
    this.index = Math.max(
      0,
      this.cards.findIndex((c) => c.id === selectedId),
    );
    this.select(this.index, portraits);
    this.navigation = new BestiaryNavigation(
      ui,
      grid,
      this.detail,
      back,
      () => this.buttons[this.index]!,
      close,
      () => !this.root.hidden && !pause.has('manual') && !pause.has('lifecycle') && ui.game.input.enabled,
      signal,
    );
  }
  open(): void {
    this.navigation.reset();
    this.root.hidden = false;
    this.buttons[this.index]!.focus({ preventScroll: true });
    this.buttons[this.index]!.scrollIntoView({ block: 'nearest' });
  }
  private select(index: number, portraits: HTMLElement[]): void {
    if (index === this.index && this.detail.childElementCount) return;
    this.buttons[this.index]?.setAttribute('aria-pressed', 'false');
    if (this.buttons[this.index]) this.buttons[this.index]!.tabIndex = -1;
    this.index = index;
    const card = this.cards[index]!;
    selectedId = card.id;
    this.buttons[index]!.tabIndex = 0;
    this.buttons[index]!.setAttribute('aria-pressed', 'true');
    const lead = document.createElement('div'),
      names = document.createElement('div'),
      name = document.createElement('h3'),
      label = document.createElement('small'),
      role = document.createElement('p'),
      facts = document.createElement('dl');
    lead.className = 'bestiary-lead';
    label.textContent = `No.${card.label}`;
    name.textContent = t(card.name as TextKey);
    role.textContent = `${t(`bestiary.role.${card.role}`)}${card.freezeImmune ? ` · ${t('bestiary.freezeImmune')}` : ''}`;
    names.append(label, name, role);
    lead.append(portraits[index]!.cloneNode(true), names);
    const floors = card.floors
      .map((f) => (f > DUNGEON.floors ? t('bestiary.bossFloor') : t('bestiary.floor', { floor: f })))
      .join(' · ');
    for (const [key, value] of [
      ['hp', card.hp],
      ['speed', card.speed || t('bestiary.still')],
      ['contact', card.contact],
      ['floors', floors],
    ] as const) {
      const term = document.createElement('dt'),
        definition = document.createElement('dd');
      term.textContent = t(`bestiary.fact.${key}`);
      definition.textContent = String(value);
      facts.append(term, definition);
    }
    this.detail.replaceChildren(lead, facts);
    if (card.spawnedBy.length) {
      const from = document.createElement('p');
      from.textContent = t('bestiary.spawnedBy', {
        names: card.spawnedBy.map((id) => t(this.cards.find((c) => c.id === id)!.name as TextKey)).join('、'),
      });
      this.detail.append(from);
    }
    for (const [heading, key] of [
      ['attackTitle', card.attack],
      ['descTitle', card.desc],
    ] as const) {
      const h = document.createElement('h4'),
        p = document.createElement('p');
      h.textContent = t(`bestiary.${heading}`);
      p.textContent = t(key as TextKey);
      this.detail.append(h, p);
    }
    const hint = document.createElement('small');
    hint.textContent = t('bestiary.controls');
    this.detail.append(hint);
    this.detail.scrollTop = 0;
  }
  update(): void {
    const hidden = this.pause.has('manual');
    if ((this.root.style.visibility === 'hidden') !== hidden)
      this.root.style.visibility = hidden ? 'hidden' : '';
    this.navigation.update();
  }
}
