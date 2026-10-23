import { EventEmitter } from 'node:events';
import type { Game } from 'phaser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindLifecycle } from '../../../src/game/bindLifecycle';
import { LifecycleService } from '../../../src/services/LifecycleService';

const audio = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/unlockAudio', () => ({ unlockAudio: audio }));
let touchScreen: EventTarget & { matches: boolean };
let win: EventTarget & {
  innerWidth: number;
  innerHeight: number;
  matchMedia: (query: string) => typeof touchScreen;
};
let doc: EventTarget & { visibilityState: string; querySelector: () => HTMLElement };
let overlay: HTMLElement;
let lifecycle: LifecycleService;

beforeEach(() => {
  overlay = { hidden: true } as HTMLElement;
  touchScreen = Object.assign(new EventTarget(), { matches: true });
  win = Object.assign(new EventTarget(), {
    innerWidth: 900,
    innerHeight: 400,
    matchMedia: vi.fn(() => touchScreen),
  });
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible', querySelector: () => overlay });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  audio.mockReset();
});
afterEach(() => {
  lifecycle?.destroy();
  vi.unstubAllGlobals();
});
const rotate = (portrait: boolean) => {
  win.innerHeight = portrait ? 1000 : 400;
  win.dispatchEvent(new Event('resize'));
};
const visibility = (hidden: boolean) => {
  doc.visibilityState = hidden ? 'hidden' : 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
};
const touchMode = (matches: boolean) => {
  touchScreen.matches = matches;
  touchScreen.dispatchEvent(new Event('change'));
};

it('桌面竖窗口正常运行，后台和手动暂停仍生效', () => {
  touchScreen.matches = false;
  rotate(true);
  const pause = vi.fn();
  lifecycle = new LifecycleService(overlay, { onPauseChange: pause, unlockAudio: audio });
  expect(win.matchMedia).toHaveBeenCalledWith('(pointer: coarse) and (hover: none)');
  expect(overlay.hidden).toBe(true);
  expect(lifecycle.isPaused).toBe(false);
  visibility(true);
  expect(lifecycle.isPaused).toBe(true);
  lifecycle.setManualPaused(true);
  visibility(false);
  expect(lifecycle.isPaused).toBe(true);
  lifecycle.setManualPaused(false);
  expect(pause.mock.calls).toEqual([[true], [false]]);
});

it('输入模式变化立即更新遮罩，不能清除手动或后台暂停原因', () => {
  touchScreen.matches = false;
  rotate(true);
  lifecycle = new LifecycleService(overlay, { onPauseChange: vi.fn(), unlockAudio: audio });
  touchMode(true);
  expect(overlay.hidden).toBe(false);
  expect(lifecycle.isPaused).toBe(true);
  touchMode(false);
  expect(overlay.hidden).toBe(true);
  expect(lifecycle.isPaused).toBe(false);
  lifecycle.setManualPaused(true);
  touchMode(true);
  touchMode(false);
  expect(lifecycle.isPaused).toBe(true);
  lifecycle.setManualPaused(false);
  visibility(true);
  touchMode(true);
  touchMode(false);
  expect(lifecycle.isPaused).toBe(true);
  visibility(false);
  expect(lifecycle.isPaused).toBe(false);
});

it('自动原因重叠时保持暂停，恢复前台和横屏不清除手动原因', () => {
  const pause = vi.fn();
  const snapshot = vi.fn();
  lifecycle = new LifecycleService(overlay, { onPauseChange: pause, unlockAudio: audio, onHidden: snapshot });
  rotate(true);
  visibility(true);
  rotate(false);
  expect(lifecycle.isPaused).toBe(true);
  expect(pause.mock.calls).toEqual([[true]]);
  expect(snapshot).toHaveBeenCalledTimes(1);
  lifecycle.setManualPaused(true);
  visibility(false);
  expect(lifecycle.isPaused).toBe(true);
  lifecycle.setManualPaused(false);
  expect(pause.mock.calls).toEqual([[true], [false]]);
});

