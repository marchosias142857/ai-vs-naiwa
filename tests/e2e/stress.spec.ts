import { startAdventure } from './helpers/town';
import { INPUT_UI } from '../../src/game/fx/params';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installPad, padButton } from './helpers/gamepad';

for (const mode of ['1', 'combat']) {
  test(`stress=${mode}：混合怪、柱子、测量导出与退出清理`, async ({ page, context }, info) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await installPad(page);
    await page.goto(`/?stress=${mode}&seed=42`);
    const panel = page.locator('#stress-panel');
    await expect(panel).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
    await padButton(page, 7, true);
    await page.waitForFunction(
      (seconds) => {
        const data = document.querySelector<HTMLElement>('#stress-panel')?.dataset;
        return Number(data?.frames) >= 120 && Number(data?.seconds) >= seconds;
      },
      Number(process.env.STRESS_SECONDS ?? 0),
      { timeout: 75_000 },
    );
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name: '导出 JSON' }).click();
    const download = await pending,
      path = info.outputPath(`stress-${mode}.json`);
    await download.saveAs(path);
    // JSON 先于截图读回，避免把捕获画面的阻塞算入压测。
    await page.screenshot({ path: info.outputPath(`stress-${mode}.png`), scale: 'css' });
    const result = JSON.parse(await readFile(path, 'utf8'));
    await info.attach('stress-report', { path, contentType: 'application/json' });
    expect(result.actorMin).toBeGreaterThan(0);
    expect(result.actorMin).toBeLessThanOrEqual(30);
    expect(result.frames).toBeGreaterThanOrEqual(120);
    expect(result.averageFps).toBeGreaterThan(0);
    expect(result.drawAverage).toBeGreaterThan(0);
    expect(result.minChildren).toBe(result.maxChildren);
    if (mode === '1') {
      expect(result.actorMin).toBe(30);
      expect(result.bulletMin).toBe(400);
      expect(result.peakBullets).toBe(400);
    } else {
      expect(result.peakBullets).toBeGreaterThan(0);
      expect(result.peakFx).toBeGreaterThan(0); // 左上角原点 + 高倍率相机不能误剔除屏内火花。
    }
    expect(await page.evaluate(() => localStorage.getItem('avn.floor.v1'))).toBeNull();
    await padButton(page, 7, false);
    const box = (await page.locator('#game canvas').boundingBox())!,
      cdp = await context.newCDPSession(page),
      move = {
        id: 1,
        x: box.x + INPUT_UI.joystick.homeInset,
        y: box.y + box.height - INPUT_UI.joystick.homeInset,
      },
      fire = {
        id: 2,
        x: box.x + box.width - INPUT_UI.aimWheel.inset,
        y: box.y + box.height - INPUT_UI.aimWheel.inset,
      };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move] });
    move.x += INPUT_UI.joystick.radius * 0.8;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [move] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move, fire] });
    await page.waitForFunction(() => window.__AVN__!.input!.fire && window.__AVN__!.input!.move.x > 0.5);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.waitForFunction(() => !window.__AVN__!.input!.fire && window.__AVN__!.input!.move.x === 0);
    await page.keyboard.press('Escape');
    await page.locator('#pause-menu').click();
    await expect(panel).toHaveCount(0);
    await startAdventure(page);
    await expect(panel).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
