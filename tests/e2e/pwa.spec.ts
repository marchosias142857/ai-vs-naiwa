import { bestiaryCards } from '../../src/sim/meta/bestiary';
import { MAP_ART } from '../../src/data/mapArt';
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
  '.webp': 'image/webp',
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
  await new Promise<void>((done) => {
    server.close(() => done());
    // 离线页面可能仍持有未完成连接，不能让它拖住测试服务器清理。
    server.closeAllConnections();
  });
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
  expect(parsed).toMatchObject({ name: 'AI娘大战奶蛙', display: 'standalone', orientation: 'landscape' });
  expect(new URL(parsed.start_url, manifest.url).href).toBe(url);
  expect(new URL(parsed.scope, manifest.url).href).toBe(url);
  for (const icon of parsed.icons) {
    const response = await page.request.get(new URL(icon.src, manifest.url).href);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toBe('image/png');
  }
  expect((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
  await page.locator('#demo-menu-panel summary').click();
  await page.locator('#demo-menu-panel .settings-layout').click();
  await page.getByRole('slider', { name: '透明度', exact: true }).fill('40');
  await page.locator('#layout-save').click();
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Menu');
  const title = await page.evaluate(async () => {
    const response = await fetch('assets/demo/title-confrontation-v1.webp');
    return { ok: response.ok, size: (await response.blob()).size };
  });
  expect(title.ok).toBe(true);
  expect(title.size).toBeGreaterThan(1000);
  expect(title.size).toBeLessThan(2 * 1024 * 1024);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`${url}?scene=Game&seed=7`);
  await reopened.waitForFunction(() => window.__AVN__?.scene === 'Game');
  await reopened.waitForFunction(() => !!window.__AVN__?.demo?.visual);
  await expect(reopened.locator('.vital-health')).toHaveCSS('opacity', '0.4');
  // 正式图集同样必须离线可用；仅有 Game 场景会漏掉图片加载失败的灰盒回退。
  const art = await reopened.evaluate(async () =>
    Promise.all(
      [
        'da-fei-yu-pixel-v2',
        'da-fei-yu-pixel-reactions-v1',
        'weapons',
        'enemies',
        'environment',
        'doors',
        'monsters-v4',
        'naiguai-v4',
        'arsenal-v1',
        'rooms-v1',
        'talent-altar-v1',
      ].map(async (name) => {
        const response = await fetch(`assets/demo/${name}.png`);
        const blob = await response.blob();
        const bitmap = name === 'talent-altar-v1' ? await createImageBitmap(blob) : undefined;
        const dimensions = bitmap ? [bitmap.width, bitmap.height] : undefined;
        bitmap?.close();
        return {
          name,
          ok: response.ok,
          type: response.headers.get('content-type'),
          size: blob.size,
          dimensions,
        };
      }),
    ),
  );
  for (const file of art) {
    expect(file.ok).toBe(true);
    expect(file.type).toBe('image/png');
    expect(file.size).toBeGreaterThan(1000);
    if (file.name === 'talent-altar-v1') {
      expect(file.dimensions).toEqual([528, 528]);
      expect(file.size).toBeLessThan(300 * 1024);
    }
  }
  const modules = await reopened.evaluate(
    async (sources) =>
      Promise.all(
        sources.map(async (source) => {
          const response = await fetch(`assets/demo/${source}`);
          const blob = await response.blob();
          const bitmap = await createImageBitmap(blob);
          const report = { ok: response.ok, type: blob.type, size: blob.size, width: bitmap.width };
          bitmap.close();
          return report;
        }),
      ),
    Object.values(MAP_ART.sources),
  );
  for (const file of modules) {
    expect(file.ok).toBe(true);
    expect(file.type).toBe('image/webp');
    expect(file.size).toBeLessThan(2 * 1024 * 1024);
    expect(file.width).toBeGreaterThan(1000);
  }
  expect(await reopened.evaluate(() => window.__AVN__?.seed)).toBe(7);
  await expect(reopened.locator('#game canvas')).toBeVisible();
  await reopened.screenshot({ path: info.outputPath('pwa-offline.png') });
  await reopened.keyboard.press('Escape');
  await reopened.locator('#pause-menu').click();
  await reopened.locator('#start-run').click();
  await reopened.locator('#hub-bestiary').click();
  await expect(reopened.locator('#bestiary-grid button')).toHaveCount(bestiaryCards().length);
  for (const card of bestiaryCards()) {
    await reopened.locator(`[data-enemy="${card.id}"]`).click();
    await expect(reopened.locator('#bestiary-detail .bestiary-art')).toBeVisible();
  }
  await reopened.screenshot({ path: info.outputPath('bestiary-offline.png'), scale: 'css' });
});

test('连续发布只提示更新，稍后及另一标签页均不强制刷新', async ({ page, context, isMobile }, info) => {
  test.setTimeout(60_000);
  const initialViewport = page.viewportSize()!;
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
      define: { __APP_RELEASE__: JSON.stringify(`pwa-test-release-${version}`) },
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
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#rotate-overlay')).toBeVisible({ visible: isMobile });
  await page.screenshot({ path: info.outputPath('pwa-update-portrait.png') });
  await page.getByRole('button', { name: '稍后' }).click();
  await expect(page.locator('#pwa-update')).toBeHidden();
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state)).toBe(
    'installed',
  );
  await expect(page.locator('meta[name="pwa-test-version"]')).toHaveCount(0);
  await other.getByRole('button', { name: '点击刷新' }).click();
  await expect(other.locator('meta[name="pwa-test-version"]')).toHaveAttribute('content', '2');
  await expect(other.locator('#demo-menu-panel')).toBeVisible();
  await expect(other.locator('#continue-run')).toBeDisabled();
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
  await page.setViewportSize(initialViewport);
  await expect(page.locator('#demo-menu-panel')).toBeVisible();
  await expect(page.locator('#continue-run')).toBeDisabled();
  await expect(other.locator('meta[name="pwa-test-version"]')).toHaveAttribute('content', '2');
});
