import type { Scene } from 'phaser';
/** DOM 菜单也服从自动暂停：Phaser 睡眠时不能靠键盘/脚本排队切场景。 */
export function guardGameUi(root: HTMLElement, scene: Scene, signal: AbortSignal): void {
  const guard = (event: Event) => {
    if (scene.game.input.enabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  root.addEventListener('click', guard, { signal, capture: true });
  root.addEventListener('keydown', guard, { signal, capture: true });
}
