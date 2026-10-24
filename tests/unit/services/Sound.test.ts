import { afterEach, expect, it, vi } from 'vitest';
import { settings } from '../../../src/services/settings';
import {
  destroySound,
  playSound,
  silenceSound,
  unlockSound,
  pauseSound,
  continueSound,
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
  pauseSound();
  unlockSound();
  expect(resumed).toBe(1);
  continueSound();
  expect(resumed).toBe(2);
  audioState = 'interrupted';
  continueSound();
  expect(resumed).toBe(3);
  expect(() => silenceSound()).not.toThrow();
});
