import baseline from '../fixtures/legacyV1/production-baseline.json' with { type: 'json' };
import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LEGACY_V1 } from '../../src/data/roomTemplates/legacyV1';
import { MODULAR_V2 } from '../../src/data/roomTemplates/modularV2';
import type {} from '../fixtures/legacyCatalog';

let directory: string, url: string, server: ReturnType<typeof createServer>;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'naiwa-legacy-catalog-'));
  await build({
    configFile: false,
    root: resolve('tests/fixtures'),
    base: './',
    logLevel: 'silent',
    build: { outDir: directory, rollupOptions: { input: resolve('tests/fixtures/legacyCatalog.html') } },
  });
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    void readFile(join(directory, path === '/' ? 'legacyCatalog.html' : path))
      .then((data) => {
        res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/html');
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

for (const seed of [0, 42, 12345, 0xffffffff])
  test(`selectRoomLayouts matches real DemoSession selection and root invariants: seed=${seed}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    const reports: unknown[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${url}?seed=${seed}`);
    await page.waitForFunction(() => window.legacyCatalog);
    for (let floor = 1; floor <= 4; floor++) {
      expect(await page.evaluate(() => window.legacyCatalog.rootAtCreate)).toBe(seed);
      const result = await page.evaluate(() => window.legacyCatalog.inspectFloor());
      reports.push(result);
      expect(result.floor).toBe(floor);
      expect(result.rows).toHaveLength(floor === 4 ? 2 : 8);
      expect(result.unchangedByFreeze).toBe(true);
      expect(result.bounds).toEqual(floor === 4 ? LEGACY_V1.bounds : MODULAR_V2.bounds);
      expect(result.center).toEqual(LEGACY_V1.anchors.player);
      for (const row of result.rows) {
        expect(row.templateId).toBe(row.expectedId);
        const recorded = baseline.selections[String(seed) as keyof typeof baseline.selections][floor - 1]!;
        const legacyId = row.expectedId.replace('modular_v2/', 'legacy_v1/');
        expect(legacyId).toBe(recorded.templateIds[row.id]);
        const original = baseline.templates[legacyId as keyof typeof baseline.templates];
        expect(row.bodies).toEqual(
          legacyId === 'legacy_v1/wreck/combat_1'
            ? original.bodies.map((b) => ({ ...b, width: 56 }))
            : original.bodies,
        );
        expect(row.traps).toEqual(
          legacyId === 'legacy_v1/wreck/combat_2'
            ? original.traps.map((t, i) => (i < 2 ? { ...t, x: 240 + Math.sign(t.x - 240) * 24 } : t))
            : legacyId === 'legacy_v1/wreck/combat_1'
              ? original.traps.map((t, i) => (i === 3 ? { ...t, x: 152 } : t))
              : original.traps,
        );
        expect(row.staticObstacles).toEqual(original.staticObstacles);
        expect(row.form).toBe(row.kind === 'combat' || row.kind === 'boss' ? row.kind : 'empty');
        expect(row.bodies).toEqual(row.expectedBodies);
        expect(row.staticObstacles).toEqual(row.expectedObstacles);
        expect(row.traps).toEqual(row.expectedTraps);
        expect(row.root).toBe(seed);
      }
      for (const entry of result.entrances) expect(entry.actual).toEqual(entry.expected);
      expect(result.root).toBe(seed);
      expect(result.checkpoint.floor).toBe(floor);
      const saved = await page.evaluate(() => window.legacyCatalog.save());
      expect(await page.evaluate(() => window.legacyCatalog.root())).toBe(seed);
      for (const entryOnly of [false, true]) {
        const generation = await page.evaluate(() => window.legacyCatalog.generation);
        await page.evaluate(({ state, entry }) => window.legacyCatalog.restore(state, entry), {
          state: saved,
          entry: entryOnly,
        });
        await page.waitForFunction((n) => window.legacyCatalog.generation > n, generation);
        expect(await page.evaluate(() => window.legacyCatalog.rootAtCreate)).toBe(seed);
        const restored = await page.evaluate(() => window.legacyCatalog.save());
        if (!entryOnly) expect(restored).toEqual(saved);
        else expect(restored.entry).toEqual(saved.entry);
        expect(await page.evaluate(() => window.legacyCatalog.root())).toBe(seed);
      }
      if (floor < 4)
        expect(await page.evaluate(() => window.legacyCatalog.advance())).toEqual({
          advanced: true,
          floor: floor + 1,
          root: seed,
          entryFloor: floor + 1,
        });
    }
    expect(errors).toEqual([]);
    await info.attach('actual-session-layouts', {
      body: JSON.stringify(reports),
      contentType: 'application/json',
    });
  });

test('graybox contours block real Arcade movement and use template ports for every linked door', async ({
  page,
}, info) => {
  await page.goto(`${url}?seed=42`);
  await page.waitForFunction(() => window.legacyCatalog);
  const reports = [];
  for (let floor = 1; floor <= 4; floor++) {
    const report = await page.evaluate(() => window.legacyCatalog.probeShape());
    reports.push(report);
    expect(report.floor).toBe(floor);
    if (floor < 4) {
      expect(report.expansion?.legal).toBe(true);
      expect(report.expansion?.x).toBeCloseTo(102, 1);
    } else expect(report.expansion).toBeNull();
    expect(report.collisions.length).toBe([1, 2, 1, 0][floor - 1]);
    for (const collision of report.collisions) {
      expect(collision.legal).toBe(true);
      expect(collision.stopped).toBe(true);
      expect(collision.fired).toBeGreaterThan(0);
    }
    if (floor === 3) expect(report.navigation).toEqual({ legal: true, crossed: true, blockedLOS: true });
    expect(report.doors.length).toBeGreaterThan(0);
    for (const door of report.doors) expect(door).toEqual({ entered: true, landed: true });
    await page.screenshot({ path: info.outputPath(`graybox-floor-${floor}.png`) });
    if (floor < 4) expect((await page.evaluate(() => window.legacyCatalog.advance())).advanced).toBe(true);
  }
  await info.attach('physical-contours', {
    body: JSON.stringify(reports, null, 2),
    contentType: 'application/json',
  });
});
