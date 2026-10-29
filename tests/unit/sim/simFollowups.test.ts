import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../../src/data/balance';
import { ENEMIES, type EnemyId } from '../../../src/data/enemies';
import { NAVIGATION } from '../../../src/data/navigation';
import type { EnemyDef } from '../../../src/data/schema';
import { createBrain, moveEnemy } from '../../../src/sim/ai/brain';
import { createCombatWorld, type ActorView, type BulletSpawn } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { Random } from '../../../src/sim/core/Random';
import { createInputFrame } from '../../../src/sim/core/types';
import { DungeonRun } from '../../../src/sim/run/DungeonRun';
import { RoomDirector } from '../../../src/sim/run/RoomDirector';

const DT = 1 / 60;
const PLAYER = { x: 200, y: 150 };

/** 子弹直线到点 (x, y) 的最近距离；只算前方。 */
function miss(b: BulletSpawn, x: number, y: number): number {
  const dx = Math.cos(b.angle),
    dy = Math.sin(b.angle),
    px = x - b.x,
    py = y - b.y;
  return px * dx + py * dy > 0 ? Math.abs(px * dy - py * dx) : Infinity;
}

describe('开火角度：弹道穿过目标碰撞圆心', () => {
  const directions = [
    [80, 0],
    [-80, 0],
    [0, 80],
    [0, -80],
    [57, 57],
  ] as const;
  for (const kind of ['naiwa_spitter', 'naiwa_turret', 'naiwa_boss'] as const)
    it(`${kind} 正中一发不偏`, () => {
      for (const [dx, dy] of directions) {
        const world = createCombatWorld({ seed: 1, bus: new EventBus<GameEvents>() });
        const pid = world.spawnPlayer('ai_proto', PLAYER.x, PLAYER.y);
        world.spawnEnemy(kind, PLAYER.x + dx, PLAYER.y + dy);
        let volley: BulletSpawn[] = [];
        for (let i = 0; i < 600 && !volley.length; i++) {
          volley = world.step(DT, createInputFrame()).bulletSpawns.filter((b) => b.team === 'enemy');
          world.syncPosition(pid, PLAYER.x, PLAYER.y);
        }
        expect(volley.length).toBeGreaterThan(0);
        // 散布弹道的正中一发穿过圆心；修正前 Boss 水平方向偏 12 px。
        expect(Math.min(...volley.map((b) => miss(b, PLAYER.x, PLAYER.y)))).toBeLessThan(1e-6);
      }
    });

  it('弹体自瞄：没有手动方向时朝活动敌人开火，保留手枪散布', () => {
    const bus = new EventBus<GameEvents>();
    const world = createCombatWorld({ seed: 1, bus });
    const pid = world.spawnPlayer('ai_proto', PLAYER.x, PLAYER.y);
    world.spawnEnemy('naiwa_scout', PLAYER.x + 70, PLAYER.y + 20);
    const input = createInputFrame();
    for (let t = 0; t < BALANCE.spawnTelegraph + DT; t += DT) world.step(DT, input);
    input.fire = true;
    const angles: number[] = [];
    const axes: number[] = [];
    bus.on('weapon:fired', (e) => axes.push(e.angle));
    for (let t = 0; t < BALANCE.spawnTelegraph + 0.5; t += DT)
      for (const b of world.step(DT, input).bulletSpawns) if (b.team === 'player') angles.push(b.angle);
    const targetAngle = Math.atan2(20, 70);
    expect(world.getActor(pid)!.facing).toBeCloseTo(targetAngle);
    expect(angles.length).toBeGreaterThan(2);
    // 手枪散布仍为 ±2°，围绕自动选定的目标方向。
    expect(axes).toHaveLength(angles.length);
    angles.forEach((angle, i) => expect(Math.abs(angle - axes[i]!)).toBeLessThanOrEqual(Math.PI / 90));
  });
});

