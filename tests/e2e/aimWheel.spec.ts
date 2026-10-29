import { expect, test } from '@playwright/test';
import { INPUT_UI as UI } from '../../src/game/fx/params';

for (const compact of [false, true]) {
  test(`触屏轮盘：${compact ? '小屏' : '横屏'}微小偏移、双指方向、拖出与回中`, async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.skip(!isMobile, '使用原生触屏事件');
    if (compact) await page.setViewportSize({ width: 667, height: 375 });
    await page.goto('/?scene=Game&room=arena&seed=42&god=1');
    await page.waitForFunction(() => !!window.__AVN__?.combat && !!window.__AVN__.input);
    const box = (await page.locator('#game canvas').boundingBox())!,
      cdp = await context.newCDPSession(page),
      move = { id: 1, x: box.x + UI.joystick.homeInset, y: box.y + box.height - UI.joystick.homeInset },
      fire = { id: 2, x: box.x + box.width - UI.aimWheel.inset, y: box.y + box.height - UI.aimWheel.inset },
      walking = { ...move, x: move.x + UI.joystick.radius * 0.8 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move, fire] });
    await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(true);
    expect(await page.evaluate(() => window.__AVN__!.input!.aim)).toBeNull();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [walking, { ...fire, x: fire.x + 0.25 }],
    });
    await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.move.x)).toBeGreaterThan(0.5);
    await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.aim)).toEqual({ x: 1, y: 0 });
    // 向左上拖出底盘，方向仍来自固定圆心；桥接层实际收到了单位方向。
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        walking,
        { ...fire, x: fire.x - UI.aimWheel.radius * 1.5, y: fire.y - UI.aimWheel.radius * 2 },
      ],
    });
    await expect.poll(() => page.evaluate(() => window.__AVN__!.combat!.aim?.x)).toBeCloseTo(-0.6, 4);
    await expect.poll(() => page.evaluate(() => window.__AVN__!.combat!.aim?.y)).toBeCloseTo(-0.8, 4);
    expect(await page.evaluate(() => window.__AVN__!.input!.fire)).toBe(true);
    await page.screenshot({
      path: info.outputPath(`aim-wheel-${compact ? 'compact' : 'mobile'}.png`),
      scale: 'css',
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [walking, fire] });
    await expect.poll(() => page.evaluate(() => window.__AVN__!.combat!.aim)).toBeNull();
    expect(await page.evaluate(() => window.__AVN__!.input!.fire)).toBe(true);
    // 留下左指、释放右指，左侧移动继续。
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [fire] });
    await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(false);
    expect(await page.evaluate(() => window.__AVN__!.input!.move.x)).toBeGreaterThan(0.5);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.move.x)).toBe(0);
  });
}

test('触屏轮盘：第三指动作、取消、暂停与后台恢复不遗留输入', async ({ page, context, isMobile }) => {
  test.skip(!isMobile, '使用原生触屏事件');
  await page.goto('/?scene=Game&seed=42&god=1');
  await page.waitForFunction(() => !!window.__AVN__?.demo && !!window.__AVN__.input);
  const box = (await page.locator('#game canvas').boundingBox())!,
    cdp = await context.newCDPSession(page),
    move = { id: 1, x: box.x + UI.joystick.homeInset, y: box.y + box.height - UI.joystick.homeInset },
    fire = { id: 2, x: box.x + box.width - UI.aimWheel.inset, y: box.y + box.height - UI.aimWheel.inset },
    walking = { ...move, x: move.x + UI.joystick.radius * 0.8 },
    aiming = { ...fire, x: fire.x - UI.aimWheel.radius };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move, fire] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [walking, aiming] });
  const button = (await page.locator('[data-action="Space"]').boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      walking,
      aiming,
      { id: 3, x: button.x + button.width / 2, y: button.y + button.height / 2 },
    ],
  });
  await expect.poll(() => page.evaluate(() => window.__AVN__!.demo!.skill)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__AVN__!.input!.aim)).toEqual({ x: -1, y: 0 });
  expect(await page.evaluate(() => window.__AVN__!.input!.fire)).toBe(true);
  expect(await page.evaluate(() => window.__AVN__!.input!.move.x)).toBeGreaterThan(0.5);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(false);
  expect(await page.evaluate(() => window.__AVN__!.input!.aim)).toBeNull();

  for (const reason of ['pause', 'hidden', 'resize']) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move, fire] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [walking, aiming] });
    await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.aim?.x)).toBe(-1);
    if (reason === 'pause') {
      await page.keyboard.press('Escape');
      await expect(page.locator('#demo-pause')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#demo-pause')).toBeHidden();
    } else if (reason === 'hidden') {
      for (const state of ['hidden', 'visible']) {
        await page.evaluate((visibility) => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: visibility });
          document.dispatchEvent(new Event('visibilitychange'));
        }, state);
      }
    } else await page.setViewportSize({ width: 700, height: 390 });
    // 手指还在屏幕上；旧 pointermove 不能重新取得已经释放的轮盘。
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [walking, aiming] });
    await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(false);
    expect(await page.evaluate(() => window.__AVN__!.input!.aim)).toBeNull();
    expect(await page.evaluate(() => window.__AVN__!.input!.move)).toEqual({ x: 0, y: 0 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
});
