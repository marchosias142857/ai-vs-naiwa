import { startAdventure } from './helpers/town';
import { expect, test } from '@playwright/test';

test('1080p 直接绘制像素贴图，菜单、战斗与重启保持同一坐标系', async ({ page }, info) => {
  await page.goto('/?seed=42&god=1');
  await expect(page.locator('#start-run')).toBeVisible();
  const canvas = page.locator('#game canvas');
  await expect(canvas).toHaveAttribute('width', '1920');
  await expect(canvas).toHaveAttribute('height', '1080');
  await startAdventure(page);
  await page.waitForFunction(() => !!window.__AVN__?.demo?.visual);
  const hero = (await page.evaluate(() => window.__AVN__!.demo!.visual))!;
  const body = await page.evaluate(() => ({ x: window.__AVN__!.demo!.x, y: window.__AVN__!.demo!.y }));
  expect(body).toEqual({ x: 240, y: 135 });
  // 贴图按 1080p 像素对齐，pivot 允许小于一个渲染像素的视觉偏移。
  expect(Math.abs(hero.x - body.x)).toBeLessThan(0.25);
  expect(Math.abs(hero.y - body.y)).toBeLessThan(0.25);
  await page.screenshot({ path: info.outputPath('hd-room.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#demo-pause')).toBeVisible();
  await page.screenshot({ path: info.outputPath('hd-pause.png') });
  await page.reload();
  await page.locator('#continue-run').click();
  await page.waitForFunction(() => !!window.__AVN__?.demo?.visual);
  expect(Number(await canvas.getAttribute('width'))).toBeGreaterThanOrEqual(1920);
  expect(await page.evaluate(() => window.__AVN__!.demo!.x)).toBe(body.x);
  expect(Math.abs((await page.evaluate(() => window.__AVN__!.demo!.visual))!.x - body.x)).toBeLessThan(0.25);
});
