import { expect, test } from '@playwright/test';
import type { RunSnapshot } from '../../src/game/save/RunSnapshot';

test('生产入口：战斗暂停保存后刷新，正式校验器继续原局与飞行子弹，倒计时完全冻结', async ({
  page,
  isMobile,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?seed=42&god=1');
  await page.locator('#start-run').click();
  await page.waitForFunction(() => !!window.__AVN__?.demo);
  const link = await page.evaluate(() => window.__AVN__!.demo!.links[0]!);
  const key = link.dx > 0 ? 'd' : link.dx < 0 ? 'a' : link.dy > 0 ? 's' : 'w';
  await page.keyboard.down(key);
  await page.waitForFunction(() => window.__AVN__!.demo!.room !== 0);
  await page.keyboard.up(key);
  await page.waitForFunction(() => window.__AVN__!.demo!.alive > 0);
  await expect(page.locator('.demo-hint')).toContainText(isMobile ? '点击「冲刺」' : 'Space');
  if (isMobile) await expect(page.locator('.demo-hint')).not.toContainText('Space');
  // 鼠标按住连发；先等实际子弹存在，再暂停同步落盘。
  const canvas = (await page.locator('#game canvas').boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.down();
  await page.waitForFunction(() => window.__AVN__!.demo!.bullets > 0);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('#demo-pause')).toBeVisible();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('avn.run.v2')!) as RunSnapshot);
  expect(before.sim.run.phase).toBe('fighting');
  expect(before.sim.world.bullets.length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('#save-notice')).toBeHidden();
  await page.locator('#continue-run').click();
  await page.waitForFunction(() => (window.__AVN__?.demo?.resumeRemaining ?? 0) > 0);
  const caption = page.locator('#resume-caption');
  await expect(caption).toHaveCount(1);
  await expect(caption).toBeVisible();
  await expect(caption).toHaveText('准备继续战斗');
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('avn.run.v2')!) as RunSnapshot);
  expect(restored.sim).toEqual(before.sim);
  expect(restored.game).toEqual(before.game);
  expect(await page.evaluate(() => window.__AVN__!.demo!.physicsPaused)).toBe(true);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__AVN__!.demo!.time)).toBe(before.sim.world.time);
  await page.screenshot({ path: info.outputPath('production-countdown.png'), scale: 'css' });
  await page.waitForFunction(() => window.__AVN__!.demo!.resumeRemaining === 0);
  await expect(caption).toBeHidden();
  await page.waitForFunction((time) => window.__AVN__!.demo!.time > time, before.sim.world.time);
  expect(errors).toEqual([]);
});
