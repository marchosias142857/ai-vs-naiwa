import { DUNGEON } from '../../data/dungeon';
import { TALENT_RULES as R } from '../../data/talents';
import {
  normalizeRanks,
  spentPoints,
  trimRanks,
  unlockBlock,
  type TalentRanks,
  type UnlockBlock,
} from './talents';

/** 局外档案 v2（ADR 0035）。可用点数不单独存，始终是 `earned − 已花费`，不会与花费对不上。 */
export interface MetaProfile {
  version: 2;
  runs: number;
  wins: number;
  bestFloor: number;
  kills: number;
  /** 累计获得的天赋点。 */
  earned: number;
  talents: TalentRanks;
  /** 最近结算过的冒险 ID，新的在后；同一 ID 不重复发奖。 */
  settled: string[];
}
/** 一局冒险的终局表现；全部取自 sim 的终局状态。 */
export interface RunSummary {
  runId: string;
  victory: boolean;
  floor: number;
  roomsCleared: number;
  kills: number;
}
export type RewardKind = 'rooms' | 'floors' | 'kills' | 'victory' | 'record' | 'first_win';
export interface RewardLine {
  kind: RewardKind;
  /** 房间数、层数、击杀数等原始计数；`kills` 行即使封顶也给原始击杀。 */
  count: number;
  points: number;
}
export interface RunReward {
  lines: RewardLine[];
  total: number;
}
/** 读取档案的结论，供界面提示：新建、v1 迁移、修复了部分字段、整体损坏后重建。 */
export type ProfileIssue = 'none' | 'new' | 'migrated' | 'repaired' | 'corrupt';
/** 与 services/storage 的 inspectValue 结果同形。 */
export type StoredValue = { found: false } | { found: true; value: unknown };

/** 冒险 ID 由 game 在新开冒险时生成；只允许短的 ASCII 串，避免把任意数据写进档案。 */
export const RUN_ID = /^[0-9a-z_:-]{1,48}$/;
/** 调试开局（`?floor=` 等）的冒险 ID 前缀；这类冒险不结算天赋点。 */
export const DEBUG_RUN_PREFIX = 'debug-';
/** 新冒险的 ID：种子加开局时刻，同一种子反复开局也不会撞号。`now` 由调用方传入，sim 不读时钟。 */
export function newRunId(seed: number, now: number): string {
  return `${(seed >>> 0).toString(36)}-${Math.max(0, Math.floor(now)).toString(36)}`;
}
/** 一层最多的房间数，用来给外部传入的房间计数封顶。 */
const ROOMS_PER_FLOOR = DUNGEON.mainRooms + DUNGEON.branchRooms;

const count = (v: unknown, max = Number.MAX_SAFE_INTEGER): number | null =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max ? v : null;

/** 修复后的等级表是否与原始数据等价（键顺序不同、0 级缺省不算差异）。 */
function sameRanks(ranks: Readonly<TalentRanks>, raw: unknown): boolean {
  if (raw === undefined) return Object.keys(ranks).length === 0;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  const keys = Object.keys(r).filter((k) => r[k] !== 0);
  return (
    keys.length === Object.keys(ranks).length && keys.every((k) => ranks[k as keyof TalentRanks] === r[k])
  );
}

export function emptyProfile(): MetaProfile {
  return { version: 2, runs: 0, wins: 0, bestFloor: 0, kills: 0, earned: 0, talents: {}, settled: [] };
}
export function availablePoints(p: Readonly<MetaProfile>): number {
  return Math.max(0, p.earned - spentPoints(p.talents));
}
export function isSettled(p: Readonly<MetaProfile>, runId: string): boolean {
  return p.settled.includes(runId);
}

/** v1 只有战绩；按历史局数和胜场补发一笔有上限的点数。 */
function migrate(v1: unknown): MetaProfile | null {
  if (!v1 || typeof v1 !== 'object') return null;
  const v = v1 as Record<string, unknown>,
    p = emptyProfile();
  p.runs = count(v.runs) ?? 0;
  p.wins = Math.min(p.runs, count(v.wins) ?? 0);
  p.bestFloor = count(v.bestFloor, DUNGEON.floors + 1) ?? 0;
  p.kills = count(v.kills) ?? 0;
  p.earned = Math.min(R.legacy.cap, p.runs * R.legacy.perRun + p.wins * R.legacy.perWin);
  return p;
}

/**
 * 读档案：优先 v2；没有 v2 时迁移 v1；v2 整体损坏时按 v1 重建（或全新），并报告 `corrupt`。
 * v2 中个别字段非法时逐项修复，不清空其余进度；已花费超过累计获得时按 trimRanks 退回。
 */
