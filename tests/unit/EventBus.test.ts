import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/sim/core/EventBus';

interface TestEvents {
  ping: { n: number };
  other: { s: string };
}

describe('EventBus', () => {
  it('emit 会调用对应事件的监听器', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on('ping', fn);
    bus.emit('ping', { n: 1 });
    expect(fn).toHaveBeenCalledWith({ n: 1 });
  });

  it('不同事件互不影响', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on('other', fn);
    bus.emit('ping', { n: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('on() 返回的函数可以取消订阅', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    const off = bus.on('ping', fn);
    off();
    bus.emit('ping', { n: 1 });
    expect(fn).not.toHaveBeenCalled();
    expect(bus.listenerCount('ping')).toBe(0);
  });

  it('once() 只触发一次', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.once('ping', fn);
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('监听器在回调中取消订阅不会影响本次派发的其他监听器', () => {
    const bus = new EventBus<TestEvents>();
    const second = vi.fn();
    const off = bus.on('ping', () => off());
    bus.on('ping', second);
    bus.emit('ping', { n: 1 });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('clear() 移除全部监听器', () => {
    const bus = new EventBus<TestEvents>();
    bus.on('ping', vi.fn());
    bus.on('other', vi.fn());
    bus.clear();
    expect(bus.listenerCount('ping') + bus.listenerCount('other')).toBe(0);
  });
});

describe('EventBus 派发中修改监听器（Issue #27）', () => {
  it('派发中订阅的监听器本次不调用，下次调用', () => {
    const bus = new EventBus<TestEvents>();
    const late = vi.fn();
    let added = false;
    bus.on('ping', () => {
      if (!added) bus.on('ping', late);
      added = true;
    });
    bus.emit('ping', { n: 1 });
    expect(late).not.toHaveBeenCalled();
    bus.emit('ping', { n: 2 });
    expect(late).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledWith({ n: 2 });
  });

  it('派发中取消还没轮到的监听器：本次仍调用，下次不再调用', () => {
    const bus = new EventBus<TestEvents>();
    const second = vi.fn();
    bus.on('ping', () => bus.off('ping', second));
    bus.on('ping', second);
    bus.emit('ping', { n: 1 });
    expect(second).toHaveBeenCalledTimes(1);
    bus.emit('ping', { n: 2 });
    expect(second).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('ping')).toBe(1);
  });

  it('嵌套派发：回调里再发同一个事件，按顺序完整执行', () => {
    const bus = new EventBus<TestEvents>();
    const seen: string[] = [];
    bus.on('ping', ({ n }) => {
      seen.push(`a${n}`);
      if (n === 1) bus.emit('ping', { n: 2 });
    });
    bus.on('ping', ({ n }) => seen.push(`b${n}`));
    bus.emit('ping', { n: 1 });
    expect(seen).toEqual(['a1', 'a2', 'b2', 'b1']);
  });

  it('同一个函数重复订阅只调用一次，取消一次即移除', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on('ping', fn);
    bus.on('ping', fn);
    expect(bus.listenerCount('ping')).toBe(1);
    bus.emit('ping', { n: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
    bus.off('ping', fn);
    expect(bus.listenerCount('ping')).toBe(0);
  });

  // 只能证明派发不会改写存储的数组；emit 内部不做临时复制这一点靠实现本身（下标遍历）保证。
  it('监听器集合不变时，多次派发后存储的数组身份不变', () => {
    const bus = new EventBus<TestEvents>();
    bus.on('ping', vi.fn());
    const lists = (bus as unknown as { listeners: Map<string, unknown> }).listeners;
    const before = lists.get('ping');
    for (let i = 0; i < 100; i++) bus.emit('ping', { n: i });
    expect(lists.get('ping')).toBe(before);
  });
});
