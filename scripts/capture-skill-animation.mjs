/* global window, requestAnimationFrame */
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
/** Run from repo root; SKILL_BROWSER/ SKILL_BROWSER_ARGS optionally select a local Chromium. */
import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';

const temp = await mkdtemp(join(tmpdir(), 'skill-evidence-'));
const out = resolve('docs/testing/skill-animation');
await mkdir(out, { recursive: true });
await build({
  configFile: resolve('vite.config.ts'),
  logLevel: 'silent',
  build: { outDir: join(temp, 'dist') },
  plugins: [
    {
      name: 'skill-evidence',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) => html.replace('/src/main.ts', '/tests/fixtures/skillAnimation.ts'),
      },
    },
  ],
});
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = path.startsWith('/proof/')
    ? join(temp, path.slice(7))
    : join(temp, 'dist', path === '/' ? 'index.html' : path);
  readFile(file)
    .then((data) =>
      res
        .writeHead(200, {
          'Content-Type':
            { '.js': 'text/javascript', '.png': 'image/png', '.css': 'text/css' }[extname(file)] ??
            'text/html',
        })
        .end(data),
    )
    .catch(() => res.writeHead(404).end());
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.SKILL_BROWSER,
  args: JSON.parse(process.env.SKILL_BROWSER_ARGS ?? '[]'),
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(e));
  await page.goto(url);
  await page.waitForFunction(() => window.skillList);
  const audit = await page.evaluate(() => window.skillAudit());
  if (audit.errors.length) throw Error(JSON.stringify(audit));
  console.log(JSON.stringify(audit));
  const rows = await page.evaluate(() => window.skillList());
  const metadata = [];
  const settle = () =>
    page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  for (let row = 0; row < rows.length; row++) {
    for (let column = 0; column < 5; column++) {
      if (!rows[row].frames[column]) continue;
      const sample = await page.evaluate(({ row, column }) => window.skillShow(row, column, 'live'), {
        row,
        column,
      });
      metadata.push({ row, column, ...sample });
      await settle();
      await page.locator('#game canvas').screenshot({ path: join(temp, `${row}-${column}.png`) });
    }
  }
  const gallery = await browser.newPage({ viewport: { width: 1560, height: 1100 }, deviceScaleFactor: 1 });
  const style =
    '<style>*{box-sizing:border-box}body{margin:0;background:#111923;color:#f5eed7;font:16px Arial,sans-serif;padding:24px}h1{margin:0 0 8px;font-size:24px}p{color:#b9c4cd;margin:8px 0 18px}.row{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:18px}.cell{background:#1c2933;min-height:190px}.cell img{display:block;width:100%;image-rendering:pixelated}.caption{font-size:13px;padding:8px}.empty{height:165px;display:grid;place-content:center;color:#8998a8}.name{font-size:16px;margin:12px 0 6px}</style>';
  const renderSheet = async (body, name) => {
    await gallery.setContent(style + body);
    await gallery.locator('img').evaluateAll((images) => Promise.all(images.map((i) => i.decode())));
    await gallery.screenshot({ path: join(out, name), fullPage: true });
  };
  for (let start = 0; start < rows.length; start += 5) {
    let html = `<h1>#101 技能关键帧 · ${start + 1}–${Math.min(start + 5, rows.length)}</h1><p>真实 sim 阶段与实际 Phaser 渲染；列顺序：前摇首帧 / 锁定 / 前摇末帧 / 生效首帧 / 收招。无对应阶段明确留空。</p>`;
    for (let r = start; r < Math.min(start + 5, rows.length); r++) {
      html += `<div class="name">${rows[r].name}</div><div class="row">`;
      for (let c = 0; c < 5; c++) {
        const m = metadata.find((x) => x.row === r && x.column === c);
        html +=
          '<div class="cell">' +
          (m
            ? `<img src="${url}/proof/${r}-${c}.png"><div class="caption">${m.label} · ${m.stage} ${m.stageTime.toFixed(3)}/${m.stageSpan.toFixed(3)}s</div>`
            : '<div class="empty">无此阶段</div>') +
          '</div>';
      }
      html += '</div>';
    }
    await renderSheet(html, `keyframes-${1 + start / 5}.png`);
  }
  // Three identical dense arrangements expose what load/freeze/zero-budget retain.
  for (const mode of ['frozen', 'load', 'zero']) {
    const dense = await page.evaluate((mode) => window.skillDense(mode), mode);
    await settle();
    await page.locator('#game canvas').screenshot({ path: join(temp, `${mode}.png`) });
    await renderSheet(
      `<h1>#101 · ${mode}</h1><p>30 个怪物 + 落石，同一组真实阶段样本；冻结不推进，读档不补事件，zero 禁止所有装饰预算准入。Boss 按原规则免疫冻结。</p><img style="width:1440px;image-rendering:pixelated" src="${url}/proof/${mode}.png">`,
      `${mode}.png`,
    );
    metadata.push(dense);
  }
  await writeFile(join(out, 'samples.json'), JSON.stringify({ audit, samples: metadata }, null, 2) + '\n');
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await rm(temp, { recursive: true, force: true });
}
