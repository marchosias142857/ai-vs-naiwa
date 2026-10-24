import { HERO_ART, HERO_FRAMES } from '../../data/art';
/** 动画时钟只服务视觉。非循环动作停在末帧，暂停时 sim.time 不前进。 */
export function frameAt(action: 'idle' | 'run' | 'hurt' | 'death', time: number): keyof typeof HERO_FRAMES {
  const keys = HERO_ART[action];
  let total = 0;
  for (const key of keys) total += HERO_FRAMES[key].seconds;
  let t = action === 'idle' || action === 'run' ? Math.max(0, time) % total : Math.max(0, time);
  for (const key of keys) {
    t -= HERO_FRAMES[key].seconds;
    if (t < 0) return key;
  }
  return keys[keys.length - 1]!;
}
