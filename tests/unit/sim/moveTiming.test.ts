import { describe, expect, it } from 'vitest';
import { ENEMIES, type EnemyId } from '../../../src/data/enemies';
import {
  createCombatWorld,
  type ActorView,
  type CombatWorld,
  type CombatWorldState,
} from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { EnemyAction, GameEvents } from '../../../src/sim/core/events';
import { createInputFrame } from '../../../src/sim/core/types';

/**
 * ADR 0038 招式进度视图：表现层只按 sim 给出的阶段与进度选帧，因此这里逐个物理步核对
 * 「前摇播满 → 生效首步 → 收招」、方向锁定、跳跃落点，以及读档首帧与存档前一致。
 * 物理用最小积分代替 Arcade：按上一步速度移动、限制在房间内、可选方块挡住移动。
 */
const DT = 1 / 60;
const EPS = 1e-6;
const BOUNDS = { x: 0, y: 0, width: 300, height: 200 };
const PLAYER = { x: 150, y: 100 };
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function blocked(boxes: readonly Box[], x: number, y: number, r: number): boolean {
  if (x - r < 0 || y - r < 0 || x + r > BOUNDS.width || y + r > BOUNDS.height) return true;
  return boxes.some((b) => x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h);
}

interface Acted {
  id: number;
  action: EnemyAction;
}

function harness(world: CombatWorld, bus: EventBus<GameEvents>, boxes: Box[] = []) {
  const acted: Acted[] = [];
  const fired = new Set<number>();
  bus.on('enemy:acted', (e) => acted.push({ id: e.id, action: e.action }));
  const input = createInputFrame();
  /** 推进一步，返回本步的招式事件与开过火的怪物编号。 */
  const step = () => {
    acted.length = 0;
    fired.clear();
    for (const a of world.actors) {
      if (a.phase !== 'active') continue;
      if (a.team === 'player') {
        world.syncPosition(a.id, PLAYER.x, PLAYER.y);
        continue;
      }
      const nx = a.x + a.vx * DT,
        ny = a.y + a.vy * DT;
      if (!blocked(boxes, nx, ny, a.radius)) world.syncPosition(a.id, nx, ny);
    }
    for (const b of world.step(DT, input).bulletSpawns) {
      if (b.team === 'enemy') fired.add(b.ownerId);
      world.releaseBullet(b.id);
    }
    return { acted: [...acted], fired: new Set(fired) };
  };
  return { step };
}

function setup(seed: number, boxes: Box[] = []) {
  const bus = new EventBus<GameEvents>();
  const world = createCombatWorld({ seed, bus, bounds: BOUNDS, godMode: true });
  return { world, bus, ...harness(world, bus, boxes) };
}

/** 从存档重建世界：读档不发事件，之后可以照常推进。 */
function reload(state: CombatWorldState, seed: number, boxes: Box[] = []) {
  const bus = new EventBus<GameEvents>();
  const world = createCombatWorld({ seed, bus, bounds: BOUNDS, godMode: true });
  world.load(JSON.parse(JSON.stringify(state)) as CombatWorldState);
  return { world, bus, ...harness(world, bus, boxes) };
}

type View = Pick<ActorView, 'move' | 'stage' | 'stageTime' | 'stageSpan' | 'aimLocked' | 'aim' | 'x' | 'y'>;
const view = (a: ActorView): View => ({
  move: a.move,
  stage: a.stage,
  stageTime: a.stageTime,
  stageSpan: a.stageSpan,
  aimLocked: a.aimLocked,
  aim: a.aim,
  x: a.x,
  y: a.y,
});
const stageKey = (w: CombatWorld) =>
  JSON.stringify(
    w.actors
      .filter((a) => a.team === 'enemy')
      .map((a) => [a.id, a.pose, a.move, a.stage, a.stageTime, a.stageSpan, a.aimLocked, a.landX, a.landY]),
  );

/** 生效的那一步之前必须是同一招的前摇（或腾空、地下），并且已经播满。 */
const ENDS: Partial<Record<EnemyAction, readonly string[]>> = {
  lunge: ['windup'],
  hop: ['windup'],
  land: ['air'],
  lash: ['windup'],
  summon: ['windup'],
  explode: ['windup'],
  rain: ['windup'],
};

/** Boss 以给定血量比例出现：改存档里的血量再读档，三个阶段走同一套检查。 */
function bossAt(ratio: number, seed: number) {
  const t = setup(seed);
  t.world.spawnPlayer('ai_proto', PLAYER.x, PLAYER.y);
  t.world.spawnEnemy('naiwa_boss', 60, 100);
  const state = t.world.save();
  const boss = state.actors.find((a) => a.kind === 'naiwa_boss')!;
  boss.hp = Math.floor(boss.maxHp * ratio);
  return reload(state, seed);
}

