import { expect, test } from '@playwright/test';
import { GAME_HEIGHT, RENDER_SCALE } from '../../src/config';
import { GRAYBOX_BOUNDS as B } from '../../src/game/world/graybox';
import type { DemoProbe } from '../../src/game/testHooks';
import { worldToScreen } from './helpers/camera';
import { startAdventure } from './helpers/town';

function expectCentered(p: DemoProbe): void {
  const c = p.camera;
  expect(Math.abs((p.x - c.scrollX) * c.zoom - c.width / 2)).toBeLessThanOrEqual(0.51);
  expect(Math.abs((p.y - c.scrollY) * c.zoom - c.height / 2)).toBeLessThanOrEqual(0.51);
}

test('不同横屏尺寸下世界视口铺满画布，状态条与触控覆盖在画面内', async ({ page, isMobile }, info) => {
  await page.goto('/?scene=Game&seed=42&god=1');
  await page.waitForFunction(() => (window.__AVN__?.demo?.camera.zoom ?? 0) >= 6);
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
        return Math.abs(c.width * scale - box.width);
      })
      .toBeLessThan(1);
    const c = await page.evaluate(() => window.__AVN__!.demo!.camera);
    expectCentered(await page.evaluate(() => window.__AVN__!.demo!));
    const box = (await page.locator('#game canvas').boundingBox())!;
    const s = box.height / (GAME_HEIGHT * RENDER_SCALE);
    const view = {
      left: box.x + c.x * s,
      top: box.y + c.y * s,
      right: box.x + (c.x + c.width) * s,
      bottom: box.y + (c.y + c.height) * s,
    };
    expect(view.left).toBeCloseTo(box.x);
    expect(view.top).toBeCloseTo(box.y);
    // 整数渲染缓冲与 CSS 缩放比例可有小于半像素的取整差。
    expect(Math.abs(view.right - box.x - box.width)).toBeLessThan(0.5);
    expect(Math.abs(view.bottom - box.y - box.height)).toBeLessThan(0.5);
    for (const selector of [
      '.vital-health',
      '.vital-armor',
      '.vital-energy',
      '.demo-map',
      '.demo-map-toggle',
      ...(isMobile ? ['[data-action="Space"]', '[data-action="KeyQ"]', '[data-action="KeyE"]'] : []),
    ]) {
      const element = (await page.locator(selector).boundingBox())!;
      expect(element.x, selector).toBeGreaterThanOrEqual(view.left);
      expect(element.y, selector).toBeGreaterThanOrEqual(view.top);
      expect(element.x + element.width, selector).toBeLessThanOrEqual(view.right);
      expect(element.y + element.height, selector).toBeLessThanOrEqual(view.bottom);
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

test('真实移动到四个墙角时人物持续居中，房间外露出黑色背景', async ({ page }, info) => {
  test.setTimeout(120_000);
  const measurements = [];
  for (const [name, dx, dy] of [
    ['north-west', -1, -1],
    ['north-east', 1, -1],
    ['south-west', -1, 1],
    ['south-east', 1, 1],
  ] as const) {
    await page.goto('/?scene=Game&seed=42&god=1');
    await page.waitForFunction(() => (window.__AVN__?.demo?.camera.zoom ?? 0) >= 6);
    // 对角走向墙角，不穿过四边中央的门；只发送真实移动输入，不写 sim 坐标。
    const result = await page.evaluate(
      ({ dx, dy, bounds }) =>
        new Promise<{ maxError: number; samples: number; state: DemoProbe }>((resolve, reject) => {
          const keys = [dx < 0 ? 'KeyA' : 'KeyD', dy < 0 ? 'KeyW' : 'KeyS'];
          const start = window.__AVN__!.demo!;
          let lastX = start.x,
            lastY = start.y,
            stableSince = start.time,
            maxError = 0,
            samples = 0;
          const deadline = performance.now() + 25_000;
          const release = () =>
            keys.forEach((code) => window.dispatchEvent(new KeyboardEvent('keyup', { code })));
          keys.forEach((code) => window.dispatchEvent(new KeyboardEvent('keydown', { code })));
          const sample = () => {
            const d = window.__AVN__!.demo!,
              c = d.camera;
            maxError = Math.max(
              maxError,
              Math.abs((d.x - c.scrollX) * c.zoom - c.width / 2),
              Math.abs((d.y - c.scrollY) * c.zoom - c.height / 2),
            );
            samples++;
            if (d.x !== lastX || d.y !== lastY) stableSince = d.time;
            lastX = d.x;
            lastY = d.y;
            const atCorner =
              (dx < 0 ? d.x <= bounds.x + 16 : d.x >= bounds.x + bounds.width - 16) &&
              (dy < 0 ? d.y <= bounds.y + 16 : d.y >= bounds.y + bounds.height - 16);
            if (d.room !== start.room || performance.now() > deadline) {
              release();
              reject(new Error(`未在原房间走到墙角：${d.room}, ${d.x}, ${d.y}`));
            } else if (atCorner && d.time - stableSince >= 0.2) {
              release();
              resolve({ maxError, samples, state: d });
            } else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        }),
      { dx, dy, bounds: B },
    );
    expect(result.samples).toBeGreaterThan(10);
    expect(result.maxError).toBeLessThanOrEqual(0.51);
    expectCentered(result.state);
    const box = (await page.locator('#game canvas').boundingBox())!;
    const backgroundPoint = {
      x: Math.round(box.x + box.width * (dx < 0 ? 0.28 : 0.72)),
      y: Math.round(box.y + box.height * (dy < 0 ? 0.4 : 0.6)),
    };
    measurements.push({ name, ...result, backgroundPoint });
    await page.screenshot({ path: info.outputPath(`edge-${name}.png`), scale: 'css' });
  }
  await info.attach('centered-camera-edges', {
    body: JSON.stringify(measurements, null, 2),
    contentType: 'application/json',
  });
});

test('跟随真实移动，接近门时完整显示门口，切房后玩家仍在可见范围', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?scene=Game&seed=42&god=1');
  await page.waitForFunction(() => (window.__AVN__?.demo?.camera.zoom ?? 0) >= 6);
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
  expectCentered(near);
  expect(
    Math.hypot(near.camera.scrollX - initial.camera.scrollX, near.camera.scrollY - initial.camera.scrollY),
  ).toBeGreaterThan(1);
  await page.screenshot({ path: info.outputPath('door-visible.png'), scale: 'css' });
  await page.keyboard.down(key);
  await page.waitForFunction((room) => window.__AVN__!.demo!.room !== room, initial.room);
  await page.keyboard.up(key);
  const next = await page.evaluate(() => window.__AVN__!.demo!);
  expectCentered(next);
  expect(next.x).toBeGreaterThan(next.camera.scrollX);
  expect(next.x).toBeLessThan(next.camera.scrollX + next.camera.width / next.camera.zoom);
  expect(next.y).toBeGreaterThan(next.camera.scrollY);
  expect(next.y).toBeLessThan(next.camera.scrollY + next.camera.height / next.camera.zoom);
  expect(errors).toEqual([]);
});

test('移动镜头后的鼠标瞄准仍指向实际目标，地图按钮点击不射击', async ({ page, isMobile }) => {
  test.skip(isMobile, '触控轮盘有独立多指实弹测试');
  await page.goto('/?scene=Game&seed=42&god=1');
  await page.waitForFunction(() => (window.__AVN__?.demo?.camera.zoom ?? 0) >= 6);
  await page.keyboard.down('s');
  await page.waitForFunction(() => window.__AVN__!.demo!.y > 175);
  await page.keyboard.up('s');
  await expect.poll(() => page.evaluate(() => Math.abs(window.__AVN__!.input!.move.y))).toBe(0);
  // 必须在多个已推进的模拟帧中稳定，避免低帧率时两次协议读取落在同一帧。
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        let previous = '',
          stableSince = window.__AVN__!.demo!.time;
        const deadline = performance.now() + 10_000;
        const sample = () => {
          const d = window.__AVN__!.demo!;
          const current = `${d.x},${d.y},${d.camera.scrollX},${d.camera.scrollY}`;
          if (current !== previous) {
            previous = current;
            stableSince = d.time;
          }
          if (d.time - stableSince > 0.2) resolve();
          else if (performance.now() > deadline) reject(new Error('镜头未稳定'));
          else requestAnimationFrame(sample);
        };
        sample();
      }),
  );
  const p = await page.evaluate(() => window.__AVN__!.demo!);
  const point = await worldToScreen(page, p.x + 40, p.y - 25);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForFunction(() => !!window.__AVN__!.input!.fire);
  const aim = await page.evaluate(() => window.__AVN__!.input!.aim!);
  expect(Math.abs(aim.x * -25 - aim.y * 40)).toBeLessThan(0.5);
  await page.mouse.up();
  const before = await page.evaluate(() => window.__AVN__!.demo!.time);
  await page.locator('.demo-map-toggle').click();
  await page.waitForFunction((time) => window.__AVN__!.demo!.time > time + 0.2, before);
  expect(await page.evaluate(() => window.__AVN__!.input!.fire)).toBe(false);
});

test('主城切换地牢后，新触控器仍使用固定摇杆，远拖保持移动', async ({ page, isMobile }, info) => {
  test.skip(!isMobile);
  await page.goto('/?seed=42&god=1');
  await startAdventure(page);
  await page.waitForFunction(() => (window.__AVN__?.demo?.camera.zoom ?? 0) >= 6);
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
  await page.screenshot({ path: info.outputPath('active-move-stick.png'), scale: 'css' });
  await touch('touchend', box.x + 300, y);
  await expect.poll(() => page.evaluate(() => window.__AVN__!.input!.move.x)).toBe(0);
});
