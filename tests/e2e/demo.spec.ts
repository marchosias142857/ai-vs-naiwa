import { startAdventure, enterDungeon } from './helpers/town';
import { INPUT_UI } from '../../src/game/fx/params';
import { installPad, padButton, type PadWindow } from './helpers/gamepad';
import { expect, test } from '@playwright/test';

test('demo：默认地牢入口、行动按钮、真实走门、清房与暂停', async ({ page, isMobile }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?scene=Game&seed=42&debug=1&god=1');
  await page.waitForFunction(() => !!window.__AVN__?.demo);
  await expect(page.locator('#demo-hud')).toBeVisible();
  await expect(page.locator('.demo-status')).toContainText('基础手枪');
  if (isMobile) await page.locator('[data-action="KeyQ"]').dispatchEvent('pointerdown');
  else {
    await expect(page.locator('#demo-actions')).toBeHidden();
    await page.keyboard.press('q');
  }
  expect(await page.evaluate(() => window.__AVN__!.demo!.weapon)).toBe('pistol_basic');
  // 按下 DOM 操作键后不残留焦点，键盘能继续控制。
  const door = await page.evaluate(() => window.__AVN__!.demo!.links[0]!);
  const key = door.dx > 0 ? 'd' : door.dx < 0 ? 'a' : door.dy > 0 ? 's' : 'w';
  await page.keyboard.down(key);
  await page.waitForFunction(() => window.__AVN__!.demo!.room !== 0);
  await page.keyboard.up(key);
  if (isMobile) await page.locator('[data-action="Space"]').dispatchEvent('pointerdown');
  else await page.keyboard.press('Space');
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

test('demo：有存档按 Enter 继续且保留检查点，死亡结算与重来完整释放', async ({ page }, info) => {
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
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__AVN__?.demo?.floor === 2);
  const retained = await page.evaluate(() => JSON.parse(localStorage.getItem('avn.run.v2')!).entry);
  expect(await page.evaluate(() => localStorage.getItem('avn.floor.v1'))).toBeNull();
  expect(retained).toMatchObject({ floor: 2, seed: 42, secondary: 'shotgun_fan', kills: 12, coins: 10 });
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
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('avn.profile.v2')!).runs)).toBe(1);
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
  await page.waitForFunction(() => window.__AVN__?.scene === 'Hub');
  await padButton(page, 0, false);
  await enterDungeon(page);
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
  await page.locator('#demo-menu-panel summary').click();
  await page.locator('#settings-flashes').click();
  await page.locator('#settings-sound').click();
  await page.locator('#settings-language').click();
  await expect(page.locator('#start-run')).toHaveText('Return to town');
  await page.reload();
  await page.locator('#demo-menu-panel summary').click();
  await expect(page.locator('#settings-flashes')).toHaveText('Hit flashes: Off');
  await expect(page.locator('#settings-sound')).toHaveText('Sound: Off');
  await page.locator('#demo-menu-panel summary').click();
  await startAdventure(page);
  await expect(page.locator('.vital-health')).toContainText('HP 6/6');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-menu')).toHaveText('Menu (save adventure)');
  await page.screenshot({ path: info.outputPath('demo-english.png'), scale: 'css' });
});

