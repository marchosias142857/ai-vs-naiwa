import { expect, test } from '@playwright/test';
import { INPUT_UI as UI } from '../../src/game/fx/params';

test('正式 demo：双指移动开火、兼容鼠标事件与第三指动作仍产生子弹', async ({
  page,
  context,
  isMobile,
  browserName,
}, info) => {
  test.skip(!isMobile || browserName !== 'chromium', '使用原生多点触屏事件');
  await page.goto('/?seed=42&god=1');
  await page.locator('#start-run').tap();
  await page.waitForFunction(() => !!window.__AVN__?.demo);
  const box = (await page.locator('#game canvas').boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const move = { id: 1, x: box.x + 100, y: box.y + box.height - 100 };
  const fire = { id: 2, x: box.x + box.width - UI.aimWheel.inset, y: box.y + box.height - UI.aimWheel.inset };
  const aiming = { ...fire, x: fire.x - 40 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move, fire] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...move, x: move.x + 24 }, aiming],
  });
  await page.waitForFunction(() => window.__AVN__!.demo!.bullets > 0);
  // 轮盘不能仍在动、source 却被兼容鼠标移动切回 keyboard，导致 fire 静默变 false。
  await page.locator('#game canvas').dispatchEvent('pointermove', {
    pointerType: 'mouse',
    pointerId: 99,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
  });
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.source)).toBe('touch');
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(true);
  await page.waitForFunction(() => window.__AVN__!.demo!.bullets > 0);
  await page.screenshot({ path: info.outputPath('mobile-firing.png') });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(false);
});

test('手机基础手枪按住可出弹；能量不足有提示并能切回手枪', async ({ page, isMobile }, info) => {
  test.skip(!isMobile);
  await page.goto('/?seed=42&weapon=rifle_auto&god=1');
  await page.locator('#start-run').tap();
  await page.waitForFunction(() => !!window.__AVN__?.demo);
  await page.keyboard.press('Escape');
  await expect(page.locator('#demo-pause')).toBeVisible();
  // 用真实存档入口复现弹药耗尽，覆盖旧存档在手机上续玩。
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('avn.run.v2')!);
    save.sim.world.resources.energy = 0;
    localStorage.setItem('avn.run.v2', JSON.stringify(save));
  });
  await page.reload();
  await page.locator('#continue-run').tap();
  await page.waitForFunction(() => window.__AVN__?.demo?.energy === 0);
  await expect(page.locator('.demo-hint')).toContainText('能量不足');
  await page.locator('[data-action="KeyQ"]').tap();
  await page.waitForFunction(() => window.__AVN__?.demo?.weapon === 'pistol_basic');
  const box = (await page.locator('#game canvas').boundingBox())!;
  const fire = { x: box.x + box.width - UI.aimWheel.inset, y: box.y + box.height - UI.aimWheel.inset };
  // WebKit 无 CDP 多指 API；注入事件只替代原生捕获，不伪造游戏输入或子弹。
  await page.locator('#game canvas').evaluate((canvas) => {
    canvas.setPointerCapture = () => {};
  });
  await page.locator('#game canvas').dispatchEvent('pointerdown', {
    pointerType: 'touch',
    pointerId: 7,
    clientX: fire.x,
    clientY: fire.y,
  });
  await page.waitForFunction(() => window.__AVN__!.demo!.bullets > 0);
  await page.screenshot({ path: info.outputPath('mobile-empty-energy-pistol.png') });
  await page.locator('#game canvas').dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 7 });
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(false);
});
