import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../../src/data/balance';
import { CHARACTERS } from '../../../src/data/characters';
import { ENEMIES } from '../../../src/data/enemies';
import { WEAPONS } from '../../../src/data/weapons';
import { createCombatWorld, type CombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { createInputFrame, type InputFrame } from '../../../src/sim/core/types';

const DT = 1 / 60;
const EVENT_NAMES = [
  'entity:spawned',
  'entity:activated',
  'entity:damaged',
  'entity:died',
  'weapon:fired',
  'bullet:hit',
] as const satisfies readonly (keyof GameEvents)[];

type EventName = (typeof EVENT_NAMES)[number];
type Logged = { [K in EventName]: { name: K; payload: GameEvents[K] } }[EventName];

function setup(seed = 1, maxBullets?: number) {
  const bus = new EventBus<GameEvents>();
  const log: Logged[] = [];
  for (const name of EVENT_NAMES) {
    bus.on(name, (payload) => log.push({ name, payload: { ...payload } } as Logged));
  }
  const world = createCombatWorld({ seed, bus, ...(maxBullets ? { maxBullets } : {}) });
  const input = createInputFrame();
  return { world, log, input, names: () => log.map((e) => e.name) };
}

/** 代替 Arcade：按 sim 给出的速度积分位置并写回（测试里没有墙）。 */
function run(world: CombatWorld, input: InputFrame, seconds: number) {
  const spawns: { id: number; x: number; y: number; angle: number }[] = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    for (const a of world.actors) world.syncPosition(a.id, a.x + a.vx * DT, a.y + a.vy * DT);
    const result = world.step(DT, input);
    for (const s of result.bulletSpawns) spawns.push({ id: s.id, x: s.x, y: s.y, angle: s.angle });
  }
  return spawns;
}

describe('CombatWorld：生成与阶段', () => {
  it('玩家：同一帧依次发出 spawned（telegraph 0）与 activated', () => {
    const { world, log } = setup();
    const id = world.spawnPlayer('ai_proto', 100, 100);
    expect(world.playerId).toBe(id);
    expect(log.map((e) => e.name)).toEqual(['entity:spawned', 'entity:activated']);
    expect(log[0]?.payload).toMatchObject({ id, team: 'player', kind: 'ai_proto', telegraph: 0 });
    expect(world.getActor(id)).toMatchObject({ phase: 'active', hp: CHARACTERS.ai_proto.hp });
  });

  it('怪物：预警期间不能行动，预警结束时由 step 发出 activated', () => {
    const { world, log, input } = setup();
    world.spawnPlayer('ai_proto', 0, 0);
    const id = world.spawnEnemy('naiwa_chaser', 100, 0);
    const telegraph = BALANCE.spawnTelegraph;
    expect(log.at(-1)).toMatchObject({ name: 'entity:spawned', payload: { id, telegraph } });
    run(world, input, BALANCE.spawnTelegraph - 0.05);
    expect(world.getActor(id)).toMatchObject({ phase: 'telegraph', vx: 0, vy: 0 });
    run(world, input, 0.1);
    expect(world.getActor(id)?.phase).toBe('active');
    expect(log.filter((e) => e.name === 'entity:activated').at(-1)?.payload.id).toBe(id);
    expect(world.getActor(id)!.vx).toBeLessThan(0);
  });

  it('预警中的怪物不会被子弹打中，也不会造成接触伤害', () => {
    const { world, input } = setup();
    const pid = world.spawnPlayer('ai_proto', 0, 0);
    const eid = world.spawnEnemy('naiwa_chaser', 30, 0);
    input.fire = true;
    const [bullet] = run(world, input, DT);
    expect(world.hitActor(bullet!.id, eid, 30, 0)).toBe(false);
    world.contact(eid, pid);
    expect(world.getActor(pid)?.hp).toBe(CHARACTERS.ai_proto.hp);
    expect(world.getActor(eid)?.hp).toBe(ENEMIES.naiwa_chaser.hp);
  });

  it('只能有一个玩家', () => {
    const { world } = setup();
    world.spawnPlayer('ai_proto', 0, 0);
    expect(() => world.spawnPlayer('ai_proto', 0, 0)).toThrow();
  });
});