for (const energy of [200, 20])
  test(
    energy === 200
      ? 'demo：右摇杆瞄准与 Arcade 命中击败 Boss，保持 RT 不跳过结算'
      : 'demo：步枪耗尽停火，保持 RT 换回手枪后零能量继续射击',
    async ({ page }, info) => {
      test.setTimeout(50_000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await installPad(page);
      await page.goto('/?god=1');
      await page.waitForFunction(() => window.__AVN__?.scene === 'Menu');
      await page.evaluate(
        (energy) =>
          localStorage.setItem(
            'avn.floor.v1',
            JSON.stringify({
              version: 1,
              seed: 42,
              floor: 4,
              upgrades: ['power', 'power', 'power'],
              secondary: 'rifle_auto',
              equipped: 'rifle_auto',
              hp: 6,
              armor: 5,
              energy,
              coins: 40,
              kills: 50,
              roomsCleared: 12,
              elapsed: 200,
            }),
          ),
        energy,
      );
      await page.reload();
      await page.locator('#continue-run').click();
      await page.waitForFunction(() => window.__AVN__?.demo?.floor === 4);
      const door = await page.evaluate(() => window.__AVN__!.demo!.links[0]!);
      const key = door.dx > 0 ? 'd' : door.dx < 0 ? 'a' : door.dy > 0 ? 's' : 'w';
      await page.keyboard.down(key);
      await page.waitForFunction(() => window.__AVN__!.demo!.kind === 'boss');
      await page.keyboard.up(key);
      // 玩家没有自动瞄准（ADR 0020）：每帧把右摇杆推向最近的敌人，从身体中心对准碰撞圆心。
      await page.evaluate(() => {
        const aim = () => {
          const demo = window.__AVN__?.demo,
            pad = window as PadWindow;
          if (!demo || demo.settled) {
            pad.setPadAxes!([0, 0, 0, 0]);
            return;
          }
          let dx = 0,
            dy = 0,
            best = Infinity;
          for (const e of demo.enemies) {
            const x = e.x - demo.x,
              y = e.y - demo.y,
              d = Math.hypot(x, y);
            // 目标恰好在枪口原点时跳过，避免把 NaN 写进模拟手柄。
            if (d > 0 && d < best) {
              best = d;
              dx = x / d;
              dy = y / d;
            }
          }
          pad.setPadAxes!([0, 0, dx, dy]);
          requestAnimationFrame(aim);
        };
        requestAnimationFrame(aim);
      });
      await padButton(page, 7, true);
      await page.waitForFunction(() => window.__AVN__!.demo!.alive > 0);
      await expect(page.locator('.demo-status')).toContainText('奶怪');
      await page.waitForFunction(() => window.__AVN__!.demo!.enemies.length > 0);
      await page.screenshot({ path: info.outputPath('demo-boss.png'), scale: 'css' });
      // 固定站在入口射击会把部分子弹打在柱/落石上，200 能量不保证直接击杀。
      // 按正常玩家操作换回免费手枪，保留同一个 35 秒总等待预算与通关/结算检查。
      const deadline = Date.now() + 35_000;
      await page.waitForFunction(
        () => window.__AVN__!.demo!.settled || window.__AVN__!.demo!.energy === 0,
        undefined,
        { timeout: 35_000 },
      );
      if (!(await page.evaluate(() => window.__AVN__!.demo!.settled))) {
        await info.attach('rifle-exhausted', {
          body: JSON.stringify(
            await page.evaluate(() => ({
              time: window.__AVN__!.demo!.time,
              energy: window.__AVN__!.demo!.energy,
              weapon: window.__AVN__!.demo!.weapon,
              status: document.querySelector('.demo-status')?.textContent,
            })),
          ),
          contentType: 'application/json',
        });
        // 低能量用例先排空已发射弹体，确保后续增长来自手枪，避免残弹假阳性。
        if (energy === 20) {
          await page.waitForFunction(() => window.__AVN__!.demo!.bullets === 0);
          expect(await page.evaluate(() => window.__AVN__!.demo!.weapon)).toBe('rifle_auto');
        }
        await padButton(page, INPUT_UI.gamepad.swap, true);
        await padButton(page, INPUT_UI.gamepad.swap, false);
        await page.waitForFunction(() => window.__AVN__!.demo!.weapon === 'pistol_basic');
      }
      if (energy === 20) {
        expect(await page.evaluate(() => window.__AVN__!.demo!.settled)).toBe(false);
        await page.waitForFunction(() => window.__AVN__!.demo!.bullets > 0);
        expect(await page.evaluate(() => window.__AVN__!.demo!.energy)).toBe(0);
        expect(await page.evaluate(() => window.__AVN__!.demo!.weapon)).toBe('pistol_basic');
        await padButton(page, 7, false);
        expect(errors).toEqual([]);
        return;
      }
      await page.waitForFunction(() => window.__AVN__!.demo!.settled, undefined, {
        timeout: Math.max(1, deadline - Date.now()),
      });
      expect(await page.evaluate(() => window.__AVN__!.demo!.phase)).toBe('won');
      const completed = await page.evaluate(() => window.__AVN__!.demo!);
      // 较长战斗中 Boss 会召唤小怪，合法击杀数可能超过入口 50 + Boss 1。
      expect(completed.kills).toBeGreaterThanOrEqual(51);
      expect(completed.alive).toBe(0);
      expect(completed.enemies).toEqual([]);
      await expect(page.locator('#demo-hud h2')).toHaveText('通关成功');
      await page.screenshot({ path: info.outputPath('demo-victory.png'), scale: 'css' });
      expect(await page.evaluate(() => localStorage.getItem('avn.floor.v1'))).toBeNull();
      await padButton(page, 7, false);
      await page.locator('#demo-menu').click();
      await page.waitForFunction(() => window.__AVN__?.scene === 'Hub');
      await expect(page.locator('#demo-hud')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.locator('#pause-menu').click();
      await expect(page.locator('#continue-run')).toBeDisabled();
      await expect(page.locator('#demo-actions')).toHaveCount(0);
      expect(errors).toEqual([]);
    },
  );

test('demo：存储被禁用仍可开局，明确显示未保存状态', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('blocked');
    };
  });
  await page.goto('/?scene=Game&seed=42');
  await expect(page.locator('.demo-hint')).toContainText('无法保存进度');
  const x = await page.evaluate(() => window.__AVN__!.demo!.x);
  await page.keyboard.down('d');
  await page.waitForFunction((x) => window.__AVN__!.demo!.x > x + 5, x);
  await page.keyboard.up('d');
});

test('demo：按住摇杆时，第二指按下技能立即生效，无需松手', async ({ page, context }) => {
  await page.goto('/?scene=Game&god=1&seed=42');
  await page.waitForFunction(() => !!window.__AVN__?.demo);
  const canvas = (await page.locator('#game canvas').boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const move = {
    x: canvas.x + INPUT_UI.joystick.homeInset,
    y: canvas.y + canvas.height - INPUT_UI.joystick.homeInset,
    id: 1,
  };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move] });
  const moving = { ...move, x: move.x + INPUT_UI.joystick.radius * 0.8 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moving] });
  await expect(page.locator('#demo-actions')).toBeVisible();
  const button = (await page.locator('[data-action="Space"]').boundingBox())!;
  const skill = { x: button.x + button.width / 2, y: button.y + button.height / 2, id: 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [moving, skill] });
  await page.waitForFunction(() => window.__AVN__!.demo!.skill > 0);
  expect(await page.evaluate(() => window.__AVN__!.input!.move.x)).toBeGreaterThan(0.5);
  expect(await page.locator('[data-action="Space"]').evaluate((e) => e === document.activeElement)).toBe(
    false,
  );
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
});
