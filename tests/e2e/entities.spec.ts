import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type {} from '../fixtures/combat';

let directory: string, url: string, server: ReturnType<typeof createServer>;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'naiwa-entities-'));
  await build({
    configFile: false,
    root: resolve('tests/fixtures'),
    base: './',
    logLevel: 'silent',
    build: { outDir: directory, rollupOptions: { input: resolve('tests/fixtures/combat.html') } },
  });
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    void readFile(join(directory, path === '/' ? 'combat.html' : path))
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
test.beforeEach(async ({ page }) => {
  await page.goto(url);
  await page.waitForFunction(() => window.combat);
});

test('预热500、超限退回sim、寿命回收且不新建贴图', async ({ page }) => {
  const initial = await page.evaluate(() => window.combat.snapshot());
  expect(initial.bulletCapacity).toBe(500);
  await page.evaluate(() => window.combat.bullet({}, 501));
  let state = await page.evaluate(() => window.combat.snapshot());
  expect(state.bullets).toBe(500);
  expect(state.logs).toHaveLength(1);
  await page.evaluate(() => window.combat.tick(61));
  state = await page.evaluate(() => window.combat.snapshot());
  expect(state.bullets).toBe(0);
  expect(state.logs).toHaveLength(501);
  await page.evaluate(() => window.combat.bullet({}, 500));
  expect((await page.evaluate(() => window.combat.snapshot())).children).toBe(initial.children);
});
test('实时物理坐标、墙边界、碰撞只报告sim、阶段与死亡回收', async ({ page }, info) => {
  await page.evaluate(() => {
    window.combat.actor(1, { vx: 90 });
    window.combat.tick(1);
  });
  expect((await page.evaluate(() => window.combat.snapshot())).positions[0]!.x).toBeCloseTo(161.5);
  await page.evaluate(() => {
    window.combat.actor(1, { vx: -100000 });
    window.combat.actor(2, { vx: 100000 });
    window.combat.tick(2);
  });
  const state = await page.evaluate(() => window.combat.snapshot());
  expect(state.positions[0]!.x).toBeGreaterThanOrEqual(110);
  expect(state.positions[1]!.x).toBeLessThanOrEqual(370);
  await page.evaluate(() => {
    window.combat.bullet({ x: 200, speed: 100000 });
    window.combat.tick(2);
  });
  expect((await page.evaluate(() => window.combat.snapshot())).logs.some((s) => s.startsWith('wall:'))).toBe(
    true,
  );
  await page.evaluate(() => {
    window.combat.actor(2, { phase: 'telegraph', vx: 0 });
    window.combat.bullet({ x: 370, y: 130 });
    window.combat.tick(1);
  });
  expect((await page.evaluate(() => window.combat.snapshot())).logs.some((s) => s.startsWith('hit:'))).toBe(
    false,
  );
  await page.evaluate(() => {
    window.combat.actor(2, { phase: 'active' });
    window.combat.tick(1);
  });
  expect((await page.evaluate(() => window.combat.snapshot())).logs.some((s) => s.startsWith('hit:'))).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('entities-pool.png') });
  await page.evaluate(() => {
    window.combat.actor(2, { phase: 'dead' });
    window.combat.finishDeath(2);
  });
  expect((await page.evaluate(() => window.combat.snapshot())).actors).toBe(1);
});
