import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type {} from '../fixtures/fx-render';

let directory: string, url: string, server: ReturnType<typeof createServer>;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'naiwa-fx-'));
  await build({
    configFile: false,
    root: resolve('tests/fixtures'),
    base: './',
    logLevel: 'silent',
    build: { outDir: directory, rollupOptions: { input: resolve('tests/fixtures/fx-render.html') } },
  });
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    void readFile(join(directory, path === '/' ? 'fx-render.html' : path))
      .then((data) => {
        res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/html');
        res.end(data);
      })
      .catch(() => res.writeHead(404).end());
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  url = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (server) await new Promise<void>((done) => server.close(() => done()));
  if (directory) await rm(directory, { recursive: true, force: true });
});
test('100 火花 ABAB 渲染：纹理复用减少几何提交，保持画布和批次', async ({ page }, info) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.fxRenderResult, undefined, { timeout: 50_000 });
  const result = (await page.evaluate(() => window.fxRenderResult))!;
  await info.attach('fx-render-comparison', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  expect(result.canvas).toEqual([1920, 1080]);
  expect(result.samples.map((s) => s.mode)).toEqual(['arc', 'image', 'arc', 'image']);
  for (let i = 0; i < 4; i += 2) {
    const old = result.samples[i]!,
      next = result.samples[i + 1]!;
    expect(old.indices).toBe(100 * old.arcTriangles * 3);
    expect(next.indices).toBe(600);
    expect(next.indices).toBeLessThan(old.indices / 40);
    expect(next.calls).toBeLessThanOrEqual(old.calls);
  }
  // 不对共享机器的 CPU 时间设阈值，更不据此推断真机帧率。
  expect(errors).toEqual([]);
});
