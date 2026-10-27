/* global document */
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';

const baseline = process.env.SKILL_BASELINE;
if (!baseline) throw Error('Set SKILL_BASELINE to the isolated PR #113 checkout.');
const temp = await mkdtemp(join(tmpdir(), 'skill-benchmark-'));
const roots = { baseline: resolve(baseline), candidate: resolve('.') };
// Original StressRun does not construct HazardLayer. Apply the SAME diagnostic harness
// to both builds so the comparison actually includes skill tells, rocks and ground effects.
let harness = await readFile(join(roots.baseline, 'src/debug/StressRun.ts'), 'utf8');
harness = "import { HazardLayer } from '../game/fx/HazardLayer';\n" + harness;
harness = harness.replace('  readonly fx;', '  readonly fx;\n  readonly hazards;');
harness = harness.replace(
  "  'naiwa_boss',",
  "  'naiwa_boss',\n  'naiwa_hopper',\n  'naiwa_tongue',\n  'naiwa_brood',\n  'naiwa_burrower',\n  'naiwa_dancer',\n  'naiwa_gasser',",
);
harness = harness.replace(
  '    new CombatAudio',
  '    this.hazards = new HazardLayer(scene, this.sim, this.bridge, this.bus);\n    new CombatAudio',
);
harness = harness.replace('    this.fx.update();', '    this.fx.update();\n    this.hazards.update();');
for (const [variant, root] of Object.entries(roots)) {
  await build({
    root,
    configFile: join(root, 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir: join(temp, variant) },
    plugins: [
      {
        name: 'identical-skill-load',
        transform: (code, id) =>
          id.endsWith('/src/debug/StressRun.ts') ? { code: harness, map: null } : undefined,
      },
    ],
  });
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
  executablePath: process.env.SKILL_BROWSER,
  args: JSON.parse(process.env.SKILL_BROWSER_ARGS ?? '[]'),
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
    'docs/testing/skill-animation/performance.json',
    JSON.stringify(
      {
        baseline: '42d3840bb6c95b5412041a85ff2f63256c2bc545',
        method:
          'ABAB; identical augmented StressRun in both production builds; HazardLayer active; 13 enemy kinds (bomber excluded to maintain constant load), 30 enemies + 400 bullets; seed 42; 1920×1080 DPR1; >=240 render frames after warm-up; no other browser tests running. Software renderer is not phone FPS.',
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