describe('CombatWorld：移动与开火', () => {
  it('玩家按输入移动，速度不超过角色的最高速度', () => {
    const { world, input } = setup();
    const id = world.spawnPlayer('ai_proto', 0, 0);
    input.move.x = 1;
    run(world, input, 0.5);
    const p = world.getActor(id)!;
    expect(p.vx).toBeCloseTo(CHARACTERS.ai_proto.moveSpeed, 6);
    expect(p.x).toBeGreaterThan(30);
  });

  it('按住开火：首发立刻打出，射速与武器一致，并发出 weapon:fired', () => {
    const { world, input, log } = setup();
    world.spawnPlayer('ai_proto', 0, 0);
    input.fire = true;
    const spawns = run(world, input, 2);
    expect(spawns.length).toBeGreaterThanOrEqual(WEAPONS.pistol_basic.fireRate * 2);
    expect(spawns.length).toBeLessThanOrEqual(WEAPONS.pistol_basic.fireRate * 2 + 1);
    expect(log.filter((e) => e.name === 'weapon:fired').length).toBe(spawns.length);
  });

  it('松开再按不会攒出连发', () => {
    const { world, input } = setup();
    world.spawnPlayer('ai_proto', 0, 0);
    run(world, input, 3);
    input.fire = true;
    expect(run(world, input, DT).length).toBe(1);
  });

  it('子弹参数来自武器数据：弹速、半径、寿命 = 射程 ÷ 弹速', () => {
    const { world, input } = setup();
    world.spawnPlayer('ai_proto', 0, 0);
    input.fire = true;
    const result = world.step(DT, input);
    const w = WEAPONS.pistol_basic;
    expect(result.bulletSpawns[0]).toMatchObject({
      team: 'player',
      speed: w.bulletSpeed,
      radius: w.bulletRadius,
      sprite: w.bulletSprite,
    });
    expect(result.bulletSpawns[0]!.lifetime).toBeCloseTo(w.range / w.bulletSpeed, 9);
  });

  it('未攻击朝向：正在瞄准 > 正在移动 > 保持上一次的朝向（ADR 0043）', () => {
    const { world, input } = setup();
    const pid = world.spawnPlayer('ai_proto', 0, 0);
    input.move.y = 1;
    run(world, input, DT);
    input.move.y = 0;
    run(world, input, DT);
    expect(world.getActor(pid)!.facing).toBeCloseTo(Math.PI / 2, 6);

    // 敌人在左边，但玩家不会自动转向它。
    world.spawnEnemy('naiwa_chaser', -100, 0);
    run(world, input, BALANCE.spawnTelegraph + 0.05);
    expect(world.getActor(pid)!.facing).toBeCloseTo(Math.PI / 2, 6);

    input.aim = { x: 0, y: -1 };
    run(world, input, DT);
    expect(world.getActor(pid)!.facing).toBeCloseTo(-Math.PI / 2, 6);

    // 松开瞄准、站着不动：保持瞄准时的朝向，而不是回到上次的移动方向。
    input.aim = null;
    run(world, input, DT);
    expect(world.getActor(pid)!.facing).toBeCloseTo(-Math.PI / 2, 6);

    input.move.x = -1;
    run(world, input, DT);
    expect(Math.abs(world.getActor(pid)!.facing)).toBeCloseTo(Math.PI, 6);
  });

  it('子弹数达到 maxBullets 后不再生成，回收后恢复', () => {
    const { world, input } = setup(1, 3);
    world.spawnPlayer('ai_proto', 0, 0);
    input.fire = true;
    const spawns = run(world, input, 2);
    expect(spawns.length).toBe(3);
    world.releaseBullet(spawns[0]!.id);
    expect(run(world, input, 0.3).length).toBe(1);
  });
});

