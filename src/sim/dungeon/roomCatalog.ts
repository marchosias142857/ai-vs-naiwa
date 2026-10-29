import { DESIGNED_V3 } from '../../data/roomTemplates/designedV3';
import type { RoomBlueprint } from '../../data/roomTemplates/types';
import { ROOM_STYLES, type RoomStyleId } from '../../data/roomStyles';
import { Random } from '../core/Random';
import type { DungeonRoom } from './generate';
export type RoomTemplate = RoomBlueprint;
export interface FloorRoomLayouts {
  readonly catalogId: 'designed_v3';
  readonly floor: number;
  readonly theme: RoomStyleId;
  readonly templateIds: readonly string[];
}
const byId = new Map(DESIGNED_V3.map((room) => [room.id, room]));
/** A private shuffled bag selects without replacement, independently of gameplay streams. */
export function selectRoomLayouts(
  seed: number,
  floor: number,
  rooms: readonly Pick<DungeonRoom, 'id' | 'kind'>[],
  theme: RoomStyleId,
): FloorRoomLayouts {
  if (
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff ||
    !Number.isInteger(floor) ||
    floor < 1 ||
    !ROOM_STYLES[theme]
  )
    throw new RangeError('invalid room selection');
  const bag = new Random(seed)
    .fork(`layouts:${theme}:${floor}`)
    .shuffle(DESIGNED_V3.filter((room) => room.theme === theme && room.form === 'combat'));
  let selected = 0;
  const special = new Set<string>();
  const templateIds = rooms.map((room, index) => {
    if (room.id !== index) throw new RangeError('rooms must be indexed by room id');
    if (room.kind === 'combat') {
      const template = bag[selected++];
      if (!template) throw new RangeError('room candidate pool exhausted');
      return template.id;
    }
    const id = `designed_v3/${theme}/${room.kind}`;
    if (!byId.has(id) || special.has(room.kind)) throw new RangeError('invalid special room');
    special.add(room.kind);
    return id;
  });
  return { catalogId: 'designed_v3', floor, theme, templateIds };
}
/** Old room IDs are deliberately not aliases or generation fallbacks. */
export function roomTemplate(id: string): RoomTemplate | null {
  return byId.get(id) ?? null;
}
/** Validate explicit style and role before changing art, physics or trap state. */
export function resolveRoomTemplate(
  id: string,
  theme: RoomStyleId,
  kind: DungeonRoom['kind'],
): RoomTemplate | null {
  const room = roomTemplate(id);
  return room?.theme === theme && room.form === kind ? room : null;
}
