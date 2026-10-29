import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type {} from '../fixtures/modularArt';
let directory: string, url: string, server: ReturnType<typeof createServer>;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'naiwa-modular-art-'));
  await build({
    configFile: false,
    root: resolve('tests/fixtures'),
    publicDir: resolve('public'),
    base: './',
    logLevel: 'silent',
    build: { outDir: directory, rollupOptions: { input: resolve('tests/fixtures/modularArt.html') } },
  });
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    void readFile(join(directory, path === '/' ? 'modularArt.html' : path))
      .then((data) => {
        res.setHeader(
          'Content-Type',
          path.endsWith('.js') ? 'text/javascript' : path.endsWith('.webp') ? 'image/webp' : 'text/html',
        );
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
test('200 connected layouts per theme reuse the same art and fixed scene objects', async ({ page }, info) => {
  // This intentionally bakes 800 rooms synchronously; software WebGL exceeds the default 30 seconds.
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.modularArt);
  for (const theme of ['temple', 'wreck', 'abyss', 'milk'] as const) {
    const started = performance.now();
    const report = await page.evaluate((t) => window.modularArt(t), theme);
    await info.attach(`${theme}-batch`, {
      body: JSON.stringify({ ...report, millisecondsFor200Rooms: performance.now() - started }),
      contentType: 'application/json',
    });
    expect(report.unique).toBe(200);
    expect(report.allConnected).toBe(true);
    expect(report.after).toEqual(report.before);
    await page.screenshot({ path: info.outputPath(`matrix-${theme}.png`) });
  }
  expect(errors).toEqual([]);
});

test('cuboid tops stay upright; vertical rows hide bases, corners stay opaque and ports open', async ({
  page,
}, info) => {
  await page.goto(url);
  await page.waitForFunction(() => window.wallArtProbe);
  for (const theme of ['temple', 'wreck', 'abyss', 'milk'] as const) {
    const report = await page.evaluate((t) => window.wallArtProbe(t), theme);
    await info.attach(theme, { body: JSON.stringify(report), contentType: 'application/json' });
    expect(report.samples).toBe(9216);
    expect(report.topDifferences, theme).toBe(0);
    expect(report.baseDifferences, theme).toBe(0);
    expect(report.verticalDifferences, theme).toBe(0);
    expect(report.seams, theme).toBe(0);
    expect(report.coverage).toBeGreaterThan(7000);
    expect(report.holes, theme).toBe(0);
    expect(report.doorWallPixels, theme).toBe(0);
    expect(report.openPorts, theme).toBe(5);
  }
});

test('irregular obstacles preserve the textured floor beneath their transparent edges', async ({
  page,
}, info) => {
  await page.goto(url);
  await page.waitForFunction(() => window.obstacleFloorProbe);
  for (const theme of ['temple', 'wreck', 'abyss', 'milk'] as const) {
    const report = await page.evaluate((t) => window.obstacleFloorProbe(t), theme);
    await info.attach(theme, { body: JSON.stringify(report), contentType: 'application/json' });
    expect(report.samples).toBeGreaterThan(9000);
    expect(report.transparentModelPixels, theme).toBeGreaterThan(100);
    expect(report.holes, theme).toBe(0);
    expect(report.changedFloorPixels, theme).toBe(0);
  }
});

test('unified gates have opaque integer-module joins and field rims meet the floor without gaps', async ({
  page,
}, info) => {
  await page.goto(url);
  await page.waitForFunction(() => window.unifiedMapProbe);
  for (const theme of ['temple', 'wreck', 'abyss', 'milk'] as const) {
    const report = await page.evaluate((t) => window.unifiedMapProbe(t), theme);
    await info.attach(theme, { body: JSON.stringify(report), contentType: 'application/json' });
    expect(report.samples).toBeGreaterThan(1000);
    expect(report.rimGaps, theme).toBe(0);
    expect(report.holes, theme).toBe(0);
    expect(report.outsideChanges, theme).toBe(0);
    expect(report.interiorChanges, theme).toBe(0);
    expect(report.frames).toBe(8);
    expect(report.doorPixels).toBeGreaterThan(200000);
    expect(report.doorHoles, theme).toBe(0);
    await page.screenshot({ path: info.outputPath(`unified-rims-${theme}.png`), scale: 'css' });
  }
});
