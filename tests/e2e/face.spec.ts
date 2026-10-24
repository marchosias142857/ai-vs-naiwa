import { expect, test } from '@playwright/test';
import { HERO_ART } from '../../src/data/art';
import { RENDER_SCALE } from '../../src/config';
import { writeFile } from 'node:fs/promises';

test('待机与行走的全部帧使用相同眼睛像素，左右移动时不改变形状', async ({ page }, info) => {
  // 只保留上一帧的真实 WebGL 输出供读取，不改贴图、输入或动画时间。
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      options?: unknown,
    ) {
      const attributes = options && typeof options === 'object' ? options : {};
      return getContext.call(
        this,
        type,
        type === 'webgl' || type === 'webgl2' ? { ...attributes, preserveDrawingBuffer: true } : options,
      );
    } as typeof getContext;
  });
  await page.goto('/?scene=Game&seed=42&god=1');
  await page.waitForFunction(() => !!window.__AVN__?.demo?.visual?.face?.visible);
  const directions: string[] = [];
  for (const key of ['d', 'a']) {
    const masks: string[] = [];
    await page.keyboard.down(key);
    for (const action of ['run', 'idle'] as const) {
      if (action === 'idle') await page.keyboard.up(key);
      const frames = await page.evaluate(
        ({ names, scale }) =>
          new Promise<Record<string, string>>((resolve, reject) => {
            const source = document.querySelector<HTMLCanvasElement>('#game canvas')!;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
            const result: Record<string, string> = {};
            const deadline = performance.now() + 15_000;
            const sample = () => {
              const v = window.__AVN__?.demo?.visual;
              if (v?.face.visible && (names as readonly string[]).includes(String(v.frame))) {
                const { x, y, width, height } = v.face;
                canvas.width = Math.round(width * scale);
                canvas.height = Math.round(height * scale);
                ctx.drawImage(
                  source,
                  Math.round(x * scale),
                  Math.round(y * scale),
                  canvas.width,
                  canvas.height,
                  0,
                  0,
                  canvas.width,
                  canvas.height,
                );
                const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let mask = '';
                for (let i = 0; i < data.length; i += 4)
                  mask += data[i]! < 70 && data[i + 1]! > 100 && data[i + 2]! > 180 ? '1' : '0';
                const previous = result[String(v.frame)];
                if (previous && previous !== mask) return reject(new Error('同一帧移动时眼睛像素改变'));
                result[String(v.frame)] = mask;
              }
              if (Object.keys(result).length === names.length) resolve(result);
              else if (performance.now() > deadline) reject(new Error('未收集到完整动作循环'));
              else requestAnimationFrame(sample);
            };
            sample();
          }),
        { names: [...HERO_ART[action]], scale: RENDER_SCALE },
      );
      expect(Object.keys(frames).sort()).toEqual([...HERO_ART[action]].sort());
      masks.push(...Object.values(frames));
    }
    const eyePixels = [...masks[0]!].filter((v) => v === '1').length;
    expect(eyePixels).toBeGreaterThan(8);
    expect(eyePixels).toBeLessThan(80);
    expect(new Set(masks).size).toBe(1);
    directions.push(masks[0]!);
    await page.screenshot({ path: info.outputPath(`stable-face-${key}.png`) });
  }
  const width = Math.round(HERO_ART.face.rect[2] * HERO_ART.scale * RENDER_SCALE);
  const mirrored = directions[0]!
    .match(new RegExp(`.{${width}}`, 'g'))!
    .map((row) => [...row].reverse().join(''))
    .join('');
  await writeFile(
    info.outputPath('eye-mirror-pixels.json'),
    JSON.stringify({ width, right: directions[0], left: directions[1], mirroredRight: mirrored }),
  );
  expect(directions[1], '左朝向必须逐行等于右朝向的镜像，眼睛不能多出一列').toBe(mirrored);
});