export function parseProfile(
  stored: StoredValue,
  legacy: unknown,
): { profile: MetaProfile; issue: ProfileIssue } {
  if (!stored.found) {
    const migrated = migrate(legacy);
    return migrated ? { profile: migrated, issue: 'migrated' } : { profile: emptyProfile(), issue: 'new' };
  }
  const v = stored.value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object' || Array.isArray(v) || v.version !== 2)
    return { profile: migrate(legacy) ?? emptyProfile(), issue: 'corrupt' };
  const p = emptyProfile();
  let repaired = false;
  const take = (key: 'runs' | 'wins' | 'bestFloor' | 'kills' | 'earned', max?: number) => {
    const n = count(v[key], max);
    if (n === null) repaired = true;
    p[key] = n ?? 0;
  };
  take('runs');
  take('wins', p.runs);
  take('bestFloor', DUNGEON.floors + 1);
  take('kills');
  take('earned');
  const ids = Array.isArray(v.settled) ? v.settled : [];
  for (const id of ids)
    if (typeof id === 'string' && RUN_ID.test(id) && !p.settled.includes(id)) p.settled.push(id);
  if (!Array.isArray(v.settled) || p.settled.length !== ids.length) repaired = true;
  p.settled = p.settled.slice(-R.history);
  p.talents = trimRanks(normalizeRanks(v.talents), p.earned);
  if (!sameRanks(p.talents, v.talents)) repaired = true;
  return { profile: p, issue: repaired ? 'repaired' : 'none' };
}

/** 终局表现是否可信：只接受 sim 可能产生的组合，防止外部或损坏数据刷点。 */
export function validSummary(s: Readonly<RunSummary>): boolean {
  const floor = count(s.floor, DUNGEON.floors + 1);
  return (
    RUN_ID.test(s.runId) &&
    !s.runId.startsWith(DEBUG_RUN_PREFIX) &&
    floor !== null &&
    floor >= 1 &&
    typeof s.victory === 'boolean' &&
    (!s.victory || floor === DUNGEON.floors + 1) &&
    count(s.roomsCleared, floor * ROOMS_PER_FLOOR) !== null &&
    count(s.kills) !== null
  );
}

/** 奖励构成；`before` 是结算前的档案，用于首次到达楼层与首次通关。 */
export function runReward(
  s: Readonly<RunSummary>,
  before: Readonly<Pick<MetaProfile, 'bestFloor' | 'wins'>>,
): RunReward {
  const lines: RewardLine[] = [
    { kind: 'rooms', count: s.roomsCleared, points: s.roomsCleared * R.room },
    { kind: 'floors', count: s.floor - 1, points: (s.floor - 1) * R.floor },
    { kind: 'kills', count: s.kills, points: Math.min(R.killCap, Math.floor(s.kills / R.killsPerPoint)) },
    { kind: 'victory', count: s.victory ? 1 : 0, points: s.victory ? R.victory : 0 },
    {
      kind: 'record',
      count: Math.max(0, s.floor - before.bestFloor),
      points: Math.max(0, s.floor - before.bestFloor) * R.record,
    },
    {
      kind: 'first_win',
      count: s.victory && before.wins === 0 ? 1 : 0,
      points: s.victory && before.wins === 0 ? R.firstWin : 0,
    },
  ];
  return { lines, total: lines.reduce((sum, l) => sum + l.points, 0) };
}

/**
 * 结算一局：同一 `runId` 只发一次奖。返回新档案对象，调用方写盘成功后才替换内存中的档案。
 * `duplicate` 与 `invalid` 时返回原档案、`reward` 为 null。
 */
export function settleRun(
  p: Readonly<MetaProfile>,
  s: Readonly<RunSummary>,
): { profile: MetaProfile; reward: RunReward | null; status: 'settled' | 'duplicate' | 'invalid' } {
  const same = { ...p, talents: { ...p.talents }, settled: [...p.settled] };
  if (!validSummary(s)) return { profile: same, reward: null, status: 'invalid' };
  if (isSettled(p, s.runId)) return { profile: same, reward: null, status: 'duplicate' };
  const reward = runReward(s, p);
  return {
    profile: {
      ...same,
      runs: p.runs + 1,
      wins: p.wins + (s.victory ? 1 : 0),
      bestFloor: Math.max(p.bestFloor, s.floor),
      kills: p.kills + s.kills,
      earned: p.earned + reward.total,
      settled: [...p.settled, s.runId].slice(-R.history),
    },
    reward,
    status: 'settled',
  };
}

/** 从终局的 DungeonRun 状态取表现；冒险未结束时返回 null。 */
export function summarizeRun(
  runId: string,
  run: Readonly<{ phase: string; floor: number; roomsCleared: number; kills: number }>,
): RunSummary | null {
  if (run.phase !== 'won' && run.phase !== 'lost') return null;
  return {
    runId,
    victory: run.phase === 'won',
    floor: run.floor,
    roomsCleared: run.roomsCleared,
    kills: run.kills,
  };
}

/** 解锁下一级；被拒绝时返回原档案与原因。 */
export function unlockTalent(
  p: Readonly<MetaProfile>,
  id: unknown,
): { profile: MetaProfile; block: UnlockBlock | null } {
  const same = { ...p, talents: { ...p.talents }, settled: [...p.settled] };
  const block = unlockBlock(p.talents, availablePoints(p), id);
  if (block) return { profile: same, block };
  const key = id as keyof TalentRanks;
  same.talents[key] = (p.talents[key] ?? 0) + 1;
  return { profile: same, block: null };
}
/** 全部退回，点数不损失（参考 Hades 的重置）；界面需二次确认。 */
export function resetTalents(p: Readonly<MetaProfile>): MetaProfile {
  return { ...p, talents: {}, settled: [...p.settled] };
}
