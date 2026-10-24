import type { FloorCheckpoint } from '../../sim/run/checkpoint';
import type { SimSnapshot } from '../../sim/run/snapshot';
import type { DeathSnapshot } from '../fx/CombatFeedback';
import type { PhysicsSnapshot } from '../world/CombatBridge';

export interface GameSnapshot {
  physics: PhysicsSnapshot;
  deaths: DeathSnapshot[];
  endTime: number;
}
export interface SessionSnapshot {
  entry: FloorCheckpoint;
  sim: SimSnapshot;
  game: GameSnapshot;
}
export interface RunSnapshot extends SessionSnapshot {
  version: 2;
  meta: { seed: number; build: string; dataHash: string; savedAt: number };
}
/** Claude 的 sim 按字段校验器接入这里；未接入时拒绝完整恢复，走独立入口兜底。 */
export type SimDecoder = (value: unknown) => SimSnapshot | null;
export const pendingSimDecoder: SimDecoder = () => null;
