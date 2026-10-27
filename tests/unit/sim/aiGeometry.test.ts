import { describe, expect, it } from 'vitest';
import { ENEMIES, type EnemyId } from '../../../src/data/enemies';
import {
  createCombatWorld,
  type CombatWorld,
  type CombatWorldOptions,
  type CombatWorldState,
} from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { EnemyAction, GameEvents } from '../../../src/sim/core/events';
import { Random } from '../../../src/sim/core/Random';
import { createInputFrame } from '../../../src/sim/core/types';
import {
  RoomGeometry,
  type GeometryHit,
  type GeometryObstacle,
  type GeometryQueries,
  type OccupyPurpose,
  type Point,
} from '../../../src/sim/geometry/RoomGeometry';

/**
 * ADR 0039「已确认的 AI 接入规则」。物理用最小积分代替 Arcade：按上一步速度移动，
 * 新位置能被几何容纳（贴合合法）才写回，否则原地不动——与 Arcade 挡墙的效果相当。
 */
const DT = 1 / 60;
const BOUNDS = { x: 0, y: 0, width: 300, height: 200 };
const p = (x: number, y: number): Point => ({ x, y });
const rect = (l: number, t: number, r: number, b: number) => [p(l, t), p(r, t), p(r, b), p(l, b)];
const ROOM = rect(0, 0, 300, 200);
const pillar = (id: string, l: number, t: number, r: number, b: number): GeometryObstacle => ({
  id,
  kind: 'pillar',
  mask: 15,
  shape: { type: 'polygon', points: rect(l, t, r, b) },
});

interface Setup {
  world: CombatWorld;
  log: { id: number; action: EnemyAction; x: number; y: number }[];
  step: (n?: number, hold?: (w: CombatWorld) => void) => number;
}
function setup(
  seed: number,
  geo: GeometryQueries | null,
  physics: GeometryQueries,
  load?: CombatWorldState,
): Setup {
  const bus = new EventBus<GameEvents>();
  const options: CombatWorldOptions = { seed, bus, bounds: BOUNDS, godMode: true };
  if (geo) options.geometry = () => geo;
  const world = createCombatWorld(options);
  if (load) world.load(JSON.parse(JSON.stringify(load)) as CombatWorldState);
  const log: Setup['log'] = [];
  bus.on('enemy:acted', (e) => log.push({ id: e.id, action: e.action, x: e.x, y: e.y }));
  const input = createInputFrame();
  const at = { x: 0, y: 0 };
  let shots = 0;
  const step = (n = 1, hold?: (w: CombatWorld) => void) => {
    for (let i = 0; i < n; i++) {
      for (const a of world.actors) {
        if (a.phase !== 'active') continue;
        at.x = a.x + a.vx * DT;
        at.y = a.y + a.vy * DT;
        if (physics.canOccupy(at, a.radius, 'walk')) world.syncPosition(a.id, at.x, at.y);
      }
      hold?.(world);
      for (const b of world.step(DT, input).bulletSpawns) {
        if (b.team === 'enemy') shots++;
        world.releaseBullet(b.id);
      }
    }
    return shots;
  };
  return { world, log, step };
}
const pin = (id: number, x: number, y: number) => (w: CombatWorld) => w.syncPosition(id, x, y);
const rectRoom = new RoomGeometry(ROOM, [], 1);

/** 把同一个查询对象包一层，记录每次 canOccupy 的用途，或强制某种用途不合法。 */
function rejecting(base: GeometryQueries, reject: (purpose: OccupyPurpose, c: Point) => boolean) {
  return {
    revision: base.revision,
    canOccupy: (c: Point, r: number, purpose: OccupyPurpose) =>
      !reject(purpose, c) && base.canOccupy(c, r, purpose),
    sweepCircle: (a: Point, b: Point, r: number, mask: number, out: GeometryHit) =>
      base.sweepCircle(a, b, r, mask, out),
    traceSegment: (a: Point, b: Point, mask: number, out: GeometryHit) => base.traceSegment(a, b, mask, out),
  } satisfies GeometryQueries;
}

