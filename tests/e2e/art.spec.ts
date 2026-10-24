import { startAdventure } from './helpers/town';
import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RENDER_SCALE } from '../../src/config';
import { HERO_ART, HERO_FRAMES } from '../../src/data/art';

/** Phaser 在解码后释放 blob URL；从实际素材响应核对字节，再检查渲染纹理和尺寸。 */
function captureImageSource(page: Page, file: string): Promise<Buffer> {
  return page
    .waitForResponse((response) => response.url().endsWith(`/assets/demo/${file}`))
    .then((response) => response.body());
}
function expectImageSource(bytes: Buffer, file: string): void {
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    createHash('sha256')
      .update(readFileSync(`public/assets/demo/${file}`))
      .digest('hex'),
  );
}

test('待机与行走完整循环；停步重新待机、暂停冻结动作', async ({ page }) => {
  await page.goto('/?scene=Game&seed=42&god=1');
  await page.waitForFunction(() => !!window.__AVN__?.demo?.visual);
  const collect = (action: string, count: number) =>
    page.evaluate(
      ({ action, count }) =>
        new Promise<string[]>((resolve) => {
          const frames = new Set<string>();
          // CI 的渲染速度可能低于实时；按动画实际推进量收集完整循环。
          const start = window.__AVN__!.demo!.time;
          const deadline = performance.now() + 15_000;
          const sample = () => {
            const frame = String(window.__AVN__?.demo?.visual?.frame);
            if (frame.startsWith(action)) frames.add(frame);
            if (
              frames.size === count ||
              window.__AVN__!.demo!.time - start > 2.5 ||
              performance.now() > deadline
            )
              resolve([...frames].sort());
            else requestAnimationFrame(sample);
          };
          sample();
        }),
      { action, count },
    );
  expect(await collect('idle_', HERO_ART.idle.length)).toEqual([...HERO_ART.idle].sort());
  await page.keyboard.down('KeyD');
  expect(await collect('run_', HERO_ART.run.length)).toEqual([...HERO_ART.run].sort());
  await page.keyboard.up('KeyD');
  await expect.poll(() => page.evaluate(() => window.__AVN__?.demo?.visual?.frame)).toBe('idle_0');
  await page.keyboard.press('Escape');
  await expect(page.locator('#demo-pause')).toBeVisible();
  const frame = await page.evaluate(() => window.__AVN__?.demo?.visual?.frame);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
  expect(await page.evaluate(() => window.__AVN__?.demo?.visual?.frame)).toBe(frame);
});

test('真实图集：四向翻面/握持/遮挡，跑步换帧不改变身体中心', async ({ page }, info) => {
  const heroImage = captureImageSource(page, HERO_ART.source);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?scene=Game&seed=42&god=1&debug=1');
  await page.waitForFunction(() => !!window.__AVN__?.demo?.visual);
  const canvas = (await page.locator('#game canvas').boundingBox())!;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const p = await page.evaluate(() => window.__AVN__!.demo!);
    await page.mouse.move(
      canvas.x + ((p.x + dx! * 55) / 480) * canvas.width,
      canvas.y + ((p.y + dy! * 55) / 270) * canvas.height,
    );
    await page.mouse.down();
    await page.waitForFunction(
      ({ dx, dy }) => {
        const v = window.__AVN__?.demo?.visual;
        return (
          !!v &&
          window.__AVN__!.input!.fire &&
          v.flipX === Math.cos(v.weapon.angle) >= 0 &&
          Math.abs(Math.cos(v.weapon.angle) - dx) < 0.01 &&
          Math.abs(Math.sin(v.weapon.angle) - dy) < 0.01
        );
      },
      { dx: dx!, dy: dy! },
    );
    const v = (await page.evaluate(() => window.__AVN__!.demo!.visual))!;
    expect(v.texture).toBe(HERO_ART.texture);
    expectImageSource(await heroImage, HERO_ART.source);
    expect([v.sourceWidth, v.sourceHeight]).toEqual([1536, 1024]);
    expect(v.flipX).toBe(Math.cos(v.weapon.angle) >= 0);
    expect(v.weapon.flipY).toBe(!v.flipX);
    expect(v.weapon.depth < v.depth).toBe(dy === -1);
    const f = HERO_FRAMES[v.frame as keyof typeof HERO_FRAMES],
      sign = v.weapon.flipY ? 1 : -1;
    const alignedX = (v.face.x + (v.flipX ? v.face.width : 0)) * RENDER_SCALE;
    const top = v.face.y * RENDER_SCALE;
    expect(v.face.visible).toBe(true);
    expect(alignedX).toBeCloseTo(Math.round(alignedX));
    expect(top).toBeCloseTo(Math.round(top));
    expect(v.weapon.x - v.x).toBeCloseTo((f.grip.x - f.pivot.x) * HERO_ART.scale * sign);
    expect(v.weapon.y - v.y).toBeCloseTo((f.grip.y - f.pivot.y) * HERO_ART.scale);
    await page.screenshot({ path: info.outputPath(`art-direction-${dx}-${dy}.png`) });
    await page.mouse.up();
  }
  await page.keyboard.down('d');
  await page.waitForFunction(() => String(window.__AVN__?.demo?.visual?.frame).startsWith('run_'));
  await page.keyboard.up('d');
  await page.keyboard.press('F1');
  await page.screenshot({ path: info.outputPath('art-hitboxes.png') });
  expect(errors).toEqual([]);
});

