import { describe, expect, it } from 'vitest';
import { DUNGEON } from '../../../src/data/dungeon';
import { TALENT_RULES as R } from '../../../src/data/talents';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import {
  availablePoints,
  emptyProfile,
  isSettled,
  newRunId,
  parseProfile,
  resetTalents,
  runReward,
  settleRun,
  summarizeRun,
  unlockTalent,
  validSummary,
  type MetaProfile,
  type RunSummary,
} from '../../../src/sim/meta/profile';
import { spentPoints } from '../../../src/sim/meta/talents';
import { DungeonRun } from '../../../src/sim/run/DungeonRun';

const BOSS_FLOOR = DUNGEON.floors + 1;
const death = (over: Partial<RunSummary> = {}): RunSummary => ({
  runId: 'run-a',
  victory: false,
  floor: 1,
  roomsCleared: 3,
  kills: 18,
  ...over,
});
const points = (r: ReturnType<typeof runReward>) =>
  Object.fromEntries(r.lines.map((l) => [l.kind, l.points]));

describe('结算奖励公式', () => {
  it('首局在第 1 层死亡：房间 + 首次到达第 1 层；够解锁一个入门天赋', () => {
    const reward = runReward(death(), emptyProfile());
    expect(points(reward)).toEqual({ rooms: 3, floors: 0, kills: 0, victory: 0, record: 3, first_win: 0 });
    expect(reward.total).toBe(6);
    // 即便第一个房间都没清完，首局也够买一个入门节点（4 点）。
    expect(runReward(death({ roomsCleared: 1, kills: 4 }), emptyProfile()).total).toBe(4);
  });
  it('通关：房间、楼层、击杀封顶、Boss、首次通关与新楼层纪录分别列出', () => {
    const win = death({ victory: true, floor: BOSS_FLOOR, roomsCleared: 16, kills: 130 });
    const first = runReward(win, emptyProfile());
    expect(points(first)).toEqual({
      rooms: 16,
      floors: 2 * DUNGEON.floors,
      kills: R.killCap,
      victory: R.victory,
      record: R.record * BOSS_FLOOR,
      first_win: R.firstWin,
    });
    const again = runReward(win, { bestFloor: BOSS_FLOOR, wins: 1 });
    expect(again.total).toBe(16 + 6 + 5 + 8);
    expect(first.lines.find((l) => l.kind === 'kills')!.count).toBe(130);
  });
  it('召唤物刷击杀不能无限加点：击杀项有上限', () => {
    const farm = runReward(death({ kills: 1_000_000 }), { bestFloor: 1, wins: 0 });
    expect(points(farm).kills).toBe(R.killCap);
    expect(farm.total).toBe(3 + R.killCap);
  });
  it('只接受 sim 可能产生的终局：非法 ID、楼层、计数、调试冒险都拒绝', () => {
    expect(validSummary(death())).toBe(true);
    for (const bad of [
      death({ runId: '' }),
      death({ runId: 'Has Space' }),
      death({ runId: 'debug-1' }),
      death({ floor: 0 }),
      death({ floor: BOSS_FLOOR + 1 }),
      death({ floor: 1.5 }),
      death({ victory: true, floor: 2 }),
      death({ roomsCleared: -1 }),
      death({ roomsCleared: 999 }),
      death({ kills: NaN }),
    ])
      expect(validSummary(bad), JSON.stringify(bad)).toBe(false);
  });
  it('只从终局的 DungeonRun 取表现；未结束返回 null', () => {
    const run = new DungeonRun(3, new EventBus<GameEvents>());
    expect(summarizeRun('run-a', run)).toBeNull();
    run.kills = 7;
    run.step(0.1, 0, true);
    expect(summarizeRun('run-a', run)).toEqual({
      runId: 'run-a',
      victory: false,
      floor: 1,
      roomsCleared: 0,
      kills: 7,
    });
  });
  it('冒险 ID 稳定、可通过格式校验；同种子不同时刻不撞号', () => {
    expect(newRunId(42, 1_700_000_000_000)).toBe(newRunId(42, 1_700_000_000_000));
    expect(newRunId(42, 1_700_000_000_000)).not.toBe(newRunId(42, 1_700_000_000_001));
    expect(validSummary(death({ runId: newRunId(0xffffffff, Date.now()) }))).toBe(true);
  });
});

