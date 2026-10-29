import data from './designedV3.json' with { type: 'json' };
import type { RoomBlueprint } from './types';
import type { RoomStyleId } from '../roomStyles';
import type { TrapPlacement } from '../schema/traps';
type PackedRoom = readonly [
  id: string,
  shell: string,
  boxes: readonly (readonly [number, number, number, number])[],
  traps: readonly TrapPlacement[],
  design: string,
];
const packed = data as unknown as {
  shells: Record<string, RoomBlueprint['outline']>;
  rooms: Record<RoomStyleId, readonly PackedRoom[]>;
};
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Build-time authored and validated; room entry never searches for a valid layout. */
export const DESIGNED_V3: readonly RoomBlueprint[] = freeze(
  (Object.entries(packed.rooms) as [RoomStyleId, readonly PackedRoom[]][]).flatMap(([theme, rooms]) =>
    rooms.map(([id, shell, boxes, traps, design]): RoomBlueprint => {
      const form = /_\d+$/.test(id) ? 'combat' : (id as RoomBlueprint['form']);
      return {
        id: `designed_v3/${theme}/${id}`,
        theme,
        form,
        family: shell.replace(/_\d+$/, ''),
        design,
        obstacle: form === 'boss' ? 'pillar' : 'wall',
        mask: 15,
        outline: packed.shells[shell]!,
        boxes: boxes.map(([x, y, width, height]) => ({ x, y, width, height })),
        traps,
      };
    }),
  ),
);
