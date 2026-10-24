import type { Scene } from 'phaser';
import { INPUT_UI } from '../fx/params';

/** 菜单手柄边沿在渲染帧处理；进入菜单需松开确认键，避免 RT 连射穿透。 */
export class MenuNavigation {
  private readonly buttons: HTMLButtonElement[];
  private active = false;
  private armed = false;
  private held = false;
  private direction = 0;
  private index = 0;
  constructor(
    private readonly root: HTMLElement,
    private readonly scene: Scene,
  ) {
    this.buttons = Array.from(root.querySelectorAll('button'));
  }
  update(active: boolean): void {
    if (!active) {
      this.active = false;
      if (this.root.contains(document.activeElement) && document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      return;
    }
    const pad = this.scene.input.gamepad?.pad1;
    if (!pad?.connected) return;
    const confirm = !!pad.buttons[INPUT_UI.gamepad.confirm]?.pressed || pad.R2 > 0.5;
    const direction =
      pad.leftStick.y > 0.5 || pad.buttons[INPUT_UI.gamepad.down]?.pressed
        ? 1
        : pad.leftStick.y < -0.5 || pad.buttons[INPUT_UI.gamepad.up]?.pressed
          ? -1
          : 0;
    if (!this.active) {
      this.active = true;
      this.armed = false;
      this.index = -1;
      this.select(1);
    }
    if (!this.armed) {
      this.armed = !confirm && !direction;
      this.held = confirm;
      this.direction = direction;
      return;
    }
    if (direction && direction !== this.direction) this.select(direction);
    this.direction = direction;
    if (confirm && !this.held) this.buttons[this.index]?.click();
    this.held = confirm;
  }
  private select(direction: number): void {
    for (let i = 0; i < this.buttons.length; i++) {
      this.index = (this.index + direction + this.buttons.length) % this.buttons.length;
      const b = this.buttons[this.index]!;
      if (!b.hidden && !b.disabled) {
        b.focus({ preventScroll: false });
        return;
      }
    }
  }
}
