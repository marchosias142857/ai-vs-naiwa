import { z } from 'zod';
import { DUNGEON } from '../dungeon';
import { UPGRADES } from '../player';
import { WEAPONS } from '../weapons';
const value = z.number().min(0).max(Number.MAX_SAFE_INTEGER);
const fields = {
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
};
/** v1 为天赋上线前的旧档；v2 增加冒险 ID 与开局天赋（ADR 0035）。未知天赋 ID 在读取时丢弃。 */
export const FloorCheckpointSchema = z
  .union([
    z.object({ version: z.literal(1), ...fields }),
    z.object({
      version: z.literal(2),
      runId: z.string().regex(/^[0-9a-z_:-]{1,48}$/),
      talents: z.record(z.string(), z.number().int().min(0)),
      ...fields,
    }),
  ])
  .refine(
    (v) => v.upgrades.length === v.floor - 1 && (v.equipped === 'pistol_basic' || v.equipped === v.secondary),
  );
