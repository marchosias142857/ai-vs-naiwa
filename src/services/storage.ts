/** 浏览器存储可能被隐私模式或配额限制禁用；失败不阻断游戏。 */
export function loadValue(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function saveValue(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function removeValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 无可用存储时保持本局可玩。 */
  }
}
