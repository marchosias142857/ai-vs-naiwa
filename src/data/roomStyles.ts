import type { RoomTheme } from './schema/traps';

/** Style registration is independent of expedition length and floor numbering. */
export const ROOM_STYLES = {
  temple: { art: 'temple', field: 'spikes' },
  wreck: { art: 'wreck', field: 'current' },
  abyss: { art: 'abyss', field: 'weed' },
  milk: { art: 'milk', field: 'spikes' },
} as const satisfies Record<string, { art: RoomTheme['art']; field: string }>;
export type RoomStyleId = keyof typeof ROOM_STYLES;
export const ROOM_STYLE_IDS = Object.keys(ROOM_STYLES) as RoomStyleId[];

/** Allocation policy only. Switching to random does not change the room generator. */
export const FLOOR_STYLE_POLICY: {
  readonly mode: 'sequence' | 'random';
  readonly styles: readonly RoomStyleId[];
} = { mode: 'sequence', styles: ['temple', 'wreck', 'abyss', 'milk'] };
