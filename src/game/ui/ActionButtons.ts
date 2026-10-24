import type { Scene } from 'phaser';
import { COLORS } from '../../config';
import { INPUT_UI } from '../fx/params';
import type { InputController } from '../input/InputController';

/** 临时功能性按钮；属于输入 UI 场景，固定 CSS 触控尺寸，正式布局待画面方案。 */
export class ActionButtons {
  private readonly root = document.createElement('div');
  private readonly abort = new AbortController();
  private visible = true;
  constructor(
    private readonly scene: Scene,
    controls: InputController,
  ) {
    const ui = INPUT_UI.actions;
    this.root.id = 'demo-actions';
    this.root.setAttribute('aria-label', '战斗动作');
    this.root.style.cssText = `position:fixed;display:flex;gap:${ui.gap}px;z-index:3;`;
    const actions = [
      ['技能 / Space', 'Space'],
      ['切枪 / Q', 'KeyQ'],
      ['拾取 / E', 'KeyE'],
    ] as const;
    for (const [label, code] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.action = code;
      button.style.cssText = `width:${ui.width}px;height:${ui.height}px;font:${ui.fontSize}px sans-serif;background:#${COLORS.background.toString(16).padStart(6, '0')};color:${COLORS.text};border:1px solid ${COLORS.accent};touch-action:manipulation;cursor:pointer;`;
      button.addEventListener(
        'click',
        () => {
          if (!controls.battle.scene.isPaused() && !controls.battle.physics.world.isPaused)
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
  }
  private readonly layout = (): void => {
    const r = this.scene.game.canvas.getBoundingClientRect(),
      ui = INPUT_UI.actions;
    this.root.style.left = `${r.left + r.width / 2 - (ui.width * 3 + ui.gap * 2) / 2}px`;
    this.root.style.top = `${r.bottom - ui.bottom - ui.height}px`;
  };
  setVisible(value: boolean): void {
    if (this.visible === value) return;
    this.visible = value;
    this.root.style.display = value ? 'flex' : 'none';
  }
  destroy(): void {
    this.abort.abort();
    this.scene.scale.off('resize', this.layout);
    this.root.remove();
  }
}
