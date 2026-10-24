import { CHECKPOINT_KEY } from '../../services/profile';
import { inspectValue, loadValue, removeValue, saveValue } from '../../services/storage';
import { parseCheckpoint, type FloorCheckpoint } from '../../sim/run/checkpoint';
import { object, parseGameSnapshot } from './parseGameSnapshot';
import { pendingSimDecoder, type RunSnapshot, type SessionSnapshot, type SimDecoder } from './RunSnapshot';
import { SAVE_VERSION } from './version';

export const RUN_KEY = 'avn.run.v2';
export type ResumeChoice =
  | { kind: 'full'; snapshot: RunSnapshot }
  | { kind: 'entry'; checkpoint: FloorCheckpoint; notice?: 'updated' | 'invalid' }
  | { kind: 'none'; notice?: 'corrupt' };

/** entry 始终独立校验；缺少 sim 校验器时绝不把外部 JSON 强转交给 load。 */
export function decodeRun(value: unknown, decodeSim: SimDecoder = pendingSimDecoder): ResumeChoice {
  if (!object(value)) return { kind: 'none', notice: 'corrupt' };
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
    return { kind: 'entry', checkpoint: entry, notice: 'updated' };
  try {
    const sim = decodeSim(value.sim);
    if (!sim) return invalid;
    // 即便遗留或外部文件带着入口副本，终局也不能继续。
    if (sim.run.phase === 'won' || sim.run.phase === 'lost' || sim.world.playerDied)
      return { kind: 'none', notice: 'corrupt' };
    const game = parseGameSnapshot(value.game, sim);
    if (!game || sim.run.floor !== entry.floor || sim.rewards.upgrades.join('|') !== entry.upgrades.join('|'))
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
export function readSavedRun(decodeSim: SimDecoder = pendingSimDecoder): ResumeChoice {
  const stored = inspectValue(RUN_KEY);
  if (stored.found) return decodeRun(stored.value, decodeSim);
  const checkpoint = parseCheckpoint(loadValue(CHECKPOINT_KEY));
  return checkpoint ? { kind: 'entry', checkpoint } : { kind: 'none' };
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
  removeValue(CHECKPOINT_KEY);
  return true;
}
export function clearSavedRun(): void {
  removeValue(RUN_KEY);
  removeValue(CHECKPOINT_KEY);
}
