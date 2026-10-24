import { expect, it } from 'vitest';
import { createCombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { createInputFrame } from '../../../src/sim/core/types';
it('反复出生死亡复用同一实体记录；容量固定且恢复全部字段', () => {
  const world = createCombatWorld({ seed: 1, bus: new EventBus<GameEvents>(), maxActors: 2 }),
    input = createInputFrame();
  world.spawnPlayer('ai_proto', 0, 0);
  let previous: unknown;
  for (let i = 0; i < 1000; i++) {
    const id = world.spawnEnemy(i % 2 ? 'naiwa_chaser' : 'naiwa_charger', 100, 100),
      actor = world.getActor(id)!;
    if (previous) expect(actor).toBe(previous);
    expect(actor.phase).toBe('telegraph');
    expect(actor.vx).toBe(0);
    expect(actor.warning).toBe(false);
    expect(() => world.spawnEnemy('naiwa_chaser', 0, 0)).toThrow('pool exhausted');
    world.debugKillEnemies();
    world.removeActor(id);
    expect(world.getActor(id)).toBeUndefined();
    expect(world.actors).toHaveLength(1);
    world.step(1 / 60, input);
    previous = actor;
  }
});
it('同步回收子弹时，单步输出上限不会吞掉可用记录', () => {
  const bus = new EventBus<GameEvents>(),
    world = createCombatWorld({ seed: 1, bus, maxBullets: 1 });
  world.spawnPlayer('ai_proto', 100, 100);
  world.spawnEnemy('naiwa_turret', 180, 100);
  const input = createInputFrame(),
    result = world.step(0, input);
  let shots = 0;
  bus.on('weapon:fired', () => {
    shots++;
    for (const bullet of result.bulletSpawns) world.releaseBullet(bullet.id);
  });
  input.fire = true;
  for (let i = 0; i < 600; i++) world.step(1 / 60, input);
  expect(shots).toBeGreaterThan(35);
});
it('死亡事件同步移除并补怪时，旧命中编号不串到新目标', () => {
  const bus = new EventBus<GameEvents>(),
    world = createCombatWorld({ seed: 1, bus, maxActors: 3 }),
    input = createInputFrame();
  world.spawnPlayer('ai_proto', 0, 0);
  world.equipWeapon('heavy_cannon');
  const old = world.spawnEnemy('naiwa_scout', 100, 0);
  let replacement = 0,
    hit = 0;
  for (let i = 0; i < 40; i++) world.step(1 / 60, input);
  bus.on('entity:died', (e) => {
    world.removeActor(e.id);
    replacement = world.spawnEnemy('naiwa_chaser', 100, 0);
  });
  bus.on('bullet:hit', (e) => {
    hit = e.targetId!;
  });
  input.fire = true;
  const bullet = world.step(1 / 60, input).bulletSpawns[0]!;
  world.hitActor(bullet.id, old, 100, 0);
  expect(hit).toBe(old);
  expect(replacement).not.toBe(old);
  expect(world.getActor(replacement)?.hp).toBe(9);
});
