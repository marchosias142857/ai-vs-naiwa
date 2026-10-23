import { Scene } from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../../config';
import { TEX } from '../assets/keys';
import { setTestHooks } from '../testHooks';
import { textStyle } from '../ui/text';

/** 主菜单（M0 版本）：标题 + 点击开始。大厅（HubScene）在 M6 加入。 */
export class MenuScene extends Scene {
  private starting = false;

  constructor() {
    super(SCENES.menu);
  }

  create(): void {
    this.starting = false;
    const cx = GAME_WIDTH / 2;

    this.add.image(cx - 36, 92, TEX.player).setScale(2);
    this.add.image(cx + 36, 96, TEX.enemy).setScale(2).setFlipX(true);
    this.add.text(cx, 132, 'AI 大战奶蛙', textStyle(28, COLORS.text)).setOrigin(0.5);
    this.add.text(cx, 160, 'AI VS NAIWA', textStyle(10, COLORS.textDim, { letterSpacing: 3 })).setOrigin(0.5);

    const hint = this.add.text(cx, 210, '点击屏幕 / 按任意键开始', textStyle(12, COLORS.accent)).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    this.add
      .text(GAME_WIDTH - 6, GAME_HEIGHT - 6, 'M0 · 脚手架', textStyle(8, COLORS.textDim))
      .setOrigin(1, 1);

    this.input.once('pointerdown', () => this.start());
    this.input.keyboard?.once('keydown', () => this.start());

    setTestHooks({ ready: true, scene: SCENES.menu });
  }

  private start(): void {
    if (this.starting) return;
    this.starting = true;
    this.scene.start(SCENES.game);
  }
}
