export interface LifecycleCallbacks {
  onPauseChange(paused: boolean): void;
  unlockAudio(): void;
  /** M4 在 hidden 转换时接入局内快照；不能等到异步任务再保存。 */
  onHidden?(): void;
}

/** 只依赖浏览器；自动原因与手动原因合并，任一原因存在都保持暂停。 */
export class LifecycleService {
  private readonly listeners = new AbortController();
  private readonly gestures = new AbortController();
  private manualPaused = false;
  private hidden = false;
  private paused = false;

  constructor(
    private readonly overlay: HTMLElement,
    private readonly callbacks: LifecycleCallbacks,
  ) {
    const options = { signal: this.listeners.signal };
    window.addEventListener('resize', this.sync, options);
    window.addEventListener('orientationchange', this.sync, options);
    document.addEventListener('visibilitychange', this.sync, options);
    const gestureOptions = { signal: this.gestures.signal, capture: true, passive: true };
    // touchend/click 在 iOS 上属于有效手势；捕获阶段也覆盖 DOM 遮罩上的首次触摸。
    document.addEventListener('touchend', this.onGesture, gestureOptions);
    document.addEventListener('click', this.onGesture, gestureOptions);
    document.addEventListener('keydown', this.onGesture, gestureOptions);
    this.sync();
  }

  /** 供桥接层在 Phaser 首帧完成后同步初始暂停。 */
  get isPaused(): boolean {
    return this.paused;
  }

  /** M4 如需全局手动暂停，通过此入口持有独立原因；自动恢复不会清掉它。 */
  setManualPaused(paused: boolean): void {
    this.manualPaused = paused;
    this.sync();
  }

  /** 移除本实例的浏览器监听，不改变其他暂停来源。 */
  destroy(): void {
    this.listeners.abort();
    this.gestures.abort();
  }

  private readonly onGesture = (event: Event): void => {
    if (!event.isTrusted) return;
    this.gestures.abort();
    // 必须在原始手势回调里同步调用，不能 await、setTimeout 或转发异步事件。
    this.callbacks.unlockAudio();
  };

  private readonly sync = (): void => {
    const portrait = window.innerHeight > window.innerWidth;
    this.overlay.hidden = !portrait;
    const hidden = document.visibilityState === 'hidden';
    const enteredHidden = hidden && !this.hidden;
    this.hidden = hidden;
    const paused = portrait || hidden || this.manualPaused;
    if (paused !== this.paused) {
      this.paused = paused;
      this.callbacks.onPauseChange(paused);
    }
    if (enteredHidden) this.callbacks.onHidden?.();
  };
}
