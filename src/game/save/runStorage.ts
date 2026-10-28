import { isSettled } from '../../sim/meta/profile';
import { readProfile } from './metaProfile';
import { CHECKPOINT_KEY } from '../../services/profile';
import { inspectValue, loadValue, removeValue, saveValue } from '../../services/storage';
import { parseCheckpoint, type FloorCheckpoint } from '../../sim/run/checkpoint';
import { offerCount } from '../../sim/meta/talents';
import { object, parseGameSnapshot } from './parseGameSnapshot';
import { decodeSimSnapshot, type RunSnapshot, type SessionSnapshot, type SimDecoder } from './RunSnapshot';
import { SAVE_VERSION } from './version';

export const RUN_KEY = 'avn.run.v2';
export const BUILD_KEY = 'avn.run.build';
let updatedAtBoot = false;
/** Only adventure keys are invalidated; profile and unknown future resource keys are untouched. */
export function prepareRunVersion(): boolean {
  const previous = loadValue(BUILD_KEY);
  const stored = inspectValue(RUN_KEY);
  const stamp = `${SAVE_VERSION.build}:${SAVE_VERSION.dataHash}`;
  const changed = previous !== null && previous !== stamp;
  const decoded = stored.found ? decodeRun(stored.value) : null;
  const incompatible = decoded?.kind === 'none' && decoded.notice === 'updated';
  const unversionedEntry = previous === null && !stored.found && inspectValue(CHECKPOINT_KEY).found;
  const unknownVersion = previous === null && stored.found && decoded?.kind === 'entry';
  updatedAtBoot = changed || incompatible || unversionedEntry || unknownVersion;
  if (updatedAtBoot) clearSavedRun();
  saveValue(BUILD_KEY, stamp);
  return updatedAtBoot;
}
export type ResumeChoice =
  | { kind: 'full'; snapshot: RunSnapshot }
  | { kind: 'entry'; checkpoint: FloorCheckpoint; notice?: 'invalid' }
  | { kind: 'none'; notice?: 'corrupt' | 'updated' };

/** entry 始终独立校验；完整恢复必须通过 sim 与 game 两层按字段校验。 */
export function decodeRun(value: unknown, decodeSim: SimDecoder = decodeSimSnapshot): ResumeChoice {
  if (!object(value)) return { kind: 'none', notice: 'corrupt' };
  const metadata = value.meta;
  if (
    object(metadata) &&
    typeof metadata.build === 'string' &&
    typeof metadata.dataHash === 'string' &&
    (value.version !== 2 ||
      metadata.build !== SAVE_VERSION.build ||
      metadata.dataHash !== SAVE_VERSION.dataHash)
  )
    return { kind: 'none', notice: 'updated' };
  // 旧构建或局部损坏的终局同样不能降级成入口并复活。
  if (
    object(value.sim) &&
    ((object(value.sim.run) && (value.sim.run.phase === 'won' || value.sim.run.phase === 'lost')) ||
      (object(value.sim.world) && value.sim.world.playerDied === true))
  )
    return { kind: 'none', notice: 'corrupt' };
  const entry = parseCheckpoint(value.entry);
  if (!entry) return { kind: 'none', notice: 'corrupt' };
  const m = value.meta;
  const invalid: ResumeChoice = { kind: 'entry', checkpoint: entry, notice: 'invalid' };
  if (
    !object(m) ||
    typeof m.build !== 'string' ||
    typeof m.dataHash !== 'string' ||
    typeof m.savedAt !== 'number' ||
    !Number.isFinite(m.savedAt) ||
    m.savedAt < 0 ||
    m.seed !== entry.seed
  )
    return invalid;
  if (value.version !== 2 || m.build !== SAVE_VERSION.build || m.dataHash !== SAVE_VERSION.dataHash)
    return { kind: 'none', notice: 'updated' };
  try {
    const sim = decodeSim(value.sim, entry.seed);
    if (!sim) return invalid;
    // 即便遗留或外部文件带着入口副本，终局也不能继续。
    if (sim.run.phase === 'won' || sim.run.phase === 'lost' || sim.world.playerDied)
      return { kind: 'none', notice: 'corrupt' };
    const game = parseGameSnapshot(value.game, sim);
    if (
      !game ||
      sim.run.floor !== entry.floor ||
      sim.rewards.upgrades.join('|') !== entry.upgrades.join('|') ||
      // 候选数由开局天赋决定（ADR 0035）；sim 层只校验上下限。
      (sim.rewards.offers.length > 0 && sim.rewards.offers.length !== offerCount(entry.talents))
    )
      return invalid;
    return {
      kind: 'full',
      snapshot: {
        version: 2,
        meta: { seed: entry.seed, build: m.build, dataHash: m.dataHash, savedAt: m.savedAt },
        entry,
        sim,
        game,
      },
    };
  } catch {
    return invalid;
  }
}
export function readSavedRun(decodeSim: SimDecoder = decodeSimSnapshot): ResumeChoice {
  if (updatedAtBoot) return { kind: 'none', notice: 'updated' };
  const stored = inspectValue(RUN_KEY);
  const checkpoint = stored.found ? null : parseCheckpoint(loadValue(CHECKPOINT_KEY));
  const result: ResumeChoice = stored.found
    ? decodeRun(stored.value, decodeSim)
    : checkpoint
      ? { kind: 'entry', checkpoint }
      : { kind: 'none' };
  if (result.kind === 'none' && result.notice === 'updated') clearSavedRun();
  const entry =
    result.kind === 'full' ? result.snapshot.entry : result.kind === 'entry' ? result.checkpoint : null;
  if (entry && isSettled(readProfile().profile, entry.runId)) {
    clearSavedRun();
    return { kind: 'none' };
  }
  return result;
}
/** 同步收齐后只 setItem 一次；失败保留旧档，成功后才移除 v1。 */
export function writeSavedRun(state: SessionSnapshot): boolean {
  if (state.sim.run.phase === 'won' || state.sim.run.phase === 'lost' || state.sim.world.playerDied) {
    clearSavedRun();
    return true;
  }
  const snapshot: RunSnapshot = {
    ...state,
    version: 2,
    meta: { seed: state.entry.seed, ...SAVE_VERSION, savedAt: Date.now() },
  };
  if (!saveValue(RUN_KEY, snapshot)) return false;
  updatedAtBoot = false;
  removeValue(CHECKPOINT_KEY);
  return true;
}
export function clearSavedRun(): void {
  removeValue(RUN_KEY);
  removeValue(CHECKPOINT_KEY);
}
