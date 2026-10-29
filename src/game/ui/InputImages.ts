import type { GameObjects, Scene } from 'phaser';
import { DEPTH, GAME_HEIGHT } from '../../config';
import { uiLayout } from '../../services/uiLayout';
import { UI_ART, type UiControl, type UiIcon } from '../assets/uiArt';
import { INPUT_UI as UI, RESUME_UI } from '../fx/params';
import type { InputController } from '../input/InputController';

/** Fixed sprite slots: no textures, objects, timers or random calls in update. */
export class InputImages {
  private readonly moveBase: GameObjects.Image;
  private readonly moveKnob: GameObjects.Image;
  private readonly fireBase: GameObjects.Image;
  private readonly fireKnob: GameObjects.Image;
  private readonly fireIcon: GameObjects.Image;
  private readonly pauseBase: GameObjects.Image;
  private readonly pauseIcon: GameObjects.Image;
  private readonly resumeBase: GameObjects.Image;
  private readonly countdownBase: GameObjects.Image;
  private readonly countdown: GameObjects.Image;
  private readonly crosshair: GameObjects.Image;
  private readonly all: readonly GameObjects.Image[];
  constructor(scene: Scene) {
    const control = (frame: UiControl) =>
      scene.add.image(0, 0, UI_ART.controls, frame).setDepth(DEPTH.touchControls);
    const icon = (frame: UiIcon) => scene.add.image(0, 0, UI_ART.icons, frame).setDepth(DEPTH.touchControls);
    this.moveBase = control('moveBase');
    this.moveKnob = control('moveKnob');
    this.fireBase = control('fireBase');
    this.fireKnob = control('fireKnob');
    this.fireIcon = icon('aim');
    this.pauseBase = control('pauseBase');
    this.pauseIcon = icon('pause');
    this.resumeBase = control('pauseBase');
    this.countdownBase = control('countdown');
    this.countdown = icon('count3');
    this.crosshair = icon('aim');
    this.all = [
      this.moveBase,
      this.moveKnob,
      this.fireBase,
      this.fireKnob,
      this.fireIcon,
      this.pauseBase,
      this.pauseIcon,
      this.resumeBase,
      this.countdownBase,
      this.countdown,
      this.crosshair,
    ];
  }
  update(
    c: InputController,
    s: number,
    width: number,
    hub: boolean,
    paused: boolean,
    locked: boolean,
    canPause: boolean,
    resume: boolean,
    remaining: number,
  ): void {
    for (const image of this.all) image.setVisible(false);
    const show = this.show;
    if (remaining > 0) {
      show(this.countdownBase, width / 2, GAME_HEIGHT / 2, RESUME_UI.radius * 2, 1);
      const frame: UiIcon = remaining > 2 ? 'count3' : remaining > 1 ? 'count2' : 'count1';
      if (this.countdown.frame.name !== frame) this.countdown.setFrame(frame);
      show(this.countdown, width / 2, GAME_HEIGHT / 2, RESUME_UI.fontSize * 1.4, 1);
    }
    if (resume) show(this.resumeBase, width / 2, GAME_HEIGHT / 2, (UI.resume.radius * 2) / s, 1);
    if (canPause) {
      const x = width - UI.pause.inset / s,
        y = UI.pause.inset / s;
      show(this.pauseBase, x, y, (UI.pause.hitRadius * 2) / s, 1);
      const frame = paused ? 'play' : 'pause';
      if (this.pauseIcon.frame.name !== frame) this.pauseIcon.setFrame(frame);
      show(this.pauseIcon, x, y, (UI.pause.radius * 1.15) / s, 1);
    }
    if (c.touchVisible && !paused && !locked) {
      const t = c.touch;
      show(this.moveBase, t.x / s, t.y / s, (t.moveRadius * 2) / s, uiLayout.move.opacity);
      show(
        this.moveKnob,
        (t.x + t.dx) / s,
        (t.y + t.dy) / s,
        (((UI.joystick.knobRadius * t.moveRadius) / UI.joystick.radius) * 2) / s,
        uiLayout.move.opacity,
      );
      if (!hub) {
        show(this.fireBase, t.fireX / s, t.fireY / s, (t.fireRadius * 2) / s, uiLayout.fire.opacity);
        show(
          this.fireKnob,
          (t.fireX + t.fireDx) / s,
          (t.fireY + t.fireDy) / s,
          (((UI.aimWheel.knobRadius * t.fireRadius) / UI.aimWheel.radius) * 2) / s,
          uiLayout.fire.opacity,
        );
        this.fireKnob.setTint(t.fireId !== null ? 0xffffff : 0xc3d3d3);
        show(
          this.fireIcon,
          (t.fireX + t.fireDx) / s,
          (t.fireY + t.fireDy) / s,
          (UI.aimWheel.iconRadius * 3) / s,
          uiLayout.fire.opacity,
        );
      }
    }
    const mouse = !hub && c.frame.source === 'keyboard' && c.frame.aim !== null && !paused && !locked;
    c.battle.game.canvas.style.cursor = mouse ? 'none' : '';
    if (mouse) show(this.crosshair, c.mouse.x / s, c.mouse.y / s, UI.crosshair.radius * 2.5, 1);
  }
  private readonly show = (
    image: GameObjects.Image,
    x: number,
    y: number,
    size: number,
    alpha: number,
  ): void => {
    image.setPosition(x, y).setDisplaySize(size, size).setAlpha(alpha).setVisible(true);
  };
}
