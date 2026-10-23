/** M5 接入 AudioManager；创建/恢复 AudioContext 必须直接发生在此手势调用栈中。 */
export function unlockAudio(): void {
  // M0 尚无音频资源，此处保留同步入口。
}
