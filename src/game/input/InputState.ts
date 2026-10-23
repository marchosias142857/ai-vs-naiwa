import { createInputFrame, resetInputFrame } from '../../sim/core/types';
import type { Vec2 } from '../../sim/core/types';

/** 写入复用向量；径向死区避免斜向加速，同时保留模拟量。 */
export function stick(out: Vec2, x: number, y: number, deadzone = 0): void {
  const length = Math.hypot(x, y);
  const magnitude = length <= deadzone ? 0 : Math.min(1, (length - deadzone) / (1 - deadzone));
  out.x = length ? (x / length) * magnitude : 0;
  out.y = length ? (y / length) * magnitude : 0;
}

/** 输入边沿与复用快照；不包含浏览器或 Phaser 依赖。 */
export class InputState {
  readonly frame = createInputFrame();
  readonly aim = { x: 0, y: 0 };
  readonly keys = new Set<string>();
  mouseFire = false;
  mouseAim = false;
  private edges = new Set<string>();
  private padStart = false;
  private padBlocked = true;

  key(code: string, down: boolean, repeat = false): void {
    if (down && !repeat && !this.keys.has(code)) {
      this.keys.add(code);
      this.edges.add(code);
      this.frame.source = 'keyboard';
    } else if (!down) this.keys.delete(code);
  }

  /** 清空并锁住仍按着的手柄，直到观察到一次完全中立。 */
  reset(): void {
    this.keys.clear();
    this.edges.clear();
    this.mouseFire = this.mouseAim = this.padStart = false;
    this.padBlocked = true;
    resetInputFrame(this.frame);
  }

  /** 每个 UI 帧调用一次；返回值的对象身份不变。 */
  sample(lx = 0, ly = 0, rx = 0, ry = 0, trigger = false, start = false) {
    const f = resetInputFrame(this.frame);
    const active = Math.hypot(lx, ly) > 0.12 || Math.hypot(rx, ry) > 0.12 || trigger || start;
    if (!active) this.padBlocked = false;
    if (active && !this.padBlocked) f.source = 'gamepad';
    if (f.source === 'gamepad' && !this.padBlocked) {
      stick(f.move, lx, ly, 0.12);
      stick(this.aim, rx, ry, 0.12);
      if (this.aim.x || this.aim.y) {
        stick(this.aim, this.aim.x, this.aim.y);
        const n = Math.hypot(this.aim.x, this.aim.y);
        this.aim.x /= n;
        this.aim.y /= n;
        f.aim = this.aim;
      }
      f.fire = trigger;
      f.pausePressed = start && !this.padStart;
    } else if (f.source === 'keyboard') {
      stick(
        f.move,
        Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
          Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')),
        Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) -
          Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')),
      );
      f.fire = this.mouseFire;
      if (this.mouseAim) f.aim = this.aim;
    }
    f.skillPressed = this.edges.has('Space');
    f.swapPressed = this.edges.has('KeyQ');
    f.interactPressed = this.edges.has('KeyE');
    f.pausePressed ||= this.edges.has('Escape');
    this.edges.clear();
    this.padStart = start;
    return f;
  }
}
