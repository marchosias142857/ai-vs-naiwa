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
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

/**
 * 暂停后截取暂停键和「继续」按钮两块区域，再恢复。用来比较重来前后控件的位置与字号是否一致。
 * 只在开局（还没刷怪、玩家在出生点）调用，两局截到的画面应当完全相同。
 */
async function pausedControls(page: Page) {
  await page.keyboard.press('Escape');
  await until(page, () => window.__AVN__!.input!.manualPaused);
  await nextFrames(page);
  const b = (await page.locator('canvas').boundingBox())!;
  const { inset, hitRadius: h } = INPUT_UI.pause;
  const r = INPUT_UI.resume.radius + 4;
  const pauseClip = { x: b.x + b.width - inset - h, y: b.y + inset - h, width: 2 * h, height: 2 * h };
  const resumeClip = { x: b.x + b.width / 2 - r, y: b.y + b.height / 2 - r, width: 2 * r, height: 2 * r };
  const shots = [await page.screenshot({ clip: pauseClip }), await page.screenshot({ clip: resumeClip })];
  await page.keyboard.press('Escape');
  await until(page, () => !window.__AVN__!.input!.manualPaused);
  return shots;
}

test('开局 → 射击 → 击杀 → 受伤 → 死亡 → 重来（固定种子不变）', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await installPad(page);
  await page.goto('/?scene=Game&room=arena&seed=42');
  await until(page, () => !!window.__AVN__?.combat && !!window.__AVN__.input);
  expect(await combat(page)).toMatchObject({ runs: 1, phase: 'playing', wave: 0, kills: 0 });
  const firstControls = await pausedControls(page);

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
  // 重来会复用 InputScene 实例：同样的窗口尺寸下，暂停键与「继续」按钮必须和第一局画得一样。
  const secondControls = await pausedControls(page);
  expect(secondControls[0]!.equals(firstControls[0]!)).toBe(true);
  expect(secondControls[1]!.equals(firstControls[1]!)).toBe(true);
  expect(errors).toEqual([]);
});

test('移动中（含暂停恢复后）鼠标瞄准以玩家当前位置为原点', async ({ page, isMobile }) => {
  test.skip(isMobile);
  const errors = collectErrors(page);
  await page.goto('/?scene=Game&room=arena&seed=42');
  await until(page, () => !!window.__AVN__?.combat && !!window.__AVN__.input);
  const rect = await page.evaluate(() => {
    const r = document.querySelector('canvas')!.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width };
  });
  const scale = rect.width / 480;
  const start = await combat(page);
  // 鼠标放在玩家正上方 40 游戏像素处，然后按住 D 向右走：每一帧的瞄准原点都必须是当帧的玩家位置。
  const mouseX = Math.round(rect.left + start.playerX * scale);
  const mouseY = Math.round(rect.top + (start.playerY - 40) * scale);
  await page.mouse.move(mouseX, mouseY);
  const target = { x: (mouseX - rect.left) / scale, y: (mouseY - rect.top) / scale };
  let checked = 0;
  const checkFrames = async (count: number) => {
    for (let i = 0; i < count; i++) {
      await nextFrames(page);
      const c = await combat(page);
      if (!c.aim) continue;
      const dx = target.x - c.aimOriginX,
        dy = target.y - c.aimOriginY,
        n = Math.hypot(dx, dy);
      expect(Math.abs(c.aim.x - dx / n)).toBeLessThan(1e-4);
      expect(Math.abs(c.aim.y - dy / n)).toBeLessThan(1e-4);
      checked++;
    }
  };
  await page.keyboard.down('KeyD');
  await checkFrames(8);
  // 暂停会清空输入；恢复后重新按下再走，瞄准原点仍须是当帧位置。
  await page.keyboard.up('KeyD');
  await page.keyboard.press('Escape');
  await until(page, () => window.__AVN__!.input!.manualPaused);
  await page.keyboard.press('Escape');
  await until(page, () => !window.__AVN__!.input!.manualPaused);
  // 暂停时输入层也忘掉了鼠标位置，要再动一下鼠标才恢复鼠标瞄准。
  await page.mouse.move(mouseX + 1, mouseY);
  await page.mouse.move(mouseX, mouseY);
  await page.keyboard.down('KeyD');
  await checkFrames(8);
  await page.keyboard.up('KeyD');
  expect(checked).toBeGreaterThan(10);
  expect((await combat(page)).playerX).toBeGreaterThan(start.playerX + 10);
  expect(errors).toEqual([]);
});

test('未固定种子时重来换新种子；点暂停键不会重来', async ({ page, isMobile }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto('/?scene=Game&room=arena');
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
