import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../../../src/data/weapons';
import { WeaponDefSchema } from '../../../src/data/schema/weapon';
import { createCombatWorld, type CombatWorldState } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { createInputFrame } from '../../../src/sim/core/types';
import { sectorHitsCircle } from '../../../src/sim/weapons/melee';

const dt = 1 / 60;
function setup(blocked = false) {
  const bus = new EventBus<GameEvents>();
  const world = createCombatWorld({ seed: 42, bus, maxBullets: 0, lineOfSight: () => !blocked });
  const player = world.spawnPlayer('ai_proto', 100, 100);
  world.takeWeapon('cutlass');
  const front = world.spawnEnemy('naiwa_tank', 122, 100);
  const back = world.spawnEnemy('naiwa_tank', 78, 100);
  const far = world.spawnEnemy('naiwa_tank', 170, 100);
  const input = createInputFrame();
  input.aim = { x: 1, y: 0 };
  for (let i = 0; i < 60; i++) world.step(dt, input);
  return { world, bus, player, front, back, far, input };
}
describe('锁步近战', () => {
  it('扇形边界相交，范围外/背面不命中，跨 ±π 与原点重叠都正确', () => {
    expect(sectorHitsCircle(20, 0, 3, 0, 25, 90)).toBe(true);
    expect(sectorHitsCircle(-20, 0, 3, 0, 25, 90)).toBe(false);
    expect(sectorHitsCircle(30, 0, 3, 0, 25, 90)).toBe(false);
    expect(sectorHitsCircle(15, 18, 3, 0, 25, 90)).toBe(true);
    expect(sectorHitsCircle(-20, -0.1, 3, Math.PI, 25, 90)).toBe(true);
    expect(sectorHitsCircle(0, 0, 3, 0, 25, 90)).toBe(true);
  });
  it('零子弹容量仍能挥击，只伤正面且一挥只命中一次，冷却后再次命中', () => {
    const { world, bus, front, back, far, input } = setup();
    const hp = world.getActor(front)!.hp;
    let swings = 0,
      bullets = 0,
      hits = 0;
    bus.on('weapon:swung', () => swings++);
    bus.on('weapon:fired', () => bullets++);
    bus.on('melee:hit', () => hits++);
    input.fire = true;
    expect(world.step(dt, input).bulletSpawns).toHaveLength(0);
    expect(world.getActor(front)!.hp).toBeLessThan(hp);
    const after = world.getActor(front)!.hp;
    for (let i = 0; i < 10; i++) world.step(dt, input);
    expect(world.getActor(front)!.hp).toBe(after);
    expect(world.getActor(back)!.hp).toBe(hp);
    expect(world.getActor(far)!.hp).toBe(hp);
    expect([swings, bullets, hits]).toEqual([1, 0, 1]);
    for (let i = 0; i < 20; i++) world.step(dt, input);
    expect(swings).toBe(2);
    expect(hits).toBe(2);
  });
  it('墙阻挡近战，瞄准改变不会旋转已开始的判定；换武器取消挥动但不刷新冷却', () => {
    const { world, front, input } = setup(true);
    const hp = world.getActor(front)!.hp;
    input.fire = true;
    world.step(dt, input);
    input.aim = { x: -1, y: 0 };
    world.step(dt, input);
    expect(world.melee.angle).toBe(0);
    expect(world.getActor(front)!.hp).toBe(hp);
    const cooldown = world.save().player!.cooldown;
    world.equipWeapon('pistol_basic');
    expect(world.melee.active).toBe(false);
    expect(world.save().player!.cooldown).toBe(cooldown);
  });
  it('挥动中 JSON 往返，不重播挥动；后续状态与全部事件逐步严格一致', () => {
    const { world, bus, input } = setup();
    input.fire = true;
    world.step(dt, input);
    const snapshot = JSON.parse(JSON.stringify(world.save())) as CombatWorldState;
    expect(snapshot.melee.active).toBe(true);
    expect(snapshot.melee.hitIds).toHaveLength(1);
    const restoredBus = new EventBus<GameEvents>(),
      restored = createCombatWorld({ seed: 42, bus: restoredBus, maxBullets: 0 });
    const left: string[] = [],
      right: string[] = [];
    for (const name of [
      'weapon:swung',
      'melee:hit',
      'entity:damaged',
      'entity:died',
      'weapon:fired',
    ] as const) {
      bus.on(name, (e) => left.push(name + JSON.stringify(e)));
      restoredBus.on(name, (e) => right.push(name + JSON.stringify(e)));
    }
    restored.load(snapshot);
    expect(right).toHaveLength(0);
    for (let i = 0; i < 180; i++) {
      input.fire = i % 40 < 25;
      input.aim = i % 60 < 30 ? { x: 1, y: 0 } : { x: -1, y: 0 };
      world.step(dt, input);
      restored.step(dt, input);
      expect(restored.save()).toEqual(world.save());
      expect(right).toEqual(left);
    }
  });
  it('schema 拒绝缺失近战参数和 duration 超过 cooldown 的定义', () => {
    expect(WeaponDefSchema.safeParse(WEAPONS.cutlass).success).toBe(true);
    expect(WeaponDefSchema.safeParse({ ...WEAPONS.cutlass, melee: undefined }).success).toBe(false);
    expect(
      WeaponDefSchema.safeParse({ ...WEAPONS.cutlass, melee: { ...WEAPONS.cutlass.melee, duration: 5 } })
        .success,
    ).toBe(false);
  });
});
