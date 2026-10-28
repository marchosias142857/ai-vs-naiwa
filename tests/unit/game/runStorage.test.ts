import { afterEach, describe, expect, it, vi } from 'vitest';
import { POOL_SIZES } from '../../../src/config';
import { PLAYER_RULES } from '../../../src/data/player';
import { parseGameSnapshot } from '../../../src/game/save/parseGameSnapshot';
import type { RunSnapshot, SessionSnapshot } from '../../../src/game/save/RunSnapshot';
import { decodeRun, readSavedRun, RUN_KEY, writeSavedRun } from '../../../src/game/save/runStorage';
import { SAVE_VERSION } from '../../../src/game/save/version';
import { CHECKPOINT_KEY } from '../../../src/services/profile';
import { createCombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { Random } from '../../../src/sim/core/Random';
import { createInputFrame } from '../../../src/sim/core/types';
import { LootSystem } from '../../../src/sim/loot/LootSystem';
import { DungeonRun } from '../../../src/sim/run/DungeonRun';
import { RoomDirector } from '../../../src/sim/run/RoomDirector';
import { saveSim } from '../../../src/sim/run/snapshot';

function sample(): SessionSnapshot {
  const bus = new EventBus<GameEvents>(),
    root = new Random(42);
  const world = createCombatWorld({ seed: 42, bus, playerRules: PLAYER_RULES });
  const player = world.spawnPlayer('ai_proto', 150, 100);
  const input = createInputFrame();
  input.fire = true;
  const bullet = world.step(1 / 60, input).bulletSpawns[0]!;
  const run = new DungeonRun(42, bus);
  const director = new RoomDirector(world, run, root, { x: 0, y: 0, width: 300, height: 200 }, () => true);
  const sim = saveSim({
    world,
    run,
    director,
    loot: new LootSystem(root.fork('loot:1')),
    rewards: { rng: root.fork('upgrades:1'), upgrades: [], offers: [] },
  });
  const state: SessionSnapshot = {
    entry: {
      version: 2,
      seed: 42,
      runId: 'test-run',
      talents: {},
      floor: 1,
      upgrades: [],
      secondary: null,
      equipped: 'pistol_basic',
      hp: 6,
      armor: 5,
      energy: 200,
      coins: 0,
      kills: 0,
      roomsCleared: 0,
      elapsed: 0,
    },
    sim,
    game: {
      endTime: 0,
      deaths: [],
      physics: {
        actors: Array.from({ length: POOL_SIZES.actors }, () => null),
        bullets: {
          slots: Array.from({ length: POOL_SIZES.bullets }, () => null),
          free: Array.from({ length: POOL_SIZES.bullets - 1 }, (_, i) => POOL_SIZES.bullets - 1 - i),
        },
      },
    },
  };
  state.game.physics.actors[0] = {
    id: player,
    x: 144,
    y: 94,
    imageX: 150,
    imageY: 100,
    vx: -5,
    vy: -6,
    radius: 6,
  };
  state.game.physics.bullets.slots[0] = {
    id: bullet.id,
    x: bullet.x - 3,
    y: bullet.y - 3,
    imageX: bullet.x,
    imageY: bullet.y,
    vx: 260,
    vy: 0,
    radius: 3,
    remaining: bullet.lifetime,
  };
  return state;
}
const envelope = (s: SessionSnapshot): RunSnapshot => ({
  ...s,
  version: 2,
  meta: { seed: 42, ...SAVE_VERSION, savedAt: 100 },
});
afterEach(() => vi.unstubAllGlobals());

describe('game 快照按字段与 sim 交叉校验', () => {
  it('允许负速度 / 坐标，不要求子弹发射者或已命中目标仍存活', () => {
    const s = sample();
    s.game.physics.actors[0]!.x = -1;
    s.sim.world.nextId = 100;
    s.sim.world.bullets[0]!.ownerId = 70;
    s.sim.world.bullets[0]!.hitIds = [71];
    expect(parseGameSnapshot(s.game, s.sim)).toBe(s.game);
  });
  const corruptions: ((s: SessionSnapshot) => void)[] = [
    (s) => {
      s.game.physics.actors[0]!.vx = NaN;
    },
    (s) => {
      s.game.physics.actors[0]!.imageX = Infinity;
    },
    (s) => {
      s.game.physics.actors[1] = { ...s.game.physics.actors[0]! };
    },
    (s) => {
      s.game.physics.actors[0]!.id = 99;
    },
    (s) => {
      s.game.physics.actors[0]!.radius = 5;
    },
    (s) => {
      s.game.physics.actors.pop();
    },
    (s) => {
      s.game.physics.bullets.slots[0]!.remaining = 0;
    },
    (s) => {
      s.game.physics.bullets.slots[0]!.radius = 99;
    },
    (s) => {
      s.game.physics.bullets.slots[0] = null;
    },
    (s) => {
      s.game.physics.bullets.free[0] = 0;
    },
    (s) => {
      s.game.physics.bullets.free[0] = 1000;
    },
    (s) => {
      s.game.physics.bullets.free[0] = s.game.physics.bullets.free[1]!;
    },
    (s) => {
      s.game.deaths.push({ id: 99, elapsed: 0 });
    },
    (s) => {
      s.game.endTime = -1;
    },
  ];
  it.each(corruptions.map((mutate, i) => ({ mutate, i })))('拒绝畸形字段 / 映射 $i', ({ mutate }) => {
    const s = sample();
    mutate(s);
    expect(parseGameSnapshot(s.game, s.sim)).toBeNull();
  });
  it('尸体计时必须与 dead 实体一一对应且有限、非负', () => {
    const s = sample();
    const a = s.sim.world.actors[0]!;
    a.phase = 'dead';
    expect(parseGameSnapshot(s.game, s.sim)).toBeNull();
    s.game.deaths.push({ id: a.id, elapsed: 0.15 });
    expect(parseGameSnapshot(s.game, s.sim)).not.toBeNull();
    s.game.deaths[0]!.elapsed = -1;
    expect(parseGameSnapshot(s.game, s.sim)).toBeNull();
  });
});

describe('恢复分支与同步存储', () => {
  it('完整、更新、异常、损坏四条分支；entry 单独校验', () => {
    const s = sample(),
      value = envelope(s),
      accept = () => s.sim;
    expect(decodeRun(value, accept).kind).toBe('full');
    expect(decodeRun(value).kind).toBe('full');
    expect(decodeRun({ ...value, sim: null })).toMatchObject({ notice: 'invalid' });
    expect(decodeRun({ ...value, meta: { ...value.meta, build: 'old' } }, accept)).toMatchObject({
      kind: 'none',
      notice: 'updated',
    });
    expect(decodeRun({ ...value, meta: { ...value.meta, dataHash: 'old' } }, accept)).toMatchObject({
      notice: 'updated',
    });
    expect(decodeRun({ ...value, game: null }, accept)).toMatchObject({ notice: 'invalid' });
    expect(
      decodeRun(value, () => {
        throw new Error('parser');
      }),
    ).toMatchObject({ notice: 'invalid' });
    expect(decodeRun({ ...value, entry: { ...s.entry, hp: 0 } }, accept)).toEqual({
      kind: 'none',
      notice: 'corrupt',
    });
    expect(decodeRun(null)).toEqual({ kind: 'none', notice: 'corrupt' });
    s.sim.run.floor = 2;
    expect(decodeRun(value, accept)).toMatchObject({ notice: 'invalid' });
  });
  it('终局文件不能从 entry 复活', () => {
    const s = sample();
    s.sim.run.phase = 'won';
    expect(decodeRun(envelope(s), () => s.sim).kind).toBe('none');
    const stored = envelope(s);
    stored.meta.build = 'old';
    expect(decodeRun(stored).kind).toBe('none');
    s.sim.world.rng.crit = -1;
    expect(decodeRun(envelope(s)).kind).toBe('none');
  });
  it('写入失败保留旧 v2 和 v1；成功只写一次再迁移；终局只清理', () => {
    const values = new Map([
      [RUN_KEY, 'old'],
      [CHECKPOINT_KEY, 'old-v1'],
    ]);
    let fail = true;
    const setItem = vi.fn((key: string, value: string) => {
      if (fail) throw new Error('quota');
      values.set(key, value);
    });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem,
      removeItem: (key: string) => values.delete(key),
    });
    const s = sample();
    expect(writeSavedRun(s)).toBe(false);
    expect([...values]).toEqual([
      [RUN_KEY, 'old'],
      [CHECKPOINT_KEY, 'old-v1'],
    ]);
    fail = false;
    setItem.mockClear();
    expect(writeSavedRun(s)).toBe(true);
    expect(setItem).toHaveBeenCalledOnce();
    expect(values.has(CHECKPOINT_KEY)).toBe(false);
    expect(readSavedRun(() => s.sim).kind).toBe('full');
    s.sim.run.phase = 'lost';
    writeSavedRun(s);
    expect(values.size).toBe(0);
    expect(setItem).toHaveBeenCalledOnce();
  });
  it('v2 JSON 损坏不静默改读旧 v1；没有 v2 才迁移 v1；禁用存储仍返回无档', () => {
    const s = sample(),
      values = new Map([
        [RUN_KEY, '{bad'],
        [CHECKPOINT_KEY, JSON.stringify(s.entry)],
      ]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null });
    expect(readSavedRun()).toEqual({ kind: 'none', notice: 'corrupt' });
    values.delete(RUN_KEY);
    expect(readSavedRun()).toEqual({ kind: 'entry', checkpoint: s.entry });
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readSavedRun()).toEqual({ kind: 'none' });
  });
});

