import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type {} from '../fixtures/productionGeometry';
import { ENEMIES } from '../../src/data/enemies';

let directory: string, url: string, server: ReturnType<typeof createServer>;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'naiwa-production-geometry-'));
  await build({
    configFile: resolve('vite.config.ts'),
    logLevel: 'silent',
    build: { outDir: directory },
    plugins: [
      {
        name: 'production-geometry-fixture',
        transformIndexHtml: {
          order: 'pre',
          handler: (html) => html.replace('/src/main.ts', '/tests/fixtures/productionGeometry.ts'),
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
for (const scenario of ['pillar', 'boundary', 'near-wall', 'rain', 'brood', 'los', 'hop'] as const)
  test(`production geometry: ${scenario}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.productionGeometry);
    const result = await page.evaluate((s) => window.productionGeometry.run(s), scenario);
    expect(errors).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.checked).toBeGreaterThan(scenario === 'rain' ? 4 : 0);
    if (scenario === 'brood') expect(result.checked).toBe(ENEMIES.naiwa_brood.summon.count);
    if (scenario === 'rain') expect(result.actions.some((a) => a.action === 'rain')).toBe(true);
    await info.attach(scenario, { body: JSON.stringify(result), contentType: 'application/json' });
    if (scenario === 'near-wall')
      await info.attach('actual-arcade-stun', { body: await page.screenshot(), contentType: 'image/png' });
  });

test('production geometry: fresh session restore sees the landed pool before the first step', async ({
  page,
}) => {
  await page.goto(url);
  await page.waitForFunction(() => window.productionGeometry);
  const state = await page.evaluate(() => window.productionGeometry.rockSave());
  await page.evaluate((s) => window.productionGeometry.restore(s), state);
  await page.waitForFunction(() => window.productionGeometry.restored);
  expect(await page.evaluate(() => window.productionGeometry.rockPresent())).toBe(true);
});

for (const floor of [1, 2, 3, 4])
  test(`map art dense showcase: floor ${floor}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.productionGeometry);
    const report = await page.evaluate((f) => window.productionGeometry.showcase(f), floor);
    expect(report.actors).toBeGreaterThan(20);
    expect(report.rocks).toBe(7);
    expect(report.bullets).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath(`map-dense-${floor}.png`), scale: 'css' });
    await info.attach('dense-scene', { body: JSON.stringify(report), contentType: 'application/json' });
  });

for (const floor of [1, 2, 3, 4])
  test(`map wall review: floor ${floor}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url + '/?missing=legacy-doors');
    await page.waitForFunction(() => window.productionGeometry);
    for (const focus of [
      'room',
      'door',
      'corner',
      'side-open',
      'side-locked',
      'obstacle',
      'north',
      'south',
      'east',
      'west',
    ] as const) {
      const report = await page.evaluate(
        ({ floor, focus }) => window.productionGeometry.walls(floor, focus),
        { floor, focus },
      );
      expect(report.doors).toBe(report.expectedDoors);
      expect(report.lockedDoors).toBe(focus === 'side-locked' ? report.expectedDoors : 0);
      if (focus.startsWith('side')) expect(report.sideDoors).toBeGreaterThan(0);
      if (focus === 'south') expect(report.southAlignment).toBeCloseTo(0, 8);
      await page.screenshot({ path: info.outputPath(`wall-${floor}-${focus}.png`), scale: 'css' });
    }
    expect(errors).toEqual([]);
  });

test('map object atlas missing uses graybox without missing object frames', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (/missing|not found/i.test(message.text()) && /texture|frame/i.test(message.text()))
      errors.push(message.text());
  });
  await page.goto(url + '/?missing=objects');
  await page.waitForFunction(() => window.productionGeometry);
  expect(errors).toEqual([]);
});

for (const floor of [1, 2, 3])
  test(`unified trap states and inset borders: floor ${floor}`, async ({ page }, info) => {
    await page.goto(url);
    await page.waitForFunction(() => window.productionGeometry);
    await page.evaluate((f) => window.productionGeometry.walls(f, 'room'), floor);
    for (const state of ['idle', 'warn', 'on', 'broken'] as const) {
      const frames = await page.evaluate((s) => window.productionGeometry.trapState(s), state);
      expect(frames.length).toBeGreaterThan(0);
      if (floor < 3 && state !== 'broken') expect(frames).toContain(`spikes_${state}`);
      if (floor === 2)
        expect(frames).toContain(
          state === 'broken' ? 'barrel_broken' : state === 'idle' ? 'barrel' : 'barrel_hit',
        );
      await page.screenshot({ path: info.outputPath(`unified-traps-${floor}-${state}.png`), scale: 'css' });
    }
  });

test('unified chest, exit and supply pickups use actual game objects', async ({ page }, info) => {
  await page.goto(url);
  await page.waitForFunction(() => window.productionGeometry);
  for (const kind of ['chest', 'exit'] as const) {
    const frames = await page.evaluate((k) => window.productionGeometry.objects(k), kind);
    expect(frames).toContain(kind === 'chest' ? 'chest_open' : 'crystal');
    for (const name of ['pickup_coin', 'pickup_energy', 'pickup_health']) expect(frames).toContain(name);
    await page.screenshot({ path: info.outputPath(`unified-${kind}.png`), scale: 'css' });
  }
});
