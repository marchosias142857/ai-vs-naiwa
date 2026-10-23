import { expect, test, type Page } from '@playwright/test';
import { INPUT_UI } from '../../src/game/fx/params';

/**
 * #15 战斗流程：开局 → 射击 → 击杀 → 受伤 → 死亡 → 重来，全程控制台零报错。
 * 开火用模拟手柄的 RT（不推右摇杆 = 自动瞄准），这样桌面和手机视口都能用同一种方式稳定命中。
 */

type PadWindow = Window & { __setTrigger?: (down: boolean) => void };

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function installPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pad = {
      id: 'test controller',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 1,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
    (window as PadWindow).__setTrigger = (down) => {
      pad.buttons[7] = { pressed: down, touched: down, value: Number(down) };
      pad.timestamp = performance.now();
    };
  });
}

const combat = (page: Page) => page.evaluate(() => window.__AVN__!.combat!);
const until = (page: Page, fn: () => boolean, timeout = 20_000) =>
  page.waitForFunction(fn, undefined, { timeout, polling: 50 });

test('开局 → 射击 → 击杀 → 受伤 → 死亡 → 重来（固定种子不变）', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await installPad(page);
  await page.goto('/?scene=Game&seed=42');
  await until(page, () => !!window.__AVN__?.combat && !!window.__AVN__.input);
  expect(await combat(page)).toMatchObject({ runs: 1, phase: 'playing', wave: 0, kills: 0 });

  // 开局等一个间隔后刷第一波；刷怪有预警，预警期间怪物不可见、不可命中。
  await until(page, () => window.__AVN__!.combat!.wave >= 1);
  expect((await combat(page)).alive).toBeGreaterThan(0);

  await page.evaluate(() => (window as PadWindow).__setTrigger!(true));
  await until(page, () => window.__AVN__!.input!.source === 'gamepad' && window.__AVN__!.input!.fire);
  await until(page, () => window.__AVN__!.combat!.kills >= 1);
  await page.evaluate(() => (window as PadWindow).__setTrigger!(false));

  // 停火后怪物追上来：先受伤，再死亡。
  await until(page, () => {
    const c = window.__AVN__!.combat!;
    return c.playerHp < c.playerMaxHp;
  });
  await until(page, () => window.__AVN__!.combat!.phase !== 'playing');
  expect((await combat(page)).playerHp).toBe(0);
  await until(page, () => window.__AVN__!.combat!.phase === 'restartable');

  await page.keyboard.press('Enter');
  await until(page, () => window.__AVN__?.combat?.runs === 2);
  const restarted = await combat(page);
  expect(restarted).toMatchObject({ phase: 'playing', kills: 0, wave: 0 });
  expect(restarted.playerHp).toBe(restarted.playerMaxHp);
  expect(await page.evaluate(() => window.__AVN__!.seed)).toBe(42);
  expect(errors).toEqual([]);
});

test('未固定种子时重来换新种子；点暂停键不会重来', async ({ page, isMobile }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto('/?scene=Game');
  await until(page, () => !!window.__AVN__?.combat);
  const firstSeed = await page.evaluate(() => window.__AVN__!.seed);
  await until(page, () => window.__AVN__!.combat!.phase === 'restartable', 40_000);

  const box = (await page.locator('canvas').boundingBox())!;
  const tap = (x: number, y: number) => (isMobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  await tap(box.x + box.width - INPUT_UI.pause.inset, box.y + INPUT_UI.pause.inset);
  await until(page, () => window.__AVN__!.input!.manualPaused);
  expect((await combat(page)).runs).toBe(1);

  await page.keyboard.press('Escape');
  await until(page, () => !window.__AVN__!.input!.manualPaused);
  await tap(box.x + box.width / 2, box.y + box.height / 2);
  await until(page, () => window.__AVN__?.combat?.runs === 2);
  expect(await page.evaluate(() => window.__AVN__!.seed)).not.toBe(firstSeed);
  expect(errors).toEqual([]);
});
