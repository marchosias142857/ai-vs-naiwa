import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PROFILE_KEY, PROFILE_BACKUP_KEY } from '../../../src/services/profile';
import { emptyProfile } from '../../../src/sim/meta/profile';
import {
  changeTalent,
  readProfile,
  retryPendingRewards,
  settleProfile,
  takeProfileNotice,
} from '../../../src/game/save/metaProfile';
import { RunPersistence } from '../../../src/game/systems/RunPersistence';
import { EventBus } from '../../../src/sim/core/EventBus';
import { readSavedRun, RUN_KEY } from '../../../src/game/save/runStorage';
import type { DemoSession } from '../../../src/game/systems/DemoSession';
import type { Scene } from 'phaser';

let values: Map<string, string>, writes: string[], fail: string | undefined;
const summary = { runId: 'reward-test', victory: false, floor: 2, roomsCleared: 4, kills: 25 };
beforeEach(() => {
  retryPendingRewards();
  takeProfileNotice();
  values = new Map([[PROFILE_KEY, JSON.stringify({ ...emptyProfile(), earned: 40 })]]);
  writes = [];
  fail = undefined;
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push(key);
      if (key === fail) throw new Error('quota');
      values.set(key, value);
    },
    removeItem: (key: string) => {
      writes.push(`remove:${key}`);
      values.delete(key);
    },
  });
});
afterEach(() => {
  retryPendingRewards();
  takeProfileNotice();
  vi.unstubAllGlobals();
});
it('v1 一次迁移，保留旧原文；有效 v2 不重写也不重复补发', () => {
  values.delete(PROFILE_KEY);
  const legacy = JSON.stringify({ runs: 3, wins: 1, bestFloor: 4, kills: 100 });
  values.set('avn.profile.v1', legacy);
  expect(readProfile().profile).toMatchObject({ earned: 12, runs: 3, wins: 1 });
  expect(readProfile().profile.earned).toBe(12);
  expect(writes).toEqual([PROFILE_KEY]);
  expect(values.get('avn.profile.v1')).toBe(legacy);
});
it.each(['{bad json', JSON.stringify({ ...emptyProfile(), earned: 40, kills: -1 })])(
  '修复前完整备份原文，备份失败不得覆盖：%s',
  (raw) => {
    values.set(PROFILE_KEY, raw);
    fail = PROFILE_BACKUP_KEY;
    expect(readProfile().saved).toBe(false);
    expect(values.get(PROFILE_KEY)).toBe(raw);
    fail = undefined;
    writes.length = 0;
    expect(readProfile().saved).toBe(true);
    expect(writes).toEqual([PROFILE_BACKUP_KEY, PROFILE_KEY]);
    expect(values.get(PROFILE_BACKUP_KEY)).toBe(raw);
  },
);
it('购买失败不扣点；连续购买逐级扣费；重置失败仍保留等级', () => {
  fail = PROFILE_KEY;
  expect(changeTalent('thick_scales')).toMatchObject({
    error: 'unavailable',
    profile: { earned: 40, talents: {} },
  });
  fail = undefined;
  expect(changeTalent('thick_scales').profile.talents.thick_scales).toBe(1);
  expect(changeTalent('thick_scales').profile.talents.thick_scales).toBe(2);
  expect(changeTalent('thick_scales').error).toBe('maxed');
  fail = PROFILE_KEY;
  expect(changeTalent('reset').profile.talents.thick_scales).toBe(2);
  fail = undefined;
  expect(changeTalent('reset').profile).toMatchObject({ earned: 40, talents: {} });
});
it('档案读取被禁用时拒绝写盘，不能用空档案覆盖', () => {
  const setItem = vi.fn();
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw Error('blocked');
    },
    setItem,
  });
  expect(changeTalent('reset').error).toBe('unavailable');
  expect(setItem).not.toHaveBeenCalled();
});
it('奖励失败只重试一次；成功后同 runId 不重复发奖', () => {
  fail = PROFILE_KEY;
  expect(settleProfile(summary).status).toBe('pending');
  expect(readProfile().profile.runs).toBe(0);
  fail = undefined;
  retryPendingRewards();
  const p = readProfile().profile;
  expect(p).toMatchObject({ runs: 1, earned: 53, settled: ['reward-test'] });
  expect(takeProfileNotice()).toBe('retried');
  retryPendingRewards();
  expect(settleProfile(summary).status).toBe('duplicate');
  expect(readProfile().profile).toEqual(p);
});
it('第二次失败放弃奖励；之后恢复写盘不再补发', () => {
  fail = PROFILE_KEY;
  settleProfile(summary);
  retryPendingRewards();
  expect(takeProfileNotice()).toBe('discarded');
  fail = undefined;
  retryPendingRewards();
  expect(readProfile().profile.runs).toBe(0);
});
it('终局先写档案再清冒险；重复保存不重复记账；遗留已结算入口不可复活', () => {
  const events = new EventBus(),
    scene = { game: { events }, events: { once: vi.fn() } } as unknown as Scene;
  const session = {
    runId: summary.runId,
    dungeon: { ...summary, phase: 'lost', finished: true },
  } as unknown as DemoSession;
  const persistence = new RunPersistence(scene, session);
  values.set(RUN_KEY, 'old');
  persistence.update();
  persistence.save();
  expect(writes[0]).toBe(PROFILE_KEY);
  expect(writes[1]).toBe(`remove:${RUN_KEY}`);
  expect(readProfile().profile.runs).toBe(1);
  values.set(
    'avn.floor.v1',
    JSON.stringify({
      version: 2,
      seed: 42,
      runId: summary.runId,
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
    }),
  );
  expect(readSavedRun()).toEqual({ kind: 'none' });
  expect(values.has('avn.floor.v1')).toBe(false);
});
it('调试局不发奖也不写战绩', () => {
  expect(settleProfile({ ...summary, runId: 'debug-test' }).status).toBe('invalid');
  expect(readProfile().profile.runs).toBe(0);
  expect(writes).toEqual([]);
});
