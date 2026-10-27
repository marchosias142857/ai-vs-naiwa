import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { bestiaryCards } from '../../src/sim/meta/bestiary';
import type {} from '../fixtures/bestiary';
import { installPad, padButton, type PadWindow } from './helpers/gamepad';

let directory: string, url: string, server: ReturnType<typeof createServer>;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'naiwa-bestiary-'));
  await build({
    configFile: resolve('vite.config.ts'),
    logLevel: 'silent',
    build: { outDir: directory },
    plugins: [
      {
        name: 'bestiary-fixture',
        transformIndexHtml: {
          order: 'pre',
          handler: (html) => html.replace('/src/main.ts', '/tests/fixtures/bestiary.ts'),
        },
      },
    ],
  });
  const mime: Record<string, string> = {
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.webmanifest': 'application/manifest+json',
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

test('真实主城输入冻结、恢复和开关/重进：DOM、纹理、监听与 alpha 扫描不增长', async ({
  page,
  context,
}, info) => {
  test.setTimeout(60_000);
  await installPad(page);
  await page.addInitScript(() => {
    const read = CanvasRenderingContext2D.prototype.getImageData;
    let count = 0;
    CanvasRenderingContext2D.prototype.getImageData = function (...args: Parameters<typeof read>) {
      count++;
      return read.apply(this, args);
    };
    Object.defineProperty(window, 'bestiaryReads', { get: () => count });
  });
  const reads = () => page.evaluate(() => (window as unknown as { bestiaryReads: number }).bestiaryReads);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.locator('#start-run').click();
  await expect(page.locator('#hub-bestiary')).toBeVisible();
  const cdp = await context.newCDPSession(page);
  const listeners = async () => {
    const counts = [];
    for (const expression of ['window', 'document']) {
      const r = await cdp.send('Runtime.evaluate', { expression, objectGroup: 'bestiary-listeners' });
      const l = await cdp.send('DOMDebugger.getEventListeners', { objectId: r.result.objectId! });
      // Playwright 自身会按需重装命中拦截器；只排除已核实的测试驱动监听。
      counts.push(
        l.listeners.filter(
          (e) =>
            e.type !== '__playwright_global_listeners_check__' &&
            !e.handler?.description?.includes('_hitTargetInterceptor'),
        ).length,
      );
      await info.attach('listeners-' + expression, {
        body: JSON.stringify(
          l.listeners.map((e) => ({
            type: e.type,
            script: e.scriptId,
            line: e.lineNumber,
            description: e.handler?.description,
          })),
        ),
        contentType: 'application/json',
      });
    }
    await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'bestiary-listeners' });
    return counts;
  };
  const original = await page.evaluate(() => window.bestiaryFixture.status()),
    before = await reads();
  await page.locator('#hub-bestiary').click();
  expect((await reads()) - before).toBe(bestiaryCards().length);
  const initial = await page.evaluate(() => window.bestiaryFixture.status()),
    nodes = await page.locator('#bestiary-panel *').count(),
    list = await listeners();
  expect(initial.textures).toBe(original.textures);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    (window as PadWindow).setPadButton!(1, true);
  });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await padButton(page, 1, true);
  await expect(page.locator('#bestiary-panel')).toBeVisible();
  await padButton(page, 1, false);
  await page.keyboard.down('d');
  // 等真实渲染帧，不快进 sim；判断物理位置而不是只判断输入 probe。
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        let frames = 0;
        const step = () => (++frames === 12 ? done() : requestAnimationFrame(step));
        step();
      }),
  );
  expect(await page.evaluate(() => window.bestiaryFixture.status())).toEqual(initial);
  await page.keyboard.press('Escape');
  await page.keyboard.up('d');
  const stopped = await page.evaluate(() => window.bestiaryFixture.status());
  expect(stopped.x).toBe(initial.x);
  expect(stopped.y).toBe(initial.y);
  await page.keyboard.down('d');
  await page.waitForFunction((x) => window.bestiaryFixture.status().x > x, initial.x);
  await page.keyboard.up('d');
  // 新一轮从实际静止开始，区分既有松键减速与关闭后的手柄输入泄漏。
  await page.waitForFunction(() => window.bestiaryFixture.status().vx === 0);
  await page.keyboard.press('i');
  await padButton(page, 1, false);
  await page.evaluate(() => (window as PadWindow).setPadAxes!([1, 0, 0, 0]));
  await padButton(page, 1, true);
  await expect(page.locator('#bestiary-panel')).toBeHidden();
  const held = await page.evaluate(() => window.bestiaryFixture.status().x);
  await padButton(page, 1, false);
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        let frames = 0;
        const step = () => (++frames === 12 ? done() : requestAnimationFrame(step));
        step();
      }),
  );
  expect(await page.evaluate(() => window.bestiaryFixture.status().x)).toBe(held);
  await page.evaluate(() => (window as PadWindow).setPadAxes!([0, 0, 0, 0]));
  const cached = await reads();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('i');
    await expect(page.locator('#bestiary-panel')).toBeVisible();
    await page.keyboard.press('Escape');
  }
  expect(await reads()).toBe(cached);
  await page.keyboard.press('i');
  // 选择可能变化，重新回到首项后比较固定 DOM 数量。
  await page.locator('#bestiary-grid button').first().click();
  expect(await page.locator('#bestiary-panel *').count()).toBe(nodes);
  expect(await listeners()).toEqual(list);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.locator('#pause-menu').click();
    await expect(page.locator('#bestiary-panel')).toHaveCount(0);
    await page.locator('#start-run').click();
    await expect(page.locator('#hub-bestiary')).toBeVisible();
    // 场景重建时 Phaser 文本测量也读 canvas；只比较图鉴打开前后的增量。
    const beforeReopen = await reads();
    await page.locator('#hub-bestiary').click();
    const current = await page.evaluate(() => window.bestiaryFixture.status());
    expect(current).toMatchObject(initial);
    expect(await reads()).toBe(beforeReopen);
    expect(await listeners()).toEqual(list);
    await expect(page.locator('#hub-panel')).toHaveCount(1);
    await expect(page.locator('#bestiary-panel')).toHaveCount(1);
  }
  await info.attach('bestiary-lifecycle', {
    body: JSON.stringify({
      initial,
      nodes,
      listeners: list,
      cropReads: bestiaryCards().length,
      openCycles: 8,
      sceneCycles: 3,
    }),
    contentType: 'application/json',
  });
  expect(errors).toEqual([]);
});
