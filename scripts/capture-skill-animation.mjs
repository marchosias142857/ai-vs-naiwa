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
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(e));
  await page.goto(url);
  await page.waitForFunction(() => window.skillList);
  const render = await page.locator('#game canvas').evaluate((c) => ({
    width: c.width,
    height: c.height,
    cssWidth: c.getBoundingClientRect().width,
    cssHeight: c.getBoundingClientRect().height,
    imageRendering: window.getComputedStyle(c).imageRendering,
    dpr: window.devicePixelRatio,
  }));
  if (render.width !== 1920 || render.height !== 1080 || render.cssWidth !== 1920)
    throw Error(`Evidence must capture the production framebuffer 1:1: ${JSON.stringify(render)}`);
  const audit = await page.evaluate(() => window.skillAudit());
  if (audit.errors.length) throw Error(JSON.stringify(audit));
  console.log(JSON.stringify(audit));
  const landingAudit = await page.evaluate(() => window.landingAudit());
  if (landingAudit.errors.length) throw Error(JSON.stringify(landingAudit));
  console.log(JSON.stringify(landingAudit));
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
  const gallery = await browser.newPage({ viewport: { width: 3928, height: 1100 }, deviceScaleFactor: 1 });
  const style =
    '<style>*{box-sizing:border-box}body{margin:0;background:#111923;color:#f5eed7;font:20px Arial,sans-serif;padding:24px}h1{margin:0 0 8px;font-size:28px}p{color:#b9c4cd;margin:8px 0 18px}.row{display:grid;grid-template-columns:repeat(5,768px);gap:10px;margin-bottom:18px}.cell{background:#1c2933;min-height:470px}.cell img{display:block;width:100%;image-rendering:auto}.caption{font-size:20px;padding:8px}.empty{height:432px;display:grid;place-content:center;color:#8998a8}.name{font-size:24px;margin:12px 0 6px}</style>';
  const renderSheet = async (body, name) => {
    await gallery.setContent(style + body);
    await gallery.locator('img').evaluateAll((images) => Promise.all(images.map((i) => i.decode())));
    await gallery.screenshot({ path: join(out, name), fullPage: true });
  };
  for (let start = 0; start < rows.length; start += 5) {
    let html = `<h1>#101 技能关键帧 · ${start + 1}–${Math.min(start + 5, rows.length)}</h1><p>1920×1080 高清渲染 · v4 原图不变。列顺序：前摇首帧 / 锁定 / 前摇末帧 / 生效首帧 / 收招。请打开原图查看；无对应阶段明确留空。</p>`;
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
  await gallery.setViewportSize({ width: 1968, height: 1200 });
  for (const mode of ['frozen', 'load', 'zero']) {
    const dense = await page.evaluate((mode) => window.skillDense(mode), mode);
    await settle();
    await page.locator('#game canvas').screenshot({ path: join(temp, `${mode}.png`) });
    await renderSheet(
      `<h1>#101 · ${mode}</h1><p>1920×1080 原生画布，无像素化放大。30 个怪物 + 落石；冻结不推进，读档不补事件，zero 禁止装饰准入。Boss 免疫冻结。</p><img style="display:block;width:1920px;image-rendering:auto" src="${url}/proof/${mode}.png">`,
      `${mode}.png`,
    );
    metadata.push(dense);
  }
  // A native-resolution crop for reviewing sprite detail without scaling a contact sheet.
  // Only the presentation crop changes; it is the same rendered sample as keyframes-1, row 1.
  await gallery.setViewportSize({ width: 1328, height: 620 });
  await renderSheet(
    `<h1>#101 · v4 怪物原生细节</h1><p>正式高清配置，1920×1080 画布的 1:1 局部；未改图集、未放大截图。巨爪：前摇首帧 / 前摇末帧。</p><div style="display:flex;gap:16px">${[0, 2].map((column) => `<div style="width:632px;height:440px;overflow:hidden;position:relative"><img style="position:absolute;width:1920px;max-width:none;left:-440px;top:-300px;image-rendering:auto" src="${url}/proof/0-${column}.png"></div>`).join('')}</div>`,
    'detail.png',
  );
  // Native pixels at the two production camera zooms; no contact-sheet downscaling.
  await gallery.setViewportSize({ width: 3904, height: 1200 });
  const formal = [];
  for (const zoom of [6, 8.5]) {
    let html = `<h1>#120 落点可读性 · 正式相机 zoom ${zoom}</h1><p>1920×1080 / DPR 1 原生像素；左：首步，右：末步。${zoom === 6 ? '1080p 桌面相机' : 'Pixel 7 横屏相机近似值；此处展示原生画布，非真机截图'}。落石：精细红色四角；奶怪：奶白方形四角；透明度 0.9。蓄跳蛙按负责人要求无落点提示。</p>`;
    for (const kind of ['rock', 'hopper', 'boss-hop', 'fuse', 'bump']) {
      html += `<div class="name">${kind}</div><div style="display:flex;gap:16px">`;
      for (const last of [false, true]) {
        const sample = await page.evaluate(({ kind, last, zoom }) => window.formalTell(kind, last, zoom), {
          kind,
          last,
          zoom,
        });
        formal.push(sample);
        await settle();
        const name = `formal-${zoom}-${kind}-${last}.png`;
        await page.locator('#game canvas').screenshot({ path: join(temp, name) });
        html += `<div style="width:1920px;flex:none"><div class="caption">${sample.label} · ${sample.time.toFixed(3)}/${sample.span.toFixed(3)}s · zoom ${zoom} · 1:1</div><img style="display:block;width:1920px;max-width:none" src="${url}/proof/${name}"></div>`;
      }
      html += '</div>';
    }
    await renderSheet(html, `formal-${zoom}.png`);
  }
  await writeFile(
    join(out, 'samples.json'),
    JSON.stringify({ render, audit, landingAudit, formal, samples: metadata }, null, 2) + '\n',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await rm(temp, { recursive: true, force: true });
}
