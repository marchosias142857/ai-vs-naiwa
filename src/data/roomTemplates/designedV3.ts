import data from './designedV3.json' with { type: 'json' };
import type { RoomBlueprint } from './types';
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Build-time authored and validated; room entry never searches for a valid layout. */
export const DESIGNED_V3 = freeze(data as unknown as readonly RoomBlueprint[]);
