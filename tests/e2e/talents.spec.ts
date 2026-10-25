import { installPad, padButton } from './helpers/gamepad';
import { expect, test, type Page } from '@playwright/test';
import { TALENTS } from '../../src/data/talents';
import { emptyProfile } from '../../src/sim/meta/profile';
import { startAdventure } from './helpers/town';

async function openAltar(page: Page) {
  await page.locator('#start-run').click();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Hub');
  await page.keyboard.down('a');
  await expect(page.locator('#hub-altar')).toBeVisible();
  await page.keyboard.up('a');
  await page.locator('#hub-altar').click();
  await expect(page.locator('#talent-panel')).toBeVisible();
}
async function menu(page: Page) {
  await page.keyboard.press('Escape');
  await page.locator('#pause-menu').click();
  await expect(page.locator('#start-run')).toBeVisible();
}
test('祭台迁移、解锁失败与写盘失败、连续购买、重置确认；新局生效', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=42');
  await page.evaluate(() =>
    localStorage.setItem('avn.profile.v1', JSON.stringify({ runs: 5, wins: 5, kills: 500, bestFloor: 4 })),
  );
  await openAltar(page);
  await expect(page.locator('#talent-balance')).toHaveText('可用 40 点');
  await expect(page.locator('[data-talent]')).toHaveCount(12);
  await page.locator('[data-talent="abyss_heart"]').click();
  await expect(page.locator('#talent-buy')).toBeDisabled();
  await expect(page.locator('#talent-buy')).toHaveText('前置未满足');
  await page.locator('[data-talent="thick_scales"]').click();
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'avn.profile.v2') throw Error('quota');
      set.call(this, k, v);
    };
    window.addEventListener(
      'restore-profile-io',
      () => {
        Storage.prototype.setItem = set;
      },
      { once: true },
    );
  });
  await page.locator('#talent-buy').click();
  await expect(page.locator('#talent-message')).toContainText('未能保存');
  await expect(page.locator('#talent-balance')).toHaveText('可用 40 点');
  await page.evaluate(() => window.dispatchEvent(new Event('restore-profile-io')));
  await page.locator('#talent-buy').click();
  await page.locator('#talent-buy').click();
  await expect(page.locator('#talent-balance')).toHaveText('可用 24 点');
  await expect(page.locator('#talent-buy')).toHaveText('已满级');
  await page.screenshot({ path: info.outputPath('talent-tree.png') });
  const bounds = await page.locator('#talent-panel').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.w);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.h);
  await page.locator('#talent-reset').click();
  await page.locator('#talent-reset-cancel').click();
  await expect(page.locator('#talent-balance')).toHaveText('可用 24 点');
  await page.locator('#talent-reset').click();
  await page.locator('#talent-reset').click();
  await expect(page.locator('#talent-balance')).toHaveText('可用 40 点');
  await page.locator('#talent-buy').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#talent-panel')).toBeHidden();
  await menu(page);
  await startAdventure(page);
  expect(await page.evaluate(() => window.__AVN__!.demo!.hp)).toBe(7);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('avn.run.v2')!).entry.talents)).toEqual({
    thick_scales: 1,
  });
  expect(errors).toEqual([]);
});
test('满级天赋新局属性、完整续玩及入口兜底均冻结开局配置', async ({ page }) => {
  await page.goto('/?seed=42');
  const talents = Object.fromEntries(Object.entries(TALENTS).map(([id, n]) => [id, n.costs.length]));
  await page.evaluate((p) => localStorage.setItem('avn.profile.v2', JSON.stringify(p)), {
    ...emptyProfile(),
    earned: 454,
    talents,
  });
  await startAdventure(page);
  expect(await page.evaluate(() => window.__AVN__!.demo)).toMatchObject({ hp: 9, armor: 7, energy: 250 });
  const entry = await page.evaluate(() => JSON.parse(localStorage.getItem('avn.run.v2')!).entry);
  expect(entry).toMatchObject({ talents, coins: 12 });
  await menu(page);
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('avn.profile.v2')!);
    p.talents = {};
    localStorage.setItem('avn.profile.v2', JSON.stringify(p));
  });
  await page.locator('#continue-run').click();
  await page.waitForFunction(() => !!window.__AVN__?.demo);
  expect(await page.evaluate(() => window.__AVN__!.demo)).toMatchObject({ hp: 9, armor: 7, energy: 250 });
  await menu(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('avn.run.v2')!);
    s.meta.build = 'old';
    localStorage.setItem('avn.run.v2', JSON.stringify(s));
  });
  await page.reload();
  await page.locator('#continue-run').click();
  await page.waitForFunction(() => !!window.__AVN__?.demo);
  expect(await page.evaluate(() => window.__AVN__!.demo)).toMatchObject({ hp: 9, armor: 7, energy: 250 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('avn.run.v2')!).entry)).toMatchObject({
    runId: entry.runId,
    talents,
    coins: 12,
  });
});
test('损坏档案备份原文；已结算的冒险不会出现在继续入口', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.evaluate(() => localStorage.setItem('avn.profile.v2', '{broken original'));
  await openAltar(page);
  expect(await page.evaluate(() => localStorage.getItem('avn.profile.v2.backup'))).toBe('{broken original');
  await expect(page.locator('#profile-notice')).toContainText('原文已备份');
  await page.locator('#talent-close').click();
  await menu(page);
  await startAdventure(page);
  await menu(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('avn.run.v2')!),
      p = JSON.parse(localStorage.getItem('avn.profile.v2')!);
    p.settled = [s.entry.runId];
    localStorage.setItem('avn.profile.v2', JSON.stringify(p));
  });
  await page.reload();
  await expect(page.locator('#continue-run')).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('avn.run.v2'))).toBeNull();
});

