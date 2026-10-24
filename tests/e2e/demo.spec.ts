import { expect, test } from '@playwright/test';

test('demo：默认地牢入口、行动按钮、真实走门、清房与暂停', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?scene=Game&seed=42&debug=1&god=1');
  await page.waitForFunction(() => !!window.__AVN__?.demo);
  await expect(page.locator('#demo-hud')).toBeVisible();
  await page.getByRole('button', { name: /切枪/ }).click();
  await page.waitForFunction(() => window.__AVN__!.demo!.weapon === 'rifle_auto');
  // 点击 DOM 操作键后不残留焦点，键盘能继续控制。
  const door = await page.evaluate(() => window.__AVN__!.demo!.links[0]!);
  const key = door.dx > 0 ? 'd' : door.dx < 0 ? 'a' : door.dy > 0 ? 's' : 'w';
  await page.keyboard.down(key);
  await page.waitForFunction(() => window.__AVN__!.demo!.room !== 0);
  await page.keyboard.up(key);
  await page.getByRole('button', { name: /技能/ }).click();
  await page.waitForFunction(() => window.__AVN__!.demo!.skill > 0);
  await page.waitForFunction(() => window.__AVN__!.demo!.alive > 0);
  const before = await page.evaluate(() => window.__AVN__!.demo!);
  expect(before.locked).toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!window.__AVN__!.input!.manualPaused);
  const time = await page.evaluate(() => window.__AVN__!.demo!.time);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__AVN__!.demo!.time)).toBe(time);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__AVN__!.input!.manualPaused);
  await page.screenshot({ path: info.outputPath('demo-feedback.png'), scale: 'css' });
  for (let wave = 0; wave < 2; wave++) {
    await page.waitForFunction(() => window.__AVN__!.demo!.alive > 0);
    await page.keyboard.press('F2');
    await page.waitForFunction(() => window.__AVN__!.demo!.alive === 0);
  }
  await page.waitForFunction(() => !window.__AVN__!.demo!.locked);
  expect(await page.evaluate(() => window.__AVN__!.demo!.kills)).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('demo-room.png'), scale: 'css' });
  expect(errors).toEqual([]);
});
