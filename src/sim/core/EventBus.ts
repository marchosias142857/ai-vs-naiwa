/**
 * 类型安全的同步事件总线。系统之间通过它通信，不直接互相调用。
 *
 *   const bus = new EventBus<GameEvents>();
 *   const off = bus.on('room:cleared', ({ roomId }) => { ... });
 *   bus.emit('room:cleared', { roomId: 'r1' });
 *   off(); // 取消订阅（场景销毁时务必调用，或用 bus.clear()）
 *
 * 派发语义：`emit` 开始时的监听器列表就是本次要调用的全部监听器。回调里订阅的新监听器从下一次派发起生效；
 * 回调里取消订阅的监听器，如果本次还没轮到，本次仍会被调用，下一次起不再调用。
 */
export type Listener<P> = (payload: P) => void;

export class EventBus<Events extends object> {
  /**
   * 每个事件一个监听器数组，写时复制：`on` / `off` 总是换成新数组，从不原地修改。
   * 这样 `emit` 直接遍历当前数组即可得到「派发开始时」的快照，热路径上不需要复制（Issue #27）。
   * 订阅和取消订阅很少发生，分配放在那里。
   */
  private listeners = new Map<keyof Events, readonly Listener<never>[]>();

  on<K extends keyof Events>(name: K, listener: Listener<Events[K]>): () => void {
    const list = this.listeners.get(name) ?? [];
    const fn = listener as Listener<never>;
    // 与 Set 的旧行为一致：同一个函数重复订阅只算一次。
    if (!list.includes(fn)) this.listeners.set(name, [...list, fn]);
    return () => this.off(name, listener);
  }

  once<K extends keyof Events>(name: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(name, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  off<K extends keyof Events>(name: K, listener: Listener<Events[K]>): void {
    const list = this.listeners.get(name);
    if (!list) return;
    const index = list.indexOf(listener as Listener<never>);
    if (index < 0) return;
    if (list.length === 1) this.listeners.delete(name);
    else this.listeners.set(name, [...list.slice(0, index), ...list.slice(index + 1)]);
  }

  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    const list = this.listeners.get(name);
    if (!list) return;
    // 用下标遍历，不创建迭代器；回调里的 on / off 换的是新数组，不影响这里的 list。
    for (let i = 0; i < list.length; i++) (list[i] as Listener<Events[K]>)(payload);
  }

  listenerCount(name: keyof Events): number {
    return this.listeners.get(name)?.length ?? 0;
  }

  clear(): void {
    this.listeners.clear();
  }
}
