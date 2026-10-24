import { INPUT_UI as UI } from '../fx/params';
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
  private edges = new Set<string>();
  private padStart = false;
  private padSkill = false;
  private padSwap = false;
  private padInteract = false;
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
    this.mouseFire = this.padStart = this.padSkill = this.padSwap = this.padInteract = false;
    this.padBlocked = true;
    resetInputFrame(this.frame);
  }

  /** 触屏动作按钮只注入边沿，不改变当前输入设备或持续移动/射击。 */
  action(code: 'Space' | 'KeyQ' | 'KeyE'): void {
    this.edges.add(code);
  }

  /** 每个 UI 帧调用一次；返回值的对象身份不变。 */
  sample(
    lx = 0,
    ly = 0,
    rx = 0,
    ry = 0,
    trigger = false,
    start = false,
    skill = false,
    swap = false,
    interact = false,
  ) {
    const f = resetInputFrame(this.frame);
    const active =
      Math.hypot(lx, ly) > UI.deadzone ||
      Math.hypot(rx, ry) > UI.deadzone ||
      trigger ||
      start ||
      skill ||
      swap ||
      interact;
    if (!active) this.padBlocked = false;
    if (active && !this.padBlocked) f.source = 'gamepad';
    if (f.source === 'gamepad' && !this.padBlocked) {
      stick(f.move, lx, ly, UI.deadzone);
      stick(this.aim, rx, ry, UI.deadzone);
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
    }
    f.skillPressed =
      this.edges.has('Space') || (f.source === 'gamepad' && !this.padBlocked && skill && !this.padSkill);
    f.swapPressed =
      this.edges.has('KeyQ') || (f.source === 'gamepad' && !this.padBlocked && swap && !this.padSwap);
    f.interactPressed =
      this.edges.has('KeyE') || (f.source === 'gamepad' && !this.padBlocked && interact && !this.padInteract);
    f.pausePressed ||= this.edges.has('Escape');
    this.edges.clear();
    this.padStart = start;
    this.padSkill = skill;
    this.padSwap = swap;
    this.padInteract = interact;
    return f;
  }
}
