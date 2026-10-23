/**
 * 调试用 URL 参数（docs/ARCHITECTURE.md「调试工具」）。
 *
 *   ?seed=12345     固定本局种子
 *   ?debug=1        显示调试信息（FPS 等）
 *   ?god=1          无敌（M1 起生效）
 *   ?room=boss      直接进入指定类型房间（M2 起生效）
 *   ?floor=1-3      直接进入指定关卡（M2 起生效）
 *   ?weapon=<id>    初始武器（M3 起生效）
 *   ?scene=Game     跳过菜单直接进入某个场景
 */
export interface DebugParams {
  seed: number | null;
  debug: boolean;
  god: boolean;
  room: string | null;
  floor: string | null;
  weapon: string | null;
  scene: string | null;
}

const ID_PATTERN = /^[a-z0-9_-]{1,40}$/i;

export function parseDebugParams(search: string): DebugParams {
  const q = new URLSearchParams(search);
  const flag = (key: string) => q.get(key) === '1' || q.get(key) === 'true';
  const id = (key: string) => {
    const v = q.get(key);
    return v !== null && ID_PATTERN.test(v) ? v : null;
  };
  const seedText = q.get('seed');
  const seedNum = seedText !== null && /^\d{1,10}$/.test(seedText) ? Number(seedText) : NaN;
  return {
    seed: Number.isFinite(seedNum) && seedNum <= 0xffffffff ? seedNum : null,
    debug: flag('debug'),
    god: flag('god'),
    room: id('room'),
    floor: id('floor'),
    weapon: id('weapon'),
    scene: id('scene'),
  };
}

let cached: DebugParams | null = null;

/** 当前页面的调试参数（浏览器环境）。 */
export function debugParams(): DebugParams {
  cached ??= parseDebugParams(typeof location === 'undefined' ? '' : location.search);
  return cached;
}
