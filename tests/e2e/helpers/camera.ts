import type { Page } from '@playwright/test';
import { GAME_HEIGHT, RENDER_SCALE } from '../../../src/config';

/** 用正式相机投影测试目标，避免把固定整屏映射写进鼠标回归。 */
export async function worldToScreen(page: Page, x: number, y: number) {
  const camera = await page.evaluate(() => window.__AVN__?.demo?.camera);
  const box = (await page.locator('#game canvas').boundingBox())!;
  const scale = box.height / (GAME_HEIGHT * RENDER_SCALE);
  const c = camera ?? { x: 0, y: 0, scrollX: 0, scrollY: 0, zoom: RENDER_SCALE };
  return {
    x: box.x + (c.x + (x - c.scrollX) * c.zoom) * scale,
    y: box.y + (c.y + (y - c.scrollY) * c.zoom) * scale,
  };
}
