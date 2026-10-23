/**
 * 类型安全的同步事件总线。系统之间通过它通信，不直接互相调用。
 *
 *   const bus = new EventBus<GameEvents>();
 *   const off = bus.on('room:cleared', ({ roomId }) => { ... });
 *   bus.emit('room:cleared', { roomId: 'r1' });
 *   off(); // 取消订阅（场景销毁时务必调用，或用 bus.clear()）
 */
export type Listener<P> = (payload: P) => void;

export class EventBus<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(name: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(listener as Listener<never>);
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
    this.listeners.get(name)?.delete(listener as Listener<never>);
  }

  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    const set = this.listeners.get(name);
    if (!set) return;
    // 复制一份，允许监听器在回调里取消订阅。
    for (const listener of [...set]) (listener as Listener<Events[K]>)(payload);
  }

  listenerCount(name: keyof Events): number {
    return this.listeners.get(name)?.size ?? 0;
  }

  clear(): void {
    this.listeners.clear();
  }
}
