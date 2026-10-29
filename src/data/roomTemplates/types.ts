import type { RoomStyleId } from '../roomStyles';
import type { TrapPlacement } from '../schema/traps';

export interface RoomBlueprint {
  readonly id: string;
  readonly theme: RoomStyleId;
  readonly form: 'start' | 'chest' | 'exit' | 'combat' | 'boss' | 'hub';
  readonly family: string;
  /** Authored encounter skeleton and spatial plan, retained for catalog review. */
  readonly design?: string;
  readonly obstacle: 'wall' | 'pillar';
  readonly mask: number;
  /** Local coordinates relative to ROOM_METRICS.center, on the eight-unit module grid. */
  readonly outline: readonly (readonly [number, number])[];
  readonly boxes: readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
  readonly traps: readonly Readonly<TrapPlacement>[];
}