describe('矩形房间：接入几何后结果与旧规则逐步一致', () => {
  const kinds: EnemyId[] = [
    'naiwa_chaser',
    'naiwa_scout',
    'naiwa_tank',
    'naiwa_spitter',
    'naiwa_turret',
    'naiwa_charger',
    'naiwa_hopper',
    'naiwa_bomber',
    'naiwa_tongue',
    'naiwa_burrower',
    'naiwa_dancer',
    'naiwa_gasser',
  ];
  it.each(kinds)('%s：20 秒内每秒存档完全相同', (kind) => {
    const make = (geo: GeometryQueries | null) => {
      const t = setup(11, geo, rectRoom);
      const player = t.world.spawnPlayer('ai_proto', 200, 100);
      t.world.spawnEnemy(kind, 60, 60);
      t.world.spawnEnemy(kind, 250, 170);
      return { ...t, player };
    };
    const a = make(null),
      b = make(rectRoom);
    for (let s = 0; s < 20; s++) {
      a.step(60, pin(a.player, 200, 100));
      b.step(60, pin(b.player, 200, 100));
      expect(JSON.stringify(b.world.save())).toBe(JSON.stringify(a.world.save()));
    }
  });
});

describe('视线（规则 3）', () => {
  // 凹口：北墙中间向下凹入 120..180 × 0..120，菌冠蛙与玩家分别站在两侧
  const notch = new RoomGeometry(
    [p(0, 0), p(120, 0), p(120, 120), p(180, 120), p(180, 0), p(300, 0), p(300, 200), p(0, 200)],
    [],
    1,
  );
  it('隔着凹口外的房外区域看不见就不开火；旧规则（没有几何）会隔墙开火', () => {
    const shots = (geo: GeometryQueries | null) => {
      const t = setup(5, geo, notch);
      const player = t.world.spawnPlayer('ai_proto', 240, 40);
      const turret = t.world.spawnEnemy('naiwa_turret', 60, 40);
      return t.step(60 * 8, (w) => {
        w.syncPosition(player, 240, 40);
        w.syncPosition(turret, 60, 40);
      });
    };
    expect(shots(notch)).toBe(0);
    expect(shots(null)).toBeGreaterThan(0);
  });
  it('柱子挡住视线；绕到柱子旁边就恢复开火', () => {
    const room = new RoomGeometry(ROOM, [pillar('pillar:0', 140, 60, 160, 140)], 1);
    const shots = (px: number, py: number) => {
      const t = setup(5, room, room);
      const player = t.world.spawnPlayer('ai_proto', px, py);
      const turret = t.world.spawnEnemy('naiwa_turret', 60, 100);
      return t.step(60 * 8, (w) => {
        w.syncPosition(player, px, py);
        w.syncPosition(turret, 60, 100);
      });
    };
    expect(shots(240, 100)).toBe(0);
    expect(shots(100, 180)).toBeGreaterThan(0);
  });
});

describe('跳跃落点（规则 1）', () => {
  it('路上有柱子：起跳时把距离截到柱前，实际落点与预计落点一致，不嵌进柱子', () => {
    const room = new RoomGeometry(ROOM, [pillar('pillar:0', 90, 60, 100, 140)], 1);
    const t = setup(3, room, room);
    const player = t.world.spawnPlayer('ai_proto', 160, 100);
    const hopper = t.world.spawnEnemy('naiwa_hopper', 50, 100);
    const r = ENEMIES.naiwa_hopper.radius;
    let land: Point | null = null,
      landed: Point | null = null;
    for (let i = 0; i < 60 * 6 && !landed; i++) {
      t.log.length = 0;
      t.step(1, pin(player, 160, 100));
      const a = t.world.getActor(hopper)!;
      if (a.stage === 'air' && !land) land = { x: a.landX, y: a.landY };
      if (t.log.some((e) => e.id === hopper && e.action === 'land')) landed = { x: a.x, y: a.y };
    }
    expect(land!.x).toBeCloseTo(90 - r, 6);
    expect(Math.hypot(landed!.x - land!.x, landed!.y - land!.y)).toBeLessThanOrEqual(
      (ENEMIES.naiwa_hopper.hop.range / ENEMIES.naiwa_hopper.hop.air) * DT + 1e-6,
    );
    expect(room.canOccupy(landed!, r, 'land')).toBe(true);
  });
  it('贴着墙起跳仍能跳出去（初始接触只挡朝里的运动）', () => {
    const t = setup(3, rectRoom, rectRoom);
    const r = ENEMIES.naiwa_hopper.radius;
    const player = t.world.spawnPlayer('ai_proto', 70, 100);
    const hopper = t.world.spawnEnemy('naiwa_hopper', r, 100);
    let land: Point | null = null;
    for (let i = 0; i < 60 * 4 && !land; i++) {
      t.step(1, (w) => {
        w.syncPosition(player, 70, 100);
        if (w.getActor(hopper)!.stage !== 'air') w.syncPosition(hopper, r, 100);
      });
      const a = t.world.getActor(hopper)!;
      if (a.stage === 'air') land = { x: a.landX, y: a.landY };
    }
    expect(land!.x).toBeGreaterThan(r + 50);
  });
  it('终点不能落地时每次退 2 单位，全部不行就原地跳；不抽随机数', () => {
    const run = (limit: number) => {
      // 只允许落在离起点 limit 以内（模拟终点附近有扫掠看不出的禁落区）
      const start = p(50, 100);
      const geo = rejecting(
        rectRoom,
        (purpose, c) => purpose === 'land' && Math.hypot(c.x - 50, c.y - 100) > limit + 1e-9,
      );
      const t = setup(3, geo, rectRoom);
      const player = t.world.spawnPlayer('ai_proto', 130, 100);
      const hopper = t.world.spawnEnemy('naiwa_hopper', start.x, start.y);
      for (let i = 0; i < 60 * 4; i++) {
        t.step(1, pin(player, 130, 100));
        const a = t.world.getActor(hopper)!;
        if (a.stage === 'air') return { land: a.landX - start.x, rng: t.world.save().rng.ai };
      }
      throw new Error('没有起跳');
    };
    // 目标 80（玩家距离），合法上限 31：80 → 78 → … → 30
    expect(run(31).land).toBeCloseTo(30, 6);
    expect(run(-1).land).toBeCloseTo(0, 6);
    expect(run(31).rng).toBe(run(1000).rng);
  });
});

