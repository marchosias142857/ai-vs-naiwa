import { uiIcon } from '../assets/uiArt';
import { t } from '../../i18n/t';
import type { Scene } from 'phaser';
import { UI_LAYOUT_CHANGED, placeUi, type UiKey } from '../../services/uiLayout';
import './imageUi.css';
import type { InputController } from '../input/InputController';

/** 输入 UI 场景的动作按钮，固定 CSS 触控尺寸，避免随画布缩小到难以点击。 */
export class ActionButtons {
  private readonly root = document.createElement('div');
  private readonly abort = new AbortController();
  private visible = true;
  constructor(
    private readonly scene: Scene,
    controls: InputController,
  ) {
    this.root.id = 'demo-actions';
    this.root.setAttribute('aria-label', t('input.actions'));
    this.root.style.cssText = `position:fixed;z-index:3;`;
    const actions = [
      [t('input.skill'), 'Space', 'skill'],
      [t('input.swap'), 'KeyQ', 'swap'],
      [t('input.interact'), 'KeyE', 'interact'],
    ] as const;
    for (const [label, code, key] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.action = code;
      button.dataset.layout = key;
      uiIcon(button, key);
      button.addEventListener(
        'pointerdown',
        (event) => {
          event.preventDefault();
          if (
            scene.game.input.enabled &&
            !controls.battle.scene.isPaused() &&
            !controls.battle.physics.world.isPaused
          )
            controls.state.action(code);
          button.blur();
        },
        { signal: this.abort.signal },
      );
      this.root.append(button);
    }
    document.body.append(this.root);
    this.layout();
    scene.scale.on('resize', this.layout);
    window.addEventListener('resize', this.layout, { signal: this.abort.signal });
    window.addEventListener(UI_LAYOUT_CHANGED, this.layout, { signal: this.abort.signal });
  }
  private readonly layout = (): void => {
    const r = this.scene.game.canvas.getBoundingClientRect();
    Object.assign(this.root.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button'))
      placeUi(button, button.dataset.layout as UiKey, r.width, r.height);
  };

  setVisible(value: boolean): void {
    if (this.visible === value) return;
    this.visible = value;
    this.root.style.display = value ? 'block' : 'none';
  }
  destroy(): void {
    this.abort.abort();
    this.scene.scale.off('resize', this.layout);
    this.root.remove();
  }
}
