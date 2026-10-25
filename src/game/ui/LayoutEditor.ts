import type { Scene } from 'phaser';
import { t } from '../../i18n/t';
import {
  UI_KEYS,
  controlsOverlap,
  isVital,
  parseUiLayout,
  placeUi,
  saveUiLayout,
  uiEditor,
  uiLayout,
  uiRect,
  type UiKey,
} from '../../services/uiLayout';
import { guardGameUi } from './guardGameUi';
import './layout.css';

/** 独立草稿：保存才应用；局内从手动暂停进入，关闭后仍留在暂停页。 */
export class LayoutEditor {
  private readonly root = document.createElement('section');
  private readonly abort = new AbortController();
  private readonly items = new Map<UiKey, HTMLButtonElement>();
  private readonly select = document.createElement('select');
  private readonly size = document.createElement('input');
  private readonly alpha = document.createElement('input');
  private readonly notice = document.createElement('p');
  private draft = parseUiLayout(uiLayout);
  private selected: UiKey = 'health';
  private width = 1;
  private height = 1;
  constructor(
    private readonly scene: Scene,
    private readonly returnFocus: HTMLElement,
  ) {
    uiEditor.open = true;
    document.body.classList.add('editing-layout');
    this.root.id = 'layout-editor';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', t('layout.title'));
    const options = { signal: this.abort.signal };
    for (const key of UI_KEYS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `layout-item ${isVital(key) ? `vital vital-${key}` : 'layout-control'}`;
      item.dataset.key = key;
      item.setAttribute('aria-label', t(`layout.${key}`));
      const label = document.createElement('span');
      label.textContent = t(`layout.${key}`) + (isVital(key) ? (key === 'energy' ? ' 200/200' : ' 6/6') : '');
      if (isVital(key)) item.append(document.createElement('i'));
      item.append(label);
      let pointer: number | null = null,
        dx = 0,
        dy = 0;
      item.addEventListener(
        'pointerdown',
        (e) => {
          if (pointer !== null || !scene.game.input.enabled) return;
          this.choose(key);
          const r = uiRect(key, this.width, this.height, this.draft);
          const bounds = this.root.getBoundingClientRect();
          dx = e.clientX - bounds.left - r.x;
          dy = e.clientY - bounds.top - r.y;
          pointer = e.pointerId;
          item.setPointerCapture(pointer);
          e.preventDefault();
        },
        options,
      );
      item.addEventListener(
        'pointermove',
        (e) => {
          if (pointer !== e.pointerId || !scene.game.input.enabled) return;
          const bounds = this.root.getBoundingClientRect();
          this.move(key, e.clientX - bounds.left - dx, e.clientY - bounds.top - dy);
        },
        options,
      );
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
        item.addEventListener(
          event,
          () => {
            pointer = null;
          },
          options,
        );
      item.addEventListener('focus', () => this.choose(key), options);
      this.items.set(key, item);
      this.root.append(item);
      const option = document.createElement('option');
      option.value = key;
      option.textContent = t(`layout.${key}`);
      this.select.append(option);
    }
    const panel = document.createElement('details'),
      summary = document.createElement('summary');
    panel.open = true;
    panel.className = 'layout-tools';
    summary.textContent = t('layout.title');
    panel.append(summary);
    const hint = document.createElement('p');
    hint.textContent = t('layout.hint');
    panel.append(hint);
    this.select.setAttribute('aria-label', t('layout.select'));
    this.select.addEventListener('change', () => this.choose(this.select.value as UiKey), options);
    panel.append(this.select);
    for (const [input, key, min, max] of [
      [this.size, 'size', 80, 150],
      [this.alpha, 'opacity', 25, 100],
    ] as const) {
      const label = document.createElement('label'),
        output = document.createElement('output');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = '1';
      input.setAttribute('aria-label', t(`layout.${key}`));
      label.append(t(`layout.${key}`), input, output);
      panel.append(label);
      input.addEventListener(
        'input',
        () => {
          this.draft[this.selected][key === 'size' ? 'scale' : 'opacity'] = Number(input.value) / 100;
          this.paint();
        },
        options,
      );
    }
    const actions = document.createElement('div');
    actions.className = 'layout-actions';
    for (const action of ['save', 'cancel', 'reset'] as const) {
      const button = document.createElement('button');
      button.id = `layout-${action}`;
      button.textContent = t(`layout.${action}`);
      button.addEventListener(
        'click',
        () => {
          if (action === 'cancel') this.destroy();
          else if (action === 'reset') {
            this.draft = parseUiLayout(null);
            this.paint();
          } else if (controlsOverlap(this.width, this.height, this.draft))
            this.notice.textContent = t('layout.overlap');
          else if (!saveUiLayout(this.draft)) this.notice.textContent = t('layout.failed');
          else this.destroy();
        },
        options,
      );
      actions.append(button);
    }
    this.notice.setAttribute('role', 'status');
    panel.append(actions, this.notice);
    this.root.append(panel);
    guardGameUi(this.root, scene, this.abort.signal);
    document.body.append(this.root);
    window.addEventListener(
      'keydown',
      (e) => {
        e.stopImmediatePropagation();
        if (!scene.game.input.enabled) {
          e.preventDefault();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          this.destroy();
        } else if (e.key === 'Tab') {
          const nodes = Array.from(
            this.root.querySelectorAll<HTMLElement>('button,select,input,summary'),
          ).filter((el) => el.getClientRects().length > 0);
          const index = nodes.indexOf(document.activeElement as HTMLElement);
          e.preventDefault();
          nodes[(index + (e.shiftKey ? -1 : 1) + nodes.length) % nodes.length]?.focus();
        } else if (
          e.target instanceof HTMLElement &&
          e.target.classList.contains('layout-item') &&
          /^Arrow/.test(e.key)
        ) {
          e.preventDefault();
          const r = uiRect(this.selected, this.width, this.height, this.draft);
          this.move(
            this.selected,
            r.x + (e.key === 'ArrowRight' ? 4 : e.key === 'ArrowLeft' ? -4 : 0),
            r.y + (e.key === 'ArrowDown' ? 4 : e.key === 'ArrowUp' ? -4 : 0),
          );
        }
      },
      { ...options, capture: true },
    );
    window.addEventListener('resize', this.layout, options);
    scene.scale.on('resize', this.layout);
    scene.events.once('shutdown', this.destroy);
    this.layout();
    this.select.focus();
  }
  private choose(key: UiKey): void {
    this.selected = key;
    this.paint();
  }
  private move(key: UiKey, x: number, y: number): void {
    this.draft[key].x = x / this.width;
    this.draft[key].y = y / this.height;
    const r = uiRect(key, this.width, this.height, this.draft);
    this.draft[key].x = r.x / this.width;
    this.draft[key].y = r.y / this.height;
    this.paint();
  }
  private readonly layout = (): void => {
    const r = this.scene.game.canvas.parentElement!.getBoundingClientRect();
    this.width = r.width;
    this.height = r.height;
    Object.assign(this.root.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    this.paint();
  };
  private paint(): void {
    for (const [key, item] of this.items) {
      placeUi(item, key, this.width, this.height, this.draft);
      item.classList.toggle('selected', key === this.selected);
    }
    this.select.value = this.selected;
    this.size.value = String(Math.round(this.draft[this.selected].scale * 100));
    this.alpha.value = String(Math.round(this.draft[this.selected].opacity * 100));
    for (const input of [this.size, this.alpha])
      if (input.nextElementSibling) input.nextElementSibling.textContent = `${input.value}%`;
    this.notice.textContent = '';
  }
  readonly destroy = (): void => {
    this.abort.abort();
    this.scene.scale.off('resize', this.layout);
    this.scene.events.off('shutdown', this.destroy);
    this.root.remove();
    uiEditor.open = false;
    document.body.classList.remove('editing-layout');
    if (this.returnFocus.isConnected) this.returnFocus.focus();
  };
}

export function addLayoutSettings(root: HTMLElement, scene: Scene, signal: AbortSignal): void {
  const button = document.createElement('button');
  button.className = 'settings-layout';
  button.textContent = t('layout.title');
  button.addEventListener(
    'click',
    () => {
      if (!uiEditor.open) new LayoutEditor(scene, button);
    },
    { signal },
  );
  root.append(button);
}
