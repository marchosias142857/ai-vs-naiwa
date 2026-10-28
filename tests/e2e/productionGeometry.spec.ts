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
