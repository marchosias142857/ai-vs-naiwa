import { loadValue, saveValue } from './storage';
export const CHECKPOINT_KEY = 'avn.floor.v1';
const PROFILE_KEY = 'avn.profile.v1';
export interface Profile {
  runs: number;
  wins: number;
  bestFloor: number;
  kills: number;
}
export function readProfile(): Profile {
  const raw = loadValue(PROFILE_KEY) as Partial<Profile> | null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0);
  return { runs: n(raw?.runs), wins: n(raw?.wins), bestFloor: n(raw?.bestFloor), kills: n(raw?.kills) };
}
export function recordResult(victory: boolean, floor: number, kills: number): void {
  const p = readProfile();
  p.runs++;
  if (victory) p.wins++;
  p.bestFloor = Math.max(p.bestFloor, floor);
  p.kills += kills;
  saveValue(PROFILE_KEY, p);
}
