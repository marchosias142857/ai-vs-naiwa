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

/** 区分缺失与损坏，供菜单显示不同提示；存储禁用时仍可开局。 */
export function inspectValue(key: string): { found: false } | { found: true; value: unknown } {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return { found: false };
  }
  if (raw === null) return { found: false };
  try {
    return { found: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { found: true, value: null };
  }
}
