import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page) {
  await page.keyboard.press('Escape');
  await page.locator('#demo-pause .settings-layout').click();
  await expect(page.locator('#layout-editor')).toBeVisible();
}
async function drag(page: Page, key: string, x: number, y: number) {
  const box = (await page.locator(`#layout-editor [data-key="${key}"]`).boundingBox())!;
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
    const cdp = await page.context().newCDPSession(page);
    const sx = box.x + box.width / 2,
      sy = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x: sx, y: sy }],
    });
    for (let i = 1; i <= 5; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ id: 1, x: sx + ((x - sx) * i) / 5, y: sy + ((y - sy) * i) / 5 }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 5 });
    await page.mouse.up();
  }
}
async function range(page: Page, label: string, value: number) {
  await page.getByRole('slider', { name: label, exact: true }).fill(String(value));
}
async function touch(page: Page, type: string, x: number, y: number) {
  await page.locator('#game canvas').evaluate(
    (canvas, { type, x, y }) => {
      const point = new Touch({ identifier: -42, target: canvas, clientX: x, clientY: y });
      const active = type === 'touchend' ? [] : [point];
      canvas.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          changedTouches: [point],
          touches: active,
          targetTouches: active,
        }),
      );
    },
    { type, x, y },
  );
}

test('暂停编辑：拖动、大小透明度、真实触控与刷新恢复均使用保存布局', async ({ page, isMobile }, info) => {
  await page.goto('/?scene=Game&seed=42&god=1');
  await page.waitForFunction(() => !!window.__AVN__?.demo?.visual);
  await openEditor(page);
  const time = await page.evaluate(() => window.__AVN__!.demo!.time);
  const area = (await page.locator('#layout-editor').boundingBox())!;
  await drag(page, 'health', area.x + 180, area.y + 98);
  await range(page, '大小', 110);
  await range(page, '透明度', 70);
  await page.locator('.layout-tools summary').click();
  await drag(page, 'fire', area.x + area.width * 0.6, area.y + area.height * 0.7);
  await page.locator('.layout-tools summary').click();
  await range(page, '大小', 120);
  await range(page, '透明度', 80);
  await page.locator('.layout-tools summary').click();
  await drag(page, 'skill', area.x + area.width * 0.38, area.y + area.height * 0.85);
  await page.locator('.layout-tools summary').click();
  await page.screenshot({ path: info.outputPath('layout-editor.png'), scale: 'css' });
  expect(await page.evaluate(() => window.__AVN__!.demo!.time)).toBe(time);
  await page.locator('#layout-save').click();
  await expect(page.locator('#layout-editor')).toHaveCount(0);
  await expect(page.locator('#demo-pause')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('avn.ui-layout.v1')!));
  expect(saved.fire.x).toBeCloseTo(0.6);
  expect(saved.fire.scale).toBe(1.2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.vital-health')).toHaveCSS('opacity', '0.7');
  const health = (await page.locator('.vital-health').boundingBox())!;
  expect(health.x + health.width / 2 - area.x).toBeCloseTo(180, 0);
  const input = await page.evaluate(() => window.__AVN__!.input!.touch);
  expect(input.fireX).toBeCloseTo(area.width * 0.6);
  expect(input.fireRadius).toBeCloseTo(67.2);
  if (isMobile) {
    // 退出暂停后技能按钮要等一帧才恢复显示，直接读 boundingBox 偶尔拿到 null。
    await expect(page.locator('[data-action="Space"]')).toBeVisible();
    const skill = (await page.locator('[data-action="Space"]').boundingBox())!;
    expect(skill.x + skill.width / 2 - area.x).toBeCloseTo(area.width * 0.38, 0);
    await page.locator('[data-action="Space"]').tap();
    await page.waitForFunction(() => window.__AVN__!.demo!.skill > 0);
    await touch(page, 'touchstart', area.x + area.width - 88, area.y + area.height - 88);
    await page.waitForFunction((start) => window.__AVN__!.demo!.time > start + 0.25, time);
    expect(await page.evaluate(() => window.__AVN__!.input!.fire)).toBe(false);
    await touch(page, 'touchend', area.x + area.width - 88, area.y + area.height - 88);
    await touch(page, 'touchstart', area.x + input.fireX, area.y + input.fireY);
    await touch(page, 'touchmove', area.x + input.fireX - 40, area.y + input.fireY);
    await page.waitForFunction(() => window.__AVN__!.demo!.bullets > 0);
    expect(await page.evaluate(() => window.__AVN__!.input!.aim!.x)).toBeCloseTo(-1);
    await touch(page, 'touchend', area.x + input.fireX - 40, area.y + input.fireY);
  }
  await page.screenshot({ path: info.outputPath('fullscreen-custom.png'), scale: 'css' });
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setViewportSize(size);
  await page.reload();
  await page.waitForFunction(() => !!window.__AVN__?.demo);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('avn.ui-layout.v1')!))).toEqual(saved);
  await expect(page.locator('.vital-health')).toHaveCSS('opacity', '0.7');
  expect(await page.evaluate(() => window.__AVN__!.input!.touch.fireX)).toBeCloseTo(input.fireX);
});

test('标题设置可编辑；取消不保存，默认值须保存，重叠与存储失败有反馈', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.locator('#demo-menu-panel summary').click();
  await page.locator('#demo-menu-panel .settings-layout').click();
  await range(page, '大小', 140);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => localStorage.getItem('avn.ui-layout.v1'))).toBeNull();
  await page.locator('#demo-menu-panel .settings-layout').click();
  const area = (await page.locator('#layout-editor').boundingBox())!;
  await page.locator('.layout-tools summary').click();
  await drag(page, 'move', area.x + area.width - 88, area.y + area.height - 88);
  await page.locator('.layout-tools summary').click();
  await page.locator('#layout-save').click();
  await expect(page.locator('.layout-tools [role=status]')).toContainText('重叠');
  await page.locator('#layout-reset').click();
  await page.locator('.layout-tools summary').click();
  await drag(page, 'move', area.x + area.width - 100, area.y + 90);
  await page.locator('.layout-tools summary').click();
  await page.locator('#layout-save').click();
  await expect(page.locator('.layout-tools [role=status]')).toContainText('重叠');
  await page.locator('#layout-reset').click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'avn.ui-layout.v1') throw new DOMException('test quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.locator('#layout-save').click();
  await expect(page.locator('.layout-tools [role=status]')).toContainText('保存失败');
  await expect(page.locator('#layout-editor')).toBeVisible();
  await page.locator('#layout-cancel').click();
  await page.reload();
  await page.locator('#demo-menu-panel summary').click();
  await page.locator('#demo-menu-panel .settings-layout').click();
  await range(page, '透明度', 40);
  await page.locator('#layout-reset').click();
  await page.locator('#layout-save').click();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('avn.ui-layout.v1')!).health.opacity),
  ).toBe(0.95);
  await page.reload();
  await page.locator('#demo-menu-panel summary').click();
  await page.locator('#demo-menu-panel .settings-layout').click();
  await expect(page.getByRole('slider', { name: '透明度', exact: true })).toHaveValue('95');
});
