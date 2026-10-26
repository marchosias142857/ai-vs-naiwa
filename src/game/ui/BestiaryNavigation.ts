import type { Scene } from 'phaser';
import { BESTIARY_UI, INPUT_UI } from '../fx/params';

const pressed = (button: { pressed: boolean }) => button.pressed;

/** 图鉴专用四向导航；不改普通菜单的上下选择语义。 */
export class BestiaryNavigation {
  private armed = false;
  private direction = 0;
  private repeatAt = 0;
  private confirm = false;
  constructor(
    private readonly ui: Scene,
    private readonly grid: HTMLElement,
    private readonly detail: HTMLElement,
    private readonly back: HTMLButtonElement,
    private readonly current: () => HTMLButtonElement,
    private readonly close: () => void,
    private readonly active: () => boolean,
    signal: AbortSignal,
  ) {
    document.addEventListener('visibilitychange', this.reset, { signal });
    window.addEventListener('blur', this.reset, { signal });
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.active()) return;
        e.stopImmediatePropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          (document.activeElement === this.back ? this.current() : this.back).focus();
        } else if (e.key.startsWith('Arrow')) {
          e.preventDefault();
          this.move(e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -2 : 2);
        } else if (e.key === 'PageDown' || e.key === 'PageUp') {
          e.preventDefault();
          this.detail.scrollBy(0, this.detail.clientHeight * (e.key === 'PageDown' ? 0.8 : -0.8));
        }
      },
      { signal, capture: true },
    );
  }
  readonly reset = (): void => {
    this.armed = false;
    this.direction = 0;
    this.confirm = false;
  };
  private move(direction: number): void {
    const buttons = Array.from(this.grid.querySelectorAll('button'));
    const index = buttons.indexOf(this.current());
    const columns = Math.max(1, getComputedStyle(this.grid).gridTemplateColumns.split(' ').length);
    let next = index;
    if (direction === 1 && index % columns < columns - 1) next++;
    if (direction === -1 && index % columns > 0) next--;
    if (direction === 2) next = Math.min(buttons.length - 1, index + columns);
    if (direction === -2) next = Math.max(0, index - columns);
    const button = buttons[next];
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  update(): void {
    if (!this.active()) {
      this.armed = false;
      return;
    }
    const pad = this.ui.input.gamepad?.pad1;
    if (!pad?.connected) {
      this.armed = false;
      return;
    }
    const keys = pad.buttons;
    const direction =
      keys[INPUT_UI.gamepad.up]?.pressed || pad.leftStick.y < -0.5
        ? -2
        : keys[INPUT_UI.gamepad.down]?.pressed || pad.leftStick.y > 0.5
          ? 2
          : keys[BESTIARY_UI.left]?.pressed || pad.leftStick.x < -0.5
            ? -1
            : keys[BESTIARY_UI.right]?.pressed || pad.leftStick.x > 0.5
              ? 1
              : 0;
    const confirm = !!keys[INPUT_UI.gamepad.confirm]?.pressed;
    if (!this.armed) {
      this.armed = !keys.some(pressed) && !direction && Math.abs(pad.rightStick.y) < 0.5;
      this.direction = 0;
      this.confirm = confirm;
      return;
    }
    if (keys[BESTIARY_UI.back]?.pressed) {
      this.close();
      this.armed = false;
      return;
    }
    const now = this.ui.time.now;
    if (direction && (direction !== this.direction || now >= this.repeatAt)) {
      this.move(direction);
      this.repeatAt = now + (direction === this.direction ? BESTIARY_UI.repeat : BESTIARY_UI.delay);
    }
    this.direction = direction;
    if (confirm && !this.confirm && document.activeElement === this.back) this.close();
    this.confirm = confirm;
    if (Math.abs(pad.rightStick.y) > 0.5)
      this.detail.scrollTop +=
        (pad.rightStick.y * BESTIARY_UI.scrollSpeed * Math.min(this.ui.game.loop.delta, 50)) / 1000;
  }
}
