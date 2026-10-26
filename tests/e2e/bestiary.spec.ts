import { expect, test, type Page } from '@playwright/test';
import { bestiaryCards } from '../../src/sim/meta/bestiary';
import { readFileSync } from 'node:fs';
const zh = JSON.parse(readFileSync(new URL('../../src/i18n/zh-CN.json', import.meta.url), 'utf8')) as Record<
  string,
  string
>;
import { installPad, padButton, type PadWindow } from './helpers/gamepad';

const cards = bestiaryCards();
const selected = (page: Page) => page.locator('#bestiary-grid [aria-pressed="true"]');
async function open(page: Page) {
  await page.goto('/?seed=42');
  await page.locator('#start-run').click();
  await page.locator('#hub-bestiary').click();
  await expect(page.locator('#bestiary-panel')).toBeVisible();
}

test('图鉴全部条目、裁剪比例、键盘二维选择、尺寸变化与返回主城', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator('#bestiary-grid button')).toHaveCount(cards.length);
  for (const card of cards) {
    const button = page.locator(`[data-enemy="${card.id}"]`);
    await button.click();
    await expect(page.locator('#bestiary-detail h3')).toHaveText(zh[card.name]!);
    await expect(page.locator('#bestiary-detail')).toContainText(zh[card.attack]!);
    await expect(button.locator('.bestiary-number')).toHaveText(card.label);
    // 从原图独立扫描 alpha，验证显示比例及背景定位对应同一静态帧。
    const picture = await button.locator('.bestiary-art').evaluate(async (el, card) => {
      const style = getComputedStyle(el),
        image = new Image();
      image.src = style.backgroundImage.slice(5, -2);
      await image.decode();
      const f = card.frame,
        canvas = document.createElement('canvas');
      canvas.width = f.width;
      canvas.height = f.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, f.x, f.y, f.width, f.height, 0, 0, f.width, f.height);
      const data = ctx.getImageData(0, 0, f.width, f.height).data;
      let l = f.width,
        r = -1,
        t = f.height,
        b = -1;
      for (let y = 0; y < f.height; y++)
        for (let x = 0; x < f.width; x++)
          if (data[(y * f.width + x) * 4 + 3]) {
            l = Math.min(l, x);
            r = Math.max(r, x);
            t = Math.min(t, y);
            b = Math.max(b, y);
          }
      const rect = el.getBoundingClientRect();
      return {
        w: rect.width,
        h: rect.height,
        ratio: (r - l + 1) / (b - t + 1),
        x: parseFloat(style.backgroundPositionX),
        expectedX: ((f.x + l) / (image.width - (r - l + 1))) * 100,
        y: parseFloat(style.backgroundPositionY),
        expectedY: ((f.y + t) / (image.height - (b - t + 1))) * 100,
        flip: style.transform,
        rendering: style.imageRendering,
      };
    }, card);
    expect(picture.w).toBeGreaterThan(5);
    expect(picture.h).toBeGreaterThan(5);
    expect(picture.w / picture.h).toBeCloseTo(picture.ratio, 2);
    expect(picture.x).toBeCloseTo(picture.expectedX, 2);
    expect(picture.y).toBeCloseTo(picture.expectedY, 2);
    expect(picture.rendering).toBe('pixelated');
    expect(picture.flip).toBe(card.frame.facing === 'left' ? 'matrix(-1, 0, 0, 1, 0, 0)' : 'none');
  }
  await page.locator('#bestiary-grid button').first().click();
  await page.keyboard.press('ArrowRight');
  await expect(selected(page)).toHaveAttribute('data-enemy', cards[1]!.id);
  const columns = await page
    .locator('#bestiary-grid')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  await page.keyboard.press('ArrowDown');
  await expect(selected(page)).toHaveAttribute('data-enemy', cards[columns + 1]!.id);
  await page.keyboard.press('ArrowLeft');
  await expect(selected(page)).toHaveAttribute('data-enemy', cards[columns]!.id);
  await page.keyboard.press('ArrowUp');
  await expect(selected(page)).toHaveAttribute('data-enemy', cards[0]!.id);
  await page.locator('[data-enemy="naiwa_tongue"]').click();
  await page.screenshot({ path: info.outputPath('bestiary.png'), scale: 'css' });
  for (const size of [
    { width: 568, height: 320 },
    { width: 915, height: 412 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(() => page.locator('#bestiary-panel').evaluate((el) => Math.abs(el.clientWidth - innerWidth)))
      .toBeLessThan(1);
    const layout = await page.locator('#bestiary-panel').evaluate((el) => {
      const grid = el.querySelector('#bestiary-grid')!,
        detail = el.querySelector('#bestiary-detail')!;
      return {
        overflow: el.scrollWidth > el.clientWidth,
        right: detail.getBoundingClientRect().right,
        width: innerWidth,
        gridRight: grid.getBoundingClientRect().right,
        detailLeft: detail.getBoundingClientRect().left,
      };
    });
    expect(layout.overflow).toBe(false);
    expect(layout.right).toBeLessThanOrEqual(layout.width);
    expect(layout.gridRight).toBeLessThan(layout.detailLeft);
  }
  await page.locator('[data-enemy="naiwa_boss"]').click();
  await page.keyboard.press('PageDown');
  await expect.poll(() => page.locator('#bestiary-detail').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('Tab');
  await expect(page.locator('#bestiary-close')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(selected(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#bestiary-panel')).toBeHidden();
  await page.keyboard.press('i');
  await expect(selected(page)).toHaveAttribute('data-enemy', 'naiwa_boss');
  await page.locator('#bestiary-close').click();
  await page.keyboard.down('a');
  await expect(page.locator('#hub-altar')).toBeVisible();
  await page.keyboard.up('a');
  await page.locator('#hub-altar').click();
  await expect(page.locator('#talent-panel')).toBeVisible();
  await page.locator('#talent-close').click();
  expect(errors).toEqual([]);
});

test('图鉴英文手柄：X 打开、四向移动、右摇杆读长文、B 关闭不穿透', async ({ page }) => {
  await installPad(page);
  await page.goto('/?seed=42');
  await page.locator('#demo-menu-panel summary').click();
  await page.locator('#settings-language').click();
  await expect(page.locator('#start-run')).toHaveText('Return to town');
  await page.locator('#start-run').click();
  await expect(page.locator('#hub-bestiary')).toBeVisible();
  await padButton(page, 2, true);
  await expect(page.locator('#bestiary-panel')).toBeVisible();
  await expect(page.locator('#bestiary-title')).toHaveText('Bestiary');
  await padButton(page, 2, false);
  for (const [button, expected] of [
    [15, 1],
    [14, 0],
  ] as const) {
    await padButton(page, button, true);
    await expect(selected(page)).toHaveAttribute('data-enemy', cards[expected]!.id);
    await padButton(page, button, false);
  }
  const columns = await page
    .locator('#bestiary-grid')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  await padButton(page, 13, true);
  await expect(selected(page)).toHaveAttribute('data-enemy', cards[columns]!.id);
  await padButton(page, 13, false);
  await padButton(page, 12, true);
  await expect(selected(page)).toHaveAttribute('data-enemy', cards[0]!.id);
  await padButton(page, 12, false);
  await page.setViewportSize({ width: 568, height: 320 });
  await page.locator('[data-enemy="naiwa_boss"]').click();
  await page.evaluate(() => (window as PadWindow).setPadAxes!([0, 0, 0, 1]));
  await expect
    .poll(() => page.locator('#bestiary-detail').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(20);
  await padButton(page, 1, true);
  await expect(page.locator('#bestiary-panel')).toBeHidden();
  await expect(page.locator('#demo-pause')).toBeHidden();
  await page.evaluate(() => (window as PadWindow).setPadAxes!([0, 0, 0, 0]));
  await padButton(page, 1, false);
});

test('触屏网格拖动只滚动不选中，点按更新详情；旧冒险与档案保持原文', async ({ page, context, isMobile }) => {
  test.skip(!isMobile);
  await page.setViewportSize({ width: 568, height: 320 });
  await open(page);
  await page.evaluate(() => {
    localStorage.setItem('avn.run.v2', 'preserve adventure');
    localStorage.setItem('avn.profile.v2', 'preserve profile');
  });
  const before = await selected(page).getAttribute('data-enemy');
  const box = (await page.locator('#bestiary-grid button').nth(5).boundingBox())!;
  const cdp = await context.newCDPSession(page),
    x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] });
  for (let i = 1; i <= 6; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x, y: y - i * 16 }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.locator('#bestiary-grid').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(selected(page)).toHaveAttribute('data-enemy', before!);
  await page.locator('[data-enemy="naiwa_boss"]').tap();
  await expect(page.locator('#bestiary-detail h3')).toHaveText('奶怪');
  await page.locator('#bestiary-close').tap();
  expect(
    await page.evaluate(() => [localStorage.getItem('avn.run.v2'), localStorage.getItem('avn.profile.v2')]),
  ).toEqual(['preserve adventure', 'preserve profile']);
  expect(await page.evaluate(() => window.__AVN__!.input!.move)).toEqual({ x: 0, y: 0 });
});
