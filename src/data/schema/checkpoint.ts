import { z } from 'zod';
import { DUNGEON } from '../dungeon';
import { UPGRADES } from '../player';
import { WEAPONS } from '../weapons';
const value = z.number().min(0).max(Number.MAX_SAFE_INTEGER);
export const FloorCheckpointSchema = z
  .object({
    version: z.literal(1),
    seed: z.number().int().min(0).max(0xffffffff),
    floor: z
      .number()
      .int()
      .min(1)
      .max(DUNGEON.floors + 1),
    upgrades: z.array(z.string().refine((id) => Object.hasOwn(UPGRADES, id))).max(DUNGEON.floors),
    secondary: z
      .string()
      .refine((id) => Object.hasOwn(WEAPONS, id))
      .nullable(),
    equipped: z.string(),
    hp: value.positive(),
    armor: value,
    energy: value,
    coins: value,
    kills: value,
    roomsCleared: value,
    elapsed: value,
  })
  .refine(
    (v) => v.upgrades.length === v.floor - 1 && (v.equipped === 'pistol_basic' || v.equipped === v.secondary),
  );
