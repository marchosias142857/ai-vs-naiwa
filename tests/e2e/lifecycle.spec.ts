import { expect, test } from '@playwright/test';

const portrait = { width: 390, height: 844 };
const landscape = { width: 844, height: 390 };

test('竖屏：桌面留黑边继续运行，触屏显示遮罩并暂停；转横屏恢复', async ({ page, isMobile }, info) => {
  await page.setViewportSize(portrait);
  await page.goto('/?seed=42');
  if (!isMobile) {
    await page.waitForFunction(() => window.__AVN__?.scene === 'Menu');
    await expect(page.locator('#rotate-overlay')).toBeHidden();
    const frame = await page.evaluate(() => window.__AVN__!.lifecycle!.frame);
    await expect.poll(() => page.evaluate(() => window.__AVN__!.lifecycle!.frame)).toBeGreaterThan(frame);
    const canvas = (await page.locator('#game canvas').boundingBox())!;
    expect(canvas.width / canvas.height).toBeCloseTo(16 / 9, 2);
    expect(canvas.y).toBeGreaterThan(0);
    expect(canvas.y + canvas.height).toBeLessThan(portrait.height);
    await page.screenshot({ path: info.outputPath('lifecycle-portrait.png') });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__AVN__?.scene === 'Game');
    await page.setViewportSize(landscape);
    await expect(page.locator('#rotate-overlay')).toBeHidden();
    expect(await page.evaluate(() => window.__AVN__?.lifecycle?.loopRunning)).toBe(true);
    return;
  }
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

test('后台暂停与输入设备的竖屏策略独立', async ({ page, isMobile }) => {
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
  expect(await page.evaluate(() => window.__AVN__?.lifecycle?.loopRunning)).toBe(!isMobile);
  await page.setViewportSize(landscape);
  await expect
    .poll(() => page.evaluate(() => window.__AVN__?.lifecycle?.frame ?? 0))
    .toBeGreaterThan(before!.frame);
});

test('竖窗口切换触屏模式时实时显示或移除遮罩', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await page.setViewportSize(portrait);
  await page.goto('/?scene=Game&seed=42');
  // setViewportSize 会重应用项目的触摸配置；随后切换才是在模拟运行中的设备变化。
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await page.waitForFunction(() => window.__AVN__?.scene === 'Game');
  await expect(page.locator('#rotate-overlay')).toBeHidden();
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 3 });
  await expect(page.locator('#rotate-overlay')).toBeVisible();
  await page.waitForFunction(() => window.__AVN__?.lifecycle?.loopRunning === false);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await expect(page.locator('#rotate-overlay')).toBeHidden();
  await page.waitForFunction(() => window.__AVN__?.lifecycle?.loopRunning === true);
});
