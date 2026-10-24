import { expect, it } from 'vitest';
import { LOOT_RULES, ENCOUNTERS } from '../../../src/data/loot';
import { PLAYER_RULES } from '../../../src/data/player';
import { ENEMIES } from '../../../src/data/enemies';
import { LootRulesSchema, EncountersSchema } from '../../../src/data/schema/loot';
import { createCombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { Random } from '../../../src/sim/core/Random';
import { createInputFrame } from '../../../src/sim/core/types';
import { LootSystem } from '../../../src/sim/loot/LootSystem';
import { DungeonRun } from '../../../src/sim/run/DungeonRun';
import { RoomDirector } from '../../../src/sim/run/RoomDirector';

it('掉落与刷怪表 schema / 引用完整', () => {
  expect(LootRulesSchema.safeParse(LOOT_RULES).success).toBe(true);
  expect(EncountersSchema.safeParse(ENCOUNTERS).success).toBe(true);
  for (const floor of ENCOUNTERS.floors) for (const id of floor) expect(id in ENEMIES).toBe(true);
});
it('同种子掉落相同，固定容量饱和与清空不更换槽位', () => {
  const a = new LootSystem(new Random(3).fork('loot')),
    b = new LootSystem(new Random(3).fork('loot'));
  const slots = [...a.slots];
  for (let i = 0; i < 1000; i++) {
    a.enemy(1, 2);
    b.enemy(1, 2);
  }
  expect(a.slots).toEqual(b.slots);
  expect(a.activeCount).toBe(LOOT_RULES.capacity - LOOT_RULES.weaponReserve);
  a.clear();
  a.chest(1, 2);
  expect(a.activeCount).toBe(1);
  a.slots.forEach((s, i) => expect(s).toBe(slots[i]));
});
it('满血补给留下，金币自动收集，武器一次交互一把', () => {
  const world = createCombatWorld({ seed: 1, bus: new EventBus<GameEvents>(), playerRules: PLAYER_RULES });
  world.spawnPlayer('ai_proto', 100, 100);
  const loot = new LootSystem(new Random(1));
  loot.drop('health', 100, 100, 1);
  loot.drop('coin', 100, 100, 3);
  loot.drop('weapon', 100, 100, 1, 'shotgun_fan');
  loot.drop('weapon', 100, 100, 1, 'twin_smg');
  loot.collect(world, 100, 100, false);
  expect(world.resources.coins).toBe(3);
  expect(loot.activeCount).toBe(3);
  loot.collect(world, 100, 100, true);
  expect(world.weaponId).toBe('shotgun_fan');
  expect(loot.activeCount).toBe(2);
});
it('真实 sim 导演消费波次，清房后开门，统计和宝箱仅一次', () => {
  const bus = new EventBus<GameEvents>(),
    world = createCombatWorld({ seed: 2, bus }),
    run = new DungeonRun(2, bus);
  world.spawnPlayer('ai_proto', 150, 100);
  run.enter(1);
  const director = new RoomDirector(
    world,
    run,
    new Random(2),
    { x: 0, y: 0, width: 300, height: 200 },
    () => true,
  );
  const input = createInputFrame();
  for (let i = 0; i < 70; i++) {
    world.step(1 / 60, input);
    director.step(1 / 60);
  }
  expect(run.alive).toBe(2);
  world.debugKillEnemies();
  expect(run.kills).toBe(2);
  for (const a of [...world.actors]) if (a.team === 'enemy') world.removeActor(a.id);
  for (let i = 0; i < 70; i++) {
    world.step(1 / 60, input);
    director.step(1 / 60);
  }
  expect(run.alive).toBe(3);
  world.debugKillEnemies();
  director.step(1 / 60);
  expect(run.locked).toBe(false);
  expect(run.claim()).toBe(true);
  expect(run.claim()).toBe(false);
  run.destroy();
  expect(bus.listenerCount('entity:died')).toBe(0);
});

it('40% 不掉落，同种子可复现；普通物资不能挤占武器预留槽', () => {
  const a = new LootSystem(new Random(42)),
    b = new LootSystem(new Random(42));
  let dropped = 0;
  for (let i = 0; i < 1000; i++) {
    a.clear();
    b.clear();
    a.enemy(1, 2);
    b.enemy(1, 2);
    expect(a.slots).toEqual(b.slots);
    dropped += a.activeCount;
  }
  expect(dropped).toBeGreaterThan(500);
  expect(dropped).toBeLessThan(700);
  a.clear();
  for (let i = 0; i < LOOT_RULES.capacity; i++) a.drop('coin', 0, 0, 1);
  expect(a.activeCount).toBe(LOOT_RULES.capacity - LOOT_RULES.weaponReserve);
  expect(a.chest(10, 20)).toBe(true);
});

it('满武器池也能原槽换回旧枪，单次交互只换一把；跨房保留到换层', () => {
  const world = createCombatWorld({ seed: 1, bus: new EventBus<GameEvents>() });
  world.spawnPlayer('ai_proto', 100, 100);
  world.takeWeapon('rifle_auto');
  const loot = new LootSystem(new Random(1)),
    slots = [...loot.slots];
  loot.enterRoom(2);
  for (let i = 0; i < LOOT_RULES.capacity; i++) loot.drop('weapon', 100, 100, 1, 'shotgun_fan');
  expect(loot.drop('weapon', 100, 100, 1, 'twin_smg')).toBe(false);
  loot.collect(world, 101, 102, true);
  expect(world.secondaryWeapon).toBe('shotgun_fan');
  expect(loot.slots[0]).toMatchObject({ active: true, weapon: 'rifle_auto', x: 101, y: 102, room: 2 });
  expect(loot.activeCount).toBe(LOOT_RULES.capacity);
  loot.enterRoom(3);
  loot.collect(world, 101, 102, true);
  expect(world.secondaryWeapon).toBe('shotgun_fan');
  loot.enterRoom(2);
  loot.collect(world, 101, 102, true);
  expect(world.secondaryWeapon).toBe('rifle_auto');
  expect(loot.slots[0]!.weapon).toBe('shotgun_fan');
  expect(loot.slots.some((s) => s.active && s.weapon === 'pistol_basic')).toBe(false);
  loot.resetFloor(new Random(1).fork('loot:2'));
  expect(loot.activeCount).toBe(0);
  loot.slots.forEach((slot, i) => expect(slot).toBe(slots[i]));
});

it('楼层掉落流不继承上一层消耗', () => {
  const root = new Random(42),
    uninterrupted = new LootSystem(root.fork('loot:1'));
  for (let i = 0; i < 15; i++) uninterrupted.enemy(0, 0);
  uninterrupted.resetFloor(root.fork('loot:2'));
  const resumed = new LootSystem(new Random(42).fork('loot:2'));
  for (let i = 0; i < 10; i++) {
    uninterrupted.enemy(i, 1);
    resumed.enemy(i, 1);
  }
  uninterrupted.chest(1, 1);
  resumed.chest(1, 1);
  expect(uninterrupted.slots).toEqual(resumed.slots);
});

it('刷怪种类和位置按楼层 fork，直接继续与前层消耗后进入一致', () => {
  const setup = (floor: number) => {
    const bus = new EventBus<GameEvents>(),
      world = createCombatWorld({ seed: 42, bus }),
      run = new DungeonRun(42, bus, floor);
    world.spawnPlayer('ai_proto', 150, 100);
    const director = new RoomDirector(
      world,
      run,
      new Random(42),
      { x: 0, y: 0, width: 300, height: 200 },
      () => true,
    );
    return { world, run, director };
  };
  const a = setup(1),
    b = setup(2);
  for (let room = 1; room <= a.run.map.exit; room++) {
    a.run.enter(room);
    while (a.run.locked) {
      a.director.step(2);
      a.world.debugKillEnemies();
      for (const actor of [...a.world.actors]) if (actor.team === 'enemy') a.world.removeActor(actor.id);
    }
  }
  expect(a.run.nextFloor()).toBe(true);
  for (const item of [a, b]) {
    item.run.enter(1);
    item.director.step(2);
  }
  const enemies = (world: ReturnType<typeof createCombatWorld>) =>
    world.actors.filter((a) => a.team === 'enemy').map((a) => [a.kind, a.x, a.y]);
  expect(enemies(a.world)).toEqual(enemies(b.world));
  expect(enemies(a.world).length).toBeGreaterThan(0);
});
