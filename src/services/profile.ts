/** 浏览器 I/O；解析、迁移与奖励规则由 game 调用纯 sim 契约。 */
export const CHECKPOINT_KEY = 'avn.floor.v1';
export const PROFILE_KEY = 'avn.profile.v2';
export const PROFILE_BACKUP_KEY = 'avn.profile.v2.backup';
export interface ProfileSource {
  raw: string | null;
  legacy: unknown;
  readable: boolean;
}
export function readProfileSource(): ProfileSource {
  try {
    const raw = localStorage.getItem(PROFILE_KEY) ?? null;
    const legacy = localStorage.getItem('avn.profile.v1');
    let value: unknown = null;
    try {
      value = legacy ? JSON.parse(legacy) : null;
    } catch {
      /* 保留旧原文，不覆盖 v1。 */
    }
    return { raw, legacy: value, readable: true };
  } catch {
    // 读取失败不能当作空档案再覆盖。
    return { raw: null, legacy: null, readable: false };
  }
}
export function writeProfile(value: unknown, source: ProfileSource, backup = false): boolean {
  if (!source.readable) return false;
  try {
    if (backup && source.raw !== null) localStorage.setItem(PROFILE_BACKUP_KEY, source.raw);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
