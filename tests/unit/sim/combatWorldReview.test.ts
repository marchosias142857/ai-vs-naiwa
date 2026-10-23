import { afterEach, describe, expect, it } from 'vitest';
import { BALANCE } from '../../../src/data/balance';
import { CHARACTERS } from '../../../src/data/characters';
import { WEAPONS } from '../../../src/data/weapons';
import { createCombatWorld, type CombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { createInputFrame, type InputFrame } from '../../../src/sim/core/types';

/** #24 评审提出的问题的回归测试。 */

const PHYSICS_DT = 1 / 60;
const pistol = WEAPONS.pistol_basic as { pierce: number; knockback: number; spread: number };
const original = { pierce: pistol.pierce, spread: pistol.spread };
afterEach(() => {
  pistol.pierce = original.pierce;
  pistol.spread = original.spread;
});

function setup(seed = 1) {
  const bus = new EventBus<GameEvents>();
  const world = createCombatWorld({ seed, bus });
  const input = createInputFrame();
  return { bus, world, input };
}

/** 理想物理：按上次 step 给出的速度积分整个帧时间，然后调用 step。 */
function frameIdeal(world: CombatWorld, input: InputFrame, dt: number) {
  for (const a of world.actors) world.syncPosition(a.id, a.x + a.vx * dt, a.y + a.vy * dt);
  return world.step(dt, input);
}

/** 以 60 Hz 理想积分推进若干秒。 */
function advance(world: CombatWorld, input: InputFrame, seconds: number) {
  for (let t = 0; t <= seconds; t += PHYSICS_DT) frameIdeal(world, input, PHYSICS_DT);
}

/** 生成玩家和一只已激活的怪，推进到预警结束。返回一颗刚打出的玩家子弹。 */
function arena(seed = 1, enemyAtPlayer = false) {
  const ctx = setup(seed);
  const pid = ctx.world.spawnPlayer('ai_proto', 100, 100);
  const eid = enemyAtPlayer
    ? ctx.world.spawnEnemy('naiwa_chaser', 100, 100)
    : ctx.world.spawnEnemy('naiwa_chaser', 160, 100);
  advance(ctx.world, ctx.input, BALANCE.spawnTelegraph + PHYSICS_DT);
  const shoot = () => {
    ctx.input.fire = true;
    let id = 0;
    for (let i = 0; i < 60 && id === 0; i++) {
      id = frameIdeal(ctx.world, ctx.input, PHYSICS_DT).bulletSpawns[0]?.id ?? 0;
    }
    ctx.input.fire = false;
    return id;
  };
  return { ...ctx, pid, eid, shoot };
}

describe('评审 1：玩家死亡状态锁存', () => {
  it('removeActor 回收死亡玩家后，playerDead 仍为 true', () => {
    const { world, input, pid, eid } = arena();
    for (let i = 0; i < CHARACTERS.ai_proto.hp; i++) {
      world.contact(eid, pid);
      advance(world, input, CHARACTERS.ai_proto.invulnTime + 0.05);
    }
    expect(world.step(PHYSICS_DT, input).playerDead).toBe(true);
    world.removeActor(pid);
    expect(world.getActor(pid)).toBeUndefined();
    expect(world.step(PHYSICS_DT, input).playerDead).toBe(true);
  });
});

describe('评审 2：穿透命中也按约定发事件', () => {
  it('每次穿透命中都按 damaged →（died）→ bullet:hit 发出，critical 一致，子弹继续飞', () => {
    pistol.pierce = 2;
    const { bus, world, eid, shoot } = arena();
    const log: { name: string; critical?: boolean; targetId?: number | null }[] = [];
    bus.on('entity:damaged', (e) => log.push({ name: 'damaged', critical: e.critical }));
    bus.on('entity:died', () => log.push({ name: 'died' }));
    bus.on('bullet:hit', (e) => log.push({ name: 'hit', critical: e.critical, targetId: e.targetId }));
    const bullet = shoot();
    expect(world.hitActor(bullet, eid, 160, 100)).toBe(false);
    expect(log.map((e) => e.name)).toEqual(['damaged', 'hit']);
    expect(log[1]?.critical).toBe(log[0]?.critical);
    expect(log[1]?.targetId).toBe(eid);
  });

  it('穿透数用完后的那次命中结束子弹', () => {
    pistol.pierce = 1;
    const { world, shoot } = arena();
    const a = world.spawnEnemy('naiwa_chaser', 200, 100);
    const b = world.spawnEnemy('naiwa_chaser', 220, 100);
    const input = createInputFrame();
    advance(world, input, BALANCE.spawnTelegraph + PHYSICS_DT);
    const bullet = shoot();
    expect(world.hitActor(bullet, a, 200, 100)).toBe(false);
    expect(world.hitActor(bullet, b, 220, 100)).toBe(true);
  });
});

describe('评审 5：多个目标持续重叠', () => {
  it('A → B → A 的回调顺序不会再次伤害 A；每个目标最多被同一颗子弹命中一次', () => {
    pistol.pierce = 2;
    const { bus, world, eid: a, shoot } = arena();
    const b = world.spawnEnemy('naiwa_chaser', 170, 100);
    const input = createInputFrame();
    advance(world, input, BALANCE.spawnTelegraph + PHYSICS_DT);
    const damaged: number[] = [];
    bus.on('entity:damaged', (e) => damaged.push(e.id));
    const bullet = shoot();
    // 模拟子弹同时与 A、B 重叠的三帧：Arcade 每帧都会回调。
    for (let frame = 0; frame < 3; frame++) {
      world.hitActor(bullet, a, 160, 100);
      world.hitActor(bullet, b, 170, 100);
    }
    expect(damaged).toEqual([a, b]);
  });
});

describe('评审 3：击退距离与数据一致', () => {
  type Mode = 'ideal' | 'fixed60' | 'lockstep60';

  /**
   * 命中后推进 0.3 秒，返回怪物实际被推开的距离。
   * - ideal：物理积分时间 = 帧时间。
   * - fixed60：Arcade 默认的 60 Hz 固定步长，渲染帧率与之不同步；step 按帧时间调用。
   * - lockstep60：每个 60 Hz 物理步之后调用一次 step（在 Arcade 的 worldstep 中驱动 sim）。
   */
  function knockDistance(fps: number, mode: Mode) {
    pistol.spread = 0;
    const { world, input, eid, shoot } = arena(1, true);
    const bullet = shoot();
    const start = { ...world.getActor(eid)! };
    world.hitActor(bullet, eid, start.x, start.y);
    const frameDt = 1 / fps;
    let acc = 0;
    for (let t = 0; t < 0.3; t += frameDt) {
      if (mode === 'ideal') {
        frameIdeal(world, input, frameDt);
        continue;
      }
      acc += frameDt;
      while (acc >= PHYSICS_DT - 1e-12) {
        acc -= PHYSICS_DT;
        for (const x of world.actors) {
          world.syncPosition(x.id, x.x + x.vx * PHYSICS_DT, x.y + x.vy * PHYSICS_DT);
        }
        if (mode === 'lockstep60') world.step(PHYSICS_DT, input);
      }
      if (mode === 'fixed60') world.step(frameDt, input);
    }
    const end = world.getActor(eid)!;
    return Math.hypot(end.x - start.x, end.y - start.y);
  }

  it.each([30, 60, 120, 144])('理想积分：%i fps 下击退距离等于武器的 knockback', (fps) => {
    expect(knockDistance(fps, 'ideal')).toBeCloseTo(pistol.knockback, 6);
  });

  it.each([30, 60, 120, 144])('锁步 60 Hz：%i fps 下击退距离等于武器的 knockback', (fps) => {
    expect(knockDistance(fps, 'lockstep60')).toBeCloseTo(pistol.knockback, 6);
  });

  it.each([30, 60, 120, 144])('固定 60 Hz、按帧调用 step：%i fps 下误差小于 1 像素', (fps) => {
    expect(Math.abs(knockDistance(fps, 'fixed60') - pistol.knockback)).toBeLessThan(1);
  });

  it('击退在开始前不会提前衰减：命中后的第一段速度就是曲线开头的平均速度', () => {
    pistol.spread = 0;
    const { world, input, eid, shoot } = arena(1, true);
    world.hitActor(shoot(), eid, 100, 100);
    frameIdeal(world, input, PHYSICS_DT);
    const v0 = (2 * pistol.knockback) / BALANCE.knockbackTime;
    const expected = v0 * (1 - PHYSICS_DT / 2 / BALANCE.knockbackTime);
    const a = world.getActor(eid)!;
    expect(Math.hypot(a.vx, a.vy)).toBeCloseTo(expected, 6);
  });
});

describe('评审 4：热路径复用', () => {
  it('事件 payload 在多次发送之间复用同一个对象', () => {
    const { bus, world, eid, shoot } = arena();
    const seen: object[] = [];
    bus.on('bullet:hit', (e) => seen.push(e));
    world.hitActor(shoot(), eid, 160, 100);
    world.hitActor(shoot(), eid, 160, 100);
    expect(seen.length).toBe(2);
    expect(seen[0]).toBe(seen[1]);
  });

  it('同步重入：监听器里再触发同一种事件，外层的 payload 不被改写', () => {
    const { bus, world, pid, eid, shoot } = arena();
    const outer: number[] = [];
    bus.on('entity:damaged', (e) => {
      if (e.id !== eid) return;
      const before = e.id;
      world.contact(eid, pid);
      outer.push(before, e.id, e.hp);
    });
    world.hitActor(shoot(), eid, 160, 100);
    expect(outer[0]).toBe(eid);
    expect(outer[1]).toBe(eid);
    expect(outer[2]).toBeLessThan(world.getActor(eid)!.maxHp);
    expect(world.getActor(pid)!.hp).toBeLessThan(CHARACTERS.ai_proto.hp);
  });

  it('BulletSpawn 输出对象在不同的 step 之间复用', () => {
    const { world, input } = setup();
    world.spawnPlayer('ai_proto', 0, 0);
    input.fire = true;
    const first = world.step(PHYSICS_DT, input).bulletSpawns[0];
    let again: unknown;
    for (let i = 0; i < 60 && !again; i++) again = world.step(PHYSICS_DT, input).bulletSpawns[0];
    expect(again).toBe(first);
  });
});