describe('CombatWorld：伤害与事件', () => {
  /** 开局：玩家在左，一只已激活的怪在右，返回一颗玩家子弹的编号。 */
  function fight(seed = 1) {
    const ctx = setup(seed);
    const pid = ctx.world.spawnPlayer('ai_proto', 0, 0);
    const eid = ctx.world.spawnEnemy('naiwa_chaser', 60, 0);
    run(ctx.world, ctx.input, BALANCE.spawnTelegraph + DT);
    ctx.input.fire = true;
    const shoot = () => run(ctx.world, ctx.input, 1 / WEAPONS.pistol_basic.fireRate)[0]!.id;
    return { ...ctx, pid, eid, shoot };
  }

  it('同一次命中按 entity:damaged → entity:died → bullet:hit 的顺序发出，暴击标记一致', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { world, log, eid, shoot } = fight(seed);
      let killed = false;
      for (let i = 0; i < 10 && !killed; i++) {
        log.length = 0;
        expect(world.hitActor(shoot(), eid, 60, 0)).toBe(true);
        const names = log.map((e) => e.name).filter((n) => n !== 'weapon:fired');
        const damaged = log.find((e) => e.name === 'entity:damaged');
        const hit = log.find((e) => e.name === 'bullet:hit');
        if (damaged?.name !== 'entity:damaged' || hit?.name !== 'bullet:hit') throw new Error('缺少事件');
        expect(hit.payload.critical).toBe(damaged.payload.critical);
        expect(hit.payload.targetId).toBe(eid);
        const base = WEAPONS.pistol_basic.damage;
        expect(damaged.payload.amount).toBe(damaged.payload.critical ? base * BALANCE.critMultiplier : base);
        killed = damaged.payload.hp <= 0;
        const expected = ['entity:damaged', ...(killed ? ['entity:died'] : []), 'bullet:hit'];
        expect(names).toEqual(expected);
      }
      expect(killed).toBe(true);
      expect(world.getActor(eid)).toMatchObject({ phase: 'dead', vx: 0, vy: 0 });
    }
  });

  it('暴击按武器的 critChance 出现（统计）', () => {
    let crits = 0;
    let hits = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const { world, log, eid, shoot } = fight(seed);
      world.hitActor(shoot(), eid, 60, 0);
      const d = log.find((e) => e.name === 'entity:damaged');
      if (d?.name === 'entity:damaged') {
        hits++;
        if (d.payload.critical) crits++;
      }
    }
    expect(hits).toBe(400);
    expect(crits / hits).toBeGreaterThan(0.01);
    expect(crits / hits).toBeLessThan(0.1);
  });

  it('命中后怪物被击退，击退在 knockbackTime 后结束', () => {
    const { world, input, eid, pid, shoot } = fight();
    world.syncPosition(pid, -1000, 0);
    world.hitActor(shoot(), eid, 60, 0);
    input.fire = false;
    run(world, input, DT);
    const during = world.getActor(eid)!.vx;
    run(world, input, BALANCE.knockbackTime + DT);
    const after = world.getActor(eid)!.vx;
    expect(during).toBeGreaterThan(after);
    expect(after).toBeCloseTo(-ENEMIES.naiwa_chaser.moveSpeed, 3);
  });

  it('子弹撞墙：发出 bullet:hit（targetId 为 null），之后该子弹失效', () => {
    const { world, log, eid, shoot } = fight();
    const bullet = shoot();
    world.hitWall(bullet, 10, 0);
    expect(log.at(-1)).toMatchObject({ name: 'bullet:hit', payload: { targetId: null, critical: false } });
    const before = world.getActor(eid)!.hp;
    expect(world.hitActor(bullet, eid, 60, 0)).toBe(true);
    expect(world.getActor(eid)!.hp).toBe(before);
  });

  it('同阵营与已死亡的目标不会被命中，子弹继续飞', () => {
    const { world, pid, eid, shoot } = fight();
    expect(world.hitActor(shoot(), pid, 0, 0)).toBe(false);
    while (world.getActor(eid)!.phase !== 'dead') world.hitActor(shoot(), eid, 60, 0);
    expect(world.hitActor(shoot(), eid, 60, 0)).toBe(false);
  });

  it('接触伤害：受伤后进入无敌帧，无敌期间不会重复扣血，结束后再次受伤', () => {
    const { world, input, log, pid, eid } = fight();
    input.fire = false;
    const hp = CHARACTERS.ai_proto.hp;
    world.contact(eid, pid);
    world.contact(eid, pid);
    const afterHit = hp - ENEMIES.naiwa_chaser.contactDamage;
    expect(world.getActor(pid)).toMatchObject({ hp: afterHit, invulnerable: true });
    const damaged = log.filter((e) => e.name === 'entity:damaged');
    expect(damaged.length).toBe(1);
    expect(damaged[0]?.payload).toMatchObject({ id: pid, critical: false, sourceId: eid });
    run(world, input, CHARACTERS.ai_proto.invulnTime + DT);
    expect(world.getActor(pid)?.invulnerable).toBe(false);
    world.contact(eid, pid);
    expect(world.getActor(pid)?.hp).toBe(hp - 2 * ENEMIES.naiwa_chaser.contactDamage);
  });

  it('玩家生命归零：发出 entity:died，playerDead 为 true，之后不再开火', () => {
    const { world, input, log, pid, eid } = fight();
    for (let i = 0; i < CHARACTERS.ai_proto.hp; i++) {
      world.contact(eid, pid);
      run(world, input, CHARACTERS.ai_proto.invulnTime + DT);
    }
    expect(log.some((e) => e.name === 'entity:died' && e.payload.id === pid)).toBe(true);
    const result = world.step(DT, input);
    expect(result.playerDead).toBe(true);
    expect(run(world, input, 1).length).toBe(0);
  });

  it('removeActor 只移除已死亡的实体', () => {
    const { world, eid, pid, shoot } = fight();
    world.removeActor(eid);
    expect(world.getActor(eid)).toBeDefined();
    while (world.getActor(eid)!.phase !== 'dead') world.hitActor(shoot(), eid, 60, 0);
    world.removeActor(eid);
    expect(world.getActor(eid)).toBeUndefined();
    expect(world.actors.map((a) => a.id)).toEqual([pid]);
  });
});

describe('CombatWorld：可复现', () => {
  /** 一段固定的操作：移动、开火、刷怪、命中、接触。返回完整的事件记录。 */
  function script(seed: number) {
    const { world, log, input } = setup(seed);
    const pid = world.spawnPlayer('ai_proto', 0, 0);
    const enemies = [world.spawnEnemy('naiwa_chaser', 120, 0), world.spawnEnemy('naiwa_chaser', 120, 10)];
    input.fire = true;
    input.move.x = -0.5;
    for (let frame = 0; frame < 240; frame++) {
      for (const s of run(world, input, DT)) {
        const target = enemies[s.id % 2]!;
        if (world.getActor(target)?.phase === 'active') world.hitActor(s.id, target, s.x, s.y);
        else world.releaseBullet(s.id);
      }
      if (frame % 30 === 0) world.contact(enemies[0]!, pid);
    }
    return JSON.stringify(log);
  }

  it('同一种子 + 同样的操作 → 事件记录完全一致', () => {
    expect(script(7)).toBe(script(7));
  });

  it('不同种子的散布不同', () => {
    expect(script(7)).not.toBe(script(8));
  });
});
