import { DEFAULT_CHARACTER_ART } from '../../data/characterArt';
import type { CharacterAction, CharacterArt } from '../../data/schema/art';
/** 动画时钟只服务视觉。非循环动作停在末帧，暂停时 sim.time 不前进。 */
export function frameAt(
  action: CharacterAction,
  time: number,
  art: CharacterArt = DEFAULT_CHARACTER_ART,
): string {
  const keys = art[action];
  let total = 0;
  for (const key of keys) total += art.frames[key]!.seconds;
  let t = action === 'idle' || action === 'run' ? Math.max(0, time) % total : Math.max(0, time);
  for (const key of keys) {
    t -= art.frames[key]!.seconds;
    if (t < 0) return key;
  }
  return keys[keys.length - 1]!;
}
