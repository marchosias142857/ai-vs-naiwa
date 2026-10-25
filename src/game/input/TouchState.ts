import { INPUT_UI as UI } from '../fx/params';
import { stick } from './InputState';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** CSS 像素下的多指所有权与浮动摇杆。 */
export class TouchState {
  readonly move = { x: 0, y: 0 };
  readonly aim = { x: 0, y: 0 };
  aiming = false;
  fireDx = 0;
  fireDy = 0;
  width = 0;
  height = 0;
  /** 正式房间给摇杆预留独立侧栏；灰盒仍沿用半屏操作。 */
  moveWidth: number | null = null;
  x: number = UI.joystick.homeInset;
  y: number = UI.joystick.homeInset;
  dx = 0;
  dy = 0;
  // Touch.identifier 是有符号编号，负数（包括 -1）也可能是有效触点。
  moveId: number | null = null;
  fireId: number | null = null;
  pauseId: number | null = null;
  pausePressed = false;
  private pressedAt = 0;
  private dragged = false;
  private firing = false;
  resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.reset();
  }
  reset(): void {
    this.moveId = this.fireId = this.pauseId = null;
    this.pausePressed = false;
    this.x = UI.joystick.homeInset;
    this.y = this.height - UI.joystick.homeInset;
    this.dx = this.dy = this.move.x = this.move.y = 0;
    this.clearAim();
  }
  down(id: number, x: number, y: number, now = performance.now()): boolean {
    if (
      Math.hypot(x - (this.width - UI.pause.inset), y - UI.pause.inset) <= UI.pause.hitRadius &&
      this.pauseId === null
    ) {
      this.pauseId = id;
      this.pausePressed = true;
      return true;
    }
    if (
      Math.hypot(x - (this.width - UI.aimWheel.inset), y - (this.height - UI.aimWheel.inset)) <=
      UI.aimWheel.radius + UI.aimWheel.hitPadding
    ) {
      // 右侧区域被占用时也不能把第二根手指分配给左摇杆。
      if (this.fireId !== null) return false;
      this.fireId = id;
      this.pressedAt = now;
      this.firing = false;
      this.drag(id, x, y);
      // 按下只是取得触点；等实际拖动，或给原地按住留出反应时间。
      this.dragged = false;
      return true;
    }
    if (
      x >= 0 &&
      x <= (this.moveWidth ?? this.width * UI.moveArea.widthFraction) &&
      y >= (this.moveWidth === null ? UI.moveArea.top : this.height / 2) &&
      y <= this.height &&
      this.moveId === null
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
    if (id === this.fireId) {
      this.dragged = true;
      const dx = x - (this.width - UI.aimWheel.inset),
        dy = y - (this.height - UI.aimWheel.inset),
        length = Math.hypot(dx, dy),
        scale = UI.aimWheel.radius / Math.max(UI.aimWheel.radius, length);
      this.fireDx = dx * scale;
      this.fireDy = dy * scale;
      this.aiming = length > UI.aimWheel.deadzone;
      this.aim.x = this.aiming ? dx / length : 0;
      this.aim.y = this.aiming ? dy / length : 0;
      return;
    }
    if (id !== this.moveId) return;
    const length = Math.hypot(x - this.x, y - this.y);
    if (length > UI.joystick.radius) {
      this.x = x - ((x - this.x) / length) * UI.joystick.radius;
      this.y = y - ((y - this.y) / length) * UI.joystick.radius;
    }
    this.x = clamp(
      this.x,
      UI.joystick.radius,
      Math.max(
        UI.joystick.radius,
        (this.moveWidth ?? this.width * UI.moveArea.widthFraction) - UI.joystick.radius,
      ),
    );
    this.y = clamp(
      this.y,
      this.moveWidth === null ? UI.joystick.homeInset : this.height / 2 + UI.joystick.radius,
      Math.max(UI.joystick.homeInset, this.height - UI.joystick.radius),
    );
    const n = Math.max(UI.joystick.radius, Math.hypot(x - this.x, y - this.y));
    this.dx = ((x - this.x) / n) * UI.joystick.radius;
    this.dy = ((y - this.y) / n) * UI.joystick.radius;
    stick(this.move, this.dx / UI.joystick.radius, this.dy / UI.joystick.radius, UI.deadzone);
  }
  up(id: number): void {
    if (id === this.moveId) {
      this.moveId = null;
      this.x = UI.joystick.homeInset;
      this.y = this.height - UI.joystick.homeInset;
      this.dx = this.dy = this.move.x = this.move.y = 0;
    }
    if (id === this.fireId) {
      this.fireId = null;
      this.clearAim();
    }
    if (id === this.pauseId) this.pauseId = null;
  }
  /** 与 aim 在同一次渲染帧采样；短促出圈又回中的事件不能提前发出朝向错误的第一发。 */
  sampleFire(now = performance.now()): boolean {
    if (this.fireId === null) return false;
    this.firing ||= (this.dragged && this.aiming) || now - this.pressedAt >= UI.aimWheel.firstShotDelayMs;
    return this.firing;
  }
  private clearAim(): void {
    this.firing = this.dragged = false;
    this.aiming = false;
    this.fireDx = this.fireDy = this.aim.x = this.aim.y = 0;
  }
}
