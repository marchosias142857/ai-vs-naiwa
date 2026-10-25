import { UI_LAYOUT_CHANGED, uiEditor, uiRect } from '../../services/uiLayout';
import { INPUT_UI as UI } from '../fx/params';
import { Math as PhaserMath } from 'phaser';
import type { Input, Scene } from 'phaser';
import { resetInputFrame } from '../../sim/core/types';
import { InputState } from './InputState';
import { TouchState } from './TouchState';
import { combatPause } from '../world/combatPause';

const CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'KeyQ',
  'KeyE',
  'Escape',
]);
/** UI 场景拥有输入；战斗场景只读取 frame。所有 DOM 监听随场景销毁。 */
export class InputController {
  readonly state = new InputState();
  readonly touch = new TouchState();
  readonly worldPointer = new PhaserMath.Vector2();
  readonly mouse = { x: 0, y: 0 };
  readonly abort = new AbortController();
  rect: DOMRect;
  private readonly canvas: HTMLCanvasElement;
  private readonly coarse = matchMedia('(pointer: coarse)');
  // 手机直接按 Touch.identifier 管理多指，不依赖浏览器的 Pointer Capture 生命周期。
  private readonly nativeTouch = 'ontouchstart' in window;
  private mouseInside = false;
  private sampledFrame = -1;
  private configuredPad?: Input.Gamepad.Gamepad;
  get frame() {
    return this.state.frame;
  }
  get touchVisible() {
    return this.coarse.matches || this.frame.source === 'touch';
  }
  get manualPaused(): boolean {
    return combatPause(this.battle)?.has('manual') ?? this.battle.scene.isPaused();
  }
  constructor(
    private readonly ui: Scene,
    readonly battle: Scene,
    private readonly togglePause: () => void,
    private readonly customLayout = false,
  ) {
    this.canvas = ui.game.canvas;
    this.rect = this.canvas.getBoundingClientRect();
    const options = { signal: this.abort.signal };
    window.addEventListener(
      'keydown',
      (e) => {
        if (!CODES.has(e.code) || !ui.game.input.enabled) return;
        if (
          e.code !== 'Escape' &&
          e.target instanceof HTMLElement &&
          e.target.closest('button,input,textarea')
        )
          return;
        e.preventDefault();
        this.state.key(e.code, true, e.repeat);
      },
      options,
    );
    window.addEventListener('keyup', (e) => this.state.key(e.code, false), options);
    if (this.nativeTouch) {
      const touchOptions = { ...options, passive: false };
      this.canvas.addEventListener('touchstart', (e) => this.touches(e, true), touchOptions);
      window.addEventListener('touchmove', (e) => this.touches(e, false), touchOptions);
      const release = (e: TouchEvent) => {
        for (const t of e.changedTouches) this.touch.up(t.identifier);
      };
      window.addEventListener('touchend', release, options);
      window.addEventListener('touchcancel', release, options);
    }
    this.canvas.addEventListener('pointerdown', (e) => this.pointer(e, true), options);
    this.canvas.addEventListener('pointermove', (e) => this.pointer(e, false), options);
    window.addEventListener('pointerup', (e) => this.releasePointer(e), options);
    this.canvas.addEventListener('pointercancel', (e) => this.releasePointer(e), options);
    this.canvas.addEventListener('lostpointercapture', (e) => this.releasePointer(e), options);
    this.canvas.addEventListener(
      'pointerleave',
      () => {
        this.mouseInside = false;
      },
      options,
    );
    window.addEventListener('blur', this.reset, options);
    document.addEventListener('visibilitychange', this.reset, options);
    window.addEventListener('resize', this.resize, options);
    window.addEventListener(UI_LAYOUT_CHANGED, this.resize, options);
    window.addEventListener('orientationchange', this.orientation, options);
    window.visualViewport?.addEventListener('resize', this.resize, options);
    ui.scale.on('resize', this.resize);
    this.resize();
  }
  readonly reset = () => {
    this.state.reset();
    this.touch.reset();
    this.mouseInside = false;
  };
  private readonly orientation = () => {
    this.reset();
    this.resize();
  };
  readonly resize = () => {
    this.rect = this.canvas.getBoundingClientRect();
    if (this.touch.width !== this.rect.width || this.touch.height !== this.rect.height) {
      this.reset();
      this.touch.resize(this.rect.width, this.rect.height);
    }
    if (this.customLayout) {
      this.reset();
      this.touch.configure(
        uiRect('move', this.rect.width, this.rect.height),
        uiRect('fire', this.rect.width, this.rect.height),
      );
    }
    document.documentElement.style.setProperty('--game-canvas-top', `${this.rect.top}px`);
  };
  private releasePointer(e: PointerEvent): void {
    // 兼容鼠标的 pointerId 可能与原生 Touch.identifier 相同，不能释放另一根手指。
    if (e.pointerType === 'mouse') this.state.mouseFire = false;
    else if (!this.nativeTouch || e.pointerType !== 'touch') this.touch.up(e.pointerId);
  }
  private pointer(e: PointerEvent, down: boolean): void {
    if (!this.ui.game.input.enabled || uiEditor.open) return;
    if (this.nativeTouch && e.pointerType === 'touch') return;
    const x = e.clientX - this.rect.left,
      y = e.clientY - this.rect.top;
    if (e.pointerType === 'mouse') {
      // 触点持有轮盘时，兼容鼠标事件不能夺走设备所有权而静默停止开火。
      if (this.touch.moveId !== null || this.touch.fireId !== null) return;
      this.mouse.x = x;
      this.mouse.y = y;
      const camera = this.battle.cameras.main;
      const scale = this.rect.width / this.ui.scale.width;
      this.mouseInside =
        x >= camera.x * scale &&
        x < (camera.x + camera.width) * scale &&
        y >= camera.y * scale &&
        y < (camera.y + camera.height) * scale;
      this.state.frame.source = 'keyboard';
      if (!this.mouseInside) this.state.mouseFire = false;
      else if (down && e.button === 0) this.state.mouseFire = true;
    } else {
      this.state.frame.source = 'touch';
      if (down) {
        if (
          this.manualPaused &&
          Math.hypot(x - this.rect.width / 2, y - this.rect.height / 2) <= UI.resume.radius
        ) {
          this.togglePause();
          return;
        }
        if (this.touch.down(e.pointerId, x, y)) this.canvas.setPointerCapture(e.pointerId);
      } else this.touch.drag(e.pointerId, x, y);
    }
    // 暂停键也允许鼠标点按，保持桌面恢复入口可见。
    if (
      down &&
      e.pointerType === 'mouse' &&
      (Math.hypot(x - (this.rect.width - UI.pause.inset), y - UI.pause.inset) <= UI.pause.hitRadius ||
        (this.manualPaused &&
          Math.hypot(x - this.rect.width / 2, y - this.rect.height / 2) <= UI.resume.radius))
    )
      this.togglePause();
  }
  private touches(e: TouchEvent, down: boolean): void {
    if (!this.ui.game.input.enabled || uiEditor.open) return;
    let handled = false;
    for (const t of e.changedTouches) {
      const x = t.clientX - this.rect.left,
        y = t.clientY - this.rect.top;
      if (down) {
        if (
          this.manualPaused &&
          Math.hypot(x - this.rect.width / 2, y - this.rect.height / 2) <= UI.resume.radius
        ) {
          this.togglePause();
          handled = true;
        } else handled = this.touch.down(t.identifier, x, y) || handled;
      } else if (
        t.identifier === this.touch.moveId ||
        t.identifier === this.touch.fireId ||
        t.identifier === this.touch.pauseId
      ) {
        this.touch.drag(t.identifier, x, y);
        handled = true;
      }
    }
    if (handled) {
      this.state.frame.source = 'touch';
      if (e.cancelable) e.preventDefault();
    }
  }
  /** 世界坐标原点由玩家位置提供，默认灰盒中心仅用于输入验收。 */
  sample(playerX: number, playerY: number) {
    if (uiEditor.open) {
      this.reset();
      return this.frame;
    }
    if (this.sampledFrame === this.ui.game.loop.frame) return this.frame;
    this.sampledFrame = this.ui.game.loop.frame;
    const pad = this.ui.input.gamepad?.pad1;
    if (pad && pad !== this.configuredPad) {
      pad.setAxisThreshold(0);
      this.configuredPad = pad;
    }
    const f = this.state.sample(
      pad?.connected ? pad.leftStick.x : 0,
      pad?.connected ? pad.leftStick.y : 0,
      pad?.connected ? pad.rightStick.x : 0,
      pad?.connected ? pad.rightStick.y : 0,
      !!pad?.connected && pad.R2 > 0.5,
      !!pad?.connected && !!pad.buttons[UI.gamepad.pause]?.pressed,
      !!pad?.connected && !!pad.buttons[UI.gamepad.skill]?.pressed,
      !!pad?.connected && !!pad.buttons[UI.gamepad.swap]?.pressed,
      !!pad?.connected && !!pad.buttons[UI.gamepad.confirm]?.pressed,
    );
    if (this.touch.moveId !== null || this.touch.fireId !== null) f.source = 'touch';
    if (f.source === 'keyboard' && this.mouseInside) {
      const scale = this.rect.width / this.ui.scale.width;
      this.battle.cameras.main.getWorldPoint(this.mouse.x / scale, this.mouse.y / scale, this.worldPointer);
      const dx = this.worldPointer.x - playerX,
        dy = this.worldPointer.y - playerY,
        n = Math.hypot(dx, dy);
      this.state.aim.x = n ? dx / n : 0;
      this.state.aim.y = n ? dy / n : 0;
      f.aim = n ? this.state.aim : null;
    }
    if (f.source === 'touch') {
      f.move.x = this.touch.move.x;
      f.move.y = this.touch.move.y;
      f.fire = this.touch.sampleFire();
      f.aim = this.touch.aiming ? this.touch.aim : null;
    }
    f.pausePressed ||= this.touch.pausePressed;
    this.touch.pausePressed = false;
    if (f.pausePressed) this.togglePause();
    if (this.manualPaused || combatPause(this.battle)?.blocked) resetInputFrame(f);
    return f;
  }
  destroy(): void {
    this.abort.abort();
    this.ui.scale.off('resize', this.resize);
    this.reset();
    this.canvas.style.cursor = '';
  }
}
