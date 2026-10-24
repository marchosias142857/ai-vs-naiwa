import { startAdventure } from './helpers/town';
import { expect, test } from '@playwright/test';
import { installPad, padButton } from './helpers/gamepad';

type AudioStats = { state: string; voices: number; ramps: number; suspends: number; resumes: number };
declare global {
  interface Window {
    audioStats: () => AudioStats | undefined;
  }
}

test('真实 AudioContext：手柄暂停仅静音，后台和退出才 suspend，回到游戏可重新发声', async ({ page }) => {
  await installPad(page);
  await page.addInitScript(() => {
    const records: AudioStats[] = [],
      Native = window.AudioContext;
    window.AudioContext = class extends Native {
      private readonly record: AudioStats;
      constructor(options?: AudioContextOptions) {
        super(options);
        const readState = () => this.state;
        this.record = {
          get state() {
            return readState();
          },
          voices: 0,
          ramps: 0,
          suspends: 0,
          resumes: 0,
        };
        records.push(this.record);
      }
      override createOscillator() {
        this.record.voices++;
        return super.createOscillator();
      }
      override createGain() {
        const node = super.createGain(),
          ramp = node.gain.linearRampToValueAtTime.bind(node.gain);
        node.gain.linearRampToValueAtTime = (value, endTime) => {
          this.record.ramps++;
          return ramp(value, endTime);
        };
        return node;
      }
      override suspend() {
        this.record.suspends++;
        return super.suspend();
      }
      override resume() {
        this.record.resumes++;
        return super.resume();
      }
    };
    window.audioStats = () => records.find((record) => record.voices === 8);
  });
  const stats = () => page.evaluate(() => window.audioStats()!);
  await page.goto('/?seed=42&god=1');
  await startAdventure(page); // 真实手势解锁；此后只用手柄。
  await page.waitForFunction(() => window.audioStats()?.state === 'running');
  await padButton(page, 7, true);
  await page.waitForFunction(() => (window.audioStats()?.ramps ?? 0) > 0);
  await padButton(page, 7, false);
  const before = await stats();
  await padButton(page, 9, true);
  await page.waitForFunction(() => window.__AVN__!.input!.manualPaused);
  await padButton(page, 9, false);
  const paused = await stats();
  expect(paused.state).toBe('running');
  expect(paused.suspends).toBe(before.suspends);
  await padButton(page, 0, true);
  await page.waitForFunction(() => !window.__AVN__!.input!.manualPaused);
  await padButton(page, 0, false);
  expect((await stats()).resumes).toBe(before.resumes);
  await padButton(page, 7, true);
  await page.waitForFunction((n) => window.audioStats()!.ramps > n, paused.ramps);
  await padButton(page, 7, false);
  // 模拟可见性事件验证接线；不冒充 Safari 的真实切后台行为。
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => window.audioStats()!.state === 'suspended');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.keyboard.press('Shift'); // 后台恢复若需要授权，给真实手势。
  await page.waitForFunction(() => window.audioStats()!.state === 'running');
  await page.keyboard.press('Escape');
  await page.locator('#pause-menu').click();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Menu');
  await page.waitForFunction(() => window.audioStats()!.state === 'suspended');
  await page.locator('#continue-run').click();
  await page.waitForFunction(() => window.audioStats()!.state === 'running');
  const reentered = await stats();
  await padButton(page, 7, true);
  await page.waitForFunction((n) => window.audioStats()!.ramps > n, reentered.ramps);
  await padButton(page, 7, false);
  expect((await stats()).voices).toBe(8);
});
