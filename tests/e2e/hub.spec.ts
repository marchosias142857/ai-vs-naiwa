import { expect, test } from '@playwright/test';
import { startAdventure } from './helpers/town';
import { INPUT_UI } from '../../src/game/fx/params';
import { installPad, padButton, type PadWindow } from './helpers/gamepad';

test('主城不改写旧局，门可取消；续玩原局，新冒险才替换', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=42&god=1');
  await expect(page.locator('#demo-menu-panel h2')).toHaveText('AI娘大战奶蛙');
  await expect(page.locator('#start-run')).toHaveText('回到主城');
  await expect(page.locator('#continue-run')).toHaveText('继续冒险');
  await expect(page.locator('#continue-run')).toBeDisabled();
  await page.screenshot({ path: info.outputPath('new-title.png') });
  await startAdventure(page);
  await expect(page.locator('.demo-status')).toContainText('白色品质');
  await page.keyboard.down('d');
  await page.waitForFunction(() => window.__AVN__!.demo!.x > 260);
  await page.keyboard.up('d');
  await page.keyboard.press('Escape');
  await page.locator('#pause-menu').click();
  const saved = await page.evaluate(() => localStorage.getItem('avn.run.v2'));
  await page.locator('#start-run').click();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Hub');
  await expect(page.locator('#demo-hud')).toHaveCount(0);
  await expect(page.locator('#hub-door')).toBeHidden();
  await page.keyboard.press('e');
  await expect(page.locator('#hub-confirm')).toBeHidden();
  await page.screenshot({ path: info.outputPath('empty-hub.png') });
  await page.keyboard.down('w');
  await expect(page.locator('#hub-door')).toBeVisible();
  await page.keyboard.up('w');
  await page.keyboard.press('e');
  await expect(page.locator('#cancel-dungeon')).toBeFocused();
  await page.screenshot({ path: info.outputPath('door-confirm.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#hub-confirm')).toBeHidden();
  await page.locator('#hub-door').click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.__AVN__!.lifecycle!.loopRunning)).toBe(false);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#hub-confirm')).toBeVisible();
  await page.locator('#cancel-dungeon').click();
  expect(await page.evaluate(() => localStorage.getItem('avn.run.v2'))).toBe(saved);
  await page.keyboard.press('Escape');
  await page.locator('#pause-menu').click();
  await page.locator('#continue-run').click();
  await page.waitForFunction(() => !!window.__AVN__?.demo);
  expect(await page.evaluate(() => window.__AVN__!.demo!.x)).toBeGreaterThan(260);
  await expect(page.locator('#hub-panel')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('#pause-menu').click();
  await startAdventure(page);
  expect(await page.evaluate(() => window.__AVN__!.demo!.x)).toBeCloseTo(240);
  expect(await page.evaluate(() => localStorage.getItem('avn.run.v2'))).not.toBe(saved);
  await expect(page.locator('#demo-hud')).toHaveCount(1);
  await expect(page.locator('#demo-actions')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('手柄走到门口后需松开再确认，不会一次按键穿过对话框', async ({ page }) => {
  await installPad(page);
  await page.goto('/?seed=42&god=1');
  await page.locator('#start-run').click();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Hub' && !!window.__AVN__?.input);
  await page.evaluate(() => (window as PadWindow).setPadAxes!([0, -1, 0, 0]));
  await expect(page.locator('#hub-door')).toBeVisible();
  await page.evaluate(() => (window as PadWindow).setPadAxes!([0, 0, 0, 0]));
  await padButton(page, INPUT_UI.gamepad.confirm, true);
  await expect(page.locator('#hub-confirm')).toBeVisible();
  await expect(page.locator('#cancel-dungeon')).toBeFocused();
  expect(await page.evaluate(() => window.__AVN__!.scene)).toBe('Hub');
  await padButton(page, INPUT_UI.gamepad.confirm, false);
  await padButton(page, INPUT_UI.gamepad.down, true);
  await expect(page.locator('#enter-dungeon')).toBeFocused();
  await padButton(page, INPUT_UI.gamepad.down, false);
  await padButton(page, INPUT_UI.gamepad.confirm, true);
  await page.waitForFunction(() => window.__AVN__?.scene === 'Game');
  await padButton(page, INPUT_UI.gamepad.confirm, false);
  await expect(page.locator('#hub-panel')).toHaveCount(0);
});

test('手机只用左摇杆与门按钮即可进入地牢，开屏控件不溢出', async ({ page, context, isMobile }) => {
  test.skip(!isMobile);
  await page.goto('/?seed=42&god=1');
  const panel = page.locator('#demo-menu-panel');
  await expect(panel).toBeVisible();
  const layout = await panel.evaluate((p) => {
    const r = p.getBoundingClientRect();
    return { right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight };
  });
  expect(layout.right).toBeLessThan(layout.width / 2);
  expect(layout.bottom).toBeLessThanOrEqual(layout.height);
  await page.locator('#start-run').tap();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Hub');
  const box = (await page.locator('#game canvas').boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const point = {
    id: 1,
    x: box.x + INPUT_UI.joystick.homeInset,
    y: box.y + box.height - INPUT_UI.joystick.homeInset,
  };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...point, y: point.y - 40 }],
  });
  await expect(page.locator('#hub-door')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.locator('#hub-door').tap();
  await page.locator('#enter-dungeon').tap();
  await page.waitForFunction(() => !!window.__AVN__?.demo);
  await expect(page.locator('#hub-panel')).toHaveCount(0);
});
