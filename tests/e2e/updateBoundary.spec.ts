import { expect, test } from '@playwright/test';

test('a new release returns to menu even with direct game URL, preserving profile and future resources', async ({
  page,
}) => {
  const preserved = {
    'avn.profile.v2':
      '{"version":2,"runs":4,"wins":1,"bestFloor":4,"kills":100,"earned":123,"talents":{"thick_scales":2},"settled":[]}',
    'avn.profile.v2.backup': 'backup bytes',
    'avn.future.currency': '{"pearls":99}',
  };
  await page.addInitScript((values) => {
    if (sessionStorage.getItem('update-fixture')) return;
    sessionStorage.setItem('update-fixture', '1');
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    localStorage.setItem('avn.run.build', JSON.stringify('previous-release'));
    localStorage.setItem('avn.run.v2', JSON.stringify({ old: 'snapshot' }));
    localStorage.setItem('avn.floor.v1', JSON.stringify({ old: 'checkpoint' }));
  }, preserved);
  await page.goto('/?scene=Game&seed=42&god=1');
  await expect(page.locator('#demo-menu-panel')).toBeVisible();
  await expect(page.locator('#continue-run')).toBeDisabled();
  await expect(page.locator('#save-notice')).toContainText('旧冒险已结束');
  expect(
    await page.evaluate(
      (keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])),
      Object.keys(preserved),
    ),
  ).toEqual(preserved);
  expect(
    await page.evaluate(() => [localStorage.getItem('avn.run.v2'), localStorage.getItem('avn.floor.v1')]),
  ).toEqual([null, null]);
  await page.reload();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Game');
  expect(
    await page.evaluate(
      (keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])),
      Object.keys(preserved),
    ),
  ).toEqual(preserved);
});

for (const floor of [1, 2, 3, 4])
  test(`production graybox screenshot floor ${floor}`, async ({ page }, info) => {
    await page.goto(`/?scene=Game&seed=42&god=1&floor=${floor}`);
    await page.waitForFunction((f) => window.__AVN__?.demo?.floor === f, floor);
    await expect(page.locator('#game canvas')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`graybox-${floor}.png`), scale: 'css' });
  });
