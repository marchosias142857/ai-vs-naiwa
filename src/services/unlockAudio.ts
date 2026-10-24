import { unlockSound } from './Sound';
/** 必须直接在可信手势调用栈里创建/恢复音频。 */
export function unlockAudio(): void {
  unlockSound();
}
