import { expect, it } from 'vitest';
import { parseSettings, settings } from '../../../src/services/settings';
import { t } from '../../../src/i18n/t';
import zh from '../../../src/i18n/zh-CN.json';
import en from '../../../src/i18n/en.json';
import { UPGRADES } from '../../../src/data/player';
it('设置容错；中英文键和替换占位符完整一致', () => {
  expect(parseSettings(null)).toEqual({ language: 'zh-CN', sound: true, flashes: true });
  expect(parseSettings({ language: 'bad', sound: false })).toEqual({
    language: 'zh-CN',
    sound: false,
    flashes: true,
  });
  expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  for (const key of Object.keys(zh) as (keyof typeof zh)[])
    expect(en[key].match(/\{\w+\}/g)?.sort()).toEqual(zh[key].match(/\{\w+\}/g)?.sort());
  for (const upgrade of Object.values(UPGRADES)) expect(Object.hasOwn(zh, upgrade.name)).toBe(true);
  settings.language = 'en';
  expect(t('menu.continue', { floor: 2 })).toContain('floor 2');
  settings.language = 'zh-CN';
  expect(t('app.title')).toBe('AI 大战奶蛙');
});
