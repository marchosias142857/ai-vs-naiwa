import { loadValue, saveValue } from './storage';
export interface Settings {
  language: 'zh-CN' | 'en';
  sound: boolean;
  flashes: boolean;
}
export function parseSettings(value: unknown): Settings {
  const v = value && typeof value === 'object' ? (value as Partial<Settings>) : {};
  return {
    language: v.language === 'en' ? 'en' : 'zh-CN',
    sound: v.sound !== false,
    flashes: v.flashes !== false,
  };
}
export const settings = parseSettings(loadValue('avn.settings.v1'));
export function setSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  saveValue('avn.settings.v1', settings);
}
