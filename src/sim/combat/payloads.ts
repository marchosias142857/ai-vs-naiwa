/**
 * 事件 payload 的复用栈（ADR 0002：监听器不能在回调之外保存 payload）。
 *
 * 每种事件一个栈。发送时按当前「同步重入深度」取一个对象：监听器在回调里再触发同一种事件时，
 * 内层用下一层的对象，外层监听器手里的 payload 不会被改写。深度超过预热数量时才新建（只在第一次发生）。
 */
export class PayloadStack<T extends object> {
  private readonly items: T[] = [];
  private depth = 0;

  constructor(
    private readonly create: () => T,
    prewarm = 4,
  ) {
    for (let i = 0; i < prewarm; i++) this.items.push(create());
  }

  /** 取得本层的 payload。必须与 `release` 成对调用（用 try / finally）。 */
  acquire(): T {
    let item = this.items[this.depth];
    if (!item) {
      item = this.create();
      this.items[this.depth] = item;
    }
    this.depth++;
    return item;
  }

  release(): void {
    this.depth--;
  }
}
