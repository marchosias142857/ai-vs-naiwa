import { InputImages } from './InputImages';
import { uiEditor } from '../../services/uiLayout';
import { configureCamera } from '../configureCamera';
import { t } from '../../i18n/t';
import { PausePanel } from './PausePanel';
import { ActionButtons } from './ActionButtons';
import { INPUT_UI as UI } from '../fx/params';
import { Scene } from 'phaser';
import type { GameObjects } from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, SCENES } from '../../config';
import { InputController } from '../input/InputController';
import { setInputProbe } from '../testHooks';
import { textStyle } from './text';
import { combatPause } from '../world/combatPause';
import { ResumeCaption } from './ResumeCaption';

/** 独立 UI 持有输入与恢复入口；#15 从 controls.frame 读取战斗输入。 */
export class InputScene extends Scene {
  static readonly KEY = 'InputUI';
  controls!: InputController;
  private hub = false;
  private actions?: ActionButtons;
  private pausePanel?: PausePanel;
  private graphics!: GameObjects.Graphics;
  private resumeLabel!: GameObjects.Text;
  private layoutScale = 0;
  private layoutWidth = 0;
  private images!: InputImages;
  private countdownHint!: ResumeCaption;
  /** 鼠标瞄准原点：由战斗场景在物理后发布的玩家身体中心。 */
  playerX = GAME_WIDTH / 2;
  playerY = GAME_HEIGHT / 2 + 40;
  constructor() {
    super(InputScene.KEY);
  }
  create(data?: { demo?: boolean; hub?: boolean }): void {
    configureCamera(this);
    // scene.restart 会复用场景实例；布局缓存必须清掉，否则同尺寸重来时跳过布局，暂停符号停在 (0, 0)。
    this.layoutScale = 0;
    this.hub = !!data?.hub;
    const battle = this.scene.get(this.hub ? SCENES.hub : SCENES.game);
    const battleInputEnabled = battle.input.enabled;
    // UI 统一拥有指针，控件触摸不能穿透到战斗场景。
    battle.input.enabled = false;
    this.graphics = this.add.graphics().setDepth(DEPTH.touchControls);
    this.resumeLabel = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, t('input.resume'), textStyle(10))
      .setOrigin(0.5)
      .setDepth(DEPTH.touchControls);
    this.images = new InputImages(this);
    this.resumeLabel.setDepth(DEPTH.touchControls + 1);
    this.countdownHint = new ResumeCaption(this);
    const togglePause = () => {
      if (uiEditor.open) return;
      const pause = combatPause(battle);
      if (pause) {
        if (!pause.has('finished')) pause.set('manual', !pause.has('manual'));
        return;
      }
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
    this.controls = new InputController(this, battle, togglePause, !!data?.demo || this.hub);
    this.pausePanel = data?.demo || this.hub ? new PausePanel(this, battle, togglePause) : undefined;
    this.actions = data?.demo ? new ActionButtons(this, this.controls) : undefined;
    setInputProbe(() => ({
      ...this.controls.frame,
      move: { ...this.controls.frame.move },
      aim: this.controls.frame.aim ? { ...this.controls.frame.aim } : null,
      manualPaused: this.controls.manualPaused,
      touch: {
        moveX: this.controls.touch.homeX,
        moveY: this.controls.touch.homeY,
        moveRadius: this.controls.touch.moveRadius,
        fireX: this.controls.touch.fireX,
        fireY: this.controls.touch.fireY,
        fireRadius: this.controls.touch.fireRadius,
      },
    }));
    this.events.once('shutdown', () => {
      battle.input.enabled = battleInputEnabled;
      this.pausePanel?.destroy();
      this.pausePanel = undefined;
      this.actions?.destroy();
      this.actions = undefined;
      this.controls.destroy();
      this.countdownHint.destroy();
      setInputProbe(undefined);
    });
  }
  override update(): void {
    const c = this.controls,
      s = c.rect.height / GAME_HEIGHT,
      width = this.scale.width / RENDER_SCALE;
    c.sample(this.playerX, this.playerY);
    if (!s) return;
    const g = this.graphics;
    g.clear();
    const pause = combatPause(c.battle);
    pause?.update();
    const paused = c.manualPaused,
      locked = c.battle.physics.world.isPaused,
      canPause = pause ? !pause.has('finished') : !locked;
    const counting = !!pause?.has('restore') && !paused && !pause.has('lifecycle');
    this.countdownHint.setVisible(counting);
    this.pausePanel?.update(paused);
    this.resumeLabel.setVisible(paused && !this.pausePanel);
    this.actions?.setVisible(c.touchVisible && !paused && !locked);
    if (s !== this.layoutScale || width !== this.layoutWidth) {
      this.layoutWidth = width;
      this.cameras.main.setViewport(0, 0, this.scale.width, this.scale.height);
      this.resumeLabel.setPosition(width / 2, GAME_HEIGHT / 2);
      this.layoutScale = s;
      this.resumeLabel.setFontSize(UI.resume.fontSize / s);
    }
    if (paused && !uiEditor.open) {
      g.fillStyle(UI.look.pauseColor, UI.look.pauseAlpha).fillRect(0, 0, width, GAME_HEIGHT);
    }
    this.images.update(
      c,
      s,
      width,
      this.hub,
      paused,
      locked,
      canPause,
      paused && !this.pausePanel && !uiEditor.open,
      counting ? pause!.remaining : 0,
    );
  }
}
