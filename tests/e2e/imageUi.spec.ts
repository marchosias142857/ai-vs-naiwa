import { expect, test, type Page } from '@playwright/test';
import { emptyProfile } from '../../src/sim/meta/profile';
import { startAdventure } from './helpers/town';

async function pictures(page: Page, selector: string) {
  const results = await page.locator(selector).evaluateAll(async (elements) => {
    const visible = elements.filter((e) => e.getClientRects().length);
    return Promise.all(
      visible.map(async (e) => {
        const style = getComputedStyle(e);
        const url = style.borderImageSource.match(/url\("?([^"\)]+)/)?.[1];
        if (!url) return { label: e.textContent, image: false, fits: false };
        const image = new Image();
        image.src = url;
        await image.decode();
        return {
          label: e.textContent,
          image: image.naturalWidth > 0,
          fits: e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1,
        };
      }),
    );
  });
  expect(results.length).toBeGreaterThan(0);
  for (const result of results) expect(result, result.label ?? '').toMatchObject({ image: true, fits: true });
}

test('统一图片：真实菜单状态、图鉴、天赋四状态与手机滚动', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=42');
  await expect(page.locator('#continue-run')).toBeDisabled();
  await expect(page.locator('#continue-run')).toHaveCSS('border-image-source', /frame-disabled-v1/);
  await page.locator('#start-run').focus();
  await expect(page.locator('#start-run')).toHaveCSS('border-image-source', /frame-focus-v1/);
  await page.screenshot({ path: info.outputPath('image-menu.png'), scale: 'css' });
  await page.locator('#demo-menu-panel summary').click();
  await pictures(page, '#demo-menu-panel button, #demo-menu-panel summary');
  await page.screenshot({ path: info.outputPath('image-settings.png'), scale: 'css' });
  await page.locator('#demo-menu-panel summary').click();
  await page.evaluate((profile) => localStorage.setItem('avn.profile.v2', JSON.stringify(profile)), {
    ...emptyProfile(),
    earned: 20,
    talents: { thick_scales: 2 },
  });
  await page.locator('#start-run').click();
  await page.locator('#hub-bestiary').click();
  await pictures(page, '#bestiary-panel button');
  await page.screenshot({ path: info.outputPath('image-bestiary.png'), scale: 'css' });
  await page.locator('#bestiary-close').click();
  await page.keyboard.down('a');
  await expect(page.locator('#hub-altar')).toBeVisible();
  await page.keyboard.up('a');
  await page.locator('#hub-altar').click();
  for (const [id, state, icon] of [
    ['thick_scales', 'maxed', 'check'],
    ['coral_plates', 'points', 'coin'],
    ['abyss_heart', 'locked', 'lock'],
    ['keen_fins', 'available', 'talent'],
  ]) {
    const node = page.locator(`[data-talent="${id}"]`);
    await expect(node).toHaveAttribute('data-state', state!);
    await expect(node).toHaveAttribute('data-ui-icon', icon!);
  }
  await pictures(page, '#talent-panel button');
  const links = page.locator('.talent-branch svg image');
  expect(await links.count()).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('image-talents.png'), scale: 'css' });
  await page.locator('[data-talent="abyss_heart"]').click();
  await expect(page.locator('#talent-buy')).toHaveText('前置未满足');
  await page.locator('#talent-reset').click();
  await pictures(page, '#talent-panel header button');
  await page.locator('#talent-reset-cancel').click();
  await page.locator('#talent-close').click();
  expect(errors).toEqual([]);
});

test('统一图片：HUD、地图、暂停、布局预览保持实际命中尺寸', async ({ page }, info) => {
  await page.goto('/?seed=42');
  await startAdventure(page);
  await page.locator('.demo-map-toggle').click();
  await expect(page.locator('.demo-map')).toBeVisible();
  await pictures(page, '.demo-map-toggle');
  await page.screenshot({ path: info.outputPath('image-hud.png'), scale: 'css' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#demo-pause')).toBeVisible();
  await pictures(page, '#demo-pause button');
  await page.screenshot({ path: info.outputPath('image-pause.png'), scale: 'css' });
  await page.locator('#demo-pause .settings-layout').click();
  const controls = await page.locator('.layout-control').evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { width: r.width, height: r.height, background: getComputedStyle(node).backgroundImage };
    }),
  );
  for (const control of controls) {
    expect(control.width).toBe(control.height);
    expect(control.width).toBeGreaterThanOrEqual(44);
    expect(control.background).toContain('controls-v1.png');
  }
  await pictures(page, '.layout-actions button');
  await page.screenshot({ path: info.outputPath('image-layout.png'), scale: 'css' });
  await page.locator('#layout-cancel').click();
  await expect(page.locator('#demo-pause')).toBeVisible();
});
