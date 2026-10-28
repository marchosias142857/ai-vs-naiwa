import { LEGACY_V1 } from './roomTemplates/legacyV1';
import type { RoomLayouts } from './schema/layouts';

/** Compatibility views for the graybox/stress adapter; legacy_v1 owns the data. */
export const ROOM_LAYOUTS = LEGACY_V1.layouts satisfies RoomLayouts;
export const BOSS_ROOM_LAYOUT = LEGACY_V1.bossLayout satisfies RoomLayouts[number];
