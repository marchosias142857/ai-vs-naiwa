import { WEAPONS } from '../../../src/data/weapons';
import { describe, expect, it } from 'vitest';
import { createCombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import { createInputFrame } from '../../../src/sim/core/types';

function setup() {
  const world = createCombatWorld({ seed: 42, bus: new EventBus() });
  const id = world.spawnPlayer('ai_proto', 240, 135);
  const input = createInputFrame('touch');
  const step = () => world.step(1 / 60, input);
  return { world, input, step, actor: world.getActor(id)! };
}

describe('身体与武器独立朝向', () => {
  it('默认身体与武器朝右；未开火朝移动方向，按住开火朝枪口', () => {
    const { world, input, step, actor } = setup();
    expect(world.playerBodyFacing).toBe(actor.facing);
    input.source = 'keyboard';
    input.move.x = -1;
    input.aim = { x: 1, y: 0 };
    step();
    expect(world.playerBodyFacing).toBeCloseTo(Math.PI);
    expect(actor.facing).toBe(0);
    input.fire = true;
    expect(Math.abs(step().bulletSpawns[0]!.angle)).toBeLessThanOrEqual(
      (WEAPONS.pistol_basic.spread * Math.PI) / 360,
    );
    expect(world.playerBodyFacing).toBe(actor.facing);
    step(); // 射速冷却期间仍朝向开火方向。
    expect(world.playerBodyFacing).toBe(0);
    input.fire = false;
    step();
    expect(world.playerBodyFacing).toBeCloseTo(Math.PI);
    input.move.x = 0;
    step();
    expect(world.playerBodyFacing).toBeCloseTo(Math.PI);
  });

  it('双摇杆反向操作也记录移动；两指松开后枪回到最后移动方向', () => {
    const { world, input, step, actor } = setup();
    input.move.y = -1;
    input.aim = { x: -1, y: 0 };
    input.fire = true;
    step();
    expect(actor.facing).toBeCloseTo(Math.PI);
    expect(world.playerBodyFacing).toBeCloseTo(Math.PI);
    input.move.y = 0;
    step();
    input.aim = null;
    input.fire = false;
    step();
    expect(actor.facing).toBeCloseTo(-Math.PI / 2);
    expect(world.playerBodyFacing).toBeCloseTo(-Math.PI / 2);
    step();
    expect(actor.facing).toBeCloseTo(-Math.PI / 2);
  });

  it('右摇杆回中或释放时，跟随仍在移动的左摇杆；中心按住朝最后移动方向出弹', () => {
    const { world, input, step, actor } = setup();
    input.move.x = -1;
    input.aim = { x: 1, y: 0 };
    step();
    input.aim = null;
    input.fire = true;
    expect(Math.abs(step().bulletSpawns[0]!.angle - Math.PI)).toBeLessThanOrEqual(
      (WEAPONS.pistol_basic.spread * Math.PI) / 360,
    );
    expect(world.playerBodyFacing).toBeCloseTo(Math.PI);
    input.move.x = 0;
    input.move.y = 1;
    step();
    expect(actor.facing).toBeCloseTo(Math.PI / 2);
  });

  it('读档沿用最后移动方向，旧存档不需要添加字段', () => {
    const { world, input, step } = setup();
    input.move.x = -1;
    input.aim = { x: 1, y: 0 };
    step();
    const loaded = createCombatWorld({ seed: 42, bus: new EventBus() });
    loaded.load(world.save());
    loaded.step(1 / 60, createInputFrame('touch'));
    expect(loaded.playerBodyFacing).toBeCloseTo(Math.PI);
    expect(loaded.getActor(loaded.playerId!)!.facing).toBeCloseTo(Math.PI);
  });
});