function run(kind: EnemyId, seed: number, steps: number, make?: () => ReturnType<typeof setup>) {
  const t =
    make?.() ??
    (() => {
      const s = setup(seed);
      s.world.spawnPlayer('ai_proto', PLAYER.x, PLAYER.y);
      s.world.spawnEnemy(kind, 60, 100);
      return s;
    })();
  const id = t.world.actors.find((a) => a.kind === kind)!.id;
  const seen = new Set<string>();
  let prev: View | null = null;
  let roundTrips = 0;
  for (let i = 0; i < steps; i++) {
    const { acted, fired } = t.step();
    const a = t.world.getActor(id);
    if (!a) break;
    const now = view(a);
    // 1. 进度始终在 [0, span] 内；没有出招时为 0。
    expect(now.stageTime).toBeGreaterThanOrEqual(0);
    expect(now.stageTime).toBeLessThanOrEqual(now.stageSpan + EPS);
    if (now.stage === 'ready') expect(now.stageSpan + now.stageTime).toBe(0);
    // 2. 同一阶段内进度每步正好加 dt；常规射击连发时后坐从 0 重新开始。
    if (
      prev &&
      a.phase === 'active' &&
      prev.move === now.move &&
      prev.stage === now.stage &&
      now.stage !== 'ready'
    ) {
      const restarted = now.move === 'none' && now.stage === 'active' && fired.has(id) && now.stageTime === 0;
      if (!restarted) expect(now.stageTime).toBeCloseTo(Math.min(prev.stageTime + DT, now.stageSpan), 6);
    }
    // 3. 锁定后方向不再变化，直到本招结束。
    if (prev?.aimLocked && now.aimLocked && prev.move === now.move && now.move !== 'none')
      expect(now.aim).toBeCloseTo(prev.aim, 9);
    // 4. 生效只发生在前摇末步之后的第一步。
    for (const e of acted) {
      if (e.id !== id) continue;
      seen.add(e.action);
      const want = ENDS[e.action];
      if (!want || !prev) continue;
      expect(want).toContain(prev.stage);
      expect(prev.stageTime).toBeGreaterThan(prev.stageSpan - DT - EPS);
      if (e.action !== 'explode') expect(now.stageTime).toBe(0);
    }
    // 常规射击开火的那一步进入后坐阶段的第 0 秒。
    if (fired.has(id) && now.move === 'none') {
      seen.add('shot');
      expect(now.stage).toBe('active');
      expect(now.stageTime).toBe(0);
    }
    // 5. 每隔一段存档 → JSON → 读档，读档首帧的招式视图与存档前完全一致。
    if (i % 37 === 11) {
      const copy = reload(t.world.save(), seed);
      expect(stageKey(copy.world)).toBe(stageKey(t.world));
      roundTrips++;
    }
    prev = now;
  }
  expect(roundTrips).toBeGreaterThan(0);
  return seen;
}

