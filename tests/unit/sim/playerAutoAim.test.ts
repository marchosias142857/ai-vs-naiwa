import { describe, expect, it } from 'vitest';
import { HERO_ART, WEAPON_ART } from '../../../src/data/art';
import { ENEMIES } from '../../../src/data/enemies';
import { playerMuzzle } from '../../../src/sim/weapons/muzzle';
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
      const events: GameEvents['weapon:fired'][] = [];
      c.bus.on('weapon:fired', (e) => {
        if (e.ownerId === c.player) events.push({ ...e });
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
      if (manual.includes(id)) expect(events[0]!.angle).toBeCloseTo(expected, 12);
      else expect(rayMiss(events[0]!, 100, 120)).toBeLessThan(1e-9);
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
    const shots: GameEvents['weapon:fired'][] = [];
    c.bus.on('weapon:fired', (e) => {
      if (e.ownerId === c.player) shots.push({ ...e });
    });
    c.input.aim = { x: -1, y: 0 };
    c.fire();
    c.input.fire = false;
    c.world.syncPosition(target, 150, 100);
    c.advance(20);
    expect(shots).toHaveLength(3);
    expect(rayMiss(shots[0]!, 100, 150)).toBeLessThan(1e-9);
    for (const shot of shots.slice(1)) expect(rayMiss(shot, 150, 100)).toBeLessThan(1e-9);
    c.world.equipWeapon('coral_bow');
    c.fire();
    c.advance(70);
    c.world.syncPosition(target, 100, 150);
    c.input.fire = false;
    c.world.step(dt, c.input);
    expect(rayMiss(shots.at(-1)!, 100, 150)).toBeLessThan(1e-9);
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

const automatic = (Object.keys(WEAPONS) as WeaponId[]).filter((id) => !manual.includes(id));
function rayMiss(shot: { x: number; y: number; angle: number }, x: number, y: number): number {
  const dx = x - shot.x,
    dy = y - shot.y;
  return dx * Math.cos(shot.angle) + dy * Math.sin(shot.angle) > 0
    ? Math.abs(dx * Math.sin(shot.angle) - dy * Math.cos(shot.angle))
    : Infinity;
}

describe('实际枪口的自瞄弹道', () => {
  it.each(automatic)('%s：贴身目标保留中心方向，不向身后补偿', (id) => {
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const c = setup();
      c.world.spawnEnemy('naiwa_tadpole', 100 + Math.cos(angle), 100 + Math.sin(angle));
      c.advance();
      c.world.equipWeapon(id);
      let shot: GameEvents['weapon:fired'] | undefined;
      c.bus.on('weapon:fired', (e) => {
        if (e.ownerId === c.player) shot = { ...e };
      });
      c.fire();
      if (id === 'coral_bow') {
        c.input.fire = false;
        c.world.step(dt, c.input);
      }
      expect(shot).toBeDefined();
      expect(shot!.angle).toBeCloseTo(angle, 10);
    }
  });

  it('枪口越墙回到身体时使用最终出射点；镜像接缝两侧没有残余偏移', () => {
    for (const blocked of [false, true]) {
      for (const angle of [Math.PI / 2 - 1e-7, Math.PI / 2, Math.PI / 2 + 1e-7]) {
        const x = 100 + Math.cos(angle) * 50,
          y = 100 + Math.sin(angle) * 50;
        const c = setup({ lineOfSight: (_ax, _ay, bx, by) => !blocked || (bx === x && by === y) });
        c.world.spawnEnemy('naiwa_tadpole', x, y);
        c.advance();
        c.world.equipWeapon('sniper_pierce');
        const bullet = c.fire().bulletSpawns[0]!;
        if (blocked) expect([bullet.x, bullet.y]).toEqual([100, 100]);
        expect(rayMiss(bullet, x, y)).toBeLessThan(1e-9);
      }
    }
  });

  it.each(automatic)('%s：360° × 近/中/最大射程，发射轴穿过目标圆心', (id) => {
    const c = setup();
    const enemy = c.world.spawnEnemy('naiwa_tadpole', 100, 120);
    c.advance();
    let shot: GameEvents['weapon:fired'] | undefined;
    c.bus.on('weapon:fired', (e) => {
      if (e.ownerId === c.player) shot = { ...e };
    });
    c.world.equipWeapon(id);
    const initial = c.world.save();
    const muzzle = { x: 0, y: 0 };
    const art = WEAPON_ART[id];
    const near =
      Math.hypot(HERO_ART.standardGrip.x, HERO_ART.standardGrip.y) +
      Math.hypot(art.muzzle.x, art.muzzle.y) * art.scale +
      1;
    for (const distance of [near, (near + WEAPONS[id].range) / 2, WEAPONS[id].range - 1e-6]) {
      for (let degree = 0; degree < 360; degree++) {
        const angle = (degree * Math.PI) / 180;
        const x = 100 + Math.cos(angle) * distance,
          y = 100 + Math.sin(angle) * distance;
        const world = createCombatWorld({ seed: 42, bus: c.bus, maxActors: 2, maxBullets: 20 });
        world.load(initial); // Fresh shot/energy/pools, preserving the real weapon definition.
        world.syncPosition(enemy, x, y);
        shot = undefined;
        c.input.fire = true;
        const result = world.step(dt, c.input);
        if (id === 'sniper_pierce') {
          expect(result.bulletSpawns).toHaveLength(1);
          expect(rayMiss(result.bulletSpawns[0]!, x, y)).toBeLessThan(1e-9);
        }
        if (id === 'coral_bow') {
          c.input.fire = false;
          world.step(dt, c.input);
        }
        expect(shot, `${id} ${distance} ${degree}° fired`).toBeDefined();
        const actual = shot!;
        playerMuzzle(muzzle, 100, 100, world.getActor(c.player)!.facing, id);
        expect(actual.x).toBeCloseTo(muzzle.x, 10);
        expect(actual.y).toBeCloseTo(muzzle.y, 10);
        expect(rayMiss(actual, x, y), `${id} ${distance} ${degree}°`).toBeLessThan(1e-9);
        expect(rayMiss(actual, x, y)).toBeLessThan(ENEMIES.naiwa_tadpole.radius + WEAPONS[id].bulletRadius);
      }
    }
  });
});
