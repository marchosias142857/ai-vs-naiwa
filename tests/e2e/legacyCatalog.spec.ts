import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileRoom } from '../../src/sim/dungeon/compileRoom';
import { roomTemplate } from '../../src/sim/dungeon/roomCatalog';
import { floorStyle } from '../../src/sim/dungeon/floorStyle';
import { DUNGEON } from '../../src/data/dungeon';
import type {} from '../fixtures/legacyCatalog';

let directory: string, url: string, server: ReturnType<typeof createServer>;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'naiwa-legacy-catalog-'));
  await build({
    configFile: false,
    root: resolve('tests/fixtures'),
    publicDir: resolve('public'),
    base: './',
    logLevel: 'silent',
    build: { outDir: directory, rollupOptions: { input: resolve('tests/fixtures/legacyCatalog.html') } },
  });
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    void readFile(join(directory, path === '/' ? 'legacyCatalog.html' : path))
      .then((data) => {
        res.setHeader(
          'Content-Type',
          path.endsWith('.js')
            ? 'text/javascript'
            : path.endsWith('.css')
              ? 'text/css'
              : path.endsWith('.png')
                ? 'image/png'
                : 'text/html',
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
      expect(result.rows).toHaveLength(
        floor === DUNGEON.floors + 1 ? 2 : DUNGEON.mainRooms + DUNGEON.branchRooms,
      );
      expect(result.unchangedByFreeze).toBe(true);
      const start = compileRoom(roomTemplate(`designed_v3/${floorStyle(seed, floor)}/start`)!);
      expect(result.bounds).toEqual(start.bounds);
      expect(result.center).toEqual(start.anchors.player);
      expect(new Set(result.rows.map((r) => r.templateId)).size).toBe(result.rows.length);
      for (const row of result.rows) {
        expect(row.templateId).toBe(row.expectedId);
        expect(row.templateId.startsWith(`designed_v3/${floorStyle(seed, floor)}/`)).toBe(true);
        expect(row.form).toBe(row.kind);
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

test('every generated linked door uses the selected template port and safe destination', async ({
  page,
}, info) => {
  await page.goto(`${url}?seed=42`);
  await page.waitForFunction(() => window.legacyCatalog);
  const reports = [];
  for (let floor = 1; floor <= 4; floor++) {
    const report = await page.evaluate(() => window.legacyCatalog.probeShape());
    reports.push(report);
    expect(report.floor).toBe(floor);
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