test('手机祭台：左摇杆移动、点按加点和关闭后重新交互', async ({ page, context, isMobile }) => {
  test.skip(!isMobile);
  await page.goto('/?seed=42');
  await page.evaluate(() => localStorage.setItem('avn.profile.v1', JSON.stringify({ runs: 2 })));
  await page.locator('#start-run').tap();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Hub' && !!window.__AVN__?.input?.touch);
  const box = (await page.locator('#game canvas').boundingBox())!,
    touch = await page.evaluate(() => window.__AVN__!.input!.touch);
  const cdp = await context.newCDPSession(page),
    point = { id: 1, x: box.x + touch.moveX, y: box.y + touch.moveY };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...point, x: point.x - touch.moveRadius * 2 }],
  });
  await expect(page.locator('#hub-altar')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.locator('#hub-altar').tap();
  await page.locator('#talent-buy').tap();
  await expect(page.locator('#talent-balance')).toHaveText('可用 0 点');
  await expect(page.locator('#talent-panel footer')).toContainText('累计加成：+1');
  await page.locator('#talent-close').tap();
  await expect(page.locator('#hub-altar')).toBeVisible();
  await page.locator('#hub-altar').tap();
  await expect(page.locator('#talent-panel')).toBeVisible();
});

test('天赋面板英文与手柄：长按确认不穿透，释放后可关闭', async ({ page }, info) => {
  await installPad(page);
  await page.goto('/?seed=42');
  await page.locator('#demo-menu-panel summary').click();
  await page.locator('#settings-language').click();
  // 语言切换重启 Menu，等待新界面；不能再点一次 summary 把设置层重新打开。
  await expect(page.locator('#start-run')).toHaveText('Return to town');
  await page.locator('#start-run').click();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Hub');
  await page.keyboard.down('a');
  await expect(page.locator('#hub-altar')).toBeVisible();
  await page.keyboard.up('a');
  await padButton(page, 0, true);
  await expect(page.locator('#talent-panel')).toBeVisible();
  await expect(page.locator('#talent-title')).toHaveText('Tide altar');
  await expect(page.locator('#talent-close')).toBeFocused();
  expect(await page.evaluate(() => window.__AVN__?.scene)).toBe('Hub');
  await page.screenshot({ path: info.outputPath('talent-tree-english.png') });
  await padButton(page, 0, false);
  await padButton(page, 0, true);
  await expect(page.locator('#talent-panel')).toBeHidden();
  await padButton(page, 0, false);
});
