import { expect, test } from '@playwright/test';
import { MAP_ART } from '../../src/data/mapArt';

for (const floor of [1, 2, 3, 4])
  test(`modular production art floor ${floor}`, async ({ page }, info) => {
    const errors: string[] = [],
      loaded = new Set<string>();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (
        Object.values(MAP_ART.sources).some((source) => r.url().endsWith(`/assets/demo/${source}`)) &&
        r.ok()
      )
        loaded.add(r.url());
    });
    await page.goto(`/?scene=Game&seed=42&god=1&floor=${floor}`);
    await page.waitForFunction((f) => window.__AVN__?.demo?.floor === f, floor);
    await expect(page.locator('#game canvas')).toBeVisible();
    await expect.poll(() => loaded.size).toBe(7);
    await page.screenshot({ path: info.outputPath(`modular-floor-${floor}.png`), scale: 'css' });
    expect(errors).toEqual([]);
  });
