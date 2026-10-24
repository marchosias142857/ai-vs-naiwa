import type { Scene } from 'phaser';
import { RESUME_RULES } from '../../data/resume';
import { resetPhysicsClock } from './bodySnapshot';
import { PauseState } from './PauseState';

export const LIFECYCLE_PAUSE = 'lifecycle:pause';
export const SAVE_REQUEST = 'run:save-request';
const bindings = new WeakMap<Scene, PauseState>();
export const combatPause = (scene: Scene): PauseState | undefined => bindings.get(scene);

/** demo 的物理暂停唯一入口；UI 场景和暂停菜单继续更新。 */
export function bindCombatPause(scene: Scene, clearInput: () => void): PauseState {
  const pause = new PauseState(RESUME_RULES.countdown, (reason, active) => {
    clearInput();
    resetPhysicsClock(scene.physics.world);
    if (pause.blocked) scene.physics.pause();
    else scene.physics.resume();
    if (reason === 'manual' && active) scene.game.events.emit(SAVE_REQUEST);
  });
  const lifecycle = (active: boolean) => pause.set('lifecycle', active);
  bindings.set(scene, pause);
  scene.game.events.on(LIFECYCLE_PAUSE, lifecycle);
  lifecycle(!!scene.game.registry.get(LIFECYCLE_PAUSE));
  scene.events.once('shutdown', () => {
    scene.game.events.off(LIFECYCLE_PAUSE, lifecycle);
    bindings.delete(scene);
  });
  return pause;
}
