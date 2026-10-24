export type PauseReason = 'manual' | 'lifecycle' | 'upgrade' | 'finished' | 'restore' | 'interaction';

/** 原因分别持有暂停；倒计时结束只释放 restore，输入清理由每次变更回调统一完成。 */
export class PauseState {
  private readonly reasons = new Set<PauseReason>();
  private deadline: number | null = null;
  remaining = 0;
  constructor(
    private readonly seconds: number,
    private readonly changed: (reason: PauseReason, active: boolean) => void,
    private readonly now: () => number = () => performance.now(),
  ) {}
  get blocked(): boolean {
    return this.reasons.size > 0;
  }
  has(reason: PauseReason): boolean {
    return this.reasons.has(reason);
  }
  set(reason: PauseReason, active: boolean): void {
    if (this.has(reason) === active) return;
    if (active) this.reasons.add(reason);
    else this.reasons.delete(reason);
    if (this.has('restore')) {
      this.remaining = this.seconds;
      // 在生命周期解除的同步回调里就设置新截止点，不能等 wake 的首帧之后。
      this.deadline = this.reasons.size === 1 ? this.now() + this.seconds * 1000 : null;
    } else {
      this.remaining = 0;
      this.deadline = null;
    }
    this.changed(reason, active);
  }
  update(): void {
    if (this.deadline === null) return;
    this.remaining = Math.max(0, (this.deadline - this.now()) / 1000);
    if (this.remaining === 0) this.set('restore', false);
  }
}
