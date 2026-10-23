import { INPUT_UI as UI } from '../fx/params';
import { stick } from './InputState';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** CSS 像素下的多指所有权与浮动摇杆。 */
export class TouchState {
  readonly move = { x: 0, y: 0 };
  width = 0;
  height = 0;
  x: number = UI.joystick.homeInset;
  y: number = UI.joystick.homeInset;
  dx = 0;
  dy = 0;
  moveId = -1;
  fireId = -1;
  pauseId = -1;
  pausePressed = false;
  resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.reset();
  }
  reset(): void {
    this.moveId = this.fireId = this.pauseId = -1;
    this.pausePressed = false;
    this.x = UI.joystick.homeInset;
    this.y = this.height - UI.joystick.homeInset;
    this.dx = this.dy = this.move.x = this.move.y = 0;
  }
  down(id: number, x: number, y: number): boolean {
    if (
      Math.hypot(x - (this.width - UI.pause.inset), y - UI.pause.inset) <= UI.pause.hitRadius &&
      this.pauseId < 0
    ) {
      this.pauseId = id;
      this.pausePressed = true;
      return true;
    }
    if (
      Math.hypot(x - (this.width - UI.fire.inset), y - (this.height - UI.fire.inset)) <= UI.fire.radius &&
      this.fireId < 0
    ) {
      this.fireId = id;
      return true;
    }
    if (
      x >= 0 &&
      x <= this.width * UI.moveArea.widthFraction &&
      y >= UI.moveArea.top &&
      y <= this.height &&
      this.moveId < 0
    ) {
      this.moveId = id;
      this.x = x;
      this.y = y;
      this.drag(id, x, y);
      return true;
    }
    return false;
  }
  drag(id: number, x: number, y: number): void {
    if (id !== this.moveId) return;
    const length = Math.hypot(x - this.x, y - this.y);
    if (length > UI.joystick.radius) {
      this.x = x - ((x - this.x) / length) * UI.joystick.radius;
      this.y = y - ((y - this.y) / length) * UI.joystick.radius;
    }
    this.x = clamp(
      this.x,
      UI.joystick.radius,
      Math.max(UI.joystick.radius, this.width * UI.moveArea.widthFraction - UI.joystick.radius),
    );
    this.y = clamp(
      this.y,
      UI.joystick.homeInset,
      Math.max(UI.joystick.homeInset, this.height - UI.joystick.radius),
    );
    const n = Math.max(UI.joystick.radius, Math.hypot(x - this.x, y - this.y));
    this.dx = ((x - this.x) / n) * UI.joystick.radius;
    this.dy = ((y - this.y) / n) * UI.joystick.radius;
    stick(this.move, this.dx / UI.joystick.radius, this.dy / UI.joystick.radius, UI.deadzone);
  }
  up(id: number): void {
    if (id === this.moveId) {
      this.moveId = -1;
      this.x = UI.joystick.homeInset;
      this.y = this.height - UI.joystick.homeInset;
      this.dx = this.dy = this.move.x = this.move.y = 0;
    }
    if (id === this.fireId) this.fireId = -1;
    if (id === this.pauseId) this.pauseId = -1;
  }
}
