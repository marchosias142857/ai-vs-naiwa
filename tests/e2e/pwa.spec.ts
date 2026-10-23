import { expect, test } from '@playwright/test';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { build } from 'vite';

const prefix = '/ai-vs-naiwa/';
let directory: string;
let servedDirectory: string;
let url: string;
let server: ReturnType<typeof createServer>;
const mime: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'naiwa-pwa-'));
  servedDirectory = join(directory, 'v1');
  await cp('dist', servedDirectory, { recursive: true });
  // 同一份相对路径构建挂在真实子路径；不使用 Vite 的 SPA 回退掩盖错误路径。
  server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (!pathname.startsWith(prefix)) {
      res.writeHead(404).end();
      return;
    }
    const file = join(servedDirectory, pathname.slice(prefix.length) || 'index.html');
    void readFile(file)
      .then((data) => {
        res.writeHead(200, {
          'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(data);
      })
      .catch(() => res.writeHead(404).end());
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务器未启动');
  url = `http://127.0.0.1:${address.port}${prefix}`;
});

test.afterEach(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  await rm(directory, { recursive: true, force: true });
});

test('子路径 manifest、安装条件、断网刷新及关闭后重开', async ({ page, context }, info) => {
  await page.goto(`${url}?seed=42`);
  await page.waitForFunction(() => window.__AVN__?.scene === 'Menu' && navigator.serviceWorker.controller);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(url);
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest');
  expect(manifest.errors).toEqual([]);
  const parsed = JSON.parse(manifest.data ?? '{}') as {
    start_url: string;
    scope: string;
    icons: { src: string }[];
  };
  expect(parsed).toMatchObject({ name: 'AI 大战奶蛙', display: 'standalone', orientation: 'landscape' });
  expect(new URL(parsed.start_url, manifest.url).href).toBe(url);
  expect(new URL(parsed.scope, manifest.url).href).toBe(url);
  for (const icon of parsed.icons) {
    const response = await page.request.get(new URL(icon.src, manifest.url).href);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toBe('image/png');
  }
  expect((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Menu');
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`${url}?scene=Game&seed=7`);
  await reopened.waitForFunction(() => window.__AVN__?.scene === 'Game');
  expect(await reopened.evaluate(() => window.__AVN__?.seed)).toBe(7);
  await expect(reopened.locator('#game canvas')).toBeVisible();
  await reopened.screenshot({ path: info.outputPath('pwa-offline.png') });
});

test('连续发布只提示更新，稍后及另一标签页均不强制刷新', async ({ page, context }, info) => {
  test.setTimeout(60_000);
  await page.goto(`${url}?scene=Game&seed=42`);
  await page.waitForFunction(() => window.__AVN__?.scene === 'Game' && navigator.serviceWorker.controller);
  const other = await context.newPage();
  await other.goto(`${url}?scene=Game&seed=7`);
  await other.waitForFunction(() => window.__AVN__?.scene === 'Game' && navigator.serviceWorker.controller);
  // 用同一 VitePWA 配置真实重建，仅给 HTML 加版本标记，不伪造或手写 SW。
  const publish = async (version: number) => {
    const next = join(directory, `v${version}`);
    await build({
      configFile: resolve('vite.config.ts'),
      build: { outDir: next, emptyOutDir: true },
      logLevel: 'silent',
      plugins: [
        {
          name: 'test-version',
          transformIndexHtml: (html) =>
            html.replace('</head>', `<meta name="pwa-test-version" content="${version}"></head>`),
        },
      ],
    });
    servedDirectory = next;
  };
  await publish(2);
  await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
  await expect(page.locator('#pwa-update')).toBeVisible();
  await expect(other.locator('#pwa-update')).toBeVisible();
  await page.screenshot({ path: info.outputPath('pwa-update.png') });
  await page.getByRole('button', { name: '稍后' }).click();
  await expect(page.locator('#pwa-update')).toBeHidden();
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state)).toBe(
    'installed',
  );
  await expect(page.locator('meta[name="pwa-test-version"]')).toHaveCount(0);
  await other.getByRole('button', { name: '点击刷新' }).click();
  await expect(other.locator('meta[name="pwa-test-version"]')).toHaveAttribute('content', '2');
  await expect(page.locator('#pwa-update')).toBeVisible();
  await expect(page.locator('meta[name="pwa-test-version"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__AVN__?.seed)).toBe(42);
  // 同一局可跨过多次发布；点击刷新必须激活最新 waiting 版本，不能只重载上一个版本。
  await page.getByRole('button', { name: '稍后' }).click();
  await publish(3);
  await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
  await expect(page.locator('#pwa-update')).toBeVisible();
  await page.getByRole('button', { name: '点击刷新' }).click();
  await expect(page.locator('meta[name="pwa-test-version"]')).toHaveAttribute('content', '3');
  await expect(other.locator('meta[name="pwa-test-version"]')).toHaveAttribute('content', '2');
});
