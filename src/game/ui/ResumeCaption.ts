import type { Scene } from 'phaser';
import { GAME_HEIGHT } from '../../config';
import { t } from '../../i18n/t';
import { RESUME_UI } from '../fx/params';
import { FONT_FAMILY } from './text';

/** 中文提示用浏览器文字层，避免经过低分辨率游戏画布后丢失细笔画。 */
export class ResumeCaption {
  private readonly root = document.createElement('div');
  constructor(private readonly scene: Scene) {
    this.root.id = 'resume-caption';
    this.root.textContent = t('input.ready');
    this.root.setAttribute('role', 'status');
    this.root.hidden = true;
    this.root.style.cssText = `position:fixed;z-index:3;pointer-events:none;transform:translate(-50%,-50%);white-space:nowrap;color:#e8ecff;background:${RESUME_UI.captionBackground};padding:${RESUME_UI.captionPadding}px;font:${RESUME_UI.captionSize}px/1.4 ${FONT_FAMILY};`;
    document.body.append(this.root);
    this.layout();
    scene.scale.on('resize', this.layout);
    window.addEventListener('resize', this.layout);
  }
  private readonly layout = (): void => {
    const r = this.scene.game.canvas.getBoundingClientRect();
    this.root.style.left = `${r.left + r.width / 2}px`;
    this.root.style.top = `${r.top + r.height * (0.5 + RESUME_UI.captionOffset / GAME_HEIGHT)}px`;
  };
  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
  destroy(): void {
    this.scene.scale.off('resize', this.layout);
    window.removeEventListener('resize', this.layout);
    this.root.remove();
  }
}
