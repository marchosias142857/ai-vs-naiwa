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