describe('刷怪容量保护', () => {
  it('实体池放不下时留到有空位再刷，房间不提前清空，也不抛错', () => {
    const maxActors = 3;
    const bus = new EventBus<GameEvents>(),
      world = createCombatWorld({ seed: 2, bus, maxActors }),
      run = new DungeonRun(2, bus);
    world.spawnPlayer('ai_proto', 150, 100);
    run.enter(1);
    const director = new RoomDirector(
      world,
      run,
      new Random(2),
      { x: 0, y: 0, width: 300, height: 200 },
      () => true,
      maxActors,
    );
    const enemies = () => world.actors.filter((a) => a.team === 'enemy');
    const advance = (seconds: number) => {
      for (let t = 0; t < seconds; t += DT) {
        world.step(DT, createInputFrame());
        director.step(DT);
      }
    };
    const removeDead = () => {
      for (const a of enemies()) if (a.phase === 'dead') world.removeActor(a.id);
    };

    advance(1.2);
    expect(enemies()).toHaveLength(2);
    world.debugKillEnemies();
    // 尸体还没回收：第二波 3 只一只也放不下，全部待刷，房间仍锁定。
    advance(1.2);
    expect(enemies().filter((a) => a.phase !== 'dead')).toHaveLength(0);
    expect(run.alive).toBe(3);
    expect(run.locked).toBe(true);
    removeDead();
    advance(DT);
    expect(enemies()).toHaveLength(2);
    expect(run.alive).toBe(3);
    world.debugKillEnemies();
    removeDead();
    advance(DT);
    expect(enemies()).toHaveLength(1);
    expect(run.locked).toBe(true);
    world.debugKillEnemies();
    removeDead();
    advance(DT);
    expect(run.locked).toBe(false);
    expect(run.kills).toBe(5);
    run.destroy();
  });
});

describe('保持距离与炮台的移动', () => {
  const view = (kind: EnemyId, x: number, y: number): ActorView => ({
    id: 2,
    team: 'enemy',
    kind,
    phase: 'active',
    x,
    y,
    vx: 0,
    vy: 0,
    radius: ENEMIES[kind].radius,
    hp: 1,
    maxHp: 1,
    invulnerable: false,
    facing: 0,
    pose: 'idle',
    lift: 0,
    aim: 0,
    move: 'none',
    stage: 'ready',
    stageTime: 0,
    stageSpan: 0,
    aimLocked: false,
    landX: 0,
    landY: 0,
    chill: 0,
    frozen: false,
  });
  const target: ActorView = { ...view('naiwa_chaser', 0, 0), id: 1, team: 'player', kind: 'ai_proto' };
  const velocity = (kind: EnemyId, x: number) => {
    const out = { x: 0, y: 0 },
      def: Readonly<EnemyDef> = ENEMIES[kind];
    moveEnemy(out, view(kind, x, 0), target, [], def, createBrain(), DT);
    return out;
  };

  it('keep_distance：太近后退、太远靠近、在区间内站定', () => {
    const def: Readonly<EnemyDef> = ENEMIES.naiwa_spitter;
    const desired = def.desiredRange!;
    expect(velocity('naiwa_spitter', desired / 2).x).toBeCloseTo(def.moveSpeed, 9);
    const far = desired + BALANCE.enemySeparation + 20;
    expect(velocity('naiwa_spitter', far).x).toBeCloseTo(-def.moveSpeed, 9);
    // 区间内方向系数为 0，结果可能是 -0；比较速度大小即可。
    const hold = velocity('naiwa_spitter', desired + BALANCE.enemySeparation / 2);
    expect(Math.hypot(hold.x, hold.y)).toBe(0);
  });

  it('turret：任何距离都不移动', () => {
    for (const x of [10, 100, 400]) {
      const v = velocity('naiwa_turret', x);
      expect(Math.hypot(v.x, v.y)).toBe(0);
    }
  });
});

it('会绕墙导航的敌人半径种类不超过导航缓存数', () => {
  // 炮台不移动、跳跃与横移保持原方向、无 trigger 的冲锋锁定方向，这些不走导航（EnemyAi.navigable）。
  const radii = new Set<number>();
  for (const def of Object.values(ENEMIES) as EnemyDef[])
    if (
      !['turret', 'hop', 'strafe'].includes(def.behavior) &&
      (def.behavior !== 'charge_dash' || def.dash?.trigger !== undefined)
    )
      radii.add(def.radius + NAVIGATION.clearance);
  expect(radii.size).toBeLessThanOrEqual(NAVIGATION.radiusCaches);
});
