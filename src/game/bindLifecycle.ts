import type { Game } from 'phaser';
import { LifecycleService } from '../services/LifecycleService';
import { unlockAudio } from '../services/unlockAudio';
import { setLifecycleProbe } from './testHooks';

/** 连接浏览器生命周期与 Phaser；只恢复本适配器持有的循环暂停。 */
export function bindLifecycle(game: Game): LifecycleService {
  const overlay = document.querySelector<HTMLElement>('#rotate-overlay');
  if (!overlay) throw new Error('缺少旋转遮罩');
  let ownsSleep = false;
  let inputEnabled = true;
  let keyboardEnabled = true;
  const applyPause = (paused: boolean) => {
    if (!game.loop.started) return;
    if (paused && !ownsSleep && game.loop.running) {
      ownsSleep = true;
      inputEnabled = game.input.enabled;
      keyboardEnabled = game.input.keyboard?.enabled ?? false;
      game.input.enabled = false;
      if (game.input.keyboard) game.input.keyboard.enabled = false;
      for (const scene of game.scene.getScenes(false)) scene.input.keyboard?.resetKeys();
      for (const pointer of game.input.pointers) pointer.reset();
      game.loop.sleep();
    } else if (!paused && ownsSleep) {
      ownsSleep = false;
      game.input.enabled = inputEnabled;
      if (game.input.keyboard) game.input.keyboard.enabled = keyboardEnabled;
      // TweenManager 使用独立墙钟；同步其公开时基，避免恢复时补跑暂停时长。
      const now = Date.now();
      for (const scene of game.scene.getScenes(false)) {
        scene.tweens.startTime += now - scene.tweens.prevTime;
        scene.tweens.prevTime = now;
      }
      // wake() 会立即 tick；先清除暂停时长，避免下一帧补跑物理和 TimerEvent。
      game.loop.resetDelta();
      game.loop.wake();
    }
  };
  const lifecycle = new LifecycleService(overlay, {
    onPauseChange: applyPause,
    unlockAudio,
    onHidden() {
      // M4：在循环已暂停后同步保存局内快照。
    },
  });
  // READY 在 loop.start() 之前；首帧末尾才能可靠 sleep，覆盖竖屏冷启动。
  game.events.once('postrender', () => applyPause(lifecycle.isPaused));
  game.events.once('destroy', () => lifecycle.destroy());
  setLifecycleProbe(() => ({
    paused: lifecycle.isPaused,
    loopRunning: game.loop.running,
    frame: game.loop.frame,
    sceneTime: game.scene.getScenes(true)[0]?.time.now ?? 0,
  }));
  return lifecycle;
}
