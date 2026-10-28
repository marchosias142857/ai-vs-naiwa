/* global document */
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';

const baseline = process.env.MAP_ART_BASELINE;
if (!baseline) throw Error('Set MAP_ART_BASELINE to the isolated f386549 checkout.');
const temp = await mkdtemp(join(tmpdir(), 'map-art-benchmark-'));
const roots = { baseline: resolve(baseline), candidate: resolve('.') };
const baselineHead = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: roots.baseline,
  encoding: 'utf8',
}).trim();
if (baselineHead !== 'f3865490d928ad1056e0c3ff1f08101ec58ae0c4') throw Error('Unexpected map art baseline');
// Guard against accidentally measuring a candidate which never enables the provider.
const stress = await readFile(join(roots.candidate, 'src/debug/StressRun.ts'), 'utf8');
if (!stress.includes('geometry: () => this.arena?.prepareGeometry() ?? null'))
  throw Error('Missing production geometry provider');

// Build unmodified production sources from each checkout. Both use the existing capacity
// profile (7 enemy kinds incl. boss, 30 actors + 400 bullets); both use the same rectangular stress geometry; both variants render modular art.
const bundles = {};
for (const [variant, root] of Object.entries(roots)) {
  await build({
    root,
    configFile: join(root, 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir: join(temp, variant) },
  });
  const sw = await readFile(join(temp, variant, 'sw.js'), 'utf8');
  const files = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
  bundles[variant] = {
    precacheFiles: files.length,
    precacheBytes: (await Promise.all(files.map((f) => stat(join(temp, variant, f))))).reduce(
      (n, s) => n + s.size,
      0,
    ),
  };
}
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = join(temp, path.endsWith('/') ? path + 'index.html' : path);
  readFile(file)
    .then((data) =>
      res
        .writeHead(200, {
          'Content-Type':
            { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' }[
              extname(file)
            ] ?? 'text/html',
        })
        .end(data),
    )
    .catch(() => res.writeHead(404).end());
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  executablePath: process.env.GEOMETRY_BROWSER,
  args: JSON.parse(process.env.GEOMETRY_BROWSER_ARGS ?? '[]'),
});
const reports = [];
try {
  for (const variant of ['baseline', 'candidate', 'baseline', 'candidate']) {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/${variant}/?stress=1&seed=42`);
    await page.waitForFunction(
      () => document.querySelector('#stress-panel')?.dataset.ready === 'true',
      null,
      { timeout: 60000 },
    );
    await page.getByRole('button', { name: '重新计时', exact: true }).click();
    await page.waitForFunction(
      () => Number(document.querySelector('#stress-panel')?.dataset.frames) >= 240,
      null,
      { timeout: 120000 },
    );
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
    const file = join(temp, `report-${reports.length}.json`);
    await (await pending).saveAs(file);
    const report = JSON.parse(await readFile(file, 'utf8'));
    if (report.actorMin !== 30 || report.bulletMin !== 400 || report.peakBullets !== 400)
      throw Error(
        `Invalid fixed load: ${report.actorMin} enemies, ${report.bulletMin}–${report.peakBullets} bullets`,
      );
    reports.push({ variant, ...report });
    console.log(
      JSON.stringify({
        variant,
        fps: report.averageFps,
        p95: report.p95Ms,
        draws: report.drawAverage,
        actors: report.actorMin,
        bullets: report.bulletMin,
        children: [report.minChildren, report.maxChildren],
      }),
    );
    await context.close();
  }
  await writeFile(
    'docs/testing/wall-art-v2/performance.json',
    JSON.stringify(
      {
        baseline: baselineHead,
        method:
          'ABAB; real production builds; unchanged standard StressRun capacity profile with 7 enemy kinds including boss. Fixed seed 42; measured and asserted 30 enemies + 400 bullets; 1920x1080 DPR1; >=240 render frames after warm-up; no concurrent browser tests. StressRun has no HazardLayer, so this measures geometry/AI/navigation plus normal rendering, not dense rain VFX or every theme. Both revisions render modular room art. Baseline is the rejected f386549 wall renderer; candidate uses upright cuboid wall modules sorted by y/x, ground-v2, blocks-v2, approved connected wall-model-v12, side-doors-v2 and an 8-pixel/world-unit room bake. No concurrent browser tests. Software renderer is not phone FPS.',
        bundles,
        reports,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await rm(temp, { recursive: true, force: true });
}
