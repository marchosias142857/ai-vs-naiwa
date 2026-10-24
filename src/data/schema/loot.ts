import { z } from 'zod';

export const LootRulesSchema = z.strictObject({
  capacity: z.int().positive(),
  upgradeChoices: z.int().min(1).max(8),
  pickupRadius: z.number().positive(),
  weaponRadius: z.number().positive(),
  rewardSpacing: z.number().positive(),
  drops: z
    .array(
      z.strictObject({
        kind: z.enum(['health', 'energy', 'coin']),
        weight: z.number().positive(),
        amount: z.number().positive(),
      }),
    )
    .min(1)
    .readonly(),
  roomCoins: z.int().positive(),
  roomEnergy: z.number().positive(),
  roomHealth: z.number().positive(),
});
export type LootRules = z.infer<typeof LootRulesSchema>;
export const EncountersSchema = z.strictObject({
  attempts: z.int().positive(),
  floors: z.array(z.array(z.string()).min(1).readonly()).min(1).readonly(),
});
export type EncounterRules = z.infer<typeof EncountersSchema>;
