import { expect, it } from 'vitest';
import { WEAPONS, type WeaponId } from '../../../src/data/weapons';
import { createCombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { createInputFrame } from '../../../src/sim/core/types';

it('全部十把武器均可装备和发射，超过池上限不生成或发事件', () => {
  expect(Object.values(WEAPONS).filter((w) => w.attack === 'projectile')).toHaveLength(10);
  for (const id of Object.keys(WEAPONS) as WeaponId[]) {
    if (WEAPONS[id].attack !== 'projectile') continue;
    const bus = new EventBus<GameEvents>(),
      world = createCombatWorld({ seed: 1, bus, maxBullets: 1 });
    world.spawnPlayer('ai_proto', 0, 0);
    expect(world.equipWeapon(id)).toBe(true);
    let fired = 0;
    bus.on('weapon:fired', () => fired++);
    const input = createInputFrame();
    input.fire = true;
    expect(world.step(1 / 60, input).bulletSpawns).toHaveLength(1);
    for (let i = 0; i < 100; i++) expect(world.step(1 / 60, input).bulletSpawns).toHaveLength(0);
    expect(fired).toBe(1);
  }
});
it('扇形均匀展开，环形一周，双枪不同枪口，连发跨物理步', () => {
  const world = createCombatWorld({ seed: 3, bus: new EventBus<GameEvents>() });
  world.spawnPlayer('ai_proto', 0, 0);
  const input = createInputFrame();
  input.fire = true;
  input.aim = { x: 1, y: 0 };
  world.equipWeapon('shotgun_fan');
  const fan = world.step(1 / 60, input).bulletSpawns.map((b) => b.angle);
  expect(fan[0]).toBeCloseTo((-32 * Math.PI) / 360);
  expect(fan[4]).toBeCloseTo((32 * Math.PI) / 360);
  input.fire = false;
  for (let i = 0; i < 120; i++) world.step(1 / 60, input);
  world.equipWeapon('twin_smg');
  input.fire = true;
  const twin = world.step(1 / 60, input).bulletSpawns;
  expect(twin[0]!.y).not.toBe(twin[1]!.y);
  input.fire = false;
  for (let i = 0; i < 120; i++) world.step(1 / 60, input);
  world.equipWeapon('burst_rifle');
  input.fire = true;
  expect(world.step(1 / 60, input).bulletSpawns).toHaveLength(1);
  input.fire = false;
  let shots = 0;
  for (let i = 0; i < 20; i++) shots += world.step(1 / 60, input).bulletSpawns.length;
  expect(shots).toBe(2);
});
