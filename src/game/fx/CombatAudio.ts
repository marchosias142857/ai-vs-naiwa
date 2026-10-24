import type { Scene } from 'phaser';
import { playSound, silenceSound, pauseSound, continueSound } from '../../services/Sound';
import type { EventBus } from '../../sim/core/EventBus';
import type { GameEvents } from '../../sim/core/events';

/** 仅订阅事实事件，不参与伤害结算；监听随场景清理。 */
export class CombatAudio {
  constructor(scene: Scene, bus: EventBus<GameEvents>) {
    continueSound();
    bus.on('weapon:fired', this.fire);
    bus.on('bullet:hit', this.hit);
    bus.on('entity:damaged', this.hurt);
    bus.on('entity:died', this.death);
    bus.on('room:cleared', this.reward);
    scene.events.on('pause', pauseSound);
    scene.events.on('resume', continueSound);
    scene.physics.world.on('pause', pauseSound);
    scene.physics.world.on('resume', continueSound);
    scene.events.once('shutdown', () => {
      bus.off('weapon:fired', this.fire);
      bus.off('bullet:hit', this.hit);
      bus.off('entity:damaged', this.hurt);
      bus.off('entity:died', this.death);
      bus.off('room:cleared', this.reward);
      scene.events.off('pause', pauseSound);
      scene.events.off('resume', continueSound);
      scene.physics.world?.off('pause', pauseSound);
      scene.physics.world?.off('resume', continueSound);
      silenceSound();
    });
  }
  private readonly fire = (): void => playSound('shot');
  private readonly hit = (e: GameEvents['bullet:hit']): void => {
    if (e.targetId !== null) playSound('hit');
  };
  private readonly hurt = (e: GameEvents['entity:damaged']): void => {
    if (e.team === 'player') playSound('hurt');
  };
  private readonly death = (): void => playSound('death');
  private readonly reward = (): void => playSound('reward');
}
