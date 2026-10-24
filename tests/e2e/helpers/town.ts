import { expect, type Page } from '@playwright/test';

/** 经实际入口、移动与门口确认进入新冒险，不直接写 sim 或场景状态。 */
export async function enterDungeon(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__AVN__?.scene === 'Hub');
  await page.keyboard.down('w');
  await expect(page.locator('#hub-door')).toBeVisible();
  await page.keyboard.up('w');
  await page.locator('#hub-door').click();
  await page.locator('#enter-dungeon').click();
  await page.waitForFunction(() => window.__AVN__?.scene === 'Game');
}
export async function startAdventure(page: Page): Promise<void> {
  await page.locator('#start-run').click();
  await enterDungeon(page);
}
