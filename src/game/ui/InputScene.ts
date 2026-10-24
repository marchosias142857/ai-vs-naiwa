import { t } from '../../i18n/t';
import { PausePanel } from './PausePanel';
import { ActionButtons } from './ActionButtons';
import { INPUT_UI as UI } from '../fx/params';
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
  private actions?: ActionButtons;
  private pausePanel?: PausePanel;
  private graphics!: GameObjects.Graphics;
  private resumeLabel!: GameObjects.Text;
  private layoutScale = 0;
  private pauseLabel!: GameObjects.Text;
  /** 鼠标瞄准原点：由战斗场景在物理后发布的玩家身体中心（脚底 y - radius）。 */
  playerX = GAME_WIDTH / 2;
  playerY = GAME_HEIGHT / 2 + 40;
  constructor() {
    super(InputScene.KEY);
  }
  create(data?: { demo?: boolean }): void {
    // scene.restart 会复用场景实例；布局缓存必须清掉，否则同尺寸重来时跳过布局，暂停符号停在 (0, 0)。
    this.layoutScale = 0;
    const battle = this.scene.get(SCENES.game);
    const battleInputEnabled = battle.input.enabled;
    // UI 统一拥有指针，控件触摸不能穿透到战斗场景。
    battle.input.enabled = false;
    this.graphics = this.add.graphics().setDepth(DEPTH.touchControls);
    this.resumeLabel = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, t('input.resume'), textStyle(10))
      .setOrigin(0.5)
      .setDepth(DEPTH.touchControls);
    this.pauseLabel = this.add.text(0, 0, 'Ⅱ', textStyle(12)).setOrigin(0.5).setDepth(DEPTH.touchControls);
    const togglePause = () => {
      // 楼层选择与结算持有物理暂停；此时不能再叠加手动 scene.pause。
      if (battle.physics.world.isPaused) return;
      this.controls.reset();
      if (battle.scene.isPaused()) {
        const now = Date.now();
        battle.tweens.startTime += now - battle.tweens.prevTime;
        battle.tweens.prevTime = now;
        battle.scene.resume();
      } else battle.scene.pause();
    };
    this.controls = new InputController(this, battle, togglePause);
    this.pausePanel = data?.demo ? new PausePanel(this, battle, togglePause) : undefined;
    this.actions = data?.demo ? new ActionButtons(this, this.controls) : undefined;
    setInputProbe(() => ({
      ...this.controls.frame,
      move: { ...this.controls.frame.move },
      aim: this.controls.frame.aim ? { ...this.controls.frame.aim } : null,
      manualPaused: battle.scene.isPaused(),
    }));
    this.events.once('shutdown', () => {
      battle.input.enabled = battleInputEnabled;
      this.pausePanel?.destroy();
      this.pausePanel = undefined;
      this.actions?.destroy();
      this.actions = undefined;
      this.controls.destroy();
      setInputProbe(undefined);
    });
  }
  override update(): void {
    const c = this.controls,
      s = c.rect.width / GAME_WIDTH;
    c.sample(this.playerX, this.playerY);
    if (!s) return;
    const g = this.graphics;
    g.clear();
    const paused = c.battle.scene.isPaused(),
      locked = c.battle.physics.world.isPaused;
    this.pauseLabel.setVisible(!locked);
    this.pausePanel?.update(paused);
    this.resumeLabel.setVisible(paused && !this.pausePanel);
    this.actions?.setVisible(c.touchVisible && !paused && !locked);
    if (s !== this.layoutScale) {
      this.layoutScale = s;
      this.resumeLabel.setFontSize(UI.resume.fontSize / s);
      this.pauseLabel
        .setPosition(GAME_WIDTH - UI.pause.inset / s, UI.pause.inset / s)
        .setFontSize(UI.pause.fontSize / s);
    }
    if (paused) {
      g.fillStyle(UI.look.pauseColor, UI.look.pauseAlpha).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      this.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, UI.resume.radius / s, false, 1);
    }
    if (!locked)
      this.circle(GAME_WIDTH - UI.pause.inset / s, UI.pause.inset / s, UI.pause.radius / s, paused, 1);
    if (c.touchVisible && !paused && !locked) {
      const t = c.touch;
      this.circle(
        t.x / s,
        t.y / s,
        UI.joystick.radius / s,
        false,
        t.moveId >= 0 ? UI.joystick.activeAlpha : UI.joystick.idleAlpha,
      );
      this.circle(
        (t.x + t.dx) / s,
        (t.y + t.dy) / s,
        UI.joystick.knobRadius / s,
        t.moveId >= 0,
        t.moveId >= 0 ? UI.joystick.activeAlpha : UI.joystick.idleAlpha,
      );
      const x = GAME_WIDTH - UI.aimWheel.inset / s,
        y = GAME_HEIGHT - UI.aimWheel.inset / s,
        held = t.fireId >= 0,
        alpha = held ? 1 : UI.joystick.idleAlpha;
      this.circle(x, y, UI.aimWheel.radius / s, held, alpha);
      this.circle(x + t.fireDx / s, y + t.fireDy / s, UI.aimWheel.knobRadius / s, held, alpha);
      const r = UI.aimWheel.iconRadius / s;
      g.lineStyle(UI.outline / s, UI.look.pressedColor, alpha)
        .lineBetween(x - r, y, x + r, y)
        .lineBetween(x, y - r, x, y + r);
    }
    const mouse = c.frame.source === 'keyboard' && c.frame.aim !== null && !paused && !locked;
    this.game.canvas.style.cursor = mouse ? 'none' : '';
    if (mouse) {
      const x = Math.floor(c.mouse.x / s) + 0.5,
        y = Math.floor(c.mouse.y / s) + 0.5;
      g.lineStyle(UI.crosshair.outline, 0x000000)
        .lineBetween(x - UI.crosshair.radius, y, x + UI.crosshair.radius, y)
        .lineBetween(x, y - UI.crosshair.radius, x, y + UI.crosshair.radius);
      g.lineStyle(UI.crosshair.stroke, 0xffffff)
        .lineBetween(x - UI.crosshair.radius, y, x + UI.crosshair.radius, y)
        .lineBetween(x, y - UI.crosshair.radius, x, y + UI.crosshair.radius);
    }
  }
  private circle(x: number, y: number, r: number, pressed: boolean, alpha: number): void {
    this.graphics
      .fillStyle(
        pressed ? UI.look.pressedColor : 0,
        (pressed ? UI.look.pressedFillAlpha : UI.look.idleFillAlpha) * alpha,
      )
      .fillCircle(x, y, r);
    this.graphics
      .lineStyle(UI.outline / (this.controls.rect.width / GAME_WIDTH), 0xffffff, alpha)
      .strokeCircle(x, y, r);
  }
}