describe('奶怪冲撞分类（规则 4）', () => {
  // 柱子贴着北墙：奶怪贴墙向右冲，首先撞上的是柱子
  const room = new RoomGeometry(ROOM, [pillar('pillar:0', 120, 0, 140, 40)], 1);
  const charge = (
    geo: GeometryQueries | null,
    physics: GeometryQueries,
    px: number,
    py: number,
    by: number,
  ) => {
    const t = setup(5, geo, physics);
    const player = t.world.spawnPlayer('ai_proto', px, py);
    const boss = t.world.spawnEnemy('naiwa_boss', 40, by);
    let dashing = false;
    for (let i = 0; i < 60 * 12; i++) {
      t.step(1, (w) => {
        w.syncPosition(player, px, py);
        const a = w.getActor(boss)!;
        dashing ||= a.move === 'bump' && a.stage === 'dash';
        if (!dashing) w.syncPosition(boss, 40, by);
      });
      const acts = t.log.filter((e) => e.id === boss && (e.action === 'stun' || e.action === 'crash'));
      if (acts.length) return acts[0]!.action;
    }
    throw new Error('没有撞上');
  };
  const r = ENEMIES.naiwa_boss.radius;
  it('贴着外墙冲向靠墙柱：撞柱眩晕（旧规则会因为贴墙判成不晕）', () => {
    expect(charge(room, room, 260, r, r)).toBe('stun');
    expect(charge(null, room, 260, r, r)).toBe('crash');
  });
  it('冲向房间外墙只停下，不晕', () => {
    expect(charge(rectRoom, rectRoom, 300 - 7, 100, 100)).toBe('crash');
  });
});

