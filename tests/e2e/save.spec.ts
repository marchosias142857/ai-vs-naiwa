import { expect, test, type Page } from '@playwright/test';
import { build } from 'vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type {} from '../fixtures/save';
import { installPad, padButton } from './helpers/gamepad';

let directory: string, url: string, server: ReturnType<typeof createServer>;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'naiwa-save-'));
  await build({
    configFile: false,
    root: resolve('tests/fixtures'),
    base: './',
    logLevel: 'silent',
    build: {
      outDir: directory,
      rollupOptions: {
        input: [resolve('tests/fixtures/save.html')],
      },
    },
  });
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    void readFile(join(directory, path === '/' ? 'save.html' : path))
      .then((data) => {
        res.setHeader(
          'Content-Type',
          path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html',
        );
        res.end(data);
      })
      .catch(() => res.writeHead(404).end());
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  url = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (server) await new Promise<void>((done) => server.close(() => done()));
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function start(page: Page, mode: 'battle' | 'offer' | 'exit' | 'plain' = 'battle') {
  await page.goto(`${url}/save.html?scene=Game&seed=42&god=1`);
  await page.waitForFunction(() => !!window.__AVN__?.demo);
  await page.evaluate(() => history.replaceState(null, '', 'save.html?seed=42&god=1'));
  await page.evaluate((m) => window.saveFixture.prepare(m), mode);
}
async function resume(page: Page) {
  await page.goto(`${url}/save.html?seed=42&god=1`);
  await page.locator('#continue-run').click();
  await page.waitForFunction(() => !!window.__AVN__?.demo);
}
async function thaw(page: Page) {
  await page.waitForFunction(() => window.__AVN__?.demo?.resumeRemaining === 0);
}

test('完整场景 JSON 往返：槽位/寿命/随机流/入口保持，恢复不重放事件，后续物理步完全一致', async ({
  page,
}, info) => {
  await start(page);
  const before = await page.evaluate(() => {
    window.saveFixture.save();
    return window.saveFixture.snapshot();
  });
  expect(before.sim.run.phase).toBe('fighting');
  expect(before.sim.world.bullets.length).toBeGreaterThan(0);
  const stored = await page.evaluate(() => window.saveFixture.stored());
  const uninterrupted = await page.evaluate(() => window.saveFixture.continueSteps());
  // reload 自身也会同步保存最新状态；新文档加载对照实验的原始快照。
  await page.addInitScript((value) => localStorage.setItem('avn.run.v2', JSON.stringify(value)), stored);
  await resume(page);
  expect(await page.evaluate(() => window.saveFixture.snapshot())).toEqual(before);
  expect((await page.evaluate(() => window.saveFixture.status())).events).toEqual([]);
  await page.screenshot({ path: info.outputPath('save-countdown.png'), scale: 'css' });
  const frozen = await page.evaluate(() => window.saveFixture.status());
  await page.waitForTimeout(900);
  await page.evaluate(() => window.saveFixture.tick(6));
  expect(await page.evaluate(() => window.saveFixture.snapshot())).toEqual(before);
  expect((await page.evaluate(() => window.saveFixture.status())).steps).toBe(frozen.steps);
  await thaw(page);
  expect(await page.evaluate(() => window.saveFixture.continueSteps())).toEqual(uninterrupted);
});

for (const trigger of ['hidden', 'pagehide', 'both'] as const) {
  test(`同步保存 ${trigger}，BFCache 复用本局且监听不增长`, async ({ page }) => {
    await start(page);
    const before = await page.evaluate(() => window.saveFixture.snapshot());
    const result = await page.evaluate((t) => {
      const api = window.saveFixture,
        listeners = api.status();
      if (t !== 'pagehide') api.hidden(true);
      if (t !== 'hidden') api.page(true);
      // 没有 await 或下一帧；回调返回时 localStorage 已完成写入。
      const saved = api.stored();
      if (t !== 'hidden') api.page(false);
      if (t !== 'pagehide') api.hidden(false);
      return { saved, listeners, after: api.status() };
    }, trigger);
    expect(result.saved.sim).toEqual(before.sim);
    expect(result.saved.game).toEqual(before.game);
    expect(result.after.saveListeners).toBe(result.listeners.saveListeners);
    expect(result.after.pauseListeners).toBe(result.listeners.pauseListeners);
    expect(await page.evaluate(() => window.saveFixture.snapshot())).toEqual(before);
    await page.evaluate(() => window.saveFixture.tick(1));
    expect((await page.evaluate(() => window.saveFixture.snapshot())).sim.world.time).toBeGreaterThan(
      before.sim.world.time,
    );
  });
}

