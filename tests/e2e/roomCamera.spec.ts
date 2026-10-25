import { expect, test } from '@playwright/test';
import { GAME_HEIGHT, RENDER_SCALE } from '../../src/config';
import { GRAYBOX_BOUNDS as B } from '../../src/game/world/graybox';
import { INPUT_UI } from '../../src/game/fx/params';
import { worldToScreen } from './helpers/camera';
import { startAdventure } from './helpers/town';

test('不同横屏尺寸下状态条、地图和触控均位于战斗视口外', async ({ page, isMobile }, info) => {
  await page.goto('/?scene=Game&seed=42&god=1');
  await page.waitForFunction(() => window.__AVN__?.demo?.camera.zoom === 6);
  await page.locator('.demo-map-toggle').click();
  await expect(page.locator('.demo-map')).toBeVisible();
  for (const size of [
    { width: 915, height: 412 },
    { width: 667, height: 375 },
    { width: 568, height: 320 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(async () => {
        const box = (await page.locator('#game canvas').boundingBox())!;
        return Math.abs(box.width - size.width);
      })
      .toBeLessThan(1);
    await expect
      .poll(async () => {
        const c = await page.evaluate(() => window.__AVN__!.demo!.camera);
        const box = (await page.locator('#game canvas').boundingBox())!;
        const scale = box.height / (GAME_HEIGHT * RENDER_SCALE);
        return Math.abs(c.x * scale - (isMobile ? 160 : 96));
      })
      .toBeLessThan(1);
    const c = await page.evaluate(() => window.__AVN__!.demo!.camera);
    const box = (await page.locator('#game canvas').boundingBox())!;
    const s = box.height / (GAME_HEIGHT * RENDER_SCALE);
    const view = {
      left: box.x + c.x * s,
      top: box.y + c.y * s,
      right: box.x + (c.x + c.width) * s,
      bottom: box.y + (c.y + c.height) * s,
    };
    for (const selector of [
      '.demo-status',
      '.demo-map',
      '.demo-map-toggle',
      '.demo-hint',
      ...(isMobile ? ['#demo-actions'] : []),
    ]) {
      const element = (await page.locator(selector).boundingBox())!;
      const overlapX = Math.min(view.right, element.x + element.width) - Math.max(view.left, element.x);
      const overlapY = Math.min(view.bottom, element.y + element.height) - Math.max(view.top, element.y);
      expect(overlapX <= 1 || overlapY <= 1, selector).toBe(true);
    }
    if (isMobile) {
      expect(view.left - box.x).toBeGreaterThan(INPUT_UI.joystick.homeInset + INPUT_UI.joystick.radius);
      expect(box.x + box.width - view.right).toBeGreaterThan(
        INPUT_UI.aimWheel.inset + INPUT_UI.aimWheel.radius + INPUT_UI.aimWheel.hitPadding,
      );
    }
    await page.screenshot({ path: info.outputPath(`room-${size.width}.png`), scale: 'css' });
  }
  await page.locator('.demo-map-toggle').click();
  await expect(page.locator('.demo-map')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.locator('#pause-menu').click();
  await expect(page.locator('#start-run')).toBeVisible();
  await expect(page.locator('#game canvas')).toHaveAttribute('width', '1920');
});

test('跟随真实移动，接近门时完整显示门口，切房后玩家仍在可见范围', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?scene=Game&seed=42&god=1');
  await page.waitForFunction(() => window.__AVN__?.demo?.camera.zoom === 6);
  const initial = await page.evaluate(() => window.__AVN__!.demo!);
  const door = initial.links[0]!;
  const x = B.x + B.width / 2 + (door.dx * B.width) / 2;
  const y = B.y + B.height / 2 + (door.dy * B.height) / 2;
  const key = door.dx > 0 ? 'KeyD' : door.dx < 0 ? 'KeyA' : door.dy > 0 ? 'KeyS' : 'KeyW';
  // 浏览器内在接近门时松开，避免测试协议延迟使角色提前跨房。
  await page.evaluate(
    ({ key, x, y }) =>
      new Promise<void>((resolve) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: key }));
        const check = () => {
          const d = window.__AVN__!.demo!;
          if (Math.hypot(d.x - x, d.y - y) < 35) {
            window.dispatchEvent(new KeyboardEvent('keyup', { code: key }));
            resolve();
          } else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
    { key, x, y },
  );
  await expect
    .poll(() =>
      page.evaluate(
        ({ x, y, dx }) => {
          const c = window.__AVN__!.demo!.camera;
          const halfX = dx ? 20 : 32,
            halfY = dx ? 32 : 20;
          return (
            x - halfX >= c.scrollX &&
            x + halfX <= c.scrollX + c.width / c.zoom &&
            y - halfY >= c.scrollY &&
            y + halfY <= c.scrollY + c.height / c.zoom
          );
        },
        { x, y, dx: door.dx },
      ),
    )
    .toBe(true);
  const near = await page.evaluate(() => window.__AVN__!.demo!);
  expect(
    Math.hypot(near.camera.scrollX - initial.camera.scrollX, near.camera.scrollY - initial.camera.scrollY),
  ).toBeGreaterThan(1);
  await page.screenshot({ path: info.outputPath('door-visible.png'), scale: 'css' });
  await page.keyboard.down(key);
  await page.waitForFunction((room) => window.__AVN__!.demo!.room !== room, initial.room);
  await page.keyboard.up(key);
  const next = await page.evaluate(() => window.__AVN__!.demo!);
  expect(next.x).toBeGreaterThan(next.camera.scrollX);
  expect(next.x).toBeLessThan(next.camera.scrollX + next.camera.width / next.camera.zoom);
  expect(next.y).toBeGreaterThan(next.camera.scrollY);
  expect(next.y).toBeLessThan(next.camera.scrollY + next.camera.height / next.camera.zoom);
  expect(errors).toEqual([]);
});

test('移动镜头后的鼠标瞄准仍指向实际目标，侧栏点击不射击', async ({ page, isMobile }) => {
  test.skip(isMobile, '触控轮盘有独立多指实弹测试');
  await page.goto('/?scene=Game&seed=42&god=1');
  await page.waitForFunction(() => window.__AVN__?.demo?.camera.zoom === 6);
  await page.keyboard.down('s');
  await page.waitForFunction(() => window.__AVN__!.demo!.y > 175);
  await page.keyboard.up('s');
  await expect.poll(() => page.evaluate(() => Math.abs(window.__AVN__!.input!.move.y))).toBe(0);
  // 等相机平滑停止；靠墙时角色不必保持在视口正中心。
  let previous = Infinity;
  await expect
    .poll(async () => {
      const current = await page.evaluate(() => window.__AVN__!.demo!.camera.scrollY);
      const difference = Math.abs(current - previous);
      previous = current;
      return difference;
    })
    .toBeLessThan(0.1);
  const p = await page.evaluate(() => window.__AVN__!.demo!);
  const point = await worldToScreen(page, p.x + 40, p.y - 25);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForFunction(() => !!window.__AVN__!.input!.fire);
  const aim = await page.evaluate(() => window.__AVN__!.input!.aim!);
  expect(Math.abs(aim.x * -25 - aim.y * 40)).toBeLessThan(0.5);
  await page.mouse.up();
  const box = (await page.locator('#game canvas').boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  const before = await page.evaluate(() => window.__AVN__!.demo!.time);
  await page.mouse.down();
  await page.waitForFunction((time) => window.__AVN__!.demo!.time > time + 0.2, before);
  expect(await page.evaluate(() => window.__AVN__!.input!.fire)).toBe(false);
  await page.mouse.up();
});

test('主城切换地牢后，新触控器仍限制在侧栏，远拖保持移动', async ({ page, isMobile }, info) => {
  test.skip(!isMobile);
  await page.goto('/?seed=42&god=1');
  await startAdventure(page);
  await page.waitForFunction(() => window.__AVN__?.demo?.camera.zoom === 6);
  const box = (await page.locator('#game canvas').boundingBox())!;
  const touch = async (type: string, x: number, y: number) =>
    page.locator('#game canvas').evaluate(
      (canvas, { type, x, y }) => {
        const point = new Touch({ identifier: 3, target: canvas, clientX: x, clientY: y });
        const points = type === 'touchend' ? [] : [point];
        canvas.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            changedTouches: [point],
            touches: points,
            targetTouches: points,
          }),
        );
      },
      { type, x, y },
    );
  const y = box.y + box.height - 100;
  const before = await page.evaluate(() => window.__AVN__!.demo!);
  await touch('touchstart', box.x + 180, y);
  await touch('touchmove', box.x + 210, y);
  await page.waitForFunction((time) => window.__AVN__!.demo!.time > time + 0.2, before.time);
  expect(await page.evaluate(() => window.__AVN__!.input!.move)).toEqual({ x: 0, y: 0 });
  expect(await page.evaluate(() => window.__AVN__!.demo!.x)).toBe(before.x);
  await touch('touchend', box.x + 210, y);
  await touch('touchstart', box.x + 100, y);
  await touch('touchmove', box.x + 300, y);
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.move.x)).toBeGreaterThan(0.9);
  await page.screenshot({ path: info.outputPath('active-left-rail.png'), scale: 'css' });
  await touch('touchend', box.x + 300, y);
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.move.x)).toBe(0);
});