it.each(['touchend', 'click', 'keydown'])(
  '%s 在首个可信手势的同一调用栈内解锁一次，并移除全部手势监听',
  (type) => {
    lifecycle = new LifecycleService(overlay, { onPauseChange: vi.fn(), unlockAudio: audio });
    doc.dispatchEvent(new Event(type));
    expect(audio).not.toHaveBeenCalled();
    for (const name of [type, 'touchend', 'click', 'keydown']) {
      const event = new Event(name);
      Object.defineProperty(event, 'isTrusted', { value: true });
      doc.dispatchEvent(event);
      // 若钩子被 Promise/计时器延迟，这里会立即失败。
      expect(audio).toHaveBeenCalledTimes(1);
    }
  },
);

it('销毁后不再处理方向、输入模式、可见性或音频手势', () => {
  const pause = vi.fn();
  lifecycle = new LifecycleService(overlay, { onPauseChange: pause, unlockAudio: audio });
  lifecycle.destroy();
  rotate(true);
  touchMode(false);
  touchMode(true);
  visibility(true);
  const event = new Event('click');
  Object.defineProperty(event, 'isTrusted', { value: true });
  doc.dispatchEvent(event);
  expect(pause).not.toHaveBeenCalled();
  expect(audio).not.toHaveBeenCalled();
});

describe('Phaser 桥接层', () => {
  const engine = () => {
    const loop = {
      started: true,
      running: true,
      frame: 1,
      sleep: vi.fn(() => {
        loop.running = false;
      }),
      resetDelta: vi.fn(),
      wake: vi.fn(() => {
        loop.running = true;
      }),
    };
    const scene = {
      input: { keyboard: { resetKeys: vi.fn() } },
      time: { now: 100 },
      tweens: { startTime: 100, prevTime: 200 },
      resume: vi.fn(),
    };
    const game = {
      loop,
      events: new EventEmitter(),
      isPaused: true,
      resume: vi.fn(),
      input: { enabled: true, keyboard: { enabled: false }, pointers: [{ reset: vi.fn() }] },
      scene: { getScenes: () => [scene] },
    };
    return { game, scene };
  };

  it('停止整个循环，清理输入；先 resetDelta 再 wake，保留外部 Game/Scene 暂停和原输入状态', () => {
    const { game, scene } = engine();
    lifecycle = bindLifecycle(game as unknown as Game);
    rotate(true);
    expect(game.loop.running).toBe(false);
    expect(game.input.enabled).toBe(false);
    expect(scene.input.keyboard.resetKeys).toHaveBeenCalledOnce();
    rotate(false);
    expect(game.loop.running).toBe(true);
    expect(game.loop.resetDelta.mock.invocationCallOrder[0]).toBeLessThan(
      game.loop.wake.mock.invocationCallOrder[0]!,
    );
    expect(game.input.enabled).toBe(true);
    expect(game.input.keyboard.enabled).toBe(false);
    expect(scene.tweens.prevTime - scene.tweens.startTime).toBe(100);
    expect(game.isPaused).toBe(true);
    expect(game.resume).not.toHaveBeenCalled();
    expect(scene.resume).not.toHaveBeenCalled();
  });

  it('不唤醒本来就被其他模块停止的循环', () => {
    const { game } = engine();
    game.loop.running = false;
    lifecycle = bindLifecycle(game as unknown as Game);
    rotate(true);
    rotate(false);
    expect(game.loop.wake).not.toHaveBeenCalled();
  });

  it('竖屏冷启动在 Phaser 启动后的首帧末尾停止循环', () => {
    const { game } = engine();
    game.loop.started = false;
    rotate(true);
    lifecycle = bindLifecycle(game as unknown as Game);
    expect(game.loop.sleep).not.toHaveBeenCalled();
    game.loop.started = true;
    game.events.emit('postrender');
    expect(game.loop.sleep).toHaveBeenCalledOnce();
    expect(overlay.hidden).toBe(false);
  });
});
