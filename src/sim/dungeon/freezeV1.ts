import { LEGACY_V1 } from '../../data/roomTemplates/legacyV1';
import type { RoomLayouts } from '../../data/schema/layouts';
import type { RoomTheme, TrapPlacement } from '../../data/schema/traps';
import { Random } from '../core/Random';
import type { DungeonRoom } from './generate';

/** Prepared layout manifest for a validated old floor; not yet a v3 save field. */
export interface LegacyFloorLayouts {
  readonly catalogId: 'legacy_v1';
  readonly floor: number;
  readonly templateIds: readonly string[];
}

/** Reproduce the old plan selection using only frozen data and a private RNG.
 * Call after old-format validation; no events, input mutation or live random streams.
 */
export function freezeV1(
  seed: number,
  floor: number,
  rooms: readonly Pick<DungeonRoom, 'id' | 'kind'>[],
): LegacyFloorLayouts {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('invalid legacy seed');
  if (!Number.isInteger(floor) || floor < 1 || floor > LEGACY_V1.themes.length)
    throw new RangeError('invalid legacy floor');
  const theme = LEGACY_V1.themes[floor - 1]!;
  const root = new Random(seed);
  const templateIds = rooms.map((room, index) => {
    if (room.id !== index) throw new RangeError('legacy rooms must be indexed by room id');
    switch (room.kind) {
      case 'combat':
        return theme.plans[root.fork(`layout:${floor}:${room.id}`).int(0, theme.plans.length - 1)]!.id;
      case 'boss':
        return theme.bossId;
      case 'start':
      case 'chest':
      case 'exit':
        return theme.emptyId;
      default:
        throw new RangeError('invalid legacy room kind');
    }
  });
  return { catalogId: LEGACY_V1.catalogId, floor, templateIds };
}

/** Resolved legacy geometry, with the same relative coordinates as the old RoomArena input. */
export interface LegacyTemplate {
  readonly id: string;
  readonly theme: RoomTheme['art'];
  readonly boxes: readonly Readonly<RoomLayouts[number][number]>[];
  readonly traps: readonly Readonly<TrapPlacement>[];
}

/** Exact ID lookup. Unknown IDs never silently select another template. */
export function legacyV1Template(id: string): LegacyTemplate | null {
  for (const theme of LEGACY_V1.themes) {
    if (id === theme.emptyId) return { id, theme: theme.art, boxes: LEGACY_V1.layouts[0], traps: [] };
    if (id === theme.bossId) return { id, theme: theme.art, boxes: LEGACY_V1.bossLayout, traps: [] };
    const plan = theme.plans.find((p) => p.id === id);
    if (plan) return { id, theme: theme.art, boxes: LEGACY_V1.layouts[plan.layout]!, traps: plan.traps };
  }
  return null;
}
