import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type {} from '../fixtures/monsterArt';

let directory: string, url: string, server: ReturnType<typeof createServer>;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'naiwa-monster-art-'));
  await build({
    configFile: resolve('vite.config.ts'),
    logLevel: 'silent',
    build: { outDir: directory },
    plugins: [
      {
        name: 'monster-art-fixture',
        transformIndexHtml: {
          order: 'pre',
          handler: (html) => html.replace('/src/main.ts', '/tests/fixtures/monsterArt.ts'),
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
test('全部怪物实际 PNG 帧有透明留白、硬像素 alpha 与完整内容', async ({ page }, info) => {
  await page.goto(url);
  await page.waitForFunction(() => window.monsterAtlas);
  const result = await page.evaluate(() => window.monsterAtlas());
  expect(result.errors).toEqual([]);
  expect(result.monsters).toBe(16);
  expect(result.frames).toBeGreaterThan(350);
  await info.attach('atlas-audit', { body: JSON.stringify(result), contentType: 'application/json' });
});
test('全部动作/翻面/腾空不动 Arcade 身体，墙角/圆桶/恢复及大→小槽位复用', async ({ page }, info) => {
  await page.goto(url);
  await page.waitForFunction(() => window.monsterBodies);
  const result = await page.evaluate(() => window.monsterBodies());
  expect(result.errors).toEqual([]);
  expect(result.acquisitions).toBe(34);
  expect(result.frames).toBeGreaterThan(1000);
  await info.attach('body-audit', { body: JSON.stringify(result), contentType: 'application/json' });
});