describe('结算幂等', () => {
  it('同一冒险重复结算只发一次奖；战绩与点数一起更新', () => {
    const first = settleRun(emptyProfile(), death());
    expect(first.status).toBe('settled');
    expect(first.profile).toMatchObject({ runs: 1, wins: 0, bestFloor: 1, kills: 18, earned: 6 });
    expect(isSettled(first.profile, 'run-a')).toBe(true);
    const again = settleRun(first.profile, death({ kills: 999 }));
    expect(again.status).toBe('duplicate');
    expect(again.reward).toBeNull();
    expect(again.profile).toEqual(first.profile);
    expect(again.profile).not.toBe(first.profile);
    const invalid = settleRun(first.profile, death({ runId: 'debug-x' }));
    expect(invalid.status).toBe('invalid');
    expect(invalid.profile).toEqual(first.profile);
  });
  it('只记最近若干个已结算 ID；旧 ID 被挤出后不影响新冒险', () => {
    let p = emptyProfile();
    for (let i = 0; i < R.history + 5; i++) p = settleRun(p, death({ runId: `r${i}` })).profile;
    expect(p.settled).toHaveLength(R.history);
    expect(p.settled.at(-1)).toBe(`r${R.history + 4}`);
    expect(p.runs).toBe(R.history + 5);
  });
  it('输入档案不被修改：写盘失败时调用方保留旧对象即可回滚', () => {
    const before = emptyProfile();
    const snapshot = JSON.stringify(before);
    settleRun(before, death());
    unlockTalent(before, 'thick_scales');
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('解锁与重置', () => {
  const rich = (): MetaProfile => ({ ...emptyProfile(), earned: 20 });
  it('逐级扣点，不透支；被拒绝时返回原因且档案不变', () => {
    let p = rich();
    let r = unlockTalent(p, 'thick_scales');
    expect(r.block).toBeNull();
    p = r.profile;
    expect(availablePoints(p)).toBe(16);
    r = unlockTalent(p, 'thick_scales');
    p = r.profile;
    expect([p.talents.thick_scales, availablePoints(p)]).toEqual([2, 4]);
    expect(unlockTalent(p, 'thick_scales').block).toBe('maxed');
    expect(unlockTalent(p, 'coral_plates').block).toBe('points');
    expect(unlockTalent(p, 'abyss_heart').block).toBe('locked');
    expect(unlockTalent(p, 'nope').block).toBe('unknown');
    expect(unlockTalent(p, 'coral_plates').profile).toEqual(p);
  });
  it('重置全额退回，累计获得不变', () => {
    let p = rich();
    p = unlockTalent(p, 'keen_fins').profile;
    p = unlockTalent(p, 'keen_fins').profile;
    expect(availablePoints(p)).toBe(6);
    const reset = resetTalents(p);
    expect(reset.talents).toEqual({});
    expect([reset.earned, availablePoints(reset)]).toEqual([20, 20]);
  });
});

describe('档案读取与迁移', () => {
  const v2 = (over: Record<string, unknown> = {}) => ({
    version: 2,
    runs: 5,
    wins: 1,
    bestFloor: 4,
    kills: 300,
    earned: 60,
    talents: { thick_scales: 2, coral_plates: 1 },
    settled: ['a', 'b'],
    ...over,
  });
  it('没有档案：新建；只有 v1：按战绩补发有上限的点数', () => {
    expect(parseProfile({ found: false }, null)).toEqual({ profile: emptyProfile(), issue: 'new' });
    const migrated = parseProfile({ found: false }, { runs: 4, wins: 1, bestFloor: 3, kills: 120 });
    expect(migrated.issue).toBe('migrated');
    expect(migrated.profile).toMatchObject({
      version: 2,
      runs: 4,
      wins: 1,
      bestFloor: 3,
      kills: 120,
      earned: 14,
    });
    const veteran = parseProfile({ found: false }, { runs: 500, wins: 200, bestFloor: 4, kills: 1 });
    expect(veteran.profile.earned).toBe(R.legacy.cap);
    // v1 的非法字段按 0 处理，胜场不超过局数。
    expect(parseProfile({ found: false }, { runs: -1, wins: 3, bestFloor: 99 }).profile).toMatchObject({
      runs: 0,
      wins: 0,
      bestFloor: 0,
      earned: 0,
    });
  });
  it('已有 v2 时忽略 v1，不重复补发', () => {
    const r = parseProfile({ found: true, value: v2() }, { runs: 500, wins: 200 });
    expect(r.issue).toBe('none');
    expect(r.profile).toEqual({ ...v2(), version: 2 });
  });
  it('v2 个别字段损坏：逐项修复保留其余进度', () => {
    const r = parseProfile(
      {
        found: true,
        value: v2({ kills: -5, settled: ['ok', 'Bad Id', 'ok', 3], talents: { junk: 1, thick_scales: 2 } }),
      },
      null,
    );
    expect(r.issue).toBe('repaired');
    expect(r.profile).toMatchObject({
      runs: 5,
      kills: 0,
      earned: 60,
      settled: ['ok'],
      talents: { thick_scales: 2 },
    });
  });
  it('价格上调导致透支：退回到不透支，可用点数非负', () => {
    const r = parseProfile(
      { found: true, value: v2({ earned: 10, talents: { thick_scales: 2, coral_plates: 1 } }) },
      null,
    );
    expect(r.issue).toBe('repaired');
    expect(spentPoints(r.profile.talents)).toBeLessThanOrEqual(10);
    expect(availablePoints(r.profile)).toBeGreaterThanOrEqual(0);
  });
  it('v2 整体损坏或未来版本：报告 corrupt，按 v1 重建或新建', () => {
    for (const value of [null, 'x', [], { version: 3 }, { ...v2(), version: '2' }]) {
      expect(parseProfile({ found: true, value }, null)).toEqual({
        profile: emptyProfile(),
        issue: 'corrupt',
      });
      expect(parseProfile({ found: true, value }, { runs: 2 }).profile.earned).toBe(2 * R.legacy.perRun);
    }
  });
  it('档案 JSON 往返一致', () => {
    let p = settleRun(emptyProfile(), death()).profile;
    p = unlockTalent(p, 'flowing_swim').profile;
    const r = parseProfile({ found: true, value: JSON.parse(JSON.stringify(p)) }, null);
    expect(r).toEqual({ profile: p, issue: 'none' });
  });
});