test('重锤挥动可暂停保存，正式刷新续玩保留挥动和命中记录', async ({ page }, info) => {
  await page.goto('/?seed=42&god=1&weapon=anchor_hammer');
  await startAdventure(page);
  await page.waitForFunction(() => window.__AVN__?.demo?.weapon === 'anchor_hammer');
  const canvas = (await page.locator('#game canvas').boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width * 0.6, canvas.y + canvas.height * 0.5);
  await page.mouse.down();
  // 在页面内同一帧请求暂停，避免 CI 往返延迟越过 300 ms 挥动窗口。
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const pauseDuringSwing = () => {
          if (!window.__AVN__?.demo?.meleeActive) {
            requestAnimationFrame(pauseDuringSwing);
            return;
          }
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
          );
          window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true }));
          resolve();
        };
        pauseDuringSwing();
      }),
  );
  await expect(page.locator('#demo-pause')).toBeVisible();
  await page.mouse.up();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('avn.run.v2')!).sim.world.melee);
  expect(saved.active).toBe(true);
  expect(saved.remaining).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('art-melee-pause.png') });
  await page.reload();
  await expect(page.locator('#save-notice')).toBeHidden();
  await page.locator('#continue-run').click();
  await page.waitForFunction(() => !!window.__AVN__?.demo);
  const loaded = await page.evaluate(() => JSON.parse(localStorage.getItem('avn.run.v2')!).sim.world.melee);
  expect(loaded).toEqual(saved);
});

test('标题与 HUD 完整画面；触屏提示使用轮盘说明', async ({ page, isMobile }, info) => {
  await page.goto('/?seed=42&god=1');
  await expect(page.locator('#start-run')).toBeVisible();
  await page.locator('#demo-menu-panel summary').click();
  const layout = await page.locator('#demo-menu-panel').evaluate((panel) => {
    const controls = Array.from(panel.querySelectorAll('.menu-settings button'));
    return {
      bottom: Math.max(...controls.map((button) => button.getBoundingClientRect().bottom)),
      rows: new Set(controls.map((button) => button.getBoundingClientRect().top)).size,
      viewport: innerHeight,
      scroll: panel.scrollTop,
    };
  });
  expect(layout.rows).toBe(1);
  expect(layout.bottom).toBeLessThanOrEqual(layout.viewport);
  expect(layout.scroll).toBe(0);
  await page.locator('#demo-menu-panel summary').click();
  await page.screenshot({ path: info.outputPath('demo-title.png') });
  await startAdventure(page);
  await page.waitForFunction(() => !!window.__AVN__?.demo?.visual);
  await expect(page.locator('.demo-vitals [role=meter]')).toHaveCount(3);
  if (isMobile) {
    await expect(page.locator('.demo-hint')).toContainText('轮盘');
    await expect(page.locator('.demo-hint')).not.toContainText('鼠标');
  }
  await page.screenshot({ path: info.outputPath('demo-room.png') });
});

test('参考图角色：受击使用新图集，死亡完整落地且隐藏武器', async ({ page }, info) => {
  const heroImage = captureImageSource(page, HERO_ART.source);
  const reactionImage = captureImageSource(page, HERO_ART.reactionSource);
  test.setTimeout(90_000);
  await page.goto('/?seed=42');
  await page.waitForFunction(() => window.__AVN__?.scene === 'Menu');
  await page.evaluate(() => {
    localStorage.setItem('avn.settings.v1', JSON.stringify({ flashes: false, sound: false }));
    localStorage.setItem(
      'avn.floor.v1',
      JSON.stringify({
        version: 1,
        seed: 42,
        floor: 1,
        upgrades: [],
        secondary: null,
        equipped: 'pistol_basic',
        hp: 2,
        armor: 0,
        energy: 50,
        coins: 0,
        kills: 0,
        roomsCleared: 0,
        elapsed: 0,
      }),
    );
  });
  await page.reload();
  await page.locator('#continue-run').click();
  await page.waitForFunction(() => !!window.__AVN__?.demo?.visual);
  const initial = (await page.evaluate(() => window.__AVN__!.demo!.visual))!;
  expect(initial.texture).toBe(HERO_ART.texture);
  expectImageSource(await heroImage, HERO_ART.source);
  expect([initial.sourceWidth, initial.sourceHeight]).toEqual([1536, 1024]);
  // 在页面内捕捉短受击窗口并立即暂停，避免协议往返错过动作。
  await page.evaluate(() => {
    const watch = () => {
      const frame = String(window.__AVN__?.demo?.visual?.frame);
      if (frame.startsWith('hurt_')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true }));
      } else if (!window.__AVN__?.demo?.settled) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  const door = await page.evaluate(() => window.__AVN__!.demo!.links[0]!);
  const key = door.dx > 0 ? 'd' : door.dx < 0 ? 'a' : door.dy > 0 ? 's' : 'w';
  await page.keyboard.down(key);
  await page.waitForFunction(() => window.__AVN__!.demo!.room !== 0);
  await page.keyboard.up(key);
  await expect(page.locator('#demo-pause')).toBeVisible({ timeout: 40_000 });
  const hurt = (await page.evaluate(() => window.__AVN__!.demo!.visual))!;
  expect(HERO_ART.hurt).toContain(hurt.frame);
  expect(hurt.texture).toBe(HERO_ART.reactionTexture);
  expect(hurt.face.visible).toBe(false);
  expectImageSource(await reactionImage, HERO_ART.reactionSource);
  expect([hurt.sourceWidth, hurt.sourceHeight]).toEqual([1536, 1024]);
  await page.screenshot({ path: info.outputPath('reference-hurt.png') });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__AVN__!.demo!.settled, undefined, { timeout: 40_000 });
  const dead = (await page.evaluate(() => window.__AVN__!.demo!.visual))!;
  expect(dead.frame).toBe('death_3');
  expect(dead.texture).toBe(HERO_ART.reactionTexture);
  expect(dead.weapon.visible).toBe(false);
  expect(dead.face.visible).toBe(false);
  await page.screenshot({ path: info.outputPath('reference-death.png') });
});
