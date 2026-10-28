import { expect, test } from '@playwright/test';

for (const floor of [1, 2, 3, 4])
  test(`modular production art floor ${floor}`, async ({ page }, info) => {
    const errors: string[] = [],
      loaded = new Set<string>();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (/map-(terrain|doors|objects)-v1.webp/.test(r.url()) && r.ok()) loaded.add(r.url());
    });
    await page.goto(`/?scene=Game&seed=42&god=1&floor=${floor}`);
    await page.waitForFunction((f) => window.__AVN__?.demo?.floor === f, floor);
    await expect(page.locator('#game canvas')).toBeVisible();
    await expect.poll(() => loaded.size).toBe(3);
    await page.screenshot({ path: info.outputPath(`modular-floor-${floor}.png`), scale: 'css' });
    expect(errors).toEqual([]);
  });
