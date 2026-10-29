import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type {} from '../fixtures/playerAutoAim';
import { WEAPONS } from '../../src/data/weapons';

let directory: string, url: string, server: ReturnType<typeof createServer>;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'naiwa-player-aim-'));
  await build({
    configFile: resolve('vite.config.ts'),
    logLevel: 'silent',
    build: { outDir: directory },
    plugins: [
      {
        name: 'player-aim-fixture',
        transformIndexHtml: {
          order: 'pre',
          handler: (html) => html.replace('/src/main.ts', '/tests/fixtures/playerAutoAim.ts'),
        },
      },
    ],
  });
  const mime: Record<string, string> = {
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    void readFile(join(directory, path === '/' ? 'index.html' : path))
      .then((data) => {
        res.setHeader('Content-Type', mime[extname(path)] ?? 'text/html');
        res.end(data);
      })
      .catch(() => res.writeHead(404).end());
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('no address');
  url = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (server)
    await new Promise<void>((done) => {
      server.close(() => done());
      server.closeAllConnections();
    });
  if (directory) await rm(directory, { recursive: true, force: true });
});

for (const weapon of ['pistol_basic', 'fin_boomerang', 'lantern_beam', 'cutlass'] as const) {
  for (const source of ['pointer', 'gamepad'] as const) {
    test(`production aim: ${source} ${weapon}`, async ({ page, context, isMobile }, info) => {
      test.skip(source === 'gamepad' && isMobile, 'gamepad covered on desktop');
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      if (source === 'gamepad')
        await page.addInitScript(() => {
          const pad = {
            id: 'Aim fixture pad',
            index: 0,
            connected: true,
            mapping: 'standard',
            timestamp: 0,
            axes: [0, 0, 0, 0],
            buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
          };
          Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
          window.addEventListener('test-fire', () => {
            pad.axes = [0, 0, -1, 0];
            pad.buttons[7] = { pressed: true, touched: true, value: 1 };
            pad.timestamp = performance.now();
          });
        });
      await page.goto(url);
      await page.waitForFunction(() => window.playerAutoAim);
      const point = await page.evaluate((w) => window.playerAutoAim.prepare(w), weapon);
      if (source === 'gamepad') await page.evaluate(() => window.dispatchEvent(new Event('test-fire')));
      else if (isMobile) {
        const cdp = await context.newCDPSession(page);
        // Signed subpixel offset on the original touchstart, not a fabricated InputFrame.
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ id: 1, x: point.fire.x - 0.25, y: point.fire.y }],
        });
      } else {
        await page.mouse.move(point.mouse.x, point.mouse.y);
        await page.mouse.down();
      }
      await expect.poll(() => page.evaluate(() => window.playerAutoAim.read().input.fire)).toBe(true);
      const result = await page.evaluate(() => window.playerAutoAim.tick());
      expect(result.input.aim!.x).toBeCloseTo(-1, 4);
      const automatic = weapon === 'pistol_basic' || weapon === 'fin_boomerang';
      expect(result.facing).toBeCloseTo(automatic ? Math.PI / 2 : Math.PI, 4);
      if (weapon === 'cutlass') expect(result.melee).toEqual({ active: true, angle: result.facing });
      else {
        expect(result.shots).toHaveLength(1);
        expect(result.shots[0]!.angle).toBeCloseTo(result.facing, 12);
      }
      if (weapon === 'lantern_beam') expect(result.beam).toEqual({ active: true, angle: result.facing });
      if (weapon === 'pistol_basic') {
        expect(result.bullets).toHaveLength(1);
        expect(result.bullets[0]!.y).toBeGreaterThan(0);
        const angle = Math.atan2(result.bullets[0]!.y, result.bullets[0]!.x);
        expect(Math.abs(angle - result.facing)).toBeLessThanOrEqual(
          (WEAPONS.pistol_basic.spread * Math.PI) / 360,
        );
      }
      if (weapon === 'fin_boomerang') {
        expect(result.specialShots).toHaveLength(1);
        expect(result.specialShots[0]!.vy).toBeGreaterThan(0);
      }
      expect(errors).toEqual([]);
      await info.attach('real-input-attack', {
        body: JSON.stringify(result),
        contentType: 'application/json',
      });
      await page.screenshot({ path: info.outputPath(`${source}-${weapon}.png`), scale: 'css' });
    });
  }
}

test('production LOS blocks auto target and preserves mouse fallback', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse path');
  await page.goto(url);
  await page.waitForFunction(() => window.playerAutoAim);
  const point = await page.evaluate(() => window.playerAutoAim.prepare('pistol_basic', true));
  await page.mouse.move(point.mouse.x, point.mouse.y);
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => window.playerAutoAim.read().input.fire)).toBe(true);
  const result = await page.evaluate(() => window.playerAutoAim.tick());
  expect(result.shots).toHaveLength(1);
  expect(result.shots[0]!.angle).toBeCloseTo(Math.PI, 4);
  expect(result.bullets[0]!.x).toBeLessThan(0);
});

test('charge release keeps its original trigger and faces the auto target on the release step', async ({
  page,
  context,
  isMobile,
}) => {
  await page.goto(url);
  await page.waitForFunction(() => window.playerAutoAim);
  const point = await page.evaluate(() => window.playerAutoAim.prepare('coral_bow'));
  const cdp = await context.newCDPSession(page);
  if (isMobile)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, ...point.fire }],
    });
  else {
    await page.mouse.move(point.mouse.x, point.mouse.y);
    await page.mouse.down();
  }
  await expect.poll(() => page.evaluate(() => window.playerAutoAim.read().input.fire)).toBe(true);
  const holding = await page.evaluate(() => window.playerAutoAim.tick(60));
  expect(holding.shots).toHaveLength(0);
  if (isMobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.playerAutoAim.read().input.fire)).toBe(false);
  const released = await page.evaluate(() => window.playerAutoAim.tick());
  expect(released.shots).toHaveLength(1);
  expect(released.shots[0]!.angle).toBeCloseTo(Math.PI / 2);
  expect(released.bodyFacing).toBeCloseTo(released.shots[0]!.angle);
});