test('手动暂停提前保存；退出先保存再释放，连续进出没有重复 UI / 监听', async ({ page }) => {
  await start(page);
  const before = await page.evaluate(() => window.saveFixture.snapshot());
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-menu')).toBeVisible();
    expect((await page.evaluate(() => window.saveFixture.stored())).sim).toEqual(before.sim);
    await page.locator('#pause-menu').click();
    await expect(page.locator('#continue-run')).toBeEnabled();
    await expect(page.locator('#demo-hud')).toHaveCount(0);
    await page.locator('#continue-run').click();
    await page.waitForFunction(() => !!window.__AVN__?.demo);
    expect(await page.evaluate(() => window.saveFixture.snapshot())).toEqual(before);
    expect((await page.evaluate(() => window.saveFixture.status())).saveListeners).toBe(1);
    expect((await page.evaluate(() => window.saveFixture.status())).pauseListeners).toBe(1);
    await expect(page.locator('#demo-hud')).toHaveCount(1);
    await expect(page.locator('#demo-actions')).toHaveCount(1);
  }
});

for (const interruption of ['manual', 'hidden', 'portrait'] as const) {
  test(`倒计时中断 ${interruption}：重新计满三秒，玩法边沿全部丢弃`, async ({ page, isMobile }) => {
    test.skip(interruption === 'portrait' && !isMobile, '桌面不因竖屏冻结');
    await start(page);
    await page.evaluate(() => {
      window.saveFixture.queueEdges();
      window.saveFixture.save();
    });
    await resume(page);
    await page.waitForFunction(() => (window.__AVN__?.demo?.resumeRemaining ?? 9) < 2.1);
    const before = await page.evaluate(() => window.saveFixture.snapshot());
    const viewport = page.viewportSize()!;
    if (interruption === 'manual') await page.keyboard.press('Escape');
    else if (interruption === 'hidden') await page.evaluate(() => window.saveFixture.hidden(true));
    else await page.setViewportSize({ width: 393, height: 851 });
    await page.waitForTimeout(200);
    await page.keyboard.press('Space');
    await page.keyboard.press('q');
    await page.keyboard.press('e');
    if (interruption === 'manual') await page.keyboard.press('Escape');
    else if (interruption === 'hidden') await page.evaluate(() => window.saveFixture.hidden(false));
    else await page.setViewportSize(viewport);
    await page.waitForFunction(() => (window.__AVN__?.demo?.resumeRemaining ?? 0) > 2.4);
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.saveFixture.tick(3));
    expect(await page.evaluate(() => window.saveFixture.snapshot())).toEqual(before);
    await thaw(page);
    await page.evaluate(() => window.saveFixture.tick(1));
    const after = await page.evaluate(() => window.saveFixture.snapshot());
    expect(after.sim.world.resources.skillRemaining).toBe(0);
    expect(after.sim.world.player!.weaponId).toBe(before.sim.world.player!.weaponId);
  });
}

test('恢复后手柄长按须先中立，随后新按键才能射击', async ({ page }) => {
  await installPad(page);
  await start(page);
  await page.evaluate(() => window.saveFixture.save());
  await resume(page);
  await padButton(page, 7, true);
  await thaw(page);
  await page.evaluate(() => window.saveFixture.tick(2, window.__AVN__!.input!));
  expect(
    (await page.evaluate(() => window.saveFixture.status())).events.some((e) => e.startsWith('weapon:fired')),
  ).toBe(false);
  await padButton(page, 7, false);
  await page.waitForTimeout(60);
  await padButton(page, 7, true);
  await page.waitForFunction(() => window.__AVN__!.input!.fire);
  await page.evaluate(() => window.saveFixture.tick(30, window.__AVN__!.input!));
  expect(
    (await page.evaluate(() => window.saveFixture.status())).events.some((e) => e.startsWith('weapon:fired')),
  ).toBe(true);
});

