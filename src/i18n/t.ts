import { settings } from '../services/settings';
import zh from './zh-CN.json';
import en from './en.json';
export type TextKey = keyof typeof zh;
/** 界面字符串只在创建/低频刷新时格式化。 */
export function t(key: TextKey, values?: Record<string, string | number>): string {
  let text: string = (settings.language === 'en' ? en : zh)[key] ?? zh[key];
  if (values)
    for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}
