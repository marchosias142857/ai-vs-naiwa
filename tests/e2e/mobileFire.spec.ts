import { expect, test } from '@playwright/test';
import { INPUT_UI as UI } from '../../src/game/fx/params';

for (const id of [-1, -42, -2147483648]) {
  test(`有符号触点 ${id}：右轮盘拖拽和中心长按都实际出弹`, async ({ page, isMobile }, info) => {
    test.skip(!isMobile);
    await page.goto('/?seed=42&god=1');
    await page.locator('#start-run').tap();
    await page.waitForFunction(() => !!window.__AVN__?.demo && !!window.__AVN__?.input);
    const box = (await page.locator('#game canvas').boundingBox())!;
    const left = { id: 5, x: box.x + 100, y: box.y + box.height - 100 };
    const right = { id, x: box.x + box.width - UI.aimWheel.inset, y: box.y + box.height - UI.aimWheel.inset };
    type Point = typeof right;
    // 使用浏览器真实 Touch/TouchEvent 对象经过正式控制器，绝不注入 InputFrame 或子弹。
    const touch = async (type: string, changed: Point[], active: Point[]) => {
      await page.locator('#game canvas').evaluate(
        (canvas, { type, changed, active }) => {
          const point = (p: Point) =>
            new Touch({ identifier: p.id, target: canvas, clientX: p.x, clientY: p.y });
          canvas.dispatchEvent(
            new TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              changedTouches: changed.map(point),
              touches: active.map(point),
              targetTouches: active.map(point),
            }),
          );
        },
        { type, changed, active },
      );
    };
    await touch('touchstart', [left, right], [left, right]);
    left.x += 24;
    right.x -= 40;
    await touch('touchmove', [left, right], [left, right]);
    await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__AVN__!.demo!.bullets)).toBeGreaterThan(0);
    await page.locator('#game canvas').dispatchEvent('pointermove', {
      pointerType: 'mouse',
      pointerId: 99,
      clientX: box.x,
      clientY: box.y,
    });
    await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.source)).toBe('touch');
    await page.screenshot({ path: info.outputPath(`signed-touch-${id}-firing.png`) });
    await touch('touchend', [left], [right]);
    await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(true);
    await touch('touchend', [right], []);
    await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(false);
    await expect.poll(() => page.evaluate(() => window.__AVN__!.demo!.visual!.weapon.angle)).toBe(0);
    await expect.poll(() => page.evaluate(() => window.__AVN__!.demo!.bullets)).toBe(0);
    right.x += 40;
    await touch('touchstart', [right], [right]);
    await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__AVN__!.demo!.bullets)).toBeGreaterThan(0);
    await touch('touchcancel', [right], []);
    await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(false);
  });
}

test('正式 demo：双指移动开火及兼容鼠标事件后仍产生子弹', async ({
  page,
  context,
  isMobile,
  browserName,
}, info) => {
  test.skip(!isMobile || browserName !== 'chromium', '使用原生多点触屏事件');
  await page.goto('/?seed=42&god=1');
  await page.locator('#start-run').tap();
  await page.waitForFunction(() => !!window.__AVN__?.demo && !!window.__AVN__?.input);
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
  await expect.poll(() => page.evaluate(() => window.__AVN__!.demo!.visual!.flipX)).toBe(false);
  await page.screenshot({ path: info.outputPath('mobile-firing.png') });
  // 先松左指，右指仍持续朝左开火；最后松右指，枪与身体回到刚才向右移动的方向。
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [{ ...move, x: move.x + 24 }],
  });
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__AVN__!.demo!.visual!.weapon.angle)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__AVN__!.demo!.visual!.flipX)).toBe(true);
});

test('手机基础手枪按住可出弹；能量不足有提示并能切回手枪', async ({ page, isMobile }, info) => {
  test.skip(!isMobile);
  await page.goto('/?seed=42&weapon=rifle_auto&god=1');
  await page.locator('#start-run').tap();
  await page.waitForFunction(() => !!window.__AVN__?.demo && !!window.__AVN__?.input);
  await page.keyboard.press('Escape');
  await expect(page.locator('#demo-pause')).toBeVisible();
  // 用真实存档入口复现弹药耗尽，覆盖旧存档在手机上续玩。
  const depleted = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('avn.run.v2')!);
    save.sim.world.resources.energy = 0;
    return JSON.stringify(save);
  });
  // pagehide 会保存当前局面；在新文档启动前放入测试存档，避免被正常保存覆盖。
  await page.addInitScript((save) => localStorage.setItem('avn.run.v2', save), depleted);
  await page.reload();
  await page.locator('#continue-run').tap();
  await page.waitForFunction(() => window.__AVN__?.demo?.energy === 0);
  await expect(page.locator('.demo-hint')).toContainText('能量不足');
  await page.locator('[data-action="KeyQ"]').tap();
  await page.waitForFunction(() => window.__AVN__?.demo?.weapon === 'pistol_basic');
  const box = (await page.locator('#game canvas').boundingBox())!;
  const fire = { x: box.x + box.width - UI.aimWheel.inset, y: box.y + box.height - UI.aimWheel.inset };
  // WebKit 无 CDP 多指 API：派发 DOM TouchEvent，经过正式输入控制器，不伪造游戏输入或子弹。
  const touch = async (type: 'touchstart' | 'touchend') => {
    await page.locator('#game canvas').evaluate(
      (canvas, { type, fire }) => {
        const point = new Touch({ identifier: 7, target: canvas, clientX: fire.x, clientY: fire.y });
        const active = type === 'touchstart' ? [point] : [];
        canvas.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: active,
            targetTouches: active,
            changedTouches: [point],
          }),
        );
      },
      { type, fire },
    );
  };
  await touch('touchstart');
  await page.waitForFunction(() => window.__AVN__!.demo!.bullets > 0);
  await page.screenshot({ path: info.outputPath('mobile-empty-energy-pistol.png') });
  await touch('touchend');
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.fire)).toBe(false);
});
