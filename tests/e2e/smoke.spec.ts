import { expect, test } from '@playwright/test';

/**
 * 冒烟测试：游戏能启动、能进入菜单和战斗场景、控制台零报错。
 * 每个里程碑都要保证这条测试通过（docs/ROADMAP.md）。
 */
test('启动 → 菜单 → 灰盒房间，无报错', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?seed=42');
  await page.waitForFunction(() => window.__AVN__?.ready && window.__AVN__.scene === 'Menu');
  await expect(page.locator('#game canvas')).toBeVisible();

  await page.locator('#start-run').click();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Game');

  const hooks = await page.evaluate(() => window.__AVN__);
  expect(hooks?.seed).toBe(42);
  expect(hooks?.phaserVersion.startsWith('4.')).toBe(true);
  expect(errors).toEqual([]);
});

test('?scene=Game 可以跳过菜单', async ({ page }) => {
  await page.goto('/?scene=Game&seed=7');
  await page.waitForFunction(() => window.__AVN__?.scene === 'Game');
});
