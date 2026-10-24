import { afterEach, expect, it, vi } from 'vitest';
import { loadValue, removeValue, saveValue } from '../../../src/services/storage';
afterEach(() => vi.unstubAllGlobals());
it('安全存取 JSON；损坏与存储被禁用时返回失败并保持调用方可运行', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k),
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
  expect(saveValue('save', { v: 1 })).toBe(true);
  expect(loadValue('save')).toEqual({ v: 1 });
  values.set('save', '{bad');
  expect(loadValue('save')).toBe(null);
  removeValue('save');
  expect(values.has('save')).toBe(false);
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw Error();
    },
    setItem: () => {
      throw Error();
    },
    removeItem: () => {
      throw Error();
    },
  });
  expect(loadValue('save')).toBe(null);
  expect(saveValue('save', {})).toBe(false);
  expect(() => removeValue('save')).not.toThrow();
});
