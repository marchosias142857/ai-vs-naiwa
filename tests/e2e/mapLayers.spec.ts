import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type {} from '../fixtures/mapLayers';
let directory: string, url: string, server: ReturnType<typeof createServer>;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'naiwa-map-layers-'));
  await build({
    configFile: false,
    root: resolve('tests/fixtures'),
    publicDir: resolve('public'),
    base: './',
    logLevel: 'silent',
    build: { outDir: directory, rollupOptions: { input: resolve('tests/fixtures/mapLayers.html') } },
  });
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    void readFile(join(directory, path === '/' ? 'mapLayers.html' : path))
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

for (const theme of ['temple', 'wreck', 'abyss', 'milk'] as const) {
  test(`${theme}: actors stay above reused obstacles and barrels from either side`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.mapLayerProbe);
    for (const y of [124, 146, 90, 190, 124]) {
      const report = await page.evaluate(({ theme, y }) => window.mapLayerProbe(theme, y), { theme, y });
      expect(report.actors).toBe(3);
      expect(report.blocks).toBe(3);
      expect(report.barrels).toBe(1);
      expect(report.fallback).toBeGreaterThan(0);
      expect(report.hiddenActors).toBe(0);
      expect(report.hiddenWeapon).toBe(false);
    }
    await page.screenshot({ path: info.outputPath(`layers-${theme}.png`) });
    expect(errors).toEqual([]);
  });
  test(`${theme}: random wall-width tiles keep uniform borders and stable revisits`, async ({
    page,
  }, info) => {
    await page.goto(url);
    await page.waitForFunction(() => window.floorPatternProbe);
    const probe = (seed: number) =>
      page.evaluate(({ theme, seed }) => window.floorPatternProbe(theme, seed), { theme, seed });
    const first = await probe(42),
      other = await probe(77),
      restored = await probe(42);
    await info.attach(theme, {
      body: JSON.stringify({ first, other, restored }),
      contentType: 'application/json',
    });
    for (const report of [first, other, restored]) {
      expect(report.unmatched).toBe(0);
      expect(report.wrongBorder).toBe(0);
      expect(report.counts.every((n) => n > 0)).toBe(true);
      expect(report.objects).toBe(first.objects);
      expect(report.textures).toBe(first.textures);
    }
    expect(first.counts.reduce((a, b) => a + b)).toBe(384);
    expect(other.digest).not.toBe(first.digest);
    expect(restored.digest).toBe(first.digest);
    await page.screenshot({ path: info.outputPath(`variant-floor-${theme}.png`) });
  });
}
