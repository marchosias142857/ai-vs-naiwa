import { expect, test } from '@playwright/test';

test('1080p 直接绘制像素贴图，菜单、战斗与重启保持同一坐标系', async ({ page }, info) => {
  await page.goto('/?seed=42&god=1');
  await expect(page.locator('#start-run')).toBeVisible();
  const canvas = page.locator('#game canvas');
  await expect(canvas).toHaveAttribute('width', '1920');
  await expect(canvas).toHaveAttribute('height', '1080');
  await page.locator('#start-run').click();
  await page.waitForFunction(() => !!window.__AVN__?.demo?.visual);
  const hero = (await page.evaluate(() => window.__AVN__!.demo!.visual))!;
  expect(hero.x).toBeCloseTo(240);
  expect(hero.y).toBeCloseTo(135);
  await page.screenshot({ path: info.outputPath('hd-room.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#demo-pause')).toBeVisible();
  await page.screenshot({ path: info.outputPath('hd-pause.png') });
  await page.reload();
  await page.locator('#continue-run').click();
  await page.waitForFunction(() => !!window.__AVN__?.demo?.visual);
  await expect(canvas).toHaveAttribute('width', '1920');
  expect((await page.evaluate(() => window.__AVN__!.demo!.visual))!.x).toBeCloseTo(hero.x);
});
