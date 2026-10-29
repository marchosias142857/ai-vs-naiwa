import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type {} from '../fixtures/designedCatalog';
import { mkdir } from 'node:fs/promises';

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
          handler: (html) => html.replace('/src/main.ts', '/tests/fixtures/designedCatalog.ts'),
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

test('new catalog renders full models in every style, including diagonal walls and fixed squares', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.designedCatalog);
  const ids = await page.evaluate(() => window.designedCatalog.ids);
  const themes = ['temple', 'wreck', 'abyss', 'milk'];
  const families = [
    'court',
    'cloister',
    'corner_hall',
    'side_galleries',
    'north_terrace',
    'offset_wings',
    'south_hall',
    'long_octagon',
  ];
  for (const [profile, theme] of themes.entries()) {
    for (const suffix of [...families.map((f) => `${f}_${profile}_0`), 'start', 'chest', 'exit', 'boss']) {
      const id = `designed_v3/${theme}/${suffix}`;
      expect(ids).toContain(id);
      const r = await page.evaluate((id) => window.designedCatalog.show(id), id);
      expect(r.theme).toBe(theme);
      expect(r.portalText).toBe(0);
      for (const b of r.blocks) {
        expect(b.width).toBe(b.bodyWidth);
        expect(b.height).toBe(b.bodyHeight);
        expect(b.scaleX).toBe(b.scaleY);
        expect(b.wholeX).toBeCloseTo(Math.round(b.wholeX));
        expect(b.wholeY).toBeCloseTo(Math.round(b.wholeY));
      }
      for (const p of r.spikes) {
        expect(p.frame.startsWith(theme)).toBe(true);
        expect(p.width % 16).toBe(0);
        expect(p.height % 16).toBe(0);
        expect(p.scaleX).toBe(p.scaleY);
      }
      if (['start', 'chest', 'exit'].includes(suffix)) {
        expect(r.bounds.width).toBeLessThanOrEqual(144);
        expect(r.bounds.height + 9.6).toBeCloseTo(r.bounds.width);
      }
      await page.screenshot({ path: info.outputPath(`${theme}-${suffix}.png`) });
      if (process.env.CATALOG_SCREENSHOTS && info.project.name === 'desktop') {
        await mkdir(process.env.CATALOG_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: join(process.env.CATALOG_SCREENSHOTS, `${theme}-${suffix}.png`) });
      }
    }
  }
  expect(errors).toEqual([]);
});
for (const theme of ['temple', 'wreck', 'abyss', 'milk'] as const)
  test(`authored ${theme} Boss pillars stun a real charging Boss through Arcade`, async ({ page }) => {
    await page.goto(url);
    await page.waitForFunction(() => window.designedCatalog);
    const result = await page.evaluate((theme) => window.designedCatalog.bossCharge(theme), theme);
    expect(result.pillars).toEqual(['pillar', 'pillar', 'pillar', 'pillar']);
    expect(result.action).toBe('stun');
  });
test('actual Arcade motion and sim LOS both stop at diagonal/step wall silhouettes', async ({ page }) => {
  await page.goto(url);
  await page.waitForFunction(() => window.designedCatalog);
  for (const family of ['cloister', 'corner_hall', 'north_terrace', 'side_galleries']) {
    const r = await page.evaluate(
      (id) => window.designedCatalog.probe(id),
      `designed_v3/temple/${family}_0_0`,
    );
    expect(r.legal).toBe(true);
    expect(r.blockedLOS, JSON.stringify({ family, ...r })).toBe(true);
    expect(r.moved).toBeGreaterThan(0);
    expect(r.moved).toBeLessThan(20);
  }
});
test('production selector, revisit and complete JSON restore preserve the manifest and root stream', async ({
  page,
}) => {
  await page.goto(url);
  await page.waitForFunction(() => window.designedCatalog);
  const first = await page.evaluate(() => ({
    manifest: window.designedCatalog.manifest(),
    root: window.designedCatalog.root(),
  }));
  for (let id = 0; id < first.manifest.templateIds.length; id++)
    expect(await page.evaluate((id) => window.designedCatalog.visit(id), id)).toBe(
      first.manifest.templateIds[id],
    );
  expect(await page.evaluate(() => window.designedCatalog.visit(0))).toBe(first.manifest.templateIds[0]);
  const state = await page.evaluate(() => window.designedCatalog.save());
  await page.evaluate((state) => window.designedCatalog.restore(state), state);
  await page.waitForFunction(() => window.designedCatalog.generation === 2);
  expect(await page.evaluate(() => window.designedCatalog.manifest())).toEqual(first.manifest);
  expect(await page.evaluate(() => window.designedCatalog.root())).toBe(first.root);
  expect(await page.evaluate(() => window.designedCatalog.save())).toEqual(state);
});
test('repeated themed room changes keep display and texture pools bounded', async ({ page }) => {
  await page.goto(url);
  await page.waitForFunction(() => window.designedCatalog);
  const counts = await page.evaluate(() => {
    const ids = ['temple', 'wreck', 'abyss', 'milk'].map((t) => `designed_v3/${t}/cloister_0_0`);
    for (const id of ids) window.designedCatalog.show(id);
    const first = window.designedCatalog.show(ids[0]!);
    for (let i = 0; i < 40; i++) window.designedCatalog.show(ids[i % ids.length]!);
    const last = window.designedCatalog.show(ids[0]!);
    return { first: [first.childCount, first.textureCount], last: [last.childCount, last.textureCount] };
  });
  expect(counts.last).toEqual(counts.first);
});
