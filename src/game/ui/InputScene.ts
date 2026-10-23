import { Scene } from 'phaser';
import type { GameObjects } from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../../config';
import { InputController } from '../input/InputController';
import { setInputProbe } from '../testHooks';
import { textStyle } from './text';

/** 独立 UI 持有输入与恢复入口；#15 从 controls.frame 读取战斗输入。 */
export class InputScene extends Scene {
  static readonly KEY = 'InputUI';
  controls!: InputController;
  private graphics!: GameObjects.Graphics;
  private resumeLabel!: GameObjects.Text;
  private fireScale = 1;
  private layoutScale = 0;
  private pauseLabel!: GameObjects.Text;
  playerX = GAME_WIDTH / 2;
  playerY = GAME_HEIGHT / 2 + 40;
  constructor() {
    super(InputScene.KEY);
  }
  create(): void {
    const battle = this.scene.get(SCENES.game);
    const battleInputEnabled = battle.input.enabled;
    // UI 统一拥有指针，控件触摸不能穿透到战斗场景。
    battle.input.enabled = false;
    this.graphics = this.add.graphics().setDepth(DEPTH.touchControls);
    this.resumeLabel = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '继续', textStyle(10))
      .setOrigin(0.5)
      .setDepth(DEPTH.touchControls);
    this.pauseLabel = this.add.text(0, 0, 'Ⅱ', textStyle(12)).setOrigin(0.5).setDepth(DEPTH.touchControls);
    this.controls = new InputController(this, battle, () => {
      this.controls.reset();
      if (battle.scene.isPaused()) {
        const now = Date.now();
        battle.tweens.startTime += now - battle.tweens.prevTime;
        battle.tweens.prevTime = now;
        battle.scene.resume();
      } else battle.scene.pause();
    });
    setInputProbe(() => ({
      ...this.controls.frame,
      move: { ...this.controls.frame.move },
      aim: this.controls.frame.aim ? { ...this.controls.frame.aim } : null,
      manualPaused: battle.scene.isPaused(),
    }));
    this.events.once('shutdown', () => {
      battle.input.enabled = battleInputEnabled;
      this.controls.destroy();
      setInputProbe(undefined);
    });
  }
  override update(_time: number, delta: number): void {
    const c = this.controls,
      s = c.rect.width / GAME_WIDTH;
    c.sample(this.playerX, this.playerY);
    if (!s) return;
    const targetScale = c.touch.fireId >= 0 ? 0.94 : 1;
    this.fireScale +=
      Math.sign(targetScale - this.fireScale) *
      Math.min(Math.abs(targetScale - this.fireScale), (0.06 * delta) / 60);
    const g = this.graphics;
    g.clear();
    const paused = c.battle.scene.isPaused();
    this.resumeLabel.setVisible(paused);
    if (s !== this.layoutScale) {
      this.layoutScale = s;
      this.resumeLabel.setFontSize(16 / s);
      this.pauseLabel.setPosition(GAME_WIDTH - 28 / s, 28 / s).setFontSize(18 / s);
    }
    if (paused) {
      g.fillStyle(0x0b0d14, 0.6).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      this.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 40 / s, false, 1);
    }
    this.circle(GAME_WIDTH - 28 / s, 28 / s, 18 / s, paused, 1);
    if (c.touchVisible && !paused) {
      const t = c.touch;
      this.circle(t.x / s, t.y / s, 52 / s, false, t.moveId >= 0 ? 0.8 : 0.35);
      this.circle((t.x + t.dx) / s, (t.y + t.dy) / s, 22 / s, t.moveId >= 0, t.moveId >= 0 ? 0.8 : 0.35);
      this.circle(GAME_WIDTH - 88 / s, GAME_HEIGHT - 88 / s, (40 / s) * this.fireScale, t.fireId >= 0, 1);
    }
    const mouse = c.frame.source === 'keyboard' && c.frame.aim !== null && !paused;
    this.game.canvas.style.cursor = mouse ? 'none' : '';
    if (mouse) {
      const x = c.mouse.x / s,
        y = c.mouse.y / s;
      g.lineStyle(3, 0x000000)
        .lineBetween(x - 3, y, x + 3, y)
        .lineBetween(x, y - 3, x, y + 3);
      g.lineStyle(1, 0xffffff)
        .lineBetween(x - 3, y, x + 3, y)
        .lineBetween(x, y - 3, x, y + 3);
    }
  }
  private circle(x: number, y: number, r: number, pressed: boolean, alpha: number): void {
    this.graphics.fillStyle(pressed ? 0x7ee8ff : 0, (pressed ? 0.35 : 0.3) * alpha).fillCircle(x, y, r);
    this.graphics
      .lineStyle(2 / (this.controls.rect.width / GAME_WIDTH), 0xffffff, alpha)
      .strokeCircle(x, y, r);
  }
}
