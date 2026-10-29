import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../../src/data/balance';
import { WEAPONS, type WeaponId } from '../../../src/data/weapons';
import { createCombatWorld, type CombatWorldOptions } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { createInputFrame, type InputSource } from '../../../src/sim/core/types';

const dt = 1 / 60;
const manual: WeaponId[] = ['cutlass', 'anchor_hammer', 'swordfish_spear', 'shark_katana', 'lantern_beam'];
function setup(options: Partial<CombatWorldOptions> = {}) {
  const bus = new EventBus<GameEvents>();
  const world = createCombatWorld({ seed: 42, bus, ...options });
  const player = world.spawnPlayer('ai_proto', 100, 100);
  const input = createInputFrame();
  const advance = (frames = Math.ceil(BALANCE.spawnTelegraph / dt) + 1) => {
    for (let i = 0; i < frames; i++) world.step(dt, input);
  };
  const fire = () => {
    input.fire = true;
    return world.step(dt, input);
  };
  const facing = () => world.getActor(player)!.facing;
  return { bus, world, player, input, advance, fire, facing };
}

describe('按实际攻击类型跨平台自瞄（ADR 0043）', () => {
  for (const source of ['keyboard', 'touch', 'gamepad'] satisfies InputSource[]) {
    it.each(Object.keys(WEAPONS) as WeaponId[])(`${source}: %s 的朝向与真实攻击`, (id) => {
      const c = setup();
      c.world.spawnEnemy('naiwa_chaser', 100, 120);
      c.advance();
      c.world.equipWeapon(id);
      c.input.source = source;
      c.input.aim = { x: -1, y: 0 };
      const events: number[] = [];
      c.bus.on('weapon:fired', (e) => {
        if (e.ownerId === c.player) events.push(e.angle);
      });
      c.fire();
      const expected = manual.includes(id) ? Math.PI : Math.PI / 2;
      expect(c.facing()).toBeCloseTo(expected, 12);
      expect(c.world.playerBodyFacing).toBeCloseTo(expected, 12);
      if (c.world.melee.active) {
        expect(c.world.melee.angle).toBeCloseTo(expected, 12);
        return;
      }
      if (id === 'coral_bow') {
        expect(events).toHaveLength(0);
        c.advance(60);
        c.input.fire = false;
        c.world.step(dt, c.input);
      }
      expect(events).toHaveLength(1);
      expect(events[0]).toBeCloseTo(expected, 12);
    });
  }

  it('同距离按实体编号决定；目标死亡、移除、出射程立即重选，预警不入选', () => {
    const c = setup();
    const first = c.world.spawnEnemy('naiwa_chaser', 100, 150);
    const next = c.world.spawnEnemy('naiwa_chaser', 150, 100);
    c.advance();
    c.world.spawnEnemy('naiwa_chaser', 100, 101);
    c.fire();
    expect(c.facing()).toBeCloseTo(Math.PI / 2);
    c.world.syncPosition(first, 100, 1000);
    c.fire();
    expect(c.facing()).toBe(0);
    c.world.syncPosition(next, 1000, 100);
    c.input.aim = { x: -1, y: 0 };
    c.fire();
    expect(c.facing()).toBeCloseTo(Math.PI);
    c.world.debugKillEnemies();
    c.world.removeActor(next);
    expect(c.world.getActor(next)).toBeUndefined();
    c.fire();
    expect(c.facing()).toBeCloseTo(Math.PI);
  });

  it('墙后近目标不抢占可见远目标；桶破坏后立即重新选择', () => {
    const c = setup({ lineOfSight: (_x, _y, x) => x !== 110 });
    c.world.spawnEnemy('naiwa_chaser', 110, 100);
    c.world.spawnEnemy('naiwa_chaser', 150, 100);
    c.world.spawnEnemy('naiwa_chaser', 100, 170);
    c.advance();
    c.world.setTraps(1, [
      { kind: 'barrel', x: 125, y: 100, width: 0, height: 0, radius: 8, angle: 0, delay: 0 },
    ]);
    c.fire();
    expect(c.facing()).toBeCloseTo(Math.PI / 2);
    c.world.setTraps(2, []);
    c.fire();
    expect(c.facing()).toBe(0);
  });

  it('地下/出土不可命中的敌人不入选；不改变敌人的阶段规则', () => {
    const c = setup();
    const hidden = c.world.spawnEnemy('naiwa_burrower', 120, 100);
    c.world.spawnEnemy('naiwa_chaser', 100, 160);
    c.advance();
    const state = c.world.save();
    const enemy = state.actors.find((a) => a.id === hidden)!;
    enemy.brain.stage = 'buried';
    enemy.brain.move = 'burrow';
    enemy.brain.time = 10;
    const restored = createCombatWorld({ seed: 42, bus: new EventBus() });
    restored.load(state);
    c.input.fire = true;
    restored.step(dt, c.input);
    expect(restored.getActor(c.player)!.facing).toBeCloseTo(Math.PI / 2);
  });

  it('没有有效目标时按手动方向；中心触控用最后移动方向，重合目标无NaN', () => {
    const c = setup();
    c.world.spawnEnemy('naiwa_chaser', 100, 100);
    c.advance();
    c.input.source = 'touch';
    c.input.move.y = -1;
    c.world.step(dt, c.input);
    c.input.move.y = 0;
    c.fire();
    expect(c.facing()).toBeCloseTo(-Math.PI / 2);
    c.input.aim = { x: -1, y: 0 };
    c.fire();
    expect(c.facing()).toBeCloseTo(Math.PI);
  });

  it('连射松手后的剩余子弹、蓄力释放都在出手步选敌；切换手动武器立刻生效', () => {
    const c = setup();
    const target = c.world.spawnEnemy('naiwa_chaser', 100, 150);
    c.advance();
    c.world.equipWeapon('burst_rifle');
    const angles: number[] = [];
    c.bus.on('weapon:fired', (e) => {
      if (e.ownerId === c.player) angles.push(e.angle);
    });
    c.input.aim = { x: -1, y: 0 };
    c.fire();
    c.input.fire = false;
    c.world.syncPosition(target, 150, 100);
    c.advance(20);
    expect(angles).toHaveLength(3);
    expect(angles[0]).toBeCloseTo(Math.PI / 2);
    expect(angles.slice(1)).toEqual([0, 0]);
    c.world.equipWeapon('coral_bow');
    c.fire();
    c.advance(70);
    c.world.syncPosition(target, 100, 150);
    c.input.fire = false;
    c.world.step(dt, c.input);
    expect(angles.at(-1)).toBeCloseTo(Math.PI / 2);
    expect(c.world.playerBodyFacing).toBeCloseTo(Math.PI / 2);
    c.world.equipWeapon('lantern_beam');
    c.fire();
    expect(c.world.beam.angle).toBeCloseTo(Math.PI);
  });

  it('保存恢复不需要额外锁定状态，改变原始手动方向不改变自瞄弹道与随机流', () => {
    const c = setup();
    c.world.spawnEnemy('naiwa_chaser', 100, 150);
    c.advance();
    c.input.aim = { x: -1, y: 0 };
    c.fire();
    const state = c.world.save();
    const restored = createCombatWorld({ seed: 42, bus: new EventBus() });
    restored.load(state);
    for (let i = 0; i < 90; i++) {
      c.world.step(dt, c.input);
      restored.step(dt, { ...c.input, aim: { x: 1, y: 0 } });
    }
    expect(restored.save()).toEqual(c.world.save());
  });
});
