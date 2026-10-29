import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Mechanical atlas export only: alpha bounds, uniform nearest-neighbour scaling,
// and fixed-cell packing. Original generated artwork is retained unchanged.
const browser = await chromium.launch({
  executablePath: process.env.UI_CHROMIUM,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
const manifest = {};
for (const [name, cols, rows, size] of [
  ['frames', 3, 2, 128],
  ['icons', 6, 6, 64],
  ['controls', 3, 2, 128],
]) {
  const source = await readFile(new URL(`sources/${name}-v1.png`, import.meta.url));
  const result = await page.evaluate(async ({ data, cols, rows, size, name }) => {
    const image = new Image();
    image.src = data;
    await image.decode();
    const source = document.createElement('canvas');
    source.width = image.width;
    source.height = image.height;
    const ctx = source.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    const atlas = document.createElement('canvas');
    atlas.width = cols * size;
    atlas.height = rows * size;
    const out = atlas.getContext('2d');
    out.imageSmoothingEnabled = false;
    const rects = [], files = {};
    const states = ['panel', 'normal', 'focus', 'pressed', 'disabled', 'well'];
    for (let i = 0; i < cols * rows; i++) {
      const xs = name === 'icons' ? [0, 229, 428, 627, 823, 1029, 1254] : null;
      const ys = name === 'icons' ? [0, 250, 447, 650, 838, 1038, 1254] : null;
      const x0 = xs?.[i % cols] ?? Math.round((i % cols) * image.width / cols);
      const y0 = ys?.[Math.floor(i / cols)] ?? Math.round(Math.floor(i / cols) * image.height / rows);
      const x1 = xs?.[i % cols + 1] ?? Math.round((i % cols + 1) * image.width / cols);
      const y1 = ys?.[Math.floor(i / cols) + 1] ?? Math.round((Math.floor(i / cols) + 1) * image.height / rows);
      let left = x1, top = y1, right = x0, bottom = y0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        if (pixels[(y * image.width + x) * 4 + 3] < 128) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      const w = right - left + 1, h = bottom - top + 1;
      if (w <= 0 || h <= 0) throw Error(`Empty ${name} cell ${i}`);
      const scale = (size - (name === 'icons' ? 4 : 0)) / Math.max(w, h);
      const dw = Math.round(w * scale), dh = Math.round(h * scale);
      const tile = document.createElement('canvas'); tile.width = tile.height = size;
      const t = tile.getContext('2d'); t.imageSmoothingEnabled = false;
      t.drawImage(source, left, top, w, h, Math.floor((size-dw)/2), Math.floor((size-dh)/2), dw, dh);
      out.drawImage(tile, (i % cols) * size, Math.floor(i / cols) * size);
      rects.push([left, top, w, h]);
      if (name === 'frames') files[`frame-${states[i]}-v1.png`] = tile.toDataURL('image/png');
    }
    if (name !== 'frames') files[`${name}-v1.png`] = atlas.toDataURL('image/png');
    return { width: image.width, height: image.height, rects, files };
  }, { data: `data:image/png;base64,${source.toString('base64')}`, cols, rows, size, name });
  const { files, ...geometry } = result;
  manifest[name] = { ...geometry, cell: size, sha256: createHash('sha256').update(source).digest('hex'), exports: {} };
  for (const [file, data] of Object.entries(files)) {
    const bytes = Buffer.from(data.split(',')[1], 'base64');
    await writeFile(new URL(`../../public/assets/ui/${file}`, import.meta.url), bytes);
    manifest[name].exports[file] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
}
await browser.close();
await writeFile(new URL('manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
