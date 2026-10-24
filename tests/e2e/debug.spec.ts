import { expect, test, type Page } from '@playwright/test';

/** #17 调试工具：F1 碰撞框、F2 清房、?god=1 无敌；非调试模式下不生效。 */

const until = (page: Page, fn: () => boolean, timeout = 20_000) =>
  page.waitForFunction(fn, undefined, { timeout, polling: 50 });
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** 截取玩家周围一块画面（开局玩家在出生点不动，前后两次截图只受碰撞框影响）。 */
async function aroundPlayer(page: Page) {
  const b = (await page.locator('canvas').boundingBox())!;
  const c = await page.evaluate(() => window.__AVN__!.combat!);
  const scale = b.width / 480;
  const size = 24 * scale;
  const x = b.x + c.playerX * scale - size / 2;
  const y = b.y + c.playerY * scale - size;
  return page.screenshot({ clip: { x, y, width: size, height: size } });
}

test('调试模式：F1 切换碰撞框，F2 清房', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?scene=Game&room=arena&seed=42&debug=1');
  await until(page, () => !!window.__AVN__?.combat && !!window.__AVN__.debug);
  expect(await page.evaluate(() => window.__AVN__!.debug)).toEqual({ hitboxes: false, godMode: false });

  // 开局还没刷怪、玩家不动：开关碰撞框前后的画面只差碰撞框本身。
  await nextFrames(page);
  const off = await aroundPlayer(page);
  await page.keyboard.press('F1');
  await until(page, () => window.__AVN__!.debug!.hitboxes);
  await nextFrames(page);
  const on = await aroundPlayer(page);
  expect(on.equals(off)).toBe(false);
  await page.keyboard.press('F1');
  await until(page, () => !window.__AVN__!.debug!.hitboxes);
  await nextFrames(page);
  expect((await aroundPlayer(page)).equals(off)).toBe(true);

  await until(page, () => window.__AVN__!.combat!.alive > 0);
  const before = await page.evaluate(() => window.__AVN__!.combat!);
  await page.keyboard.press('F2');
  await until(page, () => window.__AVN__!.combat!.alive === 0);
  const after = await page.evaluate(() => window.__AVN__!.combat!);
  expect(after.kills).toBe(before.kills + before.alive);
  expect(after.playerHp).toBe(after.playerMaxHp);
  expect(errors).toEqual([]);
});

test('非调试模式：F1 / F2 不生效，没有调试探针', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?scene=Game&room=arena&seed=42');
  await until(page, () => !!window.__AVN__?.combat);
  expect(await page.evaluate(() => window.__AVN__!.debug)).toBeUndefined();
  await until(page, () => window.__AVN__!.combat!.alive > 0);
  const alive = await page.evaluate(() => window.__AVN__!.combat!.alive);
  await page.keyboard.press('F2');
  await page.keyboard.press('F1');
  await nextFrames(page);
  await nextFrames(page);
  const c = await page.evaluate(() => window.__AVN__!.combat!);
  expect(c.alive).toBe(alive);
  expect(c.kills).toBe(0);
  expect(errors).toEqual([]);
});

test('?god=1：被怪物围住也不掉血', async ({ page }) => {
  test.setTimeout(40_000);
  const errors = collectErrors(page);
  await page.goto('/?scene=Game&room=arena&seed=42&god=1');
  await until(page, () => !!window.__AVN__?.combat);
  // 同一种子不开无敌时，玩家大约在 8 秒（sim 时间）内死亡；这里多等一些。
  await until(page, () => window.__AVN__!.combat!.time >= 12, 30_000);
  const c = await page.evaluate(() => window.__AVN__!.combat!);
  expect(c.phase).toBe('playing');
  expect(c.playerHp).toBe(c.playerMaxHp);
  expect(errors).toEqual([]);
});
