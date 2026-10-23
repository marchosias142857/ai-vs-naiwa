import { stick } from './InputState';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** CSS 像素下的多指所有权与浮动摇杆。 */
export class TouchState {
  readonly move = { x: 0, y: 0 };
  width = 0;
  height = 0;
  x = 100;
  y = 100;
  dx = 0;
  dy = 0;
  moveId = -1;
  fireId = -1;
  pauseId = -1;
  pausePressed = false;
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.reset();
  }
  reset(): void {
    this.moveId = this.fireId = this.pauseId = -1;
    this.pausePressed = false;
    this.x = 100;
    this.y = this.height - 100;
    this.dx = this.dy = this.move.x = this.move.y = 0;
  }
  down(id: number, x: number, y: number): boolean {
    if (Math.hypot(x - (this.width - 28), y - 28) <= 22 && this.pauseId < 0) {
      this.pauseId = id;
      this.pausePressed = true;
      return true;
    }
    if (Math.hypot(x - (this.width - 88), y - (this.height - 88)) <= 40 && this.fireId < 0) {
      this.fireId = id;
      return true;
    }
    if (x >= 0 && x <= this.width * 0.45 && y >= 48 && y <= this.height && this.moveId < 0) {
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
    if (length > 52) {
      this.x = x - ((x - this.x) / length) * 52;
      this.y = y - ((y - this.y) / length) * 52;
    }
    this.x = clamp(this.x, 52, Math.max(52, this.width * 0.45 - 52));
    this.y = clamp(this.y, 100, Math.max(100, this.height - 52));
    const n = Math.max(52, Math.hypot(x - this.x, y - this.y));
    this.dx = ((x - this.x) / n) * 52;
    this.dy = ((y - this.y) / n) * 52;
    stick(this.move, this.dx / 52, this.dy / 52, 0.12);
  }
  up(id: number): void {
    if (id === this.moveId) {
      this.moveId = -1;
      this.x = 100;
      this.y = this.height - 100;
      this.dx = this.dy = this.move.x = this.move.y = 0;
    }
    if (id === this.fireId) this.fireId = -1;
    if (id === this.pauseId) this.pauseId = -1;
  }
}
