import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type {} from '../fixtures/skillAnimation';
import { GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE } from '../../src/config';

let directory: string, url: string, server: ReturnType<typeof createServer>;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'naiwa-skill-animation-'));
  await build({
    configFile: resolve('vite.config.ts'),
    logLevel: 'silent',
    build: { outDir: directory },
    plugins: [
      {
        name: 'skill-animation-fixture',
        transformIndexHtml: {
          order: 'pre',
          handler: (html) => html.replace('/src/main.ts', '/tests/fixtures/skillAnimation.ts'),
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
test('技能进度/冷启动读档/冻结/零装饰预算与碰撞体隔离', async ({ page }, info) => {
  await page.goto(url);
  await page.waitForFunction(() => window.skillAudit);
  // Verify the actual drawing buffer on both viewport sizes; CSS enlargement must not mask 270p.
  const canvas = page.locator('#game canvas');
  expect(await canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([
    GAME_WIDTH * RENDER_SCALE,
    GAME_HEIGHT * RENDER_SCALE,
  ]);
  await page.evaluate(() => window.skillDense('load'));
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width / bounds!.height).toBeCloseTo(GAME_WIDTH / GAME_HEIGHT, 2);
  const result = await page.evaluate(() => window.skillAudit());
  expect(result.errors).toEqual([]);
  expect(result.samples).toBeGreaterThan(40);
  expect(result.frozen).toBeGreaterThan(20);
  expect(result.cues).toBeGreaterThan(15);
  await info.attach('skill-audit', { body: JSON.stringify(result), contentType: 'application/json' });
});

test('落点首步、早段、末段在零预算、冻结和读档下保持高对比四角', async ({ page }, info) => {
  await page.goto(url);
  await page.waitForFunction(() => window.landingAudit);
  const result = await page.evaluate(() => window.landingAudit());
  expect(result.errors).toEqual([]);
  expect(result.records).toHaveLength(8);
  expect(result.denseActors).toBe(30);
  expect(result.denseRocks).toBe(7);
  await info.attach('landing-audit', { body: JSON.stringify(result), contentType: 'application/json' });
});
