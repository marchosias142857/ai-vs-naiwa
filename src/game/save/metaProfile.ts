import { readProfileSource, writeProfile } from '../../services/profile';
import {
  parseProfile,
  settleRun,
  unlockTalent,
  resetTalents,
  type RunReward,
  type RunSummary,
} from '../../sim/meta/profile';
import type { TalentId } from '../../data/talents';

export type ProfileNotice = 'migrated' | 'repaired' | 'corrupt' | 'unavailable' | 'retried' | 'discarded';
let notice: ProfileNotice | undefined;
export function readProfile() {
  const source = readProfileSource();
  let value: unknown = null;
  try {
    value = source.raw === null ? null : JSON.parse(source.raw);
  } catch {
    /* parseProfile 报损坏。 */
  }
  const parsed = parseProfile(source.raw === null ? { found: false } : { found: true, value }, source.legacy);
  const backup = parsed.issue === 'repaired' || parsed.issue === 'corrupt';
  const saved =
    source.readable &&
    (parsed.issue === 'none' || parsed.issue === 'new' || writeProfile(parsed.profile, source, backup));
  if (!saved) notice = 'unavailable';
  else if (parsed.issue === 'migrated' || backup) notice = parsed.issue as ProfileNotice;
  return { ...parsed, source, backup, saved };
}
export function takeProfileNotice(): ProfileNotice | undefined {
  const result = notice;
  notice = undefined;
  return result;
}
/** 事务按最新档案计算；写盘失败不把扣点后的候选发布给界面。 */
export function changeTalent(id: TalentId | 'reset') {
  const before = readProfile();
  const changed =
    id === 'reset'
      ? { profile: resetTalents(before.profile), block: null }
      : unlockTalent(before.profile, id);
  if (changed.block) return { profile: before.profile, error: changed.block };
  if (!before.saved || !writeProfile(changed.profile, before.source))
    return { profile: before.profile, error: 'unavailable' as const };
  return { profile: changed.profile, error: null };
}
export interface Settlement {
  reward: RunReward | null;
  status: 'saved' | 'pending' | 'discarded' | 'duplicate' | 'invalid';
}
const pending = new Map<string, RunSummary>();
function attempt(summary: RunSummary): Settlement {
  const before = readProfile();
  const result = settleRun(before.profile, summary);
  if (result.status !== 'settled') return { reward: null, status: result.status };
  const saved = before.saved && writeProfile(result.profile, before.source);
  return { reward: result.reward, status: saved ? 'saved' : 'pending' };
}
export function settleProfile(summary: RunSummary): Settlement {
  const result = attempt(summary);
  if (result.status === 'pending') pending.set(summary.runId, summary);
  return result;
}
/** 回主城（或直接重开）只重试一次；hidden/pagehide 不触发重试。 */
export function retryPendingRewards(): void {
  for (const summary of pending.values()) {
    const result = attempt(summary);
    notice = result.status === 'saved' || result.status === 'duplicate' ? 'retried' : 'discarded';
  }
  pending.clear();
}