it('boot ends changed-build adventures while preserving every profile/resource byte', async () => {
  const { prepareRunVersion, BUILD_KEY } = await import('../../../src/game/save/runStorage');
  const values = new Map<string, string>([
    [BUILD_KEY, JSON.stringify('old-release')],
    [RUN_KEY, JSON.stringify(envelope(sample()))],
    [CHECKPOINT_KEY, JSON.stringify(sample().entry)],
    ['avn.profile.v2', '{"earned":99,"talents":{"thick_scales":2}}'],
    ['avn.profile.v2.backup', 'backup-verbatim'],
    ['avn.future.resource', '{"pearls":123}'],
  ]);
  const protectedValues = [...values].filter(([k]) => k.includes('profile') || k.includes('future'));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
  expect(prepareRunVersion()).toBe(true);
  expect(readSavedRun()).toEqual({ kind: 'none', notice: 'updated' });
  expect(values.has(RUN_KEY)).toBe(false);
  expect(values.has(CHECKPOINT_KEY)).toBe(false);
  for (const [key, value] of protectedValues) expect(values.get(key)).toBe(value);
  expect(prepareRunVersion()).toBe(false);
  const state = sample();
  expect(writeSavedRun(state)).toBe(true);
  expect(prepareRunVersion()).toBe(false);
  expect(readSavedRun(() => state.sim).kind).toBe('full');
  // Pre-policy installations with a standalone, unversioned entrance cannot resume across release.
  values.delete(BUILD_KEY);
  values.delete(RUN_KEY);
  values.set(CHECKPOINT_KEY, JSON.stringify(state.entry));
  expect(prepareRunVersion()).toBe(true);
  expect(values.has(CHECKPOINT_KEY)).toBe(false);
  expect(prepareRunVersion()).toBe(false);
});
