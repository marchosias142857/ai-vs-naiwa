import { MODULAR_V2 } from '../../data/roomTemplates/modularV2';
import { LEGACY_V1 } from '../../data/roomTemplates/legacyV1';
import type { RoomLayouts } from '../../data/schema/layouts';
import type { RoomTheme, TrapPlacement } from '../../data/schema/traps';
import { Random } from '../core/Random';
import type { DungeonRoom } from './generate';

/** Derived floor selection for this build; not a serialized save field. */
export interface FloorRoomLayouts {
  readonly catalogId: 'modular_v2';
  readonly floor: number;
  readonly templateIds: readonly string[];
}

/** Select every room once per floor from the active immutable catalog.
 * Uses a private RNG: no events, input mutation or live random-stream consumption.
 */
export function selectRoomLayouts(
  seed: number,
  floor: number,
  rooms: readonly Pick<DungeonRoom, 'id' | 'kind'>[],
): FloorRoomLayouts {
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
        return theme.boss.id;
      case 'start':
      case 'chest':
      case 'exit':
        return theme.empty.id;
      default:
        throw new RangeError('invalid legacy room kind');
    }
  });
  return {
    catalogId: MODULAR_V2.catalogId,
    floor,
    templateIds: templateIds.map((id) => id.replace('legacy_v1/', 'modular_v2/')),
  };
}

/** Resolved legacy geometry, with the same relative coordinates as the old RoomArena input. */
export interface RoomTemplate {
  readonly id: string;
  readonly theme: RoomTheme['art'];
  readonly form: 'empty' | 'combat' | 'boss';
  readonly obstacle: 'wall' | 'pillar';
  readonly mask: number;
  readonly boxes: readonly Readonly<RoomLayouts[number][number]>[];
  readonly traps: readonly Readonly<TrapPlacement>[];
}

/** Exact ID lookup. Unknown IDs never silently select another template. */
export function roomTemplate(id: string): RoomTemplate | null {
  if (id.startsWith('modular_v2/')) {
    const source = roomTemplate(id.replace('modular_v2/', 'legacy_v1/'));
    return source
      ? {
          ...source,
          id,
          traps: source.traps.map((trap, i) => {
            if (trap.kind === 'spikes') {
              const tile = MODULAR_V2.spikeTile;
              return {
                ...trap,
                y: id === 'modular_v2/abyss/combat_2' && i === 1 ? MODULAR_V2.abyssNorthSpikeY : trap.y,
                width: Math.max(1, Math.round(trap.width! / tile)) * tile,
                height: Math.max(1, Math.round(trap.height! / tile)) * tile,
              };
            }
            if (id === 'modular_v2/wreck/combat_2' && i < 2)
              return { ...trap, x: Math.sign(trap.x) * MODULAR_V2.cargoBarrelX };
            if (id === 'modular_v2/wreck/combat_1' && i === 3)
              return { ...trap, x: MODULAR_V2.cargoEdgeBarrelX };
            return trap;
          }),
          boxes:
            id === 'modular_v2/wreck/combat_1'
              ? source.boxes.map((box) => ({ ...box, width: MODULAR_V2.cargoDividerWidth }))
              : id === 'modular_v2/abyss/combat_3'
                ? source.boxes.map((box) => ({ ...box, width: MODULAR_V2.abyssDividerWidth }))
                : source.boxes,
        }
      : null;
  }
  for (const theme of LEGACY_V1.themes) {
    if (id === theme.empty.id)
      return { ...theme.empty, theme: theme.art, boxes: LEGACY_V1.layouts[0], traps: [] };
    if (id === theme.boss.id)
      return { ...theme.boss, theme: theme.art, boxes: LEGACY_V1.bossLayout, traps: [] };
    const plan = theme.plans.find((p) => p.id === id);
    if (plan) {
      const { form, obstacle, mask, layout, traps } = plan;
      return { id, theme: theme.art, form, obstacle, mask, boxes: LEGACY_V1.layouts[layout]!, traps };
    }
  }
  return null;
}

/** Validate an exact template against its generated room before any game-side mutation. */
export function resolveRoomTemplate(
  id: string,
  floor: number,
  kind: DungeonRoom['kind'],
): RoomTemplate | null {
  if (!Number.isInteger(floor) || floor < 1 || floor > LEGACY_V1.themes.length) return null;
  const template = roomTemplate(id);
  const form =
    kind === 'boss' || kind === 'combat'
      ? kind
      : kind === 'start' || kind === 'chest' || kind === 'exit'
        ? 'empty'
        : null;
  if (!template || template.theme !== LEGACY_V1.themes[floor - 1]!.art || template.form !== form) return null;
  return template;
}
