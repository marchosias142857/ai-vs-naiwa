import { z } from 'zod';

export const PlayerRulesSchema = z.strictObject({
  armor: z.number().min(0),
  energy: z.number().positive(),
  armorDelay: z.number().positive(),
  armorInterval: z.number().positive(),
  skillCooldown: z.number().positive(),
  dashTime: z.number().positive(),
  dashSpeed: z.number().positive(),
});
export type PlayerRules = z.infer<typeof PlayerRulesSchema>;
export const UpgradeDefSchema = z.strictObject({
  name: z.string(),
  stat: z.enum(['damage', 'armor', 'health', 'energy', 'speed', 'haste', 'regen', 'skill']),
  amount: z.number().positive(),
  display: z.enum(['number', 'percent']),
});
export type UpgradeDef = z.infer<typeof UpgradeDefSchema>;