describe('招式进度视图（ADR 0038）', () => {
  const cases: [EnemyId, readonly string[]][] = [
    ['naiwa_chaser', ['lunge']],
    ['naiwa_charger', ['lunge']],
    ['naiwa_hopper', ['hop', 'land']],
    ['naiwa_bomber', ['explode']],
    ['naiwa_tongue', ['lash']],
    ['naiwa_brood', ['summon']],
    ['naiwa_burrower', ['burrow', 'emerge']],
    ['naiwa_dancer', ['spin']],
    ['naiwa_spitter', ['shot']],
    ['naiwa_turret', ['shot']],
    ['naiwa_gasser', ['gas']],
    ['naiwa_scout', []],
    ['naiwa_tank', []],
    ['naiwa_splitter', []],
    ['naiwa_tadpole', []],
  ];
  it.each(cases)('%s：进度连续、生效紧接前摇末步、读档首帧一致', (kind, expected) => {
    const seen = run(kind, 7, 60 * 12);
    for (const action of expected) expect([...seen]).toContain(action);
  });

  it('奶怪三个阶段：冲撞、砸地、旋转、召唤与石块雨都满足同样的时序', () => {
    const seen = new Set<string>();
    for (const [ratio, seed] of [
      [1, 5],
      [0.6, 6],
      [0.3, 8],
    ] as const)
      for (const a of run('naiwa_boss', seed, 60 * 20, () => bossAt(ratio, seed))) seen.add(a);
    for (const action of ['lunge', 'hop', 'land', 'spin', 'summon', 'rain', 'shot'])
      expect([...seen]).toContain(action);
  });

  it('跳跃：起跳才锁定方向，预计落点与真实落点相差不超过一步位移', () => {
    for (const boxes of [[], [{ x: 100, y: 60, w: 12, h: 80 }]] as Box[][]) {
      const t = setup(3, boxes);
      t.world.spawnPlayer('ai_proto', PLAYER.x, PLAYER.y);
      const id = t.world.spawnEnemy('naiwa_hopper', 60, 100);
      const hop = ENEMIES.naiwa_hopper.hop;
      let land: { x: number; y: number } | null = null;
      let checked = 0;
      for (let i = 0; i < 60 * 6 && checked < 3; i++) {
        const { acted } = t.step();
        const a = t.world.getActor(id)!;
        if (a.stage === 'windup') expect(a.aimLocked).toBe(false);
        if (a.stage === 'air') {
          expect(a.aimLocked).toBe(true);
          land = { x: a.landX, y: a.landY };
        } else if (a.landX !== 0 || a.landY !== 0) throw new Error('非腾空时落点应为 0');
        if (acted.some((e) => e.id === id && e.action === 'land')) {
          // 落地那一步的位置就是真实落点；最后一次预计按剩余一步算，误差不超过一步位移。
          const step = (hop.range / hop.air) * DT;
          expect(Math.hypot(a.x - land!.x, a.y - land!.y)).toBeLessThanOrEqual(step + EPS);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
    }
  });

  it('舌击：剩余 0.25 秒起锁定方向，之后玩家移动也不再转向', () => {
    const t = setup(4);
    t.world.spawnPlayer('ai_proto', PLAYER.x, PLAYER.y);
    const id = t.world.spawnEnemy('naiwa_tongue', 90, 100);
    let lockedAt = -1;
    for (let i = 0; i < 60 * 6 && lockedAt < 0; i++) {
      t.step();
      const a = t.world.getActor(id)!;
      if (a.move === 'lash' && a.stage === 'windup' && a.aimLocked) lockedAt = a.stageSpan - a.stageTime;
    }
    expect(lockedAt).toBeGreaterThan(0);
    expect(lockedAt).toBeLessThanOrEqual(0.25 + EPS);
    expect(lockedAt).toBeGreaterThan(0.25 - DT - EPS);
  });

  it('冻住时阶段与进度停住、不出招；解冻后按剩余时间生效', () => {
    const t = setup(4);
    t.world.spawnPlayer('ai_proto', PLAYER.x, PLAYER.y);
    const id = t.world.spawnEnemy('naiwa_tongue', 90, 100);
    for (let i = 0; i < 60 * 6; i++) {
      t.step();
      const a = t.world.getActor(id)!;
      if (a.move === 'lash' && a.stage === 'windup' && a.stageTime > 0.2) break;
    }
    const state = t.world.save();
    const saved = state.actors.find((a) => a.id === id)!;
    saved.status.freeze = 0.5;
    const f = reload(state, 4);
    const before = view(f.world.getActor(id)!);
    // 与 AI 一样逐步扣减剩余时间，得到前摇还要几步（避免浮点取整差一步）。
    let need = 0;
    for (let r = saved.brain.time; r > 0; r -= DT) need++;
    for (let i = 0; i < 25; i++) {
      const { acted } = f.step();
      expect(acted.filter((e) => e.id === id)).toEqual([]);
      const a = f.world.getActor(id)!;
      expect([a.stage, a.stageTime, a.stageSpan]).toEqual([before.stage, before.stageTime, before.stageSpan]);
    }
    // 解冻后的第几步出舌：前摇剩下几步就是第几步，冻结期间一步也不算。
    let thawed = 0,
      lashed = 0;
    for (let i = 0; i < 120 && !lashed; i++) {
      const { acted } = f.step();
      if (!f.world.getActor(id)!.frozen || acted.length) thawed++;
      if (acted.some((e) => e.id === id && e.action === 'lash')) lashed = thawed;
    }
    expect(lashed).toBe(need);
  });

  it('旧存档里没有 span 的冲锋：读档后从剩余时间起算，不出现负进度', () => {
    const t = setup(2);
    t.world.spawnPlayer('ai_proto', PLAYER.x, PLAYER.y);
    const id = t.world.spawnEnemy('naiwa_charger', 60, 100);
    let state: CombatWorldState | null = null;
    for (let i = 0; i < 60 * 8 && !state; i++) {
      t.step();
      if (t.world.getActor(id)!.stage === 'windup') state = t.world.save();
    }
    const brain = state!.actors.find((a) => a.id === id)!.brain;
    brain.span = 0;
    const old = reload(state!, 2);
    const a = old.world.getActor(id)!;
    expect(a.stage).toBe('windup');
    expect(a.stageTime).toBe(0);
    expect(a.stageSpan).toBeCloseTo(brain.time, 9);
  });
});
