import { test, expect } from '@playwright/test';
import { HERO_ART, HERO_FRAMES } from '../../src/data/art';

test('真实图集：四向翻面/握持/遮挡，跑步换帧不改变身体中心', async ({ page }, info) => {
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
    await page.waitForFunction(
      ({ dx, dy }) => {
        const v = window.__AVN__?.demo?.visual;
        return (
          !!v &&
          Math.abs(Math.cos(v.weapon.angle) - dx) < 0.01 &&
          Math.abs(Math.sin(v.weapon.angle) - dy) < 0.01
        );
      },
      { dx: dx!, dy: dy! },
    );
    const v = (await page.evaluate(() => window.__AVN__!.demo!.visual))!;
    expect(v.flipX).toBe(dx! < 0);
    expect(v.weapon.flipY).toBe(v.flipX);
    expect(v.weapon.depth < v.depth).toBe(dy === -1);
    const f = HERO_FRAMES[v.frame as keyof typeof HERO_FRAMES],
      sign = v.flipX ? -1 : 1;
    expect(v.weapon.x - v.x).toBeCloseTo((f.grip.x - f.pivot.x) * HERO_ART.scale * sign);
    expect(v.weapon.y - v.y).toBeCloseTo((f.grip.y - f.pivot.y) * HERO_ART.scale);
    await page.screenshot({ path: info.outputPath(`art-direction-${dx}-${dy}.png`) });
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
  await page.locator('#start-run').click();
  await page.waitForFunction(() => window.__AVN__?.demo?.weapon === 'anchor_hammer');
  const canvas = (await page.locator('#game canvas').boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width * 0.6, canvas.y + canvas.height * 0.5);
  await page.mouse.down();
  await page.waitForFunction(() => window.__AVN__?.demo?.meleeActive);
  await page.keyboard.press('Escape');
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