test('零物理步已锁存的冲刺、换枪、出口交互在暂停前后全部清空', async ({ page }) => {
  await start(page, 'exit');
  await page.evaluate(() => window.saveFixture.queueEdges());
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__AVN__?.demo?.physicsPaused);
  await page.evaluate(() => window.saveFixture.tick(1));
  const saved = await page.evaluate(() => window.saveFixture.snapshot());
  expect(saved.sim.world.resources.skillRemaining).toBe(0);
  expect(saved.sim.world.player!.weaponId).toBe('shotgun_fan');
  expect(saved.sim.rewards.offers).toEqual([]);
});

test('非战斗直接继续；升级界面保存候选并持有独立暂停，新楼层更新 entry', async ({ page }) => {
  await start(page, 'plain');
  await page.evaluate(() => window.saveFixture.save());
  await resume(page);
  expect((await page.evaluate(() => window.saveFixture.status())).paused).toBe(false);
  await page.evaluate(() => {
    window.saveFixture.prepare('offer');
    window.saveFixture.save();
  });
  const before = await page.evaluate(() => window.saveFixture.snapshot());
  await resume(page);
  expect(await page.evaluate(() => window.saveFixture.snapshot())).toEqual(before);
  const state = await page.evaluate(() => window.saveFixture.status());
  expect(state.remaining).toBe(0);
  expect(state.paused).toBe(true);
  await expect(page.locator('[data-choice="0"]')).toBeVisible();
  await page.locator('[data-choice="0"]').click();
  await page.waitForFunction(() => window.__AVN__?.demo?.floor === 2);
  const saved = await page.evaluate(() => window.saveFixture.stored());
  expect(saved.entry.floor).toBe(2);
  expect(saved.entry.upgrades).toHaveLength(1);
  expect(saved.sim.run.floor).toBe(2);
  expect(saved.sim.rewards.offers).toEqual([]);
});

for (const kind of ['updated', 'invalid', 'corrupt'] as const) {
  test(`菜单兜底区分 ${kind}，入口独立校验`, async ({ page }, info) => {
    await start(page, 'plain');
    const changed = await page.evaluate((k) => {
      window.saveFixture.save();
      const saved = window.saveFixture.stored();
      if (k === 'updated') saved.meta.dataHash = 'old';
      if (k === 'invalid') saved.game.physics.actors[0]!.radius = -1;
      return k === 'corrupt' ? '{broken' : JSON.stringify(saved);
    }, kind);
    await page.addInitScript((value) => localStorage.setItem('avn.run.v2', value), changed);
    await page.reload();
    const notice = {
      updated: '游戏已更新，从本层入口继续',
      invalid: '存档异常，从本层入口继续',
      corrupt: '存档已损坏，无法继续',
    };
    await expect(page.locator('#save-notice')).toHaveText(notice[kind]);
    await page.screenshot({ path: info.outputPath(`save-${kind}.png`), scale: 'css' });
    if (kind === 'corrupt') await expect(page.locator('#continue-run')).toBeDisabled();
    else {
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__AVN__?.demo?.room === 0);
      expect((await page.evaluate(() => window.saveFixture.status())).remaining).toBe(0);
    }
  });
}

test('写入失败保留旧档且可继续玩；终局后 hidden/pagehide 不复活，成绩只记一次', async ({ page }) => {
  await start(page, 'plain');
  const result = await page.evaluate(() => {
    const previous = localStorage.getItem('avn.run.v2'),
      set = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('quota');
    };
    window.saveFixture.tick(3);
    window.saveFixture.save();
    const retained = localStorage.getItem('avn.run.v2');
    Storage.prototype.setItem = set;
    return { previous, retained };
  });
  expect(result.retained).toBe(result.previous);
  await expect(page.locator('.demo-hint')).toContainText('无法保存进度');
  await page.evaluate(() => {
    window.saveFixture.finish();
    window.saveFixture.hidden(true);
    window.saveFixture.page(true);
    window.saveFixture.page(false);
    window.saveFixture.hidden(false);
    window.saveFixture.save();
  });
  expect(await page.evaluate(() => localStorage.getItem('avn.run.v2'))).toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('avn.profile.v1')!).runs)).toBe(1);
  await page.reload();
  await expect(page.locator('#continue-run')).toBeDisabled();
});
