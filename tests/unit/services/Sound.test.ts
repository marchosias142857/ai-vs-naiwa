import { afterEach, expect, it, vi } from 'vitest';
import { settings } from '../../../src/services/settings';
import {
  destroySound,
  playSound,
  silenceSound,
  unlockSound,
  pauseSound,
  continueSound,
  suspendSound,
} from '../../../src/services/Sound';
afterEach(() => {
  destroySound();
  vi.unstubAllGlobals();
});
it('8 个音频声部预热后反复复用；静音和后台不发声', () => {
  let nodes = 0,
    scheduled = 0,
    now = 0,
    suspended = 0,
    resumed = 0,
    audioState = 'running';
  const document = new EventTarget() as EventTarget & { hidden: boolean };
  document.hidden = false;
  vi.stubGlobal('document', document);
  const param = () => ({
    value: 0,
    cancelScheduledValues() {},
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {
      scheduled++;
    },
  });
  vi.stubGlobal(
    'AudioContext',
    class {
      get state() {
        return audioState;
      }
      destination = {};
      get currentTime() {
        return now;
      }
      createOscillator() {
        nodes++;
        return { frequency: param(), type: '', connect() {}, start() {} };
      }
      createGain() {
        nodes++;
        return { gain: param(), connect() {} };
      }
      suspend() {
        suspended++;
        audioState = 'suspended';
        return Promise.resolve();
      }
      resume() {
        resumed++;
        audioState = 'running';
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    },
  );
  settings.sound = true;
  unlockSound();
  expect(nodes).toBe(16);
  for (let i = 0; i < 1000; i++) {
    now += 0.1;
    unlockSound();
    playSound('shot');
    playSound('hit');
  }
  expect(nodes).toBe(16);
  expect(scheduled).toBe(2000);
  settings.sound = false;
  playSound('shot');
  expect(scheduled).toBe(2000);
  settings.sound = true;
  document.hidden = true;
  playSound('hurt');
  expect(scheduled).toBe(2000);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(suspended).toBe(1);
  document.hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  expect(resumed).toBe(1);
  // 游戏内暂停（即使先收到真实手势）不会 suspend/resume，也不会调度声音。
  now += 1;
  pauseSound();
  unlockSound();
  playSound('shot');
  expect(scheduled).toBe(2000);
  expect(suspended).toBe(1);
  expect(resumed).toBe(1);
  continueSound(); // 手柄恢复：无需用户手势，不依赖 resume。
  playSound('shot');
  expect(scheduled).toBe(2001);
  expect(resumed).toBe(1);
  audioState = 'interrupted';
  continueSound();
  expect(resumed).toBe(2);
  silenceSound();
  expect(suspended).toBe(1);
  // 退出场景才 suspend；下一次菜单手势先于新场景 create，旧 paused 不应阻止解锁。
  pauseSound();
  suspendSound();
  expect(suspended).toBe(2);
  unlockSound();
  expect(resumed).toBe(3);
  now += 1;
  playSound('shot');
  expect(scheduled).toBe(2001);
  continueSound();
  playSound('shot');
  expect(scheduled).toBe(2002);
  expect(nodes).toBe(16);
  destroySound();
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  expect(suspended).toBe(2);
});
