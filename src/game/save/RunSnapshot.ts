import type { FloorCheckpoint } from '../../sim/run/checkpoint';
import type { SimSnapshot } from '../../sim/run/snapshot';
import type { DeathSnapshot } from '../fx/CombatFeedback';
import type { PhysicsSnapshot } from '../world/CombatBridge';
import { POOL_SIZES } from '../../config';
import { createSimDecoder } from '../../sim/run/parseSnapshot';

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
/** sim 与 game 按相同池容量验证外部存档。 */
export type SimDecoder = (value: unknown, seed: number) => SimSnapshot | null;
export const decodeSimSnapshot: SimDecoder = createSimDecoder(POOL_SIZES);
