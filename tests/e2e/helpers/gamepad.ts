import type { Page } from '@playwright/test';
export type PadWindow = Window & { setPadButton?: (index: number, down: boolean) => void };
export async function installPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pad = {
      id: 'demo controller',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 1,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
    (window as PadWindow).setPadButton = (index, down) => {
      pad.buttons[index] = { pressed: down, touched: down, value: Number(down) };
      pad.timestamp = performance.now();
    };
  });
}
export async function padButton(page: Page, index: number, down: boolean): Promise<void> {
  await page.evaluate(({ index, down }) => (window as PadWindow).setPadButton!(index, down), { index, down });
  // 松开必须经过采样帧，不能在同帧先放开再按另一键。
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}
