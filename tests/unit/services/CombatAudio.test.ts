import { EventEmitter } from 'node:events';
import type { Scene } from 'phaser';
import { expect, it, vi } from 'vitest';
import { CombatAudio } from '../../../src/game/fx/CombatAudio';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { continueSound, pauseSound, suspendSound } from '../../../src/services/Sound';

vi.mock('../../../src/services/Sound', () => ({
  continueSound: vi.fn(),
  pauseSound: vi.fn(),
  suspendSound: vi.fn(),
  playSound: vi.fn(),
}));

it('场景/物理暂停叠加时均恢复才解除静音；shutdown 注销监听并挂起音频', () => {
  const events = new EventEmitter(),
    world = Object.assign(new EventEmitter(), { isPaused: false }),
    bus = new EventBus<GameEvents>();
  let scenePaused = false;
  const scene = { events, physics: { world }, sys: { isPaused: () => scenePaused } } as unknown as Scene;
  new CombatAudio(scene, bus);
  expect(continueSound).toHaveBeenCalledTimes(1);
  world.isPaused = true;
  world.emit('pause');
  scenePaused = true;
  events.emit('pause');
  world.isPaused = false;
  world.emit('resume');
  expect(pauseSound).toHaveBeenCalledTimes(3);
  expect(continueSound).toHaveBeenCalledTimes(1);
  expect(suspendSound).not.toHaveBeenCalled();
  scenePaused = false;
  events.emit('resume');
  expect(continueSound).toHaveBeenCalledTimes(2);
  events.emit('shutdown');
  expect(suspendSound).toHaveBeenCalledTimes(1);
  expect(events.listenerCount('pause')).toBe(0);
  expect(world.listenerCount('resume')).toBe(0);
  events.emit('resume');
  world.emit('resume');
  expect(continueSound).toHaveBeenCalledTimes(2);
});
