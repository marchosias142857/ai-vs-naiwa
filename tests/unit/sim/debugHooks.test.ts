import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../../src/data/balance';
import { CHARACTERS } from '../../../src/data/characters';
import { createCombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { createInputFrame } from '../../../src/sim/core/types';

/** #17 调试钩子（ADR 0005）：godMode 与 debugKillEnemies。 */

const DT = 1 / 60;

function setup(godMode = false) {
  const bus = new EventBus<GameEvents>();
  const world = createCombatWorld({ seed: 3, bus, godMode });
  const input = createInputFrame();
  const player = world.spawnPlayer('ai_proto', 100, 100);
  const advance = (seconds: number) => {
    for (let t = 0; t < seconds; t += DT) world.step(DT, input);
  };
  return { bus, world, player, advance };
}

describe('godMode', () => {
  it('接触怪物不扣血，也不进入受伤无敌帧', () => {
    const { world, player, advance } = setup(true);
    const enemy = world.spawnEnemy('naiwa_chaser', 100, 100);
    advance(BALANCE.spawnTelegraph + DT);
    for (let i = 0; i < 20; i++) {
      world.contact(enemy, player);
      advance(CHARACTERS.ai_proto.invulnTime + DT);
    }
    expect(world.getActor(player)!.hp).toBe(CHARACTERS.ai_proto.hp);
    expect(world.getActor(player)!.invulnerable).toBe(false);
    expect(world.step(DT, createInputFrame()).playerDead).toBe(false);
  });

  it('默认关闭：同样的接触会扣血', () => {
    const { world, player, advance } = setup();
    const enemy = world.spawnEnemy('naiwa_chaser', 100, 100);
    advance(BALANCE.spawnTelegraph + DT);
    world.contact(enemy, player);
    expect(world.getActor(player)!.hp).toBe(CHARACTERS.ai_proto.hp - 1);
  });
});

describe('debugKillEnemies', () => {
  it('杀死全部怪物（含预警中），按 damaged → died 发事件，来源为 null；玩家不受影响', () => {
    const { bus, world, player, advance } = setup();
    const active = [world.spawnEnemy('naiwa_chaser', 200, 100), world.spawnEnemy('naiwa_chaser', 220, 100)];
    advance(BALANCE.spawnTelegraph + DT);
    const telegraph = world.spawnEnemy('naiwa_chaser', 240, 100);
    expect(world.getActor(telegraph)!.phase).toBe('telegraph');

    const log: string[] = [];
    bus.on('entity:damaged', (e) => log.push(`damaged:${e.id}:${String(e.sourceId)}`));
    bus.on('entity:died', (e) => log.push(`died:${e.id}:${String(e.killerId)}`));
    world.debugKillEnemies();

    for (const id of [...active, telegraph]) {
      expect(world.getActor(id)!.phase).toBe('dead');
      expect(world.getActor(id)!.hp).toBe(0);
      const damaged = log.indexOf(`damaged:${id}:null`);
      expect(damaged).toBeGreaterThanOrEqual(0);
      expect(log[damaged + 1]).toBe(`died:${id}:null`);
    }
    expect(log).toHaveLength(6);
    expect(world.getActor(player)!.hp).toBe(CHARACTERS.ai_proto.hp);
    // 预警中被清掉的怪不会在预警结束时复活。
    advance(BALANCE.spawnTelegraph + DT);
    expect(world.getActor(telegraph)!.phase).toBe('dead');
  });

  it('监听器在 entity:died 里同步 removeActor，也不会漏掉其他怪物', () => {
    const { bus, world, advance } = setup();
    const ids = [0, 1, 2, 3, 4].map((i) => world.spawnEnemy('naiwa_chaser', 150 + i * 20, 150));
    advance(BALANCE.spawnTelegraph + DT);
    bus.on('entity:died', (e) => world.removeActor(e.id));
    world.debugKillEnemies();
    for (const id of ids) expect(world.getActor(id)).toBeUndefined();
    expect(world.actors).toHaveLength(1);
  });
});
