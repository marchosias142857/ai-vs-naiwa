import { INPUT_UI as UI } from '../../src/game/fx/params';
import { expect, test } from '@playwright/test';

test('键鼠、暂停恢复、后台清空；更新提示在暂停键下方', async ({ page }, info) => {
  await page.goto('/?scene=Game&seed=42');
  await page.waitForFunction(() => window.__AVN__?.input);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.move.x)).toBeCloseTo(Math.SQRT1_2);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.manualPaused)).toBe(true);
  expect(await page.evaluate(() => window.__AVN__!.input!.move)).toEqual({ x: 0, y: 0 });
  await page.screenshot({ path: info.outputPath('input-pause.png') });
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.manualPaused)).toBe(false);
  expect(await page.evaluate(() => window.__AVN__!.input!.move)).toEqual({ x: 0, y: 0 });
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(false);
  await page.mouse.up();
  await page.locator('#pwa-update').evaluate((e) => {
    (e as HTMLElement).hidden = false;
  });
  const update = (await page.locator('#pwa-update').boundingBox())!;
  expect(update.y).toBeGreaterThanOrEqual(box.y + 55);
});

test('触屏多指移动和射击互不串扰，取消释放；CSS 大小与缩放', async ({ page, context, isMobile }, info) => {
  test.skip(!isMobile);
  await page.goto('/?scene=Game&seed=42');
  await page.waitForFunction(() => window.__AVN__?.input);
  const b = (await page.locator('canvas').boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const move = { x: b.x + UI.joystick.homeInset, y: b.y + b.height - UI.joystick.homeInset, id: 1 };
  const fire = { x: b.x + b.width - UI.fire.inset, y: b.y + b.height - UI.fire.inset, id: 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move, fire] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...move, x: move.x + UI.joystick.radius * 0.8 }, fire],
  });
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.move.x)).toBeGreaterThan(0.5);
  expect(await page.evaluate(() => window.__AVN__!.input!.aim)).toBeNull();
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.move.x)).toBeGreaterThan(0.5);
  await page.screenshot({ path: info.outputPath('input-touch.png') });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [{ ...move, x: move.x + UI.joystick.radius * 0.8 }],
  });
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.move.x)).toBe(0);
  expect(await page.evaluate(() => window.__AVN__!.input!.fire)).toBe(true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(false);
});

test('Phaser 手柄插件：摇杆、RT、Start 与断连清零', async ({ page }) => {
  await page.addInitScript(() => {
    const pad = {
      id: 'test controller',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 1,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => (pad.connected ? [pad] : []) });
    window.addEventListener('test-pad', (e) => {
      const d = (e as CustomEvent).detail as {
        axes?: number[];
        rt?: boolean;
        start?: boolean;
        connected?: boolean;
      };
      if (d.axes) pad.axes = d.axes;
      if (d.connected !== undefined) pad.connected = d.connected;
      for (const [index, down] of [
        [7, d.rt],
        [9, d.start],
      ] as const)
        if (down !== undefined) pad.buttons[index] = { pressed: down, touched: down, value: Number(down) };
      pad.timestamp = performance.now();
    });
  });
  await page.goto('/?scene=Game&seed=42');
  await page.waitForFunction(() => window.__AVN__?.input);
  await page.waitForTimeout(100);
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('test-pad', { detail: { axes: [1, 1, 0, 1], rt: true } })),
  );
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.source)).toBe('gamepad');
  expect(await page.evaluate(() => window.__AVN__!.input!.aim)).toEqual({ x: 0, y: 1 });
  expect(await page.evaluate(() => window.__AVN__!.input!.fire)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('test-pad', { detail: { start: true } })));
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.manualPaused)).toBe(true);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('test-pad', { detail: { axes: [0, 0, 0, 0], rt: false, start: false } }),
    ),
  );
  await page.waitForTimeout(100);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('test-pad', { detail: { start: true } })));
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.manualPaused)).toBe(false);
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('test-pad', { detail: { connected: false } })),
  );
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(false);
});
