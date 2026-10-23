import { expect, test } from '@playwright/test';

const portrait = { width: 390, height: 844 };
const landscape = { width: 844, height: 390 };

test('竖屏冷启动显示遮罩，转横屏后进入菜单；再次竖屏冻结帧和场景时钟', async ({ page }, info) => {
  await page.setViewportSize(portrait);
  await page.goto('/?seed=42');
  await expect(page.getByText('请横屏游玩', { exact: true })).toBeVisible();
  await page.waitForFunction(() => window.__AVN__?.lifecycle?.loopRunning === false);
  await page.screenshot({ path: info.outputPath('lifecycle-portrait.png') });
  await page.setViewportSize(landscape);
  await expect(page.locator('#rotate-overlay')).toBeHidden();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Menu');
  await page.setViewportSize(portrait);
  await page.waitForFunction(() => window.__AVN__?.lifecycle?.loopRunning === false);
  const before = await page.evaluate(() => window.__AVN__?.lifecycle);
  // 观察多个本应更新的帧；同时确认暂停时键盘不会让菜单进入战斗。
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__AVN__?.lifecycle)).toEqual(before);
  expect(await page.evaluate(() => window.__AVN__?.scene)).toBe('Menu');
  await page.setViewportSize(landscape);
  await expect
    .poll(() => page.evaluate(() => window.__AVN__?.lifecycle?.frame ?? 0))
    .toBeGreaterThan(before!.frame);
  await page.locator('#game canvas').click();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Game');
});

test('hidden 与竖屏原因重叠，只有两者都解除才恢复', async ({ page }) => {
  await page.goto('/?scene=Game&seed=7');
  await page.waitForFunction(() => window.__AVN__?.scene === 'Game');
  const setHidden = async (hidden: boolean) =>
    page.evaluate((value) => {
      // Headless 无真实操作系统切后台：模拟 document 状态并走真实 visibilitychange 监听。
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: value ? 'hidden' : 'visible',
      });
      Object.defineProperty(document, 'hidden', { configurable: true, value });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  const before = await page.evaluate(() => window.__AVN__?.lifecycle);
  expect(before?.loopRunning).toBe(false);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__AVN__?.lifecycle)).toEqual(before);
  await page.setViewportSize(portrait);
  await setHidden(false);
  expect(await page.evaluate(() => window.__AVN__?.lifecycle?.loopRunning)).toBe(false);
  await page.setViewportSize(landscape);
  await expect
    .poll(() => page.evaluate(() => window.__AVN__?.lifecycle?.frame ?? 0))
    .toBeGreaterThan(before!.frame);
});
