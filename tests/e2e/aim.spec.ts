import { expect, test } from '@playwright/test';
import { worldToScreen } from './helpers/camera';

for (const room of ['arena', 'dungeon']) {
  test(`${room}：手动瞄准射线从身体中心穿过光标`, async ({ page, isMobile }, info) => {
    test.skip(isMobile, '鼠标回归；手机触摸轮盘另有回归测试');
    await page.goto(`/?scene=Game&seed=42&god=1&room=${room}`);
    await page.waitForFunction(
      () => !!window.__AVN__?.input && !!(window.__AVN__.combat || window.__AVN__.demo),
    );
    const player = await page.evaluate(() => {
      const state = window.__AVN__!;
      return state.combat ? { x: state.combat.playerX, y: state.combat.playerY } : state.demo!;
    });
    const target = { x: player.x + 45, y: player.y + 25 };
    const { x, y } = await worldToScreen(page, target.x, target.y);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForFunction(() => !!window.__AVN__!.input!.aim);
    const aim = await page.evaluate(() => window.__AVN__!.input!.aim!);
    const dx = target.x - player.x,
      dy = target.y - player.y;
    // 单位方向与目标向量的叉积就是光标到弹道直线的距离（游戏像素）。
    expect(Math.abs(aim.x * dy - aim.y * dx)).toBeLessThan(1e-4);
    expect(aim.x * dx + aim.y * dy).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath(`aim-${room}.png`), scale: 'css' });
    await page.mouse.up();
  });
}
