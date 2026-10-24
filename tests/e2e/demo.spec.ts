import { installPad, padButton } from './helpers/gamepad';
import { expect, test } from '@playwright/test';

test('demo：默认地牢入口、行动按钮、真实走门、清房与暂停', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?scene=Game&seed=42&debug=1&god=1');
  await page.waitForFunction(() => !!window.__AVN__?.demo);
  await expect(page.locator('#demo-hud')).toBeVisible();
  await page.getByRole('button', { name: /切枪/ }).click();
  await page.waitForFunction(() => window.__AVN__!.demo!.weapon === 'rifle_auto');
  // 点击 DOM 操作键后不残留焦点，键盘能继续控制。
  const door = await page.evaluate(() => window.__AVN__!.demo!.links[0]!);
  const key = door.dx > 0 ? 'd' : door.dx < 0 ? 'a' : door.dy > 0 ? 's' : 'w';
  await page.keyboard.down(key);
  await page.waitForFunction(() => window.__AVN__!.demo!.room !== 0);
  await page.keyboard.up(key);
  await page.getByRole('button', { name: /技能/ }).click();
  await page.waitForFunction(() => window.__AVN__!.demo!.skill > 0);
  await page.waitForFunction(() => window.__AVN__!.demo!.alive > 0);
  const before = await page.evaluate(() => window.__AVN__!.demo!);
  expect(before.locked).toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!window.__AVN__!.input!.manualPaused);
  await page.screenshot({ path: info.outputPath('demo-pause.png'), scale: 'css' });
  const time = await page.evaluate(() => window.__AVN__!.demo!.time);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__AVN__!.demo!.time)).toBe(time);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__AVN__!.input!.manualPaused);
  await page.screenshot({ path: info.outputPath('demo-feedback.png'), scale: 'css' });
  for (let wave = 0; wave < 2; wave++) {
    await page.waitForFunction(() => window.__AVN__!.demo!.alive > 0);
    await page.keyboard.press('F2');
    await page.waitForFunction(() => window.__AVN__!.demo!.alive === 0);
  }
  await page.waitForFunction(() => !window.__AVN__!.demo!.locked);
  expect(await page.evaluate(() => window.__AVN__!.demo!.kills)).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('demo-room.png'), scale: 'css' });
  expect(errors).toEqual([]);
});

test('demo：检查点继续、死亡结算与重来完整释放', async ({ page }, info) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=42');
  await page.waitForFunction(() => window.__AVN__?.scene === 'Menu');
  await page.evaluate(() =>
    localStorage.setItem(
      'avn.floor.v1',
      JSON.stringify({
        version: 1,
        seed: 42,
        floor: 2,
        upgrades: ['vitality'],
        secondary: 'shotgun_fan',
        equipped: 'shotgun_fan',
        hp: 1,
        armor: 0,
        energy: 50,
        coins: 10,
        kills: 12,
        roomsCleared: 4,
        elapsed: 100,
      }),
    ),
  );
  await page.reload();
  await expect(page.locator('#continue-run')).toBeEnabled();
  await page.screenshot({ path: info.outputPath('demo-menu.png'), scale: 'css' });
  await page.locator('#continue-run').click();
  await page.waitForFunction(() => window.__AVN__?.demo?.floor === 2);
  expect(await page.evaluate(() => window.__AVN__!.demo!.weapon)).toBe('shotgun_fan');
  expect(await page.evaluate(() => window.__AVN__!.demo!.hp)).toBe(1);
  expect(await page.evaluate(() => window.__AVN__!.demo!.energy)).toBe(50);
  const door = await page.evaluate(() => window.__AVN__!.demo!.links[0]!);
  const key = door.dx > 0 ? 'd' : door.dx < 0 ? 'a' : door.dy > 0 ? 's' : 'w';
  await page.keyboard.down(key);
  await page.waitForFunction(() => window.__AVN__!.demo!.room !== 0);
  await page.keyboard.up(key);
  await page.waitForFunction(() => window.__AVN__!.demo!.settled, undefined, { timeout: 40_000 });
  await expect(page.locator('#demo-restart')).toBeVisible();
  await page.screenshot({ path: info.outputPath('demo-result.png'), scale: 'css' });
  expect(await page.evaluate(() => localStorage.getItem('avn.floor.v1'))).toBeNull();
  const children = await page.evaluate(() => window.__AVN__!.demo!.children);
  // 结算期间点暂停和 Esc 都不能叠加一个卡住的 scene.pause。
  await page.keyboard.press('Escape');
  await page.locator('#demo-restart').click();
  await page.waitForFunction(() => window.__AVN__?.demo?.floor === 1 && !window.__AVN__.demo.settled);
  expect(await page.evaluate(() => window.__AVN__!.demo!.children)).toBe(children);
  await expect(page.locator('#demo-hud')).toHaveCount(1);
  await expect(page.locator('#demo-actions')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('avn.profile.v1')!).runs)).toBe(1);
  expect(errors).toEqual([]);
});

test('demo：暂停退出保留入口检查点，继续不重复输入界面', async ({ page }) => {
  await page.goto('/?scene=Game&seed=42');
  await page.waitForFunction(() => !!window.__AVN__?.demo);
  await page.keyboard.press('Escape');
  await page.locator('#pause-menu').click();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Menu');
  await expect(page.locator('#demo-actions')).toHaveCount(0);
  await expect(page.locator('#demo-hud')).toHaveCount(0);
  await expect(page.locator('#continue-run')).toBeEnabled();
  await page.locator('#continue-run').click();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Game');
  await expect(page.locator('#demo-actions')).toHaveCount(1);
  await expect(page.locator('#demo-hud')).toHaveCount(1);
});

test('demo：手柄菜单松开再确认，暂停继续后能切回键盘', async ({ page }) => {
  await installPad(page);
  await page.goto('/?seed=42');
  await page.waitForFunction(() => window.__AVN__?.scene === 'Menu');
  await expect(page.locator('#start-run')).toBeFocused();
  await padButton(page, 0, true);
  await page.waitForFunction(() => window.__AVN__?.scene === 'Game');
  await padButton(page, 0, false);
  await padButton(page, 9, true);
  await page.waitForFunction(() => window.__AVN__!.input!.manualPaused);
  await padButton(page, 9, false);
  await expect(page.locator('#demo-pause button').first()).toBeFocused();
  await padButton(page, 0, true);
  await page.waitForFunction(() => !window.__AVN__!.input!.manualPaused);
  await padButton(page, 0, false);
  const x = await page.evaluate(() => window.__AVN__!.demo!.x);
  await page.keyboard.down('d');
  await page.waitForFunction((x) => window.__AVN__!.demo!.x > x + 5, x);
  await page.keyboard.up('d');
});

test('demo：语言与反馈设置持久保存，英文游戏与暂停菜单可用', async ({ page }, info) => {
  await page.goto('/?seed=42');
  await page.locator('#settings-flashes').click();
  await page.locator('#settings-sound').click();
  await page.locator('#settings-language').click();
  await expect(page.locator('#start-run')).toHaveText('New adventure');
  await page.reload();
  await expect(page.locator('#settings-flashes')).toHaveText('Hit flashes: Off');
  await expect(page.locator('#settings-sound')).toHaveText('Sound: Off');
  await page.locator('#start-run').click();
  await expect(page.locator('.demo-status')).toContainText('HP 6/6');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-menu')).toHaveText('Menu (keep floor checkpoint)');
  await page.screenshot({ path: info.outputPath('demo-english.png'), scale: 'css' });
});
