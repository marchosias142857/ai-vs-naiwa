import { afterEach, expect, it, vi } from 'vitest';
import { settings } from '../../../src/services/settings';
import { destroySound, playSound, silenceSound, unlockSound } from '../../../src/services/Sound';
afterEach(() => {
  destroySound();
  vi.unstubAllGlobals();
});
it('8 个音频声部预热后反复复用；静音和后台不发声', () => {
  let nodes = 0,
    scheduled = 0,
    now = 0;
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
      state = 'running';
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
  expect(() => silenceSound()).not.toThrow();
});