describe('召唤与落石（规则 5、6）', () => {
  it('贴着墙角召唤：每只子体都放在合法位置或施法者身上，数量与 AI 随机抽数和旧规则相同', () => {
    const run = (geo: GeometryQueries | null) => {
      const t = setup(9, geo, rectRoom);
      const player = t.world.spawnPlayer('ai_proto', 260, 170);
      const r = ENEMIES.naiwa_brood.radius;
      const brood = t.world.spawnEnemy('naiwa_brood', r, r);
      for (let i = 0; i < 60 * 10; i++) {
        t.step(1, (w) => {
          w.syncPosition(player, 260, 170);
          w.syncPosition(brood, r, r);
        });
        if (t.log.some((e) => e.id === brood && e.action === 'summon')) break;
      }
      const kids = t.world.actors.filter((a) => a.kind === 'naiwa_tadpole');
      return { kids, rng: t.world.save().rng.ai, r };
    };
    const geo = run(rectRoom),
      old = run(null);
    expect(geo.kids.length).toBe(ENEMIES.naiwa_brood.summon.count);
    expect(geo.kids.length).toBe(old.kids.length);
    expect(geo.rng).toBe(old.rng);
    const tadpole = ENEMIES.naiwa_tadpole.radius;
    for (const k of geo.kids)
      expect(
        rectRoom.canOccupy(k, tadpole, 'spawn') || (k.x === geo.r && k.y === geo.r),
        `${k.x},${k.y}`,
      ).toBe(true);
    // 旧规则在墙角会把子体放到房外
    expect(old.kids.some((k) => !rectRoom.canOccupy(k, tadpole, 'spawn'))).toBe(true);
  });

  /** 奶怪以三分之一血量出现（石块雨阶段）。 */
  const bossLow = (geo: GeometryQueries, seed: number) => {
    const base = setup(seed, null, rectRoom);
    base.world.spawnPlayer('ai_proto', 200, 100);
    base.world.spawnEnemy('naiwa_boss', 80, 100);
    const state = base.world.save();
    const boss = state.actors.find((a) => a.kind === 'naiwa_boss')!;
    boss.hp = Math.floor(boss.maxHp * 0.3);
    return setup(seed, geo, rectRoom, state);
  };
  it('有柱子的房间里，石块雨和砸地的每块石头都落在合法位置', () => {
    const room = new RoomGeometry(
      ROOM,
      [pillar('pillar:0', 150, 70, 175, 95), pillar('pillar:1', 210, 110, 235, 135)],
      1,
    );
    const t = bossLow(room, 4);
    let checked = 0;
    for (let i = 0; i < 60 * 25; i++) {
      t.step(1, (w) => {
        const pl = w.actors.find((a) => a.team === 'player')!;
        w.syncPosition(pl.id, 200, 100);
      });
      // 新出现的石块：本步刚生成，已经被扣掉一个 dt
      for (const r of t.world.rocks)
        if (r.active && !r.landed && r.fall - r.time <= DT + 1e-9) {
          expect(room.canOccupy(r, r.radius, 'rock')).toBe(true);
          checked++;
        }
    }
    expect(checked).toBeGreaterThan(4);
  });
  it('所有尝试都不合法：跳过这块石头，不抽错开时长；抽数等于尝试次数', () => {
    const geo = rejecting(rectRoom, (purpose) => purpose === 'rock');
    const t = bossLow(geo, 4);
    for (let i = 0; i < 60 * 25; i++) {
      const before = t.world.save().rng.ai;
      t.log.length = 0;
      t.step(1, (w) => {
        const pl = w.actors.find((a) => a.team === 'player')!;
        w.syncPosition(pl.id, 200, 100);
      });
      if (!t.log.some((e) => e.action === 'rain')) continue;
      // 7 块 × 8 次尝试 × 2 次抽数，第一块第一次尝试的距离固定为 0 不抽
      const expected = new Random(before);
      for (let k = 0; k < ENEMIES.naiwa_boss.rain.count * 8 * 2 - 1; k++) expected.next();
      expect(t.world.save().rng.ai).toBe(expected.snapshot);
      expect(t.world.rocks.filter((r) => r.active).length).toBe(0);
      return;
    }
    throw new Error('没有石块雨');
  });
});

describe('铲爪蛙出土（规则 2）', () => {
  it('L 形和凹口房里反复潜地、出土，每次出土位置都能容纳身体', () => {
    const rooms = [
      new RoomGeometry([p(0, 0), p(300, 0), p(300, 100), p(180, 100), p(180, 200), p(0, 200)], [], 1),
      new RoomGeometry(
        [p(0, 0), p(120, 0), p(120, 90), p(180, 90), p(180, 0), p(300, 0), p(300, 200), p(0, 200)],
        [pillar('pillar:0', 60, 130, 90, 160)],
        1,
      ),
    ];
    const r = ENEMIES.naiwa_burrower.radius;
    let emerged = 0;
    for (const room of rooms)
      for (const [px, py] of [
        [250, 40],
        [40, 180],
        [150, 160],
      ] as const) {
        const t = setup(6, room, room);
        const player = t.world.spawnPlayer('ai_proto', px, py);
        const id = t.world.spawnEnemy('naiwa_burrower', 30, 30);
        for (let i = 0; i < 60 * 15; i++) {
          t.log.length = 0;
          t.step(1, pin(player, px, py));
          if (t.log.some((e) => e.id === id && e.action === 'emerge')) {
            expect(room.canOccupy(t.world.getActor(id)!, r, 'surface')).toBe(true);
            emerged++;
          }
        }
      }
    expect(emerged).toBeGreaterThan(10);
  });
});
